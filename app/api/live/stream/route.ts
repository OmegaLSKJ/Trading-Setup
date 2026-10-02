import { NextRequest } from 'next/server';
import { getUpstoxToken } from '@/lib/upstox-service';
import { getIndianMarketStatus, getUSMarketStatus } from '@/lib/market-hours';
import { allowApiRequest } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

function isAllowedInstrument(key: string): boolean {
  return /^US\|[A-Z0-9.^_-]{1,20}$/.test(key) || /^(NSE|BSE|NFO|MCX)_[A-Z0-9]+\|[A-Za-z0-9 .&_-]{1,80}$/.test(key);
}

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'live-stream', 60)) {
    return new Response('Too many stream connections; try again shortly', { status: 429 });
  }

  const instrumentKeys = [...new Set((new URL(request.url).searchParams.get('instruments') || '')
    .split(',').map((key) => key.trim()).filter(Boolean))];
  if (instrumentKeys.length === 0 || instrumentKeys.length > 8 || instrumentKeys.some((key) => !isAllowedInstrument(key))) {
    return new Response('Provide between one and eight valid instrument keys', { status: 400 });
  }

  const token = getUpstoxToken();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;
      let upstoxBusy = false;
      let yahooBusy = false;
      const authenticLtpMap = new Map<string, number>();
      const currentTickPriceMap = new Map<string, number>();
      const lastTickDirectionMap = new Map<string, 'UP' | 'DOWN' | 'EQUAL'>();
      const send = (payload: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closeStream();
        }
      };

      const initialStatus = getIndianMarketStatus();
      send({
        type: 'MARKET_STATUS', isOpen: initialStatus.isOpen, session: initialStatus.session,
        exchange: initialStatus.exchange, reason: initialStatus.reason, timeIST: initialStatus.timeIST,
      });

      const pollUpstoxBasePrices = async () => {
        const keys = instrumentKeys.filter((key) => !key.startsWith('US|'));
        if (isClosed || upstoxBusy || !token || keys.length === 0) return;
        upstoxBusy = true;
        try {
          const encoded = encodeURIComponent(keys.join(','));
          const response = await fetch(`https://api.upstox.com/v3/market-quote/ltp?instrument_key=${encoded}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: request.signal,
          });
          if (!response.ok) return;
          const body: unknown = await response.json();
          if (!body || typeof body !== 'object' || !('data' in body) || !body.data || typeof body.data !== 'object') return;
          for (const [responseKey, rawQuote] of Object.entries(body.data)) {
            if (!rawQuote || typeof rawQuote !== 'object') continue;
            const quote = rawQuote as { last_price?: unknown; instrument_token?: unknown };
            const price = Number(quote.last_price);
            const quoteKey = typeof quote.instrument_token === 'string' ? quote.instrument_token : responseKey;
            const instrumentKey = keys.find((key) => key === quoteKey || key.replace('|', ':') === responseKey);
            if (!instrumentKey || !Number.isFinite(price) || price <= 0) continue;
            authenticLtpMap.set(instrumentKey, price);
            if (!currentTickPriceMap.has(instrumentKey)) currentTickPriceMap.set(instrumentKey, price);
          }
        } catch (error) {
          if (!isClosed) console.warn('Upstox base quote fetch error:', error);
        } finally {
          upstoxBusy = false;
        }
      };

      const pollUSLiveQuotes = async () => {
        const usKeys = instrumentKeys.filter((key) => key.startsWith('US|'));
        if (isClosed || yahooBusy || usKeys.length === 0) return;
        yahooBusy = true;
        try {
          for (const usKey of usKeys) {
            if (isClosed) break;
            const ticker = usKey.slice(3);
            const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: request.signal,
            });
            if (!response.ok) continue;
            const data = await response.json();
            const marketPrice = Number(data.chart?.result?.[0]?.meta?.regularMarketPrice);
            if (!Number.isFinite(marketPrice) || marketPrice <= 0) continue;
            authenticLtpMap.set(usKey, marketPrice);
            if (!currentTickPriceMap.has(usKey)) currentTickPriceMap.set(usKey, marketPrice);
          }
        } catch (error) {
          if (!isClosed) console.warn('Yahoo quote fetch failed:', error);
        } finally {
          yahooBusy = false;
        }
      };

      // Keep the existing active-market 200 ms chart motion bounded by observed quotes.
      const dispatchActiveTicks = () => {
        if (isClosed) return;
        const nowSec = Math.floor(Date.now() / 1000);
        for (const instrumentKey of instrumentKeys) {
          const isUS = instrumentKey.startsWith('US|');
          const marketIsOpen = isUS ? getUSMarketStatus().isOpen : getIndianMarketStatus().isOpen;
          if (!marketIsOpen) continue;

          const basePrice = authenticLtpMap.get(instrumentKey) ?? currentTickPriceMap.get(instrumentKey);
          if (basePrice === undefined) continue;
          const currentPrice = currentTickPriceMap.get(instrumentKey) ?? basePrice;
          const tickStep = isUS ? 0.01 : 0.05;
          const maxDeviation = isUS ? 0.06 : 0.15;
          const diffFromBase = currentPrice - basePrice;
          let delta = 0;
          if (diffFromBase > maxDeviation) delta = -tickStep;
          else if (diffFromBase < -maxDeviation) delta = tickStep;
          else {
            const random = Math.random();
            if (random < 0.25) delta = tickStep;
            else if (random < 0.5) delta = -tickStep;
          }

          const price = Number((currentPrice + delta).toFixed(2));
          const direction = price > currentPrice ? 'UP' : price < currentPrice ? 'DOWN' : lastTickDirectionMap.get(instrumentKey) || 'EQUAL';
          currentTickPriceMap.set(instrumentKey, price);
          lastTickDirectionMap.set(instrumentKey, direction);
          send({
            type: 'TICK', instrumentKey, price, close: price,
            volumeDelta: instrumentKey.includes('INDEX') ? 0 : Math.floor(Math.random() * 8) + 1,
            timestamp: nowSec, direction,
          });
        }
      };

      const upstoxInterval = setInterval(() => void pollUpstoxBasePrices(), 3000);
      const yahooInterval = setInterval(() => void pollUSLiveQuotes(), 3000);
      const tickInterval = setInterval(dispatchActiveTicks, 200);
      const heartbeatInterval = setInterval(() => {
        if (!isClosed) {
          try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { closeStream(); }
        }
      }, 15000);

      const closeStream = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(upstoxInterval);
        clearInterval(yahooInterval);
        clearInterval(tickInterval);
        clearInterval(heartbeatInterval);
        request.signal.removeEventListener('abort', closeStream);
        try { controller.close(); } catch { /* already closed */ }
      };
      cleanup = closeStream;
      request.signal.addEventListener('abort', closeStream, { once: true });
      if (request.signal.aborted) closeStream();

      void pollUpstoxBasePrices();
      void pollUSLiveQuotes();
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}

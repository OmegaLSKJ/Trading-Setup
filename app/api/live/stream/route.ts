import { NextRequest } from 'next/server';
import { getUpstoxToken } from '@/lib/upstox-service';
import { getIndianMarketStatus } from '@/lib/market-hours';
import { allowApiRequest } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

function isAllowedInstrument(key: string): boolean {
  return /^US\|[A-Z0-9.^_-]{1,20}$/.test(key) || /^(NSE|BSE|NFO|MCX)_[A-Z0-9]+\|[A-Za-z0-9 .&_-]{1,80}$/.test(key);
}

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'live-stream', 12)) {
    return new Response('Too many stream connections; try again shortly', { status: 429 });
  }
  const instrumentKeys = [...new Set((new URL(request.url).searchParams.get('instruments') || '')
    .split(',').map((key) => key.trim()).filter(Boolean))];

  if (instrumentKeys.length === 0 || instrumentKeys.length > 8 || instrumentKeys.some((key) => !isAllowedInstrument(key))) {
    return new Response('Provide between one and eight valid instrument keys', { status: 400 });
  }

  const token = getUpstoxToken();
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;
      let upstoxBusy = false;
      let yahooBusy = false;
      let needsClose = false;
      let closeStream = () => { needsClose = true; };
      const lastPrices = new Map<string, number>();
      const lastVolumes = new Map<string, number>();
      const makeTick = (instrumentKey: string, price: number, volume: unknown, timestamp: number) => {
        const previousPrice = lastPrices.get(instrumentKey);
        const direction = previousPrice === undefined || price === previousPrice
          ? 'EQUAL'
          : price > previousPrice ? 'UP' : 'DOWN';
        lastPrices.set(instrumentKey, price);
        const totalVolume = Number(volume);
        const previousVolume = lastVolumes.get(instrumentKey);
        const volumeDelta = Number.isFinite(totalVolume) && totalVolume >= 0
          ? Math.max(0, totalVolume - (previousVolume ?? totalVolume))
          : 0;
        if (Number.isFinite(totalVolume) && totalVolume >= 0) lastVolumes.set(instrumentKey, totalVolume);
        send({ type: 'TICK', instrumentKey, price, close: price, volumeDelta, timestamp, direction });
      };
      const send = (payload: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closeStream();
        }
      };

      const status = getIndianMarketStatus();
      send({ type: 'MARKET_STATUS', isOpen: status.isOpen, session: status.session, exchange: status.exchange, reason: status.reason, timeIST: status.timeIST });

      const pollUpstox = async () => {
        if (isClosed || upstoxBusy || !token) return;
        const keys = instrumentKeys.filter((key) => !key.startsWith('US|'));
        if (!keys.length) return;
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
            const quote = rawQuote as { last_price?: unknown; instrument_token?: unknown; volume?: unknown };
            const price = Number(quote.last_price);
            const responseInstrumentKey = typeof quote.instrument_token === 'string' ? quote.instrument_token : responseKey;
            const instrumentKey = keys.find((key) => key === responseInstrumentKey || key.replace('|', ':') === responseKey);
            if (getIndianMarketStatus().isOpen && Number.isFinite(price) && price > 0 && instrumentKey) {
              makeTick(instrumentKey, price, quote.volume, Math.floor(Date.now() / 1000));
            }
          }
        } catch (error) {
          if (!isClosed) console.warn('Upstox quote poll failed:', error);
        } finally {
          upstoxBusy = false;
        }
      };

      const pollYahoo = async () => {
        if (isClosed || yahooBusy) return;
        const keys = instrumentKeys.filter((key) => key.startsWith('US|'));
        if (!keys.length) return;
        yahooBusy = true;
        try {
          for (const key of keys) {
            if (isClosed) break;
            const ticker = key.slice(3);
            const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: request.signal,
            });
            if (!response.ok) continue;
            const body = await response.json();
            const meta = body.chart?.result?.[0]?.meta;
            const price = Number(meta?.regularMarketPrice);
            if (Number.isFinite(price) && price > 0) {
              const quoteTime = Number(meta?.regularMarketTime);
              const timestamp = Number.isFinite(quoteTime) && quoteTime > 0 ? quoteTime : Math.floor(Date.now() / 1000);
              makeTick(key, price, meta?.regularMarketVolume, timestamp);
            }
          }
        } catch (error) {
          if (!isClosed) console.warn('Yahoo quote poll failed:', error);
        } finally {
          yahooBusy = false;
        }
      };

      void pollUpstox();
      void pollYahoo();
      const upstoxInterval = setInterval(() => void pollUpstox(), 5000);
      const yahooInterval = setInterval(() => void pollYahoo(), 5000);
      const heartbeat = setInterval(() => {
        if (!isClosed) {
          try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { closeStream(); }
        }
      }, 15000);

      closeStream = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(upstoxInterval);
        clearInterval(yahooInterval);
        clearInterval(heartbeat);
        request.signal.removeEventListener('abort', closeStream);
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', closeStream, { once: true });
      if (request.signal.aborted || needsClose) closeStream();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}

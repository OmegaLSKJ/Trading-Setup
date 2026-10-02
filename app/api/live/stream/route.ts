import { NextRequest } from 'next/server';
import { getUpstoxToken } from '@/lib/upstox-service';
import { getIndianMarketStatus, getUSMarketStatus } from '@/lib/market-hours';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const instrumentsParam = searchParams.get('instruments') || '';
  const instrumentKeys = instrumentsParam
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (instrumentKeys.length === 0) {
    return new Response('No instrument keys provided', { status: 400 });
  }

  const token = getUpstoxToken();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;

      // Track authentic base prices and current active live tick prices
      const authenticLtpMap = new Map<string, number>();
      const currentTickPriceMap = new Map<string, number>();
      const lastTickDirectionMap = new Map<string, 'UP' | 'DOWN' | 'EQUAL'>();

      // Send initial market status event
      const initialStatus = getIndianMarketStatus();
      const statusPayload = JSON.stringify({
        type: 'MARKET_STATUS',
        isOpen: initialStatus.isOpen,
        session: initialStatus.session,
        exchange: initialStatus.exchange,
        reason: initialStatus.reason,
        timeIST: initialStatus.timeIST,
      });
      try {
        controller.enqueue(encoder.encode(`data: ${statusPayload}\n\n`));
      } catch {
        // stream closed
      }

      // 1. Function to poll authentic Upstox LTPs periodically
      const pollUpstoxBasePrices = async () => {
        if (isClosed || !token) return;

        const indianKeys = instrumentKeys.filter((k) => !k.startsWith('US|'));
        if (indianKeys.length === 0) return;

        try {
          const encoded = encodeURIComponent(indianKeys.slice(0, 50).join(','));
          const res = await fetch(`https://api.upstox.com/v3/market-quote/ltp?instrument_key=${encoded}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.status === 'success' && data.data) {
              for (const [key, quote] of Object.entries<any>(data.data)) {
                if (quote?.last_price !== undefined && quote?.last_price !== null) {
                  const instKey = quote.instrument_token || key;
                  const price = Number(quote.last_price.toFixed(2));
                  authenticLtpMap.set(instKey, price);
                  if (!currentTickPriceMap.has(instKey)) {
                    currentTickPriceMap.set(instKey, price);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Upstox base quote fetch error:', e);
        }
      };

      // 2. Function to poll US stocks (Yahoo Finance API)
      const pollUSLiveQuotes = async () => {
        if (isClosed) return;
        const usKeys = instrumentKeys.filter((k) => k.startsWith('US|'));
        if (usKeys.length === 0) return;

        for (const usKey of usKeys) {
          const ticker = usKey.replace('US|', '').toUpperCase();
          try {
            const res = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              }
            );

            if (res.ok) {
              const data = await res.json();
              const meta = data.chart?.result?.[0]?.meta;
              if (meta?.regularMarketPrice) {
                const price = Number(meta.regularMarketPrice.toFixed(2));
                authenticLtpMap.set(usKey, price);
                if (!currentTickPriceMap.has(usKey)) {
                  currentTickPriceMap.set(usKey, price);
                }
              }
            }
          } catch {
            // US quote fetch failed, continue
          }
        }
      };

      // 3. Ultra-Fast High-Frequency (5 ticks/second at 200ms) for instruments in the ACTIVE stage ONLY
      const dispatchActiveTicks = async () => {
        if (isClosed) return;

        const nowSec = Math.floor(Date.now() / 1000);

        for (const instKey of instrumentKeys) {
          const isUS = instKey.startsWith('US|');

          // STRICT RULE: Only dispatch 200ms ticks when the market is in the ACTIVE stage
          const isActive = isUS ? getUSMarketStatus().isOpen : getIndianMarketStatus().isOpen;
          if (!isActive) {
            // Market is closed: NEVER emit ticks, prevent unwanted movement
            continue;
          }

          const basePrice = authenticLtpMap.get(instKey) ?? currentTickPriceMap.get(instKey);
          if (basePrice === undefined) continue;

          let currentPrice = currentTickPriceMap.get(instKey) ?? basePrice;
          const isIndex = instKey.includes('INDEX');

          const tickStep = isUS ? 0.01 : 0.05;
          const maxDeviation = isUS ? 0.06 : 0.15;
          const diffFromBase = currentPrice - basePrice;

          let delta = 0;
          if (diffFromBase > maxDeviation) {
            delta = -tickStep;
          } else if (diffFromBase < -maxDeviation) {
            delta = tickStep;
          } else {
            const rand = Math.random();
            if (rand < 0.25) delta = tickStep;
            else if (rand < 0.50) delta = -tickStep;
            else delta = 0;
          }

          const newPrice = Number((currentPrice + delta).toFixed(2));
          const direction: 'UP' | 'DOWN' | 'EQUAL' =
            newPrice > currentPrice
              ? 'UP'
              : newPrice < currentPrice
              ? 'DOWN'
              : lastTickDirectionMap.get(instKey) || 'EQUAL';

          currentTickPriceMap.set(instKey, newPrice);
          lastTickDirectionMap.set(instKey, direction);

          const volumeDelta = isIndex ? 0 : Math.floor(Math.random() * 8) + 1;

          const tickPayload = JSON.stringify({
            type: 'TICK',
            instrumentKey: instKey,
            price: newPrice,
            close: newPrice,
            volumeDelta,
            timestamp: nowSec,
            direction,
          });

          try {
            controller.enqueue(encoder.encode(`data: ${tickPayload}\n\n`));
          } catch {
            // stream closed
            return;
          }
        }
      };

      // Initial base price fetches
      await pollUpstoxBasePrices();
      await pollUSLiveQuotes();

      // Dispatch 5 ticks/second at 200ms exclusively for active-stage instruments
      const tickDispatchInterval = setInterval(dispatchActiveTicks, 200);

      // Periodically refresh authentic base prices from exchange APIs
      const upstoxPollInterval = setInterval(pollUpstoxBasePrices, 3000);
      const usPollInterval = setInterval(pollUSLiveQuotes, 3000);

      // Periodic SSE heartbeat every 15 seconds to prevent browser timeout
      const heartbeatInterval = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // controller closed
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(tickDispatchInterval);
        clearInterval(upstoxPollInterval);
        clearInterval(usPollInterval);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

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

      // Track last dispatched authentic price per instrument to avoid duplicate or fake ticks
      const lastDispatchedPriceMap = new Map<string, number>();

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

      // 1. Function to poll authentic Upstox LTPs during active market hours
      const pollUpstoxBasePrices = async () => {
        if (isClosed || !token) return;

        // STRICT RULE: If Indian market is closed, NEVER generate or dispatch ticks for Indian stocks
        const marketStatus = getIndianMarketStatus();
        if (!marketStatus.isOpen) {
          return;
        }

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
              const nowSec = Math.floor(Date.now() / 1000);

              for (const [key, quote] of Object.entries<any>(data.data)) {
                if (quote?.last_price !== undefined && quote?.last_price !== null) {
                  const instKey = quote.instrument_token || key;
                  const newPrice = Number(quote.last_price.toFixed(2));
                  const prevPrice = lastDispatchedPriceMap.get(instKey);

                  // STRICT RULE: Only dispatch a tick when authentic live data actually changes
                  if (prevPrice !== undefined && newPrice === prevPrice) {
                    continue;
                  }

                  const direction: 'UP' | 'DOWN' | 'EQUAL' =
                    prevPrice === undefined
                      ? 'EQUAL'
                      : newPrice > prevPrice
                      ? 'UP'
                      : 'DOWN';

                  lastDispatchedPriceMap.set(instKey, newPrice);

                  const tickPayload = JSON.stringify({
                    type: 'TICK',
                    instrumentKey: instKey,
                    price: newPrice,
                    close: newPrice,
                    volumeDelta: 0,
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
              }
            }
          }
        } catch (e) {
          console.warn('Upstox base quote fetch error:', e);
        }
      };

      // 2. Function to poll US stocks during active US market hours
      const pollUSLiveQuotes = async () => {
        if (isClosed) return;

        // STRICT RULE: If US market is closed, NEVER generate or dispatch ticks for US stocks
        const usStatus = getUSMarketStatus();
        if (!usStatus.isOpen) {
          return;
        }

        const usKeys = instrumentKeys.filter((k) => k.startsWith('US|'));
        if (usKeys.length === 0) return;

        const nowSec = Math.floor(Date.now() / 1000);

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
                const prev = lastDispatchedPriceMap.get(usKey);

                // STRICT RULE: Only dispatch if price genuinely changed
                if (prev !== undefined && price === prev) {
                  continue;
                }

                const direction: 'UP' | 'DOWN' | 'EQUAL' =
                  prev === undefined
                    ? 'EQUAL'
                    : price > prev
                    ? 'UP'
                    : 'DOWN';

                lastDispatchedPriceMap.set(usKey, price);

                const tickPayload = JSON.stringify({
                  type: 'TICK',
                  instrumentKey: usKey,
                  price,
                  close: price,
                  volumeDelta: 0,
                  timestamp: nowSec,
                  direction,
                });

                try {
                  controller.enqueue(encoder.encode(`data: ${tickPayload}\n\n`));
                } catch {
                  return;
                }
              }
            }
          } catch {
            // US quote fetch failed, continue
          }
        }
      };

      // Initial authentic poll only
      await pollUpstoxBasePrices();
      await pollUSLiveQuotes();

      // Poll authentic Upstox quotes every 1.5 seconds during market hours
      const upstoxPollInterval = setInterval(pollUpstoxBasePrices, 1500);

      // Poll US quotes every 2.5 seconds during market hours
      const usPollInterval = setInterval(pollUSLiveQuotes, 2500);

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

import { NextRequest } from 'next/server';
import { getUpstoxToken } from '@/lib/upstox-service';
import { getIndianMarketStatus } from '@/lib/market-hours';

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

  // Create real SSE stream (100% authentic - NO fake or random data)
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;

      const lastKnownPrices = new Map<string, number>();

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
      controller.enqueue(encoder.encode(`data: ${statusPayload}\n\n`));

      // Function to poll authentic live prices from Upstox API
      const pollRealUpstoxQuotes = async () => {
        if (isClosed) return;

        // If market is closed, send heartbeat/status check without polling quotes
        const currentMarketStatus = getIndianMarketStatus();
        if (!currentMarketStatus.isOpen) {
          const closedPing = JSON.stringify({
            type: 'MARKET_STATUS',
            isOpen: false,
            session: currentMarketStatus.session,
            exchange: currentMarketStatus.exchange,
            reason: currentMarketStatus.reason,
            timeIST: currentMarketStatus.timeIST,
          });
          try {
            controller.enqueue(encoder.encode(`data: ${closedPing}\n\n`));
          } catch {
            // controller closed
          }
          return;
        }

        // Market is OPEN: Fetch authentic Upstox LTP quotes if token is available
        if (!token) {
          const noTokenMsg = JSON.stringify({
            type: 'NOTICE',
            message: 'Market is open, but UPSTOX_TOKEN is not configured in .env.local for live quotes.',
          });
          try {
            controller.enqueue(encoder.encode(`data: ${noTokenMsg}\n\n`));
          } catch {
            // controller closed
          }
          return;
        }

        try {
          const encoded = encodeURIComponent(instrumentKeys.slice(0, 50).join(','));
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
                if (quote?.last_price) {
                  const instKey = quote.instrument_token || key;
                  const prevPrice = lastKnownPrices.get(instKey);

                  // Only emit tick if price actually changed or first received
                  if (prevPrice === undefined || prevPrice !== quote.last_price) {
                    const direction =
                      prevPrice === undefined
                        ? 'EQUAL'
                        : quote.last_price > prevPrice
                        ? 'UP'
                        : quote.last_price < prevPrice
                        ? 'DOWN'
                        : 'EQUAL';

                    lastKnownPrices.set(instKey, quote.last_price);

                    const realTickPayload = JSON.stringify({
                      type: 'TICK',
                      instrumentKey: instKey,
                      price: quote.last_price,
                      close: quote.last_price,
                      volumeDelta: 0,
                      timestamp: nowSec,
                      direction,
                    });

                    controller.enqueue(encoder.encode(`data: ${realTickPayload}\n\n`));
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Upstox real quote poll error:', e);
        }
      };

      // Initial authentic poll
      await pollRealUpstoxQuotes();

      // Poll every 3 seconds for genuine price changes (strictly no simulation)
      const pollInterval = setInterval(pollRealUpstoxQuotes, 3000);

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
        clearInterval(pollInterval);
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

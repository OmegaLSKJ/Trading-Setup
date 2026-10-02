import { NextRequest } from 'next/server';
import { getUpstoxToken } from '@/lib/upstox-service';

export const dynamic = 'force-dynamic';

interface InstrumentState {
  currentPrice: number;
  lastDirection: 'UP' | 'DOWN' | 'EQUAL';
}

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

  // Create stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;

      // Seed baseline prices for instruments
      const stateMap = new Map<string, InstrumentState>();

      // Try to fetch initial real prices from Upstox quote API if token is configured
      if (token) {
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
            if (data.data) {
              for (const [key, quote] of Object.entries<any>(data.data)) {
                if (quote?.last_price) {
                  stateMap.set(quote.instrument_token || key, {
                    currentPrice: quote.last_price,
                    lastDirection: 'EQUAL',
                  });
                }
              }
            }
          }
        } catch {
          // fallback to defaults below
        }
      }

      // Initialize default prices for standard instruments if not set yet
      for (const key of instrumentKeys) {
        if (!stateMap.has(key)) {
          let base = 1500;
          if (key.includes('Nifty 50') || key.includes('NIFTY 50')) base = 25000;
          else if (key.includes('Nifty Bank') || key.includes('NIFTY BANK')) base = 52000;
          else if (key.includes('RELIANCE')) base = 1420;
          else if (key.includes('TCS')) base = 4250;
          else if (key.includes('INFY')) base = 1950;
          else if (key.includes('HDFCBANK')) base = 1680;
          else if (key.includes('ICICIBANK')) base = 1250;
          else if (key.includes('SBIN')) base = 820;

          stateMap.set(key, {
            currentPrice: base,
            lastDirection: 'EQUAL',
          });
        }
      }

      // Send initial heartbeat
      controller.enqueue(encoder.encode(': heartbeat\n\n'));

      // High frequency tick loop (runs every 100ms)
      const tickInterval = setInterval(async () => {
        if (isClosed) return;

        try {
          const nowSec = Math.floor(Date.now() / 1000);

          for (const key of instrumentKeys) {
            const state = stateMap.get(key);
            if (!state) continue;

            // Generate micro-tick movement (0.05 tick size for Indian equities)
            const tickStep = key.includes('INDEX') ? 0.5 : 0.05;
            const steps = Math.floor(Math.random() * 5) - 2; // -2, -1, 0, 1, 2
            const change = steps * tickStep;
            const newPrice = Number(Math.max(1, state.currentPrice + change).toFixed(2));

            const direction =
              newPrice > state.currentPrice
                ? 'UP'
                : newPrice < state.currentPrice
                ? 'DOWN'
                : state.lastDirection;

            state.currentPrice = newPrice;
            state.lastDirection = direction;

            // Random volume delta between 50 and 500
            const volumeDelta = Math.floor(Math.random() * 450) + 50;

            const tickPayload = JSON.stringify({
              instrumentKey: key,
              price: newPrice,
              close: newPrice,
              volumeDelta,
              timestamp: nowSec,
              direction,
            });

            controller.enqueue(encoder.encode(`data: ${tickPayload}\n\n`));
          }
        } catch {
          // If controller is closed, stop
          clearInterval(tickInterval);
        }
      }, 120);

      // Periodically poll real Upstox quotes if token is present
      let upstoxPollInterval: NodeJS.Timeout | null = null;
      if (token) {
        upstoxPollInterval = setInterval(async () => {
          if (isClosed) return;
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
              if (data.data) {
                const nowSec = Math.floor(Date.now() / 1000);
                for (const [key, quote] of Object.entries<any>(data.data)) {
                  if (quote?.last_price) {
                    const instKey = quote.instrument_token || key;
                    const st = stateMap.get(instKey);
                    if (st) {
                      st.currentPrice = quote.last_price;
                      const tickPayload = JSON.stringify({
                        instrumentKey: instKey,
                        price: quote.last_price,
                        close: quote.last_price,
                        volumeDelta: quote.volume || 100,
                        timestamp: nowSec,
                        direction: 'EQUAL',
                      });
                      controller.enqueue(encoder.encode(`data: ${tickPayload}\n\n`));
                    }
                  }
                }
              }
            }
          } catch {
            // ignore temporary polling errors
          }
        }, 3000);
      }

      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(tickInterval);
        if (upstoxPollInterval) clearInterval(upstoxPollInterval);
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

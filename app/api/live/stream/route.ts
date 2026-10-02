import { NextRequest, NextResponse } from 'next/server';
import { getUpstoxToken } from '@/lib/upstox-service';
import { getIndianMarketStatus, getUSMarketStatus } from '@/lib/market-hours';
import { LiveTick, QuoteState } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_SUBSCRIPTION_KEYS = 50;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const instrumentsParam = searchParams.get('instruments') || '';

  // Deduplicate and filter keys
  const rawKeys = instrumentsParam
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const instrumentKeys = Array.from(new Set(rawKeys));

  // Return pre-stream errors as JSON in established collection error shape
  if (instrumentKeys.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No instrument keys provided' },
      { status: 400 }
    );
  }

  if (instrumentKeys.length > MAX_SUBSCRIPTION_KEYS) {
    return NextResponse.json(
      {
        success: false,
        error: `Subscription limit exceeded: maximum allowed is ${MAX_SUBSCRIPTION_KEYS} instruments.`,
      },
      { status: 400 }
    );
  }

  const token = getUpstoxToken();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const abortController = new AbortController();

      let isCleanedUp = false;
      let upstoxTimeout: NodeJS.Timeout | null = null;
      let usTimeout: NodeJS.Timeout | null = null;
      let heartbeatInterval: NodeJS.Timeout | null = null;

      // Idempotent cleanup defined before any await
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;

        if (upstoxTimeout) clearTimeout(upstoxTimeout);
        if (usTimeout) clearTimeout(usTimeout);
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        abortController.abort();

        try {
          controller.close();
        } catch {
          // ignore already closed
        }
      };

      request.signal.addEventListener('abort', cleanup, { once: true });

      // Helper to enqueue SSE data with flow-control checks
      const safeEnqueue = (payloadStr: string): boolean => {
        if (isCleanedUp) return false;

        // Check desiredSize for backpressure: coalesce/drop for slow consumers
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          return false;
        }

        try {
          controller.enqueue(encoder.encode(`data: ${payloadStr}\n\n`));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      // Track last emitted prices, cumulative volumes, and directions
      const lastEmittedPriceMap = new Map<string, number>();
      const cumulativeVolumeMap = new Map<string, number>();
      const lastDirectionMap = new Map<string, 'UP' | 'DOWN' | 'EQUAL'>();

      // Send initial market status event
      const initialStatus = getIndianMarketStatus();
      safeEnqueue(
        JSON.stringify({
          type: 'MARKET_STATUS',
          isOpen: initialStatus.isOpen,
          session: initialStatus.session,
          exchange: initialStatus.exchange,
          reason: initialStatus.reason,
          timeIST: initialStatus.timeIST,
        })
      );

      // Check aborted state immediately after synchronous setup
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      // 1. Completion-based polling for Upstox Indian Market Quotes
      let isUpstoxPolling = false;
      const pollUpstoxQuotes = async () => {
        if (isCleanedUp || isUpstoxPolling) return;
        isUpstoxPolling = true;

        try {
          const indianKeys = instrumentKeys.filter((k) => !k.startsWith('US|'));
          if (indianKeys.length === 0 || !token) return;

          const marketStatus = getIndianMarketStatus();
          const state: QuoteState = marketStatus.isOpen ? 'FRESH' : 'MARKET_CLOSED';

          // Upstox endpoint accepts batches of up to 50 keys
          const encoded = encodeURIComponent(indianKeys.slice(0, 50).join(','));
          const res = await fetch(
            `https://api.upstox.com/v3/market-quote/ltp?instrument_key=${encoded}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
              signal: abortController.signal,
            }
          );

          if (res.ok) {
            const data = await res.json();
            if (data.status === 'success' && data.data) {
              const nowSec = Math.floor(Date.now() / 1000);

interface UpstoxQuoteItem {
  instrument_token?: string;
  last_price?: number;
  volume?: number;
  timestamp?: string;
}

              for (const [key, quote] of Object.entries<UpstoxQuoteItem>(data.data)) {
                if (quote?.last_price !== undefined && quote?.last_price !== null) {

                  const instKey = quote.instrument_token || key;
                  const newPrice = Number(quote.last_price.toFixed(2));
                  const prevPrice = lastEmittedPriceMap.get(instKey);

                  // STRICT DATA TRUTHFULNESS:
                  // If market is closed, DO NOT emit price movement changes
                  if (!marketStatus.isOpen && prevPrice !== undefined) {
                    continue;
                  }

                  // Only emit when provider reports a new price, or on initial state snapshot
                  if (prevPrice !== undefined && newPrice === prevPrice) {
                    continue;
                  }

                  const direction: 'UP' | 'DOWN' | 'EQUAL' =
                    prevPrice === undefined
                      ? 'EQUAL'
                      : newPrice > prevPrice
                      ? 'UP'
                      : 'DOWN';

                  lastEmittedPriceMap.set(instKey, newPrice);
                  lastDirectionMap.set(instKey, direction);

                  const tick: LiveTick = {
                    type: 'TICK',
                    instrumentKey: instKey,
                    price: newPrice,
                    close: newPrice,
                    cumulativeVolume: quote.volume !== undefined ? Number(quote.volume) : undefined,
                    volumeDelta: 0, // derived without fabricating numbers
                    timestamp: nowSec,
                    direction,
                    state,
                  };

                  if (!safeEnqueue(JSON.stringify(tick))) {
                    return;
                  }
                }
              }
            }
          }
        } catch {
          // fetch aborted or error
        } finally {
          isUpstoxPolling = false;
          if (!isCleanedUp) {
            // Schedule next poll ONLY after current completes
            upstoxTimeout = setTimeout(pollUpstoxQuotes, 1500);
          }
        }
      };

      // 2. Completion-based polling for US Quotes (Yahoo Finance)
      let isUSPolling = false;
      const pollUSQuotes = async () => {
        if (isCleanedUp || isUSPolling) return;
        isUSPolling = true;

        try {
          const usKeys = instrumentKeys.filter((k) => k.startsWith('US|'));
          if (usKeys.length === 0) return;

          const usStatus = getUSMarketStatus();
          const state: QuoteState = usStatus.isOpen ? 'FRESH' : 'MARKET_CLOSED';

          for (const usKey of usKeys) {
            if (isCleanedUp) return;

            const ticker = usKey.replace('US|', '').toUpperCase();
            try {
              const res = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
                  ticker
                )}?interval=1m&range=1d`,
                {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                  signal: abortController.signal,
                }
              );

              if (res.ok) {
                const data = await res.json();
                const meta = data.chart?.result?.[0]?.meta;



                if (meta?.regularMarketPrice) {
                  const price = Number(meta.regularMarketPrice.toFixed(2));
                  const prevPrice = lastEmittedPriceMap.get(usKey);

                  // Do not emit closed-market price changes
                  if (!usStatus.isOpen && prevPrice !== undefined) {
                    continue;
                  }

                  // Emit only authentic price movements
                  if (prevPrice !== undefined && price === prevPrice) {
                    continue;
                  }

                  const direction: 'UP' | 'DOWN' | 'EQUAL' =
                    prevPrice === undefined
                      ? 'EQUAL'
                      : price > prevPrice
                      ? 'UP'
                      : 'DOWN';

                  lastEmittedPriceMap.set(usKey, price);
                  lastDirectionMap.set(usKey, direction);

                  // Extract authentic provider timestamp
                  const providerTimestamp = meta.regularMarketTime
                    ? Number(meta.regularMarketTime)
                    : Math.floor(Date.now() / 1000);

                  // Calculate authentic volume delta from cumulative volume without replacing zero
                  const cumulativeVolume = meta.regularMarketVolume
                    ? Number(meta.regularMarketVolume)
                    : undefined;

                  let volumeDelta = 0;
                  if (cumulativeVolume !== undefined) {
                    const prevCumVol = cumulativeVolumeMap.get(usKey);
                    if (prevCumVol !== undefined && cumulativeVolume >= prevCumVol) {
                      volumeDelta = cumulativeVolume - prevCumVol;
                    }
                    cumulativeVolumeMap.set(usKey, cumulativeVolume);
                  }

                  const tick: LiveTick = {
                    type: 'TICK',
                    instrumentKey: usKey,
                    price,
                    close: price,
                    cumulativeVolume,
                    volumeDelta,
                    timestamp: providerTimestamp,
                    direction,
                    state,
                  };

                  if (!safeEnqueue(JSON.stringify(tick))) {
                    return;
                  }
                }
              }
            } catch {
              // individual quote failure
            }
          }
        } catch {
          // outer error
        } finally {
          isUSPolling = false;
          if (!isCleanedUp) {
            usTimeout = setTimeout(pollUSQuotes, 2500);
          }
        }
      };

      // Periodic SSE heartbeat every 15 seconds to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (isCleanedUp) return;
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);

      // Start initial poll sequence
      pollUpstoxQuotes();
      pollUSQuotes();
    },
    cancel() {
      // ReadableStream cancellation handler
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

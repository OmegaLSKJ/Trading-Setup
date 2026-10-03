import { NextRequest, NextResponse } from 'next/server';
import { getUpstoxToken } from '@/lib/upstox-service';
import { getIndianMarketStatus, getMarketStatusForInstrument } from '@/lib/market-hours';
import { allowApiRequest } from '@/lib/api-rate-limit';
import { LiveTick, QuoteState } from '@/lib/types';

export const dynamic = 'force-dynamic';

let activeSSEConnections = 0;
const MAX_SSE_CONNECTIONS = 50;
const MAX_SUBSCRIPTION_KEYS = 50;

export async function GET(request: NextRequest) {
  // 1. Ingress rate limit check
  const allowed = allowApiRequest(request, 'live-stream', 60);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please slow down your requests.' },
      { status: 429 }
    );
  }

  // 2. Module-level SSE connection cap
  if (activeSSEConnections >= MAX_SSE_CONNECTIONS) {
    return NextResponse.json(
      { success: false, error: 'Maximum live SSE connection capacity reached. Please retry later.' },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const instrumentsParam = searchParams.get('instruments') || '';

  // 3. Deduplicate and filter keys
  const rawKeys = instrumentsParam
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const instrumentKeys = Array.from(new Set(rawKeys));

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

  // Bound key length
  if (instrumentKeys.some((k) => k.length > 100)) {
    return NextResponse.json(
      { success: false, error: 'Invalid instrument key: exceeds maximum length of 100 characters.' },
      { status: 400 }
    );
  }

  activeSSEConnections++;
  let hasDecremented = false;

  const token = getUpstoxToken();

  // Forward ref for stream cleanup
  let streamCleanup: () => void = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const abortController = new AbortController();

      let isCleanedUp = false;
      let upstoxTimeout: NodeJS.Timeout | null = null;
      let usTimeout: NodeJS.Timeout | null = null;
      let heartbeatInterval: NodeJS.Timeout | null = null;
      let flushInterval: NodeJS.Timeout | null = null;

      let upstoxBackoffMs = 1500;
      let usBackoffMs = 2500;

      // Idempotent cleanup defined before any await
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;

        if (!hasDecremented) {
          hasDecremented = true;
          activeSSEConnections = Math.max(0, activeSSEConnections - 1);
        }

        if (upstoxTimeout) clearTimeout(upstoxTimeout);
        if (usTimeout) clearTimeout(usTimeout);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (flushInterval) clearInterval(flushInterval);

        abortController.abort();

        try {
          controller.close();
        } catch {
          // ignore already closed
        }
      };

      streamCleanup = cleanup;
      request.signal.addEventListener('abort', cleanup, { once: true });
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      // Flow-control enqueue helper
      const safeEnqueue = (payloadStr: string): boolean => {
        if (isCleanedUp) return false;

        // Check desiredSize for backpressure: coalesce/hold for slow consumers
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

      // Baselines committed ONLY after safeEnqueue succeeds
      const committedPriceMap = new Map<string, number>();
      const committedDirectionMap = new Map<string, 'UP' | 'DOWN' | 'EQUAL'>();
      const committedVolumeMap = new Map<string, number>();
      const committedTimeframeMinuteMap = new Map<string, number>();

      // Coalesced pending snapshots under backpressure
      interface PendingSnapshot {
        tick: LiveTick;
        newPrice: number;
        direction: 'UP' | 'DOWN' | 'EQUAL';
        cumulativeVolume?: number;
        timeframeMinute?: number;
      }
      const pendingSnapshots = new Map<string, PendingSnapshot>();

      const flushPending = () => {
        if (isCleanedUp || pendingSnapshots.size === 0) return;
        if (controller.desiredSize !== null && controller.desiredSize <= 0) return;

        for (const [key, pending] of Array.from(pendingSnapshots.entries())) {
          if (controller.desiredSize !== null && controller.desiredSize <= 0) break;
          const ok = safeEnqueue(JSON.stringify(pending.tick));
          if (ok) {
            committedPriceMap.set(key, pending.newPrice);
            committedDirectionMap.set(key, pending.direction);
            if (pending.cumulativeVolume !== undefined) {
              committedVolumeMap.set(key, pending.cumulativeVolume);
            }
            if (pending.timeframeMinute !== undefined) {
              committedTimeframeMinuteMap.set(key, pending.timeframeMinute);
            }
            pendingSnapshots.delete(key);
          }
        }
      };

      // Periodic check to flush pending snapshots when reader drains
      flushInterval = setInterval(flushPending, 300);

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
          if (indianKeys.length === 0) return;

          if (!token) {
            safeEnqueue(
              JSON.stringify({
                type: 'STATUS',
                provider: 'UPSTOX',
                state: 'NO_TOKEN',
                error: 'Upstox access token is not configured',
                timestamp: Math.floor(Date.now() / 1000),
              })
            );
            return;
          }

          // Upstox endpoint accepts batches of up to 50 keys
          const encoded = encodeURIComponent(indianKeys.slice(0, 50).join(','));
          const timeoutSignal = AbortSignal.timeout(6000);
          const combinedSignal = abortController.signal.aborted
            ? abortController.signal
            : timeoutSignal;

          let res: Response;
          try {
            res = await fetch(
              `https://api.upstox.com/v3/market-quote/ltp?instrument_key=${encoded}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/json',
                },
                signal: combinedSignal,
              }
            );
          } catch (fetchErr: unknown) {
            const errObj = fetchErr as Error;
            safeEnqueue(
              JSON.stringify({
                type: 'STATUS',
                provider: 'UPSTOX',
                state: 'STALE',
                error: errObj?.message || 'Network connection failed',
                timestamp: Math.floor(Date.now() / 1000),
              })
            );
            return;
          }

          if (res.status === 401 || res.status === 403) {
            safeEnqueue(
              JSON.stringify({
                type: 'STATUS',
                provider: 'UPSTOX',
                state: 'NO_TOKEN',
                error: `Upstox token unauthorized or expired (HTTP ${res.status})`,
                timestamp: Math.floor(Date.now() / 1000),
              })
            );
            return;
          }

          if (res.status === 429) {
            const retryHeader = res.headers.get('Retry-After');
            const retrySec = retryHeader ? parseInt(retryHeader, 10) || 5 : 5;
            upstoxBackoffMs = Math.min(30000, retrySec * 1000);
            safeEnqueue(
              JSON.stringify({
                type: 'STATUS',
                provider: 'UPSTOX',
                state: 'RATE_LIMITED',
                error: 'Upstox rate limit reached',
                retryAfter: retrySec,
                timestamp: Math.floor(Date.now() / 1000),
              })
            );
            return;
          }

          if (!res.ok) {
            upstoxBackoffMs = Math.min(30000, upstoxBackoffMs * 2);
            safeEnqueue(
              JSON.stringify({
                type: 'STATUS',
                provider: 'UPSTOX',
                state: 'STALE',
                error: `Upstox server error: HTTP ${res.status}`,
                timestamp: Math.floor(Date.now() / 1000),
              })
            );
            return;
          }

          // Reset backoff on success
          upstoxBackoffMs = 1500;

          let data: Record<string, unknown>;
          try {
            data = await res.json();
          } catch {
            safeEnqueue(
              JSON.stringify({
                type: 'STATUS',
                provider: 'UPSTOX',
                state: 'STALE',
                error: 'Invalid JSON response from Upstox',
                timestamp: Math.floor(Date.now() / 1000),
              })
            );
            return;
          }

          if (data.status === 'success' && data.data && typeof data.data === 'object') {
            flushPending();

            interface UpstoxQuoteItem {
              instrument_token?: string;
              last_price?: number;
              volume?: number;
              timestamp?: string;
            }

            for (const [key, quote] of Object.entries<UpstoxQuoteItem>(data.data as Record<string, UpstoxQuoteItem>)) {
              if (quote?.last_price !== undefined && quote?.last_price !== null) {
                const instKey = quote.instrument_token || key;
                const newPrice = Number(quote.last_price.toFixed(2));
                const prevPrice = committedPriceMap.get(instKey);
                const prevVol = committedVolumeMap.get(instKey);
                const prevMinute = committedTimeframeMinuteMap.get(instKey);

                const marketStatus = getMarketStatusForInstrument({ instrument_key: instKey });

                // STRICT DATA TRUTHFULNESS:
                // If market is closed, DO NOT emit price movement changes
                if (!marketStatus.isOpen && prevPrice !== undefined && newPrice !== prevPrice) {
                  continue;
                }

                // Check provider timestamp
                let providerTs = Math.floor(Date.now() / 1000);
                if (quote.timestamp) {
                  const parsed = Date.parse(quote.timestamp);
                  if (!isNaN(parsed)) {
                    providerTs = Math.floor(parsed / 1000);
                  }
                }

                const ageSec = Math.floor(Date.now() / 1000) - providerTs;
                const state: QuoteState = !marketStatus.isOpen
                  ? 'MARKET_CLOSED'
                  : ageSec < 120
                  ? 'FRESH'
                  : 'STALE';

                const newVol = quote.volume !== undefined ? Number(quote.volume) : undefined;
                const currentMinute = Math.floor(providerTs / 60);

                const priceChanged = prevPrice === undefined || newPrice !== prevPrice;
                const volChanged = newVol !== undefined && prevVol !== undefined && newVol !== prevVol;
                const timeframeBoundaryChanged = prevMinute !== undefined && currentMinute !== prevMinute;

                // Emit on price change, volume-only change, timeframe boundary update, or initial snapshot
                if (!priceChanged && !volChanged && !timeframeBoundaryChanged && prevPrice !== undefined) {
                  continue;
                }

                const direction: 'UP' | 'DOWN' | 'EQUAL' =
                  prevPrice === undefined
                    ? 'EQUAL'
                    : newPrice > prevPrice
                    ? 'UP'
                    : newPrice < prevPrice
                    ? 'DOWN'
                    : (committedDirectionMap.get(instKey) || 'EQUAL');

                let volumeDelta = 0;
                if (newVol !== undefined && prevVol !== undefined && newVol >= prevVol) {
                  volumeDelta = newVol - prevVol;
                }

                const tick: LiveTick = {
                  type: 'TICK',
                  instrumentKey: instKey,
                  price: newPrice,
                  close: newPrice,
                  cumulativeVolume: newVol,
                  volumeDelta,
                  timestamp: providerTs,
                  direction,
                  state,
                };

                const snapshot: PendingSnapshot = {
                  tick,
                  newPrice,
                  direction,
                  cumulativeVolume: newVol,
                  timeframeMinute: currentMinute,
                };

                if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                  pendingSnapshots.set(instKey, snapshot);
                } else {
                  const enqueued = safeEnqueue(JSON.stringify(tick));
                  if (enqueued) {
                    committedPriceMap.set(instKey, newPrice);
                    committedDirectionMap.set(instKey, direction);
                    if (newVol !== undefined) committedVolumeMap.set(instKey, newVol);
                    committedTimeframeMinuteMap.set(instKey, currentMinute);
                    pendingSnapshots.delete(instKey);
                  } else {
                    pendingSnapshots.set(instKey, snapshot);
                  }
                }
              }
            }
          }
        } catch {
          // fetch aborted or unhandled error
        } finally {
          isUpstoxPolling = false;
          if (!isCleanedUp) {
            upstoxTimeout = setTimeout(pollUpstoxQuotes, upstoxBackoffMs);
          }
        }
      };

      // 2. Completion-based polling for US Quotes (Yahoo Finance) with per-instrument deadlines
      let isUSPolling = false;
      const pollUSQuotes = async () => {
        if (isCleanedUp || isUSPolling) return;
        isUSPolling = true;

        try {
          const usKeys = instrumentKeys.filter((k) => k.startsWith('US|'));
          if (usKeys.length === 0) return;

          flushPending();

          for (const usKey of usKeys) {
            if (isCleanedUp) return;

            const ticker = usKey.replace('US|', '').toUpperCase();
            const usStatus = getMarketStatusForInstrument({ instrument_key: usKey });

            try {
              const perInstrumentTimeout = AbortSignal.timeout(5000);
              const combinedSignal = abortController.signal.aborted
                ? abortController.signal
                : perInstrumentTimeout;

              const res = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
                  ticker
                )}?interval=1m&range=1d`,
                {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                  signal: combinedSignal,
                }
              );

              if (res.status === 429) {
                const retryHeader = res.headers.get('Retry-After');
                const retrySec = retryHeader ? parseInt(retryHeader, 10) || 5 : 5;
                usBackoffMs = Math.min(30000, retrySec * 1000);
                safeEnqueue(
                  JSON.stringify({
                    type: 'STATUS',
                    provider: 'YAHOO',
                    instrumentKey: usKey,
                    state: 'RATE_LIMITED',
                    error: `Yahoo rate limited for ${ticker}`,
                    retryAfter: retrySec,
                    timestamp: Math.floor(Date.now() / 1000),
                  })
                );
                continue;
              }

              if (!res.ok) {
                safeEnqueue(
                  JSON.stringify({
                    type: 'STATUS',
                    provider: 'YAHOO',
                    instrumentKey: usKey,
                    state: 'STALE',
                    error: `Yahoo error HTTP ${res.status} for ${ticker}`,
                    timestamp: Math.floor(Date.now() / 1000),
                  })
                );
                continue;
              }

              let data: Record<string, unknown>;
              try {
                data = await res.json();
              } catch {
                safeEnqueue(
                  JSON.stringify({
                    type: 'STATUS',
                    provider: 'YAHOO',
                    instrumentKey: usKey,
                    state: 'STALE',
                    error: `Invalid JSON from Yahoo for ${ticker}`,
                    timestamp: Math.floor(Date.now() / 1000),
                  })
                );
                continue;
              }

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const meta = (data as any)?.chart?.result?.[0]?.meta;
              if (meta?.regularMarketPrice) {
                const price = Number(meta.regularMarketPrice.toFixed(2));
                const prevPrice = committedPriceMap.get(usKey);
                const prevVol = committedVolumeMap.get(usKey);
                const prevMinute = committedTimeframeMinuteMap.get(usKey);

                if (!usStatus.isOpen && prevPrice !== undefined && price !== prevPrice) {
                  continue;
                }

                // Extract authentic provider timestamp (last trade time)
                const providerTimestamp = meta.regularMarketTime
                  ? Number(meta.regularMarketTime)
                  : Math.floor(Date.now() / 1000);

                const ageSec = Math.floor(Date.now() / 1000) - providerTimestamp;
                const state: QuoteState = !usStatus.isOpen
                  ? 'MARKET_CLOSED'
                  : ageSec < 120
                  ? 'FRESH'
                  : 'STALE';

                const cumulativeVolume = meta.regularMarketVolume
                  ? Number(meta.regularMarketVolume)
                  : undefined;

                const currentMinute = Math.floor(providerTimestamp / 60);

                const priceChanged = prevPrice === undefined || price !== prevPrice;
                const volChanged =
                  cumulativeVolume !== undefined && prevVol !== undefined && cumulativeVolume !== prevVol;
                const timeframeBoundaryChanged = prevMinute !== undefined && currentMinute !== prevMinute;

                if (!priceChanged && !volChanged && !timeframeBoundaryChanged && prevPrice !== undefined) {
                  continue;
                }

                const direction: 'UP' | 'DOWN' | 'EQUAL' =
                  prevPrice === undefined
                    ? 'EQUAL'
                    : price > prevPrice
                    ? 'UP'
                    : price < prevPrice
                    ? 'DOWN'
                    : (committedDirectionMap.get(usKey) || 'EQUAL');

                let volumeDelta = 0;
                if (cumulativeVolume !== undefined && prevVol !== undefined && cumulativeVolume >= prevVol) {
                  volumeDelta = cumulativeVolume - prevVol;
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

                const snapshot: PendingSnapshot = {
                  tick,
                  newPrice: price,
                  direction,
                  cumulativeVolume,
                  timeframeMinute: currentMinute,
                };

                if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                  pendingSnapshots.set(usKey, snapshot);
                } else {
                  const enqueued = safeEnqueue(JSON.stringify(tick));
                  if (enqueued) {
                    committedPriceMap.set(usKey, price);
                    committedDirectionMap.set(usKey, direction);
                    if (cumulativeVolume !== undefined) committedVolumeMap.set(usKey, cumulativeVolume);
                    committedTimeframeMinuteMap.set(usKey, currentMinute);
                    pendingSnapshots.delete(usKey);
                  } else {
                    pendingSnapshots.set(usKey, snapshot);
                  }
                }
              }
            } catch (instErr: unknown) {
              const errObj = instErr as Error;
              safeEnqueue(
                JSON.stringify({
                  type: 'STATUS',
                  provider: 'YAHOO',
                  instrumentKey: usKey,
                  state: 'STALE',
                  error: errObj?.message || `Fetch error for ${ticker}`,
                  timestamp: Math.floor(Date.now() / 1000),
                })
              );
            }
          }
        } catch {
          // outer loop error
        } finally {
          isUSPolling = false;
          if (!isCleanedUp) {
            usTimeout = setTimeout(pollUSQuotes, usBackoffMs);
          }
        }
      };

      // Periodic SSE heartbeat every 15 seconds with flow-control check
      heartbeatInterval = setInterval(() => {
        if (isCleanedUp) return;
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          return; // Skip heartbeat under backpressure
        }
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
      streamCleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

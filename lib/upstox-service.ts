import 'server-only';
import { upstoxRequestQueue } from './rate-limiter';
import { Candle, Timeframe, FailedRange } from './types';
import {
  formatDateYYYYMMDD,
  calculateDateChunks,
  dateStringToUtcSeconds,
} from './date-utils';

export { formatDateYYYYMMDD, calculateDateChunks };

const UPSTOX_BASE_URL = 'https://api.upstox.com/v3';

// Server-side helper to get token
export function getUpstoxToken(): string | undefined {
  const token = process.env.UPSTOX_TOKEN;
  if (!token || token.trim() === '' || token.includes('YOUR_ANALYTICS_TOKEN') || token.includes('YOUR_UPSTOX_TOKEN_HERE')) {
    return undefined;
  }
  return token.trim();
}

export function isTokenConfigured(): boolean {
  return Boolean(getUpstoxToken());
}

/**
 * Maps dashboard timeframe to Upstox V3 unit and interval
 */
export function mapTimeframeToUpstox(timeframe: Timeframe): { unit: string; interval: number } {
  switch (timeframe) {
    case '1m':
      return { unit: 'minutes', interval: 1 };
    case '3m':
      return { unit: 'minutes', interval: 3 };
    case '5m':
      return { unit: 'minutes', interval: 5 };
    case '10m':
      return { unit: 'minutes', interval: 10 };
    case '15m':
      return { unit: 'minutes', interval: 15 };
    case '30m':
      return { unit: 'minutes', interval: 30 };
    case '1h':
      return { unit: 'minutes', interval: 60 };
    case '1D':
      return { unit: 'days', interval: 1 };
  }
}

/**
 * Raw Upstox candle tuple:
 * [timestamp (ISO string), open, high, low, close, volume, open_interest]
 */
type UpstoxRawCandle = [string, number, number, number, number, number, number];

interface UpstoxCandleResponse {
  status: string;
  data?: {
    candles?: UpstoxRawCandle[];
  };
  errors?: { errorCode?: string; message?: string }[];
}

export interface CandleFetchResult {
  candles: Candle[];
  partial?: boolean;
  failedRanges?: FailedRange[];
}

export class UpstoxApiError extends Error {
  status: number;
  retryAfter?: number;
  code?: string;

  constructor(message: string, status = 500, retryAfter?: number, code?: string) {
    super(message);
    this.name = 'UpstoxApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

/**
 * Normalizes and converts raw Upstox candles to dashboard format.
 * Preserves candle sorting, deduplication, and intraday precedence.
 */
export function normalizeCandles(rawCandles: UpstoxRawCandle[]): Candle[] {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
    return [];
  }

  const map = new Map<number, Candle>();

  for (const item of rawCandles) {
    if (!item || item.length < 5) continue;

    const [isoTime, open, high, low, close, volume = 0, oi = 0] = item;
    if (!isoTime) continue;

    const parsedDate = new Date(isoTime);
    if (isNaN(parsedDate.getTime())) continue;

    const unixSeconds = Math.floor(parsedDate.getTime() / 1000);

    const candle: Candle = {
      time: unixSeconds,
      timeString: isoTime,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume) || 0,
      openInterest: Number(oi) || 0,
    };

    if (
      !isNaN(candle.open) &&
      !isNaN(candle.high) &&
      !isNaN(candle.low) &&
      !isNaN(candle.close)
    ) {
      map.set(unixSeconds, candle);
    }
  }

  // Sort chronologically ascending
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/**
 * Fetches candles from Upstox Historical endpoint
 */
async function fetchHistoricalChunk(
  instrumentKey: string,
  unit: string,
  interval: number,
  toDate: string,
  fromDate: string,
  signal?: AbortSignal
): Promise<UpstoxRawCandle[]> {
  const token = getUpstoxToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const encodedKey = encodeURIComponent(instrumentKey);
  const url = `${UPSTOX_BASE_URL}/historical-candle/${encodedKey}/${unit}/${interval}/${toDate}/${fromDate}`;

  return upstoxRequestQueue.enqueue(async () => {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), 10000);

    // Combine request signal with timeout signal
    const onAbort = () => timeoutController.abort();
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const res = await fetch(url, {
        headers,
        signal: timeoutController.signal,
      });

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 2;
        throw new UpstoxApiError('Upstox API rate limit reached', 429, retryAfter);
      }

      if (res.status === 401 || res.status === 403) {
        throw new UpstoxApiError('Upstox API token is invalid or unauthorized', res.status);
      }

      if (res.status === 404) {
        // Known no-data response (empty interval / holiday)
        return [];
      }

      if (!res.ok) {
        let errorMsg = `Upstox API error: HTTP ${res.status}`;
        try {
          const text = await res.text();
          const json = JSON.parse(text);
          if (json.errors?.[0]?.message) {
            errorMsg = json.errors[0].message;
          }
        } catch {
          // ignore parsing error
        }
        throw new UpstoxApiError(errorMsg, res.status);
      }

      const data: UpstoxCandleResponse = await res.json();
      if (data.status === 'success' && data.data?.candles) {
        return data.data.candles;
      }

      return [];
    } finally {
      clearTimeout(timeoutTimer);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  });
}

/**
 * Fetches candles from Upstox Intraday endpoint (current trading day)
 */
async function fetchIntraday(
  instrumentKey: string,
  unit: string,
  interval: number,
  signal?: AbortSignal
): Promise<UpstoxRawCandle[]> {
  const token = getUpstoxToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const encodedKey = encodeURIComponent(instrumentKey);
  const url = `${UPSTOX_BASE_URL}/historical-candle/intraday/${encodedKey}/${unit}/${interval}`;

  return upstoxRequestQueue.enqueue(async () => {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), 10000);

    const onAbort = () => timeoutController.abort();
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const res = await fetch(url, {
        headers,
        signal: timeoutController.signal,
      });

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 2;
        throw new UpstoxApiError('Upstox API rate limit reached', 429, retryAfter);
      }

      if (res.status === 401 || res.status === 403) {
        throw new UpstoxApiError('Upstox token invalid or unauthorized', res.status);
      }

      if (res.status === 404) {
        // Intraday may be empty outside market hours or return 404 (known no-data)
        return [];
      }

      if (!res.ok) {
        let errorMsg = `Upstox API error: HTTP ${res.status}`;
        try {
          const text = await res.text();
          const json = JSON.parse(text);
          if (json.errors?.[0]?.message) {
            errorMsg = json.errors[0].message;
          }
        } catch {
          // ignore parse error
        }
        throw new UpstoxApiError(errorMsg, res.status);
      }

      const data: UpstoxCandleResponse = await res.json();
      if (data.status === 'success' && data.data?.candles) {
        return data.data.candles;
      }

      return [];
    } finally {
      clearTimeout(timeoutTimer);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  });
}

/**
 * Unified high-level candle fetcher with automatic chunking, intraday stitching,
 * deduplication, and bounds filtering.
 */
export async function fetchCandleRange(
  instrumentKey: string,
  timeframe: Timeframe,
  fromDateStr: string,
  toDateStr: string,
  includeIntraday = true,
  signal?: AbortSignal
): Promise<CandleFetchResult> {
  if (!instrumentKey) {
    throw new UpstoxApiError('Missing required parameter: instrumentKey', 400);
  }

  const { unit, interval } = mapTimeframeToUpstox(timeframe);
  const chunks = calculateDateChunks(fromDateStr, toDateStr, timeframe);

  const rawCandles: UpstoxRawCandle[] = [];
  const failedRanges: FailedRange[] = [];
  let successfulChunksCount = 0;

  // Fetch chunks sequentially through queue with signal propagation
  for (const chunk of chunks) {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    try {
      const chunkCandles = await fetchHistoricalChunk(
        instrumentKey,
        unit,
        interval,
        chunk.to,
        chunk.from,
        signal
      );
      rawCandles.push(...chunkCandles);
      successfulChunksCount++;
    } catch (err: unknown) {
      const upstoxErr = err as UpstoxApiError;
      const status = upstoxErr?.status;

      // Always propagate auth and rate-limit errors immediately
      if (status === 401 || status === 403 || status === 429) {
        throw err;
      }

      console.warn(`Failed fetching chunk ${chunk.from} to ${chunk.to} for ${instrumentKey}:`, upstoxErr?.message);
      failedRanges.push({
        from: chunk.from,
        to: chunk.to,
        reason: upstoxErr?.message || 'Chunk fetch failed',
      });
    }
  }

  // If all chunks failed and we have no candles, propagate error
  if (chunks.length > 0 && successfulChunksCount === 0 && failedRanges.length > 0) {
    throw new UpstoxApiError(failedRanges[0].reason || 'All historical chunks failed', 502);
  }

  // Check if today falls inside exchange-local requested range (Asia/Kolkata for Indian stocks)
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const isTodayInRange = todayIST >= fromDateStr && todayIST <= toDateStr;

  // Fetch intraday if requested and today is within range
  if (includeIntraday && isTodayInRange) {
    try {
      const intradayCandles = await fetchIntraday(instrumentKey, unit, interval, signal);
      // Intraday candles take precedence on duplicate timestamps
      rawCandles.push(...intradayCandles);
    } catch (err: unknown) {
      const upstoxErr = err as UpstoxApiError;
      if (upstoxErr?.status === 401 || upstoxErr?.status === 403 || upstoxErr?.status === 429) {
        throw err;
      }
      console.warn(`Intraday fetch failed for ${instrumentKey}:`, upstoxErr?.message);
    }
  }

  const normalized = normalizeCandles(rawCandles);

  // Filter merged candles strictly to bounds [fromSec, toSec + 86399]
  const fromSec = dateStringToUtcSeconds(fromDateStr);
  const toSecEnd = dateStringToUtcSeconds(toDateStr) + 86399;
  const filtered = normalized.filter((c) => c.time >= fromSec && c.time <= toSecEnd);

  return {
    candles: filtered,
    partial: failedRanges.length > 0,
    failedRanges: failedRanges.length > 0 ? failedRanges : undefined,
  };
}

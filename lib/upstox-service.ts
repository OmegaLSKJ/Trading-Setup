import { upstoxRequestQueue } from './rate-limiter';
import { Candle, Timeframe } from './types';

const UPSTOX_BASE_URL = 'https://api.upstox.com/v3';

function apiError(message: string, status: number, retryAfter?: number): Error & { status: number; retryAfter?: number } {
  return Object.assign(new Error(message), { status, ...(retryAfter === undefined ? {} : { retryAfter }) });
}

// Server-side helper to get token
export function getUpstoxToken(): string | undefined {
  const token = process.env.UPSTOX_TOKEN;
  if (!token || token.trim() === '' || token.includes('YOUR_ANALYTICS_TOKEN')) {
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
    default:
      return { unit: 'minutes', interval: 5 };
  }
}

/**
 * Format a Date to YYYY-MM-DD
 */
export function formatDateYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate date chunks to comply with Upstox API range limits.
 * Minute data is typically restricted to 30 days per call.
 * Daily data can handle years in one call.
 */
export function calculateDateChunks(
  fromDateStr: string,
  toDateStr: string,
  timeframe: Timeframe
): { from: string; to: string }[] {
  const fromDate = new Date(fromDateStr);
  const toDate = new Date(toDateStr);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
    return [{ from: fromDateStr, to: toDateStr }];
  }

  // Daily candles can be fetched up to 365 days or more in a single call
  if (timeframe === '1D') {
    const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 365) {
      return [{ from: fromDateStr, to: toDateStr }];
    }

    const chunks: { from: string; to: string }[] = [];
    let currentTo = new Date(toDate);

    while (currentTo > fromDate) {
      const currentFrom = new Date(currentTo);
      currentFrom.setDate(currentFrom.getDate() - 365);
      const effectiveFrom = currentFrom < fromDate ? fromDate : currentFrom;

      chunks.push({
        from: formatDateYYYYMMDD(effectiveFrom),
        to: formatDateYYYYMMDD(currentTo),
      });

      currentTo = new Date(effectiveFrom);
      currentTo.setDate(currentTo.getDate() - 1);
    }

    return chunks;
  }

  // Minute candles: split into 28-day chunks
  const maxChunkDays = 28;
  const chunks: { from: string; to: string }[] = [];
  let currentTo = new Date(toDate);

  while (currentTo >= fromDate) {
    const currentFrom = new Date(currentTo);
    currentFrom.setDate(currentFrom.getDate() - maxChunkDays);
    const effectiveFrom = currentFrom < fromDate ? fromDate : currentFrom;

    chunks.push({
      from: formatDateYYYYMMDD(effectiveFrom),
      to: formatDateYYYYMMDD(currentTo),
    });

    currentTo = new Date(effectiveFrom);
    currentTo.setDate(currentTo.getDate() - 1);
  }

  return chunks;
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

/**
 * Normalizes and converts raw Upstox candles to dashboard format
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

    // Ensure valid prices
    if (
      !isNaN(candle.open) &&
      !isNaN(candle.high) &&
      !isNaN(candle.low) &&
      !isNaN(candle.close)
    ) {
      map.set(unixSeconds, candle);
    }
  }

  // Sort chronologically ascending (oldest to newest)
  const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);
  return sorted;
}

/**
 * Fetches candles from Upstox Historical endpoint
 */
async function fetchHistoricalChunk(
  instrumentKey: string,
  unit: string,
  interval: number,
  toDate: string,
  fromDate: string
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
    const res = await fetch(url, { headers });

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 2;
      throw apiError('Upstox API rate limit reached', 429, retryAfter);
    }

    if (res.status === 401 || res.status === 403) {
      throw apiError('Upstox token invalid or unauthorized', res.status);
    }

    if (!res.ok) {
      const text = await res.text();
      let errorMsg = `Upstox API error: HTTP ${res.status}`;
      try {
        const json = JSON.parse(text);
        if (json.errors?.[0]?.message) {
          errorMsg = json.errors[0].message;
        }
      } catch {
        // use default message
      }
      throw apiError(errorMsg, res.status);
    }

    const data: UpstoxCandleResponse = await res.json();
    if (data.status === 'success' && data.data?.candles) {
      return data.data.candles;
    }

    return [];
  });
}

/**
 * Fetches candles from Upstox Intraday endpoint (current trading day)
 */
async function fetchIntraday(
  instrumentKey: string,
  unit: string,
  interval: number
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
    const res = await fetch(url, { headers });

    if (res.status === 429) {
      throw apiError('Upstox API rate limit reached', 429);
    }

    if (!res.ok) {
      // Intraday may be empty outside market hours or return 404/400
      return [];
    }

    const data: UpstoxCandleResponse = await res.json();
    if (data.status === 'success' && data.data?.candles) {
      return data.data.candles;
    }

    return [];
  });
}

/**
 * Unified high-level candle fetcher with automatic chunking, intraday stitching,
 * deduplication, and sorting.
 */
export async function fetchCandleRange(
  instrumentKey: string,
  timeframe: Timeframe,
  fromDateStr: string,
  toDateStr: string,
  includeIntraday = true
): Promise<Candle[]> {
  if (!instrumentKey) {
    throw new Error('Instrument key is required');
  }

  const { unit, interval } = mapTimeframeToUpstox(timeframe);
  const chunks = calculateDateChunks(fromDateStr, toDateStr, timeframe);

  const rawCandles: UpstoxRawCandle[] = [];

  // Fetch chunks (sequential or controlled concurrency through queue)
  for (const chunk of chunks) {
    try {
      const chunkCandles = await fetchHistoricalChunk(
        instrumentKey,
        unit,
        interval,
        chunk.to,
        chunk.from
      );
      rawCandles.push(...chunkCandles);
    } catch (err: unknown) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Failed fetching chunk ${chunk.from} to ${chunk.to} for ${instrumentKey}:`, message);
      // If single chunk fails due to no data on holidays, continue to next chunk
      if (status !== 401 && status !== 429) {
        continue;
      }
      throw err;
    }
  }

  // Fetch intraday if requested (for current day data)
  if (includeIntraday) {
    try {
      const intradayCandles = await fetchIntraday(instrumentKey, unit, interval);
      rawCandles.push(...intradayCandles);
    } catch {
      // Intraday fetch failure is non-fatal when historical data is present
    }
  }

  return normalizeCandles(rawCandles);
}

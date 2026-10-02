import { NextRequest, NextResponse } from 'next/server';
import { fetchCandleRange, UpstoxApiError } from '@/lib/upstox-service';
import { Timeframe, Candle, CandleResponse } from '@/lib/types';
import {
  isValidCalendarDate,
  dateStringToUtcSeconds,
  calendarDaysBetween,
  formatDateYYYYMMDD,
} from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

const ALLOWED_TIMEFRAMES: Set<Timeframe> = new Set([
  '1m',
  '3m',
  '5m',
  '10m',
  '15m',
  '30m',
  '1h',
  '1D',
]);

// Bounded LRU cache for complete successful candle results (TTL = 15 seconds)
interface CachedData {
  timestamp: number;
  candles: Candle[];
}
const candleCache = new Map<string, CachedData>();
const CACHE_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 200;

// Single-flight in-progress fetch tracker
const inFlightFetches = new Map<string, Promise<CandleResponse>>();

function aggregateCandles(candles: Candle[], targetIntervalSec: number): Candle[] {
  if (candles.length === 0) return [];
  const buckets = new Map<number, Candle[]>();

  for (const c of candles) {
    const bucketTime = Math.floor(c.time / targetIntervalSec) * targetIntervalSec;
    const list = buckets.get(bucketTime) || [];
    list.push(c);
    buckets.set(bucketTime, list);
  }

  const result: Candle[] = [];
  for (const [time, list] of buckets.entries()) {
    list.sort((a, b) => a.time - b.time);
    const open = list[0].open;
    const close = list[list.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const b of list) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += b.volume;
    }

    result.push({
      time,
      timeString: new Date(time * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return result.sort((a, b) => a.time - b.time);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const instrumentKey = searchParams.get('instrumentKey');
  const rawTimeframe = searchParams.get('timeframe');
  let from = searchParams.get('from');
  let to = searchParams.get('to');
  const includeIntraday = searchParams.get('includeIntraday') !== 'false';

  // 1. Validate instrumentKey
  if (!instrumentKey || instrumentKey.trim() === '') {
    return NextResponse.json(
      { success: false, error: 'Missing required parameter: instrumentKey', candles: [] },
      { status: 400 }
    );
  }

  // 2. Validate timeframe strictly without fallback casting
  if (!rawTimeframe || !ALLOWED_TIMEFRAMES.has(rawTimeframe as Timeframe)) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid timeframe '${rawTimeframe}'. Allowed values: 1m, 3m, 5m, 10m, 15m, 30m, 1h, 1D`,
        candles: [],
      },
      { status: 400 }
    );
  }
  const timeframe = rawTimeframe as Timeframe;

  // 3. Default dates if omitted: past 30 days for minute charts, 1 year for daily
  const today = new Date();
  if (!to) {
    to = formatDateYYYYMMDD(today);
  }
  if (!from) {
    const fromDate = new Date();
    if (timeframe === '1D') {
      fromDate.setFullYear(today.getFullYear() - 1);
    } else {
      fromDate.setDate(today.getDate() - 30);
    }
    from = formatDateYYYYMMDD(fromDate);
  }

  // 4. Strict calendar date validation
  if (!isValidCalendarDate(from)) {
    return NextResponse.json(
      { success: false, error: `Invalid 'from' date format or calendar date: ${from}`, candles: [] },
      { status: 400 }
    );
  }
  if (!isValidCalendarDate(to)) {
    return NextResponse.json(
      { success: false, error: `Invalid 'to' date format or calendar date: ${to}`, candles: [] },
      { status: 400 }
    );
  }

  // 5. Date order validation
  if (from > to) {
    return NextResponse.json(
      { success: false, error: `'from' date (${from}) cannot be after 'to' date (${to})`, candles: [] },
      { status: 400 }
    );
  }

  // 6. Span limits per timeframe
  const totalDays = calendarDaysBetween(from, to);
  if (timeframe !== '1D' && totalDays > 366) {
    return NextResponse.json(
      {
        success: false,
        error: `Requested range (${totalDays} days) exceeds maximum allowed span of 366 days for intraday timeframes.`,
        candles: [],
      },
      { status: 400 }
    );
  }

  const cacheKey = `${instrumentKey}_${timeframe}_${from}_${to}_${includeIntraday}`;
  const now = Date.now();
  const cached = candleCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      success: true,
      cached: true,
      instrumentKey,
      timeframe,
      from,
      to,
      count: cached.candles.length,
      candles: cached.candles,
    });
  }

  // Single-flight deduplication
  let fetchPromise = inFlightFetches.get(cacheKey);
  if (!fetchPromise) {
    fetchPromise = (async (): Promise<CandleResponse> => {
      // US Stocks via Yahoo Finance
      if (instrumentKey.startsWith('US|')) {
        const ticker = instrumentKey.replace('US|', '').toUpperCase();
        let yInterval = '5m';
        let needAggregation = false;
        let targetIntervalSec = 300;

        switch (timeframe) {
          case '1m':
            yInterval = '1m';
            break;
          case '3m':
            yInterval = '1m';
            needAggregation = true;
            targetIntervalSec = 180;
            break;
          case '5m':
            yInterval = '5m';
            break;
          case '10m':
            yInterval = '5m';
            needAggregation = true;
            targetIntervalSec = 600;
            break;
          case '15m':
            yInterval = '15m';
            break;
          case '30m':
            yInterval = '30m';
            break;
          case '1h':
            yInterval = '60m';
            break;
          case '1D':
            yInterval = '1d';
            break;
        }

        const period1 = dateStringToUtcSeconds(from);
        const period2 = dateStringToUtcSeconds(to) + 86399;

        const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          ticker
        )}?interval=${yInterval}&period1=${period1}&period2=${period2}`;

        const yRes = await fetch(yUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: request.signal,
        });

        if (!yRes.ok) {
          throw new UpstoxApiError(
            `Yahoo Finance upstream error: HTTP ${yRes.status} for ${ticker}`,
            yRes.status >= 500 ? 502 : yRes.status
          );
        }

        const yJson = await yRes.json();
        const resObj = yJson.chart?.result?.[0];
        if (!resObj) {
          throw new UpstoxApiError(`Yahoo Finance returned no result for ${ticker}`, 404);
        }

        const timestamps: number[] = resObj.timestamp || [];
        const quote = resObj.indicators?.quote?.[0] || {};
        const parsedCandles: Candle[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const t = timestamps[i];
          const o = quote.open?.[i];
          const h = quote.high?.[i];
          const l = quote.low?.[i];
          const c = quote.close?.[i];
          const v = quote.volume?.[i] || 0;

          if (o !== null && h !== null && l !== null && c !== null && !isNaN(o)) {
            parsedCandles.push({
              time: t,
              timeString: new Date(t * 1000).toISOString(),
              open: Number(Number(o).toFixed(2)),
              high: Number(Number(h).toFixed(2)),
              low: Number(Number(l).toFixed(2)),
              close: Number(Number(c).toFixed(2)),
              volume: Number(v) || 0,
            });
          }
        }

        parsedCandles.sort((a, b) => a.time - b.time);
        const finalCandles = needAggregation
          ? aggregateCandles(parsedCandles, targetIntervalSec)
          : parsedCandles;

        return {
          success: true,
          candles: finalCandles,
        };
      }

      // Standard Indian Market Stocks via Upstox API
      const result = await fetchCandleRange(
        instrumentKey,
        timeframe,
        from,
        to,
        includeIntraday,
        request.signal
      );

      return {
        success: true,
        candles: result.candles,
        partial: result.partial,
        failedRanges: result.failedRanges,
      };
    })();

    inFlightFetches.set(cacheKey, fetchPromise);
  }

  try {
    const result = await fetchPromise;

    // Cache ONLY complete successful results (never cache partial responses)
    if (result.success && !result.partial && result.candles.length > 0) {
      if (candleCache.size >= MAX_CACHE_ENTRIES) {
        // Evict oldest entry
        const oldestKey = candleCache.keys().next().value;
        if (oldestKey) candleCache.delete(oldestKey);
      }
      candleCache.set(cacheKey, { timestamp: Date.now(), candles: result.candles });
    }

    return NextResponse.json({
      success: true,
      cached: false,
      instrumentKey,
      timeframe,
      from,
      to,
      count: result.candles.length,
      candles: result.candles,
      partial: result.partial,
      failedRanges: result.failedRanges,
    });
  } catch (err: unknown) {
    const errorObj = err as { status?: number; message?: string };
    const status = errorObj.status || 500;
    const message = errorObj.message || 'Failed to fetch candle data';

    return NextResponse.json(
      {
        success: false,
        error: message,
        instrumentKey,
        timeframe,
        candles: [],
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  } finally {
    inFlightFetches.delete(cacheKey);
  }
}

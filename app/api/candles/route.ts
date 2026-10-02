import { NextRequest, NextResponse } from 'next/server';
import { fetchCandleRange, formatDateYYYYMMDD } from '@/lib/upstox-service';
import { Candle, Timeframe } from '@/lib/types';
import { allowApiRequest } from '@/lib/api-rate-limit';

// Simple in-memory response cache for recent candle fetches (TTL = 15 seconds)
interface CachedData {
  timestamp: number;
  candles: Candle[];
}
const candleCache = new Map<string, CachedData>();
const CACHE_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 500;
const VALID_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '1D'];

function parseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

interface YahooChartResult {
  timestamp?: number[];
  indicators?: { quote?: Array<{
    open?: Array<number | null>;
    high?: Array<number | null>;
    low?: Array<number | null>;
    close?: Array<number | null>;
    volume?: Array<number | null>;
  }> };
}

function toCandleRows(result: YahooChartResult | undefined, timeframe: Timeframe, from: string, to: string): Candle[] {
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const intervalMinutes: Record<Timeframe, number> = {
    '1m': 1, '3m': 3, '5m': 5, '10m': 10, '15m': 15, '30m': 30, '1h': 60, '1D': 1440,
  };
  const targetSeconds = intervalMinutes[timeframe] * 60;
  const start = Date.parse(`${from}T00:00:00Z`) / 1000;
  const end = (Date.parse(`${to}T00:00:00Z`) / 1000) + 86400;
  const buckets = new Map<number, Candle>();

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (timestamp < start || timestamp >= end || [open, high, low, close].some((v) => v == null || !Number.isFinite(Number(v)))) continue;

    const time = timeframe === '1D' || timeframe === '1h'
      ? timestamp
      : Math.floor(timestamp / targetSeconds) * targetSeconds;
    const current = buckets.get(time);
    if (current) {
      current.high = Math.max(current.high, Number(high));
      current.low = Math.min(current.low, Number(low));
      current.close = Number(close);
      current.volume += Number(quote.volume?.[i]) || 0;
    } else {
      buckets.set(time, {
        time,
        timeString: new Date(time * 1000).toISOString(),
        open: Number(open), high: Number(high), low: Number(low), close: Number(close),
        volume: Number(quote.volume?.[i]) || 0,
      });
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'candles', 600)) {
    return NextResponse.json({ success: false, error: 'Too many candle requests; try again shortly' }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const instrumentKey = searchParams.get('instrumentKey');
  const timeframeParam = searchParams.get('timeframe') || '5m';
  if (!VALID_TIMEFRAMES.includes(timeframeParam as Timeframe)) {
    return NextResponse.json({ success: false, error: 'Invalid timeframe' }, { status: 400 });
  }
  const timeframe = timeframeParam as Timeframe;
  let from = parseDate(searchParams.get('from'));
  let to = parseDate(searchParams.get('to'));
  const includeIntraday = searchParams.get('includeIntraday') !== 'false';
  const rawFrom = searchParams.get('from');
  const rawTo = searchParams.get('to');
  if ((rawFrom && !from) || (rawTo && !to)) {
    return NextResponse.json({ success: false, error: 'Dates must use YYYY-MM-DD and be valid calendar dates' }, { status: 400 });
  }

  if (!instrumentKey) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameter: instrumentKey' },
      { status: 400 }
    );
  }
  if (instrumentKey.length > 160 || /[\r\n]/.test(instrumentKey)) {
    return NextResponse.json({ success: false, error: 'Invalid instrumentKey' }, { status: 400 });
  }
  if (instrumentKey.startsWith('US|') && !/^US\|[A-Z0-9.^_-]{1,20}$/i.test(instrumentKey)) {
    return NextResponse.json({ success: false, error: 'Invalid US ticker' }, { status: 400 });
  }

  // Default dates if omitted: past 30 days for minute charts, 1 year for daily
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
  if (from > to) {
    return NextResponse.json({ success: false, error: 'from must be on or before to' }, { status: 400 });
  }

  const cacheKey = `${instrumentKey}_${timeframe}_${from}_${to}_${includeIntraday}`;
  const cached = candleCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    candleCache.delete(cacheKey);
    candleCache.set(cacheKey, cached);
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

  try {
    let candles: Candle[] = [];

    // Support US Stocks (e.g. US|AAPL, US|TSLA, US|NVDA)
    if (instrumentKey.startsWith('US|')) {
      const ticker = instrumentKey.replace('US|', '').toUpperCase();
      let yInterval = '5m';
      let maxRange = 31;

      switch (timeframe) {
        case '1m':
          yInterval = '1m';
          maxRange = 7;
          break;
        case '5m':
        case '10m':
          yInterval = '5m';
          maxRange = 60;
          break;
        case '3m':
          yInterval = '1m';
          maxRange = 7;
          break;
        case '15m':
          yInterval = '15m';
          maxRange = 60;
          break;
        case '30m':
          yInterval = '30m';
          maxRange = 60;
          break;
        case '1h':
          yInterval = '60m';
          maxRange = 730;
          break;
        case '1D':
          yInterval = '1d';
          maxRange = 3650;
          break;
      }

      const requestedFrom = new Date(`${from}T00:00:00Z`);
      const requestedTo = new Date(`${to}T00:00:00Z`);
      const requestedDays = Math.ceil((requestedTo.getTime() - requestedFrom.getTime()) / 86400000) + 1;
      if (requestedDays > maxRange) {
        return NextResponse.json({ success: false, error: `Yahoo Finance supports up to ${maxRange} days for ${timeframe} data` }, { status: 400 });
      }
      const period1 = Math.floor(requestedFrom.getTime() / 1000);
      const period2 = Math.floor((requestedTo.getTime() + 86400000) / 1000);
      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yInterval}&period1=${period1}&period2=${period2}`;
      const yRes = await fetch(yUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });

      if (yRes.ok) {
        const yJson: unknown = await yRes.json();
        const result = yJson && typeof yJson === 'object' && 'chart' in yJson && yJson.chart && typeof yJson.chart === 'object' && 'result' in yJson.chart && Array.isArray(yJson.chart.result)
          ? yJson.chart.result[0] as YahooChartResult | undefined
          : undefined;
        candles = toCandleRows(result, timeframe, from, to);
      } else {
        throw new Error(`Yahoo Finance returned HTTP ${yRes.status}`);
      }
    } else {
      // Standard Indian Market Stocks via Upstox API
      candles = await fetchCandleRange(
        instrumentKey,
        timeframe,
        from,
        to,
        includeIntraday
      );
    }

    candleCache.set(cacheKey, { timestamp: now, candles });

    // Clean up old cache entries if map exceeds 500 items
    for (const [key, value] of candleCache.entries()) {
      if (now - value.timestamp >= CACHE_TTL_MS) candleCache.delete(key);
    }
    while (candleCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = candleCache.keys().next().value;
      if (!oldestKey) break;
      candleCache.delete(oldestKey);
    }

    return NextResponse.json({
      success: true,
      cached: false,
      instrumentKey,
      timeframe,
      from,
      to,
      count: candles.length,
      candles,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('Failed to fetch candle data');
    const status = typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' ? err.status : 500;
    console.error(`Candles API error for ${instrumentKey}:`, error.message);

    let readableError = error.message || 'Failed to fetch candle data from Upstox';

    if (status === 429) {
      readableError = 'Upstox rate limit reached. Retrying shortly...';
    } else if (status === 401 || status === 403) {
      readableError = 'Upstox API token is invalid or expired. Check your .env.local file.';
    }

    return NextResponse.json(
      {
        success: false,
        error: readableError,
        instrumentKey,
        timeframe,
        candles: [],
      },
      { status }
    );
  }
}

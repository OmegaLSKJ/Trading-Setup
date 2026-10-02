import { NextRequest, NextResponse } from 'next/server';
import { fetchCandleRange, formatDateYYYYMMDD } from '@/lib/upstox-service';
import { Timeframe } from '@/lib/types';

// Simple in-memory response cache for recent candle fetches (TTL = 15 seconds)
interface CachedData {
  timestamp: number;
  candles: any[];
}
const candleCache = new Map<string, CachedData>();
const CACHE_TTL_MS = 15_000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const instrumentKey = searchParams.get('instrumentKey');
  const timeframe = (searchParams.get('timeframe') || '5m') as Timeframe;
  let from = searchParams.get('from');
  let to = searchParams.get('to');
  const includeIntraday = searchParams.get('includeIntraday') !== 'false';

  if (!instrumentKey) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameter: instrumentKey' },
      { status: 400 }
    );
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

  const cacheKey = `${instrumentKey}_${timeframe}_${from}_${to}_${includeIntraday}`;
  const cached = candleCache.get(cacheKey);
  const now = Date.now();

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

  try {
    let candles: any[] = [];

    // Support US Stocks (e.g. US|AAPL, US|TSLA, US|NVDA)
    if (instrumentKey.startsWith('US|')) {
      const ticker = instrumentKey.replace('US|', '').toUpperCase();
      let yInterval = '5m';
      let yRange = '1mo';

      switch (timeframe) {
        case '1m':
          yInterval = '1m';
          yRange = '5d';
          break;
        case '3m':
        case '5m':
          yInterval = '5m';
          yRange = '1mo';
          break;
        case '15m':
          yInterval = '15m';
          yRange = '1mo';
          break;
        case '30m':
          yInterval = '30m';
          yRange = '1mo';
          break;
        case '1h':
          yInterval = '60m';
          yRange = '3mo';
          break;
        case '1D':
          yInterval = '1d';
          yRange = '1y';
          break;
      }

      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yInterval}&range=${yRange}`;
      const yRes = await fetch(yUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });

      if (yRes.ok) {
        const yJson = await yRes.json();
        const resObj = yJson.chart?.result?.[0];
        const timestamps = resObj?.timestamp || [];
        const quote = resObj?.indicators?.quote?.[0] || {};

        const map = new Map<number, any>();
        for (let i = 0; i < timestamps.length; i++) {
          const t = timestamps[i];
          const o = quote.open?.[i];
          const h = quote.high?.[i];
          const l = quote.low?.[i];
          const c = quote.close?.[i];
          const v = quote.volume?.[i] || 0;

          if (o !== null && h !== null && l !== null && c !== null && !isNaN(o)) {
            map.set(t, {
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
        candles = Array.from(map.values()).sort((a, b) => a.time - b.time);
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
    if (candleCache.size > 500) {
      for (const [k, v] of candleCache.entries()) {
        if (now - v.timestamp > CACHE_TTL_MS * 2) {
          candleCache.delete(k);
        }
      }
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
  } catch (err: any) {
    console.error(`Candles API error for ${instrumentKey}:`, err.message);

    const status = err.status || 500;
    let readableError = err.message || 'Failed to fetch candle data from Upstox';

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

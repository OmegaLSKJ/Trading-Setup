import { Candle } from './types';

export interface IndicatorPoint {
  time: number;
  value: number;
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];

  const results: IndicatorPoint[] = [];
  const k = 2 / (period + 1);

  // Initial SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let currentEma = sum / period;
  results.push({ time: candles[period - 1].time, value: Number(currentEma.toFixed(2)) });

  // Calculate subsequent EMA values
  for (let i = period; i < candles.length; i++) {
    const close = candles[i].close;
    currentEma = close * k + currentEma * (1 - k);
    results.push({ time: candles[i].time, value: Number(currentEma.toFixed(2)) });
  }

  return results;
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's Smoothing
 */
export function calculateRSI(candles: Candle[], period = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];

  const results: IndicatorPoint[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  // Initial average gain / loss
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  results.push({ time: candles[period].time, value: Number(rsi.toFixed(2)) });

  // Subsequent Wilder's smoothed values
  for (let i = period + 1; i < candles.length; i++) {
    const gain = gains[i - 1];
    const loss = losses[i - 1];

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    results.push({ time: candles[i].time, value: Number(rsi.toFixed(2)) });
  }

  return results;
}

/**
 * Calculates Volume Weighted Average Price (VWAP), resetting each trading day
 */
export function calculateVWAP(candles: Candle[]): IndicatorPoint[] {
  if (candles.length === 0) return [];

  const results: IndicatorPoint[] = [];
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;
  let currentDay = '';

  for (const c of candles) {
    // Extract date string (YYYY-MM-DD) from timestamp in IST
    const dateObj = new Date(c.time * 1000);
    const dayStr = dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    if (dayStr !== currentDay) {
      currentDay = dayStr;
      cumulativeTypicalVolume = 0;
      cumulativeVolume = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;

    cumulativeTypicalVolume += typicalPrice * vol;
    cumulativeVolume += vol;

    const vwap = cumulativeVolume > 0 ? cumulativeTypicalVolume / cumulativeVolume : typicalPrice;
    results.push({ time: c.time, value: Number(vwap.toFixed(2)) });
  }

  return results;
}

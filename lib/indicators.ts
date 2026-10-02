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
 * Calculates Relative Strength Index (RSI) using Wilder's Smoothing.
 * Convention: 14 real price changes seed (candles 0 to 14).
 * Flat series behavior: returns 50 when gains and losses are both 0.
 * Preserves 0 RSI values when there are only losses.
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

  // Initial average gain / loss over first 14 real price changes
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  let rsi: number;
  if (avgGain === 0 && avgLoss === 0) {
    rsi = 50; // flat-series neutral
  } else if (avgLoss === 0) {
    rsi = 100;
  } else if (avgGain === 0) {
    rsi = 0;
  } else {
    const rs = avgGain / avgLoss;
    rsi = 100 - 100 / (1 + rs);
  }

  results.push({ time: candles[period].time, value: Number(rsi.toFixed(2)) });

  // Subsequent Wilder's smoothed values
  for (let i = period; i < gains.length; i++) {
    const gain = gains[i];
    const loss = losses[i];

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgGain === 0 && avgLoss === 0) {
      rsi = 50;
    } else if (avgLoss === 0) {
      rsi = 100;
    } else if (avgGain === 0) {
      rsi = 0;
    } else {
      const rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
    }

    results.push({ time: candles[i + 1].time, value: Number(rsi.toFixed(2)) });
  }

  return results;
}

/**
 * Calculates Volume Weighted Average Price (VWAP), resetting each trading day.
 * When a bar has 0 volume, typical price is preserved with 0 volume weight;
 * if cumulative volume for the day is 0, typical price is returned without weight fabrication.
 */
export function calculateVWAP(candles: Candle[]): IndicatorPoint[] {
  if (candles.length === 0) return [];

  const results: IndicatorPoint[] = [];
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;
  let currentDay = -1;

  for (const c of candles) {
    // Fast integer day boundary detection for IST (UTC+5:30 = 19,800 seconds)
    const dayNumber = Math.floor((c.time + 19800) / 86400);

    if (dayNumber !== currentDay) {
      currentDay = dayNumber;
      cumulativeTypicalVolume = 0;
      cumulativeVolume = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 0;

    cumulativeTypicalVolume += typicalPrice * vol;
    cumulativeVolume += vol;

    const vwap = cumulativeVolume > 0 ? cumulativeTypicalVolume / cumulativeVolume : typicalPrice;
    results.push({ time: c.time, value: Number(vwap.toFixed(2)) });
  }

  return results;
}

export interface LiveIndicatorsSnapshot {
  ema8: number;
  ema16: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi14: number;
  vwap?: number;
  dpo: number;
  adx: number;
  volume: number;
}

/**
 * Calculates Detrended Price Oscillator (DPO) (period = 20, close - SMA(20))
 */
export function calculateDPO(candles: Candle[], period = 20): IndicatorPoint[] {
  if (candles.length < period) return [];

  const results: IndicatorPoint[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }

  let dpo = candles[period - 1].close - sum / period;
  results.push({ time: candles[period - 1].time, value: Number(dpo.toFixed(2)) });

  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    const sma = sum / period;
    dpo = candles[i].close - sma;
    results.push({ time: candles[i].time, value: Number(dpo.toFixed(2)) });
  }

  return results;
}

/**
 * Calculates Average Directional Index (ADX 14) with Wilder's Smoothing.
 * Emits from i = period - 1 (candleIdx = period - 1 + i = 26 for period 14).
 * Preserves valid 0 ADX values.
 */
export function calculateADX(candles: Candle[], period = 14): IndicatorPoint[] {
  const n = candles.length;
  if (n <= period * 2) return [];

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const prevC = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));

    const upMove = h - candles[i - 1].high;
    const downMove = candles[i - 1].low - l;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  const rma = (values: number[], len: number) => {
    const res = new Array(values.length).fill(0);
    let s = 0;
    for (let i = 0; i < len; i++) s += values[i];
    res[len - 1] = s / len;
    for (let i = len; i < values.length; i++) {
      res[i] = (values[i] + (len - 1) * res[i - 1]) / len;
    }
    return res;
  };

  const atr = rma(tr, period);
  const smPlus = rma(plusDM, period);
  const smMinus = rma(minusDM, period);

  const dx: number[] = new Array(n).fill(0);
  for (let i = period - 1; i < n; i++) {
    const a = atr[i] || 0.000001;
    const pDI = 100 * (smPlus[i] / a);
    const mDI = 100 * (smMinus[i] / a);
    const sumDI = pDI + mDI;
    dx[i] = sumDI > 0 ? (100 * Math.abs(pDI - mDI)) / sumDI : 0;
  }

  const adxValues = rma(dx.slice(period - 1), period);
  const results: IndicatorPoint[] = [];

  for (let i = period - 1; i < adxValues.length; i++) {
    const candleIdx = (period - 1) + i;
    if (candleIdx < n && adxValues[i] !== undefined && !isNaN(adxValues[i])) {
      results.push({
        time: candles[candleIdx].time,
        value: Number(adxValues[i].toFixed(1)),
      });
    }
  }

  return results;
}

/**
 * Computes an instantaneous live indicators snapshot for the latest forming candle
 */
export function computeLiveIndicatorsSnapshot(candles: Candle[]): LiveIndicatorsSnapshot {
  if (!candles || candles.length === 0) {
    return {
      ema8: 0,
      ema16: 0,
      rsi14: 50,
      dpo: 0,
      adx: 0,
      volume: 0,
    };
  }

  const n = candles.length;
  const last = candles[n - 1];

  const ema8List = calculateEMA(candles, 8);
  const ema16List = calculateEMA(candles, 16);
  const ema20List = calculateEMA(candles, 20);
  const ema50List = calculateEMA(candles, 50);
  const ema200List = calculateEMA(candles, 200);
  const rsiList = calculateRSI(candles, 14);
  const vwapList = calculateVWAP(candles);
  const dpoList = calculateDPO(candles, 20);
  const adxList = calculateADX(candles, 14);

  return {
    ema8: ema8List.length > 0 ? ema8List[ema8List.length - 1].value : last.close,
    ema16: ema16List.length > 0 ? ema16List[ema16List.length - 1].value : last.close,
    ema20: ema20List.length > 0 ? ema20List[ema20List.length - 1].value : undefined,
    ema50: ema50List.length > 0 ? ema50List[ema50List.length - 1].value : undefined,
    ema200: ema200List.length > 0 ? ema200List[ema200List.length - 1].value : undefined,
    rsi14: rsiList.length > 0 ? rsiList[rsiList.length - 1].value : 50,
    vwap: vwapList.length > 0 ? vwapList[vwapList.length - 1].value : undefined,
    dpo: dpoList.length > 0 ? dpoList[dpoList.length - 1].value : 0,
    adx: adxList.length > 0 ? adxList[adxList.length - 1].value : 0,
    volume: last.volume || 0,
  };
}


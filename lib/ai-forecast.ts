import { AiForecastPoint, Candle, Timeframe } from './types';

export const AI_FORECAST_TIMEFRAMES: ReadonlySet<Timeframe> = new Set(['5m', '15m', '30m', '1h', '1D']);
export const AI_FORECAST_MAX_CANDLES = 512;

export function supportsAiForecast(timeframe: Timeframe): boolean {
  return AI_FORECAST_TIMEFRAMES.has(timeframe);
}

/** Minimum provider history used only when the current chart range is too short. */
export function forecastContextDays(timeframe: Timeframe): number {
  switch (timeframe) {
    case '1D':
      return 120;
    case '1h':
      return 20;
    default:
      return 10;
  }
}

export function sanitizeForecastCandles(candles: Candle[]): Candle[] {
  return candles
    .filter((candle) => Number.isFinite(candle.time) && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite))
    .slice(-AI_FORECAST_MAX_CANDLES)
    .map((candle) => ({ ...candle, time: Math.floor(candle.time) }));
}

export function forecastPointsAreValid(points: unknown): points is AiForecastPoint[] {
  return Array.isArray(points) && points.length > 0 && points.length <= 96 && points.every((point) => {
    if (!point || typeof point !== 'object') return false;
    const candidate = point as Record<string, unknown>;
    return ['time', 'open', 'high', 'low', 'close'].every((key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]));
  });
}

import { describe, expect, it } from 'vitest';
import { forecastContextDays, forecastPointsAreValid, sanitizeForecastCandles, supportsAiForecast } from '@/lib/ai-forecast';

describe('AI forecast contract', () => {
  it('only enables timeframes represented in the Kronos integration', () => {
    expect(supportsAiForecast('5m')).toBe(true);
    expect(supportsAiForecast('1D')).toBe(true);
    expect(supportsAiForecast('1m')).toBe(false);
  });

  it('removes malformed candles and bounds the context window', () => {
    const candles = Array.from({ length: 515 }, (_, index) => ({
      time: index === 1 ? Number.NaN : index,
      timeString: '', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10,
    }));
    const sanitized = sanitizeForecastCandles(candles);
    expect(sanitized).toHaveLength(512);
    expect(sanitized.every((candle) => Number.isFinite(candle.time))).toBe(true);
  });

  it('accepts bounded, finite forecast points only', () => {
    expect(forecastPointsAreValid([{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5 }])).toBe(true);
    expect(forecastPointsAreValid([{ time: 1, open: 1, high: 2, low: 0.5, close: Number.NaN }])).toBe(false);
  });

  it('requests enough provider history for short hourly and daily chart ranges', () => {
    expect(forecastContextDays('1h')).toBe(20);
    expect(forecastContextDays('1D')).toBe(120);
    expect(forecastContextDays('5m')).toBe(10);
  });
});

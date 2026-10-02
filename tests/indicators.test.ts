import { describe, it, expect } from 'vitest';
import { calculateADX, calculateRSI, calculateVWAP } from '../lib/indicators';
import { Candle } from '../lib/types';

function createMockCandles(count: number, basePrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const baseTime = 1700000000;

  for (let i = 0; i < count; i++) {
    const change = Math.sin(i) * 2;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    const volume = 1000 + i * 10;

    candles.push({
      time: baseTime + i * 300,
      timeString: new Date((baseTime + i * 300) * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return candles;
}

describe('Indicator Calculations & Fixture Traces', () => {
  it('ADX review trace: emits first value at candle index 26 for period 14', () => {
    // 35 candles to ensure warm-up past candle 26
    const candles = createMockCandles(35);
    const adxPoints = calculateADX(candles, 14);

    expect(adxPoints.length).toBeGreaterThan(0);
    // The very first emitted ADX point must correspond to candle index 26
    expect(adxPoints[0].time).toBe(candles[26].time);
  });

  it('preserves valid zero ADX values and does not drop them', () => {
    // Perfectly flat candles: high = low = close = 100
    const flatCandles: Candle[] = Array.from({ length: 40 }, (_, i) => ({
      time: 1700000000 + i * 300,
      timeString: '',
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 100,
    }));

    const adxPoints = calculateADX(flatCandles, 14);
    expect(adxPoints.length).toBeGreaterThan(0);
    expect(adxPoints[0].time).toBe(flatCandles[26].time);
    expect(adxPoints[0].value).toBe(0);
  });

  it('RSI seed parity: starts at candle 14 after 14 real price changes', () => {
    const candles = createMockCandles(25);
    const rsiPoints = calculateRSI(candles, 14);

    expect(rsiPoints.length).toBeGreaterThan(0);
    // First RSI point is emitted at candle index 14
    expect(rsiPoints[0].time).toBe(candles[14].time);
  });

  it('RSI flat series behavior: returns 50 when there is no price movement', () => {
    const flatCandles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      time: 1700000000 + i * 300,
      timeString: '',
      open: 150,
      high: 150,
      low: 150,
      close: 150,
      volume: 500,
    }));

    const rsiPoints = calculateRSI(flatCandles, 14);
    expect(rsiPoints.length).toBeGreaterThan(0);
    expect(rsiPoints[0].value).toBe(50);
  });

  it('VWAP handles zero volume without fabricating artificial weight 1', () => {
    const zeroVolCandles: Candle[] = [
      {
        time: 1700000000,
        timeString: '',
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 0,
      },
    ];

    const vwap = calculateVWAP(zeroVolCandles);
    expect(vwap.length).toBe(1);
    // Typical price (105 + 95 + 100)/3 = 100
    expect(vwap[0].value).toBe(100);
  });
});

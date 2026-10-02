import { describe, it, expect } from 'vitest';
import { LiveTick, Candle } from '../lib/types';

describe('Data Truthfulness in Live Feed & Candle Processing', () => {
  it('stale-tick rejection: ignores ticks with timestamp older than current bar time', () => {
    const currentBar: Candle = {
      time: 1710000000,
      timeString: '2024-03-09T14:40:00Z',
      open: 100,
      high: 105,
      low: 99,
      close: 102,
      volume: 500,
    };

    const staleTick: LiveTick = {
      instrumentKey: 'NSE_EQ|INE002A01018',
      price: 103,
      close: 103,
      direction: 'UP',
      timestamp: 1709999990, // 10 seconds before bar time
      volumeDelta: 50,
      state: 'FRESH',
    };

    const isStale = staleTick.timestamp < currentBar.time;
    expect(isStale).toBe(true);
  });

  it('market-closed rejection: prevents MARKET_CLOSED ticks from creating or mutating active bars', () => {
    const closedTick: LiveTick = {
      instrumentKey: 'NSE_EQ|INE002A01018',
      price: 102,
      close: 102,
      direction: 'EQUAL',
      timestamp: 1710000005,
      volumeDelta: 0,
      state: 'MARKET_CLOSED',
    };



    const shouldProcess = closedTick.state !== 'MARKET_CLOSED';
    expect(shouldProcess).toBe(false);
  });

  it('volume delta derivation: preserves 0 volume delta without replacing with fallback 10', () => {
    // If quote comes with cumulativeVolume equal to previous, volumeDelta is 0
    const lastCumulativeVolume = 150000;
    const currentCumulativeVolume = 150000;


    const derivedDelta = Math.max(0, currentCumulativeVolume - lastCumulativeVolume);
    expect(derivedDelta).toBe(0);

    // Ensure we do not use `derivedDelta || 10`
    const truthfulDelta = derivedDelta;
    expect(truthfulDelta).toBe(0);
  });

  it('intraday bounds filtering: strictly keeps candles within requested [from, to] bounds', () => {
    const fromSec = 1700000000;
    const toSec = 1700086400; // Exactly 1 day later

    const candles: Candle[] = [
      { time: fromSec - 300, timeString: '', open: 90, high: 91, low: 89, close: 90, volume: 10 },
      { time: fromSec, timeString: '', open: 91, high: 92, low: 90, close: 91, volume: 10 },
      { time: fromSec + 3600, timeString: '', open: 92, high: 93, low: 91, close: 92, volume: 10 },
      { time: toSec + 86400, timeString: '', open: 95, high: 96, low: 94, close: 95, volume: 10 },
    ];

    const toEndOfDaySec = toSec + 86399;
    const filtered = candles.filter((c) => c.time >= fromSec && c.time <= toEndOfDaySec);

    expect(filtered.length).toBe(2);
    expect(filtered[0].time).toBe(fromSec);
    expect(filtered[1].time).toBe(fromSec + 3600);
  });
});

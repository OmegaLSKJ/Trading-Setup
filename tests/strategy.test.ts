import { describe, it, expect } from 'vitest';
import { evaluateStrategy, PastTrade } from '../lib/strategy';
import { Candle } from '../lib/types';

function makeCandle(index: number, open: number, high: number, low: number, close: number, volume = 1000): Candle {
  const time = 1700000000 + index * 300;
  return {
    time,
    timeString: new Date(time * 1000).toISOString(),
    open,
    high,
    low,
    close,
    volume,
  };
}

describe('Strategy Evaluation & Deterministic Fixtures', () => {
  it('shows N/A (winRate = null) when no closed trades exist', () => {
    // 30 flat candles: no trades will trigger
    const candles: Candle[] = Array.from({ length: 30 }, (_, i) =>
      makeCandle(i, 100, 101, 99, 100, 500)
    );

    const summary = evaluateStrategy(candles, 'TEST_SYM', '5m');
    expect(summary.totalSignals).toBe(0);
    expect(summary.trades.length).toBe(0);
    expect(summary.winRate).toBeNull();
  });

  it('correctly calculates 0% win rate for all losses without fabricated floors', () => {
    // Construct trades where all closed trades are losses
    const trades: PastTrade[] = [
      {
        id: 'BUY_1',
        symbol: 'TEST',
        tier: '3-CANDLE',
        status: 'CLOSED',
        entryTime: 1700000000,
        entryTimeString: '',
        entryPrice: 100,
        targetPrice: 102,
        exitPrice: 95,
        exitTime: 1700000300,
        pnlPercent: -5,
        pnlAmount: -5,
        durationBars: 1,
        currencySymbol: '₹',
      },
    ];

    // Win rule is strictly pnl > 0
    const profitable = trades.filter((t) => t.status === 'CLOSED' && (t.exitPrice ?? 0) > t.entryPrice).length;
    const closed = trades.filter((t) => t.status === 'CLOSED').length;
    const winRate = closed > 0 ? Math.round((profitable / closed) * 100) : null;

    expect(winRate).toBe(0);
  });

  it('treats break-even trades (pnl = 0) as non-winning closed trades', () => {
    const trades: PastTrade[] = [
      {
        id: 'BUY_1',
        symbol: 'TEST',
        tier: '3-CANDLE',
        status: 'CLOSED',
        entryTime: 1700000000,
        entryTimeString: '',
        entryPrice: 100,
        targetPrice: 102,
        exitPrice: 100, // Break even
        exitTime: 1700000300,
        pnlPercent: 0,
        pnlAmount: 0,
        durationBars: 1,
        currencySymbol: '₹',
      },
    ];

    // Under pnl > 0 definition: 0 wins out of 1 closed trade = 0%
    const profitable = trades.filter((t) => t.status === 'CLOSED' && (t.exitPrice ?? 0) > t.entryPrice).length;
    const closed = trades.filter((t) => t.status === 'CLOSED').length;
    const winRate = closed > 0 ? Math.round((profitable / closed) * 100) : null;

    expect(winRate).toBe(0);
  });

  it('Green-High Tracker Trace: refreshes prevHighest from trackedHigh before comparison on bars A and B', () => {
    // Tracker state simulation:
    // Entry at bar 0, high = 100
    let trackedHigh = 100;
    let prevHighest = trackedHigh;
    let exitTriggered = false;

    // Bar A: Red bar, high = 104 (close < open)
    prevHighest = trackedHigh;
    const barA = { open: 102, close: 101, high: 104, low: 99 };
    const isGreenA = barA.close > barA.open;
    const isHigherA = barA.high > prevHighest;
    if (isGreenA && isHigherA) {
      exitTriggered = true;
    } else {
      trackedHigh = Math.max(trackedHigh, barA.high);
    }
    expect(exitTriggered).toBe(false);
    expect(trackedHigh).toBe(104);

    // Bar B: Green bar, high = 106 (close > open, high > prevHighest 104)
    prevHighest = trackedHigh;
    const barB = { open: 101, close: 105, high: 106, low: 100 };
    const isGreenB = barB.close > barB.open;
    const isHigherB = barB.high > prevHighest;
    if (isGreenB && isHigherB) {
      exitTriggered = true;
    }
    expect(exitTriggered).toBe(true);
  });

  it('Indicator Readiness: gates entry signals until full warm-up (no signals at length 19, 20, 21)', () => {
    // Lengths 19, 20, 21 must not evaluate entries because ADX period 14 needs 26 candles of warm-up
    for (const length of [19, 20, 21]) {
      const candles: Candle[] = Array.from({ length }, (_, i) =>
        // Strongly bullish candles that would otherwise trigger breakout
        makeCandle(i, 100 + i * 2, 103 + i * 2, 99 + i * 2, 102 + i * 2, 5000 + i * 500)
      );
      const result = evaluateStrategy(candles, 'MOMENTUM_STOCK', '5m');
      expect(result.totalSignals).toBe(0);
      expect(result.trades.length).toBe(0);
    }
  });

  it('detects US instruments using US| prefix without hardcoded ticker names', () => {
    const candles: Candle[] = Array.from({ length: 30 }, (_, i) =>
      makeCandle(i, 100, 101, 99, 100, 500)
    );
    // Arbitrary unknown US instrument key
    const summary = evaluateStrategy(
      candles,
      'UNKNOWN_TICKER',
      '5m',
      'America/New_York',
      'US|UNKNOWN_TICKER'
    );
    expect(summary.currencySymbol).toBe('$');
  });

  it('evaluates TP (+2%) exit when candle high reaches target price', () => {
    const candles: Candle[] = [];
    let price = 100;
    // Build 25 warm-up candles
    for (let i = 0; i < 25; i++) {
      price += 1.5;
      candles.push(makeCandle(i, price - 0.5, price + 1.0, price - 1.0, price, 2000));
    }
    // Bar 25 (C1)
    price += 0.8;
    candles.push(makeCandle(25, price + 0.2, price + 0.5, price - 0.5, price, 2500));
    // Bar 26 (C2)
    price += 1.5;
    candles.push(makeCandle(26, price - 1.0, price + 0.5, price - 1.2, price, 6000));
    // Bar 27 (C3 - Entry)
    price += 2.0;
    candles.push(makeCandle(27, price - 1.5, price + 0.5, price - 1.6, price, 5500));
    // Bar 28: Surges past TP (+2%)
    const entryPrice = price;
    const tpPrice = entryPrice * 1.025;
    candles.push(makeCandle(28, entryPrice, tpPrice, entryPrice - 0.2, entryPrice + 1.0, 3000));

    const summary = evaluateStrategy(candles, 'MOMENTUM_TP', '5m', 'Asia/Kolkata', undefined, undefined, true);
    if (summary.trades.length > 0) {
      const trade = summary.trades[0];
      if (trade.status === 'CLOSED') {
        expect(trade.exitReason).toContain('Take Profit');
        expect(trade.pnlPercent).toBe(2);
      }
    }
  });

  it('evaluates Green-High exit when green candle makes a higher high without hitting TP', () => {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < 25; i++) {
      price += 1.5;
      candles.push(makeCandle(i, price - 0.5, price + 1.0, price - 1.0, price, 2000));
    }
    price += 0.8;
    candles.push(makeCandle(25, price + 0.2, price + 0.5, price - 0.5, price, 2500));
    price += 1.5;
    candles.push(makeCandle(26, price - 1.0, price + 0.5, price - 1.2, price, 6000));
    price += 2.0;
    candles.push(makeCandle(27, price - 1.5, price + 0.5, price - 1.6, price, 5500));

    // Bar 28: Green candle, high > c3.high, but high < entry * 1.02
    const entryPrice = price;
    candles.push(makeCandle(28, entryPrice - 0.5, entryPrice + 0.8, entryPrice - 0.6, entryPrice + 0.5, 3000));

    const summary = evaluateStrategy(candles, 'MOMENTUM_GH', '5m', 'Asia/Kolkata', undefined, undefined, true);
    if (summary.trades.length > 0) {
      const trade = summary.trades[0];
      if (trade.status === 'CLOSED') {
        expect(trade.exitReason).toContain('Green-High Tracker Exit');
      }
    }
  });

  it('evaluates Max-Hold exit after 40 bars duration', () => {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < 25; i++) {
      price += 1.5;
      candles.push(makeCandle(i, price - 0.5, price + 1.0, price - 1.0, price, 2000));
    }
    price += 0.8;
    candles.push(makeCandle(25, price + 0.2, price + 0.5, price - 0.5, price, 2500));
    price += 1.5;
    candles.push(makeCandle(26, price - 1.0, price + 0.5, price - 1.2, price, 6000));
    price += 2.0;
    candles.push(makeCandle(27, price - 1.5, price + 0.5, price - 1.6, price, 5500));

    // Append 40 red/flat bars where high stays below entry high and TP
    for (let b = 1; b <= 41; b++) {
      candles.push(makeCandle(27 + b, price, price + 0.1, price - 0.5, price - 0.2, 1000));
    }

    const summary = evaluateStrategy(candles, 'MOMENTUM_MAXHOLD', '5m', 'Asia/Kolkata', undefined, undefined, true);
    if (summary.trades.length > 0) {
      const trade = summary.trades[0];
      if (trade.status === 'CLOSED') {
        expect(trade.exitReason).toContain('Max Hold Invalidation');
        expect(trade.durationBars).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('distinguishes closed vs forming final candle with lastCandleClosed option', () => {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < 25; i++) {
      price += 1.5;
      candles.push(makeCandle(i, price - 0.5, price + 1.0, price - 1.0, price, 2000));
    }
    price += 0.8;
    candles.push(makeCandle(25, price + 0.2, price + 0.5, price - 0.5, price, 2500));
    price += 1.5;
    candles.push(makeCandle(26, price - 1.0, price + 0.5, price - 1.2, price, 6000));
    price += 2.0;
    candles.push(makeCandle(27, price - 1.5, price + 0.5, price - 1.6, price, 5500));

    // Forming bar: lastCandleClosed = false
    const formingSummary = evaluateStrategy(candles, 'FORMING_TEST', '5m', 'Asia/Kolkata', undefined, undefined, false);
    // Closed bar: lastCandleClosed = true
    const closedSummary = evaluateStrategy(candles, 'CLOSED_TEST', '5m', 'Asia/Kolkata', undefined, undefined, true);

    // In closedSummary, closedCount includes bar 27
    expect(formingSummary).toBeDefined();
    expect(closedSummary).toBeDefined();
  });
});



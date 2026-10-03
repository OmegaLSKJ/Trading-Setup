import { Candle, Timeframe } from './types';
import { formatDateTimeWithZone, DEFAULT_TIMEZONE } from './timezones';
import { calculateEMA, calculateRSI, calculateDPO, calculateADX } from './indicators';

export interface StrategyMarker {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
  size?: number;
}

export interface StrategySignal {
  id: string;
  type: 'BUY' | 'EXIT';
  price: number;
  time: number;
  timeString: string;
  targetPrice: number;
  exitReason?: string;
  tier: '3-CANDLE';
  pnlPercent?: number;
  isProvisional?: boolean;
}

export interface PastTrade {
  id: string;
  symbol: string;
  instrumentKey?: string;
  timeframe?: string;
  evaluatedRange?: string;
  tier: '3-CANDLE';
  status: 'OPEN' | 'CLOSED';
  entryTime: number;
  entryTimeString: string;
  entryPrice: number;
  targetPrice: number;
  exitTime?: number;
  exitTimeString?: string;
  exitPrice?: number;
  exitReason?: string;
  pnlPercent: number;
  pnlAmount: number;
  durationBars: number;
  currencySymbol: string;
  isProvisional?: boolean;
}

export interface StrategyTelemetry {
  livePrice: number;
  currencySymbol: string;
  ema8: number;
  ema16: number;
  rsi: number;
  dpo: number;
  adx: number;
  c1Passed: boolean;
  c2Passed: boolean;
  c3Passed: boolean;
  hasOpenPosition: boolean;
  openPositionEntryPrice?: number;
  openPositionTpPrice?: number;
  livePnLPercent?: number;
  tpDistancePercent?: number;
  isTakeProfitHit?: boolean;
  isGreenHighExitHit?: boolean;
}

export interface StrategySummary {
  name: string;
  description: string;
  currencySymbol?: string;
  currentTrend: 'BULLISH' | 'NEUTRAL';
  lastSignal: StrategySignal | null;
  winRate: number | null; // null represents N/A when totalClosedTrades === 0
  totalSignals: number;
  profitableTrades: number;
  totalClosedTrades: number;
  timeframeWarning?: string;
  markers: StrategyMarker[];
  activeSignals: StrategySignal[];
  telemetry?: StrategyTelemetry;
  trades: PastTrade[];
}

export function formatISTTime(unixSec: number, timezone = DEFAULT_TIMEZONE): string {
  return formatDateTimeWithZone(unixSec, timezone);
}

/**
 * Strategy Assumptions & Documentation:
 * - Timeframe: Calibrated for 5m. Non-5m intervals issue a warning.
 * - Position sizing: 1 unit fixed per entry, zero slippage/commission modelled.
 * - Order fills: TP limit exit assumes fill at exact target (2% above entry).
 * - Priority: Exits are evaluated before new entries on each bar.
 * - Win Rule: Strictly pnl > 0 (exitPrice > entryPrice).
 * - Break-even treatment: Trades with pnl === 0 are counted as closed trades, but not as wins.
 * - Pine Script Divergences:
 *   1. C2 Volume Surge: Uses 20-period volume SMA alternative (volume >= SMA20 * 1.25) alongside daily highest volume.
 *   2. Two-bar entry spacing: Enforces a minimum of 2 bars between consecutive BUY entries.
 *   3. Max-Hold Invalidation: Positions held for >= 40 bars are closed at bar close, with global liquidation of all open positions.
 *   4. Date Window: No artificial 365-day backtest restriction; uses all provided candle data.
 *   5. Indicator Rounding: Rounded to 2 decimals for display consistency.
 *   6. Per-Entry TP: Take-profit is 2% above each specific entry price, rather than average position price.
 *   7. Daily Volume Reset: Tracks highest volume reset per trading day in exchange-local timezone.
 */
export function evaluateStrategy(
  candles: Candle[],
  symbol?: string,
  timeframe: Timeframe = '5m',
  timezone: string = DEFAULT_TIMEZONE,
  instrumentKey?: string,
  evaluatedRange?: string,
  lastCandleClosed = false
): StrategySummary {
  const strategyName = 'Custom 3-Candle Buy Strategy — Sequential (C1=-2 C2=-1 C3=0)';
  const description =
    'Sequential 3-Candle Volume Breakout & EMA 8/16 Momentum Strategy with +2% Target and Green-High tracking exit.';

  const isUsSymbol =
    Boolean(instrumentKey?.startsWith('US|')) ||
    Boolean(symbol?.toUpperCase().startsWith('US|')) ||
    Boolean(instrumentKey?.includes('NASDAQ:')) ||
    Boolean(instrumentKey?.includes('NYSE:'));
  const currencySymbol = isUsSymbol ? '$' : '₹';

  const timeframeWarning =
    timeframe !== '5m'
      ? `Strategy calibrated for 5m timeframe. Current timeframe (${timeframe}) may yield uncalibrated breakout signals.`
      : undefined;

  // Minimum candles required to warm up EMA16, RSI14, DPO20, and ADX14 (warm-up through candle 26)
  if (!candles || candles.length < 28) {
    return {
      name: strategyName,
      description,
      currentTrend: 'NEUTRAL',
      lastSignal: null,
      winRate: null,
      totalSignals: 0,
      profitableTrades: 0,
      totalClosedTrades: 0,
      currencySymbol,
      timeframeWarning,
      markers: [],
      activeSignals: [],
      trades: [],
    };
  }

  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const opens = candles.map((c) => c.open);
  const volumes = candles.map((c) => c.volume);

  // Compute canonical indicators sharing exact formulas with chart overlays
  const ema8List = calculateEMA(candles, 8);
  const ema16List = calculateEMA(candles, 16);
  const rsiList = calculateRSI(candles, 14);
  const dpoList = calculateDPO(candles, 20);
  const adxList = calculateADX(candles, 14);

  const ema8Map = new Map(ema8List.map((p) => [p.time, p.value]));
  const ema16Map = new Map(ema16List.map((p) => [p.time, p.value]));
  const rsiMap = new Map(rsiList.map((p) => [p.time, p.value]));
  const dpoMap = new Map(dpoList.map((p) => [p.time, p.value]));
  const adxMap = new Map(adxList.map((p) => [p.time, p.value]));

  // Accumulation/Distribution (A/D)
  const ad: number[] = new Array(n).fill(0);
  let cumAD = 0;
  for (let i = 0; i < n; i++) {
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];
    const mfMultiplier = h !== l ? (c - l - (h - c)) / (h - l) : 0;
    cumAD += mfMultiplier * v;
    ad[i] = cumAD;
  }

  // 20-period Volume SMA for volume surge checks
  const avgVol20: number[] = new Array(n).fill(0);
  let volSum = 0;
  for (let i = 0; i < n; i++) {
    volSum += volumes[i];
    if (i >= 20) volSum -= volumes[i - 20];
    if (i >= 19) avgVol20[i] = volSum / 20;
  }

  // Daily highest volume tracking
  const highestVolToday: number[] = new Array(n).fill(0);
  const sessionTz = isUsSymbol ? 'America/New_York' : 'Asia/Kolkata';
  let curDay = '';
  let curMaxVol = 0;
  for (let i = 0; i < n; i++) {
    const dayStr = new Date(candles[i].time * 1000).toLocaleDateString('en-CA', {
      timeZone: sessionTz,
    });
    if (dayStr !== curDay) {
      curDay = dayStr;
      curMaxVol = volumes[i];
    } else {
      curMaxVol = Math.max(curMaxVol, volumes[i]);
    }
    highestVolToday[i] = curMaxVol;
  }

  // Evaluation structures
  const markers: StrategyMarker[] = [];
  const signals: StrategySignal[] = [];
  const trades: PastTrade[] = [];

  interface OpenPosition {
    id: string;
    entryIndex: number;
    entryPrice: number;
    tp: number;
    tier: '3-CANDLE';
    tradeIndex: number;
  }

  const openPositions: OpenPosition[] = [];
  let trackingHighs = false;
  let trackedHigh = 0;
  let prevHighest = 0;
  let profitableTrades = 0;
  let totalClosedTrades = 0;
  let lastEntryIndex = -999;

  // Replay closed bars: if lastCandleClosed is true, all n bars are closed. Otherwise index 0 to n-2.
  const closedCount = lastCandleClosed ? n : (n > 1 ? n - 1 : n);

  for (let i = 26; i < closedCount; i++) {
    // ----------------------------------------------------
    // 1. EXITS EVALUATED FIRST (TP priority before entries)
    // ----------------------------------------------------
    if (openPositions.length > 0) {
      if (!trackingHighs) {
        trackingHighs = true;
        trackedHigh = highs[i - 1];
        prevHighest = trackedHigh;
      }

      // 1) 2% Take Profit Limit Exit Check
      const closedPosIndices: number[] = [];
      for (let p = 0; p < openPositions.length; p++) {
        const pos = openPositions[p];
        if (highs[i] >= pos.tp) {
          totalClosedTrades++;
          const exitPrice = pos.tp;
          const isProfitable = exitPrice > pos.entryPrice;
          if (isProfitable) profitableTrades++;

          const pnlPercent =
            pos.entryPrice > 0
              ? Number((((exitPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2))
              : 0;
          const pnlAmount = Number((exitPrice - pos.entryPrice).toFixed(2));
          const durationBars = i - pos.entryIndex;

          if (trades[pos.tradeIndex]) {
            trades[pos.tradeIndex].status = 'CLOSED';
            trades[pos.tradeIndex].exitTime = candles[i].time;
            trades[pos.tradeIndex].exitTimeString = formatISTTime(candles[i].time, timezone);
            trades[pos.tradeIndex].exitPrice = exitPrice;
            trades[pos.tradeIndex].exitReason = 'Take Profit (+2.0%)';
            trades[pos.tradeIndex].pnlPercent = pnlPercent;
            trades[pos.tradeIndex].pnlAmount = pnlAmount;
            trades[pos.tradeIndex].durationBars = durationBars;
          }

          markers.push({
            time: candles[i].time,
            position: 'aboveBar',
            color: '#38bdf8',
            shape: 'circle',
            text: `TP 2% (${currencySymbol}${pos.tp.toFixed(1)})`,
            size: 1,
          });
          closedPosIndices.push(p);
        }
      }

      for (let idx = closedPosIndices.length - 1; idx >= 0; idx--) {
        openPositions.splice(closedPosIndices[idx], 1);
      }

      // Reset tracker state immediately if TP closed all positions
      if (openPositions.length === 0) {
        trackingHighs = false;
        trackedHigh = 0;
        prevHighest = 0;
      }

      // 2) Green-High Tracker Exit
      if (openPositions.length > 0) {
        // Refresh prevHighest from trackedHigh before the green-high comparison
        prevHighest = trackedHigh;
        const isGreen = closes[i] > opens[i];
        const isHigherThanPrev = highs[i] > prevHighest;

        if (isGreen && isHigherThanPrev) {
          const exitPrice = closes[i];
          for (const pos of openPositions) {
            totalClosedTrades++;
            const isProfitable = exitPrice > pos.entryPrice;
            if (isProfitable) profitableTrades++;

            const pnlPercent =
              pos.entryPrice > 0
                ? Number((((exitPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2))
                : 0;
            const pnlAmount = Number((exitPrice - pos.entryPrice).toFixed(2));
            const durationBars = i - pos.entryIndex;

            if (trades[pos.tradeIndex]) {
              trades[pos.tradeIndex].status = 'CLOSED';
              trades[pos.tradeIndex].exitTime = candles[i].time;
              trades[pos.tradeIndex].exitTimeString = formatISTTime(candles[i].time, timezone);
              trades[pos.tradeIndex].exitPrice = exitPrice;
              trades[pos.tradeIndex].exitReason = 'Green-High Tracker Exit';
              trades[pos.tradeIndex].pnlPercent = pnlPercent;
              trades[pos.tradeIndex].pnlAmount = pnlAmount;
              trades[pos.tradeIndex].durationBars = durationBars;
            }
          }

          markers.push({
            time: candles[i].time,
            position: 'aboveBar',
            color: '#f59e0b',
            shape: 'circle',
            text: `GREEN HIGH EXIT @ ${currencySymbol}${closes[i].toFixed(1)}`,
            size: 1,
          });

          openPositions.length = 0;
          trackingHighs = false;
          trackedHigh = 0;
          prevHighest = 0;
        }
      }

      // 3) Protective Max-Hold Invalidation Exit (40 bars)
      // When durationBars >= 40, all open positions are globally liquidated on bar close.
      if (openPositions.length > 0 && i - openPositions[0].entryIndex >= 40) {
        const exitPrice = closes[i];
        for (const pos of openPositions) {
          totalClosedTrades++;
          const isProfitable = exitPrice > pos.entryPrice;
          if (isProfitable) profitableTrades++;

          const pnlPercent =
            pos.entryPrice > 0
              ? Number((((exitPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2))
              : 0;
          const pnlAmount = Number((exitPrice - pos.entryPrice).toFixed(2));
          const durationBars = i - pos.entryIndex;

          if (trades[pos.tradeIndex]) {
            trades[pos.tradeIndex].status = 'CLOSED';
            trades[pos.tradeIndex].exitTime = candles[i].time;
            trades[pos.tradeIndex].exitTimeString = formatISTTime(candles[i].time, timezone);
            trades[pos.tradeIndex].exitPrice = exitPrice;
            trades[pos.tradeIndex].exitReason = 'Max Hold Invalidation (40 bars)';
            trades[pos.tradeIndex].pnlPercent = pnlPercent;
            trades[pos.tradeIndex].pnlAmount = pnlAmount;
            trades[pos.tradeIndex].durationBars = durationBars;
          }
        }
        openPositions.length = 0;
        trackingHighs = false;
        trackedHigh = 0;
        prevHighest = 0;
      }

      if (trackingHighs) {
        trackedHigh = Math.max(trackedHigh, highs[i]);
      }
    } else {
      trackingHighs = false;
      trackedHigh = 0;
      prevHighest = 0;
    }

    // ----------------------------------------------------
    // 2. CHECK BUY CONDITIONS (C1 = i-2, C2 = i-1, C3 = i)
    // ----------------------------------------------------
    const c1 = i - 2;
    const c2 = i - 1;
    const c3 = i;

    // Gate entry strictly on indicator readiness across all 3 candles
    const e8_c1 = ema8Map.get(candles[c1].time);
    const e16_c1 = ema16Map.get(candles[c1].time);
    const e8_c1_prev = ema8Map.get(candles[c1 - 1]?.time);
    const e16_c1_prev = ema16Map.get(candles[c1 - 1]?.time);
    const rsi_c1 = rsiMap.get(candles[c1].time);
    const dpo_c1 = dpoMap.get(candles[c1].time);

    const rsi_c2 = rsiMap.get(candles[c2].time);
    const dpo_c2 = dpoMap.get(candles[c2].time);
    const adx_c2 = adxMap.get(candles[c2].time);

    const rsi_c3 = rsiMap.get(candles[c3].time);
    const dpo_c3 = dpoMap.get(candles[c3].time);
    const adx_c3 = adxMap.get(candles[c3].time);

    const isIndicatorsReady =
      e8_c1 !== undefined &&
      e16_c1 !== undefined &&
      rsi_c1 !== undefined &&
      dpo_c1 !== undefined &&
      rsi_c2 !== undefined &&
      dpo_c2 !== undefined &&
      adx_c2 !== undefined &&
      rsi_c3 !== undefined &&
      dpo_c3 !== undefined &&
      adx_c3 !== undefined;

    if (isIndicatorsReady) {
      // Candle 1 (Bar -2)
      const emaCrossC1 =
        e8_c1_prev !== undefined && e16_c1_prev !== undefined
          ? (e8_c1_prev <= e16_c1_prev && e8_c1 > e16_c1) || e8_c1 > e16_c1
          : e8_c1 > e16_c1;
      const candle1Cond = emaCrossC1 && rsi_c1 > 70 && dpo_c1 > -2.5;

      // Candle 2 (Bar -1)
      const highestVolTodayC2 = highestVolToday[c1];
      const volSurgeC2 =
        volumes[c2] >= highestVolTodayC2 ||
        volumes[c2] >= highestVolToday[c2] ||
        (avgVol20[c2] > 0 && volumes[c2] >= avgVol20[c2] * 1.25);
      const candle2Cond =
        volSurgeC2 &&
        rsi_c2 > 70 &&
        rsi_c2 < 80 &&
        volumes[c2] > volumes[c1] &&
        dpo_c2 > 0 &&
        dpo_c2 > dpo_c1 &&
        adx_c2 > 22 &&
        ad[c2] > ad[c1];

      // Candle 3 (Bar 0)
      const volCondC3 =
        volumes[c3] > volumes[c1] && (volumes[c3] < volumes[c2] || volumes[c3] > volumes[c2]);
      const candle3Cond =
        volCondC3 &&
        dpo_c3 > dpo_c2 &&
        adx_c3 > 22 &&
        ad[c3] > ad[c2] &&
        rsi_c3 > 75;

      const finalBuyCondition = candle1Cond && candle2Cond && candle3Cond;
      const canEnter = i - lastEntryIndex >= 2 && openPositions.length < 999;

      if (canEnter && finalBuyCondition) {
        const entryId = `BUY_${signals.length + 1}`;
        const entryPrice = closes[c3];
        const tp = Number((entryPrice * 1.02).toFixed(2));
        lastEntryIndex = i;

        markers.push({
          time: candles[c3].time,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: `3-CANDLE BUY @ ${currencySymbol}${entryPrice.toFixed(1)}`,
          size: 2,
        });

        signals.push({
          id: entryId,
          type: 'BUY',
          price: entryPrice,
          time: candles[c3].time,
          timeString: candles[c3].timeString,
          targetPrice: tp,
          tier: '3-CANDLE',
        });

        const tradeRecord: PastTrade = {
          id: entryId,
          symbol: symbol || 'EQUITY',
          instrumentKey,
          timeframe,
          evaluatedRange,
          tier: '3-CANDLE',
          status: 'OPEN',
          entryTime: candles[c3].time,
          entryTimeString: formatISTTime(candles[c3].time, timezone),
          entryPrice,
          targetPrice: tp,
          pnlPercent: 0,
          pnlAmount: 0,
          durationBars: 0,
          currencySymbol,
        };
        const tradeIndex = trades.length;
        trades.push(tradeRecord);

        openPositions.push({
          id: entryId,
          entryIndex: c3,
          entryPrice,
          tp,
          tier: '3-CANDLE',
          tradeIndex,
        });
      }
    }
  }

  // ----------------------------------------------------
  // 3. SEPARATE EVALUATION FOR LATEST FORMING BAR
  // ----------------------------------------------------
  const lastIndex = n - 1;
  const livePrice = closes[lastIndex];

  // Update floating trades
  for (const pos of openPositions) {
    const pnlPercent =
      pos.entryPrice > 0
        ? Number((((livePrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2))
        : 0;
    const pnlAmount = Number((livePrice - pos.entryPrice).toFixed(2));
    const durationBars = lastIndex - pos.entryIndex;

    if (trades[pos.tradeIndex]) {
      trades[pos.tradeIndex].status = 'OPEN';
      trades[pos.tradeIndex].exitPrice = livePrice;
      trades[pos.tradeIndex].exitReason = 'Active (Holding)';
      trades[pos.tradeIndex].pnlPercent = pnlPercent;
      trades[pos.tradeIndex].pnlAmount = pnlAmount;
      trades[pos.tradeIndex].durationBars = durationBars;
    }
  }

  // Check forming bar for provisional signal
  if (n > closedCount && n >= 28) {
    const c1 = lastIndex - 2;
    const c2 = lastIndex - 1;
    const c3 = lastIndex;

    const e8_c1 = ema8Map.get(candles[c1].time);
    const e16_c1 = ema16Map.get(candles[c1].time);
    const rsi_c1 = rsiMap.get(candles[c1].time);
    const dpo_c1 = dpoMap.get(candles[c1].time);

    const rsi_c2 = rsiMap.get(candles[c2].time);
    const dpo_c2 = dpoMap.get(candles[c2].time);
    const adx_c2 = adxMap.get(candles[c2].time);

    const rsi_c3 = rsiMap.get(candles[c3].time);
    const dpo_c3 = dpoMap.get(candles[c3].time);
    const adx_c3 = adxMap.get(candles[c3].time);

    if (
      e8_c1 !== undefined &&
      e16_c1 !== undefined &&
      rsi_c1 !== undefined &&
      dpo_c1 !== undefined &&
      rsi_c2 !== undefined &&
      dpo_c2 !== undefined &&
      adx_c2 !== undefined &&
      rsi_c3 !== undefined &&
      dpo_c3 !== undefined &&
      adx_c3 !== undefined
    ) {
      const c1Cond = e8_c1 > e16_c1 && rsi_c1 > 70 && dpo_c1 > -2.5;

      const highestVolTodayC2 = highestVolToday[c1];
      const volSurgeC2 =
        volumes[c2] >= highestVolTodayC2 ||
        volumes[c2] >= highestVolToday[c2] ||
        (avgVol20[c2] > 0 && volumes[c2] >= avgVol20[c2] * 1.25);

      const c2Cond =
        volSurgeC2 &&
        rsi_c2 > 70 &&
        rsi_c2 < 80 &&
        volumes[c2] > volumes[c1] &&
        dpo_c2 > 0 &&
        dpo_c2 > dpo_c1 &&
        adx_c2 > 22 &&
        ad[c2] > ad[c1];

      const volCondC3 =
        volumes[c3] > volumes[c1] && (volumes[c3] < volumes[c2] || volumes[c3] > volumes[c2]);

      const c3Cond =
        volCondC3 &&
        dpo_c3 > dpo_c2 &&
        adx_c3 > 22 &&
        ad[c3] > ad[c2] &&
        rsi_c3 > 75;

      const canEnter = lastIndex - lastEntryIndex >= 2 && openPositions.length < 999;

      if (c1Cond && c2Cond && c3Cond && canEnter) {
        signals.push({
          id: `PROVISIONAL_BUY_${signals.length + 1}`,
          type: 'BUY',
          price: livePrice,
          time: candles[lastIndex].time,
          timeString: candles[lastIndex].timeString,
          targetPrice: Number((livePrice * 1.02).toFixed(2)),
          tier: '3-CANDLE',
          isProvisional: true,
        });
      }
    }
  }

  const lastSignal = signals.length > 0 ? signals[signals.length - 1] : null;

  // Genuine win rate: strictly pnl > 0. Returns null when 0 closed trades exist.
  const winRate =
    totalClosedTrades > 0 ? Math.round((profitableTrades / totalClosedTrades) * 100) : null;

  // Active Live Bar Telemetry
  const lastPos = openPositions.length > 0 ? openPositions[openPositions.length - 1] : null;
  const livePnLPercent =
    lastPos && lastPos.entryPrice > 0
      ? ((livePrice - lastPos.entryPrice) / lastPos.entryPrice) * 100
      : undefined;
  const tpDistancePercent =
    lastPos && livePrice > 0 ? ((lastPos.tp - livePrice) / livePrice) * 100 : undefined;

  const lastBarEma8 = ema8Map.get(candles[lastIndex].time) ?? 0;
  const lastBarEma16 = ema16Map.get(candles[lastIndex].time) ?? 0;
  const lastBarRsi = rsiMap.get(candles[lastIndex].time) ?? 50;
  const lastBarDpo = dpoMap.get(candles[lastIndex].time) ?? 0;
  const lastBarAdx = adxMap.get(candles[lastIndex].time) ?? 0;

  const c1Idx = lastIndex - 2;
  const c2Idx = lastIndex - 1;
  const c3Idx = lastIndex;

  const c1Passed =
    c1Idx >= 0 &&
    (ema8Map.get(candles[c1Idx].time) ?? 0) > (ema16Map.get(candles[c1Idx].time) ?? 0) &&
    (rsiMap.get(candles[c1Idx].time) ?? 0) > 70 &&
    (dpoMap.get(candles[c1Idx].time) ?? 0) > -2.5;

  const c2Passed =
    c2Idx >= 0 &&
    (rsiMap.get(candles[c2Idx].time) ?? 0) > 70 &&
    (rsiMap.get(candles[c2Idx].time) ?? 0) < 80 &&
    (dpoMap.get(candles[c2Idx].time) ?? 0) > 0 &&
    (adxMap.get(candles[c2Idx].time) ?? 0) > 22;

  const c3Passed =
    c3Idx >= 0 &&
    (dpoMap.get(candles[c3Idx].time) ?? 0) > (dpoMap.get(candles[c2Idx].time) ?? 0) &&
    (adxMap.get(candles[c3Idx].time) ?? 0) > 22 &&
    (rsiMap.get(candles[c3Idx].time) ?? 0) > 75;

  const telemetry: StrategyTelemetry = {
    livePrice,
    currencySymbol,
    ema8: Number(lastBarEma8.toFixed(2)),
    ema16: Number(lastBarEma16.toFixed(2)),
    rsi: Number(lastBarRsi.toFixed(1)),
    dpo: Number(lastBarDpo.toFixed(2)),
    adx: Number(lastBarAdx.toFixed(1)),
    c1Passed: Boolean(c1Passed),
    c2Passed: Boolean(c2Passed),
    c3Passed: Boolean(c3Passed),
    hasOpenPosition: openPositions.length > 0,
    openPositionEntryPrice: lastPos?.entryPrice,
    openPositionTpPrice: lastPos?.tp,
    livePnLPercent: livePnLPercent !== undefined ? Number(livePnLPercent.toFixed(2)) : undefined,
    tpDistancePercent: tpDistancePercent !== undefined ? Number(tpDistancePercent.toFixed(2)) : undefined,
    isTakeProfitHit: lastPos ? highs[lastIndex] >= lastPos.tp : false,
    isGreenHighExitHit:
      lastPos && trackingHighs
        ? closes[lastIndex] > opens[lastIndex] && highs[lastIndex] > trackedHigh
        : false,
  };

  return {
    name: strategyName,
    description,
    currentTrend: openPositions.length > 0 ? 'BULLISH' : 'NEUTRAL',
    lastSignal,
    winRate,
    totalSignals: signals.length,
    profitableTrades,
    totalClosedTrades,
    currencySymbol,
    timeframeWarning,
    markers,
    activeSignals: signals,
    telemetry,
    trades: trades.slice().reverse(),
  };
}

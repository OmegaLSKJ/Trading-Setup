'use client';

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  CrosshairMode,
  ColorType,
  LineStyle,
  PriceLineSource,
  Time,
  IPriceLine,
} from 'lightweight-charts';

import { Candle, IndicatorConfig, Timeframe } from '@/lib/types';
import {
  calculateEMA,
  calculateVWAP,
  calculateRSI,
  calculateDPO,
  calculateADX,
  computeLiveIndicatorsSnapshot,
  LiveIndicatorsSnapshot,
} from '@/lib/indicators';
import { chartSyncBus } from '@/lib/chart-sync';
import { evaluateStrategy, StrategySummary } from '@/lib/strategy';
import { useDashboardStore } from '@/store/dashboard-store';
import { liveStreamManager } from '@/lib/live-stream';
import { getIndianMarketStatus, getUSMarketStatus } from '@/lib/market-hours';
import { formatDateTimeWithZone, formatTickMark, DEFAULT_TIMEZONE } from '@/lib/timezones';


export interface CandlestickChartHandle {
  resetScale: () => void;
  scrollToTime: (unixSec: number) => void;
}

interface Props {
  chartId: string;
  instrumentKey: string;
  tradingSymbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  indicators: IndicatorConfig;
  isLoading?: boolean;
  isLiveDisabled?: boolean;
  onCrosshairMove?: (candle: Candle | null) => void;
  onLivePriceUpdate?: (
    price: number,
    change: number,
    changePercent: number,
    direction: 'UP' | 'DOWN' | 'EQUAL'
  ) => void;
  onStrategyUpdate?: (summary: StrategySummary) => void;
}

function getSessionAlignedBarStartTime(tickTimestamp: number, tf: Timeframe, isUS: boolean): number {
  if (tf === '1h') {
    if (!isUS) {
      // Indian exchange: session starts at 09:15 IST (UTC+5:30 -> 19800 sec offset)
      // 09:15 IST is 33300 seconds from IST midnight
      const istTime = tickTimestamp + 19800;
      const istMidnight = Math.floor(istTime / 86400) * 86400;
      const sessionStartIST = istMidnight + (9 * 3600 + 15 * 60);
      if (istTime >= sessionStartIST) {
        const hoursPassed = Math.floor((istTime - sessionStartIST) / 3600);
        return sessionStartIST + hoursPassed * 3600 - 19800;
      }
      return Math.floor(tickTimestamp / 3600) * 3600;
    } else {
      // US exchange: session starts at 09:30 ET
      const etTime = tickTimestamp - 18000;
      const etMidnight = Math.floor(etTime / 86400) * 86400;
      const sessionStartET = etMidnight + (9 * 3600 + 30 * 60);
      if (etTime >= sessionStartET) {
        const hoursPassed = Math.floor((etTime - sessionStartET) / 3600);
        return sessionStartET + hoursPassed * 3600 + 18000;
      }
      return Math.floor(tickTimestamp / 3600) * 3600;
    }
  }

  if (tf === '1D') {
    if (!isUS) {
      // Align to IST date midnight
      const istTime = tickTimestamp + 19800;
      const istMidnight = Math.floor(istTime / 86400) * 86400;
      return istMidnight - 19800;
    } else {
      // Align to US ET date midnight
      const etTime = tickTimestamp - 18000;
      const etMidnight = Math.floor(etTime / 86400) * 86400;
      return etMidnight + 18000;
    }
  }

  // Intraday standard minute bucketing
  let intervalSec = 300;
  switch (tf) {
    case '1m': intervalSec = 60; break;
    case '3m': intervalSec = 180; break;
    case '5m': intervalSec = 300; break;
    case '10m': intervalSec = 600; break;
    case '15m': intervalSec = 900; break;
    case '30m': intervalSec = 1800; break;
    default: intervalSec = 300; break;
  }
  return Math.floor(tickTimestamp / intervalSec) * intervalSec;
}

export const CandlestickChart = forwardRef<CandlestickChartHandle, Props>(
  (
    {
      chartId,
      instrumentKey,
      tradingSymbol,
      timeframe,
      candles,
      indicators,
      isLoading,
      isLiveDisabled,
      onCrosshairMove,
      onLivePriceUpdate,
      onStrategyUpdate,
    },
    ref
  ) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartApiRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const emaSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
    const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const rsiPriceLinesRef = useRef<IPriceLine[]>([]);
    const markersPluginRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);


    // Active indicators snapshot lookup by timestamp for crosshair hover inspection
    const candleIndicatorsMap = useRef<Map<number, LiveIndicatorsSnapshot>>(new Map());
    const [liveIndicators, setLiveIndicators] = useState<LiveIndicatorsSnapshot | null>(null);
    const [hoverIndicators, setHoverIndicators] = useState<LiveIndicatorsSnapshot | null>(null);

    // Active mutable candles in memory for real-time live ticking
    const activeCandlesRef = useRef<Candle[]>([]);
    const isSyncingRange = useRef(false);
    const lastStrategyRunTimeRef = useRef<number>(0);
    const strategyPendingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastIndicatorCalcTimeRef = useRef<number>(0);

    const onLivePriceUpdateRef = useRef(onLivePriceUpdate);
    onLivePriceUpdateRef.current = onLivePriceUpdate;

    const onStrategyUpdateRef = useRef(onStrategyUpdate);
    onStrategyUpdateRef.current = onStrategyUpdate;

    const indicatorsRef = useRef(indicators);
    indicatorsRef.current = indicators;

    const syncSettings = useDashboardStore((s) => s.syncSettings);
    const syncSettingsRef = useRef(syncSettings);
    syncSettingsRef.current = syncSettings;

    const selectedTimezone = useDashboardStore((s) => s.selectedTimezone) || DEFAULT_TIMEZONE;
    const selectedTimezoneRef = useRef(selectedTimezone);
    selectedTimezoneRef.current = selectedTimezone;

    const lastContextRef = useRef<string>('');

    // Clean up any pending strategy timer on unmount
    useEffect(() => {
      return () => {
        if (strategyPendingTimerRef.current) {
          clearTimeout(strategyPendingTimerRef.current);
          strategyPendingTimerRef.current = null;
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      resetScale: () => {
        if (chartApiRef.current && activeCandlesRef.current.length > 0) {
          const total = activeCandlesRef.current.length;
          chartApiRef.current.timeScale().setVisibleLogicalRange({
            from: Math.max(0, total - 75),
            to: total + 6,
          });
        } else if (chartApiRef.current) {
          chartApiRef.current.timeScale().resetTimeScale();
        }
      },
      scrollToTime: (unixSec: number) => {
        if (!chartApiRef.current || !activeCandlesRef.current) return;
        const list = activeCandlesRef.current;
        if (list.length === 0) return;

        let closestIdx = -1;
        let minDiff = Infinity;
        for (let i = 0; i < list.length; i++) {
          const diff = Math.abs(list[i].time - unixSec);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }

        if (closestIdx !== -1) {
          chartApiRef.current.timeScale().setVisibleLogicalRange({
            from: Math.max(0, closestIdx - 15),
            to: Math.min(list.length - 1 + 8, closestIdx + 20),
          });
        }
      },
    }));

    const [hoverData, setHoverData] = useState<{
      open?: number;
      high?: number;
      low?: number;
      close?: number;
      volume?: number;
      timeStr?: string;
      time?: number;
    } | null>(null);

    const [currentLivePrice, setCurrentLivePrice] = useState<number | null>(null);
    const [tickDirection, setTickDirection] = useState<'UP' | 'DOWN' | 'EQUAL'>('EQUAL');

    // Dynamic Live Strategy Evaluator that recalculates signals & markers in real-time as live data ticks
    const runLiveStrategy = useCallback(() => {
      if (!markersPluginRef.current) return;
      const list = activeCandlesRef.current;
      const currentIndicators = indicatorsRef.current;

      if (currentIndicators.strategy && list && list.length >= 15) {
        try {
          const summary = evaluateStrategy(list, tradingSymbol, timeframe);
          const chartMarkers = summary.markers.map((m) => ({
            time: m.time as unknown as Time,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text,
            size: m.size || 2,
          }));
          markersPluginRef.current.setMarkers(chartMarkers);

          if (onStrategyUpdateRef.current) {
            onStrategyUpdateRef.current(summary);
          }
        } catch (e) {
          console.warn('Live strategy evaluation error:', e);
        }
      } else {
        try {
          markersPluginRef.current.setMarkers([]);
        } catch {
          // ignore
        }
        if (onStrategyUpdateRef.current) {
          onStrategyUpdateRef.current({
            name: 'Custom 3-Candle Buy Strategy',
            description: '',
            currentTrend: 'NEUTRAL',
            lastSignal: null,
            winRate: null,
            totalSignals: 0,
            profitableTrades: 0,
            totalClosedTrades: 0,
            markers: [],
            activeSignals: [],
            trades: [],
          });
        }
      }
    }, [tradingSymbol, timeframe]);



    const triggerLiveStrategyEvaluation = useCallback(() => {
      const now = Date.now();
      if (now - lastStrategyRunTimeRef.current > 1500) {
        lastStrategyRunTimeRef.current = now;
        runLiveStrategy();
      } else if (!strategyPendingTimerRef.current) {
        strategyPendingTimerRef.current = setTimeout(() => {
          strategyPendingTimerRef.current = null;
          lastStrategyRunTimeRef.current = Date.now();
          runLiveStrategy();
        }, 1500);
      }
    }, [runLiveStrategy]);


    // Initialize chart
    useEffect(() => {
      const container = chartContainerRef.current;
      if (!container) return;

      const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: '#080c14' },
          textColor: '#94a3b8',
          fontSize: 11,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        grid: {
          vertLines: { color: '#131b2e', style: LineStyle.SparseDotted },
          horzLines: { color: '#131b2e', style: LineStyle.SparseDotted },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: '#475569',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#1e293b',
          },
          horzLine: {
            color: '#475569',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#1e293b',
          },
        },
        rightPriceScale: {
          borderColor: '#1e293b',
          autoScale: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.22,
          },
        },
        localization: {
          locale: 'en-US',
          dateFormat: 'dd MMM yyyy',
          timeFormatter: (time: number) => {
            return formatDateTimeWithZone(time, selectedTimezoneRef.current);
          },
        },
        timeScale: {
          borderColor: '#1e293b',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 8,
          barSpacing: 10,
          minBarSpacing: 3,
          tickMarkFormatter: (time: number, tickMarkType: number) => {
            return formatTickMark(time, tickMarkType, selectedTimezoneRef.current);
          },
        },
      });

      chartApiRef.current = chart;

      // Candlestick series with live pulsing price animation
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineSource: PriceLineSource.LastBar,
      });
      candleSeriesRef.current = candleSeries;

      try {
        markersPluginRef.current = createSeriesMarkers(candleSeries, []);
      } catch (e) {
        console.warn('Could not initialize markers plugin:', e);
      }

      // Volume series
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
        visible: false,
      });
      volumeSeriesRef.current = volumeSeries;

      // Crosshair move handler
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
          setHoverData(null);
          setHoverIndicators(null);
          if (onCrosshairMove) onCrosshairMove(null);
          return;
        }

        const candleData = param.seriesData.get(candleSeries) as
          | { open: number; high: number; low: number; close: number }
          | undefined;

        const volumeData = param.seriesData.get(volumeSeries) as
          | { value: number }
          | undefined;

        if (candleData) {
          const timeNum = Number(param.time);
          const currentTz = selectedTimezoneRef.current || DEFAULT_TIMEZONE;
          const timeStr = formatDateTimeWithZone(timeNum, currentTz);

          const currentHover = {
            open: candleData.open,
            high: candleData.high,
            low: candleData.low,
            close: candleData.close,
            volume: volumeData?.value,
            timeStr,
            time: timeNum,
          };
          setHoverData(currentHover);

          const histSnap = candleIndicatorsMap.current.get(timeNum);
          setHoverIndicators(histSnap || null);

          if (onCrosshairMove) {
            onCrosshairMove({
              time: timeNum,
              timeString: timeStr,
              open: candleData.open,
              high: candleData.high,
              low: candleData.low,
              close: candleData.close,
              volume: volumeData?.value || 0,
            });
          }
        }

        // Sync crosshair across charts
        if (syncSettingsRef.current.crosshair) {
          chartSyncBus.emitCrosshair(chartId, Number(param.time), param.point);
        }
      });

      // Pointer leave: emit clear crosshair to other charts and clear local HUD
      const handlePointerLeave = () => {
        setHoverData(null);
        setHoverIndicators(null);
        if (onCrosshairMove) {
          onCrosshairMove(null);
        }
        if (syncSettingsRef.current.crosshair) {
          chartSyncBus.emitCrosshair(chartId, null, null);
        }
      };
      container.addEventListener('pointerleave', handlePointerLeave);

      // Subscribe to remote crosshair events from other charts
      const unsubCrosshair = chartSyncBus.subscribeCrosshair((srcId, time) => {
        if (srcId === chartId || !chartApiRef.current || !syncSettingsRef.current.crosshair) return;


        try {
          if (time === null) {
            chartApiRef.current.clearCrosshairPosition();
            setHoverData(null);
            setHoverIndicators(null);
          } else if (candleSeriesRef.current) {
            const candleAtTime = activeCandlesRef.current.find((c) => c.time === time);
            if (candleAtTime) {
              chartApiRef.current.setCrosshairPosition(
                candleAtTime.close,
                time as unknown as Time,
                candleSeriesRef.current
              );
            }
          }
        } catch {
          // ignore
        }
      });

      // Time range change handler for sync
      chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
        if (!logicalRange || isSyncingRange.current || !syncSettingsRef.current.timeRange) return;
        const timeRange = chart.timeScale().getVisibleRange();
        if (timeRange && typeof timeRange.from === 'number' && typeof timeRange.to === 'number') {
          chartSyncBus.emitTimeRange(chartId, timeRange.from, timeRange.to);
        }
      });

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      });
      resizeObserver.observe(container);

      return () => {
        container.removeEventListener('pointerleave', handlePointerLeave);
        unsubCrosshair();
        resizeObserver.disconnect();
        chart.remove();
        chartApiRef.current = null;
      };
    }, []);

    // Dynamically reconfigure chart time formatters when selectedTimezone changes
    useEffect(() => {
      const tz = selectedTimezone || DEFAULT_TIMEZONE;

      // Refresh displayed hover timestamp immediately when timezone changes
      setHoverData((prev) => {
        if (!prev || prev.time === undefined) return prev;
        return {
          ...prev,
          timeStr: formatDateTimeWithZone(prev.time, tz),
        };
      });

      const chart = chartApiRef.current;
      if (!chart) return;

      chart.applyOptions({
        localization: {
          locale: 'en-US',
          dateFormat: 'dd MMM yyyy',
          timeFormatter: (time: number) => {
            return formatDateTimeWithZone(time, tz);
          },
        },
        timeScale: {
          tickMarkFormatter: (time: number, tickMarkType: number) => {
            return formatTickMark(time, tickMarkType, tz);
          },
        },
      });
    }, [selectedTimezone]);

    // Cross-chart time range sync listener
    useEffect(() => {
      const unsubTime = chartSyncBus.subscribeTimeRange((srcId, from, to) => {
        if (srcId === chartId || !chartApiRef.current || !syncSettings.timeRange) return;
        isSyncingRange.current = true;
        try {
          chartApiRef.current.timeScale().setVisibleRange({
            from: from as unknown as Time,
            to: to as unknown as Time,
          });
        } catch {
          // ignore
        } finally {
          setTimeout(() => {
            isSyncingRange.current = false;
          }, 50);
        }
      });

      return () => {
        unsubTime();
      };
    }, [chartId, syncSettings.timeRange]);

    // Set initial candle & volume data when candles prop changes
    useEffect(() => {
      if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

      if (!candles || candles.length === 0) {
        candleSeriesRef.current.setData([]);
        volumeSeriesRef.current.setData([]);
        activeCandlesRef.current = [];
        candleIndicatorsMap.current.clear();
        setLiveIndicators(null);
        setHoverIndicators(null);
        setHoverData(null);
        emaSeriesRefs.current.forEach((s) => chartApiRef.current?.removeSeries(s));
        emaSeriesRefs.current.clear();
        if (rsiSeriesRef.current) {
          chartApiRef.current?.removeSeries(rsiSeriesRef.current);
          rsiSeriesRef.current = null;
        }
        if (vwapSeriesRef.current) {
          chartApiRef.current?.removeSeries(vwapSeriesRef.current);
          vwapSeriesRef.current = null;
        }
        return;
      }

      const currentContext = `${instrumentKey}-${timeframe}`;
      const isContextChange = lastContextRef.current !== currentContext;
      if (isContextChange) {
        lastContextRef.current = currentContext;
        if (strategyPendingTimerRef.current) {
          clearTimeout(strategyPendingTimerRef.current);
          strategyPendingTimerRef.current = null;
        }
      }

      // Deep copy candles to mutable active list
      activeCandlesRef.current = candles.map((c) => ({ ...c }));

      const candleData = candles.map((c) => ({
        time: c.time as unknown as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volumeData = candles.map((c) => {
        const isUp = c.close >= c.open;
        return {
          time: c.time as unknown as Time,
          value: c.volume,
          color: isUp ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        };
      });

      candleSeriesRef.current.setData(candleData);

      if (indicatorsRef.current.volume) {
        volumeSeriesRef.current.setData(volumeData);
      } else {
        volumeSeriesRef.current.setData([]);
      }

      // Zoom to the most recent 75 candles ONLY on context changes
      if (chartApiRef.current && candleData.length > 0 && isContextChange) {
        const total = candleData.length;
        chartApiRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, total - 75),
          to: total + 6,
        });
      }

      const last = candles[candles.length - 1];
      setCurrentLivePrice(last.close);

      // Precalculate indicators across all historical bars for crosshair inspection
      const ema8List = calculateEMA(candles, 8);
      const ema16List = calculateEMA(candles, 16);
      const ema20List = calculateEMA(candles, 20);
      const ema50List = calculateEMA(candles, 50);
      const ema200List = calculateEMA(candles, 200);
      const rsiList = calculateRSI(candles, 14);
      const vwapList = calculateVWAP(candles);
      const dpoList = calculateDPO(candles, 20);
      const adxList = calculateADX(candles, 14);

      const ema8Map = new Map(ema8List.map((p) => [p.time, p.value]));
      const ema16Map = new Map(ema16List.map((p) => [p.time, p.value]));
      const ema20Map = new Map(ema20List.map((p) => [p.time, p.value]));
      const ema50Map = new Map(ema50List.map((p) => [p.time, p.value]));
      const ema200Map = new Map(ema200List.map((p) => [p.time, p.value]));
      const rsiMap = new Map(rsiList.map((p) => [p.time, p.value]));
      const vwapMap = new Map(vwapList.map((p) => [p.time, p.value]));
      const dpoMap = new Map(dpoList.map((p) => [p.time, p.value]));
      const adxMap = new Map(adxList.map((p) => [p.time, p.value]));

      candleIndicatorsMap.current.clear();
      candles.forEach((c) => {
        candleIndicatorsMap.current.set(c.time, {
          ema8: ema8Map.get(c.time) ?? c.close,
          ema16: ema16Map.get(c.time) ?? c.close,
          ema20: ema20Map.get(c.time),
          ema50: ema50Map.get(c.time),
          ema200: ema200Map.get(c.time),
          rsi14: rsiMap.get(c.time) ?? 50,
          vwap: vwapMap.get(c.time),
          dpo: dpoMap.get(c.time) ?? 0,
          adx: adxMap.get(c.time) ?? 0,
          volume: c.volume,
        });
      });

      const initialSnap = computeLiveIndicatorsSnapshot(candles);
      setLiveIndicators(initialSnap);
    }, [candles, instrumentKey, timeframe]);

    // Separate Volume Visibility Effect (no data replacement)
    useEffect(() => {
      if (!volumeSeriesRef.current) return;
      if (indicators.volume && activeCandlesRef.current.length > 0) {
        const volumeData = activeCandlesRef.current.map((c) => ({
          time: c.time as unknown as Time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        }));
        volumeSeriesRef.current.setData(volumeData);
      } else {
        volumeSeriesRef.current.setData([]);
      }
    }, [indicators.volume]);

    // Real-Time Live Market Data Stream Subscription
    useEffect(() => {
      if (!instrumentKey || isLiveDisabled) return;

      const unsubscribe = liveStreamManager.subscribe(instrumentKey, (tick) => {

        // STRICT RULE: Reject any tick updates when quote is MARKET_CLOSED or market is closed
        if (tick.state === 'MARKET_CLOSED') return;

        const isUS = instrumentKey.startsWith('US|');
        const isMarketOpen = isUS ? getUSMarketStatus().isOpen : getIndianMarketStatus().isOpen;
        if (!isMarketOpen) return;

        const list = activeCandlesRef.current;
        if (!list || list.length === 0 || !candleSeriesRef.current) return;

        const last = list[list.length - 1];
        if (!last) return;

        // Reject ticks older than the last bar
        if (tick.timestamp < last.time) return;

        const newPrice = Number(tick.price.toFixed(2));
        const direction = tick.direction || (newPrice > last.close ? 'UP' : newPrice < last.close ? 'DOWN' : 'EQUAL');

        // Align bar start to exchange session
        const barStartTime = getSessionAlignedBarStartTime(tick.timestamp, timeframe, isUS);
        if (barStartTime < last.time) return;

        let isNewBar = false;

        if (barStartTime > last.time) {
          // New candle period started! Append new candle
          isNewBar = true;
          const newCandle: Candle = {
            time: barStartTime,
            timeString: new Date(barStartTime * 1000).toISOString(),
            open: newPrice,
            high: newPrice,
            low: newPrice,
            close: newPrice,
            volume: tick.volumeDelta || 0,
          };
          list.push(newCandle);

          // Bound live buffer to 2000 bars
          if (list.length > 2000) {
            list.shift();
          }

          try {
            candleSeriesRef.current.update({
              time: barStartTime as unknown as Time,
              open: newCandle.open,
              high: newCandle.high,
              low: newCandle.low,
              close: newCandle.close,
            });

            if (volumeSeriesRef.current && indicatorsRef.current.volume) {
              volumeSeriesRef.current.update({
                time: barStartTime as unknown as Time,
                value: newCandle.volume,
                color: 'rgba(16, 185, 129, 0.4)',
              });
            }
          } catch (e) {
            console.warn('Error pushing new candle bar:', e);
          }

          // Auto-scroll to real-time if user is looking at latest bars
          if (chartApiRef.current) {
            const range = chartApiRef.current.timeScale().getVisibleLogicalRange();
            if (range && range.to >= list.length - 4) {
              chartApiRef.current.timeScale().scrollToRealTime();
            }
          }
        } else {
          // Update in-progress candle
          last.close = newPrice;
          if (newPrice > last.high) last.high = newPrice;
          if (newPrice < last.low) last.low = newPrice;
          if (tick.volumeDelta) {
            last.volume = (last.volume || 0) + tick.volumeDelta;
          }

          try {
            // 1. Update Candlestick Bar on Canvas
            candleSeriesRef.current.update({
              time: last.time as unknown as Time,
              open: last.open,
              high: last.high,
              low: last.low,
              close: last.close,
            });

            // 2. Update Volume Histogram on Canvas
            if (volumeSeriesRef.current && indicators.volume) {
              volumeSeriesRef.current.update({
                time: last.time as unknown as Time,
                value: last.volume,
                color:
                  last.close >= last.open
                    ? 'rgba(16, 185, 129, 0.4)'
                    : 'rgba(239, 68, 68, 0.4)',
              });
            }
          } catch (e) {
            console.warn('Error updating live candle bar:', e);
          }
        }

        const activeBar = list[list.length - 1];

        // 3. Throttle indicators & HUD snapshot (run immediately on new bar, otherwise throttle to 600ms)
        const now = Date.now();
        if (isNewBar || now - lastIndicatorCalcTimeRef.current > 600) {
          lastIndicatorCalcTimeRef.current = now;
          const currentIndicators = indicatorsRef.current;

          // Dynamic EMAs Update on Canvas
          const emaConfigs = [
            { key: 'ema8', period: 8 },
            { key: 'ema16', period: 16 },
            { key: 'ema20', period: 20 },
            { key: 'ema50', period: 50 },
            { key: 'ema200', period: 200 },
          ];
          emaConfigs.forEach(({ key, period }) => {
            const series = emaSeriesRefs.current.get(key);
            if (series && currentIndicators[key as keyof IndicatorConfig]) {
              const emaPoints = calculateEMA(list, period);
              if (emaPoints.length > 0) {
                const curEma = emaPoints[emaPoints.length - 1].value;
                try {
                  series.update({
                    time: activeBar.time as unknown as Time,
                    value: curEma,
                  });
                } catch {
                  // ignore
                }
              }
            }
          });

          // Dynamic RSI Update on Canvas
          if (rsiSeriesRef.current && currentIndicators.rsi14) {
            const rsiPoints = calculateRSI(list, 14);
            if (rsiPoints.length > 0) {
              const curRsi = rsiPoints[rsiPoints.length - 1].value;
              try {
                rsiSeriesRef.current.update({
                  time: activeBar.time as unknown as Time,
                  value: curRsi,
                });
              } catch {
                // ignore
              }
            }
          }

          // Dynamic VWAP Update on Canvas
          if (vwapSeriesRef.current && currentIndicators.vwap) {
            const vwapPoints = calculateVWAP(list);
            if (vwapPoints.length > 0) {
              const curVwap = vwapPoints[vwapPoints.length - 1].value;
              try {
                vwapSeriesRef.current.update({
                  time: activeBar.time as unknown as Time,
                  value: curVwap,
                });
              } catch {
                // ignore
              }
            }
          }

          // Update Live Indicators HUD state
          const currentSnapshot = computeLiveIndicatorsSnapshot(list);
          setLiveIndicators(currentSnapshot);
          candleIndicatorsMap.current.set(activeBar.time, currentSnapshot);

          // Live Strategy Evaluation (throttled to 1.5s)
          triggerLiveStrategyEvaluation();
        }

        setCurrentLivePrice(newPrice);
        setTickDirection(direction);

        if (onLivePriceUpdateRef.current && list[0]) {
          const first = list[0];
          const change = newPrice - first.open;
          const changePercent = first.open > 0 ? (change / first.open) * 100 : 0;
          onLivePriceUpdateRef.current(newPrice, change, changePercent, direction);
        }
      });

      return () => {
        unsubscribe();
      };
    }, [
      instrumentKey,
      timeframe,
      triggerLiveStrategyEvaluation,
    ]);

    // Update Indicators (EMAs, RSI, and VWAP Series on Chart Canvas)
    useEffect(() => {
      const chart = chartApiRef.current;
      if (!chart) return;

      const targetCandles = activeCandlesRef.current.length > 0 ? activeCandlesRef.current : candles;
      if (!targetCandles || targetCandles.length === 0) return;

      // Adjust main candle and volume scale margins if RSI pane is active
      if (candleSeriesRef.current) {
        candleSeriesRef.current.priceScale().applyOptions({
          scaleMargins: {
            top: 0.06,
            bottom: indicators.rsi14 ? 0.30 : 0.16,
          },
        });
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.priceScale().applyOptions({
          scaleMargins: {
            top: 0.65,
            bottom: indicators.rsi14 ? 0.28 : 0.01,
          },
        });
      }

      // 1. Exponential Moving Averages (8, 16, 20, 50, 200)
      const emaConfigs = [
        { key: 'ema8', period: 8, color: '#38bdf8', active: indicators.ema8 },
        { key: 'ema16', period: 16, color: '#f59e0b', active: indicators.ema16 },
        { key: 'ema20', period: 20, color: '#ec4899', active: indicators.ema20 },
        { key: 'ema50', period: 50, color: '#a855f7', active: indicators.ema50 },
        { key: 'ema200', period: 200, color: '#eab308', active: indicators.ema200 },
      ];

      emaConfigs.forEach(({ key, period, color, active }) => {
        let series = emaSeriesRefs.current.get(key);

        if (active) {
          if (!series) {
            series = chart.addSeries(LineSeries, {
              color,
              lineWidth: 1,
              title: `EMA ${period}`,
            });
            emaSeriesRefs.current.set(key, series);
          }
          const emaData = calculateEMA(targetCandles, period).map((p) => ({
            time: p.time as unknown as Time,
            value: p.value,
          }));
          series.setData(emaData);
        } else if (series) {
          chart.removeSeries(series);
          emaSeriesRefs.current.delete(key);
        }
      });

      // 2. Relative Strength Index (RSI 14) Oscillator
      if (indicators.rsi14) {
        if (!rsiSeriesRef.current) {
          const rsiSeries = chart.addSeries(LineSeries, {
            color: '#c084fc',
            lineWidth: 2,
            priceScaleId: 'rsi_scale',
            title: 'RSI 14',
            priceFormat: {
              type: 'custom',
              formatter: (val: number) => val.toFixed(1),
            },
            lastValueVisible: false,
            priceLineVisible: false,
          });

          chart.priceScale('rsi_scale').applyOptions({
            scaleMargins: {
              top: 0.76,
              bottom: 0.02,
            },
            autoScale: true,
            visible: false,
            borderColor: '#334155',
          });

          const p70 = rsiSeries.createPriceLine({
            price: 70,
            color: 'rgba(239, 68, 68, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: '70 OB',
          });

          const p30 = rsiSeries.createPriceLine({
            price: 30,
            color: 'rgba(16, 185, 129, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: '30 OS',
          });

          const p50 = rsiSeries.createPriceLine({
            price: 50,
            color: 'rgba(148, 163, 184, 0.35)',
            lineWidth: 1,
            lineStyle: LineStyle.SparseDotted,
            axisLabelVisible: false,
            title: '50',
          });

          rsiPriceLinesRef.current = [p70, p30, p50];
          rsiSeriesRef.current = rsiSeries;
        }

        const rsiData = calculateRSI(targetCandles, 14).map((p) => ({
          time: p.time as unknown as Time,
          value: p.value,
        }));
        rsiSeriesRef.current.setData(rsiData);
      } else if (rsiSeriesRef.current) {
        chart.removeSeries(rsiSeriesRef.current);
        rsiSeriesRef.current = null;
        rsiPriceLinesRef.current = [];
      }

      // 3. Volume Weighted Average Price (VWAP)
      if (indicators.vwap) {
        if (!vwapSeriesRef.current) {
          vwapSeriesRef.current = chart.addSeries(LineSeries, {
            color: '#06b6d4',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: 'VWAP',
          });
        }
        const vwapData = calculateVWAP(targetCandles).map((p) => ({
          time: p.time as unknown as Time,
          value: p.value,
        }));
        vwapSeriesRef.current.setData(vwapData);
      } else if (vwapSeriesRef.current) {
        chart.removeSeries(vwapSeriesRef.current);
        vwapSeriesRef.current = null;
      }
    }, [candles, indicators]);

    // Apply Live Strategy Mapping on initial load & candle changes
    useEffect(() => {
      runLiveStrategy();
    }, [candles, indicators.strategy, runLiveStrategy]);

    const activeList = activeCandlesRef.current;
    const latestCandle = activeList.length > 0 ? activeList[activeList.length - 1] : null;

    const currentPriceInfo = hoverData || (latestCandle ? {
      open: latestCandle.open,
      high: latestCandle.high,
      low: latestCandle.low,
      close: currentLivePrice ?? latestCandle.close,
      volume: latestCandle.volume,
      timeStr: formatDateTimeWithZone(latestCandle.time, selectedTimezone),
    } : null);

    const displayIndicators = hoverIndicators || liveIndicators;

    const isUSInstrument = instrumentKey.startsWith('US|');
    const currentMarketStatus = isUSInstrument ? getUSMarketStatus() : getIndianMarketStatus();

    return (
      <div className="relative w-full h-full flex flex-col bg-[#080c14] select-none overflow-hidden">
        {/* Top-left Unified HUD Container (Never overlaps) */}
        <div className="absolute top-1.5 left-2 z-10 flex flex-col gap-1 pointer-events-none max-w-[calc(100%-80px)] select-none">
          {/* Row 1: OHLCV & Market Beacon */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-[#0b0f19]/85 backdrop-blur-xs px-2 py-0.5 rounded border border-slate-800/70 text-[10px] font-mono text-slate-300 shadow-md">
            {/* Market Status beacon */}
            {currentMarketStatus.isOpen ? (
              <span className="flex items-center gap-1 text-[9px] font-sans font-bold text-emerald-400 bg-emerald-950/70 px-1 py-0.2 rounded border border-emerald-800/40">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                LIVE
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-[9px] font-sans font-semibold text-slate-400 bg-slate-900/90 px-1 py-0.2 rounded border border-slate-700/60"
                title={currentMarketStatus.reason}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                CLOSED
              </span>
            )}

            {currentPriceInfo ? (
              <>
                {currentPriceInfo.timeStr && (
                  <span className="text-slate-400 font-sans">{currentPriceInfo.timeStr}</span>
                )}
                <span>
                  <span className="text-slate-500">O:</span>{' '}
                  <span className="text-white font-medium">{currentPriceInfo.open?.toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-slate-500">H:</span>{' '}
                  <span className="text-emerald-400 font-medium">{currentPriceInfo.high?.toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-slate-500">L:</span>{' '}
                  <span className="text-rose-400 font-medium">{currentPriceInfo.low?.toFixed(2)}</span>
                </span>
                <span>
                  <span className="text-slate-500">C:</span>{' '}
                  <span
                    className={`font-bold ${
                      tickDirection === 'UP'
                        ? 'text-emerald-300'
                        : tickDirection === 'DOWN'
                        ? 'text-rose-300'
                        : (currentPriceInfo.close || 0) >= (currentPriceInfo.open || 0)
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {currentPriceInfo.close?.toFixed(2)}
                  </span>
                </span>
                {currentPriceInfo.volume !== undefined && (
                  <span className="hidden sm:inline">
                    <span className="text-slate-500">Vol:</span>{' '}
                    <span className="text-cyan-400">
                      {currentPriceInfo.volume > 1_000_000
                        ? `${(currentPriceInfo.volume / 1_000_000).toFixed(2)}M`
                        : currentPriceInfo.volume > 1_000
                        ? `${(currentPriceInfo.volume / 1_000).toFixed(1)}K`
                        : currentPriceInfo.volume.toLocaleString()}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-500">Loading candles...</span>
            )}
          </div>

          {/* Row 2: Indicators Ribbon (Rendered below Row 1, never overlapping) */}
          {displayIndicators &&
            Boolean(
              indicators.ema8 ||
                indicators.ema16 ||
                indicators.ema20 ||
                indicators.ema50 ||
                indicators.ema200 ||
                indicators.rsi14 ||
                indicators.vwap
            ) && (
              <div className="flex flex-wrap items-center gap-1 bg-[#0b0f19]/80 backdrop-blur-xs px-2 py-0.5 rounded border border-slate-800/60 text-[9.5px] font-mono text-slate-300 shadow-sm">
                {/* EMA 8 */}
                {indicators.ema8 && displayIndicators.ema8 !== undefined && (
                  <span className="flex items-center gap-1 px-1 py-0.2 rounded bg-sky-950/60 border border-sky-800/40 text-sky-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block"></span>
                    <span className="text-sky-400 font-sans">EMA 8:</span>
                    <span className="font-bold text-white">{displayIndicators.ema8.toFixed(2)}</span>
                  </span>
                )}

                {/* EMA 16 */}
                {indicators.ema16 && displayIndicators.ema16 !== undefined && (
                  <span className="flex items-center gap-1 px-1 py-0.2 rounded bg-amber-950/60 border border-amber-800/40 text-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                    <span className="text-amber-400 font-sans">EMA 16:</span>
                    <span className="font-bold text-white">{displayIndicators.ema16.toFixed(2)}</span>
                  </span>
                )}

                {/* EMA 20 */}
                {indicators.ema20 && displayIndicators.ema20 !== undefined && (
                  <span className="flex items-center gap-1 px-1 py-0.2 rounded bg-pink-950/60 border border-pink-800/40 text-pink-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block"></span>
                    <span className="text-pink-400 font-sans">EMA 20:</span>
                    <span className="font-bold text-white">{displayIndicators.ema20.toFixed(2)}</span>
                  </span>
                )}

                {/* EMA 50 */}
                {indicators.ema50 && displayIndicators.ema50 !== undefined && (
                  <span className="flex items-center gap-1 px-1 py-0.2 rounded bg-purple-950/60 border border-purple-800/40 text-purple-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
                    <span className="text-purple-400 font-sans">EMA 50:</span>
                    <span className="font-bold text-white">{displayIndicators.ema50.toFixed(2)}</span>
                  </span>
                )}

                {/* EMA 200 */}
                {indicators.ema200 && displayIndicators.ema200 !== undefined && (
                  <span className="flex items-center gap-1 px-1 py-0.2 rounded bg-yellow-950/60 border border-yellow-800/40 text-yellow-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"></span>
                    <span className="text-yellow-400 font-sans">EMA 200:</span>
                    <span className="font-bold text-white">{displayIndicators.ema200.toFixed(2)}</span>
                  </span>
                )}

                {/* RSI 14 */}
                {indicators.rsi14 && displayIndicators.rsi14 !== undefined && (
                  <span className="flex items-center gap-1 px-1 py-0.2 rounded bg-purple-950/60 border border-purple-800/40 text-purple-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
                    <span className="text-purple-400 font-sans">RSI 14:</span>
                    <span className="font-bold text-white">{displayIndicators.rsi14.toFixed(1)}</span>
                  </span>
                )}

                {/* VWAP */}
                {indicators.vwap && displayIndicators.vwap !== undefined && (
                  <span className="flex items-center gap-1 px-1 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"></span>
                    <span className="text-cyan-400 font-sans">VWAP:</span>
                    <span className="font-bold text-white">{displayIndicators.vwap.toFixed(2)}</span>
                  </span>
                )}

                {/* Strategy Telemetry (DPO & ADX) - only shown when strategy indicator is active */}
                {indicators.strategy && displayIndicators.dpo !== undefined && (
                  <span className="hidden xl:flex items-center gap-1 px-1 py-0.2 rounded bg-slate-900 border border-slate-700/60 text-slate-300">
                    <span className="text-slate-400 font-sans">DPO:</span>
                    <span
                      className={`font-bold ${
                        displayIndicators.dpo > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {displayIndicators.dpo > 0 ? '+' : ''}
                      {displayIndicators.dpo.toFixed(1)}
                    </span>
                  </span>
                )}
                {indicators.strategy &&
                  displayIndicators.adx !== undefined &&
                  displayIndicators.adx > 0 && (
                    <span className="hidden xl:flex items-center gap-1 px-1 py-0.2 rounded bg-slate-900 border border-slate-700/60 text-slate-300">
                      <span className="text-slate-400 font-sans">ADX:</span>
                      <span
                        className={`font-bold ${
                          displayIndicators.adx > 22 ? 'text-amber-400' : 'text-slate-300'
                        }`}
                      >
                        {displayIndicators.adx.toFixed(1)}
                      </span>
                    </span>
                  )}
              </div>
            )}
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2"></div>
            <div className="text-xs text-slate-300 font-medium tracking-wide">
              Loading Upstox candles...
            </div>
          </div>
        )}

        {/* No candles state */}
        {!isLoading && (!candles || candles.length === 0) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-4">
            <div className="text-sm font-medium text-slate-400 mb-1">
              No Candle Data Available
            </div>
            <div className="text-xs text-slate-500 max-w-xs">
              Upstox returned no candles for this range. Try adjusting the date range or timeframe.
            </div>
          </div>
        )}

        {/* Chart canvas container */}
        <div ref={chartContainerRef} className="w-full flex-1" />
      </div>
    );
  }
);

CandlestickChart.displayName = 'CandlestickChart';

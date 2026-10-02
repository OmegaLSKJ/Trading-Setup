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
import { liveStreamManager, LiveTick } from '@/lib/live-stream';
import { getIndianMarketStatus } from '@/lib/market-hours';

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
  onCrosshairMove?: (candle: Candle | null) => void;
  onLivePriceUpdate?: (
    price: number,
    change: number,
    changePercent: number,
    direction: 'UP' | 'DOWN' | 'EQUAL'
  ) => void;
  onStrategyUpdate?: (summary: StrategySummary) => void;
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
    const rsiPriceLinesRef = useRef<any[]>([]);
    const markersPluginRef = useRef<any>(null);

    // Active indicators snapshot lookup by timestamp for crosshair hover inspection
    const candleIndicatorsMap = useRef<Map<number, LiveIndicatorsSnapshot>>(new Map());
    const [liveIndicators, setLiveIndicators] = useState<LiveIndicatorsSnapshot | null>(null);
    const [hoverIndicators, setHoverIndicators] = useState<LiveIndicatorsSnapshot | null>(null);

    // Active mutable candles in memory for real-time live ticking
    const activeCandlesRef = useRef<Candle[]>([]);
    const isSyncingRange = useRef(false);
    const lastStrategyRunTimeRef = useRef<number>(0);
    const strategyPendingTimerRef = useRef<NodeJS.Timeout | null>(null);

    const { syncSettings } = useDashboardStore();

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
    } | null>(null);

    const [currentLivePrice, setCurrentLivePrice] = useState<number | null>(null);
    const [tickDirection, setTickDirection] = useState<'UP' | 'DOWN' | 'EQUAL'>('EQUAL');

    // Dynamic Live Strategy Evaluator that recalculates signals & markers in real-time as live data ticks
    const runLiveStrategy = useCallback(() => {
      if (!markersPluginRef.current) return;
      const list = activeCandlesRef.current;

      if (indicators.strategy && list && list.length >= 15) {
        try {
          const summary = evaluateStrategy(list, tradingSymbol);
          const chartMarkers = summary.markers.map((m) => ({
            time: m.time as unknown as Time,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text,
            size: m.size || 2,
          }));
          markersPluginRef.current.setMarkers(chartMarkers);

          if (onStrategyUpdate) {
            onStrategyUpdate(summary);
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
        if (onStrategyUpdate) {
          onStrategyUpdate({
            name: 'Custom 3-Candle Buy Strategy',
            description: '',
            currentTrend: 'NEUTRAL',
            lastSignal: null,
            winRate: 0,
            totalSignals: 0,
            profitableTrades: 0,
            markers: [],
            activeSignals: [],
            trades: [],
          });
        }
      }
    }, [indicators.strategy, tradingSymbol, onStrategyUpdate]);

    const triggerLiveStrategyEvaluation = useCallback(() => {
      const now = Date.now();
      if (now - lastStrategyRunTimeRef.current > 200) {
        lastStrategyRunTimeRef.current = now;
        runLiveStrategy();
      } else if (!strategyPendingTimerRef.current) {
        strategyPendingTimerRef.current = setTimeout(() => {
          strategyPendingTimerRef.current = null;
          lastStrategyRunTimeRef.current = Date.now();
          runLiveStrategy();
        }, 200);
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
          locale: 'en-IN',
          dateFormat: 'dd MMM yyyy',
          timeFormatter: (time: number) => {
            const date = new Date(time * 1000);
            return (
              date.toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              }) + ' IST'
            );
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
            const date = new Date(time * 1000);
            if (tickMarkType === 0) {
              return date.toLocaleDateString('en-IN', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
              });
            }
            if (tickMarkType === 1) {
              return date.toLocaleDateString('en-IN', {
                timeZone: 'Asia/Kolkata',
                month: 'short',
              });
            }
            if (tickMarkType === 2) {
              return date.toLocaleDateString('en-IN', {
                timeZone: 'Asia/Kolkata',
                day: '2-digit',
                month: 'short',
              });
            }
            return date.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
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
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
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
          const date = new Date(timeNum * 1000);
          const timeStr =
            date.toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            }) + ' IST';

          const currentHover = {
            open: candleData.open,
            high: candleData.high,
            low: candleData.low,
            close: candleData.close,
            volume: volumeData?.value,
            timeStr,
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
        if (syncSettings.crosshair) {
          chartSyncBus.emitCrosshair(chartId, Number(param.time), param.point);
        }
      });

      // Time range change handler for sync
      chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
        if (!logicalRange || isSyncingRange.current || !syncSettings.timeRange) return;
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
        resizeObserver.disconnect();
        chart.remove();
        chartApiRef.current = null;
      };
    }, []);

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
        return;
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

      if (indicators.volume) {
        volumeSeriesRef.current.setData(volumeData);
      } else {
        volumeSeriesRef.current.setData([]);
      }

      // Zoom to the most recent 75 candles with right padding
      if (chartApiRef.current && candleData.length > 0) {
        const total = candleData.length;
        chartApiRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, total - 75),
          to: total + 6,
        });
      }

      const last = candles[candles.length - 1];
      setCurrentLivePrice(last.close);
      liveStreamManager.setLastKnownPrice(instrumentKey, last.close);

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
    }, [candles, indicators.volume, instrumentKey]);

    // Real-Time Live Market Data Stream Subscription
    useEffect(() => {
      if (!instrumentKey) return;

      const unsubscribe = liveStreamManager.subscribe(instrumentKey, (tick) => {
        const list = activeCandlesRef.current;
        if (!list || list.length === 0 || !candleSeriesRef.current) return;

        const last = list[list.length - 1];
        if (!last) return;

        const newPrice = Number(tick.price.toFixed(2));
        const direction = newPrice > last.close ? 'UP' : newPrice < last.close ? 'DOWN' : 'EQUAL';

        last.close = newPrice;
        if (newPrice > last.high) last.high = newPrice;
        if (newPrice < last.low) last.low = newPrice;
        if (tick.volumeDelta) {
          last.volume = (last.volume || 0) + tick.volumeDelta;
        }

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

        // 3. Live Dynamic EMAs Update on Canvas
        const emaConfigs = [
          { key: 'ema8', period: 8 },
          { key: 'ema16', period: 16 },
          { key: 'ema20', period: 20 },
          { key: 'ema50', period: 50 },
          { key: 'ema200', period: 200 },
        ];
        emaConfigs.forEach(({ key, period }) => {
          const series = emaSeriesRefs.current.get(key);
          if (series && indicators[key as keyof IndicatorConfig]) {
            const emaPoints = calculateEMA(list, period);
            if (emaPoints.length > 0) {
              const curEma = emaPoints[emaPoints.length - 1].value;
              series.update({
                time: last.time as unknown as Time,
                value: curEma,
              });
            }
          }
        });

        // 4. Live Dynamic RSI Update on Canvas
        if (rsiSeriesRef.current && indicators.rsi14) {
          const rsiPoints = calculateRSI(list, 14);
          if (rsiPoints.length > 0) {
            const curRsi = rsiPoints[rsiPoints.length - 1].value;
            rsiSeriesRef.current.update({
              time: last.time as unknown as Time,
              value: curRsi,
            });
          }
        }

        // 5. Live Dynamic VWAP Update on Canvas
        if (vwapSeriesRef.current && indicators.vwap) {
          const vwapPoints = calculateVWAP(list);
          if (vwapPoints.length > 0) {
            const curVwap = vwapPoints[vwapPoints.length - 1].value;
            vwapSeriesRef.current.update({
              time: last.time as unknown as Time,
              value: curVwap,
            });
          }
        }

        // 6. Update Live Indicators HUD state for instant 60fps display
        const currentSnapshot = computeLiveIndicatorsSnapshot(list);
        setLiveIndicators(currentSnapshot);
        candleIndicatorsMap.current.set(last.time, currentSnapshot);

        setCurrentLivePrice(newPrice);
        setTickDirection(direction);

        if (onLivePriceUpdate && list[0]) {
          const first = list[0];
          const change = newPrice - first.open;
          const changePercent = first.open > 0 ? (change / first.open) * 100 : 0;
          onLivePriceUpdate(newPrice, change, changePercent, direction);
        }

        // 7. Live Strategy Evaluation on SSE live tick
        triggerLiveStrategyEvaluation();
      });

      return () => {
        unsubscribe();
      };
    }, [
      instrumentKey,
      indicators,
      onLivePriceUpdate,
      triggerLiveStrategyEvaluation,
    ]);

    // Update Indicators (EMAs, RSI, and VWAP Series on Chart Canvas)
    useEffect(() => {
      const chart = chartApiRef.current;
      if (!chart || !candles || candles.length === 0) return;

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
          const emaData = calculateEMA(candles, period).map((p) => ({
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
            lastValueVisible: true,
            priceLineVisible: false,
          });

          chart.priceScale('rsi_scale').applyOptions({
            scaleMargins: {
              top: 0.76,
              bottom: 0.02,
            },
            autoScale: true,
            visible: true,
            borderColor: '#334155',
          });

          const p70 = rsiSeries.createPriceLine({
            price: 70,
            color: 'rgba(239, 68, 68, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '70 OB',
          });

          const p30 = rsiSeries.createPriceLine({
            price: 30,
            color: 'rgba(16, 185, 129, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
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

        const rsiData = calculateRSI(candles, 14).map((p) => ({
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
        const vwapData = calculateVWAP(candles).map((p) => ({
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
      timeStr:
        new Date(latestCandle.time * 1000).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }) + ' IST',
    } : null);

    const displayIndicators = hoverIndicators || liveIndicators;

    return (
      <div className="relative w-full h-full flex flex-col bg-[#080c14] select-none overflow-hidden">
        {/* Top-left OHLCV HUD Overlay */}
        <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#0f172a]/95 backdrop-blur-xs px-2.5 py-1 rounded border border-slate-800 text-[11px] font-mono pointer-events-none text-slate-300 shadow-xl">
          {/* Market Status beacon */}
          {(!instrumentKey.startsWith('US|') && !getIndianMarketStatus().isOpen) ? (
            <span className="flex items-center gap-1.5 text-[10px] font-sans font-bold text-rose-400 mr-1 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800/40">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              CLOSED
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-sans font-bold text-emerald-400 mr-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              LIVE
            </span>
          )}

          {currentPriceInfo ? (
            <>
              {currentPriceInfo.timeStr && (
                <span className="text-slate-400 font-sans mr-1">{currentPriceInfo.timeStr}</span>
              )}
              <span>
                <span className="text-slate-500 font-sans">O:</span>{' '}
                <span className="text-white font-medium">{currentPriceInfo.open?.toFixed(2)}</span>
              </span>
              <span>
                <span className="text-slate-500 font-sans">H:</span>{' '}
                <span className="text-emerald-400 font-medium">{currentPriceInfo.high?.toFixed(2)}</span>
              </span>
              <span>
                <span className="text-slate-500 font-sans">L:</span>{' '}
                <span className="text-rose-400 font-medium">{currentPriceInfo.low?.toFixed(2)}</span>
              </span>
              <span>
                <span className="text-slate-500 font-sans">C:</span>{' '}
                <span
                  className={`font-bold transition-colors duration-100 ${
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
                <span>
                  <span className="text-slate-500 font-sans">Vol:</span>{' '}
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
            <span className="text-slate-500">Connecting Upstox feed...</span>
          )}
        </div>

        {/* Dynamic Live Indicators HUD Ribbon */}
        {displayIndicators && (
          <div className="absolute top-9 sm:top-10 left-2 z-10 flex flex-wrap items-center gap-1.5 bg-[#0a0f1d]/90 backdrop-blur-md px-2 py-0.5 rounded border border-slate-800/90 text-[10.5px] font-mono pointer-events-none text-slate-300 shadow-lg">
            <span className="text-slate-400 font-sans font-bold text-[9px] uppercase tracking-wider mr-0.5">
              Indicators:
            </span>

            {/* EMA 8 */}
            {indicators.ema8 && displayIndicators.ema8 !== undefined && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-sky-950/60 border border-sky-800/50 text-sky-300">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block"></span>
                <span className="font-sans text-sky-400 font-semibold text-[10px]">EMA 8:</span>
                <span className="font-bold text-white">{displayIndicators.ema8.toFixed(2)}</span>
              </span>
            )}

            {/* EMA 16 */}
            {indicators.ema16 && displayIndicators.ema16 !== undefined && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                <span className="font-sans text-amber-400 font-semibold text-[10px]">EMA 16:</span>
                <span className="font-bold text-white">{displayIndicators.ema16.toFixed(2)}</span>
              </span>
            )}

            {/* Optional EMAs if enabled */}
            {indicators.ema20 && displayIndicators.ema20 !== undefined && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-pink-950/60 border border-pink-800/50 text-pink-300">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block"></span>
                <span className="font-sans text-pink-400 font-semibold text-[10px]">EMA 20:</span>
                <span className="font-bold text-white">{displayIndicators.ema20.toFixed(2)}</span>
              </span>
            )}
            {indicators.ema50 && displayIndicators.ema50 !== undefined && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-purple-950/60 border border-purple-800/50 text-purple-300">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
                <span className="font-sans text-purple-400 font-semibold text-[10px]">EMA 50:</span>
                <span className="font-bold text-white">{displayIndicators.ema50.toFixed(2)}</span>
              </span>
            )}
            {indicators.ema200 && displayIndicators.ema200 !== undefined && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-yellow-950/60 border border-yellow-800/50 text-yellow-300">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"></span>
                <span className="font-sans text-yellow-400 font-semibold text-[10px]">EMA 200:</span>
                <span className="font-bold text-white">{displayIndicators.ema200.toFixed(2)}</span>
              </span>
            )}

            {/* RSI 14 */}
            {indicators.rsi14 && displayIndicators.rsi14 !== undefined && (
              <span
                className={`flex items-center gap-1 px-1.5 py-0.2 rounded border ${
                  displayIndicators.rsi14 >= 70 && displayIndicators.rsi14 <= 80
                    ? 'bg-emerald-950/90 border-emerald-500/70 text-emerald-300 shadow-xs'
                    : displayIndicators.rsi14 > 80
                    ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                    : displayIndicators.rsi14 < 30
                    ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300'
                    : 'bg-purple-950/60 border-purple-800/40 text-purple-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
                <span className="font-sans text-purple-400 font-semibold text-[10px]">RSI 14:</span>
                <span className="font-bold text-white">{displayIndicators.rsi14.toFixed(1)}</span>
                {displayIndicators.rsi14 >= 70 && displayIndicators.rsi14 <= 80 && (
                  <span className="text-[8px] px-1 py-0 rounded font-sans font-bold bg-emerald-900 text-emerald-300 uppercase">
                    C2 70-80
                  </span>
                )}
              </span>
            )}

            {/* VWAP */}
            {indicators.vwap && displayIndicators.vwap !== undefined && (
              <span className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/50 text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"></span>
                <span className="font-sans text-cyan-400 font-semibold text-[10px]">VWAP:</span>
                <span className="font-bold text-white">{displayIndicators.vwap.toFixed(2)}</span>
              </span>
            )}

            {/* Strategy Components: DPO & ADX */}
            {displayIndicators.dpo !== undefined && (
              <span className="hidden lg:flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700/60 text-slate-300">
                <span className="font-sans text-slate-400 text-[10px]">DPO 20:</span>
                <span
                  className={`font-bold ${
                    displayIndicators.dpo > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {displayIndicators.dpo > 0 ? '+' : ''}
                  {displayIndicators.dpo.toFixed(2)}
                </span>
              </span>
            )}

            {displayIndicators.adx !== undefined && displayIndicators.adx > 0 && (
              <span className="hidden lg:flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700/60 text-slate-300">
                <span className="font-sans text-slate-400 text-[10px]">ADX 14:</span>
                <span
                  className={`font-bold ${
                    displayIndicators.adx > 22 ? 'text-amber-400' : 'text-slate-300'
                  }`}
                >
                  {displayIndicators.adx.toFixed(1)}
                  {displayIndicators.adx > 22 && (
                    <span className="text-[8px] ml-0.5 text-emerald-400 font-bold">&gt;22</span>
                  )}
                </span>
              </span>
            )}
          </div>
        )}

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

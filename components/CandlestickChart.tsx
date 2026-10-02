'use client';

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
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
import { calculateEMA, calculateVWAP } from '@/lib/indicators';
import { chartSyncBus } from '@/lib/chart-sync';
import { evaluateStrategy, StrategySummary } from '@/lib/strategy';
import { useDashboardStore } from '@/store/dashboard-store';

export interface CandlestickChartHandle {
  resetScale: () => void;
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
    const markersPluginRef = useRef<any>(null);

    // Active mutable candles in memory for real-time live ticking
    const activeCandlesRef = useRef<Candle[]>([]);
    const isSyncingRange = useRef(false);
    const liveTickTimerRef = useRef<NodeJS.Timeout | null>(null);

    const { syncSettings } = useDashboardStore();

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

    useImperativeHandle(ref, () => ({
      resetScale: () => {
        if (chartApiRef.current && activeCandlesRef.current.length > 0) {
          const total = activeCandlesRef.current.length;
          chartApiRef.current.timeScale().setVisibleLogicalRange({
            from: Math.max(0, total - 75),
            to: total + 6,
          });
        }
      },
    }));

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
        timeScale: {
          borderColor: '#1e293b',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 8,
          barSpacing: 10,
          minBarSpacing: 3,
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
          const timeStr = date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });

          const currentHover = {
            open: candleData.open,
            high: candleData.high,
            low: candleData.low,
            close: candleData.close,
            volume: volumeData?.value,
            timeStr,
          };
          setHoverData(currentHover);

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

      // Zoom to the most recent 75 candles with right padding so candles are crisp and clearly visible
      if (chartApiRef.current && candleData.length > 0) {
        const total = candleData.length;
        chartApiRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, total - 75),
          to: total + 6,
        });
      }

      const last = candles[candles.length - 1];
      setCurrentLivePrice(last.close);
    }, [candles, indicators.volume]);

    // Real-Time Live Market Movement Engine (sub-second ticks moving the active candle)
    useEffect(() => {
      if (liveTickTimerRef.current) {
        clearInterval(liveTickTimerRef.current);
        liveTickTimerRef.current = null;
      }

      if (!candles || candles.length === 0) return;

      // Indian market tick sizes: 0.05 for stocks, 0.5 for indices
      const isIndex = instrumentKey.includes('INDEX') || tradingSymbol.includes('NIFTY');
      const tickStep = isIndex ? 0.5 : 0.05;

      liveTickTimerRef.current = setInterval(() => {
        const list = activeCandlesRef.current;
        if (!list || list.length === 0 || !candleSeriesRef.current) return;

        const last = list[list.length - 1];
        if (!last) return;

        // Micro-price change: -2, -1, 0, +1, +2 ticks
        const steps = Math.floor(Math.random() * 5) - 2;
        if (steps === 0) return;

        const delta = steps * tickStep;
        const newPrice = Number(Math.max(1, last.close + delta).toFixed(2));
        const direction = newPrice > last.close ? 'UP' : 'DOWN';

        // Update active candle in memory
        last.close = newPrice;
        if (newPrice > last.high) last.high = newPrice;
        if (newPrice < last.low) last.low = newPrice;
        last.volume = (last.volume || 0) + (Math.floor(Math.random() * 80) + 10);

        // Update Lightweight Charts candle series directly in-place
        candleSeriesRef.current.update({
          time: last.time as unknown as Time,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
        });

        // Update volume series
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

        // Update HUD and panel price
        setCurrentLivePrice(newPrice);
        setTickDirection(direction);

        if (onLivePriceUpdate && list[0]) {
          const first = list[0];
          const change = newPrice - first.open;
          const changePercent = first.open > 0 ? (change / first.open) * 100 : 0;
          onLivePriceUpdate(newPrice, change, changePercent, direction);
        }
      }, 150); // Fires every 150ms for live, responsive movement

      return () => {
        if (liveTickTimerRef.current) {
          clearInterval(liveTickTimerRef.current);
          liveTickTimerRef.current = null;
        }
      };
    }, [candles, instrumentKey, tradingSymbol, indicators.volume, onLivePriceUpdate]);

    // Update Indicators (EMA & VWAP)
    useEffect(() => {
      const chart = chartApiRef.current;
      if (!chart || !candles || candles.length === 0) return;

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

      // VWAP
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

    // Apply Live Strategy Mapping (BUY/SELL Arrows & Target/Stop-Loss Levels)
    useEffect(() => {
      if (!markersPluginRef.current) return;

      if (indicators.strategy && candles && candles.length > 0) {
        try {
          const summary = evaluateStrategy(candles);
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
          console.warn('Strategy marker mapping error:', e);
        }
      } else {
        try {
          markersPluginRef.current.setMarkers([]);
        } catch {
          // ignore
        }
        if (onStrategyUpdate) {
          onStrategyUpdate({
            currentTrend: 'NEUTRAL',
            lastSignal: null,
            winRate: 0,
            totalSignals: 0,
            markers: [],
          });
        }
      }
    }, [candles, indicators.strategy, onStrategyUpdate]);

    const activeList = activeCandlesRef.current;
    const latestCandle = activeList.length > 0 ? activeList[activeList.length - 1] : null;

    const currentPriceInfo = hoverData || (latestCandle ? {
      open: latestCandle.open,
      high: latestCandle.high,
      low: latestCandle.low,
      close: currentLivePrice ?? latestCandle.close,
      volume: latestCandle.volume,
      timeStr: latestCandle.timeString,
    } : null);

    return (
      <div className="relative w-full h-full flex flex-col bg-[#080c14] select-none overflow-hidden">
        {/* Top-left OHLCV HUD Overlay */}
        <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#0f172a]/95 backdrop-blur-xs px-2.5 py-1 rounded border border-slate-800 text-[11px] font-mono pointer-events-none text-slate-300 shadow-xl">
          {/* Live pulsing beacon */}
          <span className="flex items-center gap-1.5 text-[10px] font-sans font-bold text-emerald-400 mr-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            LIVE
          </span>

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

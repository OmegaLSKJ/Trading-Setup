'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChartPanelState,
  Candle,
  Timeframe,
  DateRangePreset,
  IndicatorConfig,
} from '@/lib/types';
import { CandlestickChart, CandlestickChartHandle } from './CandlestickChart';
import { getDateRangeForPreset } from '@/lib/date-presets';
import { useDashboardStore } from '@/store/dashboard-store';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  Target,
  History,
} from 'lucide-react';
import { StrategySummary } from '@/lib/strategy';
import { StrategyModal } from './StrategyModal';
import { getIndianMarketStatus } from '@/lib/market-hours';

interface Props {
  panel: ChartPanelState;
}

const TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '1D'];

const DATE_PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: '5D', value: '5D' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: 'YTD', value: 'YTD' },
  { label: '1Y', value: '1Y' },
];

export const ChartPanel: React.FC<Props> = ({ panel }) => {
  const chartRef = useRef<CandlestickChartHandle>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [partialNotice, setPartialNotice] = useState<string | null>(null);
  const [isIndicatorsMenuOpen, setIsIndicatorsMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [isTimeframeMenuOpen, setIsTimeframeMenuOpen] = useState(false);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);

  // Real-time live price states with flashing effects
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveChange, setLiveChange] = useState<number>(0);
  const [liveChangePercent, setLiveChangePercent] = useState<number>(0);
  const [tickFlash, setTickFlash] = useState<'UP' | 'DOWN' | null>(null);
  const [strategySummary, setStrategySummary] = useState<StrategySummary | null>(null);

  const isHydrated = useDashboardStore((s) => s.isHydrated);
  const activeChartId = useDashboardStore((s) => s.activeChartId);
  const setActiveChartId = useDashboardStore((s) => s.setActiveChartId);
  const updateChartTimeframe = useDashboardStore((s) => s.updateChartTimeframe);
  const updateChartDateRange = useDashboardStore((s) => s.updateChartDateRange);
  const toggleChartIndicator = useDashboardStore((s) => s.toggleChartIndicator);
  const setChartExpanded = useDashboardStore((s) => s.setChartExpanded);
  const removeChart = useDashboardStore((s) => s.removeChart);
  const openSymbolSearch = useDashboardStore((s) => s.openSymbolSearch);
  const globalRefreshTrigger = useDashboardStore((s) => s.globalRefreshTrigger);
  const autoRefreshInterval = useDashboardStore((s) => s.autoRefreshInterval);
  const setTradesModalOpen = useDashboardStore((s) => s.setTradesModalOpen);
  const recordTradesForSymbol = useDashboardStore((s) => s.recordTradesForSymbol);
  const targetTradeNavigation = useDashboardStore((s) => s.targetTradeNavigation);
  const clearTradeNavigation = useDashboardStore((s) => s.clearTradeNavigation);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef<number>(0);
  const isPollingRef = useRef<boolean>(false);
  const lastContextRef = useRef<string>(`${panel.instrument.instrument_key}-${panel.timeframe}`);

  // Clear old candles on context change
  useEffect(() => {
    const currentContext = `${panel.instrument.instrument_key}-${panel.timeframe}`;
    if (lastContextRef.current !== currentContext) {
      lastContextRef.current = currentContext;
      setCandles([]);
      setLivePrice(null);
      setErrorMessage(null);
      setPartialNotice(null);
    }
  }, [panel.instrument.instrument_key, panel.timeframe]);

  const [navigatedTradeToast, setNavigatedTradeToast] = useState<string | null>(null);

  // Jump to trade on chart when clicked in the Past Trades ledger
  useEffect(() => {
    if (
      targetTradeNavigation &&
      targetTradeNavigation.symbol.toUpperCase() === panel.instrument.trading_symbol.toUpperCase()
    ) {
      const timeToScroll = targetTradeNavigation.time;
      const tradeId = targetTradeNavigation.id;
      const toastTimer = setTimeout(() => {
        setNavigatedTradeToast(`Navigated to ${tradeId} (${panel.instrument.trading_symbol})`);
      }, 0);

      // Scroll after chart canvas has rendered and retry to ensure candle alignment
      const delays = [80, 250, 600];
      delays.forEach((delay) => {
        setTimeout(() => {
          chartRef.current?.scrollToTime(timeToScroll);
        }, delay);
      });

      clearTradeNavigation();
      const hideTimer = setTimeout(() => setNavigatedTradeToast(null), 3800);
      return () => {
        clearTimeout(toastTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [targetTradeNavigation, panel.instrument.trading_symbol, clearTradeNavigation, candles]);


  const handleStrategyUpdate = useCallback(
    (summary: StrategySummary) => {
      setStrategySummary(summary);
      if (summary.trades && summary.trades.length > 0) {
        recordTradesForSymbol(panel.instrument.trading_symbol, summary.trades);
      }
    },
    [panel.instrument.trading_symbol, recordTradesForSymbol]
  );

  const isActive = activeChartId === panel.id;

  // Fetch candle data with abort, generation sequencing, and in-flight guard
  const loadCandles = useCallback(async () => {
    if (!isHydrated) return;
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    // Abort previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentGen = ++requestGenerationRef.current;
    const currentKey = panel.instrument.instrument_key;
    const currentTf = panel.timeframe;

    setIsLoading(true);
    setErrorMessage(null);
    setPartialNotice(null);

    const { from, to } =
      panel.dateRangePreset === 'custom' && panel.customFrom && panel.customTo
        ? { from: panel.customFrom, to: panel.customTo }
        : getDateRangeForPreset(panel.dateRangePreset);

    try {
      const url = `/api/candles?instrumentKey=${encodeURIComponent(
        currentKey
      )}&timeframe=${currentTf}&from=${from}&to=${to}`;

      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();

      if (currentGen !== requestGenerationRef.current) return;
      if (panel.instrument.instrument_key !== currentKey || panel.timeframe !== currentTf) return;

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch Upstox candles');
      }

      const fetchedCandles = data.candles || [];
      setCandles(fetchedCandles);

      if (data.partial && data.failedRanges && data.failedRanges.length > 0) {
        setPartialNotice(
          `Partial data: ${data.failedRanges.length} date range(s) could not be retrieved from provider.`
        );
      }

      if (fetchedCandles.length > 0) {
        const last = fetchedCandles[fetchedCandles.length - 1];
        const first = fetchedCandles[0];
        setLivePrice(last.close);
        const change = last.close - first.open;
        setLiveChange(change);
        setLiveChangePercent(first.open > 0 ? (change / first.open) * 100 : 0);
      }
    } catch (err: unknown) {
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      if (isAbort) return;
      if (currentGen !== requestGenerationRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Chart panel error [${panel.instrument.trading_symbol}]:`, msg);
      setErrorMessage(msg || 'Error fetching Upstox data');
    } finally {
      if (currentGen === requestGenerationRef.current) {
        setIsLoading(false);
        isPollingRef.current = false;
      }
    }
  }, [
    isHydrated,
    panel.instrument.instrument_key,
    panel.instrument.trading_symbol,
    panel.timeframe,
    panel.dateRangePreset,
    panel.customFrom,
    panel.customTo,
  ]);

  // Initial load and dependency updates
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCandles();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadCandles, globalRefreshTrigger]);


  // Auto-refresh polling timer
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      loadCandles();
    }, autoRefreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, loadCandles]);

  // Callback when a real-time micro-tick arrives from the live stream
  const handleLivePriceUpdate = useCallback((
    price: number,
    change: number,
    changePercent: number,
    direction: 'UP' | 'DOWN' | 'EQUAL'
  ) => {
    setLivePrice(price);
    setLiveChange(change);
    setLiveChangePercent(changePercent);

    if (direction === 'UP' || direction === 'DOWN') {
      setTickFlash(direction);
      setTimeout(() => setTickFlash(null), 180);
    }
  }, []);

  const isPositive = liveChange >= 0;

  const isUS = panel.instrument.instrument_key.startsWith('US|');
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: isUS ? 'America/New_York' : 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const requestedRange =
    panel.dateRangePreset === 'custom' && panel.customFrom && panel.customTo
      ? { from: panel.customFrom, to: panel.customTo }
      : getDateRangeForPreset(panel.dateRangePreset);
  const requestedTo = requestedRange.to;

  const isHistoricalOnly = requestedTo < todayStr;

  return (
    <div
      onClick={() => {
        setActiveChartId(panel.id);
        setIsTimeframeMenuOpen(false);
        setIsDateMenuOpen(false);
        setIsIndicatorsMenuOpen(false);
      }}
      onClickCapture={() => setActiveChartId(panel.id)}
      onMouseDownCapture={() => setActiveChartId(panel.id)}
      className={`relative flex flex-col h-full w-full bg-[#0b0f19] border transition-all duration-150 overflow-hidden ${
        isActive
          ? 'border-2 border-emerald-500 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500/50'
          : 'border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Top Chart Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#0f172a] border-b border-slate-800/80 gap-1.5 shrink-0 select-none text-xs min-h-[34px] overflow-hidden">
        {/* Symbol and price info */}
        <div className="flex items-center gap-1.5 min-w-0 shrink">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openSymbolSearch(panel.id);
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/70 hover:bg-slate-700 text-white font-semibold tracking-wide transition-colors group cursor-pointer shrink-0"
            title="Click to change symbol"
          >
            <span className="truncate max-w-[85px] sm:max-w-[110px]">
              {panel.instrument.trading_symbol}
            </span>
            <Search className="w-2.5 h-2.5 text-slate-400 group-hover:text-emerald-400" />
          </button>

          <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
            {panel.instrument.exchange}
          </span>

          {/* Market Status (Live or Closed) */}
          {(() => {
            const isUsStock = panel.instrument.instrument_key.startsWith('US|');
            const indianStatus = getIndianMarketStatus();
            const isOpen = isUsStock || indianStatus.isOpen;
            return (
              <span
                className={`text-[8.5px] uppercase font-mono px-1 py-0.2 rounded font-semibold shrink-0 hidden sm:inline ${
                  isOpen
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                    : 'bg-rose-950/80 text-rose-400 border border-rose-800/40'
                }`}
                title={isOpen ? 'Market is currently open' : `Market is closed (${indianStatus.reason})`}
              >
                {isOpen ? 'OPEN' : 'CLOSED'}
              </span>
            );
          })()}

          {isActive && (
            <span className="text-[8px] uppercase font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shrink-0 hidden md:inline">
              ACTIVE
            </span>
          )}

          {/* Live Price with authentic closing/LTP */}
          {livePrice !== null && (
            <div
              className={`flex items-center gap-1 font-mono text-[11px] whitespace-nowrap px-1 py-0.2 rounded transition-colors duration-150 shrink-0 ${
                tickFlash === 'UP'
                  ? 'bg-emerald-900/60 text-emerald-300'
                  : tickFlash === 'DOWN'
                  ? 'bg-rose-900/60 text-rose-300'
                  : ''
              }`}
            >
              <span className="text-white font-bold">
                {panel.instrument.instrument_key.startsWith('US|') ? '$' : '₹'}
                {livePrice.toFixed(2)}
              </span>
              <span
                className={`text-[9.5px] font-medium hidden xs:inline ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? '+' : ''}
                {liveChangePercent.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Timeframe Selector Dropdown (compact, clean, never wraps or overlaps) */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsTimeframeMenuOpen(!isTimeframeMenuOpen);
                setIsDateMenuOpen(false);
                setIsIndicatorsMenuOpen(false);
              }}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-emerald-400 font-mono text-[10px] font-bold border border-slate-700/60 cursor-pointer shadow-xs"
              title="Select timeframe"
            >
              <span>{panel.timeframe}</span>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
            </button>

            {isTimeframeMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-20 bg-[#1e293b] border border-slate-700 rounded shadow-2xl z-50 py-1"
              >
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => {
                      updateChartTimeframe(panel.id, tf);
                      setIsTimeframeMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1 text-[11px] font-mono hover:bg-slate-700 transition-colors ${
                      panel.timeframe === tf ? 'text-emerald-400 font-bold bg-slate-800' : 'text-slate-300'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Strategy Unified Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (panel.indicators.strategy) {
                setIsStrategyModalOpen(true);
              } else {
                toggleChartIndicator(panel.id, 'strategy');
              }
            }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer border ${
              panel.indicators.strategy
                ? strategySummary?.telemetry?.isTakeProfitHit
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 animate-pulse font-bold'
                  : strategySummary?.telemetry?.hasOpenPosition
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-slate-200'
            }`}
            title={
              panel.indicators.strategy
                ? '3-Candle Strategy: Click to inspect live telemetry & rules'
                : 'Click to enable 3-Candle Strategy'
            }
          >
            <Target className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">
              {panel.indicators.strategy
                ? strategySummary?.telemetry?.isTakeProfitHit
                  ? 'TP +2%!'
                  : strategySummary?.telemetry?.hasOpenPosition
                  ? `BUY @ ${strategySummary.telemetry.openPositionEntryPrice?.toFixed(1) || ''}`
                  : '3-CANDLE'
                : 'Strategy'}
            </span>
          </button>

          {/* Past Trades button (visible when strategy is enabled) */}
          {panel.indicators.strategy && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTradesModalOpen(true, panel.instrument.trading_symbol);
              }}
              className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[10px] font-mono cursor-pointer transition-all"
              title={`Inspect past trades for ${panel.instrument.trading_symbol}`}
            >
              <History className="w-2.5 h-2.5 text-purple-400 shrink-0" />
              <span>{strategySummary?.trades?.length || 0}</span>
            </button>
          )}

          {/* Date range picker dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDateMenuOpen(!isDateMenuOpen);
                setIsIndicatorsMenuOpen(false);
                setIsTimeframeMenuOpen(false);
              }}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors cursor-pointer border border-slate-700/40"
              title="Select date range"
            >
              <span>{panel.dateRangePreset.toUpperCase()}</span>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
            </button>

            {isDateMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-28 bg-[#1e293b] border border-slate-700 rounded shadow-xl z-50 py-1"
              >
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => {
                      updateChartDateRange(panel.id, p.value);
                      setIsDateMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1 text-xs hover:bg-slate-700 transition-colors ${
                      panel.dateRangePreset === p.value
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Indicators dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsIndicatorsMenuOpen(!isIndicatorsMenuOpen);
                setIsDateMenuOpen(false);
              }}
              className={`p-1 rounded transition-colors cursor-pointer ${
                isIndicatorsMenuOpen
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Technical Indicators"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            {isIndicatorsMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-44 bg-[#1e293b] border border-slate-700 rounded shadow-2xl z-50 py-1.5 text-xs text-slate-200"
              >
                <div className="px-3 py-1 font-semibold text-[10px] text-amber-400 uppercase tracking-wider border-b border-slate-700/60">
                  Custom 3-Candle Strategy
                </div>
                <label className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-700/60 cursor-pointer">
                  <span className="text-amber-300 font-semibold">Signals &amp; 2% TP Exits</span>
                  <input
                    type="checkbox"
                    checked={panel.indicators.strategy}
                    onChange={() => toggleChartIndicator(panel.id, 'strategy')}
                    className="rounded accent-amber-500 cursor-pointer"
                  />
                </label>

                <div className="px-3 py-1 font-semibold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-700/60 mt-1">
                  Exponential Moving Averages
                </div>
                {[
                  { key: 'ema8', label: 'EMA 8 (Fast Strategy)', color: 'text-sky-400' },
                  { key: 'ema16', label: 'EMA 16 (Slow Strategy)', color: 'text-amber-400' },
                  { key: 'ema20', label: 'EMA 20 (Momentum)', color: 'text-pink-400' },
                  { key: 'ema50', label: 'EMA 50 (Intermediate)', color: 'text-purple-400' },
                  { key: 'ema200', label: 'EMA 200 (Macro Trend)', color: 'text-yellow-400' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer"
                  >
                    <span className={item.color}>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={panel.indicators[item.key as keyof IndicatorConfig]}
                      onChange={() => toggleChartIndicator(panel.id, item.key as keyof IndicatorConfig)}
                      className="rounded accent-emerald-500 cursor-pointer"
                    />
                  </label>
                ))}

                <div className="px-3 py-1 font-semibold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-700/60 mt-1">
                  Oscillators &amp; Volume
                </div>
                <label className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer">
                  <span className="text-purple-300 font-medium">RSI 14 (70/30 Bands)</span>
                  <input
                    type="checkbox"
                    checked={panel.indicators.rsi14}
                    onChange={() => toggleChartIndicator(panel.id, 'rsi14')}
                    className="rounded accent-purple-500 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer">
                  <span className="text-cyan-300 font-medium">VWAP (Daily Anchor)</span>
                  <input
                    type="checkbox"
                    checked={panel.indicators.vwap}
                    onChange={() => toggleChartIndicator(panel.id, 'vwap')}
                    className="rounded accent-cyan-500 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer">
                  <span className="text-slate-300">Volume Histogram</span>
                  <input
                    type="checkbox"
                    checked={panel.indicators.volume}
                    onChange={() => toggleChartIndicator(panel.id, 'volume')}
                    className="rounded accent-emerald-500 cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Pan Graph Up / Drag Top */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              chartRef.current?.panVertical?.(-35);
            }}
            className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer hidden sm:flex"
            title="Pan Graph Up / Drag Top (or drag inside chart canvas)"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {/* Pan Graph Down / Drag Down */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              chartRef.current?.panVertical?.(35);
            }}
            className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer hidden sm:flex"
            title="Pan Graph Down / Drag Down (or drag inside chart canvas)"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {/* Reset scale */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              chartRef.current?.resetScale();
            }}
            className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Auto Fit / Reset Scale (or double-click price scale)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Refresh single chart */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadCandles();
            }}
            className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Refresh Chart"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`}
            />
          </button>

          {/* Expand / Fullscreen */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setChartExpanded(panel.id, !panel.isExpanded);
            }}
            className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title={panel.isExpanded ? 'Restore Size' : 'Maximize Chart'}
          >
            {panel.isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close / Remove Chart */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeChart(panel.id);
            }}
            className="p-1 rounded bg-slate-800/60 hover:bg-rose-900/60 text-slate-400 hover:text-rose-200 transition-colors cursor-pointer"
            title="Remove Chart Panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Partial ranges warning banner */}
      {partialNotice && (
        <div className="bg-amber-950/80 border-b border-amber-800/60 px-3 py-1.5 flex items-center justify-between text-xs text-amber-200 z-10 shrink-0">
          <span className="truncate pr-2">⚠️ {partialNotice}</span>
          <button
            onClick={() => setPartialNotice(null)}
            className="text-amber-400 hover:text-white text-[10px] font-mono cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error notification banner */}
      {errorMessage && (
        <div className="bg-rose-950/80 border-b border-rose-800/60 px-3 py-1.5 flex items-center justify-between text-xs text-rose-200 z-10 shrink-0">
          <span className="truncate pr-2">⚠️ {errorMessage}</span>
          <button
            onClick={() => loadCandles()}
            className="underline hover:text-white font-medium shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Candlestick Chart Canvas */}
      <div className="flex-1 w-full relative min-h-0">
        {navigatedTradeToast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-purple-950/95 border border-purple-500/80 text-purple-200 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none animate-bounce">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            <Target className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>{navigatedTradeToast}</span>
          </div>
        )}
        <CandlestickChart
          ref={chartRef}
          chartId={panel.id}
          instrumentKey={panel.instrument.instrument_key}
          tradingSymbol={panel.instrument.trading_symbol}
          timeframe={panel.timeframe}
          candles={candles}
          indicators={panel.indicators}
          isLoading={isLoading}
          isLiveDisabled={isHistoricalOnly}
          onLivePriceUpdate={handleLivePriceUpdate}
          onStrategyUpdate={handleStrategyUpdate}
        />
      </div>

      {/* Strategy Detail & Performance Modal */}
      <StrategyModal
        isOpen={isStrategyModalOpen}
        onClose={() => setIsStrategyModalOpen(false)}
        tradingSymbol={panel.instrument.trading_symbol}
        strategySummary={strategySummary}
      />
    </div>
  );
};

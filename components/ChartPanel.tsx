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
  RotateCcw,
  Search,
  Target,
} from 'lucide-react';
import { StrategySummary } from '@/lib/strategy';
import { StrategyModal } from './StrategyModal';

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
  const [isIndicatorsMenuOpen, setIsIndicatorsMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);

  // Real-time live price states with flashing effects
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveChange, setLiveChange] = useState<number>(0);
  const [liveChangePercent, setLiveChangePercent] = useState<number>(0);
  const [tickFlash, setTickFlash] = useState<'UP' | 'DOWN' | null>(null);
  const [strategySummary, setStrategySummary] = useState<StrategySummary | null>(null);

  const {
    activeChartId,
    setActiveChartId,
    updateChartTimeframe,
    updateChartDateRange,
    toggleChartIndicator,
    setChartExpanded,
    removeChart,
    openSymbolSearch,
    globalRefreshTrigger,
    autoRefreshInterval,
  } = useDashboardStore();

  const isActive = activeChartId === panel.id;

  // Fetch candle data
  const loadCandles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { from, to } =
      panel.dateRangePreset === 'custom' && panel.customFrom && panel.customTo
        ? { from: panel.customFrom, to: panel.customTo }
        : getDateRangeForPreset(panel.dateRangePreset);

    try {
      const url = `/api/candles?instrumentKey=${encodeURIComponent(
        panel.instrument.instrument_key
      )}&timeframe=${panel.timeframe}&from=${from}&to=${to}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch Upstox candles');
      }

      const fetchedCandles = data.candles || [];
      setCandles(fetchedCandles);

      if (fetchedCandles.length > 0) {
        const last = fetchedCandles[fetchedCandles.length - 1];
        const first = fetchedCandles[0];
        setLivePrice(last.close);
        const change = last.close - first.open;
        setLiveChange(change);
        setLiveChangePercent(first.open > 0 ? (change / first.open) * 100 : 0);
      }
    } catch (err: any) {
      console.warn(`Chart panel error [${panel.instrument.trading_symbol}]:`, err.message);
      setErrorMessage(err.message || 'Error fetching Upstox data');
    } finally {
      setIsLoading(false);
    }
  }, [panel.instrument.instrument_key, panel.timeframe, panel.dateRangePreset, panel.customFrom, panel.customTo]);

  // Initial load and dependency updates
  useEffect(() => {
    loadCandles();
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
  const handleLivePriceUpdate = (
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
  };

  const isPositive = liveChange >= 0;

  return (
    <div
      onClick={() => setActiveChartId(panel.id)}
      className={`relative flex flex-col h-full w-full bg-[#0b0f19] border transition-all duration-150 overflow-hidden ${
        isActive
          ? 'border-emerald-500/80 shadow-lg shadow-emerald-950/20'
          : 'border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Top Chart Toolbar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#0f172a] border-b border-slate-800/80 gap-2 shrink-0 select-none text-xs">
        {/* Symbol and price info */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openSymbolSearch(panel.id);
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/70 hover:bg-slate-700 text-white font-semibold tracking-wide transition-colors group cursor-pointer"
            title="Click to change symbol"
          >
            <span className="truncate max-w-[110px]">
              {panel.instrument.trading_symbol}
            </span>
            <Search className="w-3 h-3 text-slate-400 group-hover:text-emerald-400" />
          </button>

          <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
            {panel.instrument.exchange}
          </span>

          {/* Live Price with flashing tick effect */}
          {livePrice !== null && (
            <div
              className={`flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap px-1.5 py-0.5 rounded transition-colors duration-150 ${
                tickFlash === 'UP'
                  ? 'bg-emerald-900/60 text-emerald-300'
                  : tickFlash === 'DOWN'
                  ? 'bg-rose-900/60 text-rose-300'
                  : ''
              }`}
            >
              <span className="text-white font-bold">₹{livePrice.toFixed(2)}</span>
              <span
                className={`text-[10px] font-medium ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? '+' : ''}
                {liveChange.toFixed(2)} ({isPositive ? '+' : ''}
                {liveChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}

          {/* Strategy Live Signal Badge - Applied on all stocks */}
          {panel.indicators.strategy && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsStrategyModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[10px] font-mono cursor-pointer transition-colors shadow-xs"
              title="Custom 3-Candle Strategy: Click to inspect signals, indicator levels & rules"
            >
              <Target className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-amber-300 font-bold hidden sm:inline">3-CANDLE:</span>
              {strategySummary?.lastSignal ? (
                <span className="text-emerald-400 font-bold">
                  BUY @ {panel.instrument.instrument_key.includes('US|') ? '$' : '₹'}{strategySummary.lastSignal.price.toFixed(1)}
                  <span className="hidden md:inline text-cyan-300 ml-1">(TP: +2%)</span>
                </span>
              ) : (
                <span className="text-slate-400">SCANNING</span>
              )}
            </button>
          )}
        </div>

        {/* Timeframe Quick Selector */}
        <div className="flex items-center gap-0.5 bg-slate-900/80 p-0.5 rounded border border-slate-800">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={(e) => {
                e.stopPropagation();
                updateChartTimeframe(panel.id, tf);
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                panel.timeframe === tf
                  ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-1">
          {/* Strategy Quick Toggle Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleChartIndicator(panel.id, 'strategy');
            }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              panel.indicators.strategy
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Live Strategy Mapping (BUY/SELL Signals & Levels)"
          >
            <Target className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Strategy</span>
          </button>
          {/* Date range picker dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDateMenuOpen(!isDateMenuOpen);
                setIsIndicatorsMenuOpen(false);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors cursor-pointer"
              title="Select date range"
            >
              <span>{panel.dateRangePreset.toUpperCase()}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
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
                <div className="px-3 py-1 font-semibold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
                  Moving Averages
                </div>
                {(['ema8', 'ema16', 'ema20', 'ema50', 'ema200'] as (keyof IndicatorConfig)[]).map((ind) => (
                  <label
                    key={ind}
                    className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer"
                  >
                    <span>{ind.toUpperCase()}</span>
                    <input
                      type="checkbox"
                      checked={panel.indicators[ind]}
                      onChange={() => toggleChartIndicator(panel.id, ind)}
                      className="rounded accent-emerald-500 cursor-pointer"
                    />
                  </label>
                ))}

                <div className="px-3 py-1 font-semibold text-[10px] text-amber-400 uppercase tracking-wider border-b border-slate-700/60 mt-1">
                  Strategy Mapping
                </div>
                <label className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer">
                  <span className="text-amber-300 font-medium">BUY/SELL Signals</span>
                  <input
                    type="checkbox"
                    checked={panel.indicators.strategy}
                    onChange={() => toggleChartIndicator(panel.id, 'strategy')}
                    className="rounded accent-amber-500 cursor-pointer"
                  />
                </label>

                <div className="px-3 py-1 font-semibold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-700/60 mt-1">
                  Overlays & Volume
                </div>
                <label className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer">
                  <span>VWAP</span>
                  <input
                    type="checkbox"
                    checked={panel.indicators.vwap}
                    onChange={() => toggleChartIndicator(panel.id, 'vwap')}
                    className="rounded accent-emerald-500 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between px-3 py-1 hover:bg-slate-700/60 cursor-pointer">
                  <span>Volume Bar</span>
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

          {/* Reset scale */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              chartRef.current?.resetScale();
            }}
            className="p-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Auto / Reset Scale"
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
      <div className="flex-1 w-full relative">
        <CandlestickChart
          ref={chartRef}
          chartId={panel.id}
          instrumentKey={panel.instrument.instrument_key}
          tradingSymbol={panel.instrument.trading_symbol}
          timeframe={panel.timeframe}
          candles={candles}
          indicators={panel.indicators}
          isLoading={isLoading}
          onLivePriceUpdate={handleLivePriceUpdate}
          onStrategyUpdate={setStrategySummary}
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

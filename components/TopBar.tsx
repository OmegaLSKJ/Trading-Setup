'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { LayoutGridMode, Timeframe } from '@/lib/types';
import {
  getMarketStatusForInstrument,
  getIndianMarketStatus,
  getUSMarketStatus,
  getMCXMarketStatus,
} from '@/lib/market-hours';
import {
  Activity,
  BarChart2,
  RefreshCw,
  Search,
  Settings,
  Plus,
  LayoutGrid,
  Layers,
  ChevronDown,
  Target,
  Globe,
  Check,
  Minimize2,
} from 'lucide-react';
import { TIMEZONE_OPTIONS, getTimezoneOption } from '@/lib/timezones';

const LAYOUT_OPTIONS: { mode: LayoutGridMode; label: string; icon: string; description: string }[] = [
  { mode: '1', label: '1 Chart', icon: '■', description: 'Single view' },
  { mode: '2h', label: '2 Charts (Horizontal)', icon: '▬▬', description: '2 stacked rows' },
  { mode: '2v', label: '2 Charts (Vertical)', icon: '❚❚', description: '2 columns' },
  { mode: '4', label: '4 Grid', icon: '⊞', description: '2x2 quad layout' },
  { mode: '6', label: '6 Grid', icon: '▦', description: 'Max 6 grid (3x2)' },
];

const GLOBAL_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '1h', '1D'];

export const TopBar: React.FC = () => {
  // Selector-based subscriptions to prevent unnecessary re-renders
  const charts = useDashboardStore((s) => s.charts);
  const activeChartId = useDashboardStore((s) => s.activeChartId);
  const layoutMode = useDashboardStore((s) => s.layoutMode);
  const setLayoutMode = useDashboardStore((s) => s.setLayoutMode);
  const setGlobalTimeframe = useDashboardStore((s) => s.setGlobalTimeframe);
  const triggerGlobalRefresh = useDashboardStore((s) => s.triggerGlobalRefresh);
  const openSymbolSearch = useDashboardStore((s) => s.openSymbolSearch);
  const setLayoutModalOpen = useDashboardStore((s) => s.setLayoutModalOpen);
  const setSettingsModalOpen = useDashboardStore((s) => s.setSettingsModalOpen);
  const addChart = useDashboardStore((s) => s.addChart);
  const applyStrategyToAllCharts = useDashboardStore((s) => s.applyStrategyToAllCharts);
  const connectionStatus = useDashboardStore((s) => s.connectionStatus);
  const connectionDetails = useDashboardStore((s) => s.connectionDetails);
  const setConnectionStatus = useDashboardStore((s) => s.setConnectionStatus);
  const selectedTimezone = useDashboardStore((s) => s.selectedTimezone);
  const setTimezone = useDashboardStore((s) => s.setTimezone);
  const setChartExpanded = useDashboardStore((s) => s.setChartExpanded);

  const activeChart = charts.find((c) => c.id === activeChartId) || charts[0];
  const activeInstrument = activeChart?.instrument;

  const isStrategyActive = charts.some((c) => c.indicators.strategy);
  const isAnyChartExpanded = charts.some((c) => c.isExpanded);

  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);
  const [isTimezoneDropdownOpen, setIsTimezoneDropdownOpen] = useState(false);
  const [isMarketMenuOpen, setIsMarketMenuOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const timezoneMenuRef = useRef<HTMLDivElement>(null);
  const marketMenuRef = useRef<HTMLDivElement>(null);

  const isCheckingHealthRef = useRef(false);

  const currentTimezoneOpt = getTimezoneOption(selectedTimezone || 'Asia/Kolkata');

  // Periodic heartbeat timer to ensure market hours and badges update dynamically
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Targeted click outside listener using refs
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (layoutMenuRef.current && !layoutMenuRef.current.contains(target)) {
        setIsLayoutDropdownOpen(false);
      }
      if (statusMenuRef.current && !statusMenuRef.current.contains(target)) {
        setIsStatusPopoverOpen(false);
      }
      if (timezoneMenuRef.current && !timezoneMenuRef.current.contains(target)) {
        setIsTimezoneDropdownOpen(false);
      }
      if (marketMenuRef.current && !marketMenuRef.current.contains(target)) {
        setIsMarketMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Poll health endpoint periodically with an in-flight guard
  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      if (isCheckingHealthRef.current) return;
      isCheckingHealthRef.current = true;
      try {
        const res = await fetch('/api/health');
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          setConnectionStatus(data.status, {
            latencyMs: data.latencyMs,
            statusMessage: data.statusMessage,
            instrumentsIndexed: data.instrumentsIndexed,
          });
        } else {
          const errData = await res.json().catch(() => null);
          const status = errData?.status || (res.status === 401 ? 'TOKEN_ERROR' : 'UPSTREAM_UNREACHABLE');
          setConnectionStatus(status, {
            statusMessage: errData?.statusMessage || `HTTP ${res.status}`,
          });
        }
      } catch {
        if (!isMounted) return;
        setConnectionStatus('UPSTREAM_UNREACHABLE', { statusMessage: 'Network disconnected' });
      } finally {
        isCheckingHealthRef.current = false;
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [setConnectionStatus]);

  return (
    <header className="min-h-12 w-full bg-[#0b0f19] border-b border-slate-800 flex flex-wrap items-center justify-between px-3 py-1 shrink-0 select-none z-30 gap-2">
      {/* Brand & Symbol Search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
          <div className="w-7 h-7 rounded bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
              <span>MARKET CHARTS</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-emerald-400 border border-slate-700 font-mono">
                UPSTOX V3
              </span>
            </div>
            <div className="text-[10px] text-slate-400 leading-none">
              Indian Market Multi-Chart Terminal
            </div>
          </div>
        </div>

        {/* Global Symbol Search Button */}
        <button
          onClick={() => openSymbolSearch()}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer group"
          title="Search symbols (Ctrl/Cmd + K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
          <span className="font-medium">Search Instrument</span>
          <kbd className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono border border-slate-700">
            /
          </kbd>
        </button>
      </div>

      {/* Center Controls: Global Timeframe, Refresh, Layout */}
      <div className="flex items-center gap-2">
        {/* Global Timeframe Selector */}
        <div className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded border border-slate-800">
          <span className="text-[10px] text-slate-500 uppercase px-1 font-semibold">
            All:
          </span>
          {GLOBAL_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setGlobalTimeframe(tf)}
              className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title={`Set all open charts to ${tf}`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* One and Only Strategy Button to Activate / Toggle */}
        <button
          onClick={() => {
            const willEnable = !isStrategyActive;
            applyStrategyToAllCharts(willEnable);
            triggerGlobalRefresh();
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium transition-all shadow-xs cursor-pointer ${
            isStrategyActive
              ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/50 text-amber-300 shadow-amber-950/30'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}
          title={
            isStrategyActive
              ? 'Custom 3-Candle Strategy is ACTIVE on all charts. Click to deactivate.'
              : 'Click to activate Custom 3-Candle Strategy across all charts'
          }
        >
          <div className="relative flex h-2 w-2">
            {isStrategyActive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isStrategyActive ? 'bg-emerald-500' : 'bg-slate-500'
              }`}
            ></span>
          </div>
          <Target
            className={`w-3.5 h-3.5 ${
              isStrategyActive ? 'text-amber-400' : 'text-slate-400'
            }`}
          />
          <span className="font-semibold hidden sm:inline">
            {isStrategyActive ? '3-Candle Strategy' : 'Activate Strategy'}
          </span>
          <span className="font-semibold sm:hidden">
            {isStrategyActive ? 'Strategy' : 'Activate'}
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase tracking-wider ${
              isStrategyActive
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isStrategyActive ? 'ACTIVE' : 'OFF'}
          </span>
        </button>

        {/* Refresh All Charts */}
        <button
          onClick={triggerGlobalRefresh}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Refresh All Charts"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Refresh All</span>
        </button>

        {/* Layout Mode Selector Dropdown */}
        <div ref={layoutMenuRef} className="relative">
          <button
            onClick={() => {
              setIsLayoutDropdownOpen((prev) => !prev);
              setIsStatusPopoverOpen(false);
              setIsTimezoneDropdownOpen(false);
              setIsMarketMenuOpen(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-200 hover:text-white transition-all cursor-pointer shadow-xs"
            title="Choose grid layout (Max 6 charts)"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold uppercase tracking-wide">{layoutMode} Grid</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isLayoutDropdownOpen && (
            <div
              onClick={() => setIsLayoutDropdownOpen(false)}
              className="absolute right-0 top-full mt-1.5 w-60 bg-[#162032] border border-slate-700/90 rounded-lg shadow-2xl p-1.5 z-50 text-xs backdrop-blur-md"
            >
              <div className="flex items-center justify-between px-2.5 py-1 font-semibold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-700/60 mb-1">
                <span>Grid Layouts</span>
                <span className="text-emerald-400 font-mono text-[9px] bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-800/40">
                  Max 6 Charts
                </span>
              </div>
              <div className="space-y-0.5">
                {LAYOUT_OPTIONS.map((opt) => {
                  const isSelected = layoutMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      onClick={() => {
                        setLayoutMode(opt.mode);
                        setIsLayoutDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold shadow-xs'
                          : 'text-slate-300 hover:bg-slate-800/70 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`text-base font-mono shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {opt.icon}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{opt.label}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {opt.description}
                          </span>
                        </div>
                      </div>
                      {isSelected ? (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-[8.5px] uppercase font-mono px-1 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                            Active
                          </span>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Restore Grid Button (only visible when a chart is maximized) */}
        {isAnyChartExpanded && (
          <button
            onClick={() => setChartExpanded('', false)}
            className="flex items-center gap-1 px-2 py-1.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-300 text-xs font-semibold transition-colors cursor-pointer animate-pulse shadow-sm"
            title="A chart is currently maximized. Click to restore grid view."
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Restore Grid</span>
          </button>
        )}

        {/* Add Chart Button (capped at 6) */}
        <button
          onClick={() => addChart()}
          disabled={charts.length >= 6}
          className={`flex items-center gap-1 px-2 py-1.5 rounded transition-all cursor-pointer border ${
            charts.length >= 6
              ? 'bg-slate-800/30 border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
              : 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/30 text-emerald-400 hover:text-emerald-300 shadow-xs'
          }`}
          title={charts.length >= 6 ? 'Maximum 6 Charts limit reached' : `Add Chart (${charts.length}/6)`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[11px] font-mono font-semibold hidden md:inline">
            {charts.length}/6
          </span>
        </button>

        {/* Layouts Manager Modal Trigger */}
        <button
          onClick={() => setLayoutModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Saved Layouts"
        >
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden lg:inline">Layouts</span>
        </button>
      </div>

      {/* Right Controls: Connection Status & Settings */}
      <div className="flex items-center gap-2">
        {/* Dynamic Market Session Badge (Reflects Active Selected Instrument) */}
        {(() => {
          const activeStatus = getMarketStatusForInstrument(activeInstrument, currentDate);
          const indianStatus = getIndianMarketStatus(currentDate);
          const usStatus = getUSMarketStatus(currentDate);
          const mcxStatus = getMCXMarketStatus(currentDate);

          return (
            <div ref={marketMenuRef} className="relative">
              <button
                onClick={() => {
                  setIsMarketMenuOpen((prev) => !prev);
                  setIsTimezoneDropdownOpen(false);
                  setIsLayoutDropdownOpen(false);
                  setIsStatusPopoverOpen(false);
                }}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium transition-all cursor-pointer ${
                  activeStatus.isOpen
                    ? 'bg-emerald-950/80 hover:bg-emerald-900/90 border-emerald-500/40 text-emerald-400'
                    : activeStatus.session === 'PRE_MARKET' || activeStatus.session === 'POST_MARKET'
                    ? 'bg-amber-950/80 hover:bg-amber-900/90 border-amber-500/40 text-amber-300'
                    : 'bg-rose-950/80 hover:bg-rose-900/90 border-rose-500/40 text-rose-300'
                }`}
                title={`${activeStatus.exchange} (${activeInstrument?.trading_symbol || 'Active'}): ${activeStatus.reason} • Click for all markets overview`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeStatus.isOpen
                      ? 'bg-emerald-500 animate-pulse'
                      : activeStatus.session === 'PRE_MARKET' || activeStatus.session === 'POST_MARKET'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="font-semibold">
                  {activeStatus.exchange}: {activeStatus.session === 'PRE_MARKET' ? 'PRE-MKT' : activeStatus.session === 'POST_MARKET' ? 'AFTER-HRS' : activeStatus.isOpen ? 'OPEN' : 'CLOSED'}
                </span>
                {!activeStatus.isOpen && (
                  <span className="hidden xl:inline text-slate-400 text-[10px] font-sans">
                    ({activeStatus.reason})
                  </span>
                )}
                <ChevronDown className="w-3 h-3 text-slate-400 opacity-70 ml-0.5" />
              </button>

              {/* Global Markets & Active Instrument Overview Popover */}
              {isMarketMenuOpen && (
                <div
                  className="absolute right-0 mt-1.5 w-80 bg-[#0d1322] border border-slate-700/90 rounded-lg shadow-2xl z-50 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Market Trading Sessions</span>
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
                      LIVE SYNC
                    </span>
                  </div>

                  {/* Active Selected Instrument Status */}
                  <div className="mb-2.5 p-2 rounded bg-slate-900/90 border border-slate-800">
                    <div className="flex items-center justify-between text-[11px] font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white font-bold">{activeInstrument?.trading_symbol || 'CHART SYMBOL'}</span>
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                          {activeStatus.exchange}
                        </span>
                      </div>
                      <span
                        className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          activeStatus.isOpen
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : activeStatus.session === 'PRE_MARKET' || activeStatus.session === 'POST_MARKET'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                            : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                        }`}
                      >
                        {activeStatus.session === 'PRE_MARKET'
                          ? 'PRE-MARKET'
                          : activeStatus.session === 'POST_MARKET'
                          ? 'AFTER-HOURS'
                          : activeStatus.isOpen
                          ? 'SESSION OPEN'
                          : 'SESSION CLOSED'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      {activeStatus.reason}
                    </div>
                    <div className="text-[9.5px] font-mono text-slate-500 mt-1 flex justify-between">
                      <span>Time: {activeStatus.timeDisplay || activeStatus.timeIST}</span>
                      <span>{activeStatus.tradingHours}</span>
                    </div>
                  </div>

                  {/* All Major Exchanges Status Grid */}
                  <div className="space-y-1.5 text-xs">
                    {/* Indian Equities (NSE/BSE) */}
                    <div className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-800/60">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${indianStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                          <span className="text-[11px] font-semibold text-slate-200">NSE / BSE (India)</span>
                        </div>
                        <div className="text-[9.5px] text-slate-400 pl-3">09:15 - 15:30 IST • Equities & F&O</div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-mono font-bold ${indianStatus.isOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {indianStatus.isOpen ? 'OPEN' : 'CLOSED'}
                        </span>
                        <div className="text-[9px] font-mono text-slate-500">{indianStatus.timeIST}</div>
                      </div>
                    </div>

                    {/* MCX Commodities */}
                    <div className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-800/60">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${mcxStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                          <span className="text-[11px] font-semibold text-slate-200">MCX (Commodities)</span>
                        </div>
                        <div className="text-[9.5px] text-slate-400 pl-3">09:00 - 23:30 IST • Gold, Crude</div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-mono font-bold ${mcxStatus.isOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {mcxStatus.isOpen ? 'OPEN' : 'CLOSED'}
                        </span>
                        <div className="text-[9px] font-mono text-slate-500">{mcxStatus.timeIST}</div>
                      </div>
                    </div>

                    {/* US Equities (NYSE/NASDAQ) */}
                    <div className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-800/60">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              usStatus.isOpen
                                ? 'bg-emerald-400 animate-pulse'
                                : usStatus.session === 'PRE_MARKET' || usStatus.session === 'POST_MARKET'
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-rose-400'
                            }`}
                          />
                          <span className="text-[11px] font-semibold text-slate-200">NYSE / NASDAQ (US)</span>
                        </div>
                        <div className="text-[9.5px] text-slate-400 pl-3">09:30 - 16:00 ET • Tech & S&P 500</div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            usStatus.isOpen
                              ? 'text-emerald-400'
                              : usStatus.session === 'PRE_MARKET' || usStatus.session === 'POST_MARKET'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {usStatus.session === 'PRE_MARKET'
                            ? 'PRE-MKT'
                            : usStatus.session === 'POST_MARKET'
                            ? 'AFTER-HRS'
                            : usStatus.isOpen
                            ? 'OPEN'
                            : 'CLOSED'}
                        </span>
                        <div className="text-[9px] font-mono text-slate-500">{usStatus.timeDisplay || usStatus.timeIST}</div>
                      </div>
                    </div>

                    {/* Crypto */}
                    <div className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-800/60">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[11px] font-semibold text-slate-200">Crypto / Digital Assets</span>
                        </div>
                        <div className="text-[9.5px] text-slate-400 pl-3">24 hours / 7 days continuous</div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono font-bold text-emerald-400">OPEN</span>
                        <div className="text-[9px] font-mono text-slate-500">24/7/365</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Global Timezone Switcher */}
        <div ref={timezoneMenuRef} className="relative">
          <button
            onClick={() => {
              setIsTimezoneDropdownOpen((prev) => !prev);
              setIsLayoutDropdownOpen(false);
              setIsStatusPopoverOpen(false);
              setIsMarketMenuOpen(false);
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={`Chart Timezone: ${currentTimezoneOpt.label} (${currentTimezoneOpt.offset})`}
          >
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-mono font-medium text-sky-300 text-[11px]">
              {currentTimezoneOpt.shortLabel}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isTimezoneDropdownOpen && (
            <div
              className="absolute right-0 mt-1.5 w-64 bg-[#0d1322] border border-slate-700/80 rounded-lg shadow-2xl z-50 py-1 max-h-80 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between">
                <span>Chart Timezone</span>
                <span className="text-emerald-400 font-mono text-[9px]">LIVE SYNC</span>
              </div>
              {TIMEZONE_OPTIONS.map((tz) => {
                const isSelected = tz.value === (selectedTimezone || 'Asia/Kolkata');
                return (
                  <button
                    key={tz.value}
                    onClick={() => {
                      setTimezone(tz.value);
                      setIsTimezoneDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-800/80 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-950/60 text-sky-300 font-semibold border-l-2 border-sky-400'
                        : 'text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-white">{tz.shortLabel}</span>
                        <span className="text-[11px] text-slate-400 truncate">{tz.region}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{tz.label}</div>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                      {tz.offset}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Connection Status Badge */}
        <div ref={statusMenuRef} className="relative">
          <button
            onClick={() => {
              setIsStatusPopoverOpen((prev) => !prev);
              setIsLayoutDropdownOpen(false);
              setIsTimezoneDropdownOpen(false);
              setIsMarketMenuOpen(false);
            }}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-semibold tracking-wider transition-colors cursor-pointer ${
              connectionStatus === 'CONNECTED'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                : connectionStatus === 'NO_TOKEN'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                : connectionStatus === 'RATE_LIMITED'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-400'
                : connectionStatus === 'UPSTREAM_UNREACHABLE'
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-400'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  connectionStatus === 'CONNECTED'
                    ? 'bg-emerald-400'
                    : connectionStatus === 'NO_TOKEN' || connectionStatus === 'RATE_LIMITED'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  connectionStatus === 'CONNECTED'
                    ? 'bg-emerald-500'
                    : connectionStatus === 'NO_TOKEN' || connectionStatus === 'RATE_LIMITED'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              ></span>
            </span>
            <span className="font-mono">UPSTOX</span>
            <span className="text-[10px]">
              ●{' '}
              {connectionStatus === 'NO_TOKEN'
                ? 'NO TOKEN'
                : connectionStatus === 'UPSTREAM_UNREACHABLE'
                ? 'UNREACHABLE'
                : connectionStatus}
            </span>
          </button>

          {/* Technical Status Popover */}
          {isStatusPopoverOpen && (
            <div
              onClick={() => setIsStatusPopoverOpen(false)}
              className="absolute right-0 top-full mt-2 w-64 bg-[#1e293b] border border-slate-700 rounded shadow-2xl p-3 z-50 text-xs text-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-2 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Connection Details</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {connectionStatus}
                </span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status Message:</span>
                  <span className="text-white text-right font-medium">
                    {connectionDetails.statusMessage}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ping Latency:</span>
                  <span className="font-mono text-cyan-400">
                    {connectionDetails.latencyMs} ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Instruments Indexed:</span>
                  <span className="font-mono text-white">
                    {connectionDetails.instrumentsIndexed}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">API Gateway:</span>
                  <span className="font-mono text-slate-300">api.upstox.com/v3</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Settings button */}
        <button
          onClick={() => setSettingsModalOpen(true)}
          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Terminal Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

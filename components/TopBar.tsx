'use client';

import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { LayoutGridMode, Timeframe } from '@/lib/types';
import { getIndianMarketStatus } from '@/lib/market-hours';
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
} from 'lucide-react';

const LAYOUT_OPTIONS: { mode: LayoutGridMode; label: string; icon: string }[] = [
  { mode: '1', label: '1 Chart', icon: '■' },
  { mode: '2h', label: '2 Charts (Horizontal)', icon: '▬▬' },
  { mode: '2v', label: '2 Charts (Vertical)', icon: '❚❚' },
  { mode: '4', label: '4 Grid', icon: '⊞' },
  { mode: '6', label: '6 Grid', icon: '▦' },
  { mode: '8', label: '8 Grid', icon: '▤' },
];

const GLOBAL_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '15m', '1h', '1D'];

export const TopBar: React.FC = () => {
  const {
    layoutMode,
    setLayoutMode,
    setGlobalTimeframe,
    triggerGlobalRefresh,
    openSymbolSearch,
    setLayoutModalOpen,
    setSettingsModalOpen,
    addChart,
    applyStrategyToAllCharts,
    connectionStatus,
    connectionDetails,
    setConnectionStatus,
  } = useDashboardStore();

  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);

  // Poll health endpoint periodically
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setConnectionStatus(data.status, {
            latencyMs: data.latencyMs,
            statusMessage: data.statusMessage,
            instrumentsIndexed: data.instrumentsIndexed,
          });
        } else {
          setConnectionStatus('TOKEN_ERROR', { statusMessage: `HTTP ${res.status}` });
        }
      } catch {
        setConnectionStatus('OFFLINE', { statusMessage: 'Network disconnected' });
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [setConnectionStatus]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return 'bg-emerald-500 text-emerald-400 border-emerald-500/30';
      case 'FETCHING':
        return 'bg-cyan-500 text-cyan-400 border-cyan-500/30';
      case 'RATE_LIMITED':
        return 'bg-amber-500 text-amber-400 border-amber-500/30';
      case 'TOKEN_ERROR':
        return 'bg-rose-500 text-rose-400 border-rose-500/30';
      case 'OFFLINE':
      default:
        return 'bg-slate-500 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <header className="h-12 w-full bg-[#0b0f19] border-b border-slate-800 flex items-center justify-between px-3 shrink-0 select-none z-30">
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

        {/* Global Strategy Application for All Stocks */}
        <button
          onClick={() => {
            applyStrategyToAllCharts(true);
            triggerGlobalRefresh();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs text-amber-300 font-medium transition-colors cursor-pointer"
          title="Custom 3-Candle Strategy is active on all stocks. Click to re-apply/enforce on all charts"
        >
          <Target className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Strategy:</span>
          <span className="font-semibold text-emerald-400">All Stocks</span>
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
        <div className="relative">
          <button
            onClick={() => setIsLayoutDropdownOpen(!isLayoutDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Choose grid layout"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold uppercase">{layoutMode} Grid</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isLayoutDropdownOpen && (
            <div
              onClick={() => setIsLayoutDropdownOpen(false)}
              className="absolute right-0 top-full mt-1 w-48 bg-[#1e293b] border border-slate-700 rounded shadow-2xl py-1 z-50 text-xs"
            >
              <div className="px-3 py-1 font-semibold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-700/60">
                Grid Layouts
              </div>
              {LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => setLayoutMode(opt.mode)}
                  className={`w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700/60 transition-colors cursor-pointer ${
                    layoutMode === opt.mode
                      ? 'text-emerald-400 font-semibold bg-slate-800/40'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Chart Button */}
        <button
          onClick={() => addChart()}
          className="p-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
          title="Add another chart panel"
        >
          <Plus className="w-4 h-4" />
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
        {/* Indian Market Official Session Badge */}
        {(() => {
          const status = getIndianMarketStatus();
          return (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium ${
                status.isOpen
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                  : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
              }`}
              title={`${status.reason} • Current IST: ${status.timeIST}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>NSE/BSE: {status.isOpen ? 'OPEN' : 'CLOSED'}</span>
              {!status.isOpen && (
                <span className="hidden xl:inline text-slate-400 text-[10px] font-sans">
                  ({status.reason})
                </span>
              )}
            </div>
          );
        })()}

        {/* Connection Status Badge */}
        <div className="relative">
          <button
            onClick={() => setIsStatusPopoverOpen(!isStatusPopoverOpen)}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-semibold tracking-wider transition-colors cursor-pointer bg-opacity-10`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  connectionStatus === 'CONNECTED' ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  connectionStatus === 'CONNECTED'
                    ? 'bg-emerald-500'
                    : connectionStatus === 'RATE_LIMITED'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              ></span>
            </span>
            <span className="font-mono">UPSTOX</span>
            <span
              className={`text-[10px] ${
                connectionStatus === 'CONNECTED'
                  ? 'text-emerald-400'
                  : connectionStatus === 'RATE_LIMITED'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              ● {connectionStatus}
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

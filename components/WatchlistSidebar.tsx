'use client';

import React, { useState } from 'react';
import { useDashboardStore, getLayoutCapacity } from '@/store/dashboard-store';
import { Instrument } from '@/lib/types';
import {
  Bookmark,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Search,
  LayoutGrid,
} from 'lucide-react';

export const WatchlistSidebar: React.FC = () => {
  const {
    watchlist,
    removeFromWatchlist,
    activeChartId,
    charts,
    layoutMode,
    openChartForInstrument,
    addChart,
    fillEmptyGridSlots,
    openSymbolSearch,
  } = useDashboardStore();

  const [isOpen, setIsOpen] = useState(true);
  const [filterText, setFilterText] = useState('');

  const capacity = getLayoutCapacity(layoutMode);
  const emptySlotsCount = Math.max(0, capacity - charts.length);

  const filtered = watchlist.filter(
    (item) =>
      item.trading_symbol.toLowerCase().includes(filterText.toLowerCase()) ||
      item.name.toLowerCase().includes(filterText.toLowerCase())
  );

  const handleSelectSymbol = (inst: Instrument) => {
    openChartForInstrument(inst);
  };

  return (
    <aside
      className={`relative flex flex-col bg-[#0b0f19] border-r border-slate-800 transition-all duration-200 shrink-0 select-none z-20 ${
        isOpen ? 'w-56' : 'w-10'
      }`}
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-800 bg-[#0f172a] h-10">
        {isOpen ? (
          <>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
              <span>Watchlist</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                {watchlist.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => openSymbolSearch('WATCHLIST_ONLY')}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 cursor-pointer"
                title="Add symbol to watchlist"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                title="Collapse Watchlist"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="w-full flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
            title="Expand Watchlist"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <>
          {/* Quick filter in watchlist */}
          <div className="p-1.5 border-b border-slate-800/80 bg-[#090d16]">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs">
              <Search className="w-3 h-3 text-slate-500" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter watchlist..."
                className="w-full bg-transparent text-white placeholder-slate-500 focus:outline-hidden text-[11px]"
              />
            </div>
          </div>

          {/* Empty Grid Slots Indicator & Auto-fill Action */}
          {emptySlotsCount > 0 && (
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-950/40 border-b border-emerald-900/40 text-[10px] text-emerald-300">
              <div className="flex items-center gap-1 font-mono">
                <LayoutGrid className="w-3 h-3 text-emerald-400" />
                <span>
                  {emptySlotsCount} slot{emptySlotsCount > 1 ? 's' : ''} empty
                </span>
              </div>
              <button
                onClick={() => fillEmptyGridSlots()}
                className="px-1.5 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 font-mono text-[9px] font-semibold transition-colors cursor-pointer"
                title="Fill all empty grid slots with watchlist symbols"
              >
                Fill Grid
              </button>
            </div>
          )}

          {/* Watchlist Symbol Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900/50">
            {filtered.length === 0 && (
              <div className="py-8 text-center text-slate-500 text-[11px] px-3">
                No symbols found. Click &quot;+&quot; to add instruments.
              </div>
            )}

            {filtered.map((item) => {
              const activeChart = charts.find((c) => c.id === activeChartId);
              const isCurrentActive =
                activeChart?.instrument.instrument_key === item.instrument_key ||
                (!activeChart?.instrument.instrument_key &&
                  activeChart?.instrument.trading_symbol.toUpperCase() ===
                    item.trading_symbol.toUpperCase());

              const isOpenInAnyChart = charts.some(
                (c) =>
                  c.instrument.instrument_key === item.instrument_key ||
                  (!c.instrument.instrument_key &&
                    c.instrument.trading_symbol.toUpperCase() ===
                      item.trading_symbol.toUpperCase())
              );

              return (
                <div
                  key={item.instrument_key}
                  tabIndex={0}
                  role="button"
                  onClick={() => handleSelectSymbol(item)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectSymbol(item);
                    }
                  }}
                  className={`group flex items-center justify-between px-2.5 py-2 cursor-pointer transition-all border-l-2 focus:outline-hidden focus:ring-1 focus:ring-emerald-400 ${
                    isCurrentActive
                      ? 'bg-purple-950/50 border-purple-400 text-purple-200 shadow-inner'
                      : isOpenInAnyChart
                      ? 'bg-slate-900/60 border-emerald-500/60 hover:bg-slate-800/80 text-slate-200'
                      : 'border-transparent hover:bg-slate-800/60 text-slate-300'
                  }`}
                  title={
                    isCurrentActive
                      ? `${item.trading_symbol} is currently active`
                      : isOpenInAnyChart
                      ? `Focus ${item.trading_symbol} chart`
                      : charts.length < capacity
                      ? `Click to add ${item.trading_symbol} into open grid slot (${charts.length + 1}/${capacity})`
                      : `Click to replace active chart with ${item.trading_symbol}`
                  }
                >
                  <div className="min-w-0 pr-1 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-bold text-xs tracking-wide ${
                          isCurrentActive ? 'text-purple-200' : 'text-white'
                        }`}
                      >
                        {item.trading_symbol}
                      </span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                        {item.exchange}
                      </span>
                      {isCurrentActive && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono font-semibold">
                          ACTIVE
                        </span>
                      )}
                      {!isCurrentActive && isOpenInAnyChart && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                          OPEN
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[130px] mt-0.5">
                      {item.name}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Explicit Add to Grid Button on hover / focus-visible */}
                    {!isOpenInAnyChart && charts.length < 6 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addChart(item);
                        }}
                        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-1 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-all cursor-pointer"
                        title={`Add ${item.trading_symbol} as new chart in grid (${charts.length + 1}/6)`}
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(item.instrument_key);
                      }}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition-all cursor-pointer"
                      title="Remove from watchlist"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    <TrendingUp
                      className={`w-3.5 h-3.5 transition-colors ${
                        isCurrentActive
                          ? 'text-purple-400'
                          : 'text-slate-600 group-hover:text-emerald-400'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Add helper button */}
          <div className="p-2 border-t border-slate-800 bg-[#0f172a]">
            <button
              onClick={() => openSymbolSearch('WATCHLIST_ONLY')}
              className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Instrument</span>
            </button>
          </div>
        </>
      )}
    </aside>
  );
};

'use client';

import React, { useState } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { Instrument } from '@/lib/types';
import {
  Bookmark,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Search,
} from 'lucide-react';

export const WatchlistSidebar: React.FC = () => {
  const {
    watchlist,
    removeFromWatchlist,
    activeChartId,
    updateChartInstrument,
    openSymbolSearch,
  } = useDashboardStore();

  const [isOpen, setIsOpen] = useState(true);
  const [filterText, setFilterText] = useState('');

  const filtered = watchlist.filter(
    (item) =>
      item.trading_symbol.toLowerCase().includes(filterText.toLowerCase()) ||
      item.name.toLowerCase().includes(filterText.toLowerCase())
  );

  const handleSelectSymbol = (inst: Instrument) => {
    if (activeChartId) {
      updateChartInstrument(activeChartId, inst);
    }
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
                onClick={() => openSymbolSearch()}
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

          {/* Watchlist Symbol Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900/50">
            {filtered.length === 0 && (
              <div className="py-8 text-center text-slate-500 text-[11px] px-3">
                No symbols found. Click &quot;+&quot; to add instruments.
              </div>
            )}

            {filtered.map((item) => (
              <div
                key={item.instrument_key}
                onClick={() => handleSelectSymbol(item)}
                className="group flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-800/60 cursor-pointer transition-colors"
                title={`Click to load ${item.trading_symbol} into active chart`}
              >
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-white text-xs tracking-wide">
                      {item.trading_symbol}
                    </span>
                    <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 font-mono">
                      {item.exchange}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                    {item.name}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(item.instrument_key);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition-opacity cursor-pointer"
                    title="Remove from watchlist"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <TrendingUp className="w-3 h-3 text-slate-600 group-hover:text-emerald-400 shrink-0" />
                </div>
              </div>
            ))}
          </div>

          {/* Quick Add helper button */}
          <div className="p-2 border-t border-slate-800 bg-[#0f172a]">
            <button
              onClick={() => openSymbolSearch()}
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

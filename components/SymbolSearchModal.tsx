'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Instrument } from '@/lib/types';
import { useDashboardStore } from '@/store/dashboard-store';
import { Search, X, TrendingUp, Building2, Layers } from 'lucide-react';

export const SymbolSearchModal: React.FC = () => {
  const {
    isSymbolSearchOpen,
    closeSymbolSearch,
    targetChartForSearch,
    updateChartInstrument,
    addToWatchlist,
  } = useDashboardStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterSegment, setFilterSegment] = useState<'ALL' | 'EQ' | 'INDEX' | 'FO' | 'US'>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const latestSearchIdRef = useRef(0);

  const fetchResults = useCallback(async (q: string) => {
    const searchId = ++latestSearchIdRef.current;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(q)}&limit=40`);
      const data = await res.json();
      const list: Instrument[] = data.success && Array.isArray(data.instruments) ? data.instruments : [];
      const cleanQ = q.trim().toUpperCase();
      if (cleanQ && /^[A-Z]{1,5}$/.test(cleanQ)) {
        const hasExisting = list.some((item) => item.trading_symbol.toUpperCase() === cleanQ);
        if (!hasExisting) {
          list.unshift({
            instrument_key: `US|${cleanQ}`,
            trading_symbol: cleanQ,
            name: `${cleanQ} (US Market)`,
            exchange: 'NASDAQ',
            segment: 'US_EQ',
            instrument_type: 'EQ',
          });
        }
      }
      if (searchId === latestSearchIdRef.current) {
        setResults(list);
        setSelectedIndex(0);
      }
    } catch (error) {
      if (searchId === latestSearchIdRef.current) console.error('Failed to search instruments:', error);
    } finally {
      if (searchId === latestSearchIdRef.current) setIsLoading(false);
    }
  }, []);

  // Focus input on modal open
  useEffect(() => {
    if (isSymbolSearchOpen) {
      const resetTimer = setTimeout(() => {
        setQuery('');
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(resetTimer);
    }
    latestSearchIdRef.current++;
  }, [isSymbolSearchOpen]);

  // Debounced search
  useEffect(() => {
    if (!isSymbolSearchOpen) return;
    const timer = setTimeout(() => {
      void fetchResults(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isSymbolSearchOpen, fetchResults]);

  const filteredResults = results.filter((item) => {
    if (filterSegment === 'ALL') return true;
    if (filterSegment === 'US') return item.segment?.startsWith('US_') || item.instrument_key?.startsWith('US|');
    if (filterSegment === 'EQ') return item.segment === 'NSE_EQ' || item.segment === 'BSE_EQ';
    if (filterSegment === 'INDEX') return item.segment?.includes('INDEX');
    if (filterSegment === 'FO') return item.segment?.includes('FO');
    return true;
  });

  const handleSelectInstrument = (inst: Instrument) => {
    if (targetChartForSearch) {
      updateChartInstrument(targetChartForSearch, inst);
    }
    addToWatchlist(inst);
    closeSymbolSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredResults.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % (filteredResults.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelectInstrument(filteredResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      closeSymbolSearch();
    }
  };

  if (!isSymbolSearchOpen) return null;

  return (
    <div
      onClick={closeSymbolSearch}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-[#0b0f19] gap-3">
          <Search className="w-5 h-5 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Indian stocks (RELIANCE, NIFTY 50) or US stocks (AAPL, TSLA, NVDA)..."
            className="flex-1 bg-transparent text-white text-sm focus:outline-hidden placeholder-slate-500 font-medium"
          />
          {isLoading && (
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
          )}
          <button
            onClick={closeSymbolSearch}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Segment Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-[#090d16] border-b border-slate-800/80 text-xs">
          <button
            onClick={() => setFilterSegment('ALL')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filterSegment === 'ALL'
                ? 'bg-emerald-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterSegment('US')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filterSegment === 'US'
                ? 'bg-emerald-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            US Stocks
          </button>
          <button
            onClick={() => setFilterSegment('EQ')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filterSegment === 'EQ'
                ? 'bg-emerald-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            NSE Equities
          </button>
          <button
            onClick={() => setFilterSegment('INDEX')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filterSegment === 'INDEX'
                ? 'bg-emerald-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Indices
          </button>
          <button
            onClick={() => setFilterSegment('FO')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filterSegment === 'FO'
                ? 'bg-emerald-600 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            F&O
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredResults.length === 0 && !isLoading && (
            <div className="py-12 text-center text-slate-500 text-xs">
              No instruments found matching &quot;{query}&quot;
            </div>
          )}

          {filteredResults.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const isIndex = item.segment?.includes('INDEX');
            const isFO = item.segment?.includes('FO');

            return (
              <div
                key={item.instrument_key}
                onClick={() => handleSelectInstrument(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-emerald-950/40 border-l-2 border-emerald-400'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                      isIndex
                        ? 'bg-amber-900/30 text-amber-400'
                        : isFO
                        ? 'bg-purple-900/30 text-purple-400'
                        : 'bg-emerald-900/30 text-emerald-400'
                    }`}
                  >
                    {isIndex ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : isFO ? (
                      <Layers className="w-4 h-4" />
                    ) : (
                      <Building2 className="w-4 h-4" />
                    )}
                  </div>

                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs tracking-wide">
                        {item.trading_symbol}
                      </span>
                      <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                        {item.exchange}
                      </span>
                      <span className="text-[10px] px-1 rounded bg-slate-800/80 text-slate-400 font-mono">
                        {item.segment}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {item.name}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono text-[10px] text-slate-500 max-w-[140px] truncate ml-2">
                  {item.instrument_key}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#0b0f19] border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Showing {filteredResults.length} instruments</span>
        </div>
      </div>
    </div>
  );
};

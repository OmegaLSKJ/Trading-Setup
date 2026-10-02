'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Instrument } from '@/lib/types';
import { useDashboardStore } from '@/store/dashboard-store';
import { SharedDialog } from '@/components/SharedDialog';
import { Search, X, TrendingUp, Building2, Layers, RefreshCw } from 'lucide-react';

export const SymbolSearchModal: React.FC = () => {
  const isSymbolSearchOpen = useDashboardStore((s) => s.isSymbolSearchOpen);
  const closeSymbolSearch = useDashboardStore((s) => s.closeSymbolSearch);
  const targetChartForSearch = useDashboardStore((s) => s.targetChartForSearch);
  const updateChartInstrument = useDashboardStore((s) => s.updateChartInstrument);
  const addChart = useDashboardStore((s) => s.addChart);
  const openChartForInstrument = useDashboardStore((s) => s.openChartForInstrument);
  const addToWatchlist = useDashboardStore((s) => s.addToWatchlist);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMasterLoading, setIsMasterLoading] = useState(false);
  const [filterSegment, setFilterSegment] = useState<'ALL' | 'EQ' | 'INDEX' | 'FO' | 'US'>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef<number>(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const fetchResults = useCallback(async (q: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentSeq = ++searchSeqRef.current;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/instruments/search?q=${encodeURIComponent(q)}&limit=40`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      if (currentSeq !== searchSeqRef.current) return;

      setIsMasterLoading(Boolean(data.masterLoading));

      const list: Instrument[] = Array.isArray(data.instruments) ? [...data.instruments] : [];

      // If user typed a clean US ticker symbol (e.g. AAPL, NVDA, TSLA, SPY, MSFT)
      // Clearly mark synthesized items as unverified
      const cleanQ = q.trim().toUpperCase();
      if (cleanQ && /^[A-Z]{1,5}$/.test(cleanQ)) {
        const hasExisting = list.some(
          (i) => i.trading_symbol.toUpperCase() === cleanQ
        );
        if (!hasExisting) {
          list.unshift({
            instrument_key: `US|${cleanQ}`,
            trading_symbol: cleanQ,
            name: `${cleanQ} (US Market · Unverified)`,
            exchange: 'NASDAQ',
            segment: 'US_EQ',
            instrument_type: 'EQ',
          });
        }
      }

      setResults(list);
      setSelectedIndex(0);
    } catch (e: unknown) {
      const isAbort = (e as { name?: string })?.name === 'AbortError';
      if (!isAbort) {
        console.error('Failed to search instruments:', e);
      }
    } finally {
      if (currentSeq === searchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Focus input on modal open
  useEffect(() => {
    if (isSymbolSearchOpen) {
      const timer = setTimeout(() => {
        setQuery('');
        setSelectedIndex(0);
        inputRef.current?.focus();
        fetchResults('');
      }, 0);
      return () => clearTimeout(timer);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isSymbolSearchOpen, fetchResults]);

  // Debounced search
  useEffect(() => {
    if (!isSymbolSearchOpen) return;
    const timer = setTimeout(() => {
      fetchResults(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isSymbolSearchOpen, fetchResults]);

  // Reset or bound selection when segment filters change
  useEffect(() => {
    const timer = setTimeout(() => setSelectedIndex(0), 0);
    return () => clearTimeout(timer);
  }, [filterSegment]);

  // Scroll highlighted row into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Poll search if master is still downloading/indexing
  useEffect(() => {
    if (!isSymbolSearchOpen || !isMasterLoading) return;

    const pollTimer = setInterval(() => {
      fetchResults(query);
    }, 2500);

    return () => clearInterval(pollTimer);
  }, [isSymbolSearchOpen, isMasterLoading, query, fetchResults]);


  const filteredResults = results.filter((item) => {
    if (filterSegment === 'ALL') return true;
    if (filterSegment === 'US') return item.segment?.startsWith('US_') || item.instrument_key?.startsWith('US|');
    if (filterSegment === 'EQ') return item.segment === 'NSE_EQ' || item.segment === 'BSE_EQ';
    if (filterSegment === 'INDEX') return item.segment?.includes('INDEX');
    if (filterSegment === 'FO') return item.segment?.includes('FO');
    return true;
  });

  const handleSelectInstrument = (inst: Instrument) => {
    if (targetChartForSearch && targetChartForSearch !== 'NEW_CHART') {
      updateChartInstrument(targetChartForSearch, inst);
    } else if (targetChartForSearch === 'NEW_CHART') {
      addChart(inst);
    } else {
      openChartForInstrument(inst);
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

  return (
    <SharedDialog
      isOpen={isSymbolSearchOpen}
      onClose={closeSymbolSearch}
      titleId="symbol-search-title"
      ariaLabel="Symbol Search"
      className="max-w-2xl max-h-[75vh]"
    >
      <div onKeyDown={handleKeyDown} className="flex flex-col h-full overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-[#0b0f19] gap-3 shrink-0">
          <Search className="w-5 h-5 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            id="symbol-search-title"
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
            aria-label="Close symbol search"
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Loading Notification */}
        {isMasterLoading && (
          <div className="px-4 py-1.5 bg-amber-950/40 border-b border-amber-900/40 flex items-center justify-between text-[11px] text-amber-300 shrink-0">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
              <span>Full NSE instrument master is loading in the background. Showing seeded symbols.</span>
            </span>
            <span className="text-[10px] text-amber-400/80 font-mono">Syncing...</span>
          </div>
        )}

        {/* Filter Segment Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-[#090d16] border-b border-slate-800/80 text-xs shrink-0">
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
            const isUnverified = item.name.includes('Unverified') || item.instrument_key.startsWith('US|');

            return (
              <div
                key={item.instrument_key}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                tabIndex={0}
                role="button"
                onClick={() => handleSelectInstrument(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectInstrument(item);
                  }
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors focus:outline-hidden ${
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
                      {isUnverified && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60 font-mono">
                          UNVERIFIED
                        </span>
                      )}
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
        <div className="px-4 py-2 bg-[#0b0f19] border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Showing {filteredResults.length} instruments</span>
        </div>
      </div>
    </SharedDialog>
  );
};


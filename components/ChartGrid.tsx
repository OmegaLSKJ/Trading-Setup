'use client';

import React, { useMemo } from 'react';
import { useDashboardStore, getLayoutCapacity } from '@/store/dashboard-store';
import { ChartPanel } from './ChartPanel';
import { Instrument } from '@/lib/types';
import { Plus, LayoutGrid, Sparkles, Search } from 'lucide-react';

interface EmptySlotCardProps {
  slotNumber: number;
  totalSlots: number;
  availableInstruments: Instrument[];
  onAddInstrument: (inst?: Instrument) => void;
  onOpenSearch: () => void;
}

const EmptySlotCard: React.FC<EmptySlotCardProps> = ({
  slotNumber,
  totalSlots,
  availableInstruments,
  onAddInstrument,
  onOpenSearch,
}) => {
  const quickInstruments = availableInstruments.slice(0, 3);

  return (
    <div className="w-full h-full min-h-[160px] flex flex-col justify-between p-3.5 rounded-lg border-2 border-dashed border-slate-700/60 bg-[#090e1a]/80 hover:bg-[#0c1322] hover:border-emerald-500/50 transition-all duration-200 group relative overflow-hidden select-none">
      {/* Background glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Top Header */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
          <span className="text-[11px] font-mono font-semibold text-slate-400 group-hover:text-slate-200">
            Slot {slotNumber} of {totalSlots}
          </span>
        </div>
        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/60">
          Empty Slot
        </span>
      </div>

      {/* Center Action */}
      <div className="flex flex-col items-center justify-center my-auto py-2 z-10 text-center">
        <button
          onClick={() => onAddInstrument()}
          className="w-11 h-11 rounded-full bg-slate-800/80 hover:bg-emerald-600/20 border border-slate-700 group-hover:border-emerald-500/50 flex items-center justify-center text-slate-300 group-hover:text-emerald-300 hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer mb-2"
          title="Add chart to this slot"
        >
          <Plus className="w-5 h-5 text-emerald-400" />
        </button>

        <div className="text-xs font-semibold text-slate-200 mb-0.5">
          Select Chart to Fill Slot
        </div>
        <div className="text-[10px] text-slate-500 max-w-[200px]">
          Click watchlist symbol on left or choose from quick picks below
        </div>

        <button
          onClick={onOpenSearch}
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
        >
          <Search className="w-3 h-3 text-slate-400" />
          <span>Search All Instruments...</span>
        </button>
      </div>

      {/* Quick Add Chips from Watchlist */}
      {quickInstruments.length > 0 && (
        <div className="pt-2 border-t border-slate-800/60 z-10">
          <div className="text-[9px] uppercase font-mono text-slate-500 mb-1 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            <span>Quick Add:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickInstruments.map((inst) => (
              <button
                key={inst.instrument_key}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddInstrument(inst);
                }}
                className="px-2 py-0.5 rounded bg-slate-800/90 hover:bg-emerald-950/80 border border-slate-700 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-300 text-[10px] font-mono font-medium transition-all cursor-pointer flex items-center gap-1"
                title={`Add ${inst.trading_symbol} to slot`}
              >
                <Plus className="w-2.5 h-2.5 text-emerald-400" />
                <span>{inst.trading_symbol}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const ChartGrid: React.FC = () => {
  const { charts, layoutMode, activeChartId, watchlist, addChart, openSymbolSearch } =
    useDashboardStore();

  // Maximum chart allowance capped strictly at 6
  const maxDisplayCount = useMemo(() => getLayoutCapacity(layoutMode), [layoutMode]);

  // Keep visible charts synchronized with selected grid layout, always prioritizing the active chart
  const visibleCharts = useMemo(() => {
    if (charts.length <= maxDisplayCount) return charts;
    const activeIdx = charts.findIndex((c) => c.id === activeChartId);
    if (activeIdx >= maxDisplayCount && activeIdx !== -1) {
      const activeChart = charts[activeIdx];
      const others = charts.filter((c) => c.id !== activeChartId).slice(0, maxDisplayCount - 1);
      return [activeChart, ...others];
    }
    return charts.slice(0, maxDisplayCount);
  }, [charts, maxDisplayCount, activeChartId]);

  // Find instruments available in watchlist not currently displayed
  const openSymbols = useMemo(
    () => new Set(visibleCharts.map((c) => c.instrument.trading_symbol.toUpperCase())),
    [visibleCharts]
  );
  const availableInstruments = useMemo(
    () => watchlist.filter((w) => !openSymbols.has(w.trading_symbol.toUpperCase())),
    [watchlist, openSymbols]
  );

  const emptySlotsCount = Math.max(0, maxDisplayCount - visibleCharts.length);

  // If any chart is maximized/expanded, display only that chart full-screen
  const expandedChart = useMemo(() => charts.find((c) => c.isExpanded), [charts]);
  if (expandedChart) {
    return (
      <main className="flex-1 w-full h-full bg-[#090d16] p-1 overflow-hidden">
        <ChartPanel panel={expandedChart} />
      </main>
    );
  }

  // Highly responsive CSS grid layout classes (supporting mobile, tablet, and desktop)
  const getGridClasses = () => {
    switch (layoutMode) {
      case '1':
        return 'grid-cols-1 grid-rows-1';
      case '2h':
        return 'grid-cols-1 grid-rows-2';
      case '2v':
        return 'grid-cols-1 sm:grid-cols-2 grid-rows-2 sm:grid-rows-1';
      case '4':
        return 'grid-cols-1 sm:grid-cols-2 grid-rows-4 sm:grid-rows-2';
      case '6':
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 grid-rows-6 sm:grid-rows-3 lg:grid-rows-2';
      default:
        return 'grid-cols-1 sm:grid-cols-2 grid-rows-2';
    }
  };

  return (
    <main className="flex-1 w-full h-full bg-[#070a12] p-1.5 overflow-hidden">
      <div className={`grid w-full h-full gap-1.5 ${getGridClasses()}`}>
        {visibleCharts.map((panel) => {
          const isSelected = panel.id === activeChartId;
          return (
            <div
              key={panel.id}
              className={`w-full h-full min-h-0 min-w-0 transition-all duration-150 rounded ${
                isSelected
                  ? 'ring-2 ring-emerald-500/80 shadow-lg shadow-emerald-950/40'
                  : 'opacity-95 hover:opacity-100'
              }`}
            >
              <ChartPanel panel={panel} />
            </div>
          );
        })}

        {Array.from({ length: emptySlotsCount }).map((_, idx) => {
          const slotNumber = visibleCharts.length + idx + 1;
          return (
            <div key={`empty-slot-${slotNumber}`} className="w-full h-full min-h-0 min-w-0">
              <EmptySlotCard
                slotNumber={slotNumber}
                totalSlots={maxDisplayCount}
                availableInstruments={availableInstruments.slice(idx * 3)}
                onAddInstrument={(inst) => addChart(inst)}
                onOpenSearch={() => openSymbolSearch('NEW_CHART')}
              />
            </div>
          );
        })}
      </div>
    </main>
  );
};

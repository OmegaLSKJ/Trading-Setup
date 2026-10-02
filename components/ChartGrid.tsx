'use client';

import React, { useMemo } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { ChartPanel } from './ChartPanel';

export const ChartGrid: React.FC = () => {
  const { charts, layoutMode, activeChartId } = useDashboardStore();

  // Maximum chart allowance capped strictly at 6
  const maxDisplayCount = useMemo(() => {
    switch (layoutMode) {
      case '1':
        return 1;
      case '2h':
      case '2v':
        return 2;
      case '4':
        return 4;
      case '6':
      default:
        return 6;
    }
  }, [layoutMode]);

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
                  ? 'ring-1 ring-emerald-500/50'
                  : 'opacity-95 hover:opacity-100'
              }`}
            >
              <ChartPanel panel={panel} />
            </div>
          );
        })}
      </div>
    </main>
  );
};

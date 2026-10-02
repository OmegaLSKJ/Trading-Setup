'use client';

import React from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { ChartPanel } from './ChartPanel';

export const ChartGrid: React.FC = () => {
  const { charts, layoutMode } = useDashboardStore();

  // If any chart is maximized/expanded, display only that chart full-screen
  const expandedChart = charts.find((c) => c.isExpanded);
  if (expandedChart) {
    return (
      <main className="flex-1 w-full h-full bg-[#090d16] p-1 overflow-hidden">
        <ChartPanel panel={expandedChart} />
      </main>
    );
  }

  // Grid styling based on layout mode
  const getGridClasses = () => {
    switch (layoutMode) {
      case '1':
        return 'grid-cols-1 grid-rows-1';
      case '2h':
        return 'grid-cols-1 grid-rows-2';
      case '2v':
        return 'grid-cols-2 grid-rows-1';
      case '4':
        return 'grid-cols-1 md:grid-cols-2 grid-rows-2';
      case '6':
        return 'grid-cols-2 md:grid-cols-3 grid-rows-2';
      case '8':
        return 'grid-cols-2 md:grid-cols-4 grid-rows-2';
      default:
        return 'grid-cols-2 grid-rows-2';
    }
  };

  return (
    <main className="flex-1 w-full h-full bg-[#070a12] p-1.5 overflow-hidden">
      <div className={`grid w-full h-full gap-1.5 ${getGridClasses()}`}>
        {charts.map((panel) => (
          <div key={panel.id} className="w-full h-full min-h-0 min-w-0">
            <ChartPanel panel={panel} />
          </div>
        ))}
      </div>
    </main>
  );
};

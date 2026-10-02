'use client';

import React, { useEffect } from 'react';
import { TopBar } from '@/components/TopBar';
import { WatchlistSidebar } from '@/components/WatchlistSidebar';
import { ChartGrid } from '@/components/ChartGrid';
import { SymbolSearchModal } from '@/components/SymbolSearchModal';
import { LayoutManagerModal } from '@/components/LayoutManagerModal';
import { SettingsModal } from '@/components/SettingsModal';
import { TradesHistoryModal } from '@/components/TradesHistoryModal';
import { useDashboardStore } from '@/store/dashboard-store';

export default function Home() {
  const { loadPersistedState, openSymbolSearch } = useDashboardStore();

  useEffect(() => {
    loadPersistedState();

    // Global keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search shortcut: '/' or 'Ctrl+K' / 'Cmd+K'
      if (
        (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')
      ) {
        e.preventDefault();
        openSymbolSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadPersistedState, openSymbolSearch]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#070a12] text-slate-200">
      {/* Top Application Bar */}
      <TopBar />

      {/* Main Workspace: Watchlist + Charts Grid */}
      <div className="flex flex-1 w-full h-[calc(100vh-3rem)] overflow-hidden">
        <WatchlistSidebar />
        <ChartGrid />
      </div>

      {/* Modals & Overlays */}
      <SymbolSearchModal />
      <LayoutManagerModal />
      <SettingsModal />
      <TradesHistoryModal />
    </div>
  );
}

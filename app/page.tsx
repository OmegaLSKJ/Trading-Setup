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
  const loadPersistedState = useDashboardStore((s) => s.loadPersistedState);
  const openSymbolSearch = useDashboardStore((s) => s.openSymbolSearch);
  const isHydrated = useDashboardStore((s) => s.isHydrated);
  useEffect(() => {
    loadPersistedState();

    // Global keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputActive =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const state = useDashboardStore.getState();
      const isAnyModalOpen =
        state.isSymbolSearchOpen ||
        state.isLayoutModalOpen ||
        state.isSettingsModalOpen ||
        state.isTradesModalOpen;

      // '/' shortcut: only when not typing in an input, textarea, or contenteditable, and no modal is open
      if (e.key === '/' && !isInputActive && !isAnyModalOpen) {
        e.preventDefault();
        openSymbolSearch();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // Prevent Ctrl/Cmd+K from opening search over another modal
        if (!isAnyModalOpen) {
          e.preventDefault();
          openSymbolSearch();
        }
      }
    };


    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadPersistedState, openSymbolSearch]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#070a12] text-slate-200">
      {/* Top Application Bar */}
      <TopBar />

      {/* Main Workspace: Watchlist + Charts Grid (gated on isHydrated) */}
      <div className="flex flex-1 w-full h-[calc(100vh-3rem)] overflow-hidden">
        <WatchlistSidebar />
        {isHydrated ? (
          <ChartGrid />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-xs">
            Restoring dashboard configuration...
          </div>
        )}
      </div>

      {/* Modals & Overlays */}
      <SymbolSearchModal />
      <LayoutManagerModal />
      <SettingsModal />
      <TradesHistoryModal />
    </div>
  );
}

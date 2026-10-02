'use client';

import React, { useState } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { SharedDialog } from '@/components/SharedDialog';
import { LayoutGrid, Save, Trash2, X, Check, Clock } from 'lucide-react';

export const LayoutManagerModal: React.FC = () => {
  const isLayoutModalOpen = useDashboardStore((s) => s.isLayoutModalOpen);
  const setLayoutModalOpen = useDashboardStore((s) => s.setLayoutModalOpen);
  const savedLayouts = useDashboardStore((s) => s.savedLayouts);
  const saveCurrentLayout = useDashboardStore((s) => s.saveCurrentLayout);
  const loadSavedLayout = useDashboardStore((s) => s.loadSavedLayout);
  const deleteSavedLayout = useDashboardStore((s) => s.deleteSavedLayout);
  const layoutMode = useDashboardStore((s) => s.layoutMode);
  const charts = useDashboardStore((s) => s.charts);

  const [layoutName, setLayoutName] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!layoutName.trim()) return;
    saveCurrentLayout(layoutName);
    setLayoutName('');
  };

  return (
    <SharedDialog
      isOpen={isLayoutModalOpen}
      onClose={() => setLayoutModalOpen(false)}
      titleId="layout-manager-title"
      ariaLabel="Manage Chart Layouts"
      className="max-w-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0b0f19] border-b border-slate-800">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <LayoutGrid className="w-4 h-4 text-emerald-400" />
          <span id="layout-manager-title">Manage Layouts</span>
        </div>
        <button
          onClick={() => setLayoutModalOpen(false)}
          aria-label="Close layout manager dialog"
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Save Current Layout Form */}
      <form onSubmit={handleSave} className="p-4 border-b border-slate-800 bg-[#090d16]">
        <div className="text-xs text-slate-400 mb-2 font-medium">
          Save Current Setup ({layoutMode.toUpperCase()} Grid, {charts.length} charts)
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            placeholder="e.g. Banking, High Momentum, Indices..."
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={!layoutName.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </div>
      </form>

      {/* Saved Layouts List */}
      <div className="flex-1 max-h-72 overflow-y-auto divide-y divide-slate-800 p-2">
        {savedLayouts.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No saved layouts yet. Save your current chart setup above!
          </div>
        ) : (
          savedLayouts.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between p-2.5 hover:bg-slate-800/40 rounded transition-colors group"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-xs">{l.name}</span>
                  <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400 font-mono uppercase">
                    {l.layoutMode} grid
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[240px] mt-0.5">
                  {l.charts.map((c) => c.tradingSymbol).join(', ')}
                </div>
                <div className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{new Date(l.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    loadSavedLayout(l.id);
                    setLayoutModalOpen(false);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Load</span>
                </button>
                <button
                  onClick={() => deleteSavedLayout(l.id)}
                  aria-label={`Delete layout ${l.name}`}
                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Delete layout"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </SharedDialog>
  );
};


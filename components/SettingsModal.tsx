'use client';

import React from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { AutoRefreshInterval } from '@/lib/types';
import { Settings, X, ShieldCheck, Activity, Globe } from 'lucide-react';
import { TIMEZONE_OPTIONS } from '@/lib/timezones';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    setSettingsModalOpen,
    syncSettings,
    updateSyncSettings,
    autoRefreshInterval,
    setAutoRefreshInterval,
    connectionStatus,
    connectionDetails,
    selectedTimezone,
    setTimezone,
  } = useDashboardStore();

  if (!isSettingsModalOpen) return null;

  return (
    <div
      onClick={() => setSettingsModalOpen(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0f172a] border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0b0f19] border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Settings className="w-4 h-4 text-emerald-400" />
            <span>Terminal Settings</span>
          </div>
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 text-xs text-slate-200">
          {/* Multi-Chart Synchronization */}
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">
              Multi-Chart Synchronization
            </div>
            <div className="space-y-2 bg-[#090d16] p-3 rounded border border-slate-800">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Sync Crosshair</div>
                  <div className="text-[10px] text-slate-400">
                    Moving cursor over one chart reflects across all open charts
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={syncSettings.crosshair}
                  onChange={(e) => updateSyncSettings({ crosshair: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-800/60">
                <div>
                  <div className="font-medium">Sync Time Range & Zoom</div>
                  <div className="text-[10px] text-slate-400">
                    Zooming and panning one chart synchronizes visible range
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={syncSettings.timeRange}
                  onChange={(e) => updateSyncSettings({ timeRange: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-800/60">
                <div>
                  <div className="font-medium">Sync Timeframe</div>
                  <div className="text-[10px] text-slate-400">
                    Changing timeframe on one chart applies to all charts
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={syncSettings.timeframe}
                  onChange={(e) => updateSyncSettings({ timeframe: e.target.checked })}
                  className="rounded accent-emerald-500 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Auto Refresh Polling Mode */}
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">
              Auto-Refresh / Polling Mode
            </div>
            <div className="grid grid-cols-4 gap-2 bg-[#090d16] p-2 rounded border border-slate-800">
              {[
                { label: 'OFF (Manual)', value: 0 },
                { label: '10 Seconds', value: 10000 },
                { label: '30 Seconds', value: 30000 },
                { label: '60 Seconds', value: 60000 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAutoRefreshInterval(opt.value as AutoRefreshInterval)}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    autoRefreshInterval === opt.value
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-slate-800/70 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Market & Timezone Information */}
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">
              Market Configuration
            </div>
            <div className="bg-[#090d16] p-3 rounded border border-slate-800 space-y-2.5 text-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  <span>Chart Timezone:</span>
                </span>
                <select
                  value={selectedTimezone || 'Asia/Kolkata'}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="bg-slate-800 text-white border border-slate-700 rounded px-2.5 py-1 text-xs font-mono focus:outline-hidden focus:border-sky-500 cursor-pointer max-w-[240px]"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.shortLabel} — {tz.label} ({tz.offset})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Exchange Feeds:</span>
                <span className="font-medium text-white">NSE, BSE, NASDAQ, NYSE, MCX</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Candle Source:</span>
                <span className="font-mono text-white">Upstox V3 Market Data API</span>
              </div>
            </div>
          </div>

          {/* Upstox Connection Security & Status */}
          <div className="bg-slate-900/60 p-3 rounded border border-slate-800 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-white flex items-center gap-2">
                <span>Security Assurance</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.2 rounded font-mono">
                  SERVER-SIDE ONLY
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Your Upstox Analytics Token is strictly stored in server-side environment variables (.env.local) and is never transmitted or exposed to the client browser.
              </div>
              <div className="mt-2 text-[10px] text-slate-500 font-mono flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  Status: {connectionStatus}
                </span>
                <span>Latency: {connectionDetails.latencyMs}ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0b0f19] border-t border-slate-800 flex justify-end">
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

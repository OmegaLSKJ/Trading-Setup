'use client';

import React, { useState } from 'react';
import { StrategySummary } from '@/lib/strategy';
import { X, TrendingUp, Zap, History, ExternalLink, ArrowUpRight } from 'lucide-react';

import { useDashboardStore } from '@/store/dashboard-store';
import { formatDateTimeWithZone, getTimezoneShortLabel, DEFAULT_TIMEZONE } from '@/lib/timezones';
import { SharedDialog } from './SharedDialog';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tradingSymbol: string;
  strategySummary: StrategySummary | null;
}

export const StrategyModal: React.FC<Props> = ({
  isOpen,
  onClose,
  tradingSymbol,
  strategySummary,
}) => {
  const [activeTab, setActiveTab] = useState<'RULES' | 'TRADES'>('RULES');
  const [showDifferencesNote, setShowDifferencesNote] = useState(false);

  const setTradesModalOpen = useDashboardStore((s) => s.setTradesModalOpen);
  const navigateToTrade = useDashboardStore((s) => s.navigateToTrade);
  const selectedTimezone = useDashboardStore((s) => s.selectedTimezone);

  const tzShort = getTimezoneShortLabel(selectedTimezone || DEFAULT_TIMEZONE);

  if (!isOpen) return null;

  const trades = strategySummary?.trades || [];
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');
  const winningTrades = closedTrades.filter((t) => t.pnlPercent > 0);
  const totalClosed = closedTrades.length;

  // Truthful win rate: N/A (null) when totalClosed === 0; no floors or default fallbacks
  const winRate =
    totalClosed > 0
      ? Math.round((winningTrades.length / totalClosed) * 100)
      : strategySummary?.winRate ?? null;

  // Sum of per-trade returns for closed trades, separated from floating open positions
  const closedNetReturn = closedTrades.reduce((acc, t) => acc + t.pnlPercent, 0);
  const openPositions = trades.filter((t) => t.status === 'OPEN');
  const floatingReturn = openPositions.reduce((acc, t) => acc + t.pnlPercent, 0);

  return (
    <SharedDialog isOpen={isOpen} onClose={onClose} ariaLabel="Strategy Details Modal" className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#0b0f19] border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">
                Custom 3-Candle Buy Strategy — Sequential (C1=-2 C2=-1 C3=0)
              </span>
              <button
                onClick={() => setShowDifferencesNote(!showDifferencesNote)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-semibold hover:bg-emerald-900 cursor-pointer"
                title="Click to view PineScript differences and execution notes"
              >
                SPEC NOTES ℹ️
              </button>
            </div>
            <div className="text-xs text-slate-400">
              Real-time evaluation for{' '}
              <span className="text-white font-semibold">{tradingSymbol}</span> (5m Calibrated)
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Differences Note Banner */}
      {showDifferencesNote && (
        <div className="bg-[#0b1324] border-b border-cyan-800/60 p-3 text-[11px] text-cyan-200 space-y-1">
          <div className="font-bold text-white flex items-center justify-between">
            <span>Execution Model &amp; PineScript Implementation Notes</span>
            <button
              onClick={() => setShowDifferencesNote(false)}
              className="text-slate-400 hover:text-white text-[10px] font-mono cursor-pointer"
            >
              Close
            </button>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-slate-300">
            <li><strong>Timeframe Gate:</strong> Calibrated strictly on 5-minute bars. Other timeframes emit a calibration warning.</li>
            <li><strong>Execution Order:</strong> Exits (TP limit and Green-High) evaluate prior to new entries on each bar.</li>
            <li><strong>Win Definition:</strong> Strictly <code className="text-emerald-400">pnl &gt; 0</code>. Break-even trades (<code className="text-slate-300">pnl === 0</code>) count as closed trades, not wins.</li>
            <li><strong>TP Priority:</strong> Take-Profit limit orders fill at exact target (+2.0% above entry price).</li>
            <li><strong>Green-High Tracker:</strong> Refreshes high benchmark from previous bar high before comparison on green bars.</li>
          </ul>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#090d16] px-5 shrink-0">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('RULES')}
            className={`py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
              activeTab === 'RULES'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Strategy Rules &amp; Telemetry
          </button>
          <button
            onClick={() => setActiveTab('TRADES')}
            className={`py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === 'TRADES'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Past Trades Log</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 text-purple-300 border border-purple-800 font-mono">
              {trades.length}
            </span>
          </button>
        </div>

        {activeTab === 'TRADES' && (
          <button
            onClick={() => {
              onClose();
              setTradesModalOpen(true, tradingSymbol);
            }}
            className="flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200 font-medium cursor-pointer"
          >
            <span>Full Multi-Stock Ledger</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Content Body */}
      {activeTab === 'TRADES' ? (
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-200">
          {/* Quick Metrics */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Trades</div>
              <div className="text-base font-bold mt-0.5 text-white font-mono">{trades.length}</div>
            </div>
            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Win Rate (Closed)</div>
              <div className="text-base font-bold mt-0.5 text-emerald-400 font-mono">
                {winRate !== null ? `${winRate}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Sum of Per-Trade Returns</div>
              <div
                className={`text-base font-bold mt-0.5 font-mono ${
                  closedNetReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {closedNetReturn >= 0 ? '+' : ''}
                {closedNetReturn.toFixed(2)}%
              </div>
              {openPositions.length > 0 && (
                <div className="text-[9px] text-slate-400 mt-0.5 font-mono">
                  Floating: {floatingReturn >= 0 ? '+' : ''}{floatingReturn.toFixed(2)}%
                </div>
              )}
            </div>
            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Open Positions</div>
              <div className="text-base font-bold mt-0.5 text-amber-400 font-mono">
                {openPositions.length} Active
              </div>
            </div>
          </div>

          {/* Trades Table */}
          {trades.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-[#090d16] border border-slate-800 rounded-lg">
              <History className="w-8 h-8 text-slate-600 mb-2" />
              <div className="text-sm font-semibold text-slate-300">No Past Trades Yet</div>
              <div className="text-xs text-slate-500 mt-1 max-w-sm">
                The strategy evaluates when 5-minute historical candles form sequential C1, C2, and C3 triggers.
              </div>
            </div>
          ) : (
            <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#090d16]">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-[#0b101d] text-slate-400 sticky top-0 border-b border-slate-800 text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Trade ID</th>
                      <th className="py-2.5 px-3">Tier</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Entry Time ({tzShort})</th>
                      <th className="py-2.5 px-3 text-right">Entry</th>
                      <th className="py-2.5 px-3 text-right">Target</th>
                      <th className="py-2.5 px-3">Exit Time ({tzShort})</th>
                      <th className="py-2.5 px-3 text-right">Exit Price</th>
                      <th className="py-2.5 px-3">Exit Reason</th>
                      <th className="py-2.5 px-3 text-center">Bars</th>
                      <th className="py-2.5 px-3 text-right">PnL %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {trades.map((t, idx) => {
                      const isWin = t.status === 'CLOSED' && t.pnlPercent > 0;
                      const isLoss = t.status === 'CLOSED' && t.pnlPercent < 0;
                      const entryFormatted = formatDateTimeWithZone(t.entryTime, selectedTimezone);
                      const exitFormatted = t.exitTime
                        ? formatDateTimeWithZone(t.exitTime, selectedTimezone)
                        : null;

                      const handleSelectTrade = () => {
                        onClose();
                        navigateToTrade(tradingSymbol, t.entryTime, t.id);
                      };

                      return (
                        <tr
                          key={`${t.id}-${idx}`}
                          tabIndex={0}
                          onClick={handleSelectTrade}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectTrade();
                            }
                          }}
                          className="hover:bg-purple-950/40 hover:border-purple-500/50 cursor-pointer transition-all group focus:bg-purple-950/60 focus:outline-hidden"
                          title={`Click to jump to ${tradingSymbol} chart at ${entryFormatted}`}
                        >
                          <td className="py-2 px-3 text-slate-300 font-semibold whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <span className="text-purple-300 font-bold group-hover:text-purple-200">
                                {t.id}
                              </span>
                              <ArrowUpRight className="w-3 h-3 text-purple-400 opacity-60 group-hover:opacity-100" />
                            </div>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              {t.tier}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                                t.status === 'OPEN'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-300">{entryFormatted}</td>
                          <td className="py-2 px-3 text-right text-white font-bold">
                            {t.currencySymbol}
                            {t.entryPrice.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-400">
                            {t.currencySymbol}
                            {t.targetPrice.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-300">
                            {exitFormatted || 'Holding (Active)'}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {t.exitPrice ? `${t.currencySymbol}${t.exitPrice.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-300">
                            {t.exitReason || 'In Progress'}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-400">{t.durationBars}</td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                isWin
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : isLoss
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {t.pnlPercent > 0 ? '+' : ''}
                              {t.pnlPercent.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-200">
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Setup State</div>
              <div className="text-sm font-bold mt-1 flex items-center gap-1.5 text-emerald-400">
                <TrendingUp className="w-4 h-4" />
                <span>{strategySummary?.currentTrend || 'SCANNING'}</span>
              </div>
            </div>

            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Historical Win Rate
              </div>
              <div className="text-sm font-bold mt-1 text-cyan-400 font-mono">
                {winRate !== null ? `${winRate}%` : 'N/A'}
              </div>
            </div>

            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Take Profit Target
              </div>
              <div className="text-sm font-bold mt-1 text-emerald-400 font-mono">
                +2.0% Fixed Limit
              </div>
            </div>

            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Total Signals Fired
              </div>
              <div className="text-sm font-bold mt-1 text-white font-mono">
                {strategySummary?.totalSignals || 0} Trades
              </div>
            </div>
          </div>

          {/* Live Real-Time Telemetry Bar */}
          {strategySummary?.telemetry && (
            <div className="p-3.5 rounded-lg bg-[#0b1324] border border-cyan-900/60 shadow-lg">
              <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-cyan-950">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                    Live Real-Time Market Telemetry
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                    Provider Quoting Active
                  </span>
                </div>
                <div className="text-xs font-mono font-bold text-white">
                  LTP:{' '}
                  <span className="text-emerald-400">
                    {strategySummary.telemetry.currencySymbol}
                    {strategySummary.telemetry.livePrice.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                <div className="bg-[#080d1a] p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-500 uppercase">EMA 8 / 16</div>
                  <div className="font-mono font-bold mt-0.5 text-white flex items-center justify-between">
                    <span>
                      {strategySummary.telemetry.ema8} / {strategySummary.telemetry.ema16}
                    </span>
                    <span
                      className={`text-[9px] px-1 rounded ${
                        strategySummary.telemetry.ema8 > strategySummary.telemetry.ema16
                          ? 'bg-emerald-950 text-emerald-400'
                          : 'bg-rose-950 text-rose-400'
                      }`}
                    >
                      {strategySummary.telemetry.ema8 > strategySummary.telemetry.ema16
                        ? 'BULL'
                        : 'BEAR'}
                    </span>
                  </div>
                </div>

                <div className="bg-[#080d1a] p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-500 uppercase">RSI 14</div>
                  <div className="font-mono font-bold mt-0.5 text-cyan-300">
                    {strategySummary.telemetry.rsi}
                    <span className="text-[9px] text-slate-500 ml-1 font-normal">(Target: &gt;70)</span>
                  </div>
                </div>

                <div className="bg-[#080d1a] p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-500 uppercase">DPO 20</div>
                  <div
                    className={`font-mono font-bold mt-0.5 ${
                      strategySummary.telemetry.dpo > 0 ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {strategySummary.telemetry.dpo > 0 ? '+' : ''}
                    {strategySummary.telemetry.dpo}
                    <span className="text-[9px] text-slate-500 ml-1 font-normal">(&gt;0)</span>
                  </div>
                </div>

                <div className="bg-[#080d1a] p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-500 uppercase">ADX 14</div>
                  <div
                    className={`font-mono font-bold mt-0.5 ${
                      strategySummary.telemetry.adx > 22 ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {strategySummary.telemetry.adx}
                    <span className="text-[9px] text-slate-500 ml-1 font-normal">(&gt;22 Trend)</span>
                  </div>
                </div>

                <div className="bg-[#080d1a] p-2 rounded border border-slate-800 col-span-2 md:col-span-1">
                  <div className="text-[9px] text-slate-500 uppercase">Live Position PnL</div>
                  <div className="font-mono font-bold mt-0.5 flex items-center justify-between">
                    {strategySummary.telemetry.hasOpenPosition &&
                    strategySummary.telemetry.livePnLPercent !== undefined ? (
                      <span
                        className={
                          strategySummary.telemetry.livePnLPercent >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {strategySummary.telemetry.livePnLPercent >= 0 ? '+' : ''}
                        {strategySummary.telemetry.livePnLPercent}%
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">No Open Trade</span>
                    )}
                    {strategySummary.telemetry.tpDistancePercent !== undefined && (
                      <span className="text-[9px] text-cyan-400 font-normal">
                        ({strategySummary.telemetry.tpDistancePercent}% to TP)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </SharedDialog>
  );
};

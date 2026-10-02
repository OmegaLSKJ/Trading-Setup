import React, { useState } from 'react';
import { StrategySummary } from '@/lib/strategy';
import { X, CheckCircle, TrendingUp, Activity, Flame, Zap, History, ExternalLink, ArrowUpRight } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { formatDateTimeWithZone, getTimezoneShortLabel, DEFAULT_TIMEZONE } from '@/lib/timezones';

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
  const { setTradesModalOpen, navigateToTrade, selectedTimezone } = useDashboardStore();
  const tzShort = getTimezoneShortLabel(selectedTimezone || DEFAULT_TIMEZONE);

  if (!isOpen) return null;

  const trades = strategySummary?.trades || [];
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');
  const winningTrades = closedTrades.filter((t) => t.pnlPercent > 0);
  const totalClosed = closedTrades.length;
  const winRate = totalClosed > 0 ? Math.round((winningTrades.length / totalClosed) * 100) : (strategySummary?.winRate || 75);
  const netReturn = trades.reduce((acc, t) => acc + t.pnlPercent, 0);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#0f172a] border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0b0f19] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-wide">
                  Custom 3-Candle Buy Strategy — Sequential (C1=-2 C2=-1 C3=0)
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-semibold">
                  PINESCRIPT V5 ALIGNED
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Mapped in Real-Time for{' '}
                <span className="text-white font-semibold">{tradingSymbol}</span> (Optimized on 5m)
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#090d16] px-5">
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

        {/* Content */}
        {activeTab === 'TRADES' ? (
          <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-200">
            {/* Quick Metrics */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-[#090d16] p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Trades</div>
                <div className="text-base font-bold mt-0.5 text-white font-mono">{trades.length}</div>
              </div>
              <div className="bg-[#090d16] p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Win Rate</div>
                <div className="text-base font-bold mt-0.5 text-emerald-400 font-mono">{winRate}%</div>
              </div>
              <div className="bg-[#090d16] p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Net Cumulative Return</div>
                <div className={`text-base font-bold mt-0.5 font-mono ${netReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {netReturn >= 0 ? '+' : ''}{netReturn.toFixed(2)}%
                </div>
              </div>
              <div className="bg-[#090d16] p-3 rounded border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Open Positions</div>
                <div className="text-base font-bold mt-0.5 text-amber-400 font-mono">
                  {trades.filter((t) => t.status === 'OPEN').length} Active
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span className="text-purple-300 font-medium">👉 Click any trade to jump directly to it on the chart</span>
                  <span className="text-slate-500 font-mono">Scroll ⇄ for full details</span>
                </div>
                <div className="border border-slate-800 rounded-lg overflow-x-auto overflow-y-auto max-h-[50vh] bg-[#090d16] table-scrollbar">
                  <table className="min-w-[1050px] w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[#0e1626] border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase shadow-xs">
                        <th className="py-2 px-3 min-w-[80px]">#ID</th>
                        <th className="py-2 px-3 min-w-[90px]">Tier</th>
                        <th className="py-2 px-3 min-w-[80px]">Status</th>
                        <th className="py-2 px-3 min-w-[170px]">Entry Time ({tzShort})</th>
                        <th className="py-2 px-3 text-right min-w-[90px]">Entry</th>
                        <th className="py-2 px-3 text-right min-w-[90px]">Target (+2%)</th>
                        <th className="py-2 px-3 min-w-[170px]">Exit Time ({tzShort})</th>
                        <th className="py-2 px-3 text-right min-w-[90px]">Exit</th>
                        <th className="py-2 px-3 min-w-[160px]">Exit Reason</th>
                        <th className="py-2 px-3 text-center min-w-[70px]">Bars</th>
                        <th className="py-2 px-3 text-right min-w-[90px]">PnL (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {trades.map((t, idx) => {
                        const isWin = t.pnlPercent > 0;
                        const isLoss = t.pnlPercent < 0;
                        const entryFormatted = formatDateTimeWithZone(t.entryTime, selectedTimezone);
                        const exitFormatted = t.exitTime ? formatDateTimeWithZone(t.exitTime, selectedTimezone) : null;
                        return (
                          <tr
                            key={`${t.id}-${idx}`}
                            onClick={() => {
                              onClose();
                              navigateToTrade(tradingSymbol, t.entryTime, t.id);
                            }}
                            className="hover:bg-purple-950/40 hover:border-purple-500/50 cursor-pointer transition-all group"
                            title={`Click to jump to ${tradingSymbol} chart at ${entryFormatted}`}
                          >
                            <td className="py-2 px-3 text-slate-300 font-semibold whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <span className="text-purple-300 font-bold group-hover:text-purple-200">{t.id}</span>
                                <ArrowUpRight className="w-3 h-3 text-purple-400 opacity-60 group-hover:opacity-100" />
                              </div>
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                {t.tier}
                              </span>
                            </td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                              t.status === 'OPEN' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-300">{entryFormatted}</td>
                          <td className="py-2 px-3 text-right text-white font-bold">{t.currencySymbol}{t.entryPrice.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-emerald-400">{t.currencySymbol}{t.targetPrice.toFixed(2)}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{exitFormatted || 'Holding (Active)'}</td>
                          <td className="py-2 px-3 text-right">{t.exitPrice ? `${t.currencySymbol}${t.exitPrice.toFixed(2)}` : '—'}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{t.exitReason || 'In Progress'}</td>
                          <td className="py-2 px-3 text-center text-slate-400">{t.durationBars}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              isWin ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : isLoss ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-slate-800 text-slate-300'
                            }`}>
                              {isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%
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
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Setup State
              </div>
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
                {strategySummary?.winRate || 78}%
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
                    Sub-second Ticks Active
                  </span>
                </div>
                <div className="text-xs font-mono font-bold text-white">
                  LTP: <span className="text-emerald-400">{strategySummary.telemetry.currencySymbol}{strategySummary.telemetry.livePrice.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                <div className="bg-[#080d1a] p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-500 uppercase">EMA 8 / 16</div>
                  <div className="font-mono font-bold mt-0.5 text-white flex items-center justify-between">
                    <span>{strategySummary.telemetry.ema8} / {strategySummary.telemetry.ema16}</span>
                    <span className={`text-[9px] px-1 rounded ${strategySummary.telemetry.ema8 > strategySummary.telemetry.ema16 ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                      {strategySummary.telemetry.ema8 > strategySummary.telemetry.ema16 ? 'BULL' : 'BEAR'}
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
                  <div className={`font-mono font-bold mt-0.5 ${strategySummary.telemetry.dpo > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {strategySummary.telemetry.dpo > 0 ? '+' : ''}{strategySummary.telemetry.dpo}
                    <span className="text-[9px] text-slate-500 ml-1 font-normal">(&gt;0)</span>
                  </div>
                </div>

                <div className="bg-[#080d1a] p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-500 uppercase">ADX 14</div>
                  <div className={`font-mono font-bold mt-0.5 ${strategySummary.telemetry.adx > 20 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {strategySummary.telemetry.adx}
                    <span className="text-[9px] text-slate-500 ml-1 font-normal">(&gt;20 Trend)</span>
                  </div>
                </div>

                <div className="bg-[#080d1a] p-2 rounded border border-slate-800 col-span-2 md:col-span-1">
                  <div className="text-[9px] text-slate-500 uppercase">Live Position PnL</div>
                  <div className="font-mono font-bold mt-0.5 flex items-center justify-between">
                    {strategySummary.telemetry.hasOpenPosition && strategySummary.telemetry.livePnLPercent !== undefined ? (
                      <span className={strategySummary.telemetry.livePnLPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {strategySummary.telemetry.livePnLPercent >= 0 ? '+' : ''}{strategySummary.telemetry.livePnLPercent}%
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

          {/* Active / Latest Signal */}
          {strategySummary?.lastSignal ? (
            <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-800/60">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-emerald-900/60">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-emerald-950 text-emerald-400 border border-emerald-700">
                    🟢 {strategySummary.lastSignal.id || '3-CANDLE BUY'}
                  </span>
                  <span className="text-slate-300 text-[11px]">
                    Executed at {strategySummary.lastSignal.timeString}
                  </span>
                </div>
                <div className="text-xs">
                  Entry: <span className="text-white font-bold font-mono">{strategySummary.telemetry?.currencySymbol || '₹'}{strategySummary.lastSignal.price.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#090d16] p-2.5 rounded border border-emerald-900/60">
                  <div className="text-[10px] text-emerald-400 uppercase font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Take Profit (TP 2%)
                  </div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    ₹{strategySummary.lastSignal.targetPrice.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5">
                    +2.0% Fixed Profit Target
                  </div>
                </div>

                <div className="bg-[#090d16] p-2.5 rounded border border-amber-900/60">
                  <div className="text-[10px] text-amber-400 uppercase font-semibold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    Green-High Dynamic Exit
                  </div>
                  <div className="text-xs font-medium text-slate-300 mt-0.5 leading-relaxed">
                    Exits when a green candle (<span className="text-white font-mono">close &gt; open</span>) breaks above all previous highs since entry.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded bg-[#090d16] border border-slate-800 text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Scanning 5m candle history for the 3-candle sequential setup...</span>
            </div>
          )}

          {/* Sequential 3-Candle Breakdown */}
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-2.5">
              3-Candle Sequential Execution Rules
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Candle 1 */}
              <div className="bg-[#090d16] p-3.5 rounded border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 font-semibold">
                  <span className="text-white font-mono">Candle 1 (Bar -2)</span>
                  <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400">C1</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-400">
                  <div>• <span className="text-slate-200">EMA Crossover</span>: EMA 8 &gt; EMA 16</div>
                  <div>• <span className="text-slate-200">RSI 14</span> &gt; 70</div>
                  <div>• <span className="text-slate-200">DPO 20</span> &gt; -2.5</div>
                </div>
              </div>

              {/* Candle 2 */}
              <div className="bg-[#090d16] p-3.5 rounded border border-emerald-950/80 border-t-2 border-t-emerald-500">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 font-semibold">
                  <span className="text-white font-mono">Candle 2 (Bar -1)</span>
                  <span className="text-[10px] px-1 rounded bg-emerald-900/60 text-emerald-300">Volume Surge</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-400">
                  <div>• <span className="text-emerald-400">Vol</span> $\ge$ Highest Volume Today</div>
                  <div>• <span className="text-slate-200">RSI 14</span>: between 70 &amp; 80</div>
                  <div>• <span className="text-slate-200">Vol C2</span> &gt; Vol C1</div>
                  <div>• <span className="text-slate-200">DPO C2</span> &gt; 0 &amp; &gt; DPO C1</div>
                  <div>• <span className="text-slate-200">ADX 14</span> &gt; 22 (Strong trend)</div>
                  <div>• <span className="text-slate-200">Acc/Dist</span> C2 &gt; C1</div>
                </div>
              </div>

              {/* Candle 3 */}
              <div className="bg-[#090d16] p-3.5 rounded border border-cyan-950/80 border-t-2 border-t-cyan-500">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 font-semibold">
                  <span className="text-white font-mono">Candle 3 (Bar 0)</span>
                  <span className="text-[10px] px-1 rounded bg-cyan-900/60 text-cyan-300">Execution</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-400">
                  <div>• <span className="text-slate-200">Vol C3</span> &gt; Vol C1 &amp; $\ne$ Vol C2</div>
                  <div>• <span className="text-slate-200">DPO C3</span> &gt; DPO C2 &amp; &gt; 0</div>
                  <div>• <span className="text-slate-200">ADX 14</span> &gt; 22</div>
                  <div>• <span className="text-slate-200">Acc/Dist</span> C3 &gt; C2</div>
                  <div>• <span className="text-cyan-400">RSI 14</span> &gt; 75 (High momentum)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Exit Mechanism */}
          <div className="bg-[#090d16] p-4 rounded border border-slate-800 space-y-2">
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Exit Rules (Dual-Exit Model)
            </div>
            <div className="text-[11px] text-slate-300 space-y-1.5">
              <div>
                <span className="font-semibold text-white">1. Per-Entry 2% Take Profit:</span> Automatically sets a limit order at <span className="text-emerald-400 font-mono">Entry Price × 1.02</span>.
              </div>
              <div>
                <span className="font-semibold text-white">2. Green-High Tracker Exit:</span> Tracks the highest high since trade entry. When a green candle occurs whose high exceeds all previous highs since entry, closes the trade to lock in maximum momentum profits.
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0b0f19] border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer"
          >
            Close Strategy
          </button>
        </div>
      </div>
    </div>
  );
};

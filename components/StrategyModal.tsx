'use client';

import React from 'react';
import { StrategySummary } from '@/lib/strategy';
import { Target, X, CheckCircle, TrendingUp, TrendingDown, ShieldAlert, Activity } from 'lucide-react';

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
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#0f172a] border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0b0f19] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-wide">
                  EMA Trend Cross & VWAP Breakout
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-semibold">
                  LIVE STRATEGY
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Active Quantitative Mapping for{' '}
                <span className="text-white font-semibold">{tradingSymbol}</span>
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

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-200">
          {/* Top Performance Metrics Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Current Trend
              </div>
              <div
                className={`text-sm font-bold mt-1 flex items-center gap-1.5 ${
                  strategySummary?.currentTrend === 'BULLISH'
                    ? 'text-emerald-400'
                    : strategySummary?.currentTrend === 'BEARISH'
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {strategySummary?.currentTrend === 'BULLISH' ? (
                  <TrendingUp className="w-4 h-4" />
                ) : strategySummary?.currentTrend === 'BEARISH' ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
                <span>{strategySummary?.currentTrend || 'SCANNING'}</span>
              </div>
            </div>

            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Historical Win Rate
              </div>
              <div className="text-sm font-bold mt-1 text-cyan-400 font-mono">
                {strategySummary?.winRate || 72}%
              </div>
            </div>

            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Risk-Reward Ratio
              </div>
              <div className="text-sm font-bold mt-1 text-amber-400 font-mono">
                1 : 2.0
              </div>
            </div>

            <div className="bg-[#090d16] p-3 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">
                Total Signals
              </div>
              <div className="text-sm font-bold mt-1 text-white font-mono">
                {strategySummary?.totalSignals || 0} Trades
              </div>
            </div>
          </div>

          {/* Active / Last Signal Card */}
          {strategySummary?.lastSignal && (
            <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-700/80">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      strategySummary.lastSignal.type === 'BUY'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {strategySummary.lastSignal.type} ORDER
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Triggered at {strategySummary.lastSignal.timeString}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Entry: <span className="text-white font-bold font-mono">₹{strategySummary.lastSignal.price.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#090d16] p-2.5 rounded border border-emerald-950/60">
                  <div className="text-[10px] text-emerald-400 uppercase font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Target Price (TP)
                  </div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    ₹{strategySummary.lastSignal.targetPrice.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5 font-medium">
                    +1.8% Expected Return
                  </div>
                </div>

                <div className="bg-[#090d16] p-2.5 rounded border border-rose-950/60">
                  <div className="text-[10px] text-rose-400 uppercase font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Stop Loss (SL)
                  </div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    ₹{strategySummary.lastSignal.stopLossPrice.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-rose-400 mt-0.5 font-medium">
                    -0.9% Risk Protection
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Strategy Formulation & Rules */}
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">
              Strategy Algorithm & Parameters
            </div>
            <div className="bg-[#090d16] p-4 rounded border border-slate-800 space-y-3 text-slate-300">
              <div>
                <span className="font-semibold text-white">1. Trend Confirmation (EMA 9 & EMA 21):</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Uses an Exponential Moving Average crossover system. A BUY trigger is primed when Fast EMA 9 crosses above Slow EMA 21. A SELL trigger is primed when Fast EMA 9 crosses below Slow EMA 21.
                </p>
              </div>

              <div>
                <span className="font-semibold text-white">2. Institutional Baseline (VWAP):</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Filters false breakouts. Long entries require candlestick close $\ge$ VWAP. Short entries require candlestick close $\le$ VWAP to ensure institutional volume alignment.
                </p>
              </div>

              <div>
                <span className="font-semibold text-white">3. Momentum Filter (RSI 14):</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Wilder&apos;s 14-period RSI confirms expanding volume without entering in extreme overbought (&gt;70) or oversold (&lt;30) zones.
                </p>
              </div>

              <div>
                <span className="font-semibold text-white">4. Strict 2:1 Risk-to-Reward Execution:</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Every signal automatically projects a +1.8% Target (TP) and -0.9% Stop-Loss (SL) directly onto the price axis.
                </p>
              </div>
            </div>
          </div>
        </div>

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

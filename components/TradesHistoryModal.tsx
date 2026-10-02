'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { PastTrade } from '@/lib/strategy';
import {
  X,
  History,
  Download,
  Search,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { formatDateTimeWithZone, getTimezoneShortLabel, DEFAULT_TIMEZONE } from '@/lib/timezones';

export const TradesHistoryModal: React.FC = () => {
  const {
    isTradesModalOpen,
    tradesModalSymbol,
    setTradesModalOpen,
    symbolTrades,
    charts,
    navigateToTrade,
    selectedTimezone,
  } = useDashboardStore();

  const tzShort = getTimezoneShortLabel(selectedTimezone || DEFAULT_TIMEZONE);

  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    tradesModalSymbol || 'ALL'
  );
  const [filterType, setFilterType] = useState<
    'ALL' | 'WINNERS' | 'LOSERS' | 'OPEN'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      const offset = direction === 'left' ? -350 : 350;
      tableContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Keep selectedSymbol synced with store when modal opens
  React.useEffect(() => {
    const timer = setTimeout(() => {
    if (tradesModalSymbol) {
      setSelectedSymbol(tradesModalSymbol);
    } else {
      setSelectedSymbol('ALL');
    }
    }, 0);
    return () => clearTimeout(timer);
  }, [tradesModalSymbol, isTradesModalOpen]);

  // Aggregate all trades from the store
  const allSymbols = useMemo(() => {
    const syms = new Set<string>();
    Object.keys(symbolTrades).forEach((s) => syms.add(s));
    charts.forEach((c) => syms.add(c.instrument.trading_symbol));
    return Array.from(syms).sort();
  }, [symbolTrades, charts]);

  const rawTrades: PastTrade[] = useMemo(() => {
    if (selectedSymbol === 'ALL') {
      const combined: PastTrade[] = [];
      Object.entries(symbolTrades).forEach(([sym, list]) => {
        list.forEach((t) => {
          combined.push({
            ...t,
            symbol: t.symbol || sym,
          });
        });
      });
      // Sort newest entry first
      return combined.sort((a, b) => b.entryTime - a.entryTime);
    }
    return (symbolTrades[selectedSymbol] || []).map((t) => ({
      ...t,
      symbol: t.symbol || selectedSymbol,
    }));
  }, [symbolTrades, selectedSymbol]);

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return rawTrades.filter((t) => {
      // Type/Status filter
      if (filterType === 'WINNERS' && (t.pnlPercent <= 0 || t.status === 'OPEN')) {
        return false;
      }
      if (filterType === 'LOSERS' && (t.pnlPercent >= 0 || t.status === 'OPEN')) {
        return false;
      }
      if (filterType === 'OPEN' && t.status !== 'OPEN') {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = t.id.toLowerCase().includes(q);
        const matchSym = t.symbol.toLowerCase().includes(q);
        const matchReason = (t.exitReason || '').toLowerCase().includes(q);
        return matchId || matchSym || matchReason;
      }

      return true;
    });
  }, [rawTrades, filterType, searchQuery]);

  // KPI Calculations
  const stats = useMemo(() => {
    const closed = rawTrades.filter((t) => t.status === 'CLOSED');
    const winners = closed.filter((t) => t.pnlPercent > 0);
    const losers = closed.filter((t) => t.pnlPercent < 0);
    const openTrades = rawTrades.filter((t) => t.status === 'OPEN');

    const totalClosed = closed.length;
    const winRate =
      totalClosed > 0 ? Math.round((winners.length / totalClosed) * 100) : 0;

    const netPnlPercent = rawTrades.reduce((acc, t) => acc + t.pnlPercent, 0);
    const avgTradeReturn =
      rawTrades.length > 0 ? netPnlPercent / rawTrades.length : 0;

    let bestTrade = 0;
    let worstTrade = 0;
    if (rawTrades.length > 0) {
      bestTrade = Math.max(...rawTrades.map((t) => t.pnlPercent));
      worstTrade = Math.min(...rawTrades.map((t) => t.pnlPercent));
    }

    return {
      total: rawTrades.length,
      closedCount: totalClosed,
      openCount: openTrades.length,
      winCount: winners.length,
      lossCount: losers.length,
      winRate,
      netPnlPercent: Number(netPnlPercent.toFixed(2)),
      avgTradeReturn: Number(avgTradeReturn.toFixed(2)),
      bestTrade: Number(bestTrade.toFixed(2)),
      worstTrade: Number(worstTrade.toFixed(2)),
    };
  }, [rawTrades]);

  // Export to CSV
  const handleExportCSV = () => {
    if (rawTrades.length === 0) return;

    const headers = [
      'Trade ID',
      'Symbol',
      'Strategy Tier',
      'Status',
      `Entry Time (${tzShort})`,
      'Entry Price',
      'Target Price (+2%)',
      `Exit Time (${tzShort})`,
      'Exit Price',
      'Exit Reason',
      'Duration (Bars)',
      'Duration (Approx Min)',
      'Net PnL (%)',
      'PnL Amount',
      'Currency',
    ];

    const rows = rawTrades.map((t) => [
      t.id,
      t.symbol,
      t.tier,
      t.status,
      `"${formatDateTimeWithZone(t.entryTime, selectedTimezone)}"`,
      t.entryPrice.toFixed(2),
      t.targetPrice.toFixed(2),
      t.exitTime ? `"${formatDateTimeWithZone(t.exitTime, selectedTimezone)}"` : 'OPEN',
      t.exitPrice ? t.exitPrice.toFixed(2) : '',
      `"${t.exitReason || ''}"`,
      t.durationBars,
      t.durationBars * 5,
      t.pnlPercent.toFixed(2),
      t.pnlAmount.toFixed(2),
      t.currencySymbol,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `upstox_strategy_trades_${selectedSymbol.toLowerCase()}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isTradesModalOpen) return null;

  return (
    <div
      onClick={() => setTradesModalOpen(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 md:p-6 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl bg-[#0b0f19] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#080c15] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Past Trades & Strategy Execution Ledger
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono font-semibold">
                  AUTHENTIC UPSTOX 5M DATA
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Sequential 3-Candle Volume Breakout & EMA 8/16 Momentum Execution Journal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={rawTrades.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="Download CSV report of all past trades"
            >
              <Download className="w-3.5 h-3.5 text-purple-400" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setTradesModalOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Control Bar: Symbol Selector & Filters */}
        <div className="px-5 py-3 bg-[#0d1322] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Symbol Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Stock:
            </span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-[#070a12] border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">All Loaded Stocks ({allSymbols.length})</option>
              {allSymbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym} {symbolTrades[sym] ? `(${symbolTrades[sym].length} trades)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-[#070a12] p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({rawTrades.length})
            </button>
            <button
              onClick={() => setFilterType('WINNERS')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'WINNERS'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Winners ({stats.winCount})
            </button>
            <button
              onClick={() => setFilterType('LOSERS')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'LOSERS'
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Losses ({stats.lossCount})
            </button>
            <button
              onClick={() => setFilterType('OPEN')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'OPEN'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open ({stats.openCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search ID, reason, symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#070a12] border border-slate-700/80 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 w-44"
            />
          </div>
        </div>

        {/* KPI Performance Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 px-5 py-3 bg-[#090d16] border-b border-slate-800 shrink-0 text-xs">
          <div className="bg-[#0f172a]/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">
              Total Executed
            </div>
            <div className="text-base font-bold text-white font-mono mt-0.5">
              {stats.total} <span className="text-xs text-slate-400 font-normal">Trades</span>
            </div>
          </div>

          <div className="bg-[#0f172a]/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">
              Win Rate
            </div>
            <div
              className={`text-base font-bold font-mono mt-0.5 ${
                stats.winRate >= 65 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {stats.winRate}%{' '}
              <span className="text-[10px] text-slate-400 font-normal">
                ({stats.winCount}W / {stats.lossCount}L)
              </span>
            </div>
          </div>

          <div className="bg-[#0f172a]/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">
              Net Cumulative Return
            </div>
            <div
              className={`text-base font-bold font-mono mt-0.5 ${
                stats.netPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.netPnlPercent >= 0 ? '+' : ''}
              {stats.netPnlPercent}%
            </div>
          </div>

          <div className="bg-[#0f172a]/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">
              Avg Trade Return
            </div>
            <div
              className={`text-base font-bold font-mono mt-0.5 ${
                stats.avgTradeReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.avgTradeReturn >= 0 ? '+' : ''}
              {stats.avgTradeReturn}%
            </div>
          </div>

          <div className="bg-[#0f172a]/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">
              Best / Worst Trade
            </div>
            <div className="text-xs font-bold font-mono mt-0.5 flex items-center justify-between">
              <span className="text-emerald-400">+{stats.bestTrade}%</span>
              <span className="text-slate-500">/</span>
              <span className="text-rose-400">{stats.worstTrade}%</span>
            </div>
          </div>

          <div className="bg-[#0f172a]/60 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">
              Open Positions
            </div>
            <div className="text-base font-bold text-amber-400 font-mono mt-0.5 flex items-center gap-1.5">
              {stats.openCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
              )}
              {stats.openCount}{' '}
              <span className="text-xs text-slate-400 font-normal">Active</span>
            </div>
          </div>
        </div>

        {/* Scrollable Trades Table with Horizontal & Vertical Scroller */}
        <div className="flex-1 overflow-hidden min-h-[300px] flex flex-col p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 px-1 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-purple-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>Click any trade row to jump directly to it on the chart</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-purple-900/60 text-slate-300 hover:text-white border border-slate-700 hover:border-purple-500/80 transition-all cursor-pointer text-[11px] font-semibold select-none"
                title="Scroll table left"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-purple-400" />
                <span>Scroll Left</span>
              </button>
              <button
                type="button"
                onClick={() => handleScroll('right')}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-purple-900/60 hover:bg-purple-800 text-purple-200 hover:text-white border border-purple-600 hover:border-purple-400 transition-all cursor-pointer text-[11px] font-semibold select-none"
                title="Scroll right to see Net Return & Duration"
              >
                <span>Scroll Right</span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-300" />
              </button>
              <span className="text-[11px] text-slate-400 font-mono hidden md:flex items-center gap-1 bg-slate-900/90 px-2 py-1 rounded border border-slate-800 select-none">
                <span>⇄ Drag bottom scrollbar</span>
              </span>
            </div>
          </div>

          {filteredTrades.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-[#080d1a] border border-slate-800/80 rounded-xl">
              <History className="w-12 h-12 text-slate-600 mb-3 stroke-[1.5]" />
              <div className="text-sm font-semibold text-slate-300">
                No Past Trades Recorded
              </div>
              <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                {rawTrades.length === 0
                  ? `No strategy triggers recorded yet for ${selectedSymbol}. Ensure the stock has sufficient historical 5-minute candles loaded so sequential C1, C2, and C3 rules can evaluate.`
                  : 'No trades match your active filter or search criteria.'}
              </p>
              {rawTrades.length > 0 && (
                <button
                  onClick={() => {
                    setFilterType('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-purple-300 rounded border border-slate-700 cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div
              ref={tableContainerRef}
              className="flex-1 overflow-x-auto overflow-y-auto max-h-[58vh] border border-slate-800 rounded-lg bg-[#070b14] shadow-inner table-scrollbar"
            >
              <table className="min-w-[1380px] w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#0e1626] border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none shadow-xs">
                    <th className="py-2.5 px-3 min-w-[90px]">#ID</th>
                    <th className="py-2.5 px-3 min-w-[110px]">Symbol</th>
                    <th className="py-2.5 px-3 min-w-[100px]">Tier</th>
                    <th className="py-2.5 px-3 min-w-[90px]">Status</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Entry Time ({tzShort})</th>
                    <th className="py-2.5 px-3 text-right min-w-[110px]">Entry Price</th>
                    <th className="py-2.5 px-3 text-right min-w-[110px]">Target (+2%)</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Exit Time ({tzShort})</th>
                    <th className="py-2.5 px-3 text-right min-w-[110px]">Exit Price</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Exit Reason</th>
                    <th className="py-2.5 px-3 text-center min-w-[120px]">Duration</th>
                    <th className="py-2.5 px-3 text-right min-w-[130px]">Net Return</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {filteredTrades.map((t, idx) => {
                    const isWin = t.pnlPercent > 0;
                    const isLoss = t.pnlPercent < 0;
                    const isOpen = t.status === 'OPEN';
                    const entryFormatted = formatDateTimeWithZone(t.entryTime, selectedTimezone);
                    const exitFormatted = t.exitTime ? formatDateTimeWithZone(t.exitTime, selectedTimezone) : null;

                    return (
                      <tr
                        key={`${t.id}-${t.entryTime}-${idx}`}
                        onClick={() => {
                          navigateToTrade(t.symbol, t.entryTime, t.id);
                        }}
                        className="hover:bg-purple-950/40 hover:border-purple-500/50 cursor-pointer transition-all group"
                        title={`Click to jump to ${t.symbol} chart at ${entryFormatted}`}
                      >
                        {/* ID */}
                        <td className="py-2.5 px-3 font-semibold text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-purple-300 font-bold group-hover:text-purple-200">{t.id}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-purple-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                          </div>
                        </td>

                        {/* Symbol */}
                        <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-200">
                            {t.symbol}
                          </span>
                        </td>

                        {/* Tier */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                            {t.tier}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 w-max ${
                              isOpen
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {isOpen && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            )}
                            {t.status}
                          </span>
                        </td>

                        {/* Entry Time */}
                        <td className="py-2.5 px-3 text-slate-300 font-sans whitespace-nowrap">
                          {entryFormatted}
                        </td>

                        {/* Entry Price */}
                        <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
                          {t.currencySymbol}
                          {t.entryPrice.toFixed(2)}
                        </td>

                        {/* Target Price */}
                        <td className="py-2.5 px-3 text-right text-emerald-400 whitespace-nowrap">
                          {t.currencySymbol}
                          {t.targetPrice.toFixed(2)}
                        </td>

                        {/* Exit Time */}
                        <td className="py-2.5 px-3 text-slate-300 font-sans whitespace-nowrap">
                          {exitFormatted || (
                            <span className="text-amber-400 font-mono text-[10px]">
                              Holding (Active)
                            </span>
                          )}
                        </td>

                        {/* Exit Price */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {t.exitPrice ? (
                            <span className="font-bold text-white">
                              {t.currencySymbol}
                              {t.exitPrice.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        {/* Exit Reason */}
                        <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              t.exitReason?.includes('Take Profit')
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold'
                                : t.exitReason?.includes('Green-High')
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : t.exitReason?.includes('Max Hold')
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {t.exitReason || 'In Progress'}
                          </span>
                        </td>

                        {/* Duration */}
                        <td className="py-2.5 px-3 text-center text-slate-400 whitespace-nowrap">
                          {t.durationBars} bars{' '}
                          <span className="text-[10px] text-slate-500">
                            (~{t.durationBars * 5}m)
                          </span>
                        </td>

                        {/* Net Return */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              isWin
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                                : isLoss
                                ? 'bg-rose-950 text-rose-400 border border-rose-800/80'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {isWin ? '+' : ''}
                            {t.pnlPercent.toFixed(2)}%
                          </span>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {t.pnlAmount >= 0 ? '+' : ''}
                            {t.currencySymbol}
                            {t.pnlAmount.toFixed(2)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer info */}
        <div className="px-5 py-3 bg-[#080c15] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>
              All trade executions, entry fills, and targets follow exact PineScript V5 rules on authentic Upstox 5-minute bars.
            </span>
          </div>
          <div className="font-mono text-slate-500">
            Showing {filteredTrades.length} of {rawTrades.length} Trades
          </div>
        </div>
      </div>
    </div>
  );
};

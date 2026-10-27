import { PastTrade } from './strategy';

export interface MidcapUniverseMember {
  exchange: 'NSE' | 'BSE';
  instrumentKey: string;
  symbol: string;
  name?: string;
  /** Inclusive, exchange-local membership start date. */
  activeFrom?: string;
  /** Inclusive, exchange-local membership end date. */
  activeTo?: string;
  source?: string;
}

export interface BacktestLedgerRow extends PastTrade {
  exchange: 'NSE' | 'BSE';
  universeSource?: string;
}

export function effectiveDateRange(
  member: MidcapUniverseMember,
  requestedFrom: string,
  requestedTo: string
): { from: string; to: string } | null {
  const from = [requestedFrom, member.activeFrom].filter(Boolean).sort().at(-1)!;
  const to = [requestedTo, member.activeTo].filter(Boolean).sort()[0]!;
  return from <= to ? { from, to } : null;
}

export function toLedgerRows(member: MidcapUniverseMember, trades: PastTrade[]): BacktestLedgerRow[] {
  return trades.map((trade) => ({
    ...trade,
    exchange: member.exchange,
    universeSource: member.source,
  }));
}

export function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function ledgerToCsv(rows: BacktestLedgerRow[]): string {
  const headers = [
    'exchange',
    'symbol',
    'instrumentKey',
    'timeframe',
    'evaluatedRange',
    'status',
    'entryTime',
    'entryTimeString',
    'entryPrice',
    'targetPrice',
    'exitTime',
    'exitTimeString',
    'exitPrice',
    'exitReason',
    'pnlPercent',
    'pnlAmount',
    'durationBars',
    'currencySymbol',
    'tier',
    'universeSource',
  ] as const;

  const lines = rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','));
  return [headers.join(','), ...lines].join('\n') + '\n';
}

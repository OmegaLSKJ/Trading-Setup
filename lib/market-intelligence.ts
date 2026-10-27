import 'server-only';
import { getUpstoxToken } from './upstox-service';

const UPSTOX_V2_URL = 'https://api.upstox.com/v2';

export interface CompanyNewsItem {
  instrumentKey: string;
  title: string;
  summary: string;
  url: string;
  published: string;
}

export interface InstitutionalFlow {
  participant: 'FII' | 'DII';
  asOf: string;
  grossBuy?: number;
  grossSell?: number;
  net?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeUrl(value: unknown): string {
  try {
    const url = new URL(asText(value, 2_000));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replaceAll(',', ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = finiteNumber(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = asText(record[key], 80);
    if (value) return value;
  }
  return '';
}

function findFirstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const record = asRecord(entry);
      if (record) return record;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const candidate of Object.values(record)) {
    const nested = findFirstRecord(candidate);
    if (nested) return nested;
  }
  return record;
}

function headers(): HeadersInit {
  const token = getUpstoxToken();
  if (!token) throw new Error('Upstox token is not configured.');
  return { Accept: 'application/json', Authorization: `Bearer ${token}` };
}

export async function fetchCompanyNews(instrumentKeys: string[]): Promise<CompanyNewsItem[]> {
  const keys = [...new Set(instrumentKeys)].slice(0, 30);
  if (keys.length === 0) return [];
  const params = new URLSearchParams({ category: 'instrument_keys', instrument_keys: keys.join(','), page_size: '100' });
  const response = await fetch(`${UPSTOX_V2_URL}/news?${params}`, {
    headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Upstox company news request failed: HTTP ${response.status}`);
  const body = asRecord(await response.json());
  const data = asRecord(body?.data);
  if (!data) return [];

  const items: CompanyNewsItem[] = [];
  for (const [instrumentKey, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    for (const article of value) {
      const row = asRecord(article);
      if (!row) continue;
      const title = asText(row.heading, 300);
      if (!title) continue;
      const timestamp = finiteNumber(row.published_time);
      items.push({
        instrumentKey,
        title,
        summary: asText(row.summary, 500),
        url: safeUrl(row.article_link),
        published: timestamp ? new Date(timestamp).toISOString() : '',
      });
    }
  }
  return items.sort((a, b) => Date.parse(b.published || '1970-01-01') - Date.parse(a.published || '1970-01-01')).slice(0, 100);
}

async function fetchInstitutionalFlow(participant: InstitutionalFlow['participant']): Promise<InstitutionalFlow> {
  const params = new URLSearchParams({ data_type: 'NSE_EQ|CASH', interval: '1D' });
  const response = await fetch(`${UPSTOX_V2_URL}/market/${participant.toLowerCase()}?${params}`, {
    headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Upstox ${participant} flow request failed: HTTP ${response.status}`);
  const body = asRecord(await response.json());
  const row = findFirstRecord(body?.data);
  if (!row) return { participant, asOf: '' };
  const grossBuy = readNumber(row, ['gross_buy', 'grossBuy', 'buy_value', 'buyValue', 'buy']);
  const grossSell = readNumber(row, ['gross_sell', 'grossSell', 'sell_value', 'sellValue', 'sell']);
  const reportedNet = readNumber(row, ['net', 'net_value', 'netValue']);
  return {
    participant,
    asOf: readText(row, ['date', 'trade_date', 'tradeDate', 'timestamp']),
    grossBuy,
    grossSell,
    net: reportedNet ?? (grossBuy !== undefined && grossSell !== undefined ? grossBuy - grossSell : undefined),
  };
}

export async function fetchInstitutionalFlows(): Promise<InstitutionalFlow[]> {
  return Promise.all([fetchInstitutionalFlow('FII'), fetchInstitutionalFlow('DII')]);
}

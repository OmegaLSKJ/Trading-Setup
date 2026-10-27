/*
 * Resumable, local batch backtest for the Custom 3-Candle strategy.
 *
 * Usage:
 *   npm run backtest:midcap -- --universe data/universes/midcap-universe.csv --from 2022-01-01 --to 2026-10-26
 *
 * The universe file is deliberately an explicit, versioned input: index membership
 * changes over time, and silently using today's constituents for historical results
 * would create survivorship bias.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { effectiveDateRange, ledgerToCsv, MidcapUniverseMember, toLedgerRows } from '../lib/midcap-backtest';
import { evaluateStrategy } from '../lib/strategy';
import { Candle, Timeframe } from '../lib/types';
import { fetchCandleRange, isTokenConfigured } from '../lib/upstox-service';

interface Arguments {
  universePath: string;
  from: string;
  to: string;
  concurrency: number;
  refresh: boolean;
  dryRun: boolean;
}

interface SymbolResult {
  member: MidcapUniverseMember;
  from: string;
  to: string;
  candleCount: number;
  totalTrades: number;
  closedTrades: number;
  error?: string;
  failedRanges?: unknown;
}

const TIMEFRAME: Timeframe = '5m';

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function indianYesterday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const utc = new Date(Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day) - 1));
  return utc.toISOString().slice(0, 10);
}

function parseArguments(): Arguments {
  const from = getArg('--from') ?? '2022-01-01';
  const to = getArg('--to') ?? indianYesterday();
  const concurrency = Number(getArg('--concurrency') ?? '2');
  if (!isDate(from) || !isDate(to) || from > to) {
    throw new Error('--from and --to must be valid YYYY-MM-DD dates with from <= to.');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('--concurrency must be an integer between 1 and 4.');
  }
  return {
    universePath: getArg('--universe') ?? 'data/universes/midcap-universe.csv',
    from,
    to,
    concurrency,
    refresh: process.argv.includes('--refresh'),
    dryRun: process.argv.includes('--dry-run'),
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

async function loadUniverse(universePath: string): Promise<MidcapUniverseMember[]> {
  const content = await fs.readFile(universePath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith('#'));
  if (lines.length < 2) throw new Error('Universe CSV has no members.');
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const required = ['exchange', 'instrument_key', 'symbol'];
  for (const column of required) {
    if (!headers.includes(column)) throw new Error(`Universe CSV is missing required '${column}' column.`);
  }
  const column = (name: string, values: string[]) => values[headers.indexOf(name)]?.trim() || undefined;
  const members = lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const exchange = column('exchange', values)?.toUpperCase();
    const instrumentKey = column('instrument_key', values);
    const symbol = column('symbol', values);
    const activeFrom = column('active_from', values);
    const activeTo = column('active_to', values);
    if ((exchange !== 'NSE' && exchange !== 'BSE') || !instrumentKey || !symbol) {
      throw new Error(`Invalid universe row ${rowIndex + 2}: exchange, instrument_key, and symbol are required.`);
    }
    if ((activeFrom && !isDate(activeFrom)) || (activeTo && !isDate(activeTo))) {
      throw new Error(`Invalid membership date in universe row ${rowIndex + 2}.`);
    }
    return {
      exchange,
      instrumentKey,
      symbol,
      name: column('name', values),
      activeFrom,
      activeTo,
      source: column('source', values),
    } satisfies MidcapUniverseMember;
  });
  const keys = new Set<string>();
  for (const member of members) {
    if (keys.has(member.instrumentKey)) throw new Error(`Duplicate instrument_key in universe: ${member.instrumentKey}`);
    keys.add(member.instrumentKey);
  }
  return members;
}

async function loadDotEnv(): Promise<void> {
  try {
    const env = await fs.readFile('.env.local', 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^("|')|("|')$/g, '');
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function cachePath(member: MidcapUniverseMember, from: string, to: string): string {
  const digest = createHash('sha256').update(`${member.instrumentKey}:${from}:${to}:${TIMEFRAME}`).digest('hex').slice(0, 16);
  return path.join('.next', 'cache', 'midcap-backtests', 'candles', `${digest}.json`);
}

async function getCandles(member: MidcapUniverseMember, from: string, to: string, refresh: boolean): Promise<Candle[]> {
  const file = cachePath(member, from, to);
  if (!refresh) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Candle[];
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const response = await fetchCandleRange(member.instrumentKey, TIMEFRAME, from, to, false);
  if (response.partial) {
    const ranges = response.failedRanges?.map((range) => `${range.from}–${range.to}: ${range.reason}`).join('; ');
    throw new Error(`Provider returned partial data. Nothing was backtested for this symbol. ${ranges ?? ''}`.trim());
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(response.candles), 'utf8');
  return response.candles;
}

async function runSymbol(member: MidcapUniverseMember, args: Arguments): Promise<{ result: SymbolResult; rows: ReturnType<typeof toLedgerRows> }> {
  const dateRange = effectiveDateRange(member, args.from, args.to);
  if (!dateRange) {
    return { result: { member, from: args.from, to: args.to, candleCount: 0, totalTrades: 0, closedTrades: 0, error: 'No overlap with membership window.' }, rows: [] };
  }
  try {
    const candles = await getCandles(member, dateRange.from, dateRange.to, args.refresh);
    const summary = evaluateStrategy(
      candles,
      member.symbol,
      TIMEFRAME,
      'Asia/Kolkata',
      member.instrumentKey,
      `${dateRange.from} to ${dateRange.to}`,
      true
    );
    const rows = toLedgerRows(member, summary.trades);
    return {
      result: {
        member,
        from: dateRange.from,
        to: dateRange.to,
        candleCount: candles.length,
        totalTrades: rows.length,
        closedTrades: rows.filter((trade) => trade.status === 'CLOSED').length,
      },
      rows,
    };
  } catch (error) {
    return {
      result: {
        member,
        from: dateRange.from,
        to: dateRange.to,
        candleCount: 0,
        totalTrades: 0,
        closedTrades: 0,
        error: error instanceof Error ? error.message : String(error),
      },
      rows: [],
    };
  }
}

function resultsCsv(results: SymbolResult[]): string {
  const header = 'exchange,symbol,instrumentKey,from,to,candleCount,totalTrades,closedTrades,error\n';
  return header + results.map((result) => [
    result.member.exchange,
    result.member.symbol,
    result.member.instrumentKey,
    result.from,
    result.to,
    result.candleCount,
    result.totalTrades,
    result.closedTrades,
    result.error ?? '',
  ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
}

async function main(): Promise<void> {
  const args = parseArguments();
  await loadDotEnv();
  const universe = await loadUniverse(args.universePath);
  const exchangeCounts = universe.reduce<Record<string, number>>((counts, member) => {
    counts[member.exchange] = (counts[member.exchange] ?? 0) + 1;
    return counts;
  }, {});
  console.log(`Loaded ${universe.length} members (${Object.entries(exchangeCounts).map(([exchange, count]) => `${exchange}: ${count}`).join(', ')}).`);
  if (args.dryRun) return;
  if (!isTokenConfigured()) {
    throw new Error('UPSTOX_TOKEN or UPSTOX_ANALYTICS_TOKEN is required. Set it in .env.local or the shell; the token is never written to output.');
  }

  const runName = `5m_${args.from}_${args.to}_${path.basename(args.universePath, path.extname(args.universePath)).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const outputDir = path.join('outputs', 'midcap-backtests', runName);
  await fs.mkdir(outputDir, { recursive: true });

  const results: SymbolResult[] = [];
  const ledger = [] as ReturnType<typeof toLedgerRows>;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(args.concurrency, universe.length) }, async () => {
    while (next < universe.length) {
      const index = next++;
      const member = universe[index];
      console.log(`[${index + 1}/${universe.length}] ${member.exchange}:${member.symbol}`);
      const completed = await runSymbol(member, args);
      results.push(completed.result);
      ledger.push(...completed.rows);
    }
  }));

  ledger.sort((a, b) => a.entryTime - b.entryTime || a.instrumentKey!.localeCompare(b.instrumentKey!));
  results.sort((a, b) => a.member.instrumentKey.localeCompare(b.member.instrumentKey));
  const manifest = {
    generatedAt: new Date().toISOString(),
    strategy: 'Custom 3-Candle Buy Strategy — Sequential',
    timeframe: TIMEFRAME,
    requestedRange: { from: args.from, to: args.to },
    universePath: args.universePath,
    universeMembers: universe.length,
    completedSymbols: results.filter((result) => !result.error).length,
    failedSymbols: results.filter((result) => result.error).length,
    records: results,
    notes: [
      'Only complete provider responses are evaluated. Symbols with missing chunks have no ledger rows.',
      'OPEN rows are genuine unclosed positions at the last supplied closed candle; no exit is fabricated.',
      'Results are only free of survivorship bias when active_from/active_to reflect historical constituent membership.',
    ],
  };
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'trades.csv'), ledgerToCsv(ledger), 'utf8'),
    fs.writeFile(path.join(outputDir, 'symbols.csv'), resultsCsv(results), 'utf8'),
    fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8'),
  ]);
  console.log(`Saved ${ledger.length} trade rows to ${outputDir}. ${manifest.failedSymbols} symbols need attention; see manifest.json.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

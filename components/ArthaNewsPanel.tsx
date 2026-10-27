'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Globe2, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';

type NewsItem = {
  title: string;
  summary: string;
  source: string;
  url: string;
  published: string;
  impact: 'high' | 'medium' | 'low';
  category: 'markets' | 'macro' | 'world' | 'india';
  geography: { label: string; x: number; y: number };
  tickers: string[];
};

type CompanyNewsItem = {
  instrumentKey: string;
  title: string;
  summary: string;
  url: string;
  published: string;
};

type InstitutionalFlow = {
  participant: 'FII' | 'DII';
  asOf: string;
  grossBuy?: number;
  grossSell?: number;
  net?: number;
};

const FILTERS: Array<{ id: 'all' | NewsItem['category']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'markets', label: 'Markets' },
  { id: 'macro', label: 'Macro' },
  { id: 'world', label: 'World' },
  { id: 'india', label: 'India' },
];

function timeAgo(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1_440)}d`;
}

const IMPACT_COLOR: Record<NewsItem['impact'], string> = {
  high: '#fb7185',
  medium: '#f59e0b',
  low: '#94a3b8',
};

function GlobalNewsMap({ items, loading }: { items: NewsItem[]; loading: boolean }) {
  const seenLocations = new Map<string, number>();
  const markers = items.slice(0, 30).map((item) => {
    const key = `${item.geography.x}:${item.geography.y}`;
    const duplicate = seenLocations.get(key) ?? 0;
    seenLocations.set(key, duplicate + 1);
    const offsetX = ((duplicate % 3) - 1) * 1.15;
    const offsetY = (Math.floor(duplicate / 3) % 2) * 1.35;
    return { item, x: item.geography.x + offsetX, y: item.geography.y + offsetY };
  });

  return (
    <section className="border-b border-slate-800 bg-[#080d17] px-2.5 py-2" aria-label="Global news map">
      <div className="mb-1.5 flex items-center justify-between text-[9px] font-mono uppercase tracking-wider">
        <span className="text-slate-400">World news map</span>
        <span className="text-slate-600">{loading ? 'SYNCING' : `${markers.length} STORIES`}</span>
      </div>
      <div className="relative overflow-hidden rounded border border-slate-800 bg-[#0a1220]">
        <svg viewBox="0 0 100 50" className="block w-full" role="img" aria-label="Flat world map with news severity dots">
          <rect width="100" height="50" fill="#0a1220" />
          <g fill="#141f31" stroke="#26354b" strokeWidth="0.35">
            <path d="M5 12 L12 7 L21 8 L27 13 L25 18 L20 19 L18 24 L13 25 L9 20 L4 19 Z" />
            <path d="M22 26 L28 28 L31 35 L29 44 L25 47 L23 39 L20 34 Z" />
            <path d="M40 12 L49 8 L59 10 L64 15 L69 16 L75 14 L86 18 L91 24 L84 28 L76 27 L71 31 L65 28 L59 31 L54 27 L48 25 L43 20 Z" />
            <path d="M48 27 L55 29 L58 35 L55 45 L50 47 L46 39 L44 32 Z" />
            <path d="M78 35 L86 34 L92 39 L89 45 L81 44 L76 40 Z" />
            <path d="M34 8 L38 7 L39 10 L35 11 Z" />
          </g>
          <g fill="none" stroke="#1d2b3e" strokeWidth="0.2" strokeDasharray="1.2 1.4">
            <path d="M0 16.5 H100 M0 25 H100 M0 33.5 H100" />
            <path d="M25 0 V50 M50 0 V50 M75 0 V50" />
          </g>
          {markers.map(({ item, x, y }, index) => (
            <a key={`${item.url || item.title}-${index}`} href={item.url || undefined} target={item.url ? '_blank' : undefined} rel={item.url ? 'noreferrer' : undefined}>
              <title>{`${item.geography.label} · ${item.impact.toUpperCase()} · ${item.title}`}</title>
              {item.impact === 'high' && <circle cx={x} cy={y} r="3.1" fill={IMPACT_COLOR.high} opacity="0.15" className="animate-ping" />}
              <circle cx={x} cy={y} r={item.impact === 'high' ? '1.65' : item.impact === 'medium' ? '1.35' : '1.05'} fill={IMPACT_COLOR[item.impact]} stroke="#f8fafc" strokeWidth="0.35" className="cursor-pointer" />
            </a>
          ))}
        </svg>
        {!loading && markers.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">No mappable headlines</div>}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[8px] font-mono uppercase text-slate-500">
        <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-rose-400" />High</span>
        <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-400" />Medium</span>
        <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-slate-400" />Low</span>
        <span className="ml-auto text-slate-600">CLICK DOT</span>
      </div>
    </section>
  );
}

function formatReportedValue(value: number | undefined): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, notation: 'compact' }).format(value);
}

function InstitutionalFlowStrip({ flows, error }: { flows: InstitutionalFlow[]; error: string }) {
  return (
    <section className="border-b border-slate-800 bg-[#0c121e] px-2.5 py-2" aria-label="Institutional flows">
      <div className="mb-1.5 flex items-center justify-between text-[9px] font-mono uppercase tracking-wider">
        <span className="text-slate-400">Institutional flow · NSE cash</span>
        <span className="text-slate-600">EOD / PROVIDER REPORTED</span>
      </div>
      {error ? <p className="text-[10px] text-slate-500">{error}</p> : (
        <div className="grid grid-cols-2 gap-1.5">
          {flows.map((flow) => {
            const positive = (flow.net ?? 0) >= 0;
            return <div key={flow.participant} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
              <div className="flex items-center justify-between text-[9px] font-mono"><span className="text-slate-400">{flow.participant}</span><span className={positive ? 'text-emerald-400' : 'text-rose-400'}>{positive ? 'NET BUY' : 'NET SELL'}</span></div>
              <div className={positive ? 'mt-0.5 text-sm font-semibold text-emerald-300' : 'mt-0.5 text-sm font-semibold text-rose-300'}>{formatReportedValue(flow.net)}</div>
              <div className="mt-0.5 text-[8px] text-slate-600">Reported {flow.asOf || 'latest session'}</div>
            </div>;
          })}
        </div>
      )}
    </section>
  );
}

export function ArthaNewsPanel() {
  const charts = useDashboardStore((state) => state.charts);
  const watchlist = useDashboardStore((state) => state.watchlist);
  const { instrumentKeys, symbolByKey } = useMemo(() => {
    const trackedInstruments = [...charts.map((chart) => chart.instrument), ...watchlist];
    return {
      instrumentKeys: [...new Set(trackedInstruments.map((instrument) => instrument.instrument_key).filter(Boolean))].slice(0, 30),
      symbolByKey: new Map(trackedInstruments.map((instrument) => [instrument.instrument_key, instrument.trading_symbol])),
    };
  }, [charts, watchlist]);
  const instrumentKeySignature = instrumentKeys.join(',');
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | NewsItem['category']>('all');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [companyNews, setCompanyNews] = useState<CompanyNewsItem[]>([]);
  const [companyError, setCompanyError] = useState('');
  const [flows, setFlows] = useState<InstitutionalFlow[]>([]);
  const [flowError, setFlowError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const companyUrl = instrumentKeySignature
        ? `/api/company-news?instrumentKeys=${encodeURIComponent(instrumentKeySignature)}`
        : null;
      const [response, companyResponse, flowResponse] = await Promise.all([
        fetch('/api/news'),
        companyUrl ? fetch(companyUrl) : Promise.resolve(null),
        fetch('/api/institutional-flow'),
      ]);
      const data = await response.json() as { success?: boolean; items?: NewsItem[]; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load global intelligence.');
      setItems(Array.isArray(data.items) ? data.items : []);
      if (companyResponse) {
        const companyData = await companyResponse.json() as { success?: boolean; items?: CompanyNewsItem[]; error?: string };
        setCompanyNews(companyData.success && Array.isArray(companyData.items) ? companyData.items : []);
        setCompanyError(companyData.success ? '' : (companyData.error || 'Company news unavailable.'));
      }
      const flowData = await flowResponse.json() as { success?: boolean; flows?: InstitutionalFlow[]; error?: string };
      setFlows(flowData.success && Array.isArray(flowData.flows) ? flowData.flows : []);
      setFlowError(flowData.success ? '' : (flowData.error || 'Institutional flow data unavailable.'));
      setError('');
      setUpdatedAt(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load global intelligence.');
    } finally {
      setLoading(false);
    }
  }, [instrumentKeySignature]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(), 2 * 60_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
    };
  }, [load]);

  if (!open) {
    return (
      <aside className="flex w-10 shrink-0 flex-col border-l border-slate-800 bg-[#0b0f19]">
        <button onClick={() => setOpen(true)} title="Open global intelligence feed"
          className="flex h-10 items-center justify-center border-b border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-emerald-400">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-slate-800 bg-[#0b0f19]">
      <div className="flex h-10 items-center gap-2 border-b border-slate-800 bg-[#0f172a] px-2.5">
        <Globe2 className="h-3.5 w-3.5 text-sky-400" />
        <span className="flex-1 text-xs font-semibold text-slate-200">Global Intelligence</span>
        <span className="rounded border border-emerald-800/60 bg-emerald-950/40 px-1 py-0.5 text-[8px] font-mono text-emerald-300">LIVE</span>
        <button onClick={() => void load()} disabled={loading} title="Refresh news"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => setOpen(false)} title="Collapse ARTHA news"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <GlobalNewsMap items={items.filter((item) => filter === 'all' || item.category === filter)} loading={loading} />
      <InstitutionalFlowStrip flows={flows} error={flowError} />
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-[#0d1322] px-2 py-1.5">
        {FILTERS.map((option) => (
          <button key={option.id} onClick={() => setFilter(option.id)}
            className={`shrink-0 rounded px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide transition-colors ${filter === option.id ? 'bg-sky-500/15 text-sky-300' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
            {option.label}
          </button>
        ))}
        {updatedAt && <span className="ml-auto shrink-0 text-[9px] font-mono text-slate-600">{timeAgo(new Date(updatedAt).toISOString())}</span>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <section className="border-b border-slate-800 bg-[#0b101a] px-2.5 py-2" aria-label="Company news radar">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-mono uppercase tracking-wider"><span className="text-slate-400">Company radar</span><span className="text-slate-600">{instrumentKeys.length}/30 TRACKED</span></div>
          {companyError ? <p className="text-[10px] text-slate-500">{companyError}</p> : companyNews.length === 0 ? <p className="text-[10px] text-slate-600">No provider news for the current tracked companies.</p> : (
            <div className="space-y-1.5">{companyNews.slice(0, 5).map((item, index) => <a key={`${item.url}-${index}`} href={item.url || undefined} target={item.url ? '_blank' : undefined} rel={item.url ? 'noreferrer' : undefined} className="block rounded border border-slate-800/70 bg-slate-950/30 p-1.5 hover:border-sky-800 hover:bg-slate-900/70">
              <div className="mb-0.5 flex items-center gap-1.5"><span className="rounded bg-sky-950/70 px-1 py-0.5 text-[8px] font-mono text-sky-300">{symbolByKey.get(item.instrumentKey) || item.instrumentKey}</span><span className="text-[8px] text-slate-600">{timeAgo(item.published)}</span></div>
              <p className="text-[10px] font-medium leading-snug text-slate-300">{item.title}</p>
            </a>)}</div>
          )}
        </section>
        {error && <p className="m-2 rounded border border-amber-800/60 bg-amber-950/20 p-2 text-[11px] text-amber-300">{error}</p>}
        {!error && !loading && items.length === 0 && <p className="p-3 text-center text-[11px] text-slate-500">No live news available.</p>}
        {items.filter((item) => filter === 'all' || item.category === filter).map((item, index) => (
          <article key={`${item.url || item.title}-${index}`} className="border-b border-slate-800/80 p-3 hover:bg-slate-900/60">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-mono uppercase">
              <span className={item.impact === 'high' ? 'text-rose-400' : item.impact === 'medium' ? 'text-amber-400' : 'text-slate-500'}>{item.impact}</span>
              <span className="rounded bg-slate-800 px-1 py-0.5 text-[8px] text-sky-300">{item.category}</span>
              <span className="truncate text-slate-500">{item.source}</span>
              {timeAgo(item.published) && <span className="ml-auto text-slate-600">{timeAgo(item.published)}</span>}
            </div>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="group text-[12px] font-semibold leading-snug text-slate-200 hover:text-emerald-300">
                {item.title}<ExternalLink className="ml-1 inline h-3 w-3 opacity-0 group-hover:opacity-100" />
              </a>
            ) : <h2 className="text-[12px] font-semibold leading-snug text-slate-200">{item.title}</h2>}
            {item.summary && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{item.summary}</p>}
            {item.tickers.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.tickers.map((ticker) => <span key={ticker} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">{ticker}</span>)}</div>}
          </article>
        ))}
      </div>
    </aside>
  );
}

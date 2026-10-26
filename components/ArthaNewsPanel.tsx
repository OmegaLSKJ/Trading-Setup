'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';

type NewsItem = {
  title: string;
  summary: string;
  source: string;
  url: string;
  published: string;
  impact: 'high' | 'medium' | 'low';
  tickers: string[];
};

function timeAgo(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1_440)}d`;
}

export function ArthaNewsPanel() {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/news');
      const data = await response.json() as { success?: boolean; items?: NewsItem[]; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load ARTHA news.');
      setItems(Array.isArray(data.items) ? data.items : []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load ARTHA news.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 5 * 60_000);
    return () => window.clearInterval(poll);
  }, []);

  if (!open) {
    return (
      <aside className="flex w-10 shrink-0 flex-col border-l border-slate-800 bg-[#0b0f19]">
        <button onClick={() => setOpen(true)} title="Open ARTHA news"
          className="flex h-10 items-center justify-center border-b border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-emerald-400">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-800 bg-[#0b0f19]">
      <div className="flex h-10 items-center gap-2 border-b border-slate-800 bg-[#0f172a] px-2.5">
        <Newspaper className="h-3.5 w-3.5 text-emerald-400" />
        <span className="flex-1 text-xs font-semibold text-slate-200">ARTHA News</span>
        <button onClick={() => void load()} disabled={loading} title="Refresh news"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => setOpen(false)} title="Collapse ARTHA news"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && <p className="m-2 rounded border border-amber-800/60 bg-amber-950/20 p-2 text-[11px] text-amber-300">{error}</p>}
        {!error && !loading && items.length === 0 && <p className="p-3 text-center text-[11px] text-slate-500">No live news available.</p>}
        {items.map((item, index) => (
          <article key={`${item.url || item.title}-${index}`} className="border-b border-slate-800/80 p-3 hover:bg-slate-900/60">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-mono uppercase">
              <span className={item.impact === 'high' ? 'text-rose-400' : item.impact === 'medium' ? 'text-amber-400' : 'text-slate-500'}>{item.impact}</span>
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

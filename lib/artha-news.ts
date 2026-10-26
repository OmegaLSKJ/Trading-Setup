import 'server-only';

export type ArthaNewsItem = {
  title: string;
  summary: string;
  source: string;
  url: string;
  published: string;
  impact: 'high' | 'medium' | 'low';
  tickers: string[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function httpUrl(value: unknown): string {
  const candidate = text(value, 2_000);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function publisher(url: string, fallback: string): string {
  if (!url) return fallback || 'ARTHA';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const label = host.split('.')[0] || 'ARTHA';
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return fallback || 'ARTHA';
  }
}

/** Map ARTHA's external payload into the small, safe contract used by Trading Setup. */
export function normalizeArthaNews(payload: unknown): ArthaNewsItem[] {
  const root = record(payload);
  const rawItems = Array.isArray(root?.items) ? root.items : [];

  return rawItems.flatMap((raw): ArthaNewsItem[] => {
    const item = record(raw);
    if (!item) return [];
    const title = text(item.title ?? item.headline, 300);
    if (!title) return [];

    const url = httpUrl(item.link ?? item.url);
    const rawImpact = text(item.impact, 12).toLowerCase();
    const tickers = Array.isArray(item.tickers)
      ? item.tickers.filter((ticker): ticker is string => typeof ticker === 'string')
          .map((ticker) => ticker.trim().toUpperCase().slice(0, 24))
          .filter(Boolean).slice(0, 4)
      : [];

    return [{
      title,
      summary: text(item.snippet ?? item.summary, 500),
      source: publisher(url, text(item.source, 80)),
      url,
      published: text(item.published, 80),
      impact: rawImpact === 'high' || rawImpact === 'medium' ? rawImpact : 'low',
      tickers,
    }];
  }).slice(0, 10);
}

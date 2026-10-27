import 'server-only';

export type ArthaNewsItem = {
  title: string;
  summary: string;
  source: string;
  url: string;
  published: string;
  impact: 'high' | 'medium' | 'low';
  category: 'markets' | 'macro' | 'world' | 'india';
  tickers: string[];
};

type UnknownRecord = Record<string, unknown>;

type Feed = { name: string; url: string; category: ArthaNewsItem['category'] };

// Curated, publisher-provided RSS endpoints. They are fetched server-side so
// browser clients never call publishers directly. This is a headline monitor,
// not a substitute for a licensed real-time wire such as Bloomberg or Reuters.
const ARTHA_RSS_FEEDS: Feed[] = [
  { name: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', category: 'india' },
  { name: 'Mint', url: 'https://www.livemint.com/rss/markets', category: 'india' },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss', category: 'india' },
  { name: 'BusinessLine', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss', category: 'india' },
  { name: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/business.xml', category: 'markets' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'world' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'world' },
  { name: 'Le Monde Economy', url: 'https://www.lemonde.fr/en/economy/rss_full.xml', category: 'macro' },
];

const HIGH_IMPACT_TERMS = /\b(central bank|federal reserve|\bfed\b|\brbi\b|interest rate|rate decision|inflation|\bcpi\b|tariff|sanction|ceasefire|war|invasion|crude|oil price|opec|currency crisis|default)\b/i;
const MEDIUM_IMPACT_TERMS = /\b(earnings|gdp|jobs report|unemployment|trade|merger|acquisition|guidance|bond yield|rupee|dollar|gold|commodity)\b/i;

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

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|#38);/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function cleanRssText(value: string): string {
  const cleaned = decodeEntities(value.replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
  return cleaned.replace(/\]\]>$/g, '').trim();
}

function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return cleanRssText(match?.[1] ?? '');
}

function rssPublished(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

export function parseArthaRss(xml: string, source: string): ArthaNewsItem[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  return items.flatMap((raw): ArthaNewsItem[] => {
    const title = tag(raw, 'title').slice(0, 300);
    const url = httpUrl(tag(raw, 'link') || tag(raw, 'guid'));
    if (!title || !url) return [];
    const summary = tag(raw, 'description').slice(0, 500);
    const signal = `${title} ${summary}`;
    return [{
      title,
      summary,
      source,
      url,
      published: rssPublished(tag(raw, 'pubDate') || tag(raw, 'dc:date')),
      impact: HIGH_IMPACT_TERMS.test(signal) ? 'high' : MEDIUM_IMPACT_TERMS.test(signal) ? 'medium' : 'low',
      category: 'markets',
      tickers: [],
    }];
  }).slice(0, 8);
}

/** Fetch ARTHA's publisher RSS sources and interleave them for a balanced feed. */
export async function fetchArthaRssNews(fetcher: typeof fetch = fetch): Promise<ArthaNewsItem[]> {
  const responses = await Promise.all(ARTHA_RSS_FEEDS.map(async (feed) => {
    try {
      const response = await fetcher(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ARTHA-News/1.0)' },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok
        ? parseArthaRss(await response.text(), feed.name).map((item) => ({ ...item, category: feed.category }))
        : [];
    } catch {
      return [];
    }
  }));

  const headlines: ArthaNewsItem[] = [];
  const seen = new Set<string>();
  for (const feed of responses) {
    for (const item of feed) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        headlines.push(item);
      }
    }
  }
  return headlines
    .sort((a, b) => Date.parse(b.published || '1970-01-01') - Date.parse(a.published || '1970-01-01'))
    .slice(0, 40);
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
    const rawCategory = text(item.category, 12).toLowerCase();
    const summary = text(item.snippet ?? item.summary, 500);
    const signal = `${title} ${summary}`;
    const tickers = Array.isArray(item.tickers)
      ? item.tickers.filter((ticker): ticker is string => typeof ticker === 'string')
          .map((ticker) => ticker.trim().toUpperCase().slice(0, 24))
          .filter(Boolean).slice(0, 4)
      : [];

    return [{
      title,
      summary,
      source: publisher(url, text(item.source, 80)),
      url,
      published: text(item.published, 80),
      impact: rawImpact === 'high' || rawImpact === 'medium'
        ? rawImpact
        : HIGH_IMPACT_TERMS.test(signal) ? 'high' : MEDIUM_IMPACT_TERMS.test(signal) ? 'medium' : 'low',
      category: rawCategory === 'world' || rawCategory === 'macro' || rawCategory === 'india' ? rawCategory : 'markets',
      tickers,
    }];
  }).slice(0, 10);
}

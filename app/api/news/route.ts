import { NextRequest, NextResponse } from 'next/server';
import { allowApiRequest } from '@/lib/api-rate-limit';
import { fetchArthaRssNews, normalizeArthaNews } from '@/lib/artha-news';

export const dynamic = 'force-dynamic';

const arthaBaseUrl = (process.env.ARTHA_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'global-intelligence-news', 60)) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded.', items: [] }, { status: 429 });
  }

  try {
    const response = await fetch(`${arthaBaseUrl}/api/news`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (response.ok) {
      const items = normalizeArthaNews(await response.json());
      if (items.length) return NextResponse.json({ success: true, items, source: 'artha-api' });
    }
  } catch {
    // The hosted app normally cannot reach a local ARTHA process. Fall through
    // to ARTHA's public RSS sources below so the news panel stays online.
  }

  const items = await fetchArthaRssNews();
  if (items.length) return NextResponse.json({ success: true, items, source: 'artha-rss' });
  return NextResponse.json({ success: false, error: 'Global intelligence feeds are temporarily unavailable.', items: [] }, { status: 503 });
}

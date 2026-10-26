import { NextRequest, NextResponse } from 'next/server';
import { allowApiRequest } from '@/lib/api-rate-limit';
import { normalizeArthaNews } from '@/lib/artha-news';

export const dynamic = 'force-dynamic';

const arthaBaseUrl = (process.env.ARTHA_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'artha-news', 60)) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded.', items: [] }, { status: 429 });
  }

  try {
    const response = await fetch(`${arthaBaseUrl}/api/news`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return NextResponse.json({ success: false, error: 'ARTHA news is unavailable.', items: [] }, { status: 502 });
    }

    return NextResponse.json({ success: true, items: normalizeArthaNews(await response.json()) });
  } catch {
    return NextResponse.json({ success: false, error: 'ARTHA news is unavailable.', items: [] }, { status: 503 });
  }
}

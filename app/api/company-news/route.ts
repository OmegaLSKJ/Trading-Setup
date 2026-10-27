import { NextRequest, NextResponse } from 'next/server';
import { allowApiRequest } from '@/lib/api-rate-limit';
import { fetchCompanyNews } from '@/lib/market-intelligence';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'company-news', 30)) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded.', items: [] }, { status: 429 });
  }
  const rawKeys = new URL(request.url).searchParams.get('instrumentKeys') ?? '';
  const keys = [...new Set(rawKeys.split(',').map((key) => key.trim()).filter((key) => key && key.length <= 100))];
  if (keys.length === 0 || keys.length > 30) {
    return NextResponse.json({ success: false, error: 'Provide 1–30 instrument keys.', items: [] }, { status: 400 });
  }
  try {
    const items = await fetchCompanyNews(keys);
    return NextResponse.json({ success: true, source: 'upstox', items });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Company news unavailable.', items: [] }, { status: 503 });
  }
}

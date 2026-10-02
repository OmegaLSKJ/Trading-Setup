import { NextRequest, NextResponse } from 'next/server';
import { instrumentService } from '@/lib/instruments';
import { allowApiRequest } from '@/lib/api-rate-limit';

export async function GET(request: NextRequest) {
  if (!allowApiRequest(request, 'instrument-search', 120)) {
    return NextResponse.json({ success: false, error: 'Too many search requests; try again shortly', instruments: [] }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limitStr = searchParams.get('limit') || '30';
  const limit = Math.min(Math.max(parseInt(limitStr, 10) || 30, 1), 100);

  try {
    const results = await instrumentService.search(q, limit);
    return NextResponse.json({
      success: true,
      instruments: results,
      count: results.length,
      isMasterLoaded: instrumentService.isMasterLoaded(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to search instruments',
        instruments: [],
      },
      { status: 500 }
    );
  }
}

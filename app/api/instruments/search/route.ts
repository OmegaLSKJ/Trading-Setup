import { NextRequest, NextResponse } from 'next/server';
import { instrumentService } from '@/lib/instruments';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().slice(0, 60);
  const limitStr = searchParams.get('limit') || '30';
  const limit = Math.min(Math.max(parseInt(limitStr, 10) || 30, 1), 100);

  try {
    const results = await instrumentService.search(q, limit);
    return NextResponse.json({
      success: true,
      instruments: results,
      count: results.length,
      isMasterLoaded: instrumentService.isMasterLoaded(),
      masterLoaded: instrumentService.isMasterLoaded(),
      masterLoading: instrumentService.isLoadingMaster(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to search instruments';
    return NextResponse.json(
      {
        success: false,
        error: message,
        instruments: [],
        masterLoaded: instrumentService.isMasterLoaded(),
        masterLoading: instrumentService.isLoadingMaster(),
      },
      { status: 500 }
    );
  }
}

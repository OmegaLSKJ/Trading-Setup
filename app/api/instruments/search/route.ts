import { NextRequest, NextResponse } from 'next/server';
import { instrumentService } from '@/lib/instruments';

export async function GET(request: NextRequest) {
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
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to search instruments',
        instruments: [],
      },
      { status: 500 }
    );
  }
}

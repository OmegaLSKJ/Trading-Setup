import { NextRequest, NextResponse } from 'next/server';
import { allowApiRequest } from '@/lib/api-rate-limit';
import { recordForecastOutcome } from '@/lib/ai-forecast-memory';
import { Timeframe } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!allowApiRequest(request, 'ai-forecast-feedback', 60)) return NextResponse.json({ success: false, error: 'Feedback rate limit exceeded.' }, { status: 429 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.instrumentKey !== 'string' || typeof body.timeframe !== 'string' || !Number.isFinite(body.predictedClose) || !Number.isFinite(body.actualClose)) return NextResponse.json({ success: false, error: 'Invalid forecast outcome.' }, { status: 400 });
    await recordForecastOutcome({ instrumentKey: body.instrumentKey, timeframe: body.timeframe as Timeframe, predictedClose: body.predictedClose as number, actualClose: body.actualClose as number, createdAt: Date.now() });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ success: false, error: 'Unable to store forecast outcome.' }, { status: 500 }); }
}

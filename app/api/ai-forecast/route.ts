import { NextRequest, NextResponse } from 'next/server';
import { allowApiRequest } from '@/lib/api-rate-limit';
import { forecastPointsAreValid, sanitizeForecastCandles, supportsAiForecast } from '@/lib/ai-forecast';
import { getForecastCalibration } from '@/lib/ai-forecast-memory';
import { Candle, Timeframe } from '@/lib/types';

export const dynamic = 'force-dynamic';
const serviceUrl = process.env.AI_FORECAST_SERVICE_URL || 'http://127.0.0.1:8010';

export async function POST(request: NextRequest) {
  if (!allowApiRequest(request, 'ai-forecast', 20)) return NextResponse.json({ success: false, error: 'AI forecast rate limit exceeded.' }, { status: 429 });
  try {
    const body = await request.json() as { instrumentKey?: unknown; timeframe?: unknown; candles?: unknown };
    const instrumentKey = typeof body.instrumentKey === 'string' ? body.instrumentKey.trim() : '';
    const timeframe = body.timeframe as Timeframe;
    const candles = Array.isArray(body.candles) ? sanitizeForecastCandles(body.candles as Candle[]) : [];
    if (!instrumentKey || instrumentKey.length > 100 || !supportsAiForecast(timeframe)) return NextResponse.json({ success: false, error: 'AI Forecast supports 5m, 15m, 30m, 1h, and 1D charts only.' }, { status: 400 });
    if (candles.length < 40) return NextResponse.json({ success: false, error: 'AI Forecast needs at least 40 valid candles.' }, { status: 400 });
    const calibration = await getForecastCalibration(instrumentKey, timeframe);
    const response = await fetch(`${serviceUrl}/forecast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instrumentKey, timeframe, candles, calibration }), signal: AbortSignal.timeout(30_000) });
    const payload = await response.json() as { points?: unknown; error?: string };
    if (!response.ok || !forecastPointsAreValid(payload.points)) return NextResponse.json({ success: false, error: payload.error || 'Kronos forecast service returned an invalid response.' }, { status: 502 });
    return NextResponse.json({ success: true, forecast: { id: crypto.randomUUID(), instrumentKey, timeframe, generatedAt: Math.floor(Date.now() / 1000), points: payload.points, calibrationSampleCount: calibration.sampleCount, calibrationMeanError: calibration.meanError, source: 'kronos' } });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'AI forecast service is unavailable.' }, { status: 503 });
  }
}

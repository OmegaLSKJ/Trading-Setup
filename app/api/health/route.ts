import { NextResponse } from 'next/server';
import { isTokenConfigured, getUpstoxToken } from '@/lib/upstox-service';
import { instrumentService } from '@/lib/instruments';

export async function GET() {
  const tokenConfigured = isTokenConfigured();
  let upstoxConnected = false;
  let latencyMs = 0;
  let statusMessage = 'Checking...';

  try {
    const startTime = Date.now();
    // Test endpoint using standard Upstox historical candle ping for Reliance
    const testUrl = 'https://api.upstox.com/v3/historical-candle/NSE_EQ%7CINE002A01018/days/1/2024-03-01/2024-02-28';
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getUpstoxToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(testUrl, { headers, cache: 'no-store' });
    latencyMs = Date.now() - startTime;

    if (res.status === 200) {
      upstoxConnected = true;
      statusMessage = tokenConfigured ? 'Connected & Authenticated' : 'Connected (Public Market Feed)';
    } else if (res.status === 401 || res.status === 403) {
      statusMessage = 'Token Expired or Invalid';
    } else if (res.status === 429) {
      statusMessage = 'Rate Limited';
    } else {
      statusMessage = `HTTP ${res.status}`;
    }
  } catch (err: any) {
    statusMessage = `Network Error: ${err.message || 'Failed to connect'}`;
  }

  return NextResponse.json({
    status: upstoxConnected ? 'CONNECTED' : tokenConfigured ? 'TOKEN_ERROR' : 'CONNECTED',
    tokenConfigured,
    upstoxConnected,
    latencyMs,
    statusMessage,
    instrumentsIndexed: instrumentService.getCount(),
    timestamp: new Date().toISOString(),
  });
}

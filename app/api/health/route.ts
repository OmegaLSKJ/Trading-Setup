import { NextResponse } from 'next/server';
import { isTokenConfigured, getUpstoxToken } from '@/lib/upstox-service';
import { instrumentService } from '@/lib/instruments';
import { ConnectionStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface HealthCache {
  timestamp: number;
  data: {
    status: ConnectionStatus;
    tokenConfigured: boolean;
    upstoxConnected: boolean;
    latencyMs: number;
    statusMessage: string;
    instrumentsIndexed: number;
    timestamp: string;
    error?: string;
  };
}

let cachedHealth: HealthCache | null = null;
const HEALTH_CACHE_TTL_MS = 5000;

export async function GET() {
  const now = Date.now();
  if (cachedHealth && now - cachedHealth.timestamp < HEALTH_CACHE_TTL_MS) {
    return NextResponse.json(cachedHealth.data);
  }

  const tokenConfigured = isTokenConfigured();
  let upstoxConnected = false;
  let latencyMs = 0;
  let statusMessage = 'Checking...';
  let status: ConnectionStatus = 'OFFLINE';
  let probeError: string | undefined = undefined;

  if (!tokenConfigured) {
    status = 'NO_TOKEN';
    statusMessage = 'Upstox token not configured in .env.local';
  }

  try {
    const startTime = Date.now();
    const testUrl = 'https://api.upstox.com/v3/historical-candle/NSE_EQ%7CINE002A01018/days/1/2024-03-01/2024-02-28';
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getUpstoxToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(testUrl, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    latencyMs = Date.now() - startTime;

    if (res.status === 200) {
      upstoxConnected = true;
      status = 'CONNECTED';
      statusMessage = 'Upstox API Connected & Healthy';
    } else if (res.status === 401 || res.status === 403) {
      status = 'NO_TOKEN';
      statusMessage = 'Upstox Token Invalid or Expired';
      probeError = `HTTP ${res.status}: Unauthorized`;
    } else if (res.status === 429) {
      status = 'RATE_LIMITED';
      statusMessage = 'Upstox Rate Limit Exceeded';
      probeError = 'HTTP 429: Too Many Requests';
    } else {
      status = 'UPSTREAM_UNREACHABLE';
      statusMessage = `Upstream error: HTTP ${res.status}`;
      probeError = `HTTP ${res.status}`;
    }
  } catch (err: unknown) {
    status = 'UPSTREAM_UNREACHABLE';
    const msg = err instanceof Error ? err.message : 'Network failure';
    statusMessage = `Network Error: ${msg}`;
    probeError = msg;
  }

  const payload = {
    status,
    tokenConfigured,
    upstoxConnected,
    latencyMs,
    statusMessage,
    instrumentsIndexed: instrumentService.getCount(),
    timestamp: new Date().toISOString(),
    error: probeError,
  };

  cachedHealth = {
    timestamp: now,
    data: payload,
  };

  return NextResponse.json(payload);
}

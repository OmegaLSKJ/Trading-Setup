import { NextRequest, NextResponse } from 'next/server';
import { isTokenConfigured, getUpstoxToken } from '@/lib/upstox-service';
import { instrumentService } from '@/lib/instruments';
import { ConnectionStatus } from '@/lib/types';
import { allowApiRequest } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';

interface HealthData {
  status: ConnectionStatus;
  tokenConfigured: boolean;
  upstoxConnected: boolean;
  latencyMs: number;
  statusMessage: string;
  instrumentsIndexed: number;
  timestamp: string;
  error?: string;
}

interface HealthCache {
  timestamp: number;
  data: HealthData;
}

let cachedHealth: HealthCache | null = null;
const HEALTH_CACHE_TTL_MS = 5000;

// Single-flight in-progress probe tracker
let healthInFlight: Promise<HealthData> | null = null;

export async function GET(request: NextRequest) {
  // 1. Ingress rate limit check
  const allowed = allowApiRequest(request, 'health', 60);
  if (!allowed) {
    return NextResponse.json(
      {
        status: 'RATE_LIMITED' as ConnectionStatus,
        tokenConfigured: isTokenConfigured(),
        upstoxConnected: false,
        latencyMs: 0,
        statusMessage: 'Rate limit exceeded. Please slow down your requests.',
        instrumentsIndexed: instrumentService.getCount(),
        timestamp: new Date().toISOString(),
        error: 'Too Many Requests',
      },
      { status: 429 }
    );
  }

  const now = Date.now();
  if (cachedHealth && now - cachedHealth.timestamp < HEALTH_CACHE_TTL_MS) {
    return NextResponse.json(cachedHealth.data);
  }

  const tokenConfigured = isTokenConfigured();

  // If no token exists, return missing-token status without a probe
  if (!tokenConfigured) {
    const payload: HealthData = {
      status: 'NO_TOKEN',
      tokenConfigured: false,
      upstoxConnected: false,
      latencyMs: 0,
      statusMessage: 'Upstox token not configured in .env.local',
      instrumentsIndexed: instrumentService.getCount(),
      timestamp: new Date().toISOString(),
    };
    return NextResponse.json(payload);
  }

  // Cache-miss single-flight
  if (!healthInFlight) {
    healthInFlight = (async (): Promise<HealthData> => {
      let upstoxConnected = false;
      let latencyMs = 0;
      let statusMessage = 'Checking...';
      let status: ConnectionStatus = 'OFFLINE';
      let probeError: string | undefined = undefined;

      const startTime = Date.now();
      const testUrl = 'https://api.upstox.com/v3/historical-candle/NSE_EQ%7CINE002A01018/days/1/2024-03-01/2024-02-28';
      const headers: Record<string, string> = { Accept: 'application/json' };
      const token = getUpstoxToken();

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      try {
        const res = await fetch(testUrl, {
          headers,
          cache: 'no-store',
          signal: controller.signal,
        });

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
      } finally {
        clearTimeout(timeoutId);
      }

      const payload: HealthData = {
        status,
        tokenConfigured: true,
        upstoxConnected,
        latencyMs,
        statusMessage,
        instrumentsIndexed: instrumentService.getCount(),
        timestamp: new Date().toISOString(),
        error: probeError,
      };

      cachedHealth = {
        timestamp: Date.now(),
        data: payload,
      };

      return payload;
    })().finally(() => {
      healthInFlight = null;
    });
  }

  const result = await healthInFlight;
  return NextResponse.json(result);
}

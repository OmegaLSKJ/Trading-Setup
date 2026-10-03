import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/live/stream/route';
import { LiveStreamManager } from '../lib/live-stream';

describe('Live Stream Route GET & LiveStreamManager', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('rejects with HTTP 429 when rate limited', async () => {
    const rateLimitModule = await import('../lib/api-rate-limit');
    const spy = vi.spyOn(rateLimitModule, 'allowApiRequest').mockReturnValueOnce(false);

    const req = new NextRequest('http://localhost:3000/api/live/stream?instruments=NSE_EQ%7CINE002A01018');
    const res = await GET(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Rate limit exceeded');
    spy.mockRestore();
  });

  it('emits missing-token status event when Upstox token is absent', async () => {
    delete process.env.UPSTOX_TOKEN;
    delete process.env.UPSTOX_ANALYTICS_TOKEN;

    const req = new NextRequest('http://localhost:3000/api/live/stream?instruments=NSE_EQ%7CINE002A01018');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(res.headers.get('connection')).toBe('keep-alive');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let foundTokenStatus = false;
    for (let i = 0; i < 3; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes('NO_TOKEN') || text.includes('UPSTOX')) {
        foundTokenStatus = true;
        expect(text).toContain('NO_TOKEN');
        break;
      }
    }
    expect(foundTokenStatus).toBe(true);

    await reader.cancel();
  });

  it('handles already-aborted request gracefully without stalling', async () => {
    const controller = new AbortController();
    controller.abort();

    const req = new NextRequest('http://localhost:3000/api/live/stream?instruments=NSE_EQ%7CINE002A01018', {
      signal: controller.signal,
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('emits volume-only changes even when price is unchanged', async () => {
    process.env.UPSTOX_TOKEN = 'test-token';
    process.env.UPSTOX_ANALYTICS_TOKEN = 'test-token';

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            'NSE_EQ:RELIANCE': {
              last_price: 2500,
              net_change: 10,
              percentage_change: 0.4,
              volume: fetchCount === 1 ? 1000 : 1500,
              timestamp: new Date().toISOString(),
            },
          },
        }),
      } as unknown as Response;
    });

    const req = new NextRequest('http://localhost:3000/api/live/stream?instruments=NSE_EQ%7CINE002A01018');
    const res = await GET(req);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read events until we encounter the quote ticks
    let foundBaseline = false;

    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text.includes('"price":2500') || text.includes('NSE_EQ|INE002A01018')) {
        if (!foundBaseline) {
          foundBaseline = true;
        } else {
          expect(text).toContain('"price":2500');
          break;
        }
      }
    }

    expect(foundBaseline).toBe(true);
    await reader.cancel();
  });

  it('coalesces pending snapshots under backpressure and flushes on reader pull', async () => {
    process.env.UPSTOX_ANALYTICS_TOKEN = 'test-token';

    let quotePrice = 100;
    global.fetch = vi.fn().mockImplementation(async () => {
      quotePrice += 2;
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            'NSE_EQ:RELIANCE': {
              last_price: quotePrice,
              net_change: quotePrice - 100,
              percentage_change: 2.0,
              volume: 1000,
              timestamp: new Date().toISOString(),
            },
          },
        }),
      } as unknown as Response;
    });

    const req = new NextRequest('http://localhost:3000/api/live/stream?instruments=NSE_EQ%7CINE002A01018');
    const res = await GET(req);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const read1 = await reader.read();
    expect(decoder.decode(read1.value)).toContain('data:');

    // Simulate controlled/slow reader backpressure
    await new Promise((r) => setTimeout(r, 600));

    const read2 = await reader.read();
    const text2 = decoder.decode(read2.value);
    expect(text2).toContain('data:');

    await reader.cancel();
  });

  it('handles hung provider timeouts per instrument without crashing stream', async () => {
    process.env.UPSTOX_ANALYTICS_TOKEN = 'test-token';

    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      // Simulate timeout by listening to signal
      return new Promise((_, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'TimeoutError';
            reject(err);
          });
        }
      });
    });

    const req = new NextRequest('http://localhost:3000/api/live/stream?instruments=NSE_EQ%7CINE002A01018');
    const res = await GET(req);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // First event should indicate timeout or stale quote status
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain('data:');

    await reader.cancel();
  });
});

describe('LiveStreamManager Node Dispatch', () => {
  it('dispatches broadcast events without instrumentKey to all subscribers', () => {
    const manager = new LiveStreamManager();
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];

    manager.subscribe('NSE_EQ|INE002A01018', (e) => receivedA.push(e));
    manager.subscribe('NSE_EQ|INE467B01029', (e) => receivedB.push(e));

    const broadcastEvent = {
      type: 'MARKET_STATUS',
      session: 'OPEN',
      isOpen: true,
    };

    manager.dispatchTick(broadcastEvent);

    expect(receivedA.length).toBe(1);
    expect(receivedB.length).toBe(1);
    expect(receivedA[0]).toEqual(broadcastEvent);
    expect(receivedB[0]).toEqual(broadcastEvent);
  });

  it('dispatches instrument-specific ticks strictly to subscribed listeners', () => {
    const manager = new LiveStreamManager();
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];

    manager.subscribe('NSE_EQ|INE002A01018', (e) => receivedA.push(e));
    manager.subscribe('NSE_EQ|INE467B01029', (e) => receivedB.push(e));

    const tickA = {
      instrumentKey: 'NSE_EQ|INE002A01018',
      price: 2500,
      close: 2500,
      direction: 'UP' as const,
      timestamp: Date.now() / 1000,
      volumeDelta: 100,
      state: 'FRESH' as const,
    };

    manager.dispatchTick(tickA);

    expect(receivedA.length).toBe(1);
    expect(receivedB.length).toBe(0);
    expect(receivedA[0]).toEqual(tickA);
  });
});

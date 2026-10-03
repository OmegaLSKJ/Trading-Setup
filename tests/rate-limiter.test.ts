import { describe, it, expect } from 'vitest';
import { RequestQueue } from '../lib/rate-limiter';

describe('RequestQueue & Rate Limiter', () => {
  it('processes tasks concurrently up to maxConcurrency', async () => {
    const queue = new RequestQueue(3, 10, 50);
    let active = 0;
    let maxSeenActive = 0;

    const task = () =>
      queue.enqueue(async () => {
        active++;
        if (active > maxSeenActive) maxSeenActive = active;
        await new Promise((r) => setTimeout(r, 40));
        active--;
        return true;
      });

    const results = await Promise.all([task(), task(), task(), task(), task()]);
    expect(results.every(Boolean)).toBe(true);
    expect(maxSeenActive).toBeLessThanOrEqual(3);
    expect(maxSeenActive).toBeGreaterThanOrEqual(2);
  });

  it('enforces minimum interval spacing between task starts', async () => {
    const queue = new RequestQueue(3, 80, 50);
    const startTimes: number[] = [];

    const task = () =>
      queue.enqueue(async () => {
        startTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 10));
        return true;
      });

    await Promise.all([task(), task(), task()]);
    expect(startTimes.length).toBe(3);
    // Tasks should be spaced by minIntervalMs (allowing for OS timer jitter)
    expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(50);
    expect(startTimes[2] - startTimes[1]).toBeGreaterThanOrEqual(50);
  });

  it('retries with Retry-After header seconds on 429 and 503', async () => {
    const queue = new RequestQueue(1, 0, 50);
    let attempts = 0;

    const result = await queue.enqueue(async () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('Service Unavailable') as Error & {
          status: number;
          headers: Record<string, string>;
        };
        error.status = 503;
        error.headers = { 'Retry-After': '0' }; // 0 second delay (+ jitter)
        throw error;
      }
      return 'success';
    });

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('parses HTTP-date Retry-After headers', async () => {
    const queue = new RequestQueue(1, 0, 50);
    let attempts = 0;

    // Set future HTTP date 1 second ahead
    const futureDate = new Date(Date.now() + 1000).toUTCString();

    const result = await queue.enqueue(async () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('Too Many Requests') as Error & {
          status: number;
          headers: Record<string, string>;
        };
        error.status = 429;
        error.headers = { 'retry-after': futureDate };
        throw error;
      }
      return 'done';
    });

    expect(result).toBe('done');
    expect(attempts).toBe(2);
  });
  it('rejects on pending-limit saturation', async () => {
    // maxConcurrency = 1, minIntervalMs = 500, maxPendingQueue = 2
    const queue = new RequestQueue(1, 500, 2);
    let releaseBlocker: () => void = () => {};
    const blockerPromise = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });

    // 1st task executes and stays active
    const t1 = queue.enqueue(() => blockerPromise);
    // Allow t1 to start and become active
    await new Promise((r) => setTimeout(r, 10));

    // 2nd task enqueued (pending = 1)
    const t2 = queue.enqueue(() => blockerPromise);
    // 3rd task enqueued (pending = 2)
    const t3 = queue.enqueue(() => blockerPromise);

    // 4th task exceeds maxPendingQueue (2) and must reject immediately
    await expect(queue.enqueue(() => Promise.resolve('overflow'))).rejects.toThrow(
      /Queue saturated: maximum pending request capacity exceeded/
    );

    releaseBlocker();
    await Promise.all([t1, t2, t3]);
  });

  it('exhausts retries and propagates error after max attempts', async () => {
    const queue = new RequestQueue(1, 0, 50);
    let attempts = 0;

    await expect(
      queue.enqueue(async () => {
        attempts++;
        const error = new Error('Rate limit exceeded') as Error & {
          status: number;
          headers: Record<string, string>;
        };
        error.status = 429;
        error.headers = { 'Retry-After': '0' };
        throw error;
      }, 2)
    ).rejects.toThrow('Rate limit exceeded');

    // Initial attempt + 2 retries = 3 attempts
    expect(attempts).toBe(3);
  });

  it('rejects retry re-entry if queue is full when retry fires', async () => {
    const queue = new RequestQueue(1, 0, 2);
    let attempts = 0;

    const retryTaskPromise = queue.enqueue(async () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('Temporary throttle') as Error & {
          status: number;
          headers: Record<string, string>;
        };
        error.status = 429;
        error.headers = { 'Retry-After': '0' };
        throw error;
      }
      return 'ok';
    });

    // Wait for initial attempt to start and schedule retry delay
    await new Promise((r) => setTimeout(r, 10));

    // While retry timer is pending, fill the queue to maxPendingQueue (2)
    let releaseFillers: () => void = () => {};
    const fillerPromise = new Promise<void>((resolve) => {
      releaseFillers = resolve;
    });

    const f1 = queue.enqueue(() => fillerPromise);
    const f2 = queue.enqueue(() => fillerPromise);

    // When retry fires, queue.length is 2 (>= maxPendingQueue 2), so re-entry fails
    await expect(retryTaskPromise).rejects.toThrow(
      /Queue saturated: retry could not re-enter full queue/
    );

    releaseFillers();
    await Promise.all([f1, f2]);
  });
});

describe('Instrument Search & Master Lifecycle', () => {
  it('preserves exact-match ranking despite early loop exit', async () => {
    const { InstrumentMasterService } = await import('../lib/instruments');
    const service = new InstrumentMasterService();

    // Create a mock dataset with 30 prefix matches followed by the exact match
    const customList = [];
    for (let i = 0; i < 30; i++) {
      customList.push({
        instrument_key: `NSE_EQ|PREFIX_${i}`,
        trading_symbol: `TATAMOTORS_${i}`,
        name: `Tata Motors Part ${i}`,
        exchange: 'NSE' as const,
        segment: 'NSE_EQ' as const,
        instrument_type: 'EQ' as const,
      });
    }
    // Place exact match at the very end
    customList.push({
      instrument_key: 'NSE_EQ|INE155A01022',
      trading_symbol: 'TATAMOTORS',
      name: 'TATA MOTORS LIMITED',
      exchange: 'NSE' as const,
      segment: 'NSE_EQ' as const,
      instrument_type: 'EQ' as const,
    });

    service.atomicReplace(customList);

    // Search with limit = 5 (loop break at limit * 2 = 10 matches)
    const results = await service.search('TATAMOTORS', 5);

    expect(results.length).toBeGreaterThan(0);
    // The exact match must be the first item
    expect(results[0].trading_symbol).toBe('TATAMOTORS');
    expect(results[0].instrument_key).toBe('NSE_EQ|INE155A01022');
  });

  it('triggers background refresh for stale instrument master (>24h) while serving current data', async () => {
    const { InstrumentMasterService } = await import('../lib/instruments');
    const service = new InstrumentMasterService();

    // Mark service as loaded with stale timestamp 25 hours ago
    const staleTime = Date.now() - 25 * 60 * 60 * 1000;
    service.setLastLoadTimeForTesting(staleTime);

    let refreshCalled = false;
    // Spy on initMaster
    const origInit = service.initMaster.bind(service);
    service.initMaster = async (forceRefresh?: boolean) => {
      if (forceRefresh) refreshCalled = true;
      return origInit(forceRefresh);
    };

    // Perform search
    const results = await service.search('RELIANCE', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].trading_symbol).toBe('RELIANCE');
    expect(refreshCalled).toBe(true);
  });
});

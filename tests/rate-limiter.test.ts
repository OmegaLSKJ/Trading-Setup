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
});

import 'server-only';

/**
 * Server-side Upstox Rate Limiter & Concurrency Queue
 * Prevents hammering the Upstox API with simultaneous multi-chart queries.
 */

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  retries: number;
}

export class RequestQueue {
  private queue: QueuedTask<unknown>[] = [];
  private activeCount = 0;
  private maxConcurrency = 4;
  private maxPendingQueue = 150;
  private minIntervalMs = 50; // Minimum interval between requests
  private lastRequestTime = 0;
  private isProcessing = false;

  constructor(maxConcurrency = 4, minIntervalMs = 50, maxPendingQueue = 150) {
    this.maxConcurrency = maxConcurrency;
    this.minIntervalMs = minIntervalMs;
    this.maxPendingQueue = maxPendingQueue;
  }

  public enqueue<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    if (this.queue.length >= this.maxPendingQueue) {
      return Promise.reject(new Error('Upstox request queue limit exceeded (too many pending requests).'));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries,
      });
      this.scheduleProcessing();
    });
  }

  private scheduleProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    Promise.resolve().then(() => {
      this.isProcessing = false;
      this.processNext();
    });
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    // Enforce serialized spacing between requests with reservation
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error: unknown) {
      const err = error as {
        status?: number;
        retryAfter?: number;
        code?: string;
        message?: string;
        headers?: Headers | Record<string, string>;
      };

      const status = err?.status;
      const isRateLimit = status === 429;
      const isServerError = status && status >= 500 && status < 600;
      const isNetworkException =
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'EAI_AGAIN' ||
        (err?.message && err.message.toLowerCase().includes('fetch failed'));

      if ((isRateLimit || isServerError || isNetworkException) && task.retries > 0) {
        let retryAfterSec = err?.retryAfter;

        // Parse Retry-After header if present
        if (!retryAfterSec && err?.headers) {
          const headerVal =
            err.headers instanceof Headers
              ? err.headers.get('retry-after')
              : (err.headers as Record<string, string>)['retry-after'];

          if (headerVal) {
            const parsed = parseInt(headerVal, 10);
            if (!isNaN(parsed)) {
              retryAfterSec = parsed;
            }
          }
        }

        // Add randomized jitter (50ms - 250ms) to avoid thundering herd
        const jitter = Math.floor(Math.random() * 200) + 50;
        const delay = isRateLimit
          ? (retryAfterSec ? retryAfterSec * 1000 : 1500 * (4 - task.retries)) + jitter
          : 800 * (4 - task.retries) + jitter;

        console.warn(
          `Upstox request retry scheduled: status=${status || 'NETWORK_ERR'}, delay=${delay}ms, retriesLeft=${task.retries - 1}`
        );

        await new Promise((r) => setTimeout(r, delay));

        // Re-enqueue task
        this.queue.unshift({
          ...task,
          retries: task.retries - 1,
        });
      } else {
        task.reject(error);
      }
    } finally {
      this.activeCount--;
      this.scheduleProcessing();
    }
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }
}

// Global server singleton queue
export const upstoxRequestQueue = new RequestQueue(5, 40, 150);

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
      return Promise.reject(new Error('Queue saturated: maximum pending request capacity exceeded.'));
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
      while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
        this.processNext();
      }
    });
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    // Enforce serialized spacing between requests by reserving the slot
    const now = Date.now();
    const scheduledTime = Math.max(now, this.lastRequestTime + this.minIntervalMs);
    this.lastRequestTime = scheduledTime;

    const waitMs = scheduledTime - now;
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Allow additional queued tasks to start when concurrency capacity remains available
    this.scheduleProcessing();

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error: unknown) {
      const err = error as {
        status?: number;
        retryAfter?: number | string;
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
        let retryAfterSec: number | undefined;

        if (typeof err?.retryAfter === 'number' && !isNaN(err.retryAfter) && err.retryAfter >= 0) {
          retryAfterSec = err.retryAfter;
        } else if (typeof err?.retryAfter === 'string') {
          const trimmed = err.retryAfter.trim();
          if (/^\d+$/.test(trimmed)) {
            const parsed = parseInt(trimmed, 10);
            if (!isNaN(parsed) && parsed >= 0) {
              retryAfterSec = parsed;
            }
          } else {
            // Try parsing as HTTP-date (RFC 7231 / RFC 9110)
            const dateMs = Date.parse(trimmed);
            if (!isNaN(dateMs)) {
              const diffSec = Math.ceil((dateMs - Date.now()) / 1000);
              retryAfterSec = Math.max(0, diffSec);
            }
          }
        }

        // Parse Retry-After header if present
        if (retryAfterSec === undefined && err?.headers) {
          let rawHeaderVal: string | null | undefined;
          if (err.headers instanceof Headers) {
            rawHeaderVal = err.headers.get('retry-after');
          } else if (typeof err.headers === 'object' && err.headers !== null) {
            const record = err.headers as Record<string, unknown>;
            const key = Object.keys(record).find((k) => k.toLowerCase() === 'retry-after');
            if (key && typeof record[key] === 'string') {
              rawHeaderVal = record[key] as string;
            }
          }

          if (rawHeaderVal) {
            const trimmed = rawHeaderVal.trim();
            if (/^\d+$/.test(trimmed)) {
              const parsed = parseInt(trimmed, 10);
              if (!isNaN(parsed) && parsed >= 0) {
                retryAfterSec = parsed;
              }
            } else {
              // Try parsing as HTTP-date (RFC 7231 / RFC 9110)
              const dateMs = Date.parse(trimmed);
              if (!isNaN(dateMs)) {
                const diffSec = Math.ceil((dateMs - Date.now()) / 1000);
                retryAfterSec = Math.max(0, diffSec);
              }
            }
          }
        }

        // Add randomized jitter (50ms - 250ms) to avoid thundering herd
        const jitter = Math.floor(Math.random() * 200) + 50;
        const delay =
          retryAfterSec !== undefined && retryAfterSec >= 0
            ? retryAfterSec * 1000 + jitter
            : (isRateLimit ? 1500 * (4 - task.retries) : 800 * (4 - task.retries)) + jitter;

        console.warn(
          `Upstox request retry scheduled: status=${status || 'NETWORK_ERR'}, delay=${delay}ms, retriesLeft=${task.retries - 1}`
        );

        await new Promise((r) => setTimeout(r, delay));

        // Re-enqueue task, checking maxPendingQueue limit
        if (this.queue.length >= this.maxPendingQueue) {
          task.reject(new Error('Queue saturated: retry could not re-enter full queue.'));
        } else {
          this.queue.unshift({
            ...task,
            retries: task.retries - 1,
          });
        }
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

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

class RequestQueue {
  private queue: QueuedTask<unknown>[] = [];
  private activeCount = 0;
  private maxConcurrency = 4;
  private minIntervalMs = 50; // Minimum interval between requests
  private lastRequestTime = 0;

  constructor(maxConcurrency = 4, minIntervalMs = 50) {
    this.maxConcurrency = maxConcurrency;
    this.minIntervalMs = minIntervalMs;
  }

  public enqueue<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        retries,
      });
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

    // Enforce spacing between calls
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
      // Check if retryable (e.g., 429 rate limit or 5xx or network error)
      const err = error as { status?: number; retryAfter?: number };
      const status = err?.status;
      const isRateLimit = status === 429;
      const isServerError = status && status >= 500 && status < 600;

      if ((isRateLimit || isServerError) && task.retries > 0) {
        const delay = isRateLimit
          ? (err.retryAfter ? err.retryAfter * 1000 : 1500 * (4 - task.retries))
          : 800 * (4 - task.retries);

        console.warn(`Upstox API request rate-limited/failed with status ${status}. Retrying in ${delay}ms... (${task.retries} retries remaining)`);
        
        await new Promise((r) => setTimeout(r, delay));
        
        // Re-enqueue
        this.queue.unshift({
          ...task,
          retries: task.retries - 1,
        });
      } else {
        task.reject(error);
      }
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}

// Global server singleton queue
export const upstoxRequestQueue = new RequestQueue(5, 40);

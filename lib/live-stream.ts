import { LiveTick } from './types';
export type { LiveTick };

type LiveTickListener = (tick: LiveTick) => void;

class LiveStreamManager {
  private listeners: Map<string, Set<LiveTickListener>> = new Map();
  private eventSource: EventSource | null = null;
  private subscribedKeys: Set<string> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionGeneration = 0;

  public subscribe(instrumentKey: string, listener: LiveTickListener): () => void {
    if (!this.listeners.has(instrumentKey)) {
      this.listeners.set(instrumentKey, new Set());
    }
    this.listeners.get(instrumentKey)!.add(listener);
    this.subscribedKeys.add(instrumentKey);

    this.restartStream();

    return () => {
      const set = this.listeners.get(instrumentKey);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(instrumentKey);
          this.subscribedKeys.delete(instrumentKey);
          this.restartStream();
        }
      }
    };
  }

  public dispatchTick(tick: LiveTick) {
    if (!tick || !tick.instrumentKey) return;
    const set = this.listeners.get(tick.instrumentKey);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(tick);
        } catch (e) {
          console.error('Error dispatching tick:', e);
        }
      });
      return;
    }

    // Case-insensitive fallback matching
    for (const [key, listenerSet] of this.listeners.entries()) {
      if (key.toLowerCase() === tick.instrumentKey.toLowerCase()) {
        listenerSet.forEach((listener) => {
          try {
            listener(tick);
          } catch (e) {
            console.error('Error dispatching tick:', e);
          }
        });
      }
    }
  }

  private restartStream() {
    if (typeof window === 'undefined') return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 150);
  }

  private connect() {
    // Clear any pending retry timer on active connect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.subscribedKeys.size === 0) {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const currentGen = ++this.connectionGeneration;
    const keys = Array.from(this.subscribedKeys).join(',');
    const url = `/api/live/stream?instruments=${encodeURIComponent(keys)}`;

    try {
      const es = new EventSource(url);
      this.eventSource = es;

      es.onmessage = (event) => {
        if (this.connectionGeneration !== currentGen) return;
        try {
          const data: LiveTick = JSON.parse(event.data);
          this.dispatchTick(data);
        } catch {
          // ignore heartbeat / non-JSON events
        }
      };

      es.onerror = () => {
        if (this.connectionGeneration !== currentGen) return;
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }

        // Single retry timer for reconnect
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 2000);
        }
      };
    } catch (e) {
      console.warn('Failed establishing SSE connection:', e);
    }
  }
}

export const liveStreamManager = new LiveStreamManager();

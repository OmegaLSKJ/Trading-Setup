import { LiveTick } from './types';
export type { LiveTick };

export type LiveStreamEvent = LiveTick | {
  type: string;
  instrumentKey?: string;
  [key: string]: unknown;
};

type LiveEventListener = (event: LiveStreamEvent) => void;

export class LiveStreamManager {
  private listeners: Map<string, Set<LiveEventListener>> = new Map();
  private globalListeners: Set<LiveEventListener> = new Set();
  private eventSource: EventSource | null = null;
  private subscribedKeys: Set<string> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionGeneration = 0;

  public subscribe(instrumentKey: string, listener: LiveEventListener): () => void {
    const isNewKey = !this.subscribedKeys.has(instrumentKey);

    if (!this.listeners.has(instrumentKey)) {
      this.listeners.set(instrumentKey, new Set());
    }
    this.listeners.get(instrumentKey)!.add(listener);
    this.subscribedKeys.add(instrumentKey);

    // Do not restart transport for another listener on an already-subscribed key
    if (isNewKey) {
      this.restartStream();
    }

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

  public subscribeGlobal(listener: LiveEventListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  public dispatchTick(event: LiveStreamEvent) {
    if (!event) return;

    // Dispatch global listeners first
    this.globalListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.error('Error dispatching to global listener:', e);
      }
    });

    // If event has no instrumentKey (e.g. MARKET_STATUS, STATUS), broadcast to all subscribers
    if (!event.instrumentKey) {
      for (const listenerSet of this.listeners.values()) {
        listenerSet.forEach((listener) => {
          try {
            listener(event);
          } catch (e) {
            console.error('Error dispatching broadcast event:', e);
          }
        });
      }
      return;
    }

    const set = this.listeners.get(event.instrumentKey);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(event);
        } catch (e) {
          console.error('Error dispatching tick:', e);
        }
      });
      return;
    }

    // Case-insensitive fallback matching
    for (const [key, listenerSet] of this.listeners.entries()) {
      if (key.toLowerCase() === event.instrumentKey.toLowerCase()) {
        listenerSet.forEach((listener) => {
          try {
            listener(event);
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
      if (typeof EventSource === 'undefined') return;

      const es = new EventSource(url);
      this.eventSource = es;

      es.onmessage = (event) => {
        if (this.connectionGeneration !== currentGen) return;
        try {
          const data: LiveStreamEvent = JSON.parse(event.data);
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
      // If EventSource constructor throws, schedule retry
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    }
  }
}

export const liveStreamManager = new LiveStreamManager();

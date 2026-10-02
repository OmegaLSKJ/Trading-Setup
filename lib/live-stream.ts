export interface LiveTick {
  instrumentKey: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volumeDelta: number;
  timestamp: number; // Unix seconds
  direction: 'UP' | 'DOWN' | 'EQUAL';
}

type LiveTickListener = (tick: LiveTick) => void;

class LiveStreamManager {
  private listeners: Map<string, Set<LiveTickListener>> = new Map();
  private eventSource: EventSource | null = null;
  private subscribedKeys: Set<string> = new Set();
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

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
    const set = this.listeners.get(tick.instrumentKey);
    if (set) {
      set.forEach((listener) => {
        try {
          listener(tick);
        } catch (e) {
          console.error('Error dispatching tick:', e);
        }
      });
    }
  }

  private restartStream() {
    if (typeof window === 'undefined') return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 150);
  }

  private connect() {
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

    const keys = Array.from(this.subscribedKeys).join(',');
    const url = `/api/live/stream?instruments=${encodeURIComponent(keys)}`;

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onmessage = (event) => {
        try {
          const data: LiveTick = JSON.parse(event.data);
          this.dispatchTick(data);
        } catch {
          // ignore heartbeat / ping
        }
      };

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Auto-reconnect after 2 seconds
        setTimeout(() => this.connect(), 2000);
      };
    } catch (e) {
      console.warn('Failed establishing SSE connection:', e);
    }
  }
}

export const liveStreamManager = new LiveStreamManager();

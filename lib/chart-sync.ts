type CrosshairListener = (sourceChartId: string, time: number | null, point: { x: number; y: number } | null) => void;
type TimeRangeListener = (sourceChartId: string, from: number, to: number) => void;

class ChartSyncBus {
  private crosshairListeners: Set<CrosshairListener> = new Set();
  private timeRangeListeners: Set<TimeRangeListener> = new Set();

  public subscribeCrosshair(listener: CrosshairListener): () => void {
    this.crosshairListeners.add(listener);
    return () => this.crosshairListeners.delete(listener);
  }

  public emitCrosshair(sourceChartId: string, time: number | null, point: { x: number; y: number } | null) {
    this.crosshairListeners.forEach((listener) => {
      try {
        listener(sourceChartId, time, point);
      } catch (err) {
        console.error('Crosshair sync error:', err);
      }
    });
  }

  public subscribeTimeRange(listener: TimeRangeListener): () => void {
    this.timeRangeListeners.add(listener);
    return () => this.timeRangeListeners.delete(listener);
  }

  public emitTimeRange(sourceChartId: string, from: number, to: number) {
    this.timeRangeListeners.forEach((listener) => {
      try {
        listener(sourceChartId, from, to);
      } catch (err) {
        console.error('Time range sync error:', err);
      }
    });
  }
}

export const chartSyncBus = new ChartSyncBus();

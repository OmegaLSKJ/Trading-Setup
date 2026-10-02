import { create } from 'zustand';
import {
  ChartPanelState,
  Instrument,
  LayoutGridMode,
  SavedLayout,
  SyncSettings,
  Timeframe,
  DateRangePreset,
  IndicatorConfig,
  AutoRefreshInterval,
  ConnectionStatus,
} from '@/lib/types';

const DEFAULT_INDICATORS: IndicatorConfig = {
  ema8: true,
  ema16: true,
  ema20: false,
  ema50: false,
  ema200: false,
  rsi14: false,
  vwap: false,
  volume: true,
  strategy: true,
};

const DEFAULT_INSTRUMENTS: Instrument[] = [
  {
    instrument_key: 'NSE_INDEX|Nifty 50',
    trading_symbol: 'NIFTY 50',
    name: 'NIFTY 50 INDEX',
    exchange: 'NSE',
    segment: 'NSE_INDEX',
    instrument_type: 'INDEX',
  },
  {
    instrument_key: 'NSE_EQ|INE002A01018',
    trading_symbol: 'RELIANCE',
    name: 'RELIANCE INDUSTRIES LTD',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE040A01034',
    trading_symbol: 'HDFCBANK',
    name: 'HDFC BANK LIMITED',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE467B01029',
    trading_symbol: 'TCS',
    name: 'TATA CONSULTANCY SERVICES LTD',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
];

const INITIAL_CHARTS: ChartPanelState[] = DEFAULT_INSTRUMENTS.map((inst, idx) => ({
  id: `chart-${idx + 1}`,
  instrument: inst,
  timeframe: '5m',
  dateRangePreset: '5D',
  indicators: { ...DEFAULT_INDICATORS },
  isExpanded: false,
}));

interface DashboardState {
  charts: ChartPanelState[];
  activeChartId: string;
  layoutMode: LayoutGridMode;
  watchlist: Instrument[];
  savedLayouts: SavedLayout[];
  syncSettings: SyncSettings;
  autoRefreshInterval: AutoRefreshInterval;
  connectionStatus: ConnectionStatus;
  connectionDetails: {
    latencyMs: number;
    statusMessage: string;
    instrumentsIndexed: number;
  };
  globalRefreshTrigger: number;
  isSymbolSearchOpen: boolean;
  targetChartForSearch: string | null;
  isLayoutModalOpen: boolean;
  isSettingsModalOpen: boolean;

  // Actions
  setActiveChartId: (id: string) => void;
  setLayoutMode: (mode: LayoutGridMode) => void;
  updateChartInstrument: (chartId: string, instrument: Instrument) => void;
  updateChartTimeframe: (chartId: string, timeframe: Timeframe) => void;
  updateChartDateRange: (
    chartId: string,
    preset: DateRangePreset,
    customFrom?: string,
    customTo?: string
  ) => void;
  toggleChartIndicator: (
    chartId: string,
    indicator: keyof IndicatorConfig
  ) => void;
  setChartExpanded: (chartId: string, isExpanded: boolean) => void;
  removeChart: (chartId: string) => void;
  addChart: (instrument?: Instrument) => void;
  setGlobalTimeframe: (timeframe: Timeframe) => void;
  triggerGlobalRefresh: () => void;

  // Watchlist actions
  addToWatchlist: (instrument: Instrument) => void;
  removeFromWatchlist: (instrumentKey: string) => void;
  reorderWatchlist: (newList: Instrument[]) => void;

  // Layout actions
  saveCurrentLayout: (name: string) => void;
  loadSavedLayout: (layoutId: string) => void;
  deleteSavedLayout: (layoutId: string) => void;

  // Sync settings
  updateSyncSettings: (settings: Partial<SyncSettings>) => void;
  setAutoRefreshInterval: (interval: AutoRefreshInterval) => void;
  setConnectionStatus: (
    status: ConnectionStatus,
    details?: Partial<DashboardState['connectionDetails']>
  ) => void;

  // Modal triggers
  openSymbolSearch: (targetChartId?: string) => void;
  closeSymbolSearch: () => void;
  setLayoutModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;

  // Hydration from LocalStorage
  loadPersistedState: () => void;

  // Global Strategy Application
  applyStrategyToAllCharts: (enable?: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  charts: INITIAL_CHARTS,
  activeChartId: INITIAL_CHARTS[0].id,
  layoutMode: '4',
  watchlist: DEFAULT_INSTRUMENTS,
  savedLayouts: [],
  syncSettings: {
    crosshair: true,
    timeRange: false,
    timeframe: false,
    symbol: false,
  },
  autoRefreshInterval: 0, // Manual by default
  connectionStatus: 'CONNECTED',
  connectionDetails: {
    latencyMs: 45,
    statusMessage: 'Upstox Ready',
    instrumentsIndexed: 20,
  },
  globalRefreshTrigger: Date.now(),
  isSymbolSearchOpen: false,
  targetChartForSearch: null,
  isLayoutModalOpen: false,
  isSettingsModalOpen: false,

  setActiveChartId: (id) => set({ activeChartId: id }),

  setLayoutMode: (mode) => {
    set((state) => {
      let desiredCount = 4;
      switch (mode) {
        case '1':
          desiredCount = 1;
          break;
        case '2h':
        case '2v':
          desiredCount = 2;
          break;
        case '4':
          desiredCount = 4;
          break;
        case '6':
          desiredCount = 6;
          break;
        case '8':
          desiredCount = 8;
          break;
      }

      let newCharts = [...state.charts];
      if (newCharts.length < desiredCount) {
        // Add more charts using watchlist or default items
        while (newCharts.length < desiredCount) {
          const nextIndex = newCharts.length;
          const inst =
            state.watchlist[nextIndex % state.watchlist.length] ||
            DEFAULT_INSTRUMENTS[nextIndex % DEFAULT_INSTRUMENTS.length];
          newCharts.push({
            id: `chart-${Date.now()}-${nextIndex}`,
            instrument: inst,
            timeframe: '5m',
            dateRangePreset: '5D',
            indicators: { ...DEFAULT_INDICATORS },
          });
        }
      } else if (newCharts.length > desiredCount) {
        newCharts = newCharts.slice(0, desiredCount);
      }

      const activeId = newCharts.some((c) => c.id === state.activeChartId)
        ? state.activeChartId
        : newCharts[0]?.id || '';

      const updated = { layoutMode: mode, charts: newCharts, activeChartId: activeId };
      persistActiveState(updated.charts, mode);
      return updated;
    });
  },

  updateChartInstrument: (chartId, instrument) => {
    set((state) => {
      const charts = state.charts.map((c) =>
        c.id === chartId
          ? {
              ...c,
              instrument,
              indicators: {
                ...c.indicators,
                strategy: true,
                ema8: true,
                ema16: true,
              },
            }
          : c
      );
      persistActiveState(charts, state.layoutMode);
      return { charts };
    });
  },

  updateChartTimeframe: (chartId, timeframe) => {
    set((state) => {
      let charts: ChartPanelState[];
      if (state.syncSettings.timeframe) {
        // Sync timeframe across all charts
        charts = state.charts.map((c) => ({ ...c, timeframe }));
      } else {
        charts = state.charts.map((c) =>
          c.id === chartId ? { ...c, timeframe } : c
        );
      }
      persistActiveState(charts, state.layoutMode);
      return { charts };
    });
  },

  updateChartDateRange: (chartId, preset, customFrom, customTo) => {
    set((state) => {
      const charts = state.charts.map((c) =>
        c.id === chartId
          ? {
              ...c,
              dateRangePreset: preset,
              customFrom,
              customTo,
            }
          : c
      );
      persistActiveState(charts, state.layoutMode);
      return { charts };
    });
  },

  toggleChartIndicator: (chartId, indicator) => {
    set((state) => {
      const charts = state.charts.map((c) => {
        if (c.id === chartId) {
          return {
            ...c,
            indicators: {
              ...c.indicators,
              [indicator]: !c.indicators[indicator],
            },
          };
        }
        return c;
      });
      persistActiveState(charts, state.layoutMode);
      return { charts };
    });
  },

  setChartExpanded: (chartId, isExpanded) => {
    set((state) => ({
      charts: state.charts.map((c) =>
        c.id === chartId ? { ...c, isExpanded } : { ...c, isExpanded: false }
      ),
    }));
  },

  removeChart: (chartId) => {
    set((state) => {
      if (state.charts.length <= 1) return state; // Keep at least 1 chart
      const charts = state.charts.filter((c) => c.id !== chartId);
      const activeChartId =
        state.activeChartId === chartId ? charts[0]?.id : state.activeChartId;
      persistActiveState(charts, state.layoutMode);
      return { charts, activeChartId };
    });
  },

  addChart: (instrument) => {
    set((state) => {
      if (state.charts.length >= 8) return state;
      const targetInst =
        instrument ||
        state.watchlist[state.charts.length % state.watchlist.length] ||
        DEFAULT_INSTRUMENTS[0];
      const newChart: ChartPanelState = {
        id: `chart-${Date.now()}`,
        instrument: targetInst,
        timeframe: '5m',
        dateRangePreset: '5D',
        indicators: { ...DEFAULT_INDICATORS },
      };
      const charts = [...state.charts, newChart];
      persistActiveState(charts, state.layoutMode);
      return { charts, activeChartId: newChart.id };
    });
  },

  setGlobalTimeframe: (timeframe) => {
    set((state) => {
      const charts = state.charts.map((c) => ({ ...c, timeframe }));
      persistActiveState(charts, state.layoutMode);
      return { charts };
    });
  },

  triggerGlobalRefresh: () => set({ globalRefreshTrigger: Date.now() }),

  addToWatchlist: (instrument) => {
    set((state) => {
      if (state.watchlist.some((w) => w.instrument_key === instrument.instrument_key)) {
        return state;
      }
      const watchlist = [...state.watchlist, instrument];
      if (typeof window !== 'undefined') {
        localStorage.setItem('upstox_watchlist', JSON.stringify(watchlist));
      }
      return { watchlist };
    });
  },

  removeFromWatchlist: (instrumentKey) => {
    set((state) => {
      const watchlist = state.watchlist.filter((w) => w.instrument_key !== instrumentKey);
      if (typeof window !== 'undefined') {
        localStorage.setItem('upstox_watchlist', JSON.stringify(watchlist));
      }
      return { watchlist };
    });
  },

  reorderWatchlist: (newList) => {
    set(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('upstox_watchlist', JSON.stringify(newList));
      }
      return { watchlist: newList };
    });
  },

  saveCurrentLayout: (name) => {
    const { charts, layoutMode, syncSettings, savedLayouts } = get();
    const newLayout: SavedLayout = {
      id: `layout-${Date.now()}`,
      name: name.trim() || `Layout ${savedLayouts.length + 1}`,
      layoutMode,
      charts: charts.map((c) => ({
        instrumentKey: c.instrument.instrument_key,
        tradingSymbol: c.instrument.trading_symbol,
        name: c.instrument.name,
        exchange: c.instrument.exchange,
        segment: c.instrument.segment,
        timeframe: c.timeframe,
        dateRangePreset: c.dateRangePreset,
        indicators: c.indicators,
      })),
      syncSettings,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedLayouts = [...savedLayouts, newLayout];
    if (typeof window !== 'undefined') {
      localStorage.setItem('upstox_saved_layouts', JSON.stringify(updatedLayouts));
    }
    set({ savedLayouts: updatedLayouts });
  },

  loadSavedLayout: (layoutId) => {
    const { savedLayouts } = get();
    const target = savedLayouts.find((l) => l.id === layoutId);
    if (!target) return;

    const charts: ChartPanelState[] = target.charts.map((c, i) => ({
      id: `chart-${Date.now()}-${i}`,
      instrument: {
        instrument_key: c.instrumentKey,
        trading_symbol: c.tradingSymbol,
        name: c.name,
        exchange: c.exchange,
        segment: c.segment,
      },
      timeframe: c.timeframe,
      dateRangePreset: c.dateRangePreset,
      indicators: c.indicators,
    }));

    set({
      layoutMode: target.layoutMode,
      charts,
      syncSettings: target.syncSettings,
      activeChartId: charts[0]?.id || '',
    });
    persistActiveState(charts, target.layoutMode);
  },

  deleteSavedLayout: (layoutId) => {
    set((state) => {
      const savedLayouts = state.savedLayouts.filter((l) => l.id !== layoutId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('upstox_saved_layouts', JSON.stringify(savedLayouts));
      }
      return { savedLayouts };
    });
  },

  updateSyncSettings: (settings) => {
    set((state) => {
      const syncSettings = { ...state.syncSettings, ...settings };
      if (typeof window !== 'undefined') {
        localStorage.setItem('upstox_sync_settings', JSON.stringify(syncSettings));
      }
      return { syncSettings };
    });
  },

  setAutoRefreshInterval: (interval) => {
    set(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('upstox_auto_refresh', String(interval));
      }
      return { autoRefreshInterval: interval };
    });
  },

  setConnectionStatus: (status, details) => {
    set((state) => ({
      connectionStatus: status,
      connectionDetails: {
        ...state.connectionDetails,
        ...(details || {}),
      },
    }));
  },

  openSymbolSearch: (targetChartId) => {
    set((state) => ({
      isSymbolSearchOpen: true,
      targetChartForSearch: targetChartId || state.activeChartId,
    }));
  },

  closeSymbolSearch: () => {
    set({ isSymbolSearchOpen: false, targetChartForSearch: null });
  },

  setLayoutModalOpen: (open) => set({ isLayoutModalOpen: open }),
  setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),

  loadPersistedState: () => {
    if (typeof window === 'undefined') return;

    try {
      const savedWatchlist = localStorage.getItem('upstox_watchlist');
      if (savedWatchlist) {
        set({ watchlist: JSON.parse(savedWatchlist) });
      }

      const savedLayouts = localStorage.getItem('upstox_saved_layouts');
      if (savedLayouts) {
        set({ savedLayouts: JSON.parse(savedLayouts) });
      }

      const sync = localStorage.getItem('upstox_sync_settings');
      if (sync) {
        set({ syncSettings: JSON.parse(sync) });
      }

      const refresh = localStorage.getItem('upstox_auto_refresh');
      if (refresh) {
        set({ autoRefreshInterval: parseInt(refresh, 10) as AutoRefreshInterval });
      }

      const active = localStorage.getItem('upstox_active_dashboard');
      if (active) {
        const parsed = JSON.parse(active);
        if (parsed.charts && parsed.charts.length > 0) {
          // Enforce strategy is enabled across all charts
          const chartsWithStrategy = parsed.charts.map((c: ChartPanelState) => ({
            ...c,
            indicators: {
              ...DEFAULT_INDICATORS,
              ...(c.indicators || {}),
              strategy: true,
              ema8: true,
              ema16: true,
            },
          }));
          set({
            charts: chartsWithStrategy,
            layoutMode: parsed.layoutMode || '4',
            activeChartId: chartsWithStrategy[0].id,
          });
        }
      }
    } catch (e) {
      console.warn('Failed loading persisted state from localStorage:', e);
    }
  },

  applyStrategyToAllCharts: (enable: boolean = true) => {
    set((state) => {
      const charts = state.charts.map((c) => ({
        ...c,
        indicators: {
          ...c.indicators,
          strategy: enable,
          ema8: enable ? true : c.indicators.ema8,
          ema16: enable ? true : c.indicators.ema16,
        },
      }));
      persistActiveState(charts, state.layoutMode);
      return { charts };
    });
  },
}));

function persistActiveState(charts: ChartPanelState[], layoutMode: LayoutGridMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      'upstox_active_dashboard',
      JSON.stringify({ charts, layoutMode })
    );
  } catch {
    // Ignore storage quota
  }
}

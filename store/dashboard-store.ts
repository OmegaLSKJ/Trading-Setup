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
  Exchange,
  InstrumentSegment,
} from '@/lib/types';

import { PastTrade } from '@/lib/strategy';
import { isValidTimezone, DEFAULT_TIMEZONE } from '@/lib/timezones';

const SCHEMA_VERSION = '1.0';

const DEFAULT_INDICATORS: IndicatorConfig = {
  ema8: true,
  ema16: true,
  ema20: false,
  ema50: false,
  ema200: false,
  rsi14: true,
  vwap: true,
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

const ALLOWED_LAYOUT_MODES = new Set<LayoutGridMode>(['1', '2h', '2v', '4', '6']);
const ALLOWED_TIMEFRAMES = new Set<Timeframe>(['1m', '3m', '5m', '10m', '15m', '30m', '1h', '1D']);
const ALLOWED_DATE_PRESETS = new Set<DateRangePreset>(['today', '5D', '1M', '3M', '6M', 'YTD', '1Y', 'custom']);
const ALLOWED_REFRESH_INTERVALS = new Set<AutoRefreshInterval>([0, 5000, 10000, 30000, 60000]);

export function getLayoutCapacity(mode: LayoutGridMode): number {
  switch (mode) {
    case '1':
      return 1;
    case '2h':
    case '2v':
      return 2;
    case '4':
      return 4;
    case '6':
    default:
      return 6;
  }
}

function isValidInstrument(item: unknown): item is Instrument {
  if (!item || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.instrument_key === 'string' &&
    rec.instrument_key.length > 0 &&
    typeof rec.trading_symbol === 'string' &&
    typeof rec.name === 'string'
  );
}

function isValidChartState(item: unknown): item is ChartPanelState {
  if (!item || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.id === 'string' &&
    isValidInstrument(rec.instrument) &&
    ALLOWED_TIMEFRAMES.has(rec.timeframe as Timeframe) &&
    ALLOWED_DATE_PRESETS.has(rec.dateRangePreset as DateRangePreset)
  );
}


function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota
  }
}

interface DashboardState {
  isHydrated: boolean;
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
  isTradesModalOpen: boolean;
  tradesModalSymbol: string | null;
  symbolTrades: Record<string, PastTrade[]>;
  targetTradeNavigation: { symbol: string; time: number; id: string } | null;
  selectedTimezone: string;

  // Actions
  setActiveChartId: (id: string) => void;
  setLayoutMode: (mode: LayoutGridMode) => void;
  openChartForInstrument: (instrument: Instrument) => void;
  updateChartInstrument: (chartId: string, instrument: Instrument) => void;
  updateChartTimeframe: (chartId: string, timeframe: Timeframe) => void;
  updateChartDateRange: (
    chartId: string,
    preset: DateRangePreset,
    customFrom?: string,
    customTo?: string
  ) => void;
  toggleChartIndicator: (chartId: string, indicator: keyof IndicatorConfig) => void;
  setChartExpanded: (chartId: string, isExpanded: boolean) => void;
  removeChart: (chartId: string) => void;
  addChart: (instrument?: Instrument) => void;
  fillEmptyGridSlots: () => void;
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
  setTradesModalOpen: (open: boolean, symbol?: string | null) => void;
  recordTradesForSymbol: (symbol: string, trades: PastTrade[]) => void;
  navigateToTrade: (symbol: string, time: number, id: string) => void;
  clearTradeNavigation: () => void;

  setTimezone: (timezone: string) => void;
  loadPersistedState: () => void;
  applyStrategyToAllCharts: (enable?: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  isHydrated: false,
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
  autoRefreshInterval: 0,
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
  isTradesModalOpen: false,
  tradesModalSymbol: null,
  symbolTrades: {},
  targetTradeNavigation: null,
  selectedTimezone: DEFAULT_TIMEZONE,

  // Enforce one open modal at any given time
  setTradesModalOpen: (open, symbol = null) =>
    set({
      isTradesModalOpen: open,
      tradesModalSymbol: symbol,
      isSymbolSearchOpen: false,
      isLayoutModalOpen: false,
      isSettingsModalOpen: false,
    }),

  openSymbolSearch: (targetChartId) =>
    set((state) => ({
      isSymbolSearchOpen: true,
      targetChartForSearch: targetChartId || state.activeChartId,
      isLayoutModalOpen: false,
      isSettingsModalOpen: false,
      isTradesModalOpen: false,
    })),

  closeSymbolSearch: () => set({ isSymbolSearchOpen: false, targetChartForSearch: null }),

  setLayoutModalOpen: (open) =>
    set({
      isLayoutModalOpen: open,
      isSymbolSearchOpen: false,
      isSettingsModalOpen: false,
      isTradesModalOpen: false,
    }),

  setSettingsModalOpen: (open) =>
    set({
      isSettingsModalOpen: open,
      isSymbolSearchOpen: false,
      isLayoutModalOpen: false,
      isTradesModalOpen: false,
    }),

  recordTradesForSymbol: (symbol, trades) =>
    set((state) => {
      const existing = state.symbolTrades[symbol];
      if (existing && existing.length === trades.length) {
        const lastExisting = existing[existing.length - 1];
        const lastNew = trades[trades.length - 1];
        if (
          lastExisting?.id === lastNew?.id &&
          lastExisting?.status === lastNew?.status &&
          lastExisting?.exitPrice === lastNew?.exitPrice &&
          lastExisting?.pnlAmount === lastNew?.pnlAmount
        ) {
          return state;
        }
      }
      return {
        symbolTrades: {
          ...state.symbolTrades,
          [symbol]: trades,
        },
      };
    }),

  navigateToTrade: (symbol, time, id) => {
    const { charts, watchlist } = get();
    const existingChart = charts.find(
      (c) => c.instrument.trading_symbol.toUpperCase() === symbol.toUpperCase()
    );

    if (existingChart) {
      set({
        activeChartId: existingChart.id,
        isTradesModalOpen: false,
        targetTradeNavigation: { symbol, time, id },
      });
    } else {
      const activeId = get().activeChartId || charts[0]?.id;
      const targetInstrument =
        watchlist.find(
          (w) => w.trading_symbol.toUpperCase() === symbol.toUpperCase()
        ) || {
          instrument_key: `NSE_EQ|${symbol}`,
          trading_symbol: symbol,
          name: symbol,
          exchange: 'NSE',
          segment: 'NSE_EQ',
        };

      if (activeId) {
        get().updateChartInstrument(activeId, targetInstrument);
      }

      set({
        activeChartId: activeId,
        isTradesModalOpen: false,
        targetTradeNavigation: { symbol, time, id },
      });
    }
  },

  clearTradeNavigation: () => set({ targetTradeNavigation: null }),

  setTimezone: (timezone) => {
    const valid = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
    const migrated = valid === 'Europe/Frankfurt' ? 'Europe/Berlin' : valid;
    set({ selectedTimezone: migrated });
    safeLocalStorageSet('upstox_timezone', migrated);
  },

  setActiveChartId: (id) => set({ activeChartId: id }),

  setLayoutMode: (mode) => {
    if (!ALLOWED_LAYOUT_MODES.has(mode)) return;
    const { charts, watchlist } = get();
    const capacity = getLayoutCapacity(mode);
    const nextCharts = [...charts];

    // If switching to a grid mode with higher capacity than current charts,
    // auto-populate remaining slots with unopen instruments from watchlist or defaults
    if (nextCharts.length < capacity) {
      const openKeys = new Set(nextCharts.map((c) => c.instrument.instrument_key));
      const openSymbols = new Set(nextCharts.map((c) => c.instrument.trading_symbol.toUpperCase()));

      const availableFromWatchlist = watchlist.filter(
        (w) => !openKeys.has(w.instrument_key) && !openSymbols.has(w.trading_symbol.toUpperCase())
      );
      const availableDefaults = DEFAULT_INSTRUMENTS.filter(
        (d) => !openKeys.has(d.instrument_key) && !openSymbols.has(d.trading_symbol.toUpperCase())
      );

      const pool = [...availableFromWatchlist, ...availableDefaults];
      let poolIdx = 0;

      while (nextCharts.length < capacity && nextCharts.length < 6 && poolIdx < pool.length) {
        const inst = pool[poolIdx++];
        openKeys.add(inst.instrument_key);
        openSymbols.add(inst.trading_symbol.toUpperCase());
        nextCharts.push({
          id: `chart-${Date.now()}-${nextCharts.length + 1}`,
          instrument: inst,
          timeframe: nextCharts[0]?.timeframe || '5m',
          dateRangePreset: nextCharts[0]?.dateRangePreset || '5D',
          indicators: { ...DEFAULT_INDICATORS },
          isExpanded: false,
        });
      }
    }

    set({ layoutMode: mode, charts: nextCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: nextCharts, layoutMode: mode })
    );
  },

  openChartForInstrument: (instrument) => {
    const { charts, activeChartId, layoutMode } = get();

    // Match instruments by instrument_key or trading_symbol
    const existingIdx = charts.findIndex(
      (c) =>
        c.instrument.instrument_key === instrument.instrument_key ||
        c.instrument.trading_symbol.toUpperCase() === instrument.trading_symbol.toUpperCase()
    );

    if (existingIdx !== -1) {
      const targetChart = charts[existingIdx];
      set({ activeChartId: targetChart.id });
      return;
    }

    const capacity = getLayoutCapacity(layoutMode);

    // If current grid layout has unfilled capacity and charts < 6,
    // open the instrument in a new grid slot instead of overwriting active chart
    if (charts.length < capacity && charts.length < 6) {
      const newChart: ChartPanelState = {
        id: `chart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        instrument,
        timeframe: charts[0]?.timeframe || '5m',
        dateRangePreset: charts[0]?.dateRangePreset || '5D',
        indicators: { ...DEFAULT_INDICATORS },
        isExpanded: false,
      };

      const updatedCharts = [...charts, newChart];
      set({ charts: updatedCharts, activeChartId: newChart.id });
      safeLocalStorageSet(
        'upstox_active_dashboard',
        JSON.stringify({ charts: updatedCharts, layoutMode })
      );
      return;
    }

    // When capacity is filled, replace the active chart's instrument
    const targetId = activeChartId || charts[0]?.id;
    const updatedCharts = charts.map((c) =>
      c.id === targetId
        ? {
            ...c,
            instrument,
            indicators: { ...c.indicators }, // Preserve user indicators without forcing
          }
        : c
    );

    set({ charts: updatedCharts, activeChartId: targetId });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: updatedCharts, layoutMode })
    );
  },

  updateChartInstrument: (chartId, instrument) => {
    const { charts, layoutMode } = get();
    const updatedCharts = charts.map((c) =>
      c.id === chartId
        ? {
            ...c,
            instrument,
            indicators: { ...c.indicators }, // Preserve user indicators without forcing
          }
        : c
    );
    set({ charts: updatedCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: updatedCharts, layoutMode })
    );
  },

  updateChartTimeframe: (chartId, timeframe) => {
    if (!ALLOWED_TIMEFRAMES.has(timeframe)) return;
    const { charts, syncSettings, layoutMode } = get();
    let updatedCharts: ChartPanelState[];
    if (syncSettings.timeframe) {
      updatedCharts = charts.map((c) => ({ ...c, timeframe }));
    } else {
      updatedCharts = charts.map((c) => (c.id === chartId ? { ...c, timeframe } : c));
    }
    set({ charts: updatedCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: updatedCharts, layoutMode })
    );
  },

  updateChartDateRange: (chartId, preset, customFrom, customTo) => {
    if (!ALLOWED_DATE_PRESETS.has(preset)) return;
    const { charts, layoutMode } = get();
    const updatedCharts = charts.map((c) =>
      c.id === chartId
        ? {
            ...c,
            dateRangePreset: preset,
            customFrom,
            customTo,
          }
        : c
    );
    set({ charts: updatedCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: updatedCharts, layoutMode })
    );
  },

  toggleChartIndicator: (chartId, indicator) => {
    const { charts, layoutMode } = get();
    const updatedCharts = charts.map((c) => {
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
    set({ charts: updatedCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: updatedCharts, layoutMode })
    );
  },

  setChartExpanded: (chartId, isExpanded) => {
    set((state) => ({
      charts: state.charts.map((c) =>
        c.id === chartId ? { ...c, isExpanded } : { ...c, isExpanded: false }
      ),
    }));
  },

  removeChart: (chartId) => {
    const { charts, activeChartId, layoutMode } = get();
    if (charts.length <= 1) return;
    const nextCharts = charts.filter((c) => c.id !== chartId);
    const nextActiveId = activeChartId === chartId ? nextCharts[0]?.id : activeChartId;
    set({ charts: nextCharts, activeChartId: nextActiveId });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: nextCharts, layoutMode })
    );
  },

  addChart: (instrument) => {
    const { charts, layoutMode, watchlist } = get();
    if (charts.length >= 6) return; // Strict max 6 chart allowance

    if (instrument) {
      const existing = charts.find(
        (c) =>
          c.instrument.instrument_key === instrument.instrument_key ||
          c.instrument.trading_symbol.toUpperCase() === instrument.trading_symbol.toUpperCase()
      );
      if (existing) {
        set({ activeChartId: existing.id });
        return;
      }
    }

    let targetInst = instrument;
    if (!targetInst) {
      const openKeys = new Set(charts.map((c) => c.instrument.instrument_key));
      const openSymbols = new Set(charts.map((c) => c.instrument.trading_symbol.toUpperCase()));
      targetInst =
        watchlist.find(
          (w) => !openKeys.has(w.instrument_key) && !openSymbols.has(w.trading_symbol.toUpperCase())
        ) ||
        DEFAULT_INSTRUMENTS.find(
          (d) => !openKeys.has(d.instrument_key) && !openSymbols.has(d.trading_symbol.toUpperCase())
        ) ||
        watchlist[charts.length % watchlist.length] ||
        DEFAULT_INSTRUMENTS[0];
    }

    const newChart: ChartPanelState = {
      id: `chart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      instrument: targetInst,
      timeframe: charts[0]?.timeframe || '5m',
      dateRangePreset: charts[0]?.dateRangePreset || '5D',
      indicators: { ...DEFAULT_INDICATORS },
      isExpanded: false,
    };

    const nextCharts = [...charts, newChart];
    const newCount = nextCharts.length;

    // Keep addChart consistent with grid mode capacity
    let nextLayoutMode = layoutMode;
    if (layoutMode === '1' && newCount >= 2) nextLayoutMode = '2h';
    else if ((layoutMode === '2h' || layoutMode === '2v') && newCount >= 3) nextLayoutMode = '4';
    else if (layoutMode === '4' && newCount >= 5) nextLayoutMode = '6';

    set({
      charts: nextCharts,
      layoutMode: nextLayoutMode,
      activeChartId: newChart.id,
    });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: nextCharts, layoutMode: nextLayoutMode })
    );
  },

  fillEmptyGridSlots: () => {
    const { charts, layoutMode, watchlist } = get();
    const capacity = getLayoutCapacity(layoutMode);
    if (charts.length >= capacity) return;

    const openKeys = new Set(charts.map((c) => c.instrument.instrument_key));
    const openSymbols = new Set(charts.map((c) => c.instrument.trading_symbol.toUpperCase()));

    const availableFromWatchlist = watchlist.filter(
      (w) => !openKeys.has(w.instrument_key) && !openSymbols.has(w.trading_symbol.toUpperCase())
    );
    const availableDefaults = DEFAULT_INSTRUMENTS.filter(
      (d) => !openKeys.has(d.instrument_key) && !openSymbols.has(d.trading_symbol.toUpperCase())
    );

    const pool = [...availableFromWatchlist, ...availableDefaults];
    let poolIdx = 0;
    const nextCharts = [...charts];

    while (nextCharts.length < capacity && nextCharts.length < 6 && poolIdx < pool.length) {
      const inst = pool[poolIdx++];
      openKeys.add(inst.instrument_key);
      openSymbols.add(inst.trading_symbol.toUpperCase());
      nextCharts.push({
        id: `chart-${Date.now()}-${nextCharts.length + 1}`,
        instrument: inst,
        timeframe: nextCharts[0]?.timeframe || '5m',
        dateRangePreset: nextCharts[0]?.dateRangePreset || '5D',
        indicators: { ...DEFAULT_INDICATORS },
        isExpanded: false,
      });
    }

    set({ charts: nextCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: nextCharts, layoutMode })
    );
  },

  setGlobalTimeframe: (timeframe) => {
    if (!ALLOWED_TIMEFRAMES.has(timeframe)) return;
    const { charts, layoutMode } = get();
    const nextCharts = charts.map((c) => ({ ...c, timeframe }));
    set({ charts: nextCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: nextCharts, layoutMode })
    );
  },

  triggerGlobalRefresh: () => set({ globalRefreshTrigger: Date.now() }),

  addToWatchlist: (instrument) => {
    const current = get().watchlist;
    if (current.some((w) => w.instrument_key === instrument.instrument_key)) return;
    const next = [...current, instrument];
    set({ watchlist: next });
    safeLocalStorageSet('upstox_watchlist', JSON.stringify(next));
  },

  removeFromWatchlist: (instrumentKey) => {
    const next = get().watchlist.filter((w) => w.instrument_key !== instrumentKey);
    set({ watchlist: next });
    safeLocalStorageSet('upstox_watchlist', JSON.stringify(next));
  },

  reorderWatchlist: (newList) => {
    set({ watchlist: newList });
    safeLocalStorageSet('upstox_watchlist', JSON.stringify(newList));
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
        customFrom: c.customFrom,
        customTo: c.customTo,
        indicators: c.indicators,
      })),
      syncSettings,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedLayouts = [...savedLayouts, newLayout];
    set({ savedLayouts: updatedLayouts });
    safeLocalStorageSet('upstox_saved_layouts', JSON.stringify(updatedLayouts));
  },

  loadSavedLayout: (layoutId) => {
    const { savedLayouts } = get();
    const target = savedLayouts.find((l) => l.id === layoutId);
    if (!target) return;

    const restoredCharts: ChartPanelState[] = target.charts.map((c, i) => ({
      id: `chart-${Date.now()}-${i}`,
      instrument: {
        instrument_key: c.instrumentKey,
        trading_symbol: c.tradingSymbol,
        name: c.name,
        exchange: c.exchange as Exchange,
        segment: c.segment as InstrumentSegment,
      },

      timeframe: c.timeframe,
      dateRangePreset: c.dateRangePreset,
      customFrom: c.customFrom,
      customTo: c.customTo,
      indicators: c.indicators,
    }));

    set({
      layoutMode: target.layoutMode,
      charts: restoredCharts,
      syncSettings: target.syncSettings,
      activeChartId: restoredCharts[0]?.id || '',
    });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: restoredCharts, layoutMode: target.layoutMode })
    );
    safeLocalStorageSet('upstox_sync_settings', JSON.stringify(target.syncSettings));
  },

  deleteSavedLayout: (layoutId) => {
    const savedLayouts = get().savedLayouts.filter((l) => l.id !== layoutId);
    set({ savedLayouts });
    safeLocalStorageSet('upstox_saved_layouts', JSON.stringify(savedLayouts));
  },

  updateSyncSettings: (settings) => {
    const next = { ...get().syncSettings, ...settings };
    set({ syncSettings: next });
    safeLocalStorageSet('upstox_sync_settings', JSON.stringify(next));
  },

  setAutoRefreshInterval: (interval) => {
    if (!ALLOWED_REFRESH_INTERVALS.has(interval)) return;
    set({ autoRefreshInterval: interval });
    safeLocalStorageSet('upstox_auto_refresh', String(interval));
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

  loadPersistedState: () => {
    if (typeof window === 'undefined') return;

    // 1. Schema version
    try {
      const storedVersion = localStorage.getItem('upstox_schema_version');
      if (!storedVersion) {
        safeLocalStorageSet('upstox_schema_version', SCHEMA_VERSION);
      }
    } catch {
      // ignore
    }

    // 2. Watchlist
    try {
      const savedWatchlist = localStorage.getItem('upstox_watchlist');
      if (savedWatchlist) {
        const parsed = JSON.parse(savedWatchlist);
        if (Array.isArray(parsed)) {
          const validated = parsed.filter(isValidInstrument);
          if (validated.length > 0) {
            set({ watchlist: validated });
          }
        }
      }
    } catch (e) {
      console.warn('Watchlist hydration error:', e);
    }

    // 3. Saved Layouts
    try {
      const savedLayouts = localStorage.getItem('upstox_saved_layouts');
      if (savedLayouts) {
        const parsed = JSON.parse(savedLayouts);
        if (Array.isArray(parsed)) {
          set({ savedLayouts: parsed });
        }
      }
    } catch (e) {
      console.warn('Saved layouts hydration error:', e);
    }

    // 4. Sync Settings
    try {
      const sync = localStorage.getItem('upstox_sync_settings');
      if (sync) {
        const parsed = JSON.parse(sync);
        if (parsed && typeof parsed === 'object') {
          set({
            syncSettings: {
              crosshair: Boolean(parsed.crosshair),
              timeRange: Boolean(parsed.timeRange),
              timeframe: Boolean(parsed.timeframe),
              symbol: Boolean(parsed.symbol),
            },
          });
        }
      }
    } catch (e) {
      console.warn('Sync settings hydration error:', e);
    }

    // 5. Auto Refresh Interval
    try {
      const refresh = localStorage.getItem('upstox_auto_refresh');
      if (refresh) {
        const parsed = parseInt(refresh, 10) as AutoRefreshInterval;
        if (ALLOWED_REFRESH_INTERVALS.has(parsed)) {
          set({ autoRefreshInterval: parsed });
        }
      }
    } catch (e) {
      console.warn('Auto refresh hydration error:', e);
    }

    // 6. Timezone (Migrating Europe/Frankfurt to Europe/Berlin)
    try {
      const savedTz = localStorage.getItem('upstox_timezone');
      if (savedTz) {
        const migrated = savedTz === 'Europe/Frankfurt' ? 'Europe/Berlin' : savedTz;
        if (isValidTimezone(migrated)) {
          set({ selectedTimezone: migrated });
          if (savedTz === 'Europe/Frankfurt') {
            safeLocalStorageSet('upstox_timezone', 'Europe/Berlin');
          }
        }
      }
    } catch (e) {
      console.warn('Timezone hydration error:', e);
    }

    // 7. Active Dashboard Charts
    try {
      const active = localStorage.getItem('upstox_active_dashboard');
      if (active) {
        const parsed = JSON.parse(active);
        if (parsed && Array.isArray(parsed.charts) && parsed.charts.length > 0) {
          const validatedCharts = parsed.charts.filter(isValidChartState);
          if (validatedCharts.length > 0) {
            // Restore actual indicators without forcing artificial values
            const restoredCharts = validatedCharts.map((c: ChartPanelState) => ({
              ...c,
              indicators: {
                ...DEFAULT_INDICATORS,
                ...(c.indicators || {}),
              },
            }));

            const validMode: LayoutGridMode = ALLOWED_LAYOUT_MODES.has(parsed.layoutMode)
              ? parsed.layoutMode
              : '4';

            const capacity = getLayoutCapacity(validMode);
            const currentWatchlist = get().watchlist;
            const finalCharts = [...restoredCharts];

            if (finalCharts.length < capacity) {
              const openKeys = new Set(finalCharts.map((c) => c.instrument.instrument_key));
              const openSymbols = new Set(
                finalCharts.map((c) => c.instrument.trading_symbol.toUpperCase())
              );
              const pool = [
                ...currentWatchlist.filter(
                  (w) =>
                    !openKeys.has(w.instrument_key) &&
                    !openSymbols.has(w.trading_symbol.toUpperCase())
                ),
                ...DEFAULT_INSTRUMENTS.filter(
                  (d) =>
                    !openKeys.has(d.instrument_key) &&
                    !openSymbols.has(d.trading_symbol.toUpperCase())
                ),
              ];
              let poolIdx = 0;
              while (
                finalCharts.length < capacity &&
                finalCharts.length < 6 &&
                poolIdx < pool.length
              ) {
                const inst = pool[poolIdx++];
                openKeys.add(inst.instrument_key);
                openSymbols.add(inst.trading_symbol.toUpperCase());
                finalCharts.push({
                  id: `chart-${Date.now()}-${finalCharts.length + 1}`,
                  instrument: inst,
                  timeframe: finalCharts[0]?.timeframe || '5m',
                  dateRangePreset: finalCharts[0]?.dateRangePreset || '5D',
                  indicators: { ...DEFAULT_INDICATORS },
                  isExpanded: false,
                });
              }
            }

            set({
              charts: finalCharts,
              layoutMode: validMode,
              activeChartId: finalCharts[0].id,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Active dashboard hydration error:', e);
    }

    // Mark hydration complete to gate dependent fetches
    set({ isHydrated: true });
  },

  applyStrategyToAllCharts: (enable?: boolean) => {
    const { charts, layoutMode } = get();
    const targetState =
      enable !== undefined ? enable : !charts.some((c) => c.indicators.strategy);

    const nextCharts = charts.map((c) => ({
      ...c,
      indicators: {
        ...c.indicators,
        strategy: targetState,
      },
    }));

    set({ charts: nextCharts });
    safeLocalStorageSet(
      'upstox_active_dashboard',
      JSON.stringify({ charts: nextCharts, layoutMode })
    );
  },
}));

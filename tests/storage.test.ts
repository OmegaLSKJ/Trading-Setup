import { describe, it, expect, beforeEach } from 'vitest';
import { useDashboardStore, DEFAULT_INDICATORS } from '../store/dashboard-store';
import { Instrument } from '../lib/types';

describe('Dashboard Storage & loadPersistedState', () => {
  const storageMap = new Map<string, string>();

  const localStorageMock = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  beforeEach(() => {
    storageMap.clear();
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'window', {
      value: { localStorage: localStorageMock },
      writable: true,
      configurable: true,
    });
  });

  it('restores valid empty watchlist round-trip without overwriting with defaults', () => {
    storageMap.set('upstox_schema_version', '2');
    storageMap.set('upstox_watchlist', '[]');

    useDashboardStore.getState().loadPersistedState();
    expect(useDashboardStore.getState().watchlist).toEqual([]);
  });

  it('discards invalid saved layouts during hydration', () => {
    storageMap.set('upstox_schema_version', '2');

    const invalidLayouts = [
      {
        id: '', // Empty ID
        name: 'Invalid ID',
        layoutMode: '4',
        charts: [],
      },
      {
        id: 'valid-id-1',
        name: 'Missing Charts Array',
        layoutMode: '2h',
        // charts is missing
      },
      {
        id: 'valid-id-2',
        name: 'Invalid Panel Config',
        layoutMode: '1',
        charts: [
          {
            instrumentKey: '', // Empty key
            tradingSymbol: 'RELIANCE',
            timeframe: '5m',
            dateRangePreset: 'today',
          },
        ],
      },
      {
        id: 'valid-id-3',
        name: 'Fully Valid Layout',
        layoutMode: '1',
        charts: [
          {
            instrumentKey: 'NSE_EQ|INE002A01018',
            tradingSymbol: 'RELIANCE',
            timeframe: '5m',
            dateRangePreset: '5D',
            indicators: {},
          },
        ],
      },
    ];

    storageMap.set('upstox_saved_layouts', JSON.stringify(invalidLayouts));

    useDashboardStore.getState().loadPersistedState();
    const saved = useDashboardStore.getState().savedLayouts;

    expect(saved.length).toBe(1);
    expect(saved[0].id).toBe('valid-id-3');
    expect(saved[0].name).toBe('Fully Valid Layout');
  });

  it('rejects mismatched schema versions and resets state', () => {
    storageMap.set('upstox_schema_version', '1'); // Outdated schema version
    storageMap.set('upstox_watchlist', JSON.stringify([{ instrument_key: 'OLD_KEY', trading_symbol: 'OLD' }]));

    useDashboardStore.getState().loadPersistedState();

    // Mismatched version causes immediate return and schema reset to 2
    expect(storageMap.get('upstox_schema_version')).toBe('2');
    expect(useDashboardStore.getState().isHydrated).toBe(true);
  });

  it('auto-fills unique instruments up to 6 grid slots without duplicates', () => {
    const store = useDashboardStore.getState();

    // Setup 1 chart initially
    const inst1: Instrument = {
      instrument_key: 'NSE_INDEX|Nifty 50',
      trading_symbol: 'NIFTY 50',
      name: 'NIFTY 50',
      exchange: 'NSE',
      segment: 'NSE_INDEX',
      instrument_type: 'INDEX',
    };

    useDashboardStore.setState({
      charts: [
        {
          id: 'chart-1',
          instrument: inst1,
          timeframe: '5m',
          dateRangePreset: '5D',
          indicators: { ...DEFAULT_INDICATORS },
          isExpanded: false,
        },
      ],
      layoutMode: '1',
    });

    // Switch layout mode to 6
    store.setLayoutMode('6');

    const charts = useDashboardStore.getState().charts;
    expect(charts.length).toBe(6);

    // Verify all 6 chart panel instruments have unique instrument_keys and trading symbols
    const keys = charts.map((c) => c.instrument.instrument_key);
    const symbols = charts.map((c) => c.instrument.trading_symbol.toUpperCase());

    const uniqueKeys = new Set(keys);
    const uniqueSymbols = new Set(symbols);

    expect(uniqueKeys.size).toBe(6);
    expect(uniqueSymbols.size).toBe(6);
  });

  it('transfers or clears expansion when activating chart B after expanding chart A', () => {
    const store = useDashboardStore.getState();

    const instA: Instrument = {
      instrument_key: 'NSE_EQ|INE002A01018',
      trading_symbol: 'RELIANCE',
      name: 'Reliance',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      instrument_type: 'EQ',
    };
    const instB: Instrument = {
      instrument_key: 'NSE_EQ|INE467B01029',
      trading_symbol: 'TCS',
      name: 'TCS',
      exchange: 'NSE',
      segment: 'NSE_EQ',
      instrument_type: 'EQ',
    };

    useDashboardStore.setState({
      charts: [
        {
          id: 'chart-a',
          instrument: instA,
          timeframe: '5m',
          dateRangePreset: '5D',
          indicators: { ...DEFAULT_INDICATORS },
          isExpanded: false,
        },
        {
          id: 'chart-b',
          instrument: instB,
          timeframe: '5m',
          dateRangePreset: '5D',
          indicators: { ...DEFAULT_INDICATORS },
          isExpanded: false,
        },
      ],
      activeChartId: 'chart-a',
      layoutMode: '2h',
    });

    // Expand chart A
    store.setChartExpanded('chart-a', true);
    expect(useDashboardStore.getState().charts.find((c) => c.id === 'chart-a')?.isExpanded).toBe(true);

    // Activate chart B via openChartForInstrument
    store.openChartForInstrument(instB);

    const updatedCharts = useDashboardStore.getState().charts;
    const chartA = updatedCharts.find((c) => c.id === 'chart-a');
    const chartB = updatedCharts.find((c) => c.id === 'chart-b');

    // Chart A must no longer be expanded
    expect(chartA?.isExpanded).toBe(false);
    // Active chart must be chart B
    expect(useDashboardStore.getState().activeChartId).toBe('chart-b');
    // Chart B inherits the expanded view
    expect(chartB?.isExpanded).toBe(true);
  });
});

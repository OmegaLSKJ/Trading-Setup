export type Exchange = 'NSE' | 'BSE' | 'NFO' | 'MCX';

export type InstrumentSegment =
  | 'NSE_EQ'
  | 'NSE_INDEX'
  | 'NSE_FO'
  | 'BSE_EQ'
  | 'BSE_INDEX'
  | 'MCX_FO'
  | string;

export interface Instrument {
  instrument_key: string;
  trading_symbol: string;
  name: string;
  exchange: Exchange | string;
  segment: InstrumentSegment;
  instrument_type?: string;
  lot_size?: number;
  tick_size?: number;
}

export type Timeframe =
  | '1m'
  | '3m'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '1h'
  | '1D';

export type DateRangePreset =
  | 'today'
  | '5D'
  | '1M'
  | '3M'
  | '6M'
  | 'YTD'
  | '1Y'
  | 'custom';

export interface Candle {
  time: number; // Unix timestamp in seconds (UTC/IST aligned for Lightweight Charts)
  timeString: string; // ISO / IST formatted readable string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
}

export interface IndicatorConfig {
  ema8: boolean;
  ema16: boolean;
  ema20: boolean;
  ema50: boolean;
  ema200: boolean;
  rsi14: boolean;
  vwap: boolean;
  volume: boolean;
}

export interface ChartPanelState {
  id: string;
  instrument: Instrument;
  timeframe: Timeframe;
  dateRangePreset: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  indicators: IndicatorConfig;
  isExpanded?: boolean;
}

export type LayoutGridMode = '1' | '2h' | '2v' | '4' | '6' | '8';

export interface SyncSettings {
  crosshair: boolean;
  timeRange: boolean;
  timeframe: boolean;
  symbol: boolean;
}

export interface SavedLayout {
  id: string;
  name: string;
  layoutMode: LayoutGridMode;
  charts: {
    instrumentKey: string;
    tradingSymbol: string;
    name: string;
    exchange: string;
    segment: string;
    timeframe: Timeframe;
    dateRangePreset: DateRangePreset;
    indicators: IndicatorConfig;
  }[];
  syncSettings: SyncSettings;
  createdAt: number;
  updatedAt: number;
}

export type AutoRefreshInterval = 0 | 10000 | 30000 | 60000; // 0 = OFF

export interface MarketQuote {
  instrument_key: string;
  last_price: number;
  change: number;
  change_percent: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  timestamp?: string;
}

export type ConnectionStatus =
  | 'CONNECTED'
  | 'FETCHING'
  | 'RATE_LIMITED'
  | 'TOKEN_ERROR'
  | 'OFFLINE';

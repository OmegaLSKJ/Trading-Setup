import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { Instrument } from './types';

// Pre-seeded popular instruments so dashboard loads instantly without waiting for master download
const POPULAR_INSTRUMENTS: Instrument[] = [
  {
    instrument_key: 'NSE_INDEX|Nifty 50',
    trading_symbol: 'NIFTY 50',
    name: 'NIFTY 50 INDEX',
    exchange: 'NSE',
    segment: 'NSE_INDEX',
    instrument_type: 'INDEX',
  },
  {
    instrument_key: 'NSE_INDEX|Nifty Bank',
    trading_symbol: 'NIFTY BANK',
    name: 'NIFTY BANK INDEX',
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
    instrument_key: 'NSE_EQ|INE467B01029',
    trading_symbol: 'TCS',
    name: 'TATA CONSULTANCY SERVICES LTD',
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
    instrument_key: 'NSE_EQ|INE009A01021',
    trading_symbol: 'INFY',
    name: 'INFOSYS LIMITED',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE090A01021',
    trading_symbol: 'ICICIBANK',
    name: 'ICICI BANK LTD.',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE062A01020',
    trading_symbol: 'SBIN',
    name: 'STATE BANK OF INDIA',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE397D01024',
    trading_symbol: 'BHARTIARTL',
    name: 'BHARTI AIRTEL LIMITED',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE154A01025',
    trading_symbol: 'ITC',
    name: 'ITC LTD',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE237A01028',
    trading_symbol: 'KOTAKBANK',
    name: 'KOTAK MAHINDRA BANK LTD',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE018A01030',
    trading_symbol: 'LT',
    name: 'LARSEN & TOUBRO LTD.',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE155A01022',
    trading_symbol: 'TATAMOTORS',
    name: 'TATA MOTORS LIMITED',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE296A01024',
    trading_symbol: 'BAJFINANCE',
    name: 'BAJAJ FINANCE LIMITED',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE585B01010',
    trading_symbol: 'MARUTI',
    name: 'MARUTI SUZUKI INDIA LTD.',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE075A01017',
    trading_symbol: 'WIPRO',
    name: 'WIPRO LTD',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE860A01027',
    trading_symbol: 'HCLTECH',
    name: 'HCL TECHNOLOGIES LTD',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE044A01036',
    trading_symbol: 'SUNPHARMA',
    name: 'SUN PHARMACEUTICAL IND L',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE423A01024',
    trading_symbol: 'ADANIENT',
    name: 'ADANI ENTERPRISES LIMITED',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'NSE_EQ|INE238A01034',
    trading_symbol: 'AXISBANK',
    name: 'AXIS BANK LTD',
    exchange: 'NSE',
    segment: 'NSE_EQ',
    instrument_type: 'EQ',
  },
  // US Equities & Tech Giants
  {
    instrument_key: 'US|AAPL',
    trading_symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|TSLA',
    trading_symbol: 'TSLA',
    name: 'Tesla, Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|NVDA',
    trading_symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|MSFT',
    trading_symbol: 'MSFT',
    name: 'Microsoft Corporation',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|AMZN',
    trading_symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|GOOGL',
    trading_symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|META',
    trading_symbol: 'META',
    name: 'Meta Platforms, Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|NFLX',
    trading_symbol: 'NFLX',
    name: 'Netflix, Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|AMD',
    trading_symbol: 'AMD',
    name: 'Advanced Micro Devices, Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|SPY',
    trading_symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    exchange: 'NYSE',
    segment: 'US_ETF',
    instrument_type: 'ETF',
  },
  {
    instrument_key: 'US|QQQ',
    trading_symbol: 'QQQ',
    name: 'Invesco QQQ Trust (Nasdaq 100)',
    exchange: 'NASDAQ',
    segment: 'US_ETF',
    instrument_type: 'ETF',
  },
  {
    instrument_key: 'US|PLTR',
    trading_symbol: 'PLTR',
    name: 'Palantir Technologies Inc.',
    exchange: 'NYSE',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
  {
    instrument_key: 'US|COIN',
    trading_symbol: 'COIN',
    name: 'Coinbase Global, Inc.',
    exchange: 'NASDAQ',
    segment: 'US_EQ',
    instrument_type: 'EQ',
  },
];

class InstrumentMasterService {
  private instruments: Instrument[] = [...POPULAR_INSTRUMENTS];
  private keyMap: Map<string, Instrument> = new Map();
  private symbolMap: Map<string, Instrument[]> = new Map();
  private isLoaded = false;
  private isLoading = false;
  private cacheFilePath: string;

  constructor() {
    this.cacheFilePath = path.join(process.cwd(), '.next', 'cache', 'upstox_instruments.json');
    this.indexInstruments(POPULAR_INSTRUMENTS);
  }

  private indexInstruments(list: Instrument[]) {
    for (const item of list) {
      if (!item.instrument_key) continue;
      this.keyMap.set(item.instrument_key, item);

      const sym = (item.trading_symbol || '').toUpperCase();
      const existing = this.symbolMap.get(sym) || [];
      if (!existing.some((e) => e.instrument_key === item.instrument_key)) {
        existing.push(item);
        this.symbolMap.set(sym, existing);
      }
    }
  }

  public async initMaster(forceRefresh = false) {
    if (this.isLoaded && !forceRefresh) return;
    if (this.isLoading) return;

    this.isLoading = true;

    try {
      // 1. Check local cache file
      if (!forceRefresh && fs.existsSync(this.cacheFilePath)) {
        try {
          const stats = fs.statSync(this.cacheFilePath);
          // If file is less than 24 hours old, use it
          const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
          if (ageHours < 24) {
            const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
            const cached: Instrument[] = JSON.parse(raw);
            this.instruments = cached;
            this.indexInstruments(cached);
            this.isLoaded = true;
            this.isLoading = false;
            return;
          }
        } catch {
          // ignore cache read failure and proceed to download
        }
      }

      // 2. Download NSE master from Upstox assets
      const response = await fetch('https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz', {
        headers: { 'Accept-Encoding': 'gzip' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Upstox instrument master: HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const decompressed = zlib.gunzipSync(buffer).toString('utf-8');
      const rawList: Record<string, unknown>[] = JSON.parse(decompressed);

      // Filter and map to clean Instrument structures
      const parsed: Instrument[] = [];

      // First add popular instruments
      for (const p of POPULAR_INSTRUMENTS) {
        parsed.push(p);
      }

      for (const item of rawList) {
        const key = String(item.instrument_key || '');
        const sym = String(item.trading_symbol || '');
        const name = String(item.name || sym);
        const segment = String(item.segment || '');
        const exchange = String(item.exchange || 'NSE');
        const type = String(item.instrument_type || '');

        if (!key || !sym) continue;

        // Keep Equities, Indices, F&O
        parsed.push({
          instrument_key: key,
          trading_symbol: sym,
          name,
          exchange,
          segment,
          instrument_type: type,
          lot_size: typeof item.lot_size === 'number' ? item.lot_size : 1,
          tick_size: typeof item.tick_size === 'number' ? item.tick_size : 0.05,
        });
      }

      this.instruments = parsed;
      this.indexInstruments(parsed);
      this.isLoaded = true;

      // Save to cache file asynchronously
      try {
        const cacheDir = path.dirname(this.cacheFilePath);
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        fs.writeFileSync(this.cacheFilePath, JSON.stringify(parsed));
      } catch (saveErr) {
        console.warn('Could not write instrument cache to disk:', saveErr);
      }
    } catch (err) {
      console.error('Error initializing Upstox instrument master:', err);
      // Fallback is already initialized with POPULAR_INSTRUMENTS
    } finally {
      this.isLoading = false;
    }
  }

  public async search(query: string, limit = 30): Promise<Instrument[]> {
    const q = (query || '').trim().toUpperCase();
    if (!q) {
      return this.instruments.slice(0, limit);
    }

    // Trigger background master download if not loaded yet
    if (!this.isLoaded && !this.isLoading) {
      this.initMaster().catch(() => {});
    }

    const exactSymbolMatches: Instrument[] = [];
    const prefixSymbolMatches: Instrument[] = [];
    const containsSymbolMatches: Instrument[] = [];
    const nameMatches: Instrument[] = [];

    const isMatch = (str: string, target: string) => str.toUpperCase().includes(target);

    for (const inst of this.instruments) {
      const sym = inst.trading_symbol.toUpperCase();
      const name = (inst.name || '').toUpperCase();

      if (sym === q) {
        exactSymbolMatches.push(inst);
      } else if (sym.startsWith(q)) {
        prefixSymbolMatches.push(inst);
      } else if (sym.includes(q)) {
        containsSymbolMatches.push(inst);
      } else if (name.includes(q)) {
        nameMatches.push(inst);
      }

      if (exactSymbolMatches.length + prefixSymbolMatches.length + containsSymbolMatches.length >= limit * 2) {
        break;
      }
    }

    // Sort order: Equities and Indices first
    const sortPriority = (a: Instrument, b: Instrument) => {
      const isEqA = a.segment === 'NSE_EQ' || a.segment === 'NSE_INDEX';
      const isEqB = b.segment === 'NSE_EQ' || b.segment === 'NSE_INDEX';
      if (isEqA && !isEqB) return -1;
      if (!isEqA && isEqB) return 1;
      return a.trading_symbol.length - b.trading_symbol.length;
    };

    prefixSymbolMatches.sort(sortPriority);
    containsSymbolMatches.sort(sortPriority);

    const merged = [
      ...exactSymbolMatches,
      ...prefixSymbolMatches,
      ...containsSymbolMatches,
      ...nameMatches,
    ];

    // Deduplicate by instrument_key
    const seen = new Set<string>();
    const results: Instrument[] = [];

    for (const item of merged) {
      if (!seen.has(item.instrument_key)) {
        seen.add(item.instrument_key);
        results.push(item);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  public resolve(symbolOrKey: string): Instrument | null {
    if (!symbolOrKey) return null;
    const clean = symbolOrKey.trim();

    // 1. Direct instrument_key lookup
    if (this.keyMap.has(clean)) {
      return this.keyMap.get(clean)!;
    }

    // 2. Trading symbol lookup
    const symMatches = this.symbolMap.get(clean.toUpperCase());
    if (symMatches && symMatches.length > 0) {
      // Prioritize NSE_EQ or NSE_INDEX
      const equityOrIndex = symMatches.find(
        (m) => m.segment === 'NSE_EQ' || m.segment === 'NSE_INDEX'
      );
      return equityOrIndex || symMatches[0];
    }

    // 3. Fallback scan popular list
    const found = POPULAR_INSTRUMENTS.find(
      (p) =>
        p.instrument_key === clean ||
        p.trading_symbol.toUpperCase() === clean.toUpperCase()
    );

    return found || null;
  }

  public getCount(): number {
    return this.instruments.length;
  }

  public isMasterLoaded(): boolean {
    return this.isLoaded;
  }
}

// Global server singleton
const globalForInstruments = global as unknown as {
  __upstox_instruments_service__?: InstrumentMasterService;
};

export const instrumentService =
  globalForInstruments.__upstox_instruments_service__ ??
  new InstrumentMasterService();

if (process.env.NODE_ENV !== 'production') {
  globalForInstruments.__upstox_instruments_service__ = instrumentService;
}

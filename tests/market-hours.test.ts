import { describe, it, expect } from 'vitest';
import {
  getIndianMarketStatus,
  getUSMarketStatus,
  getMCXMarketStatus,
  getMarketStatusForInstrument,
  isMarketOpenForInstrument,
} from '../lib/market-hours';

describe('Market Hours & Status Verification', () => {
  it('correctly reports US stock market on weekend as CLOSED with NASDAQ/NYSE exchange', () => {
    // 2026-10-03 is a Saturday
    const saturday = new Date('2026-10-03T18:00:00Z');
    const usStatus = getUSMarketStatus(saturday, 'NASDAQ');
    expect(usStatus.isOpen).toBe(false);
    expect(usStatus.session).toBe('CLOSED');
    expect(usStatus.exchange).toBe('NASDAQ');
    expect(usStatus.reason).toContain('Weekend');
  });

  it('correctly reports US regular hours on weekday (e.g. 11:00 AM ET)', () => {
    // 2026-10-02 is a Friday, 15:00 UTC = 11:00 AM EDT (UTC-4)
    const fridayTradingHours = new Date('2026-10-02T15:00:00Z');
    const usStatus = getUSMarketStatus(fridayTradingHours, 'NASDAQ');
    expect(usStatus.isOpen).toBe(true);
    expect(usStatus.session).toBe('OPEN');
    expect(usStatus.exchange).toBe('NASDAQ');
  });

  it('correctly identifies instrument market status for US, Indian, and MCX instruments', () => {
    const saturday = new Date('2026-10-03T18:00:00Z');

    // US instrument
    const usInst = {
      instrument_key: 'US|AAPL',
      trading_symbol: 'AAPL',
      exchange: 'NASDAQ' as const,
      name: 'Apple Inc.',
      segment: 'US_EQ' as const,
    };
    const usStatus = getMarketStatusForInstrument(usInst, saturday);
    expect(usStatus.exchange).toBe('NASDAQ');
    expect(usStatus.isOpen).toBe(false);

    // Indian instrument
    const indianInst = {
      instrument_key: 'NSE_EQ|INE002A01018',
      trading_symbol: 'RELIANCE',
      exchange: 'NSE' as const,
      name: 'RELIANCE INDUSTRIES LTD',
      segment: 'NSE_EQ' as const,
    };
    const inStatus = getMarketStatusForInstrument(indianInst, saturday);
    expect(inStatus.exchange).toBe('NSE');
    expect(inStatus.isOpen).toBe(false);
    expect(inStatus.reason).toContain('Weekend');

    // MCX instrument
    const mcxInst = {
      instrument_key: 'MCX_FO|4321',
      trading_symbol: 'GOLD',
      exchange: 'MCX' as const,
      name: 'GOLD 1KG',
      segment: 'MCX_FO' as const,
    };
    const mcxStatus = getMarketStatusForInstrument(mcxInst, saturday);
    expect(mcxStatus.exchange).toBe('MCX');
    expect(mcxStatus.isOpen).toBe(false);
  });

  it('isMarketOpenForInstrument works correctly for US instruments', () => {
    const saturday = new Date('2026-10-03T18:00:00Z');
    expect(isMarketOpenForInstrument('US|AAPL', saturday)).toBe(false);
    expect(isMarketOpenForInstrument('NSE_EQ|INE002A01018', saturday)).toBe(false);
  });
});

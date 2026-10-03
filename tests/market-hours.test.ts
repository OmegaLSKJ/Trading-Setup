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

  it('tests market-hours transitions at 09:14:59, 09:15:01, and across 15:30 IST', () => {
    // 2026-10-07 is a Wednesday (non-holiday weekday)
    // 09:14:59 IST = 03:44:59 UTC
    const preMarketDate = new Date('2026-10-07T03:44:59Z');
    const preMarketStatus = getIndianMarketStatus(preMarketDate);
    expect(preMarketStatus.isOpen).toBe(false);
    expect(preMarketStatus.session).toBe('PRE_MARKET');

    // 09:15:01 IST = 03:45:01 UTC
    const openDate = new Date('2026-10-07T03:45:01Z');
    const openStatus = getIndianMarketStatus(openDate);
    expect(openStatus.isOpen).toBe(true);
    expect(openStatus.session).toBe('OPEN');

    // 15:29:59 IST = 09:59:59 UTC (just before close)
    const beforeCloseDate = new Date('2026-10-07T09:59:59Z');
    const beforeCloseStatus = getIndianMarketStatus(beforeCloseDate);
    expect(beforeCloseStatus.isOpen).toBe(true);
    expect(beforeCloseStatus.session).toBe('OPEN');

    // 15:30:01 IST = 10:00:01 UTC (just after regular session close)
    const postMarketDate = new Date('2026-10-07T10:00:01Z');
    const postMarketStatus = getIndianMarketStatus(postMarketDate);
    expect(postMarketStatus.isOpen).toBe(false);
    expect(postMarketStatus.session).toBe('CLOSED');

    // 16:00:01 IST = 10:30:01 UTC (after post-market close)
    const closedDate = new Date('2026-10-07T10:30:01Z');
    const closedStatus = getIndianMarketStatus(closedDate);
    expect(closedStatus.isOpen).toBe(false);
    expect(closedStatus.session).toBe('CLOSED');
  });

  it('correctly evaluates MCX commodity market hours (09:00 - 23:30 IST)', () => {
    // 2026-10-07 is Wednesday
    // 20:00 IST = 14:30 UTC -> MCX is OPEN
    const mcxOpenDate = new Date('2026-10-07T14:30:00Z');
    const mcxOpenStatus = getMCXMarketStatus(mcxOpenDate);
    expect(mcxOpenStatus.isOpen).toBe(true);
    expect(mcxOpenStatus.session).toBe('OPEN');
    expect(mcxOpenStatus.exchange).toBe('MCX');

    // 23:31 IST = 18:01 UTC -> MCX is CLOSED
    const mcxClosedDate = new Date('2026-10-07T18:01:00Z');
    const mcxClosedStatus = getMCXMarketStatus(mcxClosedDate);
    expect(mcxClosedStatus.isOpen).toBe(false);
    expect(mcxClosedStatus.session).toBe('CLOSED');
  });
});

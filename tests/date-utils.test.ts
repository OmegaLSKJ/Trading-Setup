import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDateYYYYMMDD,
  isValidCalendarDate,
  calendarDaysBetween,
  calculateDateChunks,
  dateStringToUtcSeconds,
  getExchangeLocalDateBounds,
  MAX_SPAN_DAYS_INTRADAY,
  MAX_SPAN_DAYS_DAILY,
} from '../lib/date-utils';
import { fetchCandleRange, normalizeCandles } from '../lib/upstox-service';

describe('Date Utilities & Chunk Calculations', () => {
  it('formats dates consistently to YYYY-MM-DD', () => {
    const d = new Date(2024, 2, 15); // March 15 2024
    expect(formatDateYYYYMMDD(d)).toBe('2024-03-15');
  });

  it('validates calendar date format strictly (YYYY-MM-DD)', () => {
    expect(isValidCalendarDate('2024-03-15')).toBe(true);
    expect(isValidCalendarDate('2024-02-29')).toBe(true); // Leap year
    expect(isValidCalendarDate('2023-02-29')).toBe(false); // Non-leap year
    expect(isValidCalendarDate('2024-13-01')).toBe(false); // Invalid month
    expect(isValidCalendarDate('2024-04-31')).toBe(false); // April has 30 days
    expect(isValidCalendarDate('invalid-date')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });

  it('supports year 0000 in date parsing, validation, and formatting', () => {
    expect(isValidCalendarDate('0000-01-01')).toBe(true);
    expect(isValidCalendarDate('0000-12-31')).toBe(true);

    const utcSec = dateStringToUtcSeconds('0000-01-01');
    const d = new Date(utcSec * 1000);
    expect(d.getUTCFullYear()).toBe(0);

    const formatted = formatDateYYYYMMDD(d);
    expect(formatted).toBe('0000-01-01');
  });

  it('calculates calendar days between dates inclusive', () => {
    expect(calendarDaysBetween('2024-01-01', '2024-01-01')).toBe(1);
    expect(calendarDaysBetween('2024-01-01', '2024-01-29')).toBe(29);
    expect(calendarDaysBetween('2024-01-01', '2024-01-30')).toBe(30);
  });

  it('enforces exact limits for intraday minute spans and daily spans', () => {
    expect(MAX_SPAN_DAYS_INTRADAY).toBe(366);
    expect(MAX_SPAN_DAYS_DAILY).toBe(3652);
    expect(calendarDaysBetween('2024-01-01', '2024-12-31')).toBe(366); // Leap year 2024 has 366 days
  });

  it('calculates exchange-local date bounds for Asia/Kolkata and America/New_York', () => {
    const kolkataBounds = getExchangeLocalDateBounds('2026-03-31', '2026-03-31', 'Asia/Kolkata');
    // 2026-03-31 00:00:00 IST is 2026-03-30 18:30:00 UTC
    const kDate = new Date(kolkataBounds.fromSec * 1000);
    expect(kDate.toISOString()).toBe('2026-03-30T18:30:00.000Z');

    const nyBounds = getExchangeLocalDateBounds('2026-03-31', '2026-03-31', 'America/New_York');
    // 2026-03-31 00:00:00 EDT (UTC-4) is 2026-03-31 04:00:00 UTC
    const nyDate = new Date(nyBounds.fromSec * 1000);
    expect(nyDate.toISOString()).toBe('2026-03-31T04:00:00.000Z');
  });

  it('chunks date ranges into exact 29 calendar days inclusive per chunk', () => {
    const chunks = calculateDateChunks('2024-01-01', '2024-03-01', '5m');
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      const days = calendarDaysBetween(chunk.from, chunk.to);
      expect(days).toBeLessThanOrEqual(29);
      expect(days).toBeGreaterThan(0);
    });
    expect(chunks[0].to).toBe('2024-03-01');
    expect(chunks[chunks.length - 1].from).toBe('2024-01-01');
  });
});

describe('fetchCandleRange & Candle Processing Data Truthfulness', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retains IST-midnight and UTC-midnight candles with exchange-local bounds', async () => {
    // Upstox daily candle for 2026-03-31 is formatted as 2026-03-31T00:00:00+05:30 (UTC: 2026-03-30T18:30:00Z)
    const mockApiResponse = {
      status: 'success',
      data: {
        candles: [
          ['2026-03-31T00:00:00+05:30', 2500, 2550, 2480, 2520, 100000, 0],
        ],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    } as unknown as Response);

    process.env.UPSTOX_ANALYTICS_TOKEN = 'mock-token';
    const result = await fetchCandleRange(
      'NSE_EQ|INE002A01018',
      '1D',
      '2026-03-31',
      '2026-03-31',
      false
    );

    expect(result.candles.length).toBe(1);
    expect(result.candles[0].open).toBe(2500);
    expect(result.candles[0].close).toBe(2520);
    expect(result.partial).toBe(false);
  });

  it('sets partial: true on intraday stitching failure', async () => {
    process.env.UPSTOX_TOKEN = 'mock-token';
    process.env.UPSTOX_ANALYTICS_TOKEN = 'mock-token';
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              candles: [['2024-02-15T09:15:00+05:30', 100, 105, 99, 102, 1000, 0]],
            },
          }),
        } as unknown as Response;
      }
      // Second chunk fails
      return {
        ok: false,
        status: 500,
        headers: new Headers({ 'retry-after': '0' }),
        json: async () => ({ status: 'error', message: 'Internal error' }),
      } as unknown as Response;
    });

    const result = await fetchCandleRange(
      'NSE_EQ|INE002A01018',
      '5m',
      '2024-01-01',
      '2024-03-01', // multiple chunks (>29 days)
      false
    );

    expect(result.partial).toBe(true);
    expect(result.failedRanges?.length).toBeGreaterThan(0);
  });

  it('rejects null and non-finite OHLC without zero-conversion in normalizeCandles', () => {
    const rawWithNulls = [
      ['2024-03-09T09:15:00+05:30', null, 105, 95, 100, 1000, 0],
      ['2024-03-09T09:20:00+05:30', 100, NaN, 95, 102, 1000, 0],
      ['2024-03-09T09:25:00+05:30', 100, 105, Infinity, 102, 1000, 0],
      ['2024-03-09T09:30:00+05:30', 100, 105, 95, 102, 1000, 0], // Valid
    ];

    const normalized = normalizeCandles(rawWithNulls as unknown as Parameters<typeof normalizeCandles>[0]);
    expect(normalized.length).toBe(1);
    expect(normalized[0].open).toBe(100);
    expect(normalized[0].close).toBe(102);
  });
});

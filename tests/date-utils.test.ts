import { describe, it, expect } from 'vitest';
import {
  formatDateYYYYMMDD,
  isValidCalendarDate,
  calendarDaysBetween,
  calculateDateChunks,
  MAX_SPAN_DAYS_INTRADAY,
} from '../lib/date-utils';

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

  it('calculates calendar days between dates inclusive', () => {
    expect(calendarDaysBetween('2024-01-01', '2024-01-01')).toBe(1);
    expect(calendarDaysBetween('2024-01-01', '2024-01-29')).toBe(29);
    expect(calendarDaysBetween('2024-01-01', '2024-01-30')).toBe(30);
  });

  it('enforces exact 366-day limit for intraday minute spans', () => {
    expect(MAX_SPAN_DAYS_INTRADAY).toBe(366);
    // Span of 366 days
    expect(calendarDaysBetween('2024-01-01', '2024-12-31')).toBe(366); // Leap year 2024 has 366 days
  });

  it('chunks date ranges into exact 29 calendar days inclusive per chunk', () => {
    // Range of 61 days: Jan 1 to Mar 1 in 2024 (leap year: Jan=31, Feb=29 -> 61 days)
    const chunks = calculateDateChunks('2024-01-01', '2024-03-01', '5m');
    
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk must be at most 29 calendar days inclusive
    chunks.forEach((chunk) => {
      const days = calendarDaysBetween(chunk.from, chunk.to);
      expect(days).toBeLessThanOrEqual(29);
      expect(days).toBeGreaterThan(0);
    });

    // Combined spans must cover the whole range
    expect(chunks[0].to).toBe('2024-03-01');
    expect(chunks[chunks.length - 1].from).toBe('2024-01-01');
  });

  it('handles single day or range smaller than 29 days as single chunk', () => {
    const singleDayChunks = calculateDateChunks('2024-05-10', '2024-05-10', '5m');
    expect(singleDayChunks).toEqual([{ from: '2024-05-10', to: '2024-05-10' }]);

    const shortChunks = calculateDateChunks('2024-05-01', '2024-05-15', '5m');
    expect(shortChunks).toEqual([{ from: '2024-05-01', to: '2024-05-15' }]);
  });

  it('chunks 1D multi-year date ranges using UTC calendar boundaries', () => {
    const chunks = calculateDateChunks('2020-01-01', '2022-01-01', '1D');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].to).toBe('2022-01-01');
    expect(chunks[chunks.length - 1].from).toBe('2020-01-01');
    chunks.forEach((chunk) => {
      const days = calendarDaysBetween(chunk.from, chunk.to);
      expect(days).toBeLessThanOrEqual(365);
      expect(days).toBeGreaterThan(0);
    });
  });
});

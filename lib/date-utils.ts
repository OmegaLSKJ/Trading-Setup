import { Timeframe } from './types';

export const MAX_SPAN_DAYS_INTRADAY = 366;

/**
 * Format a Date object to YYYY-MM-DD
 */
export function formatDateYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate strict YYYY-MM-DD calendar date with actual calendar validity (e.g. leap years, valid days per month)
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * Parses YYYY-MM-DD into a UTC midnight timestamp (seconds)
 */
export function dateStringToUtcSeconds(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000);
}

/**
 * Calculate calendar days difference inclusive (e.g., 2026-01-01 to 2026-01-01 is 1 day)
 */
export function calendarDaysBetween(fromDateStr: string, toDateStr: string): number {
  const fromSec = dateStringToUtcSeconds(fromDateStr);
  const toSec = dateStringToUtcSeconds(toDateStr);
  return Math.floor((toSec - fromSec) / 86400) + 1;
}

/**
 * Calculates date chunks using timezone-independent calendar arithmetic.
 * Upstox limits minute candles to 30 calendar days inclusive per call.
 * We chunk minute data into max 29 calendar dates inclusive (28 days delta).
 * Daily candles can handle up to 365 calendar days inclusive.
 */
export function calculateDateChunks(
  fromDateStr: string,
  toDateStr: string,
  timeframe: Timeframe
): { from: string; to: string }[] {
  if (!isValidCalendarDate(fromDateStr) || !isValidCalendarDate(toDateStr)) {
    return [{ from: fromDateStr, to: toDateStr }];
  }

  const fromSec = dateStringToUtcSeconds(fromDateStr);
  const toSec = dateStringToUtcSeconds(toDateStr);

  if (fromSec > toSec) {
    return [{ from: fromDateStr, to: toDateStr }];
  }

  // Daily candles: 365 calendar days chunk limit
  if (timeframe === '1D') {
    const totalDays = Math.floor((toSec - fromSec) / 86400) + 1;
    if (totalDays <= 365) {
      return [{ from: fromDateStr, to: toDateStr }];
    }

    const chunks: { from: string; to: string }[] = [];
    let currentToSec = toSec;

    while (currentToSec >= fromSec) {
      const currentFromSec = Math.max(fromSec, currentToSec - 364 * 86400);

      chunks.push({
        from: new Date(currentFromSec * 1000).toISOString().slice(0, 10),
        to: new Date(currentToSec * 1000).toISOString().slice(0, 10),
      });

      currentToSec = currentFromSec - 86400;
    }

    return chunks;
  }

  // Intraday minute candles: split into chunks of max 29 calendar dates inclusive (28 days offset)
  const maxChunkDays = 28;
  const chunks: { from: string; to: string }[] = [];
  let currentToSec = toSec;

  while (currentToSec >= fromSec) {
    const currentFromSec = Math.max(fromSec, currentToSec - maxChunkDays * 86400);

    chunks.push({
      from: new Date(currentFromSec * 1000).toISOString().slice(0, 10),
      to: new Date(currentToSec * 1000).toISOString().slice(0, 10),
    });

    currentToSec = currentFromSec - 86400;
  }

  return chunks;
}

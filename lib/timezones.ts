export interface TimezoneOption {
  value: string;
  label: string;
  shortLabel: string;
  region: string;
  offset: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  {
    value: 'Asia/Kolkata',
    label: 'India Standard Time (IST)',
    shortLabel: 'IST',
    region: 'India / NSE & BSE',
    offset: 'UTC+5:30',
  },
  {
    value: 'America/New_York',
    label: 'US Eastern Time (ET)',
    shortLabel: 'ET',
    region: 'New York / NYSE & NASDAQ',
    offset: 'UTC-5 / UTC-4',
  },
  {
    value: 'America/Chicago',
    label: 'US Central Time (CT)',
    shortLabel: 'CT',
    region: 'Chicago / CME',
    offset: 'UTC-6 / UTC-5',
  },
  {
    value: 'America/Los_Angeles',
    label: 'US Pacific Time (PT)',
    shortLabel: 'PT',
    region: 'Los Angeles / West Coast',
    offset: 'UTC-8 / UTC-7',
  },
  {
    value: 'Europe/London',
    label: 'London / GMT (BST)',
    shortLabel: 'GMT',
    region: 'United Kingdom / LSE',
    offset: 'UTC+0 / UTC+1',
  },
  {
    value: 'Europe/Berlin',
    label: 'Central European (CET)',
    shortLabel: 'CET',
    region: 'Berlin / Frankfurt / Euronext',
    offset: 'UTC+1 / UTC+2',
  },
  {
    value: 'Asia/Dubai',
    label: 'Gulf Standard Time (GST)',
    shortLabel: 'GST',
    region: 'Dubai / DFM & Crypto',
    offset: 'UTC+4',
  },
  {
    value: 'Asia/Singapore',
    label: 'Singapore Time (SGT)',
    shortLabel: 'SGT',
    region: 'Singapore / SGX',
    offset: 'UTC+8',
  },
  {
    value: 'Asia/Hong_Kong',
    label: 'Hong Kong Time (HKT)',
    shortLabel: 'HKT',
    region: 'Hong Kong / HKEX',
    offset: 'UTC+8',
  },
  {
    value: 'Asia/Tokyo',
    label: 'Japan Standard Time (JST)',
    shortLabel: 'JST',
    region: 'Tokyo / TSE',
    offset: 'UTC+9',
  },
  {
    value: 'Australia/Sydney',
    label: 'Australian Eastern (AEST)',
    shortLabel: 'AEST',
    region: 'Sydney / ASX',
    offset: 'UTC+10 / UTC+11',
  },
  {
    value: 'UTC',
    label: 'Coordinated Universal Time',
    shortLabel: 'UTC',
    region: 'Global / Forex & Crypto',
    offset: 'UTC+0',
  },
];

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export function getTimezoneOption(tz: string): TimezoneOption {
  const normalized = tz === 'Europe/Frankfurt' ? 'Europe/Berlin' : tz;
  if (!isValidTimezone(normalized)) {
    return TIMEZONE_OPTIONS.find((t) => t.value === DEFAULT_TIMEZONE)!;
  }
  const found = TIMEZONE_OPTIONS.find((t) => t.value.toLowerCase() === normalized.toLowerCase());
  if (found) return found;

  return {
    value: normalized,
    label: normalized,
    shortLabel: normalized.split('/').pop()?.replace('_', ' ') || 'TZ',
    region: 'Custom',
    offset: '',
  };
}


export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getTimezoneShortLabel(tz: string, date: Date = new Date()): string {
  try {
    const validTz = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: validTz,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) return tzPart.value;
  } catch {
    // fallback
  }
  return getTimezoneOption(tz).shortLabel;
}

export function formatDateTimeWithZone(
  unixSec: number,
  tz: string = DEFAULT_TIMEZONE,
  includeSeconds = false
): string {
  try {
    const validTz = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
    const date = new Date(unixSec * 1000);

    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: validTz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: true,
      timeZoneName: 'short',
    });

    return formatter.format(date);
  } catch {
    return new Date(unixSec * 1000).toLocaleString();
  }
}

export function formatTimeOnlyWithZone(
  unixSec: number,
  tz: string = DEFAULT_TIMEZONE,
  hour12 = false
): string {
  try {
    const validTz = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
    const date = new Date(unixSec * 1000);
    return date.toLocaleTimeString('en-US', {
      timeZone: validTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12,
    });
  } catch {
    return new Date(unixSec * 1000).toLocaleTimeString();
  }
}

/**
 * Formats chart tick marks using date boundaries in the selected timezone
 * rather than relying on UTC-derived tickMarkType.
 */
export function formatTickMark(
  time: number,
  tickMarkType: number,
  tz: string = DEFAULT_TIMEZONE
): string {
  try {
    const validTz = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
    const date = new Date(time * 1000);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: validTz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    let year = '';
    let month = 0;
    let day = 0;
    let hour = 0;
    let minute = 0;
    let second = 0;

    for (const p of parts) {
      if (p.type === 'year') year = p.value;
      else if (p.type === 'month') month = parseInt(p.value, 10);
      else if (p.type === 'day') day = parseInt(p.value, 10);
      else if (p.type === 'hour') hour = parseInt(p.value, 10);
      else if (p.type === 'minute') minute = parseInt(p.value, 10);
      else if (p.type === 'second') second = parseInt(p.value, 10);
    }

    // Check if the tick marks a date boundary in the selected timezone
    if (hour === 0 && minute === 0 && second === 0) {
      if (month === 1 && day === 1) {
        return year;
      }
      if (day === 1) {
        return date.toLocaleDateString('en-US', { timeZone: validTz, month: 'short' });
      }
      return date.toLocaleDateString('en-US', {
        timeZone: validTz,
        day: '2-digit',
        month: 'short',
      });
    }

    // When zoomed out to Year / Month scale across multiple days
    if (tickMarkType === 0) {
      return year;
    }
    if (tickMarkType === 1) {
      return date.toLocaleDateString('en-US', { timeZone: validTz, month: 'short' });
    }

    // Otherwise it represents intraday time in the selected timezone
    return date.toLocaleTimeString('en-US', {
      timeZone: validTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return new Date(time * 1000).toLocaleTimeString();
  }
}

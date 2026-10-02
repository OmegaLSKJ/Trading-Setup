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
    value: 'Europe/Frankfurt',
    label: 'Central European (CET)',
    shortLabel: 'CET',
    region: 'Frankfurt / Euronext',
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
  const found = TIMEZONE_OPTIONS.find((t) => t.value.toLowerCase() === tz.toLowerCase());
  if (found) return found;

  return {
    value: tz,
    label: tz,
    shortLabel: tz.split('/').pop()?.replace('_', ' ') || 'TZ',
    region: 'Custom',
    offset: '',
  };
}

export function getTimezoneShortLabel(tz: string): string {
  return getTimezoneOption(tz).shortLabel;
}

export function formatDateTimeWithZone(
  unixSec: number,
  tz: string = DEFAULT_TIMEZONE,
  includeSeconds = false
): string {
  try {
    const date = new Date(unixSec * 1000);
    const shortLabel = getTimezoneShortLabel(tz);

    const formatted = date.toLocaleString('en-US', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: true,
    });

    return `${formatted} ${shortLabel}`;
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
    const date = new Date(unixSec * 1000);
    return date.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12,
    });
  } catch {
    return new Date(unixSec * 1000).toLocaleTimeString();
  }
}

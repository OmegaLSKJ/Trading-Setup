/**
 * Indian Stock Market (NSE / BSE / MCX) & US Market Schedule & Status Helper
 * Market Timings (Indian Standard Time - IST, UTC+5:30):
 * - NSE / BSE Equities & F&O: Monday to Friday, 09:15 to 15:30 IST
 * - Pre-Market: 09:00 to 09:08 IST
 * - Saturdays, Sundays, and National Holidays: CLOSED
 */

export interface MarketStatus {
  isOpen: boolean;
  session: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'POST_MARKET';
  exchange: string;
  reason: string;
  timeIST: string;
}

// Indian Exchange Holidays keyed by year (NSE/BSE)
const NSE_HOLIDAYS: Record<number, Set<string>> = {
  2025: new Set([
    '2025-01-26', '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10',
    '2025-04-14', '2025-04-18', '2025-05-01', '2025-06-07', '2025-08-15',
    '2025-08-27', '2025-10-02', '2025-10-21', '2025-10-22', '2025-11-05',
    '2025-12-25',
  ]),
  2026: new Set([
    '2026-01-26', // Republic Day
    '2026-02-17', // Mahashivratri
    '2026-03-03', // Holi
    '2026-03-20', // Id-Ul-Fitr (Ramzan Id)
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-27', // Bakri Id
    '2026-08-15', // Independence Day
    '2026-08-25', // Milad-Un-Nabi
    '2026-10-02', // Mahatma Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-08', // Diwali-Laxmi Pujan
    '2026-11-10', // Diwali-Balipratipada
    '2026-11-24', // Gurunanak Jayanti
    '2026-12-25', // Christmas
  ]),
};

let cachedStatus: { time: number; dateKey: string; status: MarketStatus } | null = null;

/**
 * Returns the current market status based on real Indian Standard Time (IST).
 */
export function getIndianMarketStatus(date = new Date()): MarketStatus {
  const now = date.getTime();

  // Convert current time to IST string
  const istFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = istFormatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

  const yearNum = parseInt(getPart('year'), 10);
  const month = getPart('month');
  const day = getPart('day');
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);

  const dateStr = `${yearNum}-${month}-${day}`;

  if (cachedStatus && cachedStatus.dateKey === dateStr) {
    const elapsed = now - cachedStatus.time;
    if (elapsed >= 0 && elapsed < 5000) {
      return cachedStatus.status;
    }
  }

  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} IST`;

  // Get Day of week in IST
  const istDate = new Date(
    date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );
  const dayOfWeek = istDate.getDay(); // 0 = Sun, 6 = Sat

  let resultStatus: MarketStatus;

  const holidaysForYear = NSE_HOLIDAYS[yearNum];
  const isHoliday = holidaysForYear ? holidaysForYear.has(dateStr) : false;

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    resultStatus = {
      isOpen: false,
      session: 'CLOSED',
      exchange: 'NSE/BSE',
      reason: 'Weekend (Saturday/Sunday)',
      timeIST: timeStr,
    };
  } else if (isHoliday) {
    resultStatus = {
      isOpen: false,
      session: 'CLOSED',
      exchange: 'NSE/BSE',
      reason: 'Exchange Holiday (National / Regional Holiday)',
      timeIST: timeStr,
    };
  } else {
    const minutesFromMidnight = hour * 60 + minute;
    const marketOpenMinutes = 9 * 60 + 15; // 09:15 IST
    const marketCloseMinutes = 15 * 60 + 30; // 15:30 IST
    const preMarketOpenMinutes = 9 * 60; // 09:00 IST

    if (minutesFromMidnight >= marketOpenMinutes && minutesFromMidnight < marketCloseMinutes) {
      resultStatus = {
        isOpen: true,
        session: 'OPEN',
        exchange: 'NSE/BSE',
        reason: 'Regular Trading Hours (09:15 - 15:30 IST)',
        timeIST: timeStr,
      };
    } else if (minutesFromMidnight >= preMarketOpenMinutes && minutesFromMidnight < marketOpenMinutes) {
      resultStatus = {
        isOpen: false,
        session: 'PRE_MARKET',
        exchange: 'NSE/BSE',
        reason: 'Pre-Market Session (09:00 - 09:15 IST)',
        timeIST: timeStr,
      };
    } else {
      resultStatus = {
        isOpen: false,
        session: 'CLOSED',
        exchange: 'NSE/BSE',
        reason: 'Market Closed (Trading hours: Mon-Fri 09:15 - 15:30 IST)',
        timeIST: timeStr,
      };
    }
  }

  cachedStatus = { time: now, dateKey: dateStr, status: resultStatus };
  return resultStatus;
}

/**
 * Returns current US market status based on Eastern Time (ET).
 * Regular hours: Mon-Fri 09:30 - 16:00 ET.
 */
export function getUSMarketStatus(date = new Date()): MarketStatus {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekday = getPart('weekday');
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const timeET = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ET`;

  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      isOpen: false,
      session: 'CLOSED',
      exchange: 'NYSE/NASDAQ',
      reason: 'US Weekend (Saturday/Sunday)',
      timeIST: timeET,
    };
  }

  const minutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 09:30 ET
  const closeMinutes = 16 * 60; // 16:00 ET

  if (minutes >= openMinutes && minutes < closeMinutes) {
    return {
      isOpen: true,
      session: 'OPEN',
      exchange: 'NYSE/NASDAQ',
      reason: 'Regular US Trading Hours (09:30 - 16:00 ET)',
      timeIST: timeET,
    };
  }

  return {
    isOpen: false,
    session: 'CLOSED',
    exchange: 'NYSE/NASDAQ',
    reason: 'US Market Closed',
    timeIST: timeET,
  };
}

/**
 * Checks whether the market is open for a given instrument.
 */
export function isMarketOpenForInstrument(instrumentKey: string): boolean {
  if (instrumentKey.startsWith('US|')) {
    return getUSMarketStatus().isOpen;
  }
  return getIndianMarketStatus().isOpen;
}

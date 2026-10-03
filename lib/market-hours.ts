/**
 * Indian Stock Market (NSE / BSE / MCX) & US Market Schedule & Status Helper
 * Market Timings:
 * - NSE / BSE Equities & F&O: Monday to Friday, 09:15 to 15:30 IST (Pre-market 09:00 - 09:15 IST)
 * - MCX Commodities: Monday to Friday, 09:00 to 23:30 IST (Weekend-only holidays implemented)
 * - US Equities (NYSE / NASDAQ): Monday to Friday, 09:30 to 16:00 ET (Pre-market 04:00 - 09:30, After-hours 16:00 - 20:00 ET)
 * - Saturdays, Sundays, and Exchange Holidays: CLOSED
 * - Note: Holiday tables cover years 2025–2026 only.
 */

export interface MarketStatus {
  isOpen: boolean;
  session: 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'POST_MARKET';
  exchange: string;
  reason: string;
  timeIST: string;
  timeDisplay?: string;
  timezone?: string;
  tradingHours?: string;
}

// Indian Exchange Holidays keyed by year (NSE/BSE, covers 2025–2026)
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

// US Stock Market Holidays (NYSE/NASDAQ, covers 2025–2026)
const US_HOLIDAYS: Record<number, Set<string>> = {
  2025: new Set([
    '2025-01-01', // New Year's Day
    '2025-01-20', // Martin Luther King Jr. Day
    '2025-02-17', // Presidents' Day
    '2025-04-18', // Good Friday
    '2025-05-26', // Memorial Day
    '2025-06-19', // Juneteenth
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-11-27', // Thanksgiving Day
    '2025-12-25', // Christmas Day
  ]),
  2026: new Set([
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Washington's Birthday (Presidents' Day)
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (Observed)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving Day
    '2026-12-25', // Christmas Day
  ]),
};

/**
 * Returns the current market status based on real Indian Standard Time (IST).
 */
export function getIndianMarketStatus(date = new Date(), exchangeName = 'NSE/BSE'): MarketStatus {
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
      exchange: exchangeName,
      reason: 'Weekend (Saturday/Sunday)',
      timeIST: timeStr,
      timeDisplay: timeStr,
      timezone: 'Asia/Kolkata',
      tradingHours: 'Mon-Fri 09:15 - 15:30 IST',
    };
  } else if (isHoliday) {
    resultStatus = {
      isOpen: false,
      session: 'CLOSED',
      exchange: exchangeName,
      reason: 'Exchange Holiday (National / Regional Holiday)',
      timeIST: timeStr,
      timeDisplay: timeStr,
      timezone: 'Asia/Kolkata',
      tradingHours: 'Mon-Fri 09:15 - 15:30 IST',
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
        exchange: exchangeName,
        reason: 'Regular Trading Hours (09:15 - 15:30 IST)',
        timeIST: timeStr,
        timeDisplay: timeStr,
        timezone: 'Asia/Kolkata',
        tradingHours: 'Mon-Fri 09:15 - 15:30 IST',
      };
    } else if (minutesFromMidnight >= preMarketOpenMinutes && minutesFromMidnight < marketOpenMinutes) {
      resultStatus = {
        isOpen: false,
        session: 'PRE_MARKET',
        exchange: exchangeName,
        reason: 'Pre-Market Session (09:00 - 09:15 IST)',
        timeIST: timeStr,
        timeDisplay: timeStr,
        timezone: 'Asia/Kolkata',
        tradingHours: 'Mon-Fri 09:15 - 15:30 IST',
      };
    } else {
      resultStatus = {
        isOpen: false,
        session: 'CLOSED',
        exchange: exchangeName,
        reason: 'Market Closed (Trading hours: Mon-Fri 09:15 - 15:30 IST)',
        timeIST: timeStr,
        timeDisplay: timeStr,
        timezone: 'Asia/Kolkata',
        tradingHours: 'Mon-Fri 09:15 - 15:30 IST',
      };
    }
  }

  return resultStatus;
}

/**
 * Returns current US market status based on Eastern Time (ET).
 * Timings (ET):
 * - Pre-Market: 04:00 - 09:30 ET
 * - Regular hours: 09:30 - 16:00 ET
 * - Post-Market (After Hours): 16:00 - 20:00 ET
 */
export function getUSMarketStatus(date = new Date(), exchangeName = 'NASDAQ'): MarketStatus {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekday = getPart('weekday');
  const yearNum = parseInt(getPart('year'), 10);
  const month = getPart('month');
  const day = getPart('day');
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);

  const dateStr = `${yearNum}-${month}-${day}`;
  const timeET = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ET`;

  const holidaysForYear = US_HOLIDAYS[yearNum];
  const isHoliday = holidaysForYear ? holidaysForYear.has(dateStr) : false;

  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      isOpen: false,
      session: 'CLOSED',
      exchange: exchangeName,
      reason: 'US Weekend (Saturday/Sunday)',
      timeIST: timeET,
      timeDisplay: timeET,
      timezone: 'America/New_York',
      tradingHours: 'Mon-Fri 09:30 - 16:00 ET',
    };
  }

  if (isHoliday) {
    return {
      isOpen: false,
      session: 'CLOSED',
      exchange: exchangeName,
      reason: 'US Market Holiday',
      timeIST: timeET,
      timeDisplay: timeET,
      timezone: 'America/New_York',
      tradingHours: 'Mon-Fri 09:30 - 16:00 ET',
    };
  }

  const minutes = hour * 60 + minute;
  const preMarketOpen = 4 * 60; // 04:00 ET
  const regularOpen = 9 * 60 + 30; // 09:30 ET
  const regularClose = 16 * 60; // 16:00 ET
  const afterHoursClose = 20 * 60; // 20:00 ET

  if (minutes >= regularOpen && minutes < regularClose) {
    return {
      isOpen: true,
      session: 'OPEN',
      exchange: exchangeName,
      reason: 'Regular US Trading Hours (09:30 - 16:00 ET)',
      timeIST: timeET,
      timeDisplay: timeET,
      timezone: 'America/New_York',
      tradingHours: 'Mon-Fri 09:30 - 16:00 ET',
    };
  }

  if (minutes >= preMarketOpen && minutes < regularOpen) {
    return {
      isOpen: false,
      session: 'PRE_MARKET',
      exchange: exchangeName,
      reason: 'US Pre-Market Session (04:00 - 09:30 ET)',
      timeIST: timeET,
      timeDisplay: timeET,
      timezone: 'America/New_York',
      tradingHours: 'Mon-Fri 09:30 - 16:00 ET',
    };
  }

  if (minutes >= regularClose && minutes < afterHoursClose) {
    return {
      isOpen: false,
      session: 'POST_MARKET',
      exchange: exchangeName,
      reason: 'US After-Hours Session (16:00 - 20:00 ET)',
      timeIST: timeET,
      timeDisplay: timeET,
      timezone: 'America/New_York',
      tradingHours: 'Mon-Fri 09:30 - 16:00 ET',
    };
  }

  return {
    isOpen: false,
    session: 'CLOSED',
    exchange: exchangeName,
    reason: 'US Market Closed (Regular: 09:30 - 16:00 ET)',
    timeIST: timeET,
    timeDisplay: timeET,
    timezone: 'America/New_York',
    tradingHours: 'Mon-Fri 09:30 - 16:00 ET',
  };
}

/**
 * Returns current MCX Commodity Market status based on IST.
 * Regular hours: Mon-Fri 09:00 - 23:30 / 23:55 IST.
 */
export function getMCXMarketStatus(date = new Date()): MarketStatus {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekday = getPart('weekday');
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const timeIST = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} IST`;

  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      isOpen: false,
      session: 'CLOSED',
      exchange: 'MCX',
      reason: 'Weekend (Saturday/Sunday)',
      timeIST,
      timeDisplay: timeIST,
      timezone: 'Asia/Kolkata',
      tradingHours: 'Mon-Fri 09:00 - 23:30 IST',
    };
  }

  const minutes = hour * 60 + minute;
  const openMinutes = 9 * 60; // 09:00 IST
  const closeMinutes = 23 * 60 + 30; // 23:30 IST

  if (minutes >= openMinutes && minutes < closeMinutes) {
    return {
      isOpen: true,
      session: 'OPEN',
      exchange: 'MCX',
      reason: 'MCX Trading Hours (09:00 - 23:30 IST)',
      timeIST,
      timeDisplay: timeIST,
      timezone: 'Asia/Kolkata',
      tradingHours: 'Mon-Fri 09:00 - 23:30 IST',
    };
  }

  return {
    isOpen: false,
    session: 'CLOSED',
    exchange: 'MCX',
    reason: 'MCX Closed (Trading hours: Mon-Fri 09:00 - 23:30 IST)',
    timeIST,
    timeDisplay: timeIST,
    timezone: 'Asia/Kolkata',
    tradingHours: 'Mon-Fri 09:00 - 23:30 IST',
  };
}

/**
 * Returns accurate MarketStatus for a given instrument based on its exchange/segment.
 */
export function getMarketStatusForInstrument(
  instrument?: { instrument_key?: string; exchange?: string; segment?: string; trading_symbol?: string } | null,
  date = new Date()
): MarketStatus {
  if (!instrument) {
    return getIndianMarketStatus(date);
  }

  const key = instrument.instrument_key || '';
  const ex = (instrument.exchange || '').toUpperCase();
  const seg = (instrument.segment || '').toUpperCase();

  // US Equities
  if (key.startsWith('US|') || ex === 'NASDAQ' || ex === 'NYSE' || seg.startsWith('US_')) {
    const exchangeName = ex === 'NASDAQ' || ex === 'NYSE' ? ex : 'NASDAQ';
    return getUSMarketStatus(date, exchangeName);
  }

  // MCX Commodities
  if (ex === 'MCX' || seg.includes('MCX') || key.startsWith('MCX')) {
    return getMCXMarketStatus(date);
  }

  // Indian Equities & F&O
  const indianEx = ex === 'BSE' ? 'BSE' : ex === 'NSE' ? 'NSE' : 'NSE/BSE';
  return getIndianMarketStatus(date, indianEx);
}

/**
 * Checks whether the market is open for a given instrument key.
 */
export function isMarketOpenForInstrument(instrumentKey: string, date = new Date()): boolean {
  return getMarketStatusForInstrument({ instrument_key: instrumentKey }, date).isOpen;
}

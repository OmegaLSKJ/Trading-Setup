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

// 2026 Indian Exchange Holidays (NSE/BSE)
const NSE_HOLIDAYS_2026: Set<string> = new Set([
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
]);

let cachedStatus: { time: number; status: MarketStatus } | null = null;

/**
 * Returns the current market status based on real Indian Standard Time (IST).
 */
export function getIndianMarketStatus(date = new Date()): MarketStatus {
  const now = date.getTime();
  if (cachedStatus && now - cachedStatus.time < 5000) {
    return cachedStatus.status;
  }
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

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);

  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} IST`;

  // Get Day of week in IST
  const istDate = new Date(
    date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );
  const dayOfWeek = istDate.getDay(); // 0 = Sun, 6 = Sat

  let resultStatus: MarketStatus;

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    resultStatus = {
      isOpen: false,
      session: 'CLOSED',
      exchange: 'NSE/BSE',
      reason: 'Weekend (Saturday/Sunday)',
      timeIST: timeStr,
    };
  } else if (NSE_HOLIDAYS_2026.has(dateStr)) {
    resultStatus = {
      isOpen: false,
      session: 'CLOSED',
      exchange: 'NSE/BSE',
      reason: 'Exchange Holiday (Gandhi Jayanti / National Holiday)',
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

  cachedStatus = { time: now, status: resultStatus };
  return resultStatus;
}

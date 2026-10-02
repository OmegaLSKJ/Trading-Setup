import { DateRangePreset } from './types';
import { formatDateYYYYMMDD } from './upstox-service';

export function getDateRangeForPreset(preset: DateRangePreset): { from: string; to: string } {
  const to = new Date();
  const from = new Date();

  switch (preset) {
    case 'today':
      // From start of today
      break;
    case '5D':
      from.setDate(to.getDate() - 5);
      break;
    case '1M':
      from.setMonth(to.getMonth() - 1);
      break;
    case '3M':
      from.setMonth(to.getMonth() - 3);
      break;
    case '6M':
      from.setMonth(to.getMonth() - 6);
      break;
    case 'YTD':
      from.setMonth(0, 1); // Jan 1st of current year
      break;
    case '1Y':
      from.setFullYear(to.getFullYear() - 1);
      break;
    case 'custom':
    default:
      from.setMonth(to.getMonth() - 1);
      break;
  }

  return {
    from: formatDateYYYYMMDD(from),
    to: formatDateYYYYMMDD(to),
  };
}

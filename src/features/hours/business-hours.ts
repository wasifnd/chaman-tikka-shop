export interface DayHours {
  isClosed: boolean;
  openTime: string | null; // "HH:mm"
  closeTime: string | null; // "HH:mm"; earlier than openTime means it closes after midnight
}

export type WeekHours = Record<number, DayHours | undefined>; // 0 = Sunday

export const RESTAURANT_TIMEZONE = 'Asia/Karachi';

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Day of week (0-6) and minutes since midnight for `date` in the restaurant's timezone. */
export function localParts(date: Date, timeZone = RESTAURANT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    day: WEEKDAYS[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function isOpenOn(hours: DayHours | undefined, minutes: number, mode: 'same' | 'overnight') {
  if (!hours || hours.isClosed || !hours.openTime || !hours.closeTime) return false;
  const open = toMinutes(hours.openTime);
  const close = toMinutes(hours.closeTime);
  if (close > open) return mode === 'same' && minutes >= open && minutes < close;
  // Crosses midnight: evening part belongs to today, early-morning part to yesterday's shift.
  return mode === 'same' ? minutes >= open : minutes < close;
}

export function isOpenAt(week: WeekHours, date: Date, timeZone = RESTAURANT_TIMEZONE): boolean {
  const { day, minutes } = localParts(date, timeZone);
  const yesterday = (day + 6) % 7;
  return isOpenOn(week[day], minutes, 'same') || isOpenOn(week[yesterday], minutes, 'overnight');
}

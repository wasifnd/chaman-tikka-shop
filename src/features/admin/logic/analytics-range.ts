import { karachiLocalToIso } from './karachi-time';

/** Long enough for a quarter, short enough that one page load stays quick and cheap. */
export const MAX_RANGE_DAYS = 92;

export const PRESETS = ['today', 'yesterday', '7d', '30d'] as const;
export type Preset = (typeof PRESETS)[number] | 'custom';

const KARACHI_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
/** The restaurant trades 6 PM to 2 AM, so a "day" of business runs noon to noon. */
const DAY_STARTS_HOUR = 12;

/** One business day, named by the calendar date it began on: "2026-10-17". */
export type DayKey = string;

/** Which business day an instant belongs to. 1 AM on the 18th still belongs to the 17th. */
export function businessDayKey(date: Date): DayKey {
  const local = new Date(date.getTime() + KARACHI_OFFSET_MS - DAY_STARTS_HOUR * 3_600_000);
  return local.toISOString().slice(0, 10);
}

/** Hour of day (0-23) in Karachi for an instant. */
export function karachiHour(date: Date): number {
  return new Date(date.getTime() + KARACHI_OFFSET_MS).getUTCHours();
}

export function addDays(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

const isRealDay = (key: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(key) && addDays(key, 0) === key;

export interface AnalyticsRange {
  preset: Preset;
  from: DayKey;
  /** Inclusive. */
  to: DayKey;
  /** Every business day in the range, oldest first. */
  days: DayKey[];
  /** The instant the first day began. */
  start: Date;
  /** The instant after the last day ended (exclusive). */
  end: Date;
}

function makeRange(preset: Preset, from: DayKey, to: DayKey): AnalyticsRange {
  const days: DayKey[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  const begin = (key: DayKey) =>
    new Date(karachiLocalToIso(`${key}T${String(DAY_STARTS_HOUR).padStart(2, '0')}:00`) ?? 0);
  return { preset, from, to, days, start: begin(from), end: begin(addDays(to, 1)) };
}

export interface RangeInput {
  preset?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

/**
 * Turns the choice on the dashboard into a concrete range. A malformed or oversized custom range
 * falls back to the last 7 days rather than failing, so a mangled link still shows a dashboard.
 */
export function resolveRange(input: RangeInput, now: Date): AnalyticsRange {
  const today = businessDayKey(now);
  switch (input.preset) {
    case 'today':
      return makeRange('today', today, today);
    case 'yesterday': {
      const day = addDays(today, -1);
      return makeRange('yesterday', day, day);
    }
    case '30d':
      return makeRange('30d', addDays(today, -29), today);
    case 'custom': {
      const { from, to } = input;
      if (from && to && isRealDay(from) && isRealDay(to) && from <= to) {
        // The future has no sales; stop at today.
        const last = to > today ? today : to;
        if (from <= last) {
          const range = makeRange('custom', from, last);
          if (range.days.length <= MAX_RANGE_DAYS) return range;
        }
      }
      return makeRange('7d', addDays(today, -6), today);
    }
    default:
      return makeRange('7d', addDays(today, -6), today);
  }
}

/** The stretch of the same length straight before this one, for "compared with before". */
export function previousRange(range: AnalyticsRange): AnalyticsRange {
  const length = range.days.length;
  return makeRange('custom', addDays(range.from, -length), addDays(range.from, -1));
}

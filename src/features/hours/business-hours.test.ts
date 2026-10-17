import { describe, expect, it } from 'vitest';
import { isOpenAt, localParts, toMinutes, type WeekHours } from './business-hours';

const evening: WeekHours = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { isClosed: false, openTime: '18:00', closeTime: '02:00' }]),
);

// Asia/Karachi is UTC+5 all year, so 2026-10-16 (Friday) 19:00 PKT = 14:00Z.
const at = (iso: string) => new Date(iso);

describe('business hours', () => {
  it('parses HH:mm', () => {
    expect(toMinutes('18:30')).toBe(1110);
  });

  it('reads day and minutes in the restaurant timezone', () => {
    expect(localParts(at('2026-10-16T14:00:00Z'))).toEqual({ day: 5, minutes: 19 * 60 });
  });

  it('is open in the evening and closed in the afternoon', () => {
    expect(isOpenAt(evening, at('2026-10-16T14:00:00Z'))).toBe(true); // 19:00
    expect(isOpenAt(evening, at('2026-10-16T09:00:00Z'))).toBe(false); // 14:00
  });

  it('stays open after midnight and closes at 02:00', () => {
    expect(isOpenAt(evening, at('2026-10-16T20:30:00Z'))).toBe(true); // Sat 01:30 PKT
    expect(isOpenAt(evening, at('2026-10-16T21:00:00Z'))).toBe(false); // Sat 02:00 PKT
  });

  it('uses the previous day for the overnight tail', () => {
    const week: WeekHours = {
      ...evening,
      5: { isClosed: true, openTime: null, closeTime: null }, // Friday closed
    };
    // Saturday 01:00 PKT belongs to Friday's shift, which is closed.
    expect(isOpenAt(week, at('2026-10-16T20:00:00Z'))).toBe(false);
  });

  it('handles same-day hours and missing config', () => {
    const day: WeekHours = { 5: { isClosed: false, openTime: '09:00', closeTime: '17:00' } };
    expect(isOpenAt(day, at('2026-10-16T09:00:00Z'))).toBe(true); // 14:00
    expect(isOpenAt(day, at('2026-10-16T14:00:00Z'))).toBe(false); // 19:00
    expect(isOpenAt({}, at('2026-10-16T14:00:00Z'))).toBe(false);
  });
});

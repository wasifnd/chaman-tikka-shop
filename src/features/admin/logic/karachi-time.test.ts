import { describe, expect, it } from 'vitest';
import {
  businessDayStart,
  isoToKarachiLocal,
  karachiDayStart,
  karachiLocalToIso,
} from './karachi-time';

describe('Karachi local time <-> ISO', () => {
  it('converts what an admin types (UTC+5) to an instant and back', () => {
    expect(karachiLocalToIso('2026-10-17T18:30')).toBe('2026-10-17T13:30:00.000Z');
    expect(isoToKarachiLocal('2026-10-17T13:30:00.000Z')).toBe('2026-10-17T18:30');
  });

  it('handles times that cross midnight in UTC', () => {
    expect(karachiLocalToIso('2026-10-17T02:00')).toBe('2026-10-16T21:00:00.000Z');
    expect(isoToKarachiLocal('2026-10-16T21:00:00.000Z')).toBe('2026-10-17T02:00');
  });

  it.each([
    '',
    'tomorrow',
    '2026-10-17',
    '2026-10-17 18:30',
    '2026-02-31T10:00',
    '2026-13-01T10:00',
  ])('rejects %j', (value) => {
    expect(karachiLocalToIso(value)).toBeNull();
  });

  it('round-trips any valid minute', () => {
    for (const local of ['2026-01-01T00:00', '2026-12-31T23:59', '2028-02-29T12:00']) {
      const iso = karachiLocalToIso(local);
      expect(iso).not.toBeNull();
      expect(isoToKarachiLocal(iso ?? '')).toBe(local);
    }
  });
});

describe('businessDayStart', () => {
  it('starts at noon Karachi time', () => {
    // 9 PM Karachi on 17 Oct: the day began at noon on the 17th.
    expect(businessDayStart(new Date('2026-10-17T16:00:00Z')).toISOString()).toBe(
      '2026-10-17T07:00:00.000Z',
    );
  });

  it('keeps the after-midnight hours in the evening that started them', () => {
    // 1 AM Karachi on 18 Oct still belongs to the day that began at noon on the 17th.
    expect(businessDayStart(new Date('2026-10-17T20:00:00Z')).toISOString()).toBe(
      '2026-10-17T07:00:00.000Z',
    );
  });

  it('rolls over exactly at noon', () => {
    expect(businessDayStart(new Date('2026-10-17T06:59:59Z')).toISOString()).toBe(
      '2026-10-16T07:00:00.000Z',
    );
    expect(businessDayStart(new Date('2026-10-17T07:00:00Z')).toISOString()).toBe(
      '2026-10-17T07:00:00.000Z',
    );
  });
});

describe('karachiDayStart', () => {
  it('is midnight in Karachi, which is 19:00 the evening before in UTC', () => {
    expect(karachiDayStart('2026-10-17')?.toISOString()).toBe('2026-10-16T19:00:00.000Z');
  });
  it('rejects invalid days', () => {
    expect(karachiDayStart('2026-02-30')).toBeNull();
    expect(karachiDayStart('nope')).toBeNull();
  });
});

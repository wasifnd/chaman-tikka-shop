import { describe, expect, it } from 'vitest';
import {
  couponInputSchema,
  hoursSchema,
  restaurantSettingsSchema,
  teamCreateSchema,
  teamUpdateSchema,
  zoneInputSchema,
} from './operations.schema';

describe('restaurantSettingsSchema', () => {
  const valid = { name: 'BBQ Store', address: '', taxRatePercent: 5, orderingEnabled: true };

  it('accepts valid settings and turns a blank address into null', () => {
    expect(restaurantSettingsSchema.parse(valid)).toMatchObject({ address: null });
  });

  it.each([-1, 31, 5.555, NaN])('rejects a tax rate of %s', (taxRatePercent) => {
    expect(restaurantSettingsSchema.safeParse({ ...valid, taxRatePercent }).success).toBe(false);
  });

  it('requires a name', () => {
    expect(restaurantSettingsSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false);
  });
});

describe('hoursSchema', () => {
  const week = (override: (day: number) => Record<string, unknown> = () => ({})) =>
    Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isClosed: false,
      openTime: '18:00',
      closeTime: '02:00',
      ...override(dayOfWeek),
    }));

  it('accepts a week that closes after midnight', () => {
    expect(hoursSchema.safeParse(week()).success).toBe(true);
  });

  it('accepts a closed day with no times', () => {
    const parsed = hoursSchema.safeParse(
      week((d) => (d === 2 ? { isClosed: true, openTime: null, closeTime: null } : {})),
    );
    expect(parsed.success).toBe(true);
  });

  it('needs all seven days exactly once', () => {
    expect(hoursSchema.safeParse(week().slice(0, 6)).success).toBe(false);
    expect(hoursSchema.safeParse(week(() => ({ dayOfWeek: 1 }))).success).toBe(false);
    expect(hoursSchema.safeParse([...week(), ...week()]).success).toBe(false);
  });

  it.each(['6pm', '25:00', '18:60', '', '1800'])(
    'rejects the time %j on an open day',
    (openTime) => {
      expect(hoursSchema.safeParse(week((d) => (d === 0 ? { openTime } : {}))).success).toBe(false);
    },
  );

  it('rejects opening and closing at the same time', () => {
    expect(
      hoursSchema.safeParse(week((d) => (d === 3 ? { openTime: '10:00', closeTime: '10:00' } : {})))
        .success,
    ).toBe(false);
  });

  it('rejects an open day with missing times', () => {
    expect(
      hoursSchema.safeParse(week((d) => (d === 4 ? { openTime: null, closeTime: null } : {})))
        .success,
    ).toBe(false);
  });
});

describe('zoneInputSchema', () => {
  const zone = {
    name: 'Johar Town',
    charge: 100,
    freeDeliveryAbove: 2000,
    minOrderAmount: 0,
    isActive: true,
    sortOrder: 1,
  };

  it('accepts a zone and treats a blank free-delivery limit as none', () => {
    expect(zoneInputSchema.parse(zone).freeDeliveryAbove).toBe(2000);
    expect(zoneInputSchema.parse({ ...zone, freeDeliveryAbove: NaN }).freeDeliveryAbove).toBeNull();
  });

  it('rejects negative money and a missing name', () => {
    expect(zoneInputSchema.safeParse({ ...zone, charge: -1 }).success).toBe(false);
    expect(zoneInputSchema.safeParse({ ...zone, minOrderAmount: -1 }).success).toBe(false);
    expect(zoneInputSchema.safeParse({ ...zone, name: '' }).success).toBe(false);
  });
});

describe('couponInputSchema', () => {
  const coupon = {
    code: ' summer10 ',
    type: 'PERCENTAGE',
    amount: 10,
    minimumOrderAmount: 500,
    usageLimit: 100,
    expiresAt: null,
    isActive: true,
  };

  it('upper-cases and trims the code', () => {
    expect(couponInputSchema.parse(coupon).code).toBe('SUMMER10');
  });

  it.each(['AB', 'has space', 'bad!', 'x'.repeat(25), ''])('rejects the code %j', (code) => {
    expect(couponInputSchema.safeParse({ ...coupon, code }).success).toBe(false);
  });

  it('keeps a percentage between 0 and 100 but allows a larger fixed amount', () => {
    expect(couponInputSchema.safeParse({ ...coupon, amount: 101 }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...coupon, amount: 0 }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...coupon, type: 'FIXED', amount: 250 }).success).toBe(
      true,
    );
  });

  it('treats a blank usage limit as unlimited and rejects nonsense limits', () => {
    expect(couponInputSchema.parse({ ...coupon, usageLimit: NaN }).usageLimit).toBeNull();
    expect(couponInputSchema.safeParse({ ...coupon, usageLimit: 0 }).success).toBe(false);
    expect(couponInputSchema.safeParse({ ...coupon, usageLimit: 2.5 }).success).toBe(false);
  });

  it('validates the expiry timestamp', () => {
    expect(
      couponInputSchema.safeParse({ ...coupon, expiresAt: '2026-12-31T18:59:00.000Z' }).success,
    ).toBe(true);
    expect(couponInputSchema.safeParse({ ...coupon, expiresAt: 'soon' }).success).toBe(false);
  });
});

describe('team schemas', () => {
  it('creates staff with a normalised email and a decent password', () => {
    expect(
      teamCreateSchema.parse({
        email: '  Rana@Example.PK ',
        role: 'STORE_STAFF',
        password: 'longenough1',
      }),
    ).toEqual({ email: 'rana@example.pk', role: 'STORE_STAFF', password: 'longenough1' });
  });

  it('refuses short or oversized passwords, bad emails and the customer or super admin role', () => {
    const base = { email: 'a@b.pk', role: 'STORE_STAFF', password: 'longenough1' };
    expect(teamCreateSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(teamCreateSchema.safeParse({ ...base, password: 'x'.repeat(73) }).success).toBe(false);
    expect(teamCreateSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
    expect(teamCreateSchema.safeParse({ ...base, role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(teamCreateSchema.safeParse({ ...base, role: 'CUSTOMER' }).success).toBe(false);
  });

  it('needs at least one change when updating', () => {
    expect(teamUpdateSchema.safeParse({}).success).toBe(false);
    expect(teamUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(teamUpdateSchema.safeParse({ role: 'ADMIN' }).success).toBe(true);
    expect(teamUpdateSchema.safeParse({ password: 'brandnewpass' }).success).toBe(true);
    expect(teamUpdateSchema.safeParse({ role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(teamUpdateSchema.safeParse({ password: 'short' }).success).toBe(false);
  });
});

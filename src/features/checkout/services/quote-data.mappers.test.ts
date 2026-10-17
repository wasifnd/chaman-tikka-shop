import { describe, expect, it } from 'vitest';
import {
  mapCouponData,
  mapDealData,
  mapProductData,
  mapZoneData,
  parseRestaurantSettings,
  toWeekHours,
  type DealRow,
  type ProductRow,
} from './quote-data.mappers';

const decimal = (value: string) => ({ toString: () => value });

const productRow: ProductRow = {
  id: 'p1',
  nameEn: 'Chicken Tikka',
  basePrice: decimal('350.00'),
  discountPrice: decimal('300.00'),
  isActive: true,
  isAvailable: true,
  stockStatus: 'IN_STOCK',
  category: { isActive: true },
  variantGroups: [
    {
      id: 'g1',
      nameEn: 'Portion',
      isRequired: true,
      variants: [{ id: 'v1', nameEn: 'Half', priceModifier: decimal('330.00'), isAvailable: true }],
    },
  ],
  productAddons: [
    { addon: { id: 'a1', nameEn: 'Raita', price: decimal('50.00'), isAvailable: false } },
  ],
};

describe('mapProductData', () => {
  it('turns decimals into numbers and keeps availability flags for the engine', () => {
    expect(mapProductData(productRow)).toEqual({
      id: 'p1',
      name: 'Chicken Tikka',
      basePrice: 350,
      discountPrice: 300,
      isActive: true,
      isAvailable: true,
      stockStatus: 'IN_STOCK',
      categoryActive: true,
      variantGroups: [
        {
          id: 'g1',
          name: 'Portion',
          isRequired: true,
          variants: [{ id: 'v1', name: 'Half', priceModifier: 330, isAvailable: true }],
        },
      ],
      addons: [{ id: 'a1', name: 'Raita', price: 50, isAvailable: false }],
    });
  });

  it('keeps a missing discount as null', () => {
    expect(mapProductData({ ...productRow, discountPrice: null }).discountPrice).toBeNull();
  });
});

describe('mapDealData', () => {
  const live = {
    isActive: true,
    isAvailable: true,
    stockStatus: 'IN_STOCK' as const,
    category: { isActive: true },
  };
  const dealRow = (items: DealRow['items']): DealRow => ({
    id: 'd1',
    nameEn: 'Family Platter',
    price: decimal('1350'),
    isActive: true,
    isAvailable: true,
    startDate: null,
    endDate: null,
    items,
  });

  it('is sellable when every item is sellable', () => {
    const mapped = mapDealData(dealRow([{ product: live }, { product: live }]));
    expect(mapped).toMatchObject({
      id: 'd1',
      name: 'Family Platter',
      price: 1350,
      itemsOrderable: true,
    });
  });

  it.each([
    ['inactive', { ...live, isActive: false }],
    ['switched off', { ...live, isAvailable: false }],
    ['out of stock', { ...live, stockStatus: 'OUT_OF_STOCK' as const }],
    ['in a hidden category', { ...live, category: { isActive: false } }],
  ])('is not sellable when one item is %s', (_name, bad) => {
    expect(mapDealData(dealRow([{ product: live }, { product: bad }])).itemsOrderable).toBe(false);
  });

  it('is not sellable when it has no items', () => {
    expect(mapDealData(dealRow([])).itemsOrderable).toBe(false);
  });

  it('passes the date window through for the engine to check', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-02-01T00:00:00Z');
    const mapped = mapDealData({ ...dealRow([{ product: live }]), startDate: start, endDate: end });
    expect(mapped.startDate).toBe(start);
    expect(mapped.endDate).toBe(end);
  });
});

describe('mapZoneData and mapCouponData', () => {
  it('convert decimals and keep nullables', () => {
    expect(
      mapZoneData({
        id: 'z1',
        name: 'Johar Town',
        charge: decimal('100.00'),
        freeDeliveryAbove: null,
        minOrderAmount: decimal('500.00'),
        isActive: true,
      }),
    ).toEqual({
      id: 'z1',
      name: 'Johar Town',
      charge: 100,
      freeDeliveryAbove: null,
      minOrderAmount: 500,
      isActive: true,
    });

    expect(
      mapZoneData({
        id: 'z1',
        name: 'Z',
        charge: 0,
        freeDeliveryAbove: decimal('2000.00'),
        minOrderAmount: 0,
        isActive: true,
      }).freeDeliveryAbove,
    ).toBe(2000);

    expect(
      mapCouponData({
        id: 'c1',
        code: 'SAVE100',
        type: 'PERCENTAGE',
        amount: decimal('10.00'),
        minimumOrderAmount: decimal('500.00'),
        usageLimit: 50,
        usedCount: 3,
        customerId: null,
        expiresAt: null,
        isActive: true,
      }),
    ).toMatchObject({
      code: 'SAVE100',
      type: 'PERCENTAGE',
      amount: 10,
      minimumOrderAmount: 500,
      usageLimit: 50,
    });
  });
});

describe('parseRestaurantSettings', () => {
  it('reads valid settings', () => {
    expect(
      parseRestaurantSettings({ taxRatePercent: 16, orderingEnabled: false, name: 'x' }),
    ).toEqual({
      taxRatePercent: 16,
      orderingEnabled: false,
    });
  });

  it('falls back to safe defaults for missing or malformed values', () => {
    const defaults = { taxRatePercent: 0, orderingEnabled: true };
    expect(parseRestaurantSettings(undefined)).toEqual(defaults);
    expect(parseRestaurantSettings(null)).toEqual(defaults);
    expect(parseRestaurantSettings('nonsense')).toEqual(defaults);
    expect(parseRestaurantSettings({ taxRatePercent: 'lots', orderingEnabled: 'yes' })).toEqual(
      defaults,
    );
  });

  it('rejects an out-of-range tax rate rather than charging it', () => {
    expect(parseRestaurantSettings({ taxRatePercent: 500 }).taxRatePercent).toBe(0);
    expect(parseRestaurantSettings({ taxRatePercent: -5 }).taxRatePercent).toBe(0);
  });
});

describe('toWeekHours', () => {
  it('indexes rows by day of week', () => {
    expect(
      toWeekHours([
        { dayOfWeek: 0, openTime: '18:00', closeTime: '02:00', isClosed: false },
        { dayOfWeek: 3, openTime: null, closeTime: null, isClosed: true },
      ]),
    ).toEqual({
      0: { isClosed: false, openTime: '18:00', closeTime: '02:00' },
      3: { isClosed: true, openTime: null, closeTime: null },
    });
  });

  it('is empty for no rows, which means closed', () => {
    expect(toWeekHours([])).toEqual({});
  });
});

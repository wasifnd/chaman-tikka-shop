import type { WeekHours } from '@/features/hours/business-hours';
import type { CouponData, DealData, ProductData, QuoteData, ZoneData } from '../types/quote.types';

/** Friday 19:00 in Lahore (UTC+5): inside opening hours (18:00 to 02:00). */
export const OPEN_NOW = new Date('2026-10-16T14:00:00Z');
/** Friday 14:00 in Lahore: before opening. */
export const CLOSED_NOW = new Date('2026-10-16T09:00:00Z');

export const ids = {
  tikka: '11111111-1111-4111-8111-111111111111',
  naan: '22222222-2222-4222-8222-222222222222',
  drink: '33333333-3333-4333-8333-333333333333',
  portion: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  quarter: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
  half: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2',
  full: 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3',
  soldOutSize: 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4',
  raita: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  chutney: 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
  offMenuAddon: 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3',
  deal: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  zone: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  customer: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  otherCustomer: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2',
} as const;

export function product(overrides: Partial<ProductData> = {}): ProductData {
  return {
    id: ids.naan,
    name: 'Naan',
    basePrice: 30,
    discountPrice: null,
    isActive: true,
    isAvailable: true,
    stockStatus: 'IN_STOCK',
    categoryActive: true,
    preparationTime: 15,
    variantGroups: [],
    addons: [],
    ...overrides,
  };
}

/** Chicken Tikka: required portion choice, two add-ons, one sold-out size. */
export function tikka(overrides: Partial<ProductData> = {}): ProductData {
  return product({
    id: ids.tikka,
    name: 'Chicken Tikka',
    basePrice: 350,
    variantGroups: [
      {
        id: ids.portion,
        name: 'Portion',
        isRequired: true,
        variants: [
          { id: ids.quarter, name: 'Quarter', priceModifier: 0, isAvailable: true },
          { id: ids.half, name: 'Half', priceModifier: 330, isAvailable: true },
          { id: ids.full, name: 'Full', priceModifier: 650, isAvailable: true },
          { id: ids.soldOutSize, name: 'Family', priceModifier: 1200, isAvailable: false },
        ],
      },
    ],
    addons: [
      { id: ids.raita, name: 'Raita', price: 50, isAvailable: true },
      { id: ids.chutney, name: 'Mint chutney', price: 30, isAvailable: true },
      { id: ids.offMenuAddon, name: 'Off menu', price: 10, isAvailable: false },
    ],
    ...overrides,
  });
}

export function deal(overrides: Partial<DealData> = {}): DealData {
  return {
    id: ids.deal,
    name: 'Family Platter',
    price: 1350,
    isActive: true,
    isAvailable: true,
    startDate: null,
    endDate: null,
    itemsOrderable: true,
    items: [
      { productName: 'Chicken Tikka', variantName: null, quantity: 2 },
      { productName: 'Naan', variantName: null, quantity: 4 },
    ],
    preparationTime: 25,
    ...overrides,
  };
}

export function zone(overrides: Partial<ZoneData> = {}): ZoneData {
  return {
    id: ids.zone,
    name: 'Johar Town',
    charge: 100,
    freeDeliveryAbove: 2000,
    minOrderAmount: 0,
    isActive: true,
    ...overrides,
  };
}

export function coupon(overrides: Partial<CouponData> = {}): CouponData {
  return {
    id: 'coupon-1',
    code: 'SAVE100',
    type: 'FIXED',
    amount: 100,
    minimumOrderAmount: 0,
    usageLimit: null,
    usedCount: 0,
    customerId: null,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

export const EVERY_EVENING: WeekHours = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((day) => [
    day,
    { isClosed: false, openTime: '18:00', closeTime: '02:00' },
  ]),
);

export function quoteData(overrides: Partial<QuoteData> = {}): QuoteData {
  const products = [
    tikka(),
    product(),
    product({ id: ids.drink, name: 'Cold Drink', basePrice: 90 }),
  ];
  return {
    products: new Map(products.map((p) => [p.id, p])),
    deals: new Map([[ids.deal, deal()]]),
    zone: zone(),
    coupon: null,
    settings: { taxRatePercent: 0, orderingEnabled: true },
    hours: EVERY_EVENING,
    ...overrides,
  };
}

export const withProducts = (...items: ProductData[]) =>
  new Map(items.map((item) => [item.id, item]));

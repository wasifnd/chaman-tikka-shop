import { describe, expect, it } from 'vitest';
import type { DealSummary, ProductDetail } from '@/features/menu/types/menu.types';
import {
  dealLine,
  defaultSelection,
  matches,
  needsChoices,
  paymentSplit,
  productLine,
  roomLeft,
} from './counter-logic';

const tikka: ProductDetail = {
  id: 'p1',
  slug: 'chicken-tikka',
  name: 'Chicken Tikka',
  description: null,
  categorySlug: 'bbq',
  price: 350,
  originalPrice: null,
  thumbnailUrl: null,
  preparationTime: 20,
  isFeatured: false,
  isPopular: false,
  orderable: true,
  stockStatus: 'IN_STOCK',
  categoryName: 'BBQ',
  images: [],
  variantGroups: [
    {
      id: 'g1',
      name: 'Portion',
      isRequired: true,
      variants: [
        { id: 'quarter', name: 'Quarter', priceModifier: 0 },
        { id: 'half', name: 'Half', priceModifier: 330 },
      ],
    },
    {
      id: 'g2',
      name: 'Spice',
      isRequired: false,
      variants: [{ id: 'hot', name: 'Hot', priceModifier: 0 }],
    },
  ],
  addons: [{ id: 'raita', name: 'Raita', price: 50 }],
};

const naan: ProductDetail = {
  ...tikka,
  id: 'p2',
  name: 'Naan',
  price: 30,
  variantGroups: [],
  addons: [],
};

describe('picking items at the counter', () => {
  it('required groups start on their first choice; optional ones stay empty', () => {
    expect(defaultSelection(tikka)).toEqual({ variants: { g1: 'quarter' }, addonIds: [] });
  });

  it('only items with options open the picker', () => {
    expect(needsChoices(tikka)).toBe(true);
    expect(needsChoices(naan)).toBe(false);
  });

  it('builds a ticket line with the chosen options and their price', () => {
    expect(productLine(tikka, { variants: { g1: 'half' }, addonIds: ['raita'] }, 2)).toEqual({
      kind: 'product',
      productId: 'p1',
      name: 'Chicken Tikka',
      unitPrice: 730,
      quantity: 2,
      variantIds: ['half'],
      addonIds: ['raita'],
      optionLabels: ['Half', 'Raita'],
    });
  });

  it('a deal is one line at the deal price', () => {
    const deal = { id: 'd1', name: 'Family Platter', price: 1350 } as DealSummary;
    expect(dealLine(deal)).toEqual({
      kind: 'deal',
      dealId: 'd1',
      name: 'Family Platter',
      unitPrice: 1350,
      quantity: 1,
    });
  });

  it('searches by name, ignoring case', () => {
    expect(matches('Chicken Tikka', 'tikka')).toBe(true);
    expect(matches('Chicken Tikka', '  ')).toBe(true);
    expect(matches('Naan', 'tikka')).toBe(false);
  });
});

describe('the payment split shown to the cashier', () => {
  it('paid in full', () => {
    expect(paymentSplit(790, 'FULL', '')).toEqual({ paid: 790, remaining: 0, valid: true });
  });

  it('unpaid puts it all on the khata (but not an empty order)', () => {
    expect(paymentSplit(790, 'NONE', '')).toEqual({ paid: 0, remaining: 790, valid: true });
    expect(paymentSplit(0, 'NONE', '').valid).toBe(false);
  });

  it('part paid needs an amount above zero and below the total', () => {
    expect(paymentSplit(790, 'PART', '300')).toEqual({ paid: 300, remaining: 490, valid: true });
    expect(paymentSplit(790, 'PART', '').valid).toBe(false);
    expect(paymentSplit(790, 'PART', 'abc').valid).toBe(false);
    expect(paymentSplit(790, 'PART', '0').valid).toBe(false);
    // Paying it all is "paid in full", not a part payment.
    expect(paymentSplit(790, 'PART', '900')).toEqual({ paid: 790, remaining: 0, valid: false });
  });

  it('room left on a khata never goes below zero', () => {
    expect(roomLeft(9_500, 10_000)).toBe(500);
    expect(roomLeft(12_000, 10_000)).toBe(0);
  });
});

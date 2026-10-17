import { describe, expect, it } from 'vitest';
import { calculateUnitPrice, effectivePrice, missingRequiredGroups } from './pricing';
import type { AddonOption, VariantGroup } from './types/menu.types';

const groups: VariantGroup[] = [
  {
    id: 'portion',
    name: 'Portion',
    isRequired: true,
    variants: [
      { id: 'quarter', name: 'Quarter', priceModifier: 0 },
      { id: 'full', name: 'Full', priceModifier: 400 },
    ],
  },
  {
    id: 'spice',
    name: 'Spice',
    isRequired: false,
    variants: [{ id: 'hot', name: 'Hot', priceModifier: 20 }],
  },
];
const addons: AddonOption[] = [
  { id: 'raita', name: 'Raita', price: 50 },
  { id: 'naan', name: 'Naan', price: 30 },
];

describe('effectivePrice', () => {
  it('uses the discount only when it is lower than the base price', () => {
    expect(effectivePrice(350, 300)).toBe(300);
    expect(effectivePrice(350, 350)).toBe(350);
    expect(effectivePrice(350, 400)).toBe(350);
    expect(effectivePrice(350, null)).toBe(350);
  });
});

describe('calculateUnitPrice', () => {
  it('is exact for fractional prices that floats get wrong', () => {
    const fractional: VariantGroup[] = [
      {
        id: 'g',
        name: 'G',
        isRequired: false,
        variants: [{ id: 'a', name: 'A', priceModifier: 0.2 }],
      },
    ];
    // 0.1 + 0.2 is 0.30000000000000004 in floating point
    expect(calculateUnitPrice(0.1, fractional, [], { variants: { g: 'a' }, addonIds: [] })).toBe(
      0.3,
    );
  });

  it('is the base price with nothing selected', () => {
    expect(calculateUnitPrice(350, groups, addons, { variants: {}, addonIds: [] })).toBe(350);
  });

  it('adds variant modifiers and chosen add-ons', () => {
    const price = calculateUnitPrice(350, groups, addons, {
      variants: { portion: 'full', spice: 'hot' },
      addonIds: ['raita', 'naan'],
    });
    expect(price).toBe(350 + 400 + 20 + 50 + 30);
  });

  it('ignores unknown or stale ids instead of corrupting the total', () => {
    const price = calculateUnitPrice(350, groups, addons, {
      variants: { portion: 'gone', unknown: 'x' },
      addonIds: ['missing'],
    });
    expect(price).toBe(350);
  });
});

describe('missingRequiredGroups', () => {
  it('lists required groups without a choice and ignores optional ones', () => {
    expect(missingRequiredGroups(groups, { variants: {}, addonIds: [] })).toEqual(['Portion']);
    expect(missingRequiredGroups(groups, { variants: { portion: 'full' }, addonIds: [] })).toEqual(
      [],
    );
  });
});

import { describe, expect, it } from 'vitest';
import { calculateUnitPrice, missingRequiredGroups } from './pricing';
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

describe('calculateUnitPrice', () => {
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

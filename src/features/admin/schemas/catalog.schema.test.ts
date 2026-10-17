import { describe, expect, it } from 'vitest';
import {
  addonInputSchema,
  categoryInputSchema,
  dealInputSchema,
  productInputSchema,
} from './catalog.schema';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const category = {
  nameEn: 'Tikka',
  descriptionEn: '',
  imageUrl: '',
  sortOrder: 1,
  isActive: true,
  isFeatured: false,
};

const product = (overrides: Record<string, unknown> = {}) => ({
  nameEn: 'Chicken Tikka',
  descriptionEn: '',
  categoryId: ID,
  basePrice: 350,
  discountPrice: NaN,
  thumbnailUrl: '',
  preparationTime: 20,
  sortOrder: 0,
  isAvailable: true,
  isFeatured: false,
  isPopular: false,
  isActive: true,
  stockStatus: 'IN_STOCK',
  variantGroups: [],
  addonIds: [],
  ...overrides,
});

const issues = (
  schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
  v: unknown,
) => {
  const result = schema.safeParse(v) as {
    success: boolean;
    error?: { issues: { path: PropertyKey[]; message: string }[] };
  };
  return result.success
    ? []
    : (result.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('categoryInputSchema', () => {
  it('accepts a normal category and turns empty optional fields into null', () => {
    expect(categoryInputSchema.parse(category)).toMatchObject({
      nameEn: 'Tikka',
      descriptionEn: null,
      imageUrl: null,
    });
  });

  it('trims the name and rejects a blank one', () => {
    expect(categoryInputSchema.parse({ ...category, nameEn: '  Tikka  ' }).nameEn).toBe('Tikka');
    expect(issues(categoryInputSchema, { ...category, nameEn: '   ' })).toContain(
      'nameEn: Name is required',
    );
  });

  it('rejects absurd sort orders and over-long text', () => {
    expect(issues(categoryInputSchema, { ...category, sortOrder: -1 })).not.toEqual([]);
    expect(issues(categoryInputSchema, { ...category, sortOrder: 1.5 })).not.toEqual([]);
    expect(issues(categoryInputSchema, { ...category, nameEn: 'x'.repeat(61) })).not.toEqual([]);
  });
});

describe('image addresses', () => {
  const withImage = (imageUrl: string) => categoryInputSchema.safeParse({ ...category, imageUrl });

  it('accepts a Cloudinary https address', () => {
    expect(withImage('https://res.cloudinary.com/demo/image/upload/sample.jpg').success).toBe(true);
  });

  it.each([
    'http://res.cloudinary.com/demo/a.jpg',
    'https://evil.example.com/a.jpg',
    'https://res.cloudinary.com.evil.example/a.jpg',
    'javascript:alert(1)',
    'not a url',
    'data:image/png;base64,AAAA',
  ])('rejects %j (it would break the public page or run script)', (url) => {
    expect(withImage(url).success).toBe(false);
  });
});

describe('productInputSchema', () => {
  it('accepts a simple product and treats a blank sale price as none', () => {
    expect(productInputSchema.parse(product())).toMatchObject({
      discountPrice: null,
      descriptionEn: null,
      thumbnailUrl: null,
    });
  });

  it('accepts a sale price below the normal price', () => {
    expect(productInputSchema.parse(product({ discountPrice: 300 })).discountPrice).toBe(300);
  });

  it('rejects a sale price that is not lower', () => {
    expect(issues(productInputSchema, product({ discountPrice: 350 }))).toContain(
      'discountPrice: The sale price must be lower than the normal price',
    );
    expect(issues(productInputSchema, product({ discountPrice: 400 }))).not.toEqual([]);
  });

  it.each([
    [{ basePrice: -1 }, 'basePrice'],
    [{ basePrice: 10.005 }, 'basePrice'],
    [{ basePrice: 1_000_001 }, 'basePrice'],
    [{ basePrice: Infinity }, 'basePrice'],
    [{ basePrice: NaN }, 'basePrice'],
    [{ preparationTime: 0 }, 'preparationTime'],
    [{ preparationTime: 241 }, 'preparationTime'],
    [{ preparationTime: 12.5 }, 'preparationTime'],
    [{ categoryId: 'nope' }, 'categoryId'],
    [{ stockStatus: 'MAYBE' }, 'stockStatus'],
    [{ nameEn: '' }, 'nameEn'],
  ])('rejects %j', (override, field) => {
    expect(issues(productInputSchema, product(override)).some((i) => i.startsWith(field))).toBe(
      true,
    );
  });

  describe('options', () => {
    const group = (overrides: Record<string, unknown> = {}) => ({
      nameEn: 'Portion',
      isRequired: true,
      variants: [
        { nameEn: 'Quarter', priceModifier: 0, isAvailable: true },
        { nameEn: 'Half', priceModifier: 330, isAvailable: true },
      ],
      ...overrides,
    });

    it('accepts option groups, including a negative price change', () => {
      const parsed = productInputSchema.parse(
        product({
          variantGroups: [
            group({
              variants: [
                { nameEn: 'Large', priceModifier: 0, isAvailable: true },
                { nameEn: 'Small', priceModifier: -50, isAvailable: true },
              ],
            }),
          ],
        }),
      );
      expect(parsed.variantGroups[0]?.variants[1]?.priceModifier).toBe(-50);
    });

    it('requires a required group to have options', () => {
      expect(
        issues(productInputSchema, product({ variantGroups: [group({ variants: [] })] })),
      ).toContain('variantGroups.0.variants: A required group needs options');
      expect(
        productInputSchema.safeParse(
          product({ variantGroups: [group({ isRequired: false, variants: [] })] }),
        ).success,
      ).toBe(true);
    });

    it('rejects duplicate option names (case-insensitive) and duplicate group names', () => {
      const dup = group({
        variants: [
          { nameEn: 'Half', priceModifier: 0, isAvailable: true },
          { nameEn: 'half', priceModifier: 1, isAvailable: true },
        ],
      });
      expect(issues(productInputSchema, product({ variantGroups: [dup] }))).toContain(
        'variantGroups.0.variants.1.nameEn: Two options share this name',
      );
      expect(issues(productInputSchema, product({ variantGroups: [group(), group()] }))).toContain(
        'variantGroups.1.nameEn: Two groups share this name',
      );
    });

    it('limits how many groups and options there can be', () => {
      const many = Array.from({ length: 6 }, (_, i) => group({ nameEn: `G${String(i)}` }));
      expect(issues(productInputSchema, product({ variantGroups: many }))).not.toEqual([]);
      const options = Array.from({ length: 13 }, (_, i) => ({
        nameEn: `O${String(i)}`,
        priceModifier: 0,
        isAvailable: true,
      }));
      expect(
        issues(productInputSchema, product({ variantGroups: [group({ variants: options })] })),
      ).not.toEqual([]);
    });

    it('rejects a price change with fractions of a paisa', () => {
      const bad = group({ variants: [{ nameEn: 'X', priceModifier: 1.001, isAvailable: true }] });
      expect(issues(productInputSchema, product({ variantGroups: [bad] }))).not.toEqual([]);
    });
  });

  it('rejects the same add-on twice and malformed add-on ids', () => {
    expect(issues(productInputSchema, product({ addonIds: [ID, ID] }))).toContain(
      'addonIds: An add-on is listed twice',
    );
    expect(issues(productInputSchema, product({ addonIds: ['nope'] }))).not.toEqual([]);
    expect(productInputSchema.safeParse(product({ addonIds: [ID, ID2] })).success).toBe(true);
  });
});

describe('addonInputSchema', () => {
  it('accepts a free or paid add-on and rejects bad prices', () => {
    expect(
      addonInputSchema.safeParse({ nameEn: 'Raita', price: 0, isAvailable: true }).success,
    ).toBe(true);
    expect(
      addonInputSchema.safeParse({ nameEn: 'Raita', price: -5, isAvailable: true }).success,
    ).toBe(false);
    expect(addonInputSchema.safeParse({ nameEn: '', price: 5, isAvailable: true }).success).toBe(
      false,
    );
  });
});

describe('dealInputSchema', () => {
  const deal = (overrides: Record<string, unknown> = {}) => ({
    nameEn: 'Family Platter',
    descriptionEn: '',
    imageUrl: '',
    price: 1350,
    startDate: null,
    endDate: null,
    isAvailable: true,
    isActive: true,
    isFeatured: false,
    items: [{ productId: ID, variantId: null, quantity: 2 }],
    ...overrides,
  });

  it('accepts a deal and defaults missing dates and options to null', () => {
    const parsed = dealInputSchema.parse(
      deal({ startDate: undefined, items: [{ productId: ID, quantity: 1 }] }),
    );
    expect(parsed.startDate).toBeNull();
    expect(parsed.items[0]?.variantId).toBeNull();
  });

  it('needs at least one item and caps the number of items', () => {
    expect(issues(dealInputSchema, deal({ items: [] }))).toContain('items: Add at least one item');
    const many = Array.from({ length: 21 }, () => ({ productId: ID, quantity: 1 }));
    expect(issues(dealInputSchema, deal({ items: many }))).not.toEqual([]);
  });

  it('limits quantities to whole numbers between 1 and 50', () => {
    for (const quantity of [0, -1, 1.5, 51]) {
      expect(
        dealInputSchema.safeParse(deal({ items: [{ productId: ID, quantity }] })).success,
      ).toBe(false);
    }
  });

  it('requires the end to come after the start', () => {
    const start = '2026-10-17T10:00:00.000Z';
    expect(
      issues(dealInputSchema, deal({ startDate: start, endDate: '2026-10-17T09:00:00.000Z' })),
    ).toContain('endDate: The end must be after the start');
    expect(issues(dealInputSchema, deal({ startDate: start, endDate: start }))).not.toEqual([]);
    expect(
      dealInputSchema.safeParse(deal({ startDate: start, endDate: '2026-10-18T10:00:00.000Z' }))
        .success,
    ).toBe(true);
    // Either end alone is fine: "until further notice" or "from tomorrow".
    expect(dealInputSchema.safeParse(deal({ endDate: start })).success).toBe(true);
  });

  it('rejects dates that are not real timestamps', () => {
    expect(dealInputSchema.safeParse(deal({ startDate: 'tomorrow' })).success).toBe(false);
  });
});

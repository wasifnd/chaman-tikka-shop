import { describe, expect, it } from 'vitest';
import {
  isDealLive,
  mapCategory,
  mapDeal,
  mapProduct,
  mapProductDetail,
  toNumber,
  type DealRow,
  type ProductDetailRow,
  type ProductRow,
} from './menu.mappers';

// Prisma returns Decimal objects; anything with toString() stands in for them here.
const decimal = (value: string) => ({ toString: () => value });

const productRow: ProductRow = {
  id: 'p1',
  slug: 'chicken-tikka',
  nameEn: 'Chicken Tikka',
  descriptionEn: 'Char-grilled',
  category: { slug: 'chicken', nameEn: 'Chicken' },
  basePrice: decimal('350.00'),
  discountPrice: null,
  thumbnailUrl: null,
  preparationTime: 15,
  isFeatured: true,
  isPopular: false,
  isAvailable: true,
  stockStatus: 'IN_STOCK',
};

describe('toNumber', () => {
  it('converts Decimal-like values and numbers', () => {
    expect(toNumber(decimal('12.50'))).toBe(12.5);
    expect(toNumber(7)).toBe(7);
  });
});

describe('mapProduct', () => {
  it('uses the base price when there is no discount', () => {
    expect(mapProduct(productRow)).toMatchObject({
      price: 350,
      originalPrice: null,
      categorySlug: 'chicken',
      name: 'Chicken Tikka',
      orderable: true,
    });
  });

  it('exposes the discount and keeps the original for strike-through', () => {
    const mapped = mapProduct({ ...productRow, discountPrice: decimal('300.00') });
    expect(mapped.price).toBe(300);
    expect(mapped.originalPrice).toBe(350);
  });

  it('ignores a discount that is not actually lower', () => {
    const mapped = mapProduct({ ...productRow, discountPrice: decimal('350.00') });
    expect(mapped.price).toBe(350);
    expect(mapped.originalPrice).toBeNull();
  });

  it('marks hidden or out-of-stock products as not orderable, but LIMITED as orderable', () => {
    expect(mapProduct({ ...productRow, isAvailable: false }).orderable).toBe(false);
    expect(mapProduct({ ...productRow, stockStatus: 'OUT_OF_STOCK' }).orderable).toBe(false);
    expect(mapProduct({ ...productRow, stockStatus: 'LIMITED' }).orderable).toBe(true);
  });
});

describe('mapCategory', () => {
  it('maps its products with the category attached', () => {
    const { category: _omitted, ...product } = productRow;
    const mapped = mapCategory({
      id: 'c1',
      slug: 'chicken',
      nameEn: 'Chicken',
      descriptionEn: null,
      imageUrl: null,
      isFeatured: false,
      products: [product],
    });
    expect(mapped.name).toBe('Chicken');
    expect(mapped.products[0]).toMatchObject({ slug: 'chicken-tikka', categorySlug: 'chicken' });
  });
});

describe('mapProductDetail', () => {
  const detail: ProductDetailRow = {
    ...productRow,
    images: [
      { url: '/a.jpg', altTextEn: 'Plated tikka' },
      { url: '/b.jpg', altTextEn: null },
    ],
    variantGroups: [
      {
        id: 'g1',
        nameEn: 'Portion',
        isRequired: true,
        variants: [
          { id: 'v1', nameEn: 'Quarter', priceModifier: decimal('0'), isAvailable: true },
          { id: 'v2', nameEn: 'Full', priceModifier: decimal('400'), isAvailable: true },
          { id: 'v3', nameEn: 'Sold out size', priceModifier: decimal('900'), isAvailable: false },
        ],
      },
      {
        id: 'g2',
        nameEn: 'Empty group',
        isRequired: false,
        variants: [{ id: 'v4', nameEn: 'Gone', priceModifier: decimal('0'), isAvailable: false }],
      },
    ],
    productAddons: [
      { addon: { id: 'a1', nameEn: 'Raita', price: decimal('50'), isAvailable: true } },
      { addon: { id: 'a2', nameEn: 'Off menu', price: decimal('10'), isAvailable: false } },
    ],
  };

  it('keeps only available variants and drops groups left empty', () => {
    const mapped = mapProductDetail(detail);
    expect(mapped.variantGroups).toHaveLength(1);
    expect(mapped.variantGroups[0]?.variants.map((v) => v.name)).toEqual(['Quarter', 'Full']);
    expect(mapped.variantGroups[0]?.variants[1]?.priceModifier).toBe(400);
  });

  it('keeps only available add-ons and falls back to the product name for image alt text', () => {
    const mapped = mapProductDetail(detail);
    expect(mapped.addons).toEqual([{ id: 'a1', name: 'Raita', price: 50 }]);
    expect(mapped.images).toEqual([
      { url: '/a.jpg', alt: 'Plated tikka' },
      { url: '/b.jpg', alt: 'Chicken Tikka' },
    ]);
    expect(mapped.categoryName).toBe('Chicken');
  });
});

describe('deals', () => {
  const dealRow: DealRow = {
    id: 'd1',
    slug: 'family-platter',
    nameEn: 'Family Platter',
    descriptionEn: null,
    imageUrl: null,
    price: decimal('1500'),
    startDate: null,
    endDate: new Date('2026-12-31T00:00:00Z'),
    isFeatured: true,
    items: [
      {
        quantity: 2,
        product: { nameEn: 'Chicken Tikka', basePrice: decimal('350'), discountPrice: null },
        variant: { nameEn: 'Full', priceModifier: decimal('100') },
      },
      {
        quantity: 4,
        product: { nameEn: 'Naan', basePrice: decimal('30'), discountPrice: decimal('25') },
        variant: null,
      },
    ],
  };

  it('computes the separate-purchase price from item prices, discounts and variants', () => {
    // (350 + 100) * 2 + 25 * 4 = 1000
    const mapped = mapDeal(dealRow);
    expect(mapped.originalPrice).toBe(1000);
    expect(mapped.price).toBe(1500);
    expect(mapped.endsAt).toBe('2026-12-31T00:00:00.000Z');
    expect(mapped.items).toEqual([
      { productName: 'Chicken Tikka', variantName: 'Full', quantity: 2 },
      { productName: 'Naan', variantName: null, quantity: 4 },
    ]);
  });

  it('has no end date when open-ended', () => {
    expect(mapDeal({ ...dealRow, endDate: null }).endsAt).toBeNull();
  });

  it('is live only inside its window', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(isDealLive({ startDate: null, endDate: null }, now)).toBe(true);
    expect(isDealLive({ startDate: new Date('2026-07-01'), endDate: null }, now)).toBe(false);
    expect(isDealLive({ startDate: null, endDate: new Date('2026-05-01') }, now)).toBe(false);
    expect(
      isDealLive({ startDate: new Date('2026-05-01'), endDate: new Date('2026-07-01') }, now),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { DealSummary, ProductDetail } from '@/features/menu/types/menu.types';
import { dealSchema, productSchema, restaurantSchema } from './structured-data';

const product: ProductDetail = {
  id: 'p1',
  slug: 'chicken-tikka',
  name: 'Chicken Tikka',
  description: 'Char-grilled',
  categorySlug: 'chicken',
  categoryName: 'Chicken',
  price: 350,
  originalPrice: null,
  thumbnailUrl: null,
  preparationTime: 15,
  isFeatured: false,
  isPopular: false,
  orderable: true,
  stockStatus: 'IN_STOCK',
  images: [{ url: 'https://res.cloudinary.com/x/a.jpg', alt: 'Tikka' }],
  variantGroups: [],
  addons: [],
};

const deal: DealSummary = {
  id: 'd1',
  slug: 'family-platter',
  name: 'Family Platter',
  description: null,
  imageUrl: null,
  price: 1500,
  originalPrice: 2000,
  isFeatured: true,
  endsAt: null,
  items: [],
};

describe('restaurantSchema', () => {
  it('describes the restaurant with overnight opening hours', () => {
    const schema = restaurantSchema('https://bbqstore.pk');
    expect(schema).toMatchObject({
      '@type': 'Restaurant',
      url: 'https://bbqstore.pk',
      address: { addressLocality: 'Lahore', addressCountry: 'PK' },
    });
    const [hours] = schema['openingHoursSpecification'] as { dayOfWeek: string[]; opens: string }[];
    expect(hours?.dayOfWeek).toHaveLength(7);
    expect(hours).toMatchObject({ opens: '18:00', closes: '02:00' });
  });
});

describe('productSchema', () => {
  it('includes an in-stock offer in PKR with the page URL', () => {
    expect(productSchema(product, 'https://bbqstore.pk')).toMatchObject({
      '@type': 'Product',
      url: 'https://bbqstore.pk/menu/chicken-tikka',
      image: ['https://res.cloudinary.com/x/a.jpg'],
      offers: { priceCurrency: 'PKR', price: '350.00', availability: 'https://schema.org/InStock' },
    });
  });

  it('reports out-of-stock items and omits missing description and images', () => {
    const schema = productSchema(
      { ...product, orderable: false, description: null, images: [] },
      'https://bbqstore.pk',
    );
    expect(schema).not.toHaveProperty('description');
    expect(schema).not.toHaveProperty('image');
    expect(schema['offers']).toMatchObject({ availability: 'https://schema.org/OutOfStock' });
  });
});

describe('dealSchema', () => {
  it('has a price and only sets priceValidUntil when the deal ends', () => {
    expect(dealSchema(deal, 'https://bbqstore.pk')['offers']).not.toHaveProperty('priceValidUntil');
    const ending = dealSchema(
      { ...deal, endsAt: '2026-12-31T00:00:00.000Z' },
      'https://bbqstore.pk',
    );
    expect(ending['offers']).toMatchObject({
      price: '1500.00',
      priceValidUntil: '2026-12-31T00:00:00.000Z',
    });
  });
});

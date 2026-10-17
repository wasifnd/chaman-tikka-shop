import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES, filterMenu, matchesQuery } from './filter';
import type { MenuCategory, MenuProduct } from './types/menu.types';

const product = (name: string, description: string | null = null): MenuProduct => ({
  id: name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  description,
  categorySlug: 'x',
  price: 100,
  originalPrice: null,
  thumbnailUrl: null,
  preparationTime: 10,
  isFeatured: false,
  isPopular: false,
  orderable: true,
  stockStatus: 'IN_STOCK',
});

const category = (slug: string, products: MenuProduct[]): MenuCategory => ({
  id: slug,
  slug,
  name: slug,
  description: null,
  imageUrl: null,
  isFeatured: false,
  products,
});

const menu = [
  category('chicken', [product('Chicken Tikka', 'Spicy and smoky'), product('Malai Boti')]),
  category('bread', [product('Garlic Naan'), product('Roghni Naan')]),
];

describe('matchesQuery', () => {
  it('matches everything for an empty or blank query', () => {
    expect(matchesQuery(product('A'), '')).toBe(true);
    expect(matchesQuery(product('A'), '   ')).toBe(true);
  });

  it('is case-insensitive and searches the description too', () => {
    expect(matchesQuery(product('Chicken Tikka'), 'TIKKA')).toBe(true);
    expect(matchesQuery(product('Chicken Tikka', 'Spicy and smoky'), 'smoky')).toBe(true);
  });

  it('requires every term to match', () => {
    expect(matchesQuery(product('Chicken Tikka'), 'chicken tikka')).toBe(true);
    expect(matchesQuery(product('Chicken Tikka'), 'chicken naan')).toBe(false);
  });
});

describe('filterMenu', () => {
  it('returns everything when unfiltered', () => {
    expect(filterMenu(menu, { category: ALL_CATEGORIES, query: '' })).toEqual(menu);
  });

  it('filters by category', () => {
    const result = filterMenu(menu, { category: 'bread', query: '' });
    expect(result.map((c) => c.slug)).toEqual(['bread']);
  });

  it('filters by query and drops categories that end up empty', () => {
    const result = filterMenu(menu, { category: ALL_CATEGORIES, query: 'naan' });
    expect(result.map((c) => c.slug)).toEqual(['bread']);
    expect(result[0]?.products).toHaveLength(2);
  });

  it('combines category and query, and returns nothing when nothing matches', () => {
    expect(filterMenu(menu, { category: 'chicken', query: 'naan' })).toEqual([]);
    expect(filterMenu(menu, { category: 'unknown', query: '' })).toEqual([]);
  });

  it('does not mutate the input', () => {
    filterMenu(menu, { category: ALL_CATEGORIES, query: 'naan' });
    expect(menu[0]?.products).toHaveLength(2);
  });
});

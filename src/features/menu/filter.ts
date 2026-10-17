import type { MenuCategory, MenuProduct } from './types/menu.types';

export const ALL_CATEGORIES = 'all';

export interface MenuFilter {
  /** A category slug, or ALL_CATEGORIES. */
  category: string;
  query: string;
}

/** Every term must appear in the name or description (case-insensitive). */
export function matchesQuery(product: MenuProduct, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${product.name} ${product.description ?? ''}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Keeps category grouping, drops products that don't match and categories left empty. */
export function filterMenu(
  categories: readonly MenuCategory[],
  { category, query }: MenuFilter,
): MenuCategory[] {
  return categories
    .filter((c) => category === ALL_CATEGORIES || c.slug === category)
    .map((c) => ({ ...c, products: c.products.filter((p) => matchesQuery(p, query)) }))
    .filter((c) => c.products.length > 0);
}

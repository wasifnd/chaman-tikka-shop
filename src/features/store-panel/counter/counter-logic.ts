import type { NewCartItem } from '@/features/cart/store/cart.logic';
import { calculateUnitPrice, type Selection } from '@/features/menu/pricing';
import type { DealSummary, ProductDetail } from '@/features/menu/types/menu.types';
import { fromMinor, toMinor } from '@/lib/money';

export type PaymentMode = 'FULL' | 'PART' | 'NONE';

/** Required option groups start on their first choice, so a quick tap adds a sensible default. */
export function defaultSelection(product: ProductDetail): Selection {
  const variants: Record<string, string | undefined> = {};
  for (const group of product.variantGroups) {
    if (group.isRequired) variants[group.id] = group.variants[0]?.id;
  }
  return { variants, addonIds: [] };
}

/** A product with nothing to choose goes straight onto the ticket. */
export const needsChoices = (product: ProductDetail): boolean =>
  product.variantGroups.length > 0 || product.addons.length > 0;

/** The ticket line for a product and its chosen options. */
export function productLine(
  product: ProductDetail,
  selection: Selection,
  quantity: number,
): NewCartItem {
  const variants = product.variantGroups.flatMap((group) => {
    const chosen = group.variants.find((v) => v.id === selection.variants[group.id]);
    return chosen ? [chosen] : [];
  });
  const addons = product.addons.filter((addon) => selection.addonIds.includes(addon.id));
  return {
    kind: 'product',
    productId: product.id,
    name: product.name,
    unitPrice: calculateUnitPrice(product.price, product.variantGroups, product.addons, selection),
    quantity,
    variantIds: variants.map((v) => v.id),
    addonIds: addons.map((a) => a.id),
    optionLabels: [...variants.map((v) => v.name), ...addons.map((a) => a.name)],
  };
}

export const dealLine = (deal: DealSummary): NewCartItem => ({
  kind: 'deal',
  dealId: deal.id,
  name: deal.name,
  unitPrice: deal.price,
  quantity: 1,
});

/** Case-insensitive match on name; an empty search shows everything. */
export function matches(name: string, search: string): boolean {
  const text = search.trim().toLowerCase();
  return text === '' || name.toLowerCase().includes(text);
}

/**
 * What the cashier collects now and what goes on the khata, from the chosen mode. A part
 * payment typed above the total is capped at the total (change is given at the till).
 */
export function paymentSplit(
  total: number,
  mode: PaymentMode,
  typed: string,
): { paid: number; remaining: number; valid: boolean } {
  if (mode === 'FULL') return { paid: total, remaining: 0, valid: true };
  if (mode === 'NONE') return { paid: 0, remaining: total, valid: total > 0 };
  const amount = Number(typed);
  const valid = typed.trim() !== '' && Number.isFinite(amount) && amount > 0;
  const paidMinor = valid ? Math.min(toMinor(amount), toMinor(total)) : 0;
  const paid = fromMinor(paidMinor);
  return {
    paid,
    remaining: fromMinor(toMinor(total) - paidMinor),
    valid: valid && paidMinor < toMinor(total),
  };
}

/** Room left on a khata before it hits its limit (never negative). */
export const roomLeft = (balance: number, limit: number): number =>
  Math.max(0, fromMinor(toMinor(limit) - toMinor(balance)));

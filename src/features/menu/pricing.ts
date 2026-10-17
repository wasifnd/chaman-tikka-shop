import { fromMinor, toMinor } from '@/lib/money';
import type { AddonOption, VariantGroup } from './types/menu.types';

export interface Selection {
  /** groupId -> chosen variantId */
  variants: Record<string, string | undefined>;
  addonIds: readonly string[];
}

/** The price a customer pays before options: a discount only counts if it is actually lower. */
export function effectivePrice(basePrice: number, discountPrice: number | null): number {
  return discountPrice !== null && discountPrice < basePrice ? discountPrice : basePrice;
}

/**
 * Unit price for one item: base + chosen variant modifiers + chosen add-ons.
 * Shared by the product page (live price) and the server-side quote, so the number the
 * customer sees is computed the same way as the number they are charged.
 * Summed in whole paisa so totals are exact.
 */
export function calculateUnitPrice(
  basePrice: number,
  groups: readonly VariantGroup[],
  addons: readonly AddonOption[],
  selection: Selection,
): number {
  let total = toMinor(basePrice);
  for (const group of groups) {
    const chosen = selection.variants[group.id];
    const modifier = group.variants.find((variant) => variant.id === chosen)?.priceModifier ?? 0;
    total += toMinor(modifier);
  }
  for (const addon of addons) {
    if (selection.addonIds.includes(addon.id)) total += toMinor(addon.price);
  }
  return fromMinor(total);
}

/** Names of required groups that still need a choice (empty array means ready to order). */
export function missingRequiredGroups(
  groups: readonly VariantGroup[],
  selection: Selection,
): string[] {
  return groups
    .filter((group) => group.isRequired && !selection.variants[group.id])
    .map((group) => group.name);
}

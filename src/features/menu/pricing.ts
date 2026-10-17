import type { AddonOption, VariantGroup } from './types/menu.types';

export interface Selection {
  /** groupId -> chosen variantId */
  variants: Record<string, string | undefined>;
  addonIds: readonly string[];
}

/**
 * Unit price for one item: base + chosen variant modifiers + chosen add-ons.
 * Shared by the product page (live price) and, later, the server-side checkout so the
 * number the customer sees is computed the same way as the number they are charged.
 */
export function calculateUnitPrice(
  basePrice: number,
  groups: readonly VariantGroup[],
  addons: readonly AddonOption[],
  selection: Selection,
): number {
  let total = basePrice;
  for (const group of groups) {
    const chosen = selection.variants[group.id];
    total += group.variants.find((variant) => variant.id === chosen)?.priceModifier ?? 0;
  }
  for (const addon of addons) {
    if (selection.addonIds.includes(addon.id)) total += addon.price;
  }
  return total;
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

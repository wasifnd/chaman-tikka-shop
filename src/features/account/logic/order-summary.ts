const SHOWN = 2;

/** "2 × Chicken Tikka, 4 × Naan" plus a count of the rest: enough to recognise an order at a glance. */
export function summarizeItems(items: { name: string; quantity: number }[]): {
  shown: string[];
  more: number;
} {
  return {
    shown: items.slice(0, SHOWN).map((item) => `${String(item.quantity)} × ${item.name}`),
    more: Math.max(0, items.length - SHOWN),
  };
}

export const ORDERS_PAGE_SIZE = 10;

/** Number of pages for a result set; always at least one, so an empty list still has page 1. */
export function pageCount(total: number, pageSize = ORDERS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

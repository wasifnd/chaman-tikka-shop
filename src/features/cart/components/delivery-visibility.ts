import type { OrderType, Quote } from '@/features/checkout/types/quote.types';

/**
 * Whether to show a delivery line in the price summary. Until a valid delivery area is chosen the
 * charge is unknown, so showing "Free" would mislead.
 */
export function shouldShowDelivery(
  orderType: OrderType,
  zoneId: string | null,
  quote: Pick<Quote, 'issues'> | undefined,
): boolean {
  if (orderType !== 'DELIVERY' || zoneId === null) return false;
  const areaProblem = (quote?.issues ?? []).some(
    (issue) => issue.code === 'ZONE_REQUIRED' || issue.code === 'ZONE_INVALID',
  );
  return !areaProblem;
}

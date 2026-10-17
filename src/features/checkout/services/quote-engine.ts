import { isOpenAt } from '@/features/hours/business-hours';
import { calculateUnitPrice, effectivePrice } from '@/features/menu/pricing';
import { isDealLive } from '@/features/menu/services/menu.mappers';
import { fromMinor, percentOf, toMinor } from '@/lib/money';
import type {
  CouponData,
  CouponResult,
  DealData,
  DealLineInput,
  ProductData,
  ProductLineInput,
  Quote,
  QuoteData,
  QuoteInput,
  QuoteIssue,
  QuoteLine,
} from '../types/quote.types';

const issue = (code: QuoteIssue['code'], message: string, lineIndex?: number): QuoteIssue =>
  lineIndex === undefined ? { code, message } : { code, message, lineIndex };

export function isProductOrderable(product: ProductData): boolean {
  return (
    product.isActive &&
    product.categoryActive &&
    product.isAvailable &&
    product.stockStatus !== 'OUT_OF_STOCK'
  );
}

interface LineResult {
  line?: QuoteLine;
  lineTotalMinor: number;
  issues: QuoteIssue[];
}

function priceProductLine(
  input: ProductLineInput,
  lineIndex: number,
  product: ProductData | undefined,
): LineResult {
  const fail = (...issues: QuoteIssue[]): LineResult => ({ lineTotalMinor: 0, issues });

  if (!product)
    return fail(issue('PRODUCT_NOT_FOUND', 'An item in your cart no longer exists.', lineIndex));
  if (!isProductOrderable(product)) {
    return fail(
      issue('PRODUCT_UNAVAILABLE', `${product.name} is not available right now.`, lineIndex),
    );
  }
  // A required choice with nothing left to choose can never be satisfied.
  if (product.variantGroups.some((g) => g.isRequired && !g.variants.some((v) => v.isAvailable))) {
    return fail(
      issue('PRODUCT_UNAVAILABLE', `${product.name} is not available right now.`, lineIndex),
    );
  }

  const problems: QuoteIssue[] = [];
  const chosen: Record<string, string> = {};
  const optionNames: string[] = [];

  for (const variantId of input.variantIds) {
    const group = product.variantGroups.find((g) => g.variants.some((v) => v.id === variantId));
    const variant = group?.variants.find((v) => v.id === variantId);
    if (!group || !variant || !variant.isAvailable) {
      problems.push(
        issue('INVALID_OPTION', `An option for ${product.name} is not available.`, lineIndex),
      );
    } else if (chosen[group.id]) {
      problems.push(
        issue('INVALID_OPTION', `Choose only one ${group.name} for ${product.name}.`, lineIndex),
      );
    } else {
      chosen[group.id] = variant.id;
      optionNames.push(variant.name);
    }
  }

  for (const group of product.variantGroups) {
    if (group.isRequired && !chosen[group.id]) {
      problems.push(
        issue('MISSING_REQUIRED_OPTION', `Choose ${group.name} for ${product.name}.`, lineIndex),
      );
    }
  }

  const addonIds = new Set<string>();
  for (const addonId of input.addonIds) {
    const addon = product.addons.find((a) => a.id === addonId);
    if (!addon || !addon.isAvailable || addonIds.has(addonId)) {
      problems.push(
        issue('INVALID_OPTION', `An add-on for ${product.name} is not available.`, lineIndex),
      );
    } else {
      addonIds.add(addonId);
      optionNames.push(addon.name);
    }
  }
  if (problems.length > 0) return fail(...problems);

  const unitPrice = calculateUnitPrice(
    effectivePrice(product.basePrice, product.discountPrice),
    product.variantGroups,
    product.addons,
    { variants: chosen, addonIds: [...addonIds] },
  );
  if (unitPrice < 0) {
    return fail(issue('INVALID_OPTION', `${product.name} has an invalid price.`, lineIndex));
  }

  const lineTotalMinor = toMinor(unitPrice) * input.quantity;
  return {
    lineTotalMinor,
    issues: [],
    line: {
      lineIndex,
      kind: 'product',
      id: product.id,
      name: product.name,
      options: optionNames,
      quantity: input.quantity,
      unitPrice,
      lineTotal: fromMinor(lineTotalMinor),
      ...(input.note ? { note: input.note } : {}),
    },
  };
}

function priceDealLine(
  input: DealLineInput,
  lineIndex: number,
  deal: DealData | undefined,
  now: Date,
): LineResult {
  if (!deal) {
    return {
      lineTotalMinor: 0,
      issues: [issue('DEAL_NOT_FOUND', 'A deal in your cart no longer exists.', lineIndex)],
    };
  }
  if (!deal.isActive || !deal.isAvailable || !isDealLive(deal, now) || !deal.itemsOrderable) {
    return {
      lineTotalMinor: 0,
      issues: [issue('DEAL_UNAVAILABLE', `${deal.name} is not available right now.`, lineIndex)],
    };
  }
  const unitMinor = toMinor(deal.price);
  const lineTotalMinor = unitMinor * input.quantity;
  return {
    lineTotalMinor,
    issues: [],
    line: {
      lineIndex,
      kind: 'deal',
      id: deal.id,
      name: deal.name,
      options: [],
      quantity: input.quantity,
      unitPrice: fromMinor(unitMinor),
      lineTotal: fromMinor(lineTotalMinor),
    },
  };
}

function applyCoupon(
  code: string,
  coupon: CouponData | null,
  subtotalMinor: number,
  customerId: string | null | undefined,
  now: Date,
): { result: CouponResult; discountMinor: number } {
  const normalized = code.trim().toUpperCase();
  const reject = (reason: NonNullable<CouponResult['reason']>) => ({
    discountMinor: 0,
    result: { code: normalized, applied: false, reason, discount: 0 },
  });

  if (!coupon) return reject('NOT_FOUND');
  if (coupon.customerId) {
    // A coupon issued to one customer: don't reveal it exists to anyone else.
    if (!customerId) return reject('LOGIN_REQUIRED');
    if (coupon.customerId !== customerId) return reject('NOT_FOUND');
  }
  if (!coupon.isActive) return reject('INACTIVE');
  if (coupon.expiresAt && coupon.expiresAt <= now) return reject('EXPIRED');
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return reject('USAGE_LIMIT');
  }
  if (subtotalMinor < toMinor(coupon.minimumOrderAmount) || subtotalMinor === 0) {
    return reject('MIN_ORDER');
  }

  const raw =
    coupon.type === 'PERCENTAGE'
      ? percentOf(subtotalMinor, Math.min(100, Math.max(0, coupon.amount)))
      : toMinor(coupon.amount);
  // A coupon can never take more than the food costs.
  const discountMinor = Math.min(Math.max(0, raw), subtotalMinor);
  return {
    discountMinor,
    result: { code: normalized, applied: true, discount: fromMinor(discountMinor) },
  };
}

/**
 * Prices a cart from trusted data. Pure: same input, same quote. Everything the customer is
 * charged comes from here, never from numbers the browser sends.
 */
export function buildQuote(input: QuoteInput, data: QuoteData, now: Date): Quote {
  const issues: QuoteIssue[] = [];
  const lines: QuoteLine[] = [];
  let subtotalMinor = 0;

  if (input.lines.length === 0) issues.push(issue('EMPTY_CART', 'Your cart is empty.'));

  input.lines.forEach((line, index) => {
    const result =
      line.kind === 'product'
        ? priceProductLine(line, index, data.products.get(line.productId))
        : priceDealLine(line, index, data.deals.get(line.dealId), now);
    issues.push(...result.issues);
    if (result.line) {
      lines.push(result.line);
      subtotalMinor += result.lineTotalMinor;
    }
  });

  const coupon = input.couponCode
    ? applyCoupon(input.couponCode, data.coupon, subtotalMinor, input.customerId, now)
    : null;
  const couponDiscountMinor = coupon?.discountMinor ?? 0;

  let deliveryChargeMinor = 0;
  let freeDeliveryRemainingMinor: number | null = null;
  if (input.orderType === 'DELIVERY' && lines.length > 0) {
    const zone = data.zone;
    if (!input.zoneId) {
      issues.push(issue('ZONE_REQUIRED', 'Choose your delivery area.'));
    } else if (!zone || zone.id !== input.zoneId || !zone.isActive) {
      issues.push(issue('ZONE_INVALID', 'We do not deliver to that area.'));
    } else {
      const freeAbove = zone.freeDeliveryAbove === null ? null : toMinor(zone.freeDeliveryAbove);
      // Free delivery is judged on the food total before any coupon.
      const isFree = freeAbove !== null && subtotalMinor >= freeAbove;
      deliveryChargeMinor = isFree ? 0 : toMinor(zone.charge);
      if (freeAbove !== null && !isFree) freeDeliveryRemainingMinor = freeAbove - subtotalMinor;
      if (subtotalMinor < toMinor(zone.minOrderAmount)) {
        issues.push(
          issue(
            'BELOW_MINIMUM',
            `The minimum order for ${zone.name} is Rs. ${String(zone.minOrderAmount)}.`,
          ),
        );
      }
    }
  }

  if (!data.settings.orderingEnabled) {
    issues.push(issue('ORDERING_DISABLED', 'Online ordering is paused right now.'));
  } else if (!isOpenAt(data.hours, now)) {
    issues.push(issue('RESTAURANT_CLOSED', 'We are closed right now.'));
  }

  const taxableMinor = subtotalMinor - couponDiscountMinor;
  const taxMinor = percentOf(taxableMinor, data.settings.taxRatePercent);
  const grandTotalMinor = taxableMinor + deliveryChargeMinor + taxMinor;

  return {
    lines,
    subtotal: fromMinor(subtotalMinor),
    couponDiscount: fromMinor(couponDiscountMinor),
    deliveryCharge: fromMinor(deliveryChargeMinor),
    taxAmount: fromMinor(taxMinor),
    grandTotal: fromMinor(grandTotalMinor),
    coupon: coupon?.result ?? null,
    freeDeliveryRemaining:
      freeDeliveryRemainingMinor === null ? null : fromMinor(freeDeliveryRemainingMinor),
    issues,
    canCheckout: issues.length === 0,
  };
}

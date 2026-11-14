import type { Quote, QuoteData, QuoteLine } from '@/features/checkout/types/quote.types';
import type { CounterOrderRequest } from '../schemas/counter-order.schema';
import type { PlaceOrderRequest } from '../schemas/place-order.schema';
import type { OrderType } from '../state-machine';
import type { OrderItemRecord, OrderRecord, PaymentMethod } from '../types/order.types';

/** Extra minutes on top of the slowest item for plating and handing over. */
export const READY_BUFFER_MINUTES = 5;

/** Delivery is paid on arrival, everything else at the counter. The customer doesn't choose. */
export function paymentMethodFor(type: OrderType): PaymentMethod {
  return type === 'DELIVERY' ? 'COD' : 'CASH_AT_RESTAURANT';
}

/** When the kitchen expects to finish: now + the slowest line + a small buffer. */
export function estimateReadyAt(now: Date, lines: readonly QuoteLine[]): Date {
  const slowest = Math.max(0, ...lines.map((line) => line.preparationTime));
  return new Date(now.getTime() + (slowest + READY_BUFFER_MINUTES) * 60_000);
}

function toItemRecord(line: QuoteLine): OrderItemRecord {
  const isDeal = line.kind === 'deal';
  return {
    productId: isDeal ? null : line.id,
    dealId: isDeal ? line.id : null,
    name: line.name,
    // For deals this holds what is inside the deal, so the kitchen knows what to make.
    variantSnapshot: isDeal ? line.dealItems : line.variants,
    addonSnapshot: isDeal ? null : line.addons,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    subtotal: line.lineTotal,
    note: line.note ?? null,
  };
}

interface BuildOrderRecordInput {
  quote: Quote;
  request: PlaceOrderRequest;
  data: QuoteData;
  customerId: string | null;
  phoneVerifiedAt?: Date | null;
  orderNumber: string;
  now: Date;
}

/**
 * Turns a priced quote into the rows to store. Every amount comes from the quote (computed by
 * the server); nothing money-related is read from the request.
 */
export function buildOrderRecord({
  quote,
  request,
  data,
  customerId,
  phoneVerifiedAt = null,
  orderNumber,
  now,
}: BuildOrderRecordInput): OrderRecord {
  let deliveryAddress: OrderRecord['deliveryAddress'] = null;
  if (request.orderType === 'DELIVERY') {
    if (!request.address || !data.zone) {
      throw new Error('A delivery order needs an address and a delivery area');
    }
    deliveryAddress = {
      line1: request.address.line1,
      line2: request.address.line2 ?? null,
      area: data.zone.name,
      city: 'Lahore',
      zoneId: data.zone.id,
    };
  }

  return {
    orderNumber,
    customerId,
    contact: {
      name: request.contact.name,
      phone: request.contact.phone,
      email: request.contact.email ?? null,
    },
    phoneVerifiedAt,
    type: request.orderType,
    status: 'RECEIVED',
    source: 'ONLINE',
    paymentStatus: 'PENDING',
    amountPaid: null,
    placedByUserId: null,
    deliveryAddress,
    subtotal: quote.subtotal,
    couponDiscount: quote.couponDiscount,
    deliveryCharge: quote.deliveryCharge,
    taxAmount: quote.taxAmount,
    grandTotal: quote.grandTotal,
    couponId: quote.coupon?.applied ? (data.coupon?.id ?? null) : null,
    paymentMethod: paymentMethodFor(request.orderType),
    specialInstructions: request.instructions ?? null,
    estimatedReadyAt: estimateReadyAt(now, quote.lines),
    items: quote.lines.map(toItemRecord),
  };
}

interface BuildCounterRecordInput {
  quote: Quote;
  request: CounterOrderRequest;
  orderNumber: string;
  now: Date;
  staffUserId: string;
  /** What was paid at the till and what is left for the khata, already checked. */
  split: { paid: number; remaining: number };
}

/** A walk-in who paid in full doesn't have to give a name. */
export const WALK_IN_NAME = 'Walk-in customer';

/** The rows for an order taken at the counter. Prices come from the server's quote, as online. */
export function buildCounterRecord({
  quote,
  request,
  orderNumber,
  now,
  staffUserId,
  split,
}: BuildCounterRecordInput): OrderRecord {
  return {
    orderNumber,
    customerId: null,
    contact: {
      name: request.customer.name ?? WALK_IN_NAME,
      phone: request.customer.phone ?? null,
      email: null,
    },
    phoneVerifiedAt: null,
    type: request.orderType,
    status: 'CONFIRMED',
    source: 'COUNTER',
    paymentStatus: split.remaining > 0 ? 'ON_KHATA' : 'PAID',
    amountPaid: split.paid,
    placedByUserId: staffUserId,
    deliveryAddress: null,
    subtotal: quote.subtotal,
    couponDiscount: 0,
    deliveryCharge: 0,
    taxAmount: quote.taxAmount,
    grandTotal: quote.grandTotal,
    couponId: null,
    paymentMethod: 'CASH_AT_RESTAURANT',
    specialInstructions: request.instructions ?? null,
    estimatedReadyAt: estimateReadyAt(now, quote.lines),
    items: quote.lines.map(toItemRecord),
  };
}

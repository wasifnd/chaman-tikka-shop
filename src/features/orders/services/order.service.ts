import { buildQuote } from '@/features/checkout/services/quote-engine';
import type { Quote, QuoteInput } from '@/features/checkout/types/quote.types';
import {
  assertWithinLimit,
  balanceAfter,
  effectiveLimit,
  splitCounterPayment,
} from '@/features/khata/logic/khata-rules';
import { AppError } from '@/lib/errors';
import { toMinor } from '@/lib/money';
import type { CounterOrderRequest } from '../schemas/counter-order.schema';
import type { PlaceOrderRequest } from '../schemas/place-order.schema';
import type { PlacedCounterOrder, PlacedOrder } from '../types/order.types';
import { formatOrderNumber, orderYear } from './order-number';
import type { OrderTx, OrderStore } from './order.ports';
import { buildCounterRecord, buildOrderRecord } from './order-record';
import { hashRequest } from './request-hash';

export interface PlaceOrderContext {
  /** The account the order belongs to, if any. Never taken from the request body. */
  customerId: string | null;
  /** When the contact number was proven (checked by the caller); null if it wasn't. */
  phoneVerifiedAt?: Date | null;
}

/** At the counter the staff member decides whether the shop is open; these don't apply there. */
const COUNTER_IGNORES = new Set(['RESTAURANT_CLOSED', 'ORDERING_DISABLED']);

/**
 * Claims the idempotency key. Returns the earlier order's id when this request is a repeat, or
 * null when this request is the first and should go ahead.
 */
async function claimOrReplay(
  tx: OrderTx,
  key: string,
  requestHash: string,
): Promise<string | null> {
  const claim = await tx.claimIdempotencyKey(key, requestHash);
  if (claim.claimed) return null;
  if (claim.requestHash !== requestHash) {
    throw new AppError(
      'IDEMPOTENCY_CONFLICT',
      'This request key was already used for a different order.',
      409,
    );
  }
  if (!claim.orderId) {
    throw new AppError(
      'ORDER_IN_PROGRESS',
      'This order is still being placed. Please wait a moment.',
      409,
    );
  }
  return claim.orderId;
}

/** Prices the cart on the server and refuses when something blocks it or the total moved. */
async function priceOrRefuse(
  tx: OrderTx,
  input: QuoteInput,
  expectedTotal: number,
  at: Date,
  ignore: ReadonlySet<string> = new Set(),
) {
  const data = await tx.loadQuoteData(input);
  const quote: Quote = buildQuote(input, data, at);
  const blocking = quote.issues.filter((issue) => !ignore.has(issue.code));
  if (blocking.length > 0) {
    const details: Record<string, string> = {};
    for (const issue of blocking) details[issue.code] ??= issue.message;
    throw new AppError('CART_INVALID', 'Some items in your cart need attention.', 409, details);
  }
  if (toMinor(quote.grandTotal) !== toMinor(expectedTotal)) {
    throw new AppError(
      'PRICE_CHANGED',
      'The price changed while you were checking out. Please review your order.',
      409,
      { total: String(quote.grandTotal) },
    );
  }
  return { quote, data };
}

/**
 * Places orders. Everything happens in one transaction, so a failure at any step leaves nothing
 * behind: no half-written order, no consumed coupon, no skipped order number, no khata entry.
 *
 *  1. Claim the idempotency key (a retry of the same request returns the same order).
 *  2. Price the cart again on the server and refuse if anything blocks it.
 *  3. Refuse if the total differs from what the customer (or cashier) saw.
 *  4. Use one coupon redemption, atomically (online only).
 *  5. Take the next order number and write the order, its history and its event.
 *  6. Counter orders only: put whatever wasn't paid on the customer's khata, within its limit.
 */
export function createOrderService(store: OrderStore, now: () => Date = () => new Date()) {
  return {
    async place(request: PlaceOrderRequest, context: PlaceOrderContext): Promise<PlacedOrder> {
      const { idempotencyKey, ...rest } = request;
      const requestHash = hashRequest(rest);
      const quoteInput: QuoteInput = {
        lines: request.lines,
        orderType: request.orderType,
        zoneId: request.zoneId,
        couponCode: request.couponCode,
        customerId: context.customerId,
      };

      return store.transaction(async (tx) => {
        const earlier = await claimOrReplay(tx, idempotencyKey, requestHash);
        if (earlier) return { ...(await tx.findPlacedOrder(earlier)), replayed: true };

        const at = now();
        const { quote, data } = await priceOrRefuse(tx, quoteInput, request.expectedTotal, at);

        if (quote.coupon?.applied && data.coupon) {
          if (!(await tx.redeemCoupon(data.coupon.id, at))) {
            throw new AppError(
              'COUPON_EXHAUSTED',
              'That coupon has just been fully used. Please review your order.',
              409,
            );
          }
        }

        const sequence = await tx.nextOrderSequence(orderYear(at));
        const record = buildOrderRecord({
          quote,
          request,
          data,
          customerId: context.customerId,
          phoneVerifiedAt: context.phoneVerifiedAt ?? null,
          orderNumber: formatOrderNumber(orderYear(at), sequence),
          now: at,
        });
        const created = await tx.createOrder(record);
        await tx.recordOrderCreated(created.id, at);
        await tx.completeIdempotencyKey(idempotencyKey, created.id);

        return {
          id: created.id,
          orderNumber: record.orderNumber,
          trackingToken: created.trackingToken,
          status: 'RECEIVED',
          type: record.type,
          grandTotal: record.grandTotal,
          estimatedReadyAt: record.estimatedReadyAt,
          replayed: false,
        };
      });
    },

    /**
     * An order taken by staff at the counter. It starts accepted (the cashier took it), and
     * whatever the customer didn't pay goes on the khata for their phone number.
     */
    async placeAtCounter(
      request: CounterOrderRequest,
      { staffUserId }: { staffUserId: string },
    ): Promise<PlacedCounterOrder> {
      const { idempotencyKey, ...rest } = request;
      const requestHash = hashRequest(rest);
      const quoteInput: QuoteInput = { lines: request.lines, orderType: request.orderType };

      return store.transaction(async (tx) => {
        const earlier = await claimOrReplay(tx, idempotencyKey, requestHash);
        if (earlier) {
          return {
            ...(await tx.findPlacedOrder(earlier)),
            ...(await tx.findCounterSettlement(earlier)),
            replayed: true,
          };
        }

        const at = now();
        const { quote } = await priceOrRefuse(
          tx,
          quoteInput,
          request.expectedTotal,
          at,
          COUNTER_IGNORES,
        );
        const split = splitCounterPayment(quote.grandTotal, request.amountPaid);
        const { phone, name } = request.customer;
        if (split.remaining > 0 && (!phone || !name)) {
          throw new AppError(
            'KHATA_DETAILS_REQUIRED',
            'Enter the phone number and name to put the rest on a khata.',
            422,
            { 'customer.phone': 'Enter the phone number for the khata' },
          );
        }

        const sequence = await tx.nextOrderSequence(orderYear(at));
        const record = buildCounterRecord({
          quote,
          request,
          orderNumber: formatOrderNumber(orderYear(at), sequence),
          now: at,
          staffUserId,
          split,
        });
        const created = await tx.createOrder(record);
        await tx.recordOrderCreated(created.id, at, staffUserId);

        let khata: PlacedCounterOrder['khata'] = null;
        if (split.remaining > 0 && phone && name) {
          const locked = await tx.khata.lockOrOpen(phone, name);
          const limit = effectiveLimit(locked.creditLimit, await tx.khata.defaultLimit());
          assertWithinLimit(locked.balance, split.remaining, limit);
          const after = balanceAfter(locked.balance, split.remaining);
          await tx.khata.addEntry({
            khataId: locked.id,
            kind: 'ORDER',
            amount: split.remaining,
            balanceAfter: after,
            orderId: created.id,
            note: `Order ${record.orderNumber}`,
            userId: staffUserId,
            // Timed after the lock: a payment that got the lock first is then also earlier.
            at: now(),
          });
          khata = { id: locked.id, balance: after };
        }
        await tx.completeIdempotencyKey(idempotencyKey, created.id);

        return {
          id: created.id,
          orderNumber: record.orderNumber,
          trackingToken: created.trackingToken,
          status: 'CONFIRMED',
          type: record.type,
          grandTotal: record.grandTotal,
          estimatedReadyAt: record.estimatedReadyAt,
          amountPaid: split.paid,
          remaining: split.remaining,
          khata,
          replayed: false,
        };
      });
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;

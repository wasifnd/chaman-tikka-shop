import { buildQuote } from '@/features/checkout/services/quote-engine';
import type { QuoteInput } from '@/features/checkout/types/quote.types';
import { AppError } from '@/lib/errors';
import { toMinor } from '@/lib/money';
import type { PlaceOrderRequest } from '../schemas/place-order.schema';
import type { PlacedOrder } from '../types/order.types';
import { formatOrderNumber, orderYear } from './order-number';
import type { OrderStore } from './order.ports';
import { buildOrderRecord } from './order-record';
import { hashRequest } from './request-hash';

export interface PlaceOrderContext {
  /** The signed-in customer, if any. Never taken from the request body. */
  customerId: string | null;
}

/**
 * Places an order. Everything happens in one transaction, so a failure at any step leaves nothing
 * behind: no half-written order, no consumed coupon, no skipped order number.
 *
 *  1. Claim the idempotency key (a retry of the same request returns the same order).
 *  2. Price the cart again on the server and refuse if anything blocks it.
 *  3. Refuse if the total differs from what the customer saw.
 *  4. Use one coupon redemption, atomically.
 *  5. Take the next order number and write the order, its history and its event.
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
        const claim = await tx.claimIdempotencyKey(idempotencyKey, requestHash);
        if (!claim.claimed) {
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
          return { ...(await tx.findPlacedOrder(claim.orderId)), replayed: true };
        }

        const at = now();
        const data = await tx.loadQuoteData(quoteInput);
        const quote = buildQuote(quoteInput, data, at);

        if (!quote.canCheckout) {
          const details: Record<string, string> = {};
          for (const issue of quote.issues) details[issue.code] ??= issue.message;
          throw new AppError(
            'CART_INVALID',
            'Some items in your cart need attention.',
            409,
            details,
          );
        }

        if (toMinor(quote.grandTotal) !== toMinor(request.expectedTotal)) {
          throw new AppError(
            'PRICE_CHANGED',
            'The price changed while you were checking out. Please review your order.',
            409,
            { total: String(quote.grandTotal) },
          );
        }

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
  };
}

export type OrderService = ReturnType<typeof createOrderService>;

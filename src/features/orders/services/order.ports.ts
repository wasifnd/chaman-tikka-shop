import type { QuoteData, QuoteInput } from '@/features/checkout/types/quote.types';
import type { KhataTx } from '@/features/khata/services/khata.ports';
import type { OrderRecord, PlacedOrder } from '../types/order.types';

export type IdempotencyClaim =
  | { claimed: true }
  | {
      claimed: false;
      /** Fingerprint of the request that claimed this key first. */
      requestHash: string;
      /** The order it produced, or null while that request is still running. */
      orderId: string | null;
    };

/** Everything the place-order flow needs from storage, inside one database transaction. */
export interface OrderTx {
  /** Claims the key for this request, or reports who already holds it. Never throws on a duplicate. */
  claimIdempotencyKey(key: string, requestHash: string): Promise<IdempotencyClaim>;
  loadQuoteData(input: QuoteInput): Promise<QuoteData>;
  /** Uses one redemption. Returns false when the limit was already reached or the coupon expired. */
  redeemCoupon(couponId: string, now: Date): Promise<boolean>;
  /** The next order number for the year. Atomic: two callers never get the same value. */
  nextOrderSequence(year: number): Promise<number>;
  createOrder(record: OrderRecord): Promise<{ id: string; trackingToken: string }>;
  /**
   * Writes the first status-history row and the "order created" event. A counter order is also
   * recorded as accepted by the staff member who took it.
   */
  recordOrderCreated(orderId: string, at: Date, acceptedBy?: string | null): Promise<void>;
  completeIdempotencyKey(key: string, orderId: string): Promise<void>;
  findPlacedOrder(orderId: string): Promise<Omit<PlacedOrder, 'replayed'>>;
  /** The khata step of a counter order, in the same transaction as the order. */
  khata: KhataTx;
  /** What a counter order put on a khata, for answering a repeated request. */
  findCounterSettlement(orderId: string): Promise<{
    amountPaid: number;
    remaining: number;
    khata: { id: string; balance: number } | null;
  }>;
}

export interface OrderStore {
  /** Runs `work` atomically: if it throws, nothing it did is kept. */
  transaction<T>(work: (tx: OrderTx) => Promise<T>): Promise<T>;
}

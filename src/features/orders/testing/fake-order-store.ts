import type { QuoteData } from '@/features/checkout/types/quote.types';
import type { IdempotencyClaim, OrderStore, OrderTx } from '../services/order.ports';
import type { OrderRecord, PlacedOrder } from '../types/order.types';

interface StoredOrder extends OrderRecord {
  id: string;
  trackingToken: string;
}

interface FakeState {
  keys: Map<string, { requestHash: string; orderId: string | null }>;
  counters: Map<number, number>;
  orders: StoredOrder[];
  history: { orderId: string; status: string; at: Date }[];
  events: { orderId: string; type: string; at: Date }[];
  redemptions: Map<string, number>;
}

const emptyState = (): FakeState => ({
  keys: new Map(),
  counters: new Map(),
  orders: [],
  history: [],
  events: [],
  redemptions: new Map(),
});

function clone(state: FakeState): FakeState {
  return {
    keys: new Map([...state.keys].map(([k, v]) => [k, { ...v }])),
    counters: new Map(state.counters),
    orders: [...state.orders],
    history: [...state.history],
    events: [...state.events],
    redemptions: new Map(state.redemptions),
  };
}

export interface FakeOrderStoreOptions {
  data: () => QuoteData;
  /** How many times each coupon may still be redeemed (undefined means unlimited). */
  couponRemaining?: Record<string, number>;
  /** Throw from this step, to prove the transaction rolls back. */
  failAt?: 'createOrder' | 'recordOrderCreated' | 'completeIdempotencyKey';
}

/**
 * In-memory stand-in for the database. `transaction` snapshots the state and restores it if the
 * work throws, which is the behaviour the real transaction guarantees. It runs one transaction at
 * a time, so true concurrency is covered by the real-database tests instead.
 */
export function createFakeOrderStore(options: FakeOrderStoreOptions) {
  let state = emptyState();
  let seq = 0;
  const calls: string[] = [];

  const tx: OrderTx = {
    claimIdempotencyKey(key, requestHash): Promise<IdempotencyClaim> {
      calls.push('claim');
      const existing = state.keys.get(key);
      if (existing) {
        return Promise.resolve({
          claimed: false,
          requestHash: existing.requestHash,
          orderId: existing.orderId,
        });
      }
      state.keys.set(key, { requestHash, orderId: null });
      return Promise.resolve({ claimed: true });
    },
    loadQuoteData() {
      calls.push('load');
      return Promise.resolve(options.data());
    },
    redeemCoupon(couponId) {
      calls.push('redeem');
      const remaining = options.couponRemaining?.[couponId];
      const used = state.redemptions.get(couponId) ?? 0;
      if (remaining !== undefined && used >= remaining) return Promise.resolve(false);
      state.redemptions.set(couponId, used + 1);
      return Promise.resolve(true);
    },
    nextOrderSequence(year) {
      calls.push('sequence');
      const next = (state.counters.get(year) ?? 0) + 1;
      state.counters.set(year, next);
      return Promise.resolve(next);
    },
    createOrder(record) {
      calls.push('create');
      if (options.failAt === 'createOrder') return Promise.reject(new Error('disk full'));
      const stored: StoredOrder = {
        ...record,
        id: `order-${String(++seq)}`,
        trackingToken: `token-${String(seq)}`,
      };
      state.orders.push(stored);
      return Promise.resolve({ id: stored.id, trackingToken: stored.trackingToken });
    },
    recordOrderCreated(orderId, at) {
      calls.push('record');
      if (options.failAt === 'recordOrderCreated') return Promise.reject(new Error('event failed'));
      state.history.push({ orderId, status: 'RECEIVED', at });
      state.events.push({ orderId, type: 'order.created', at });
      return Promise.resolve();
    },
    completeIdempotencyKey(key, orderId) {
      calls.push('complete');
      if (options.failAt === 'completeIdempotencyKey') {
        return Promise.reject(new Error('key update failed'));
      }
      const entry = state.keys.get(key);
      if (entry) entry.orderId = orderId;
      return Promise.resolve();
    },
    findPlacedOrder(orderId): Promise<Omit<PlacedOrder, 'replayed'>> {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return Promise.reject(new Error('missing order'));
      return Promise.resolve({
        id: order.id,
        orderNumber: order.orderNumber,
        trackingToken: order.trackingToken,
        status: 'RECEIVED',
        type: order.type,
        grandTotal: order.grandTotal,
        estimatedReadyAt: order.estimatedReadyAt,
      });
    },
  };

  const store: OrderStore = {
    async transaction(work) {
      const snapshot = clone(state);
      try {
        return await work(tx);
      } catch (error) {
        state = snapshot;
        throw error;
      }
    },
  };

  return {
    store,
    calls,
    get state() {
      return state;
    },
    /** Mark a key as claimed by a request that has not finished yet. */
    claimInFlight(key: string, requestHash: string) {
      state.keys.set(key, { requestHash, orderId: null });
    },
  };
}

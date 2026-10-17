import type { OrderStatus, OrderType } from '@/features/orders/state-machine';
import type {
  LockedOrder,
  TransitionRecord,
  TransitionStore,
  TransitionTx,
} from '../services/transition.ports';

interface FakeOrder extends LockedOrder {
  paid: boolean;
}

interface FakeState {
  orders: Map<string, FakeOrder>;
  history: TransitionRecord[];
}

const clone = (state: FakeState): FakeState => ({
  orders: new Map([...state.orders].map(([id, order]) => [id, { ...order }])),
  history: [...state.history],
});

/**
 * In-memory stand-in for the database with the same rollback behaviour as a real transaction.
 * It runs one transaction at a time; true concurrency is covered by the real-database tests.
 */
export function createFakeTransitionStore(
  initial: { id: string; orderNumber?: string; type: OrderType; status: OrderStatus }[],
  options: { failOnApply?: boolean } = {},
) {
  let state: FakeState = {
    orders: new Map(
      initial.map((order) => [order.id, { orderNumber: `BBQ-${order.id}`, ...order, paid: false }]),
    ),
    history: [],
  };

  const tx: TransitionTx = {
    lockOrder(orderId) {
      const order = state.orders.get(orderId);
      return Promise.resolve(
        order
          ? { id: order.id, orderNumber: order.orderNumber, type: order.type, status: order.status }
          : null,
      );
    },
    applyTransition(record) {
      if (options.failOnApply) return Promise.reject(new Error('disk full'));
      const order = state.orders.get(record.orderId);
      if (!order) return Promise.reject(new Error('missing order'));
      order.status = record.to;
      if (record.markPaid) order.paid = true;
      state.history.push(record);
      return Promise.resolve();
    },
  };

  const store: TransitionStore = {
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
    get state() {
      return state;
    },
    statusOf: (id: string) => state.orders.get(id)?.status,
  };
}

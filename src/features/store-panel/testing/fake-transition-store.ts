import type { LockedKhata, NewKhataEntry } from '@/features/khata/services/khata.ports';
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
  khatas: Map<string, LockedKhata>;
  entries: NewKhataEntry[];
  /** Order id to the khata and amount it put on it. */
  charges: Map<string, { khataId: string; amount: number }>;
}

const clone = (state: FakeState): FakeState => ({
  orders: new Map([...state.orders].map(([id, order]) => [id, { ...order }])),
  history: [...state.history],
  khatas: new Map([...state.khatas].map(([id, k]) => [id, { ...k }])),
  entries: [...state.entries],
  charges: new Map(state.charges),
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
    khatas: new Map(),
    entries: [],
    charges: new Map(),
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
    khataChargeFor: (orderId) => Promise.resolve(state.charges.get(orderId) ?? null),
    khata: {
      lock(khataId) {
        const found = state.khatas.get(khataId);
        return Promise.resolve(found ? { ...found } : null);
      },
      lockOrOpen: () => Promise.reject(new Error('not used')),
      addEntry(entry) {
        state.entries.push(entry);
        const khata = state.khatas.get(entry.khataId);
        if (khata) khata.balance = entry.balanceAfter;
        return Promise.resolve({ id: `entry-${String(state.entries.length)}` });
      },
      findByRequestKey: () => Promise.resolve(null),
      defaultLimit: () => Promise.resolve(10_000),
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
    /** Put an order on a khata that now owes `balance`. */
    putOnKhata(orderId: string, amount: number, balance: number) {
      state.khatas.set('k1', {
        id: 'k1',
        phone: '03331234500',
        name: 'Bilal',
        balance,
        creditLimit: null,
      });
      state.charges.set(orderId, { khataId: 'k1', amount });
    },
  };
}

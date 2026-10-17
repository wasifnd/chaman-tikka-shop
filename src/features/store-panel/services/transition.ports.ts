import type { OrderStatus, OrderType } from '@/features/orders/state-machine';

export interface LockedOrder {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
}

export interface TransitionRecord {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  /** The staff member making the change, recorded in the order's history. */
  userId: string;
  note: string | null;
  at: Date;
  /** Cash is collected when an order completes, so completing it marks it paid. */
  markPaid: boolean;
}

/** What a status change needs from storage, inside one database transaction. */
export interface TransitionTx {
  /** Finds the order and blocks other changes to it until this transaction ends. */
  lockOrder(orderId: string): Promise<LockedOrder | null>;
  /** Updates the order and writes its history row and its live-update event. */
  applyTransition(record: TransitionRecord): Promise<void>;
}

export interface TransitionStore {
  transaction<T>(work: (tx: TransitionTx) => Promise<T>): Promise<T>;
}

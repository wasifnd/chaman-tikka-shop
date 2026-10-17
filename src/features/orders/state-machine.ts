export const ORDER_TYPES = ['DELIVERY', 'PICKUP', 'DINE_IN'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  'RECEIVED',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED',
  'SERVED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const COMMON: Record<'RECEIVED' | 'CONFIRMED' | 'PREPARING', readonly OrderStatus[]> = {
  RECEIVED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
};

// What can follow READY depends on how the customer receives the order.
const AFTER_READY: Record<OrderType, OrderStatus> = {
  DELIVERY: 'OUT_FOR_DELIVERY',
  PICKUP: 'PICKED',
  DINE_IN: 'SERVED',
};

const FINAL_STEP: Partial<Record<OrderStatus, OrderStatus>> = {
  OUT_FOR_DELIVERY: 'DELIVERED',
  DELIVERED: 'COMPLETED',
  PICKED: 'COMPLETED',
  SERVED: 'COMPLETED',
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED'];

export function allowedTransitions(type: OrderType, from: OrderStatus): readonly OrderStatus[] {
  if (from === 'RECEIVED' || from === 'CONFIRMED' || from === 'PREPARING') return COMMON[from];
  if (from === 'READY') return [AFTER_READY[type], 'CANCELLED'];
  const next = FINAL_STEP[from];
  // Once food has left the kitchen the order can no longer be cancelled.
  return next ? [next] : [];
}

export function canTransition(type: OrderType, from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions(type, from).includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly type: OrderType,
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Cannot move ${type} order from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(type: OrderType, from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(type, from, to)) throw new InvalidTransitionError(type, from, to);
}

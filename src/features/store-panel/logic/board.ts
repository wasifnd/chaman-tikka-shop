import {
  TERMINAL_STATUSES,
  allowedTransitions,
  type OrderStatus,
} from '@/features/orders/state-machine';
import type { StaffOrder } from '../types/staff-order.types';

export type ColumnId = 'new' | 'kitchen' | 'ready' | 'handover';

/** The board's columns, in the order staff work through them. */
export const COLUMNS: { id: ColumnId; statuses: readonly OrderStatus[] }[] = [
  { id: 'new', statuses: ['RECEIVED'] },
  { id: 'kitchen', statuses: ['CONFIRMED', 'PREPARING'] },
  { id: 'ready', statuses: ['READY'] },
  { id: 'handover', statuses: ['OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED', 'SERVED'] },
];

/** Active orders grouped into columns, oldest first so nothing gets buried. */
export function groupOrders(orders: readonly StaffOrder[]): Record<ColumnId, StaffOrder[]> {
  const grouped: Record<ColumnId, StaffOrder[]> = { new: [], kitchen: [], ready: [], handover: [] };
  for (const column of COLUMNS) {
    grouped[column.id] = orders
      .filter((order) => column.statuses.includes(order.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return grouped;
}

/** What the kitchen cooks: accepted orders that are not ready yet, oldest first. */
export function kitchenTickets(orders: readonly StaffOrder[]): StaffOrder[] {
  return orders
    .filter((order) => order.status === 'CONFIRMED' || order.status === 'PREPARING')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type ActionTone = 'primary' | 'danger';

export interface OrderAction {
  to: OrderStatus;
  /** Message key under "store.actions". */
  label: string;
  tone: ActionTone;
  /** Cancelling needs a typed reason. */
  needsReason: boolean;
}

/**
 * The buttons an order gets: exactly the moves the state machine allows from its current status.
 * The forward step is primary; cancelling is separate and asks for a reason.
 */
export function actionsFor(order: Pick<StaffOrder, 'type' | 'status'>): OrderAction[] {
  const actions = allowedTransitions(order.type, order.status).map<OrderAction>((to) =>
    to === 'CANCELLED'
      ? {
          to,
          label: order.status === 'RECEIVED' ? 'reject' : 'cancel',
          tone: 'danger',
          needsReason: true,
        }
      : { to, label: to, tone: 'primary', needsReason: false },
  );
  // Forward steps first, cancelling last.
  return actions.sort((a, b) => Number(a.tone === 'danger') - Number(b.tone === 'danger'));
}

export type Urgency = 'ok' | 'warn' | 'late';

const MINUTE = 60_000;

/** Minutes since the order was placed. */
export function ageMinutes(order: Pick<StaffOrder, 'createdAt'>, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(order.createdAt).getTime()) / MINUTE));
}

/**
 * How worried staff should be. A new order nobody has accepted turns amber after 2 minutes and red
 * after 5. Once accepted, it is judged against the promised ready time: amber in the last 5 minutes,
 * red once it is past. Finished or handed-over orders never alarm.
 */
export function urgencyFor(
  order: Pick<StaffOrder, 'status' | 'createdAt' | 'estimatedReadyAt'>,
  nowMs: number,
): Urgency {
  const age = ageMinutes(order, nowMs);
  if (order.status === 'RECEIVED') return age >= 5 ? 'late' : age >= 2 ? 'warn' : 'ok';

  if (order.status === 'CONFIRMED' || order.status === 'PREPARING' || order.status === 'READY') {
    if (order.estimatedReadyAt) {
      const untilReady = (new Date(order.estimatedReadyAt).getTime() - nowMs) / MINUTE;
      return untilReady < 0 ? 'late' : untilReady <= 5 ? 'warn' : 'ok';
    }
    return age >= 30 ? 'late' : age >= 20 ? 'warn' : 'ok';
  }
  return 'ok';
}

/** "just now", "7 min", "1 h 05 min". */
export function formatAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  return `${String(hours)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * Applies a status change to the list right away (before the server confirms), so buttons feel
 * instant. Finished orders leave the active list.
 */
export function withStatus(
  orders: readonly StaffOrder[],
  orderId: string,
  status: OrderStatus,
): StaffOrder[] {
  const finished = TERMINAL_STATUSES.includes(status);
  return orders.flatMap((order) => {
    if (order.id !== orderId) return [order];
    return finished ? [] : [{ ...order, status }];
  });
}

/** Number of orders waiting to be accepted, shown in the page title so it works in a background tab. */
export function newOrderCount(orders: readonly StaffOrder[]): number {
  return orders.filter((order) => order.status === 'RECEIVED').length;
}

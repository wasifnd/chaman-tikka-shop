import {
  HANDOVER_STATUSES,
  canTransition,
  type OrderStatus,
} from '@/features/orders/state-machine';
import { AppError } from '@/lib/errors';
import { fromMinor, toMinor } from '@/lib/money';
import type { TransitionStore, TransitionTx } from './transition.ports';

export interface TransitionInput {
  status: OrderStatus;
  reason?: string | undefined;
}

export interface Actor {
  userId: string;
}

export interface TransitionResult {
  id: string;
  orderNumber: string;
  from: OrderStatus;
  to: OrderStatus;
  at: Date;
  /** How much a cancellation took back off the customer's khata (absent when none). */
  khataReversed?: number;
}

/**
 * Cancelling a counter order left on a khata takes its charge back off, in the same transaction.
 * Never more than is still owed: if some of it was already paid, only the rest comes off (money
 * already paid is for the shop to hand back in person).
 */
async function reverseKhataCharge(
  tx: TransitionTx,
  order: { id: string; orderNumber: string },
  userId: string,
  at: Date,
): Promise<number> {
  const charge = await tx.khataChargeFor(order.id);
  if (!charge) return 0;
  const khata = await tx.khata.lock(charge.khataId);
  if (!khata) return 0;
  const back = Math.min(toMinor(charge.amount), toMinor(khata.balance));
  if (back <= 0) return 0;
  await tx.khata.addEntry({
    khataId: khata.id,
    kind: 'REDUCTION',
    amount: fromMinor(-back),
    balanceAfter: fromMinor(toMinor(khata.balance) - back),
    orderId: order.id,
    note: `Order ${order.orderNumber} cancelled`,
    userId,
    at,
  });
  return fromMinor(back);
}

/**
 * Moves an order to its next status.
 *
 * The order is locked first, so if two staff members press a button at the same moment, the second
 * one sees the order has already moved and is told so instead of silently overwriting the first.
 * Every change is validated against the state machine and recorded with who made it.
 */
export function createTransitionService(
  store: TransitionStore,
  now: () => Date = () => new Date(),
) {
  return {
    transition(
      orderId: string,
      { status: to, reason }: TransitionInput,
      actor: Actor,
    ): Promise<TransitionResult> {
      return store.transaction(async (tx) => {
        const order = await tx.lockOrder(orderId);
        if (!order) throw new AppError('ORDER_NOT_FOUND', 'That order does not exist.', 404);

        if (!canTransition(order.type, order.status, to)) {
          throw new AppError(
            'INVALID_TRANSITION',
            `This order is ${order.status.toLowerCase().replace(/_/g, ' ')}; it cannot be changed to ${to
              .toLowerCase()
              .replace(/_/g, ' ')}.`,
            409,
            { status: order.status },
          );
        }

        if (to === 'CANCELLED' && !reason) {
          throw new AppError(
            'REASON_REQUIRED',
            'Please give a reason for cancelling this order.',
            400,
          );
        }

        const at = now();
        await tx.applyTransition({
          orderId: order.id,
          from: order.status,
          to,
          userId: actor.userId,
          // Only cancellations carry a reason; it is shown to staff in the order's history.
          note: to === 'CANCELLED' ? (reason ?? null) : null,
          at,
          markPaid: to === 'COMPLETED',
        });
        // Handing the food over is the end of the order: it is completed (and, unless it is
        // on a khata, marked paid) in the same step, so it leaves the board at once.
        if (HANDOVER_STATUSES.includes(to)) {
          await tx.applyTransition({
            orderId: order.id,
            from: to,
            to: 'COMPLETED',
            userId: actor.userId,
            note: null,
            at,
            markPaid: true,
          });
        }
        const khataReversed =
          to === 'CANCELLED' ? await reverseKhataCharge(tx, order, actor.userId, at) : 0;

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          from: order.status,
          to,
          at,
          ...(khataReversed > 0 ? { khataReversed } : {}),
        };
      });
    },
  };
}

export type TransitionService = ReturnType<typeof createTransitionService>;

import { canTransition, type OrderStatus } from '@/features/orders/state-machine';
import { AppError } from '@/lib/errors';
import type { TransitionStore } from './transition.ports';

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

        return { id: order.id, orderNumber: order.orderNumber, from: order.status, to, at };
      });
    },
  };
}

export type TransitionService = ReturnType<typeof createTransitionService>;

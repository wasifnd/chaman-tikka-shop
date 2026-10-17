import type { Prisma, PrismaClient } from '@prisma/client';
import type { OrderStatus, OrderType } from '@/features/orders/state-machine';
import { qualifier } from '@/lib/prisma/sql';
import type { TransitionStore, TransitionTx } from './transition.ports';

function createTx(db: Prisma.TransactionClient, schema: string): TransitionTx {
  const table = qualifier(schema);

  return {
    async lockOrder(orderId) {
      // FOR UPDATE holds the row until this transaction ends: a second staff member changing the
      // same order waits here, then sees the new status and is refused by the state machine.
      const rows = await db.$queryRaw<
        { id: string; order_number: string; type: string; status: string }[]
      >`
        SELECT id::text AS id, order_number, type::text AS type, status::text AS status
        FROM ${table('orders')}
        WHERE id = ${orderId}::uuid
        FOR UPDATE`;
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        orderNumber: row.order_number,
        type: row.type as OrderType,
        status: row.status as OrderStatus,
      };
    },

    async applyTransition({ orderId, from, to, userId, note, at, markPaid }) {
      await db.order.update({
        where: { id: orderId },
        data: { status: to, ...(markPaid ? { paymentStatus: 'PAID' } : {}) },
      });
      await db.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: from,
          status: to,
          changedByUserId: userId,
          note,
          createdAt: at,
        },
      });
      await db.orderEvent.create({
        data: {
          orderId,
          type: 'order.status_changed',
          payload: { type: 'order.status_changed', status: to, from, at: at.toISOString() },
        },
      });
    },
  };
}

export interface TransitionStoreOptions {
  schema?: string;
  maxWaitMs?: number;
  timeoutMs?: number;
}

export function createPrismaTransitionStore(
  prisma: PrismaClient,
  { schema = 'public', maxWaitMs = 10_000, timeoutMs = 20_000 }: TransitionStoreOptions = {},
): TransitionStore {
  return {
    transaction: (work) =>
      prisma.$transaction((db) => work(createTx(db, schema)), {
        maxWait: maxWaitMs,
        timeout: timeoutMs,
      }),
  };
}

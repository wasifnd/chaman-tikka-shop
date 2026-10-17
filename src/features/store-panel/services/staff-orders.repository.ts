import type { PrismaClient } from '@prisma/client';
import type { StreamEvent } from '@/features/orders/services/order-stream';
import type { StaffOrder } from '../types/staff-order.types';
import { mapStaffOrder, toStaffEvent } from './staff-order.mapper';

export type StaffOrdersDb = Pick<PrismaClient, 'order' | 'orderEvent'>;

const FINISHED = ['COMPLETED', 'CANCELLED'] as const;

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  type: true,
  createdAt: true,
  estimatedReadyAt: true,
  guestName: true,
  guestPhone: true,
  deliveryAddressSnapshot: true,
  specialInstructions: true,
  subtotal: true,
  couponDiscount: true,
  deliveryCharge: true,
  taxAmount: true,
  grandTotal: true,
  paymentMethod: true,
  paymentStatus: true,
  items: {
    select: {
      productNameSnapshot: true,
      variantSnapshot: true,
      addonSnapshot: true,
      quantity: true,
      note: true,
      dealId: true,
    },
  },
  statusHistory: { select: { status: true, note: true, createdAt: true } },
} as const;

/** Read-only queries behind the store panel. Only ever called for signed-in staff. */
export function createStaffOrdersRepository(db: StaffOrdersDb) {
  return {
    /** Orders still being worked on, oldest first so nothing waits at the bottom. */
    async listActive(): Promise<StaffOrder[]> {
      const rows = await db.order.findMany({
        where: { status: { notIn: [...FINISHED] } },
        orderBy: { createdAt: 'asc' },
        select: orderSelect,
      });
      return rows.map(mapStaffOrder);
    },

    /** Orders finished recently, newest first, for "what just happened". */
    async listRecentlyFinished(since: Date, limit = 50): Promise<StaffOrder[]> {
      const rows = await db.order.findMany({
        where: { status: { in: [...FINISHED] }, updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: orderSelect,
      });
      return rows.map(mapStaffOrder);
    },

    async latestEventId(): Promise<number> {
      const latest = await db.orderEvent.findFirst({
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      return latest ? Number(latest.id) : 0;
    },

    /** Events across all orders after `afterId`, oldest first. */
    async eventsSince(afterId: number, limit = 100): Promise<StreamEvent[]> {
      const rows = await db.orderEvent.findMany({
        where: { id: { gt: BigInt(afterId) } },
        orderBy: { id: 'asc' },
        take: limit,
        select: {
          id: true,
          type: true,
          orderId: true,
          payload: true,
          order: { select: { orderNumber: true } },
        },
      });
      return rows.flatMap((row) => {
        const event = toStaffEvent(row);
        return event ? [event] : [];
      });
    },
  };
}

export type StaffOrdersRepository = ReturnType<typeof createStaffOrdersRepository>;

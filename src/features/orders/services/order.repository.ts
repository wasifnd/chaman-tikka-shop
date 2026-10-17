import type { PrismaClient } from '@prisma/client';
import type { OrderSnapshot } from '../types/snapshot.types';
import { mapOrderSnapshot } from './order-snapshot';
import type { StreamEvent } from './order-stream';

export type OrderReadDb = Pick<PrismaClient, 'order' | 'orderEvent'>;

/** Read-only queries behind the tracking page and its live stream. */
export function createOrderRepository(db: OrderReadDb) {
  return {
    async findSnapshot(token: string): Promise<OrderSnapshot | null> {
      const order = await db.order.findUnique({
        where: { trackingToken: token },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          type: true,
          createdAt: true,
          estimatedReadyAt: true,
          deliveryAddressSnapshot: true,
          subtotal: true,
          couponDiscount: true,
          deliveryCharge: true,
          taxAmount: true,
          grandTotal: true,
          items: {
            select: {
              productNameSnapshot: true,
              variantSnapshot: true,
              addonSnapshot: true,
              quantity: true,
              subtotal: true,
              dealId: true,
            },
          },
          statusHistory: { select: { status: true, createdAt: true } },
        },
      });
      if (!order) return null;
      const latest = await db.orderEvent.findFirst({
        where: { orderId: order.id },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      return mapOrderSnapshot(order, latest ? Number(latest.id) : 0);
    },

    async findOrderId(token: string): Promise<string | null> {
      const order = await db.order.findUnique({
        where: { trackingToken: token },
        select: { id: true },
      });
      return order?.id ?? null;
    },

    async eventsAfter(orderId: string, afterId: number, limit = 50): Promise<StreamEvent[]> {
      const events = await db.orderEvent.findMany({
        where: { orderId, id: { gt: BigInt(afterId) } },
        orderBy: { id: 'asc' },
        take: limit,
        select: { id: true, type: true, payload: true },
      });
      return events.map((event) => ({
        id: Number(event.id),
        type: event.type,
        payload: event.payload,
      }));
    },
  };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;

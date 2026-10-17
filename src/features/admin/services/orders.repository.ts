import type { Prisma, PrismaClient } from '@prisma/client';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { describeOptions } from '@/features/orders/services/order-snapshot';
import { readAddress } from '@/features/store-panel/services/staff-order.mapper';
import { businessDayStart } from '../logic/karachi-time';
import { buildOrderFilter } from '../logic/order-filter';
import type { OrdersQuery } from '../schemas/operations.schema';
import type {
  AdminOrderDetail,
  AdminOrderPage,
  AdminOrderRow,
  DashboardStats,
} from '../types/admin.types';

export const ORDERS_PAGE_SIZE = 25;

const rowSelect = {
  id: true,
  orderNumber: true,
  status: true,
  type: true,
  guestName: true,
  guestPhone: true,
  grandTotal: true,
  paymentStatus: true,
  paymentMethod: true,
  createdAt: true,
} as const;

type RowShape = Prisma.OrderGetPayload<{ select: typeof rowSelect }>;

const toRow = (row: RowShape): AdminOrderRow => ({
  id: row.id,
  orderNumber: row.orderNumber,
  status: row.status,
  type: row.type,
  customerName: row.guestName ?? 'Customer',
  phone: row.guestPhone ?? '',
  grandTotal: toNumber(row.grandTotal),
  paymentStatus: row.paymentStatus,
  paymentMethod: row.paymentMethod,
  createdAt: row.createdAt.toISOString(),
});

/** Read-only order lookups for the admin panel: search, detail with audit trail, dashboard numbers. */
export function createAdminOrdersRepository(prisma: PrismaClient) {
  return {
    async search(query: OrdersQuery): Promise<AdminOrderPage> {
      const where = buildOrderFilter(query);
      const [total, rows] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * ORDERS_PAGE_SIZE,
          take: ORDERS_PAGE_SIZE,
          select: rowSelect,
        }),
      ]);
      return { rows: rows.map(toRow), total, page: query.page, pageSize: ORDERS_PAGE_SIZE };
    },

    async get(id: string): Promise<AdminOrderDetail | null> {
      const row = await prisma.order.findUnique({
        where: { id },
        select: {
          ...rowSelect,
          guestEmail: true,
          deliveryAddressSnapshot: true,
          specialInstructions: true,
          subtotal: true,
          couponDiscount: true,
          deliveryCharge: true,
          taxAmount: true,
          items: {
            select: {
              productNameSnapshot: true,
              variantSnapshot: true,
              addonSnapshot: true,
              unitPrice: true,
              quantity: true,
              note: true,
              dealId: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
            select: {
              status: true,
              note: true,
              createdAt: true,
              changedBy: { select: { email: true } },
            },
          },
        },
      });
      if (!row) return null;
      return {
        ...toRow(row),
        email: row.guestEmail,
        address: readAddress(row.deliveryAddressSnapshot),
        instructions: row.specialInstructions,
        subtotal: toNumber(row.subtotal),
        couponDiscount: toNumber(row.couponDiscount),
        deliveryCharge: toNumber(row.deliveryCharge),
        taxAmount: toNumber(row.taxAmount),
        items: row.items.map((item) => ({
          name: item.productNameSnapshot,
          options: describeOptions(item.variantSnapshot, item.addonSnapshot, item.dealId !== null),
          quantity: item.quantity,
          unitPrice: toNumber(item.unitPrice),
          note: item.note,
        })),
        history: row.statusHistory.map((entry) => ({
          status: entry.status,
          note: entry.note,
          by: entry.changedBy?.email ?? null,
          at: entry.createdAt.toISOString(),
        })),
      };
    },

    async dashboard(now: Date): Promise<DashboardStats> {
      const since = businessDayStart(now);
      const today = { createdAt: { gte: since } };
      const [ordersToday, cancelledToday, activeOrders, revenue, unavailableProducts] =
        await Promise.all([
          prisma.order.count({ where: today }),
          prisma.order.count({ where: { ...today, status: 'CANCELLED' } }),
          prisma.order.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
          prisma.order.aggregate({
            where: { ...today, status: { not: 'CANCELLED' } },
            _sum: { grandTotal: true },
          }),
          prisma.product.count({
            where: {
              OR: [{ isAvailable: false }, { stockStatus: 'OUT_OF_STOCK' }],
              isActive: true,
            },
          }),
        ]);
      return {
        since: since.toISOString(),
        ordersToday,
        cancelledToday,
        activeOrders,
        revenueToday: revenue._sum.grandTotal ? toNumber(revenue._sum.grandTotal) : 0,
        unavailableProducts,
      };
    },
  };
}

export type AdminOrdersRepository = ReturnType<typeof createAdminOrdersRepository>;

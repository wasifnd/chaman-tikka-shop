import type { PrismaClient } from '@prisma/client';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { previousRange, type AnalyticsRange } from '../logic/analytics-range';
import { buildAnalytics, type Analytics, type AnalyticsOrder } from '../logic/analytics';
import type { ExportOrder } from '../logic/csv';

export interface AnalyticsReport {
  range: AnalyticsRange;
  current: Analytics;
  /** The same figures for the stretch just before, so the dashboard can say "up 12%". */
  previous: Analytics;
}

/**
 * Reads orders for the dashboard and the exports. Figures are worked out in plain code from the
 * orders themselves (see logic/analytics.ts), which keeps them testable and the same everywhere.
 */
export function createAnalyticsRepository(prisma: PrismaClient) {
  async function fetchOrders(from: Date, to: Date): Promise<AnalyticsOrder[]> {
    const rows = await prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: {
        createdAt: true,
        status: true,
        type: true,
        subtotal: true,
        couponDiscount: true,
        deliveryCharge: true,
        taxAmount: true,
        grandTotal: true,
        customerId: true,
        items: { select: { productNameSnapshot: true, quantity: true, subtotal: true } },
      },
    });
    return rows.map((row) => ({
      createdAt: row.createdAt,
      status: row.status,
      type: row.type,
      subtotal: toNumber(row.subtotal),
      couponDiscount: toNumber(row.couponDiscount),
      deliveryCharge: toNumber(row.deliveryCharge),
      taxAmount: toNumber(row.taxAmount),
      grandTotal: toNumber(row.grandTotal),
      registered: row.customerId !== null,
      items: row.items.map((item) => ({
        name: item.productNameSnapshot,
        quantity: item.quantity,
        subtotal: toNumber(item.subtotal),
      })),
    }));
  }

  return {
    /** One read covers this range and the one before it. */
    async report(range: AnalyticsRange): Promise<AnalyticsReport> {
      const before = previousRange(range);
      const orders = await fetchOrders(before.start, range.end);
      return {
        range,
        current: buildAnalytics(orders, range),
        previous: buildAnalytics(orders, before),
      };
    },

    /** Every item sold in the range, not just the top ten. */
    async allProducts(range: AnalyticsRange) {
      const orders = await fetchOrders(range.start, range.end);
      return buildAnalytics(orders, range, Number.POSITIVE_INFINITY).topProducts;
    },

    async dailySeries(range: AnalyticsRange) {
      const orders = await fetchOrders(range.start, range.end);
      return buildAnalytics(orders, range).daily;
    },

    /** Every order in the range, cancelled ones included (the status column says which), for the accountant. */
    async exportOrders(range: AnalyticsRange): Promise<ExportOrder[]> {
      const rows = await prisma.order.findMany({
        where: { createdAt: { gte: range.start, lt: range.end } },
        orderBy: { createdAt: 'asc' },
        select: {
          orderNumber: true,
          createdAt: true,
          type: true,
          status: true,
          guestName: true,
          guestPhone: true,
          customerId: true,
          subtotal: true,
          couponDiscount: true,
          deliveryCharge: true,
          taxAmount: true,
          grandTotal: true,
          paymentMethod: true,
          paymentStatus: true,
          coupon: { select: { code: true } },
        },
      });
      return rows.map((row) => ({
        orderNumber: row.orderNumber,
        createdAt: row.createdAt.toISOString(),
        type: row.type,
        status: row.status,
        customerName: row.guestName ?? '',
        phone: row.guestPhone ?? '',
        registered: row.customerId !== null,
        subtotal: toNumber(row.subtotal),
        couponDiscount: toNumber(row.couponDiscount),
        deliveryCharge: toNumber(row.deliveryCharge),
        taxAmount: toNumber(row.taxAmount),
        grandTotal: toNumber(row.grandTotal),
        paymentMethod: row.paymentMethod,
        paymentStatus: row.paymentStatus,
        couponCode: row.coupon?.code ?? null,
      }));
    },
  };
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;

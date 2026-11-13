import type { OrderStatus, OrderType } from '@/features/orders/state-machine';
import { businessDayKey, karachiHour, type AnalyticsRange, type DayKey } from './analytics-range';

/** The few facts about an order that the figures need. Amounts are rupees. */
export interface AnalyticsOrder {
  createdAt: Date;
  status: OrderStatus;
  type: OrderType;
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  /** Placed while signed in. */
  registered: boolean;
  items: { name: string; quantity: number; subtotal: number }[];
}

export interface Summary {
  /** Orders that were not cancelled. */
  orders: number;
  /** What those orders came to, in rupees. */
  revenue: number;
  /** Revenue divided by orders; 0 when there were none. */
  averageOrder: number;
  cancelled: number;
  /** Cancelled as a share of everything received, 0 to 1. */
  cancelRate: number;
  itemsSold: number;
  discounts: number;
  deliveryFees: number;
  tax: number;
  registeredOrders: number;
  guestOrders: number;
}

export interface DayPoint {
  day: DayKey;
  orders: number;
  revenue: number;
}

export interface HourPoint {
  /** Hour of day in Karachi, 0 to 23. */
  hour: number;
  orders: number;
}

export interface TypePoint {
  type: OrderType;
  orders: number;
  revenue: number;
}

export interface ProductPoint {
  name: string;
  quantity: number;
  revenue: number;
}

export interface Analytics {
  summary: Summary;
  daily: DayPoint[];
  /** Business hours in the order the restaurant lives them: noon first, late night last. */
  hours: HourPoint[];
  byType: TypePoint[];
  topProducts: ProductPoint[];
}

/** Money is added up in whole paisa so a long list of orders never drifts by a fraction. */
const paisa = (rupees: number): number => Math.round(rupees * 100);
const rupees = (amount: number): number => amount / 100;

const TOP_PRODUCTS = 10;
const TYPES: OrderType[] = ['DELIVERY', 'PICKUP', 'DINE_IN'];

export const emptySummary = (): Summary => ({
  orders: 0,
  revenue: 0,
  averageOrder: 0,
  cancelled: 0,
  cancelRate: 0,
  itemsSold: 0,
  discounts: 0,
  deliveryFees: 0,
  tax: 0,
  registeredOrders: 0,
  guestOrders: 0,
});

/**
 * All the dashboard's numbers from a list of orders. Cancelled orders count only as cancelled:
 * they never add to sales, items, discounts or the charts. Orders outside the range are ignored,
 * so a caller can pass a slightly wider list.
 */
export function buildAnalytics(
  orders: AnalyticsOrder[],
  range: AnalyticsRange,
  topLimit = TOP_PRODUCTS,
): Analytics {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  let revenue = 0;
  let discounts = 0;
  let deliveryFees = 0;
  let tax = 0;
  let count = 0;
  let cancelled = 0;
  let itemsSold = 0;
  let registeredOrders = 0;

  const dailyMap = new Map<DayKey, { orders: number; revenue: number }>(
    range.days.map((day) => [day, { orders: 0, revenue: 0 }]),
  );
  const hourOrders = new Array<number>(24).fill(0);
  const typeMap = new Map<OrderType, { orders: number; revenue: number }>(
    TYPES.map((type) => [type, { orders: 0, revenue: 0 }]),
  );
  const productMap = new Map<string, { quantity: number; revenue: number }>();

  for (const order of orders) {
    const at = order.createdAt.getTime();
    if (at < startMs || at >= endMs) continue;

    if (order.status === 'CANCELLED') {
      cancelled += 1;
      continue;
    }

    const total = paisa(order.grandTotal);
    count += 1;
    revenue += total;
    discounts += paisa(order.couponDiscount);
    deliveryFees += paisa(order.deliveryCharge);
    tax += paisa(order.taxAmount);
    if (order.registered) registeredOrders += 1;

    const day = dailyMap.get(businessDayKey(order.createdAt));
    if (day) {
      day.orders += 1;
      day.revenue += total;
    }
    hourOrders[karachiHour(order.createdAt)] = (hourOrders[karachiHour(order.createdAt)] ?? 0) + 1;

    const type = typeMap.get(order.type);
    if (type) {
      type.orders += 1;
      type.revenue += total;
    }

    for (const item of order.items) {
      itemsSold += item.quantity;
      const entry = productMap.get(item.name) ?? { quantity: 0, revenue: 0 };
      entry.quantity += item.quantity;
      entry.revenue += paisa(item.subtotal);
      productMap.set(item.name, entry);
    }
  }

  const received = count + cancelled;
  return {
    summary: {
      orders: count,
      revenue: rupees(revenue),
      averageOrder: count === 0 ? 0 : rupees(Math.round(revenue / count)),
      cancelled,
      cancelRate: received === 0 ? 0 : cancelled / received,
      itemsSold,
      discounts: rupees(discounts),
      deliveryFees: rupees(deliveryFees),
      tax: rupees(tax),
      registeredOrders,
      guestOrders: count - registeredOrders,
    },
    daily: range.days.map((day) => {
      const entry = dailyMap.get(day) ?? { orders: 0, revenue: 0 };
      return { day, orders: entry.orders, revenue: rupees(entry.revenue) };
    }),
    hours: Array.from({ length: 24 }, (_, offset) => {
      const hour = (12 + offset) % 24;
      return { hour, orders: hourOrders[hour] ?? 0 };
    }),
    byType: TYPES.map((type) => {
      const entry = typeMap.get(type) ?? { orders: 0, revenue: 0 };
      return { type, orders: entry.orders, revenue: rupees(entry.revenue) };
    }),
    topProducts: [...productMap.entries()]
      .map(([name, entry]) => ({ name, quantity: entry.quantity, revenue: rupees(entry.revenue) }))
      .sort(
        (a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name),
      )
      .slice(0, topLimit),
  };
}

/** How much a figure moved compared with before, as a fraction (0.25 = up 25%). Null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

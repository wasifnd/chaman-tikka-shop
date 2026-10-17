import { toNumber } from '@/features/menu/services/menu.mappers';
import { describeOptions } from '@/features/orders/services/order-snapshot';
import type { StreamEvent } from '@/features/orders/services/order-stream';
import type { OrderStatus, OrderType } from '@/features/orders/state-machine';
import type { PaymentMethod } from '@/features/orders/types/order.types';
import type { StaffEventPayload, StaffOrder } from '../types/staff-order.types';

type Money = { toString(): string } | number;

export interface StaffOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  createdAt: Date;
  estimatedReadyAt: Date | null;
  guestName: string | null;
  guestPhone: string | null;
  deliveryAddressSnapshot: unknown;
  specialInstructions: string | null;
  subtotal: Money;
  couponDiscount: Money;
  deliveryCharge: Money;
  taxAmount: Money;
  grandTotal: Money;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED';
  items: {
    productNameSnapshot: string;
    variantSnapshot: unknown;
    addonSnapshot: unknown;
    quantity: number;
    note: string | null;
    dealId: string | null;
  }[];
  statusHistory: { status: OrderStatus; note: string | null; createdAt: Date }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** The stored delivery address, or null for pickup and dine-in (or unreadable data). */
export function readAddress(snapshot: unknown): StaffOrder['address'] {
  if (!isRecord(snapshot)) return null;
  const line1 = text(snapshot['line1']);
  const area = text(snapshot['area']);
  if (!line1 || !area) return null;
  return { line1, line2: text(snapshot['line2']), area };
}

export function mapStaffOrder(row: StaffOrderRow): StaffOrder {
  // The reason lives on the history row for the cancellation; take the latest one.
  const cancellation = [...row.statusHistory]
    .filter((entry) => entry.status === 'CANCELLED')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    estimatedReadyAt: row.estimatedReadyAt ? row.estimatedReadyAt.toISOString() : null,
    customerName: row.guestName ?? 'Customer',
    phone: row.guestPhone ?? '',
    address: readAddress(row.deliveryAddressSnapshot),
    instructions: row.specialInstructions,
    items: row.items.map((item) => ({
      name: item.productNameSnapshot,
      options: describeOptions(item.variantSnapshot, item.addonSnapshot, item.dealId !== null),
      quantity: item.quantity,
      note: item.note,
    })),
    subtotal: toNumber(row.subtotal),
    couponDiscount: toNumber(row.couponDiscount),
    deliveryCharge: toNumber(row.deliveryCharge),
    taxAmount: toNumber(row.taxAmount),
    grandTotal: toNumber(row.grandTotal),
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    cancelReason: cancellation?.note ?? null,
  };
}

export interface EventRow {
  id: bigint;
  type: string;
  orderId: string;
  payload: unknown;
  order: { orderNumber: string };
}

const STATUSES: readonly string[] = [
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
];

/**
 * An event row as sent to staff screens: the stored payload plus which order it is about. Rows
 * with an unreadable payload are skipped rather than breaking the stream.
 */
export function toStaffEvent(row: EventRow): StreamEvent | null {
  const payload = row.payload;
  const status = isRecord(payload) ? payload['status'] : undefined;
  const at = isRecord(payload) ? payload['at'] : undefined;
  if (typeof status !== 'string' || !STATUSES.includes(status) || typeof at !== 'string')
    return null;
  if (row.type !== 'order.created' && row.type !== 'order.status_changed') return null;

  const body: StaffEventPayload = {
    type: row.type,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    status: status as OrderStatus,
    at,
  };
  return { id: Number(row.id), type: row.type, payload: body };
}

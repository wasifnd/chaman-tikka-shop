import { toNumber } from '@/features/menu/services/menu.mappers';
import type { OrderStatus, OrderType } from '../state-machine';
import { describeOptions } from '../services/order-snapshot';

export type PaymentMethod = 'COD' | 'CASH_AT_RESTAURANT';
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'ON_KHATA';

export interface ReceiptLine {
  name: string;
  /** Chosen size, add-ons, or what is inside a deal. */
  options: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
}

/** Everything printed on a receipt. Built from the stored order, never from the browser. */
export interface ReceiptData {
  orderNumber: string;
  placedAt: string;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customer: { name: string; phone: string; email: string | null };
  /** Street address for delivery orders (left out on a receipt opened from a shared link). */
  address: { line1: string | null; line2: string | null; area: string | null } | null;
  instructions: string | null;
  couponCode: string | null;
  items: ReceiptLine[];
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  /** Counter orders: what was paid at the till (the rest went on the khata). Null for online orders. */
  amountPaid: number | null;
}

type Money = { toString(): string } | number;

/** The stored order, as the receipt query selects it. */
export interface ReceiptRow {
  orderNumber: string;
  createdAt: Date;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  deliveryAddressSnapshot: unknown;
  specialInstructions: string | null;
  subtotal: Money;
  couponDiscount: Money;
  deliveryCharge: Money;
  taxAmount: Money;
  grandTotal: Money;
  amountPaid: Money | null;
  coupon: { code: string } | null;
  items: {
    productNameSnapshot: string;
    variantSnapshot: unknown;
    addonSnapshot: unknown;
    quantity: number;
    unitPrice: Money;
    subtotal: Money;
    note: string | null;
    dealId: string | null;
  }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export function mapReceipt(row: ReceiptRow): ReceiptData {
  const address = isRecord(row.deliveryAddressSnapshot)
    ? {
        line1: text(row.deliveryAddressSnapshot['line1']),
        line2: text(row.deliveryAddressSnapshot['line2']),
        area: text(row.deliveryAddressSnapshot['area']),
      }
    : null;
  return {
    orderNumber: row.orderNumber,
    placedAt: row.createdAt.toISOString(),
    type: row.type,
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    customer: {
      name: row.guestName ?? '',
      phone: row.guestPhone ?? '',
      email: row.guestEmail,
    },
    address: row.type === 'DELIVERY' ? address : null,
    instructions: text(row.specialInstructions),
    couponCode: row.coupon?.code ?? null,
    items: row.items.map((item) => ({
      name: item.productNameSnapshot,
      options: describeOptions(item.variantSnapshot, item.addonSnapshot, item.dealId !== null),
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      lineTotal: toNumber(item.subtotal),
      note: text(item.note),
    })),
    subtotal: toNumber(row.subtotal),
    couponDiscount: toNumber(row.couponDiscount),
    deliveryCharge: toNumber(row.deliveryCharge),
    taxAmount: toNumber(row.taxAmount),
    grandTotal: toNumber(row.grandTotal),
    amountPaid: row.amountPaid === null ? null : toNumber(row.amountPaid),
  };
}

/** "03001234567" becomes "0300*****67": enough to recognise, not enough to call. */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return '*'.repeat(phone.length);
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}

/**
 * The receipt for someone who only holds the tracking link. The link can be forwarded, so like
 * the tracking page it hides what would identify or locate the customer: only the first name,
 * a masked number and the delivery area remain.
 */
export function redactForLink(receipt: ReceiptData): ReceiptData {
  return {
    ...receipt,
    customer: {
      name: receipt.customer.name.split(/\s+/)[0] ?? '',
      phone: maskPhone(receipt.customer.phone),
      email: null,
    },
    address: receipt.address ? { line1: null, line2: null, area: receipt.address.area } : null,
    instructions: null,
  };
}

/**
 * Who sees the full receipt through a tracking link: the account the order belongs to, and the
 * shop's own staff. Anyone else with the link gets the redacted copy.
 */
export function canSeeFullReceipt(
  orderCustomerId: string | null,
  viewer: { role: string; customerId?: string | undefined } | null,
): boolean {
  if (!viewer) return false;
  if (viewer.role !== 'CUSTOMER') return true;
  return orderCustomerId !== null && viewer.customerId === orderCustomerId;
}

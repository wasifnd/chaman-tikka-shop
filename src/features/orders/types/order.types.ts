import type { OrderStatus, OrderType } from '../state-machine';

export interface DeliveryAddressSnapshot {
  line1: string;
  line2: string | null;
  area: string;
  city: string;
  zoneId: string;
}

export type PaymentMethod = 'COD' | 'CASH_AT_RESTAURANT';

export interface OrderItemRecord {
  productId: string | null;
  dealId: string | null;
  /** Name at the time of ordering, so later menu edits don't rewrite history. */
  name: string;
  /** Chosen variants for products; the contents of the deal for deals. */
  variantSnapshot: unknown;
  addonSnapshot: unknown;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  note: string | null;
}

/** Everything written for a new order, already priced by the server. */
export interface OrderRecord {
  orderNumber: string;
  customerId: string | null;
  /** Phone is missing only for a counter order paid in full by someone who gave no number. */
  contact: { name: string; phone: string | null; email: string | null };
  /** When the contact number was proven. Only proven orders are linked to an account later. */
  phoneVerifiedAt: Date | null;
  type: OrderType;
  /** Online orders wait for staff to accept them; staff's own counter orders start accepted. */
  status: 'RECEIVED' | 'CONFIRMED';
  source: 'ONLINE' | 'COUNTER';
  paymentStatus: 'PENDING' | 'PAID' | 'ON_KHATA';
  /** Counter orders: paid at the till. Null for online orders. */
  amountPaid: number | null;
  /** Counter orders: the staff member who took it. */
  placedByUserId: string | null;
  deliveryAddress: DeliveryAddressSnapshot | null;
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  couponId: string | null;
  paymentMethod: PaymentMethod;
  specialInstructions: string | null;
  estimatedReadyAt: Date;
  items: OrderItemRecord[];
}

/** A counter order once placed, with where its money went. */
export interface PlacedCounterOrder extends PlacedOrder {
  amountPaid: number;
  /** What went on the khata (0 when paid in full). */
  remaining: number;
  khata: { id: string; balance: number } | null;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  trackingToken: string;
  status: OrderStatus;
  type: OrderType;
  grandTotal: number;
  estimatedReadyAt: Date | null;
  /** True when this was a repeat of an earlier identical request (same idempotency key). */
  replayed: boolean;
}

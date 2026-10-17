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
  contact: { name: string; phone: string; email: string | null };
  type: OrderType;
  status: 'RECEIVED';
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

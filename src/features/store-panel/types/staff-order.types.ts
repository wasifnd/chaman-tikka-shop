import type { OrderStatus, OrderType } from '@/features/orders/state-machine';
import type { PaymentMethod } from '@/features/orders/types/order.types';

export interface StaffOrderItem {
  name: string;
  /** Chosen variants and add-ons, or what is inside a deal. */
  options: string[];
  quantity: number;
  note: string | null;
}

/**
 * An order as staff see it. Unlike the customer's tracking view this includes the customer's name,
 * phone and street address, so it is only ever sent to signed-in staff.
 */
export interface StaffOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  createdAt: string;
  estimatedReadyAt: string | null;
  customerName: string;
  phone: string;
  address: { line1: string; line2: string | null; area: string } | null;
  instructions: string | null;
  items: StaffOrderItem[];
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED';
  /** Why staff cancelled the order, when they did. */
  cancelReason: string | null;
}

export interface StaffOrdersResponse {
  orders: StaffOrder[];
  /** Newest event id read BEFORE the orders, so the live stream can resume without a gap. */
  lastEventId: number;
  serverTime: string;
}

/** A change pushed to every open staff screen. */
export interface StaffEventPayload {
  type: 'order.created' | 'order.status_changed';
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  at: string;
}

import type { OrderStatus, OrderType } from '@/features/orders/state-machine';

export interface SavedAddress {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  zoneId: string;
  zoneName: string;
  /** False when the shop has stopped delivering to this area, so it cannot be used to order. */
  zoneActive: boolean;
  isDefault: boolean;
}

export interface OrderHistoryRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  createdAt: string;
  grandTotal: number;
  /** Where the customer follows this order live. */
  trackingToken: string;
  items: { name: string; quantity: number }[];
}

export interface OrderHistoryPage {
  rows: OrderHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerProfile {
  name: string;
  phone: string | null;
  email: string;
}

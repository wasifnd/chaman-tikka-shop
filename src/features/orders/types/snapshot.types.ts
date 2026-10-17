import type { OrderStatus, OrderType } from '../state-machine';

export interface SnapshotItem {
  name: string;
  /** Chosen variants and add-ons, or the contents of a deal, as readable text. */
  options: string[];
  quantity: number;
  lineTotal: number;
}

export interface TimelineEntry {
  status: OrderStatus;
  at: string;
}

/**
 * What a customer may see on the tracking page. Deliberately contains no phone number, email or
 * street address: the page is reachable by anyone who has the link.
 */
export interface OrderSnapshot {
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  createdAt: string;
  estimatedReadyAt: string | null;
  /** The delivery area (e.g. "Johar Town"), not the street address. */
  areaName: string | null;
  items: SnapshotItem[];
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  timeline: TimelineEntry[];
  /** Id of the newest event already reflected here; the live stream continues after it. */
  lastEventId: number;
  /** The server's clock when this was produced, so the browser and server agree on "now". */
  serverTime: string;
}

/** A change pushed to watching browsers. */
export interface OrderEventPayload {
  type: 'order.created' | 'order.status_changed';
  status: OrderStatus;
  at: string;
}

import { toNumber } from '@/features/menu/services/menu.mappers';
import type { OrderStatus, OrderType } from '../state-machine';
import type { OrderSnapshot, SnapshotItem } from '../types/snapshot.types';

type Money = { toString(): string } | number;

export interface OrderRow {
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  createdAt: Date;
  estimatedReadyAt: Date | null;
  deliveryAddressSnapshot: unknown;
  subtotal: Money;
  couponDiscount: Money;
  deliveryCharge: Money;
  taxAmount: Money;
  grandTotal: Money;
  items: {
    productNameSnapshot: string;
    variantSnapshot: unknown;
    addonSnapshot: unknown;
    quantity: number;
    subtotal: Money;
    dealId: string | null;
  }[];
  statusHistory: { status: OrderStatus; createdAt: Date }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** Turns the stored variant/add-on/deal snapshots into short readable lines. */
export function describeOptions(
  variantSnapshot: unknown,
  addonSnapshot: unknown,
  isDeal: boolean,
): string[] {
  const options: string[] = [];
  if (Array.isArray(variantSnapshot)) {
    for (const entry of variantSnapshot) {
      if (!isRecord(entry)) continue;
      if (isDeal) {
        const name = text(entry['productName']);
        if (!name) continue;
        const variant = text(entry['variantName']);
        const quantity = typeof entry['quantity'] === 'number' ? entry['quantity'] : 1;
        options.push(`${String(quantity)} × ${name}${variant ? ` (${variant})` : ''}`);
      } else {
        const name = text(entry['name']);
        if (name) options.push(name);
      }
    }
  }
  if (Array.isArray(addonSnapshot)) {
    for (const entry of addonSnapshot) {
      const name = isRecord(entry) ? text(entry['name']) : null;
      if (name) options.push(name);
    }
  }
  return options;
}

/** Just the area name from the stored address; the street address never leaves the server. */
export function areaFromAddress(snapshot: unknown): string | null {
  return isRecord(snapshot) ? text(snapshot['area']) : null;
}

export function mapOrderSnapshot(
  row: OrderRow,
  lastEventId: number,
  now: Date = new Date(),
): OrderSnapshot {
  const items: SnapshotItem[] = row.items.map((item) => ({
    name: item.productNameSnapshot,
    options: describeOptions(item.variantSnapshot, item.addonSnapshot, item.dealId !== null),
    quantity: item.quantity,
    lineTotal: toNumber(item.subtotal),
  }));

  return {
    orderNumber: row.orderNumber,
    status: row.status,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    estimatedReadyAt: row.estimatedReadyAt ? row.estimatedReadyAt.toISOString() : null,
    areaName: areaFromAddress(row.deliveryAddressSnapshot),
    items,
    subtotal: toNumber(row.subtotal),
    couponDiscount: toNumber(row.couponDiscount),
    deliveryCharge: toNumber(row.deliveryCharge),
    taxAmount: toNumber(row.taxAmount),
    grandTotal: toNumber(row.grandTotal),
    timeline: [...row.statusHistory]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((entry) => ({ status: entry.status, at: entry.createdAt.toISOString() })),
    lastEventId,
    serverTime: now.toISOString(),
  };
}

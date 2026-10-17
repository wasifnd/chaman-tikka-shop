import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Api } from './client';

const STATE_FILE = path.join(process.cwd(), 'e2e', '.world.json');

/** The menu, area and coupons the scenarios run against, created fresh by the global setup. */
export interface World {
  suffix: string;
  categoryId: string;
  kabab: {
    id: string;
    slug: string;
    name: string;
    basePrice: number;
    half: string;
    quarter: string;
  };
  naan: { id: string; slug: string; name: string; basePrice: number };
  chutneyId: string;
  dealId: string;
  dealName: string;
  zone: { id: string; name: string; charge: number; freeAbove: number; minOrder: number };
  couponPercent: string;
  couponFixed: string;
  /** What the restaurant looked like before, so the teardown can put it back. */
  original: { settings: unknown };
}

export const saveWorld = (world: World) => {
  writeFileSync(STATE_FILE, JSON.stringify(world, null, 2));
};

export function loadWorld(): World {
  if (!existsSync(STATE_FILE)) throw new Error('Run the scenarios through "npm run e2e".');
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as World;
}

export const clearWorld = () => {
  if (existsSync(STATE_FILE)) writeFileSync(STATE_FILE, '');
};

export const ALL_DAY = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isClosed: false,
  openTime: '00:00',
  closeTime: '23:59',
}));

export const newKey = () => randomUUID();

/** What a customer's cart line for the kabab looks like. */
export const kababLine = (world: World, overrides: Record<string, unknown> = {}) => ({
  kind: 'product' as const,
  productId: world.kabab.id,
  quantity: 1,
  variantIds: [world.kabab.half],
  addonIds: [],
  ...overrides,
});

export const naanLine = (world: World, quantity = 1) => ({
  kind: 'product' as const,
  productId: world.naan.id,
  quantity,
  variantIds: [],
  addonIds: [],
});

export const dealLine = (world: World, quantity = 1) => ({
  kind: 'deal' as const,
  dealId: world.dealId,
  quantity,
});

export interface QuoteReply {
  grandTotal: number;
  subtotal: number;
  deliveryCharge: number;
  couponDiscount: number;
  canCheckout: boolean;
  issues: { code: string }[];
  coupon: { applied: boolean; reason?: string; discount: number } | null;
  lines: { unitPrice: number; lineTotal: number }[];
  freeDeliveryRemaining: number | null;
}

/** Asks the server what a cart costs, exactly as the cart page does. */
export async function quote(
  api: Api,
  body: {
    lines: unknown[];
    orderType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
    zoneId?: string;
    couponCode?: string;
  },
): Promise<QuoteReply> {
  const reply = await api.post('/api/v1/cart/quote', body);
  if (reply.status !== 200) throw new Error(`Quote failed: ${reply.status} ${reply.text}`);
  return (reply.data as { quote: QuoteReply }).quote;
}

export interface OrderBody {
  lines: unknown[];
  orderType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  zoneId?: string;
  couponCode?: string;
  contact: { name: string; phone: string; email?: string };
  address?: { line1: string; line2?: string };
  instructions?: string;
  idempotencyKey: string;
  expectedTotal: number;
}

/** Quotes the cart, then places it for exactly the quoted total, like the checkout page does. */
export async function placeOrder(
  api: Api,
  input: Omit<OrderBody, 'idempotencyKey' | 'expectedTotal'> & {
    idempotencyKey?: string;
    expectedTotal?: number;
  },
) {
  const priced = await quote(api, {
    lines: input.lines,
    orderType: input.orderType,
    ...(input.zoneId ? { zoneId: input.zoneId } : {}),
    ...(input.couponCode ? { couponCode: input.couponCode } : {}),
  });
  const body: OrderBody = {
    ...input,
    idempotencyKey: input.idempotencyKey ?? newKey(),
    expectedTotal: input.expectedTotal ?? priced.grandTotal,
  };
  const reply = await api.post('/api/v1/orders', body);
  const order = (reply.data as { order?: PlacedOrderReply } | null)?.order;
  return { reply, order, body, priced };
}

export interface PlacedOrderReply {
  orderNumber: string;
  trackingToken: string;
  status: string;
  grandTotal: number;
  estimatedReadyAt: string | null;
}

export const guestContact = (phone: string, name = 'E2E Guest') => ({ name, phone });

import { z } from 'zod';
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from '@/features/checkout/schemas/quote.schema';
import type { CartLineInput, OrderType } from '@/features/checkout/types/quote.types';

const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);

/**
 * Cart lines as kept in the browser. Names and prices are only a display hint for the moment
 * before the server quote arrives: the server never reads them.
 */
const productItem = z.object({
  kind: z.literal('product'),
  key: z.string().min(1).max(400),
  productId: z.uuid(),
  name: z.string().min(1).max(120),
  unitPrice: z.number().nonnegative(),
  quantity,
  variantIds: z.array(z.uuid()).max(20),
  addonIds: z.array(z.uuid()).max(20),
  optionLabels: z.array(z.string().max(80)).max(40),
  note: z.string().max(200).optional(),
});

const dealItem = z.object({
  kind: z.literal('deal'),
  key: z.string().min(1).max(400),
  dealId: z.uuid(),
  name: z.string().min(1).max(120),
  unitPrice: z.number().nonnegative(),
  quantity,
});

export const cartItemSchema = z.discriminatedUnion('kind', [productItem, dealItem]);
export type CartItem = z.infer<typeof cartItemSchema>;

export interface CartState {
  items: CartItem[];
  orderType: OrderType;
  zoneId: string | null;
  couponCode: string | null;
}

export const emptyCart: CartState = {
  items: [],
  orderType: 'DELIVERY',
  zoneId: null,
  couponCode: null,
};

/** What a caller supplies when adding something; the key is derived. */
export type NewCartItem =
  | Omit<Extract<CartItem, { kind: 'product' }>, 'key'>
  | Omit<Extract<CartItem, { kind: 'deal' }>, 'key'>;

/**
 * Two lines are the same dish only if product, options and note all match, regardless of the
 * order options were picked in.
 */
export function lineKey(item: NewCartItem): string {
  if (item.kind === 'deal') return `deal:${item.dealId}`;
  const variants = [...item.variantIds].sort().join(',');
  const addons = [...item.addonIds].sort().join(',');
  const note = (item.note ?? '').trim().toLowerCase();
  return `product:${item.productId}|v:${variants}|a:${addons}|n:${note}`;
}

const clamp = (value: number) => Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(value)));

/** Adds a line, merging into an existing identical one. Caps quantity and number of lines. */
export function addItem(state: CartState, item: NewCartItem): CartState {
  const key = lineKey(item);
  const existing = state.items.find((line) => line.key === key);
  if (existing) {
    return {
      ...state,
      items: state.items.map((line) =>
        line.key === key ? { ...line, quantity: clamp(line.quantity + item.quantity) } : line,
      ),
    };
  }
  if (state.items.length >= MAX_CART_LINES) return state;
  return {
    ...state,
    items: [...state.items, { ...item, key, quantity: clamp(item.quantity) }],
  };
}

/** Sets a quantity; anything below 1 removes the line. */
export function setQuantity(state: CartState, key: string, next: number): CartState {
  if (!Number.isFinite(next) || next < 1) return removeItem(state, key);
  return {
    ...state,
    items: state.items.map((line) =>
      line.key === key ? { ...line, quantity: clamp(next) } : line,
    ),
  };
}

export function removeItem(state: CartState, key: string): CartState {
  return { ...state, items: state.items.filter((line) => line.key !== key) };
}

/** Empties the basket but keeps how and where the customer wants it delivered. */
export function clearItems(state: CartState): CartState {
  return { ...state, items: [], couponCode: null };
}

export function setOrderType(state: CartState, orderType: OrderType): CartState {
  return { ...state, orderType };
}

export function setZone(state: CartState, zoneId: string | null): CartState {
  return { ...state, zoneId };
}

export function setCoupon(state: CartState, code: string | null): CartState {
  const trimmed = code?.trim() ?? '';
  return { ...state, couponCode: trimmed === '' ? null : trimmed.slice(0, 40) };
}

export function itemCount(state: CartState): number {
  return state.items.reduce((sum, line) => sum + line.quantity, 0);
}

/** The request the quote API understands: what is in the cart, never what it costs. */
export function toQuoteRequest(state: CartState) {
  const lines: CartLineInput[] = state.items.map((item) =>
    item.kind === 'deal'
      ? { kind: 'deal', dealId: item.dealId, quantity: item.quantity }
      : {
          kind: 'product',
          productId: item.productId,
          quantity: item.quantity,
          variantIds: item.variantIds,
          addonIds: item.addonIds,
          ...(item.note ? { note: item.note } : {}),
        },
  );
  return {
    lines,
    orderType: state.orderType,
    zoneId: state.orderType === 'DELIVERY' ? state.zoneId : null,
    couponCode: state.couponCode,
  };
}

const orderTypeSchema = z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']);

/**
 * Reads whatever is in localStorage. It may be from an older version, edited by hand or
 * corrupted, so every part is validated and bad parts are dropped instead of trusted:
 * one broken line does not wipe the rest of the cart.
 */
export function parsePersistedCart(raw: unknown): CartState {
  if (typeof raw !== 'object' || raw === null) return emptyCart;
  const record = raw as Record<string, unknown>;

  const items: CartItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record['items'])) {
    for (const candidate of record['items']) {
      const parsed = cartItemSchema.safeParse(candidate);
      if (!parsed.success) continue;
      // Re-derive the key rather than trusting the stored one, and merge any duplicates.
      const key = lineKey(parsed.data);
      if (seen.has(key) || items.length >= MAX_CART_LINES) continue;
      seen.add(key);
      items.push({ ...parsed.data, key });
    }
  }

  const orderType = orderTypeSchema.safeParse(record['orderType']);
  const zone = z.uuid().safeParse(record['zoneId']);
  const coupon = z.string().max(40).safeParse(record['couponCode']);

  return {
    items,
    orderType: orderType.success ? orderType.data : emptyCart.orderType,
    zoneId: zone.success ? zone.data : null,
    couponCode: coupon.success && coupon.data.trim() !== '' ? coupon.data.trim() : null,
  };
}

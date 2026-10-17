import type { WeekHours } from '@/features/hours/business-hours';
import type { OrderType } from '@/features/orders/state-machine';

export type { OrderType };

export interface ProductLineInput {
  kind: 'product';
  productId: string;
  quantity: number;
  variantIds: string[];
  addonIds: string[];
  note?: string | undefined;
}

export interface DealLineInput {
  kind: 'deal';
  dealId: string;
  quantity: number;
}

export type CartLineInput = ProductLineInput | DealLineInput;

export interface QuoteInput {
  lines: CartLineInput[];
  orderType: OrderType;
  zoneId?: string | null | undefined;
  couponCode?: string | null | undefined;
  /** Set when the shopper is signed in; needed for coupons issued to one customer. */
  customerId?: string | null | undefined;
}

// ---- Data the engine prices against (loaded from the database, trusted) ----

export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'LIMITED';

export interface ProductData {
  id: string;
  name: string;
  basePrice: number;
  discountPrice: number | null;
  isActive: boolean;
  isAvailable: boolean;
  stockStatus: StockStatus;
  categoryActive: boolean;
  variantGroups: {
    id: string;
    name: string;
    isRequired: boolean;
    variants: { id: string; name: string; priceModifier: number; isAvailable: boolean }[];
  }[];
  addons: { id: string; name: string; price: number; isAvailable: boolean }[];
}

export interface DealData {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  isAvailable: boolean;
  startDate: Date | null;
  endDate: Date | null;
  /** False when any product inside the deal can't currently be sold. */
  itemsOrderable: boolean;
}

export interface ZoneData {
  id: string;
  name: string;
  charge: number;
  freeDeliveryAbove: number | null;
  minOrderAmount: number;
  isActive: boolean;
}

export interface CouponData {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  amount: number;
  minimumOrderAmount: number;
  usageLimit: number | null;
  usedCount: number;
  /** When set, only this customer may use the coupon. */
  customerId: string | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface QuoteSettings {
  taxRatePercent: number;
  orderingEnabled: boolean;
}

export interface QuoteData {
  products: ReadonlyMap<string, ProductData>;
  deals: ReadonlyMap<string, DealData>;
  zone: ZoneData | null;
  coupon: CouponData | null;
  settings: QuoteSettings;
  hours: WeekHours;
}

// ---- What the engine returns ----

export type IssueCode =
  | 'EMPTY_CART'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_UNAVAILABLE'
  | 'DEAL_NOT_FOUND'
  | 'DEAL_UNAVAILABLE'
  | 'INVALID_OPTION'
  | 'MISSING_REQUIRED_OPTION'
  | 'ZONE_REQUIRED'
  | 'ZONE_INVALID'
  | 'BELOW_MINIMUM'
  | 'RESTAURANT_CLOSED'
  | 'ORDERING_DISABLED';

export interface QuoteIssue {
  code: IssueCode;
  message: string;
  /** Index into the input lines when the problem belongs to one line. */
  lineIndex?: number;
}

export type CouponRejection =
  'NOT_FOUND' | 'INACTIVE' | 'EXPIRED' | 'USAGE_LIMIT' | 'LOGIN_REQUIRED' | 'MIN_ORDER';

export interface CouponResult {
  code: string;
  applied: boolean;
  reason?: CouponRejection;
  /** Rupees taken off; 0 when rejected. */
  discount: number;
}

export interface QuoteLine {
  lineIndex: number;
  kind: 'product' | 'deal';
  id: string;
  name: string;
  /** Chosen variant and add-on names, for display and for order snapshots. */
  options: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note?: string;
}

/** All amounts are rupees with at most two decimals, computed exactly in paisa. */
export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  coupon: CouponResult | null;
  /** How much more food would unlock free delivery, or null if not applicable. */
  freeDeliveryRemaining: number | null;
  issues: QuoteIssue[];
  /** True only when nothing blocks placing the order. */
  canCheckout: boolean;
}

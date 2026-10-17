import type { OrderStatus, OrderType } from '@/features/orders/state-machine';
import type {
  CouponInput,
  HoursInput,
  RestaurantSettingsInput,
  ZoneInput,
} from '../schemas/operations.schema';
import type { CategoryInput, DealInput, ProductInput } from '../schemas/catalog.schema';

export interface AdminCategory extends CategoryInput {
  id: string;
  slug: string;
  productCount: number;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  nameEn: string;
  categoryId: string;
  categoryName: string;
  basePrice: number;
  discountPrice: number | null;
  thumbnailUrl: string | null;
  isActive: boolean;
  isAvailable: boolean;
  stockStatus: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
}

export type AdminProductDetail = ProductInput & { id: string; slug: string };

/** A product and its options, as offered in the deal editor's pickers. */
export interface ProductPickerOption {
  id: string;
  nameEn: string;
  variants: { id: string; label: string }[];
}

export interface AdminAddon {
  id: string;
  nameEn: string;
  price: number;
  isAvailable: boolean;
  productCount: number;
}

export type AdminDeal = Omit<DealInput, 'items'> & {
  id: string;
  slug: string;
  items: (DealInput['items'][number] & { productName: string })[];
};

export type AdminZone = ZoneInput & { id: string };
export type AdminCoupon = CouponInput & { id: string; usedCount: number };

export interface AdminSettings {
  restaurant: RestaurantSettingsInput;
  hours: HoursInput;
}

export interface TeamMember {
  id: string;
  email: string;
  role: 'STORE_STAFF' | 'ADMIN' | 'SUPER_ADMIN';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  customerName: string;
  phone: string;
  grandTotal: number;
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED';
  paymentMethod: 'COD' | 'CASH_AT_RESTAURANT';
  createdAt: string;
}

export interface AdminOrderPage {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminOrderDetail extends AdminOrderRow {
  email: string | null;
  address: { line1: string; line2: string | null; area: string } | null;
  instructions: string | null;
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  items: {
    name: string;
    options: string[];
    quantity: number;
    unitPrice: number;
    note: string | null;
  }[];
  history: { status: OrderStatus; note: string | null; by: string | null; at: string }[];
}

export interface DashboardStats {
  /** When the current business day (noon to noon) began. */
  since: string;
  ordersToday: number;
  activeOrders: number;
  revenueToday: number;
  cancelledToday: number;
  /** Items hidden or marked unavailable, so the owner notices a menu left switched off. */
  unavailableProducts: number;
}

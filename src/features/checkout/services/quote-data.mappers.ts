import { z } from 'zod';
import type { WeekHours } from '@/features/hours/business-hours';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { isProductOrderable } from './quote-engine';
import type {
  CouponData,
  DealData,
  ProductData,
  QuoteSettings,
  StockStatus,
  ZoneData,
} from '../types/quote.types';

/** Prisma Decimal values only need toString() to become numbers. */
type Money = { toString(): string } | number;

export interface ProductRow {
  id: string;
  nameEn: string;
  basePrice: Money;
  discountPrice: Money | null;
  isActive: boolean;
  isAvailable: boolean;
  stockStatus: StockStatus;
  category: { isActive: boolean };
  variantGroups: {
    id: string;
    nameEn: string;
    isRequired: boolean;
    variants: { id: string; nameEn: string; priceModifier: Money; isAvailable: boolean }[];
  }[];
  productAddons: { addon: { id: string; nameEn: string; price: Money; isAvailable: boolean } }[];
}

export function mapProductData(row: ProductRow): ProductData {
  return {
    id: row.id,
    name: row.nameEn,
    basePrice: toNumber(row.basePrice),
    discountPrice: row.discountPrice === null ? null : toNumber(row.discountPrice),
    isActive: row.isActive,
    isAvailable: row.isAvailable,
    stockStatus: row.stockStatus,
    categoryActive: row.category.isActive,
    variantGroups: row.variantGroups.map((group) => ({
      id: group.id,
      name: group.nameEn,
      isRequired: group.isRequired,
      variants: group.variants.map((variant) => ({
        id: variant.id,
        name: variant.nameEn,
        priceModifier: toNumber(variant.priceModifier),
        isAvailable: variant.isAvailable,
      })),
    })),
    addons: row.productAddons.map(({ addon }) => ({
      id: addon.id,
      name: addon.nameEn,
      price: toNumber(addon.price),
      isAvailable: addon.isAvailable,
    })),
  };
}

export interface DealRow {
  id: string;
  nameEn: string;
  price: Money;
  isActive: boolean;
  isAvailable: boolean;
  startDate: Date | null;
  endDate: Date | null;
  items: {
    product: Pick<ProductRow, 'isActive' | 'isAvailable' | 'stockStatus' | 'category'>;
  }[];
}

export function mapDealData(row: DealRow): DealData {
  return {
    id: row.id,
    name: row.nameEn,
    price: toNumber(row.price),
    isActive: row.isActive,
    isAvailable: row.isAvailable,
    startDate: row.startDate,
    endDate: row.endDate,
    // A deal is only sellable if everything inside it is. An empty deal is not sellable.
    itemsOrderable:
      row.items.length > 0 &&
      row.items.every(({ product }) =>
        isProductOrderable({
          ...product,
          categoryActive: product.category.isActive,
          id: '',
          name: '',
          basePrice: 0,
          discountPrice: null,
          variantGroups: [],
          addons: [],
        }),
      ),
  };
}

export interface ZoneRow {
  id: string;
  name: string;
  charge: Money;
  freeDeliveryAbove: Money | null;
  minOrderAmount: Money;
  isActive: boolean;
}

export function mapZoneData(row: ZoneRow): ZoneData {
  return {
    id: row.id,
    name: row.name,
    charge: toNumber(row.charge),
    freeDeliveryAbove: row.freeDeliveryAbove === null ? null : toNumber(row.freeDeliveryAbove),
    minOrderAmount: toNumber(row.minOrderAmount),
    isActive: row.isActive,
  };
}

export interface CouponRow {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  amount: Money;
  minimumOrderAmount: Money;
  usageLimit: number | null;
  usedCount: number;
  customerId: string | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export function mapCouponData(row: CouponRow): CouponData {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    amount: toNumber(row.amount),
    minimumOrderAmount: toNumber(row.minimumOrderAmount),
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    customerId: row.customerId,
    expiresAt: row.expiresAt,
    isActive: row.isActive,
  };
}

const settingsSchema = z.object({
  taxRatePercent: z.number().min(0).max(100).catch(0),
  orderingEnabled: z.boolean().catch(true),
});

/**
 * Reads the stored restaurant settings. A missing or malformed value falls back to safe
 * defaults (no tax, ordering on) instead of taking checkout down.
 */
export function parseRestaurantSettings(value: unknown): QuoteSettings {
  const parsed = settingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { taxRatePercent: 0, orderingEnabled: true };
}

export function toWeekHours(
  rows: {
    dayOfWeek: number;
    openTime: string | null;
    closeTime: string | null;
    isClosed: boolean;
  }[],
): WeekHours {
  return Object.fromEntries(
    rows.map((row) => [
      row.dayOfWeek,
      { isClosed: row.isClosed, openTime: row.openTime, closeTime: row.closeTime },
    ]),
  );
}

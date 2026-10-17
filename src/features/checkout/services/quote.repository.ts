import type { PrismaClient } from '@prisma/client';

/** Works with the normal client and with the client handed out inside a transaction. */
export type QuoteDb = Pick<
  PrismaClient,
  'product' | 'deal' | 'deliveryZone' | 'coupon' | 'setting' | 'businessHour'
>;
import type { QuoteData, QuoteInput } from '../types/quote.types';
import {
  mapCouponData,
  mapDealData,
  mapProductData,
  mapZoneData,
  parseRestaurantSettings,
  toWeekHours,
} from './quote-data.mappers';

const unique = (values: string[]) => [...new Set(values)];

/**
 * Loads exactly the rows a quote needs: only the products and deals in the cart, the chosen
 * zone and coupon, plus settings and opening hours. Read-only.
 */
export function createQuoteLoader(prisma: QuoteDb) {
  return async function load(input: QuoteInput): Promise<QuoteData> {
    const productIds = unique(
      input.lines.flatMap((line) => (line.kind === 'product' ? [line.productId] : [])),
    );
    const dealIds = unique(
      input.lines.flatMap((line) => (line.kind === 'deal' ? [line.dealId] : [])),
    );
    const couponCode = input.couponCode?.trim().toUpperCase();

    const [products, deals, zone, coupon, restaurant, hours] = await Promise.all([
      productIds.length === 0
        ? []
        : prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              nameEn: true,
              basePrice: true,
              discountPrice: true,
              preparationTime: true,
              isActive: true,
              isAvailable: true,
              stockStatus: true,
              category: { select: { isActive: true } },
              variantGroups: {
                select: {
                  id: true,
                  nameEn: true,
                  isRequired: true,
                  variants: {
                    select: { id: true, nameEn: true, priceModifier: true, isAvailable: true },
                  },
                },
              },
              productAddons: {
                select: {
                  addon: { select: { id: true, nameEn: true, price: true, isAvailable: true } },
                },
              },
            },
          }),
      dealIds.length === 0
        ? []
        : prisma.deal.findMany({
            where: { id: { in: dealIds } },
            select: {
              id: true,
              nameEn: true,
              price: true,
              isActive: true,
              isAvailable: true,
              startDate: true,
              endDate: true,
              items: {
                select: {
                  quantity: true,
                  variant: { select: { nameEn: true } },
                  product: {
                    select: {
                      nameEn: true,
                      preparationTime: true,
                      isActive: true,
                      isAvailable: true,
                      stockStatus: true,
                      category: { select: { isActive: true } },
                    },
                  },
                },
              },
            },
          }),
      input.zoneId
        ? prisma.deliveryZone.findUnique({ where: { id: input.zoneId } })
        : Promise.resolve(null),
      couponCode
        ? prisma.coupon.findUnique({ where: { code: couponCode } })
        : Promise.resolve(null),
      prisma.setting.findUnique({ where: { key: 'restaurant' }, select: { value: true } }),
      prisma.businessHour.findMany(),
    ]);

    return {
      products: new Map(products.map((row) => [row.id, mapProductData(row)])),
      deals: new Map(deals.map((row) => [row.id, mapDealData(row)])),
      zone: zone ? mapZoneData(zone) : null,
      coupon: coupon ? mapCouponData(coupon) : null,
      settings: parseRestaurantSettings(restaurant?.value),
      hours: toWeekHours(hours),
    };
  };
}

export type QuoteLoader = ReturnType<typeof createQuoteLoader>;

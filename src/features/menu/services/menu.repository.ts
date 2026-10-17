import type { PrismaClient } from '@prisma/client';
import {
  isDealLive,
  mapCategory,
  mapDeal,
  mapProductDetail,
  type CategoryRow,
  type DealRow,
  type ProductDetailRow,
} from './menu.mappers';
import type { DealSummary, MenuCategory, ProductDetail } from '../types/menu.types';

const productSelect = {
  id: true,
  slug: true,
  nameEn: true,
  descriptionEn: true,
  basePrice: true,
  discountPrice: true,
  thumbnailUrl: true,
  preparationTime: true,
  isFeatured: true,
  isPopular: true,
  isAvailable: true,
  stockStatus: true,
} as const;

const dealInclude = {
  items: {
    include: {
      product: { select: { nameEn: true, basePrice: true, discountPrice: true } },
      variant: { select: { nameEn: true, priceModifier: true } },
    },
  },
} as const;

/** Read-only queries for the public site. Hidden (isActive = false) rows never leave here. */
export function createMenuRepository(prisma: PrismaClient) {
  return {
    async listMenu(): Promise<MenuCategory[]> {
      const rows: CategoryRow[] = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          nameEn: true,
          descriptionEn: true,
          imageUrl: true,
          isFeatured: true,
          products: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: productSelect,
          },
        },
      });
      return rows.map(mapCategory).filter((category) => category.products.length > 0);
    },

    async findProduct(slug: string): Promise<ProductDetail | null> {
      const row: ProductDetailRow | null = await prisma.product.findFirst({
        where: { slug, isActive: true, category: { isActive: true } },
        select: {
          ...productSelect,
          category: { select: { slug: true, nameEn: true } },
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            select: { url: true, altTextEn: true },
          },
          variantGroups: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              nameEn: true,
              isRequired: true,
              variants: {
                orderBy: { sortOrder: 'asc' },
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
      });
      return row ? mapProductDetail(row) : null;
    },

    async listDeals(now: Date): Promise<DealSummary[]> {
      const rows: DealRow[] = await prisma.deal.findMany({
        where: { isActive: true, isAvailable: true },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        include: dealInclude,
      });
      return rows.filter((deal) => isDealLive(deal, now)).map(mapDeal);
    },

    async findDeal(slug: string, now: Date): Promise<DealSummary | null> {
      const row: DealRow | null = await prisma.deal.findFirst({
        where: { slug, isActive: true, isAvailable: true },
        include: dealInclude,
      });
      return row && isDealLive(row, now) ? mapDeal(row) : null;
    },
  };
}

export type MenuRepository = ReturnType<typeof createMenuRepository>;

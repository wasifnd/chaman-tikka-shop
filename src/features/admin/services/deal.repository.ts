import type { PrismaClient } from '@prisma/client';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { AppError } from '@/lib/errors';
import { uniqueSlug } from '../logic/slug';
import type { DealInput } from '../schemas/catalog.schema';
import type { AdminDeal } from '../types/admin.types';
import { isNotFound, isUniqueViolation } from './prisma-errors';

const NOT_FOUND = () => new AppError('DEAL_NOT_FOUND', 'That deal does not exist.', 404);

const scalars = (input: DealInput) => ({
  nameEn: input.nameEn,
  descriptionEn: input.descriptionEn,
  imageUrl: input.imageUrl,
  price: input.price,
  startDate: input.startDate ? new Date(input.startDate) : null,
  endDate: input.endDate ? new Date(input.endDate) : null,
  isAvailable: input.isAvailable,
  isActive: input.isActive,
  isFeatured: input.isFeatured,
});

const itemsCreate = (items: DealInput['items']) =>
  items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
  }));

export function createDealRepository(prisma: PrismaClient) {
  const slugTaken = async (slug: string) =>
    (await prisma.deal.findUnique({ where: { slug }, select: { id: true } })) !== null;

  /** Every product must exist, and a chosen option must really belong to that product. */
  async function assertItemsValid(items: DealInput['items']): Promise<void> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, variantGroups: { select: { variants: { select: { id: true } } } } },
    });
    const variantsByProduct = new Map(
      products.map((product) => [
        product.id,
        new Set(product.variantGroups.flatMap((group) => group.variants.map((v) => v.id))),
      ]),
    );
    items.forEach((item, index) => {
      const variants = variantsByProduct.get(item.productId);
      if (!variants) {
        throw new AppError('PRODUCT_NOT_FOUND', 'A product in this deal no longer exists.', 422, {
          [`items.${String(index)}.productId`]: 'This product no longer exists',
        });
      }
      if (item.variantId !== null && !variants.has(item.variantId)) {
        throw new AppError('INVALID_VARIANT', 'That option does not belong to the product.', 422, {
          [`items.${String(index)}.variantId`]: 'That option does not belong to this product',
        });
      }
    });
  }

  return {
    async list(): Promise<AdminDeal[]> {
      const rows = await prisma.deal.findMany({
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        include: { items: { include: { product: { select: { nameEn: true } } } } },
      });
      return rows.map(mapDeal);
    },

    async get(id: string): Promise<AdminDeal | null> {
      const row = await prisma.deal.findUnique({
        where: { id },
        include: { items: { include: { product: { select: { nameEn: true } } } } },
      });
      return row ? mapDeal(row) : null;
    },

    async create(input: DealInput): Promise<string> {
      await assertItemsValid(input.items);
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = await uniqueSlug(input.nameEn, slugTaken);
        try {
          const row = await prisma.deal.create({
            data: { slug, ...scalars(input), items: { create: itemsCreate(input.items) } },
            select: { id: true },
          });
          return row.id;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw new AppError('SLUG_CONFLICT', 'Could not create the deal. Please try again.', 409);
    },

    async update(id: string, input: DealInput): Promise<void> {
      await assertItemsValid(input.items);
      try {
        // Items are replaced together with the deal in one transaction.
        await prisma.deal.update({
          where: { id },
          data: {
            ...scalars(input),
            items: { deleteMany: {}, create: itemsCreate(input.items) },
          },
        });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        throw error;
      }
    },

    /** A deal that was ordered is hidden instead of deleted, so past orders keep their link. */
    async remove(id: string): Promise<'deleted' | 'archived'> {
      const deal = await prisma.deal.findUnique({
        where: { id },
        select: { _count: { select: { orderItems: true } } },
      });
      if (!deal) throw NOT_FOUND();
      if (deal._count.orderItems > 0) {
        await prisma.deal.update({ where: { id }, data: { isActive: false, isAvailable: false } });
        return 'archived';
      }
      try {
        await prisma.deal.delete({ where: { id } });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        throw error;
      }
      return 'deleted';
    },
  };
}

type DealRow = {
  id: string;
  slug: string;
  nameEn: string;
  descriptionEn: string | null;
  imageUrl: string | null;
  price: { toString(): string };
  startDate: Date | null;
  endDate: Date | null;
  isAvailable: boolean;
  isActive: boolean;
  isFeatured: boolean;
  items: {
    productId: string;
    variantId: string | null;
    quantity: number;
    product: { nameEn: string };
  }[];
};

function mapDeal(row: DealRow): AdminDeal {
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    descriptionEn: row.descriptionEn,
    imageUrl: row.imageUrl,
    price: toNumber(row.price),
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    isAvailable: row.isAvailable,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
    items: row.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.product.nameEn,
    })),
  };
}

export type DealRepository = ReturnType<typeof createDealRepository>;

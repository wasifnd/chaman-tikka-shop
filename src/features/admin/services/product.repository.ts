import type { PrismaClient } from '@prisma/client';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { AppError } from '@/lib/errors';
import { uniqueSlug } from '../logic/slug';
import type { AddonInput, ProductInput } from '../schemas/catalog.schema';
import type {
  AdminAddon,
  AdminProductDetail,
  AdminProductRow,
  ProductPickerOption,
} from '../types/admin.types';
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from './prisma-errors';

const NOT_FOUND = () => new AppError('PRODUCT_NOT_FOUND', 'That product does not exist.', 404);
const ADDON_NOT_FOUND = () => new AppError('ADDON_NOT_FOUND', 'That add-on does not exist.', 404);

export interface ProductFilter {
  q?: string | undefined;
  categoryId?: string | undefined;
}

type GroupInput = ProductInput['variantGroups'][number];

const variantData = (variant: GroupInput['variants'][number], index: number) => ({
  nameEn: variant.nameEn,
  priceModifier: variant.priceModifier,
  isAvailable: variant.isAvailable,
  sortOrder: index,
});

const groupCreate = (group: GroupInput, index: number) => ({
  nameEn: group.nameEn,
  isRequired: group.isRequired,
  sortOrder: index,
  variants: { create: group.variants.map(variantData) },
});

const scalars = (input: ProductInput) => ({
  nameEn: input.nameEn,
  descriptionEn: input.descriptionEn,
  categoryId: input.categoryId,
  basePrice: input.basePrice,
  discountPrice: input.discountPrice,
  thumbnailUrl: input.thumbnailUrl,
  preparationTime: input.preparationTime,
  sortOrder: input.sortOrder,
  isAvailable: input.isAvailable,
  isFeatured: input.isFeatured,
  isPopular: input.isPopular,
  isActive: input.isActive,
  stockStatus: input.stockStatus,
});

export function createProductRepository(prisma: PrismaClient) {
  const slugTaken = async (slug: string) =>
    (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) !== null;

  async function assertReferencesExist(input: ProductInput): Promise<void> {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new AppError('CATEGORY_NOT_FOUND', 'Choose a category that exists.', 422, {
        categoryId: 'Choose a category that exists.',
      });
    }
    if (input.addonIds.length > 0) {
      const found = await prisma.addon.count({ where: { id: { in: input.addonIds } } });
      if (found !== input.addonIds.length) {
        throw new AppError('ADDON_NOT_FOUND', 'One of the add-ons no longer exists.', 422, {
          addonIds: 'One of the add-ons no longer exists.',
        });
      }
    }
  }

  return {
    async list(filter: ProductFilter = {}): Promise<AdminProductRow[]> {
      const rows = await prisma.product.findMany({
        where: {
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
          ...(filter.q ? { nameEn: { contains: filter.q, mode: 'insensitive' as const } } : {}),
        },
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { nameEn: 'asc' }],
        select: {
          id: true,
          slug: true,
          nameEn: true,
          categoryId: true,
          category: { select: { nameEn: true } },
          basePrice: true,
          discountPrice: true,
          thumbnailUrl: true,
          isActive: true,
          isAvailable: true,
          stockStatus: true,
        },
      });
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        nameEn: row.nameEn,
        categoryId: row.categoryId,
        categoryName: row.category.nameEn,
        basePrice: toNumber(row.basePrice),
        discountPrice: row.discountPrice === null ? null : toNumber(row.discountPrice),
        thumbnailUrl: row.thumbnailUrl,
        isActive: row.isActive,
        isAvailable: row.isAvailable,
        stockStatus: row.stockStatus,
      }));
    },

    /** Every product with its options, for the pickers in the deal editor. */
    async pickerOptions(): Promise<ProductPickerOption[]> {
      const rows = await prisma.product.findMany({
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { nameEn: 'asc' }],
        select: {
          id: true,
          nameEn: true,
          variantGroups: {
            orderBy: { sortOrder: 'asc' },
            select: {
              nameEn: true,
              variants: { orderBy: { sortOrder: 'asc' }, select: { id: true, nameEn: true } },
            },
          },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        nameEn: row.nameEn,
        variants: row.variantGroups.flatMap((group) =>
          group.variants.map((variant) => ({
            id: variant.id,
            label: `${group.nameEn}: ${variant.nameEn}`,
          })),
        ),
      }));
    },

    async get(id: string): Promise<AdminProductDetail | null> {
      const row = await prisma.product.findUnique({
        where: { id },
        include: {
          variantGroups: {
            orderBy: { sortOrder: 'asc' },
            include: { variants: { orderBy: { sortOrder: 'asc' } } },
          },
          productAddons: { select: { addonId: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        slug: row.slug,
        nameEn: row.nameEn,
        descriptionEn: row.descriptionEn,
        categoryId: row.categoryId,
        basePrice: toNumber(row.basePrice),
        discountPrice: row.discountPrice === null ? null : toNumber(row.discountPrice),
        thumbnailUrl: row.thumbnailUrl,
        preparationTime: row.preparationTime,
        sortOrder: row.sortOrder,
        isAvailable: row.isAvailable,
        isFeatured: row.isFeatured,
        isPopular: row.isPopular,
        isActive: row.isActive,
        stockStatus: row.stockStatus,
        variantGroups: row.variantGroups.map((group) => ({
          id: group.id,
          nameEn: group.nameEn,
          isRequired: group.isRequired,
          variants: group.variants.map((variant) => ({
            id: variant.id,
            nameEn: variant.nameEn,
            priceModifier: toNumber(variant.priceModifier),
            isAvailable: variant.isAvailable,
          })),
        })),
        addonIds: row.productAddons.map((link) => link.addonId),
      };
    },

    async create(input: ProductInput): Promise<string> {
      await assertReferencesExist(input);
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = await uniqueSlug(input.nameEn, slugTaken);
        try {
          // One nested create is one transaction: a product never exists half-built.
          const row = await prisma.product.create({
            data: {
              slug,
              ...scalars(input),
              variantGroups: { create: input.variantGroups.map(groupCreate) },
              productAddons: { create: input.addonIds.map((addonId) => ({ addonId })) },
            },
            select: { id: true },
          });
          return row.id;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw new AppError('SLUG_CONFLICT', 'Could not create the product. Please try again.', 409);
    },

    /**
     * Saves the whole product, keeping the ids of options that were only edited so customers'
     * open carts keep working. Everything is one nested update, so it is all-or-nothing.
     */
    async update(id: string, input: ProductInput): Promise<void> {
      const existing = await prisma.product.findUnique({
        where: { id },
        select: {
          variantGroups: { select: { id: true, variants: { select: { id: true } } } },
        },
      });
      if (!existing) throw NOT_FOUND();
      await assertReferencesExist(input);

      const groupIds = new Set(existing.variantGroups.map((group) => group.id));
      const variantIdsByGroup = new Map(
        existing.variantGroups.map((group) => [group.id, new Set(group.variants.map((v) => v.id))]),
      );

      const keptGroups: { id: string; group: GroupInput; index: number }[] = [];
      const newGroups: { group: GroupInput; index: number }[] = [];
      input.variantGroups.forEach((group, index) => {
        if (group.id === undefined) {
          newGroups.push({ group, index });
        } else if (groupIds.has(group.id)) {
          keptGroups.push({ id: group.id, group, index });
        } else {
          throw new AppError(
            'INVALID_GROUP',
            'An option group no longer exists. Reload and try again.',
            409,
          );
        }
      });

      const keptVariantIds = new Set<string>();
      for (const { id: groupId, group } of keptGroups) {
        for (const variant of group.variants) {
          if (variant.id === undefined) continue;
          if (!variantIdsByGroup.get(groupId)?.has(variant.id)) {
            throw new AppError(
              'INVALID_VARIANT',
              'An option no longer exists. Reload and try again.',
              409,
            );
          }
          keptVariantIds.add(variant.id);
        }
      }

      const allVariantIds = [...variantIdsByGroup.values()].flatMap((ids) => [...ids]);
      const removedVariantIds = allVariantIds.filter((variantId) => !keptVariantIds.has(variantId));
      if (removedVariantIds.length > 0) {
        const inDeals = await prisma.dealItem.count({
          where: { variantId: { in: removedVariantIds } },
        });
        if (inDeals > 0) {
          throw new AppError(
            'VARIANT_IN_DEAL',
            'An option you removed is used in a deal. Remove it from the deal first, or mark it unavailable instead.',
            409,
          );
        }
      }

      try {
        await prisma.product.update({
          where: { id },
          data: {
            ...scalars(input),
            variantGroups: {
              deleteMany: { id: { notIn: keptGroups.map((entry) => entry.id) } },
              update: keptGroups.map(({ id: groupId, group, index }) => ({
                where: { id: groupId },
                data: {
                  nameEn: group.nameEn,
                  isRequired: group.isRequired,
                  sortOrder: index,
                  variants: {
                    deleteMany: {
                      id: {
                        notIn: group.variants.flatMap((variant) =>
                          variant.id === undefined ? [] : [variant.id],
                        ),
                      },
                    },
                    update: group.variants.flatMap((variant, variantIndex) =>
                      variant.id === undefined
                        ? []
                        : [{ where: { id: variant.id }, data: variantData(variant, variantIndex) }],
                    ),
                    create: group.variants.flatMap((variant, variantIndex) =>
                      variant.id === undefined ? [variantData(variant, variantIndex)] : [],
                    ),
                  },
                },
              })),
              create: newGroups.map(({ group, index }) => groupCreate(group, index)),
            },
            productAddons: {
              deleteMany: {},
              create: input.addonIds.map((addonId) => ({ addonId })),
            },
          },
        });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        if (isForeignKeyViolation(error)) {
          throw new AppError('VARIANT_IN_DEAL', 'An option you removed is used in a deal.', 409);
        }
        throw error;
      }
    },

    /**
     * Deletes a product that was never sold. One that has been ordered is hidden instead, because
     * past orders and receipts still point at it. One inside a deal must be taken out of the deal.
     */
    async remove(id: string): Promise<'deleted' | 'archived'> {
      const product = await prisma.product.findUnique({
        where: { id },
        select: { _count: { select: { orderItems: true, dealItems: true } } },
      });
      if (!product) throw NOT_FOUND();
      if (product._count.dealItems > 0) {
        throw new AppError(
          'PRODUCT_IN_DEAL',
          'This product is part of a deal. Remove it from the deal first.',
          409,
        );
      }
      if (product._count.orderItems > 0) {
        await prisma.product.update({
          where: { id },
          data: { isActive: false, isAvailable: false },
        });
        return 'archived';
      }
      try {
        await prisma.product.delete({ where: { id } });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        throw error;
      }
      return 'deleted';
    },

    /** One-tap "sold out" / "back on" from the product list. */
    async setAvailability(id: string, isAvailable: boolean): Promise<void> {
      try {
        await prisma.product.update({ where: { id }, data: { isAvailable } });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        throw error;
      }
    },

    async listAddons(): Promise<AdminAddon[]> {
      const rows = await prisma.addon.findMany({
        orderBy: { nameEn: 'asc' },
        include: { _count: { select: { productAddons: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        nameEn: row.nameEn,
        price: toNumber(row.price),
        isAvailable: row.isAvailable,
        productCount: row._count.productAddons,
      }));
    },

    async createAddon(input: AddonInput): Promise<string> {
      const row = await prisma.addon.create({ data: input, select: { id: true } });
      return row.id;
    },

    async updateAddon(id: string, input: AddonInput): Promise<void> {
      try {
        await prisma.addon.update({ where: { id }, data: input });
      } catch (error) {
        if (isNotFound(error)) throw ADDON_NOT_FOUND();
        throw error;
      }
    },

    /** Orders keep their own copy of add-on names and prices, so removing one is always safe. */
    async removeAddon(id: string): Promise<void> {
      try {
        await prisma.addon.delete({ where: { id } });
      } catch (error) {
        if (isNotFound(error)) throw ADDON_NOT_FOUND();
        throw error;
      }
    },
  };
}

export type ProductRepository = ReturnType<typeof createProductRepository>;

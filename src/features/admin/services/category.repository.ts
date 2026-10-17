import type { PrismaClient } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { uniqueSlug } from '../logic/slug';
import type { CategoryInput } from '../schemas/catalog.schema';
import type { AdminCategory } from '../types/admin.types';
import { isNotFound, isUniqueViolation } from './prisma-errors';

const NOT_FOUND = () => new AppError('CATEGORY_NOT_FOUND', 'That category does not exist.', 404);

export function createCategoryRepository(prisma: PrismaClient) {
  const slugTaken = async (slug: string) =>
    (await prisma.category.findUnique({ where: { slug }, select: { id: true } })) !== null;

  return {
    async list(): Promise<AdminCategory[]> {
      const rows = await prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
        include: { _count: { select: { products: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        nameEn: row.nameEn,
        descriptionEn: row.descriptionEn,
        imageUrl: row.imageUrl,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        isFeatured: row.isFeatured,
        productCount: row._count.products,
      }));
    },

    async create(input: CategoryInput): Promise<string> {
      for (let attempt = 0; attempt < 5; attempt++) {
        const slug = await uniqueSlug(input.nameEn, slugTaken);
        try {
          const row = await prisma.category.create({
            data: { slug, ...input },
            select: { id: true },
          });
          return row.id;
        } catch (error) {
          // Someone else took the slug between the check and the insert: pick the next one.
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw new AppError('SLUG_CONFLICT', 'Could not create the category. Please try again.', 409);
    },

    async update(id: string, input: CategoryInput): Promise<void> {
      try {
        await prisma.category.update({ where: { id }, data: input });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        throw error;
      }
    },

    /** Refuses while products remain, so nothing silently disappears from the menu. */
    async remove(id: string): Promise<void> {
      const category = await prisma.category.findUnique({
        where: { id },
        select: { _count: { select: { products: true } } },
      });
      if (!category) throw NOT_FOUND();
      if (category._count.products > 0) {
        throw new AppError(
          'CATEGORY_NOT_EMPTY',
          'Move or delete this category’s products first, or hide the category instead.',
          409,
        );
      }
      try {
        await prisma.category.delete({ where: { id } });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        throw error;
      }
    },
  };
}

export type CategoryRepository = ReturnType<typeof createCategoryRepository>;

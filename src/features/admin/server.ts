import { revalidateTag } from 'next/cache';
import { DEALS_TAG, MENU_TAG } from '@/features/menu/cache-tags';
import { prisma } from '@/lib/prisma/client';
import { createCategoryRepository } from './services/category.repository';
import { createDealRepository } from './services/deal.repository';
import { createOperationsRepository } from './services/operations.repository';
import { createAdminOrdersRepository } from './services/orders.repository';
import { createProductRepository } from './services/product.repository';

/** Lazily wires the admin panel to Prisma (server-only). */
export const categories = createCategoryRepository(prisma);
export const products = createProductRepository(prisma);
export const deals = createDealRepository(prisma);
export const operations = createOperationsRepository(prisma);
export const adminOrders = createAdminOrdersRepository(prisma);

/**
 * Customers see the menu from a cache. After any change the owner makes, drop it so the next visit
 * shows the new menu straight away. Deals embed product names and availability, so both go.
 */
export function revalidateMenu(): void {
  revalidateTag(MENU_TAG, { expire: 0 });
  revalidateTag(DEALS_TAG, { expire: 0 });
}

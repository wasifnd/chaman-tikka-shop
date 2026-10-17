import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma/client';
import {
  DEALS_REVALIDATE_SECONDS,
  DEALS_TAG,
  MENU_REVALIDATE_SECONDS,
  MENU_TAG,
} from './cache-tags';
import { createMenuRepository } from './services/menu.repository';

const repository = createMenuRepository(prisma);

/** Cached reads for server components. Importing this from a client component is a mistake. */
export const getMenu = unstable_cache(() => repository.listMenu(), ['menu'], {
  tags: [MENU_TAG],
  revalidate: MENU_REVALIDATE_SECONDS,
});

export const getProduct = unstable_cache(
  (slug: string) => repository.findProduct(slug),
  ['product'],
  { tags: [MENU_TAG], revalidate: MENU_REVALIDATE_SECONDS },
);

export const getDeals = unstable_cache(() => repository.listDeals(new Date()), ['deals'], {
  tags: [DEALS_TAG],
  revalidate: DEALS_REVALIDATE_SECONDS,
});

export const getDeal = unstable_cache(
  (slug: string) => repository.findDeal(slug, new Date()),
  ['deal'],
  { tags: [DEALS_TAG], revalidate: DEALS_REVALIDATE_SECONDS },
);

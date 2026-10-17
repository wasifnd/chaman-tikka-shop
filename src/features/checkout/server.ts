import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma/client';
import { createQuoteLoader } from './services/quote.repository';
import { createQuoteService, type QuoteService } from './services/quote.service';
import { createZonesRepository } from './services/zones.repository';

let service: QuoteService | undefined;

/** Lazily wires the quote service to Prisma (server-only). */
export function getQuoteService(): QuoteService {
  service ??= createQuoteService(createQuoteLoader(prisma));
  return service;
}

export const ZONES_TAG = 'zones';

/** Delivery areas change rarely; cached for a few minutes. */
export const getDeliveryZones = unstable_cache(
  () => createZonesRepository(prisma).listActive(),
  ['delivery-zones'],
  { tags: [ZONES_TAG], revalidate: 300 },
);

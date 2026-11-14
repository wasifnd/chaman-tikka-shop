import { SHOP } from '@/features/orders/receipt/receipt.repository';
import { prisma } from '@/lib/prisma/client';
import { createKhataRepository } from './services/khata.repository';
import { createKhataService } from './services/khata.service';
import { createPrismaKhataStore } from './services/khata.store';

/** Server-only wiring for the khata. */
export const khataRepository = createKhataRepository(prisma);
export const khataService = createKhataService(createPrismaKhataStore(prisma));
export { SHOP };

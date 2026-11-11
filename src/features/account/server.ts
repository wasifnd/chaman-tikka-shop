import { prisma } from '@/lib/prisma/client';
import { createAccountRepository } from './services/account.repository';

/** Wires the customer account to Prisma (server-only). */
export const account = createAccountRepository(prisma);

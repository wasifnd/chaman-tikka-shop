import { prisma } from '@/lib/prisma/client';
import { verificationConfig } from './logic/whatsapp';
import { createVerificationRepository } from './services/verification.repository';
import { createVerificationService } from './services/verification.service';

/** Wires phone verification to Prisma (server-only). */
export const verification = createVerificationService(createVerificationRepository(prisma));

/** Read on each call so tests and a restarted server always see the current settings. */
export const getVerificationConfig = () => verificationConfig(process.env);

import type { PrismaClient } from '@prisma/client';
import type { VerificationRepository } from './verification.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const select = { id: true, phone: true, code: true, expiresAt: true, verifiedAt: true } as const;

export function createVerificationRepository(prisma: PrismaClient): VerificationRepository {
  return {
    create(input) {
      return prisma.phoneVerification.create({ data: input, select });
    },

    findById(id) {
      // Anything that isn't a UUID can't be one of ours (and would make Postgres throw).
      if (!UUID.test(id)) return Promise.resolve(null);
      return prisma.phoneVerification.findUnique({ where: { id }, select });
    },

    async markVerified(phone, code, at) {
      const { count } = await prisma.phoneVerification.updateMany({
        where: { phone, code, verifiedAt: null, expiresAt: { gt: at } },
        data: { verifiedAt: at },
      });
      return count > 0;
    },

    async markVerifiedById(id, at) {
      if (!UUID.test(id)) return false;
      const { count } = await prisma.phoneVerification.updateMany({
        where: { id, verifiedAt: null, expiresAt: { gt: at } },
        data: { verifiedAt: at },
      });
      return count > 0;
    },
  };
}

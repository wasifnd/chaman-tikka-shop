import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '@/lib/errors';
import type { AuthRepository, AuthUserRecord } from './auth.service';

type UserWithCustomer = Prisma.UserGetPayload<{ include: { customer: { select: { id: true } } } }>;

const withCustomer = { customer: { select: { id: true } } } as const;

function toRecord(user: UserWithCustomer): AuthUserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    isActive: user.isActive,
    customerId: user.customer?.id ?? null,
  };
}

export function createPrismaAuthRepository(prisma: PrismaClient): AuthRepository {
  return {
    async findUserByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email }, include: withCustomer });
      return user ? toRecord(user) : null;
    },

    async findUserById(id) {
      const user = await prisma.user.findUnique({ where: { id }, include: withCustomer });
      return user ? toRecord(user) : null;
    },

    async createCustomerUser({ email, passwordHash, name, phone }) {
      try {
        // Nested create runs in one transaction: no user without a customer profile.
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            role: 'CUSTOMER',
            customer: { create: { name, ...(phone ? { phone } : {}) } },
          },
          include: withCustomer,
        });
        return toRecord(user);
      } catch (error) {
        // Two signups racing past the existence check: the unique index is the real guard.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
        }
        throw error;
      }
    },

    async touchLastLogin(userId) {
      await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    },

    async saveRefreshToken({ userId, tokenHash, expiresAt }) {
      await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
    },

    findRefreshToken(tokenHash) {
      return prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, revokedAt: true },
      });
    },

    async revokeRefreshToken(id) {
      // Conditional update makes rotation atomic: only one concurrent caller gets count 1.
      const { count } = await prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return count === 1;
    },

    async revokeAllRefreshTokens(userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}

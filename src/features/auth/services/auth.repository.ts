import { Prisma, type PrismaClient } from '@prisma/client';
import { emailTaken, phoneTaken, type AuthRepository, type AuthUserRecord } from './auth.service';

type UserWithCustomer = Prisma.UserGetPayload<{ include: { customer: { select: { id: true } } } }>;

const withCustomer = { customer: { select: { id: true } } } as const;
const TRANSACTION_TIMING = { maxWait: 10_000, timeout: 20_000 };

function toRecord(user: UserWithCustomer): AuthUserRecord {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    isActive: user.isActive,
    customerId: user.customer?.id ?? null,
  };
}

export function createPrismaAuthRepository(prisma: PrismaClient): AuthRepository {
  return {
    async findUserByPhone(phone) {
      const user = await prisma.user.findUnique({ where: { phone }, include: withCustomer });
      return user ? toRecord(user) : null;
    },

    async findUserByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email }, include: withCustomer });
      return user ? toRecord(user) : null;
    },

    async findUserById(id) {
      const user = await prisma.user.findUnique({ where: { id }, include: withCustomer });
      return user ? toRecord(user) : null;
    },

    async createCustomerUser({ phone, phoneVerifiedAt, email, passwordHash, name }) {
      try {
        return await prisma.$transaction(async (tx) => {
          // Nested create: no user without a customer profile.
          const user = await tx.user.create({
            data: {
              phone,
              phoneVerifiedAt,
              email: email ?? null,
              passwordHash,
              role: 'CUSTOMER',
              customer: { create: { name } },
            },
            include: withCustomer,
          });
          // Guest orders with this number become theirs, but only ones where the number was
          // proven when ordering: an unproven order may have been placed by anyone.
          if (user.customer) {
            await tx.order.updateMany({
              where: { customerId: null, guestPhone: phone, phoneVerifiedAt: { not: null } },
              data: { customerId: user.customer.id },
            });
          }
          return toRecord(user);
          // Same allowances as placing an order: a busy or distant database can be slow to start.
        }, TRANSACTION_TIMING);
      } catch (error) {
        // Two signups racing past the existence check: the unique index is the real guard.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = JSON.stringify(error.meta ?? {});
          throw target.includes('email') ? emailTaken() : phoneTaken();
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
        select: { id: true, userId: true, expiresAt: true, revokedAt: true, rotatedAt: true },
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

    async rotateRefreshToken(id, at) {
      // Conditional update makes rotation atomic: only one concurrent caller gets count 1.
      const { count } = await prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: at, rotatedAt: at },
      });
      return count === 1;
    },

    async revokeAllRefreshTokens(userId) {
      // One transaction: end every session and take away any grace period in one go.
      await prisma.$transaction([
        prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        prisma.refreshToken.updateMany({
          where: { userId, rotatedAt: { not: null } },
          data: { rotatedAt: null },
        }),
      ]);
    },
  };
}

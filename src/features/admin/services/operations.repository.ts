import type { PrismaClient } from '@prisma/client';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { AppError } from '@/lib/errors';
import { hashPassword } from '@/lib/auth/password';
import type { Role } from '@/lib/auth/roles';
import { canAssignRole, canManageMember } from '../logic/team-rules';
import type {
  CouponInput,
  RestaurantSettingsInput,
  SettingsUpdate,
  TeamCreateInput,
  TeamUpdateInput,
  ZoneInput,
} from '../schemas/operations.schema';
import type { AdminCoupon, AdminSettings, AdminZone, TeamMember } from '../types/admin.types';
import { isNotFound, isUniqueViolation } from './prisma-errors';

const SETTINGS_KEY = 'restaurant';
const DEFAULT_RESTAURANT: RestaurantSettingsInput = {
  name: 'BBQ Store',
  address: null,
  taxRatePercent: 0,
  orderingEnabled: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readRestaurant(value: unknown): RestaurantSettingsInput {
  if (!isRecord(value)) return DEFAULT_RESTAURANT;
  const { name, address, taxRatePercent, orderingEnabled } = value;
  return {
    name: typeof name === 'string' && name.trim() ? name : DEFAULT_RESTAURANT.name,
    address: typeof address === 'string' && address.trim() ? address : null,
    taxRatePercent: typeof taxRatePercent === 'number' ? taxRatePercent : 0,
    orderingEnabled: typeof orderingEnabled === 'boolean' ? orderingEnabled : true,
  };
}

export function createOperationsRepository(prisma: PrismaClient) {
  return {
    // ---- Restaurant settings and opening hours ----
    async getSettings(): Promise<AdminSettings> {
      const [setting, hours] = await Promise.all([
        prisma.setting.findUnique({ where: { key: SETTINGS_KEY }, select: { value: true } }),
        prisma.businessHour.findMany({ orderBy: { dayOfWeek: 'asc' } }),
      ]);
      const byDay = new Map(hours.map((row) => [row.dayOfWeek, row]));
      return {
        restaurant: readRestaurant(setting?.value),
        // A day with no row has never been set up, which the customer site treats as closed.
        hours: Array.from({ length: 7 }, (_, dayOfWeek) => {
          const row = byDay.get(dayOfWeek);
          return {
            dayOfWeek,
            isClosed: row?.isClosed ?? true,
            openTime: row?.openTime ?? null,
            closeTime: row?.closeTime ?? null,
          };
        }),
      };
    },

    /** Saves settings and all seven days together, so the site never sees half of a change. */
    async saveSettings(update: SettingsUpdate): Promise<void> {
      const existing = await prisma.setting.findUnique({
        where: { key: SETTINGS_KEY },
        select: { value: true },
      });
      // Keep any keys this screen doesn't manage (e.g. timezone) instead of wiping them.
      const merged = {
        ...(isRecord(existing?.value) ? existing.value : {}),
        ...update.restaurant,
      };
      await prisma.$transaction([
        prisma.setting.upsert({
          where: { key: SETTINGS_KEY },
          update: { value: merged },
          create: { key: SETTINGS_KEY, group: 'general', value: merged },
        }),
        ...update.hours.map((day) => {
          const data = {
            isClosed: day.isClosed,
            openTime: day.isClosed ? null : (day.openTime ?? null),
            closeTime: day.isClosed ? null : (day.closeTime ?? null),
          };
          return prisma.businessHour.upsert({
            where: { dayOfWeek: day.dayOfWeek },
            update: data,
            create: { dayOfWeek: day.dayOfWeek, ...data },
          });
        }),
      ]);
    },

    // ---- Delivery zones ----
    async listZones(): Promise<AdminZone[]> {
      const rows = await prisma.deliveryZone.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return rows.map(mapZone);
    },

    async createZone(input: ZoneInput): Promise<string> {
      const row = await prisma.deliveryZone.create({ data: input, select: { id: true } });
      return row.id;
    },

    async updateZone(id: string, input: ZoneInput): Promise<void> {
      try {
        await prisma.deliveryZone.update({ where: { id }, data: input });
      } catch (error) {
        if (isNotFound(error)) throw zoneNotFound();
        throw error;
      }
    },

    /** An area customers have saved addresses in is switched off instead of deleted. */
    async removeZone(id: string): Promise<'deleted' | 'archived'> {
      const zone = await prisma.deliveryZone.findUnique({
        where: { id },
        select: { _count: { select: { addresses: true } } },
      });
      if (!zone) throw zoneNotFound();
      if (zone._count.addresses > 0) {
        await prisma.deliveryZone.update({ where: { id }, data: { isActive: false } });
        return 'archived';
      }
      await prisma.deliveryZone.delete({ where: { id } });
      return 'deleted';
    },

    // ---- Coupons ----
    async listCoupons(): Promise<AdminCoupon[]> {
      const rows = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(mapCoupon);
    },

    async createCoupon(input: CouponInput): Promise<string> {
      try {
        const row = await prisma.coupon.create({
          data: { ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
          select: { id: true },
        });
        return row.id;
      } catch (error) {
        throw couponConflict(error);
      }
    },

    async updateCoupon(id: string, input: CouponInput): Promise<void> {
      try {
        await prisma.coupon.update({
          where: { id },
          data: { ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
        });
      } catch (error) {
        if (isNotFound(error)) throw couponNotFound();
        throw couponConflict(error);
      }
    },

    /** A coupon that has been used stays on record (switched off) so old orders still explain their discount. */
    async removeCoupon(id: string): Promise<'deleted' | 'archived'> {
      const coupon = await prisma.coupon.findUnique({
        where: { id },
        select: { usedCount: true, _count: { select: { orders: true } } },
      });
      if (!coupon) throw couponNotFound();
      if (coupon.usedCount > 0 || coupon._count.orders > 0) {
        await prisma.coupon.update({ where: { id }, data: { isActive: false } });
        return 'archived';
      }
      await prisma.coupon.delete({ where: { id } });
      return 'deleted';
    },

    // ---- Team (staff and admin accounts) ----
    async listTeam(): Promise<TeamMember[]> {
      const rows = await prisma.user.findMany({
        where: { role: { in: ['STORE_STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
        orderBy: [{ role: 'asc' }, { email: 'asc' }],
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role as TeamMember['role'],
        isActive: row.isActive,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    async createMember(actor: { id: string; role: Role }, input: TeamCreateInput): Promise<string> {
      if (!canAssignRole(actor, input.role)) {
        throw new AppError('FORBIDDEN', 'Only a super admin can create another admin.', 403);
      }
      try {
        const row = await prisma.user.create({
          data: {
            email: input.email,
            role: input.role,
            passwordHash: await hashPassword(input.password),
            emailVerified: true,
          },
          select: { id: true },
        });
        return row.id;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409, {
            email: 'An account with this email already exists',
          });
        }
        throw error;
      }
    },

    async updateMember(
      actor: { id: string; role: Role },
      targetId: string,
      input: TeamUpdateInput,
    ): Promise<void> {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true },
      });
      if (!target) throw memberNotFound();
      const decision = canManageMember(actor, target);
      if (decision === 'self') {
        throw new AppError('TEAM_SELF', 'You cannot change your own account here.', 403);
      }
      if (decision === 'forbidden') {
        // A customer or super admin is invisible here; an admin the caller may not touch is forbidden.
        if (target.role === 'CUSTOMER') throw memberNotFound();
        throw new AppError('FORBIDDEN', 'You do not have permission to change this account.', 403);
      }
      if (input.role !== undefined && !canAssignRole(actor, input.role)) {
        throw new AppError('FORBIDDEN', 'Only a super admin can make someone an admin.', 403);
      }

      const loggedOut = input.isActive === false || input.password !== undefined;
      await prisma.$transaction([
        prisma.user.update({
          where: { id: targetId },
          data: {
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
            ...(input.password === undefined
              ? {}
              : { passwordHash: await hashPassword(input.password) }),
          },
        }),
        // Switching someone off or resetting their password also ends every session they have open.
        ...(loggedOut
          ? [
              prisma.refreshToken.updateMany({
                where: { userId: targetId, revokedAt: null },
                data: { revokedAt: new Date() },
              }),
            ]
          : []),
      ]);
    },
  };
}

const zoneNotFound = () =>
  new AppError('ZONE_NOT_FOUND', 'That delivery area does not exist.', 404);
const couponNotFound = () => new AppError('COUPON_NOT_FOUND', 'That coupon does not exist.', 404);
const memberNotFound = () => new AppError('MEMBER_NOT_FOUND', 'That account does not exist.', 404);

function couponConflict(error: unknown): unknown {
  if (isUniqueViolation(error)) {
    return new AppError('COUPON_CODE_TAKEN', 'A coupon with this code already exists.', 409, {
      code: 'A coupon with this code already exists',
    });
  }
  return error;
}

type Money = { toString(): string };

function mapZone(row: {
  id: string;
  name: string;
  charge: Money;
  freeDeliveryAbove: Money | null;
  minOrderAmount: Money;
  isActive: boolean;
  sortOrder: number;
}): AdminZone {
  return {
    id: row.id,
    name: row.name,
    charge: toNumber(row.charge),
    freeDeliveryAbove: row.freeDeliveryAbove === null ? null : toNumber(row.freeDeliveryAbove),
    minOrderAmount: toNumber(row.minOrderAmount),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function mapCoupon(row: {
  id: string;
  code: string;
  type: 'FIXED' | 'PERCENTAGE';
  amount: Money;
  minimumOrderAmount: Money;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}): AdminCoupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    amount: toNumber(row.amount),
    minimumOrderAmount: toNumber(row.minimumOrderAmount),
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isActive: row.isActive,
  };
}

export type OperationsRepository = ReturnType<typeof createOperationsRepository>;

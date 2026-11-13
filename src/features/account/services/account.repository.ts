import type { PrismaClient } from '@prisma/client';
import { isNotFound } from '@/features/admin/services/prisma-errors';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { AppError } from '@/lib/errors';
import { ORDERS_PAGE_SIZE } from '../logic/order-summary';
import { MAX_ADDRESSES, type AddressInput } from '../schemas/address.schema';
import type { CustomerProfile, OrderHistoryPage, SavedAddress } from '../types/account.types';

const NOT_FOUND = () => new AppError('ADDRESS_NOT_FOUND', 'That address does not exist.', 404);

const addressSelect = {
  id: true,
  label: true,
  addressLine1: true,
  addressLine2: true,
  zoneId: true,
  isDefault: true,
  zone: { select: { name: true, isActive: true } },
} as const;

/**
 * Everything here is scoped to one customer: every query names the customer, so no id a visitor
 * sends can reach somebody else's orders or addresses.
 */
export function createAccountRepository(prisma: PrismaClient) {
  async function assertZoneUsable(zoneId: string): Promise<void> {
    const zone = await prisma.deliveryZone.findUnique({
      where: { id: zoneId },
      select: { isActive: true },
    });
    if (!zone?.isActive) {
      throw new AppError('ZONE_INVALID', 'We do not deliver to that area.', 422, {
        zoneId: 'We do not deliver to that area',
      });
    }
  }

  /** Makes the oldest address the default when none is, so a customer with addresses always has one. */
  async function ensureDefault(customerId: string): Promise<void> {
    const hasDefault = await prisma.address.count({ where: { customerId, isDefault: true } });
    if (hasDefault > 0) return;
    const oldest = await prisma.address.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (oldest)
      await prisma.address.update({ where: { id: oldest.id }, data: { isDefault: true } });
  }

  return {
    async listAddresses(customerId: string): Promise<SavedAddress[]> {
      const rows = await prisma.address.findMany({
        where: { customerId, zoneId: { not: null } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: addressSelect,
      });
      return rows.flatMap((row) =>
        row.zoneId && row.zone
          ? [
              {
                id: row.id,
                label: row.label,
                addressLine1: row.addressLine1,
                addressLine2: row.addressLine2,
                zoneId: row.zoneId,
                zoneName: row.zone.name,
                zoneActive: row.zone.isActive,
                isDefault: row.isDefault,
              },
            ]
          : [],
      );
    },

    async getProfile(customerId: string): Promise<CustomerProfile | null> {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          name: true,
          user: { select: { phone: true, phoneVerifiedAt: true, email: true } },
        },
      });
      return customer
        ? {
            name: customer.name,
            phone: customer.user.phone,
            phoneVerified: customer.user.phoneVerifiedAt !== null,
            email: customer.user.email,
          }
        : null;
    },

    async createAddress(customerId: string, input: AddressInput): Promise<string> {
      await assertZoneUsable(input.zoneId);
      const existing = await prisma.address.count({ where: { customerId } });
      if (existing >= MAX_ADDRESSES) {
        throw new AppError(
          'ADDRESS_LIMIT',
          `You can save up to ${String(MAX_ADDRESSES)} addresses. Delete one to add another.`,
          409,
        );
      }
      // The first address is always the default.
      const makeDefault = input.isDefault || existing === 0;
      const results = await prisma.$transaction([
        // Only one default at a time: choosing a new one unsets the old one in the same transaction.
        ...(makeDefault
          ? [
              prisma.address.updateMany({
                where: { customerId, isDefault: true },
                data: { isDefault: false },
              }),
            ]
          : []),
        prisma.address.create({
          data: {
            customerId,
            label: input.label,
            addressLine1: input.addressLine1,
            addressLine2: input.addressLine2,
            zoneId: input.zoneId,
            isDefault: makeDefault,
          },
          select: { id: true },
        }),
      ]);
      const created = results.at(-1) as { id: string };
      return created.id;
    },

    async updateAddress(customerId: string, id: string, input: AddressInput): Promise<void> {
      const current = await prisma.address.findFirst({
        where: { id, customerId },
        select: { isDefault: true },
      });
      if (!current) throw NOT_FOUND();
      await assertZoneUsable(input.zoneId);

      await prisma.$transaction([
        ...(input.isDefault
          ? [
              prisma.address.updateMany({
                where: { customerId, isDefault: true, id: { not: id } },
                data: { isDefault: false },
              }),
            ]
          : []),
        prisma.address.update({
          where: { id },
          // Unticking "default" on the current default changes nothing: another address has to be chosen.
          data: {
            label: input.label,
            addressLine1: input.addressLine1,
            addressLine2: input.addressLine2,
            zoneId: input.zoneId,
            isDefault: input.isDefault || current.isDefault,
          },
        }),
      ]);
    },

    async deleteAddress(customerId: string, id: string): Promise<void> {
      const current = await prisma.address.findFirst({
        where: { id, customerId },
        select: { id: true },
      });
      if (!current) throw NOT_FOUND();
      try {
        await prisma.address.delete({ where: { id } });
      } catch (error) {
        if (isNotFound(error)) throw NOT_FOUND();
        throw error;
      }
      await ensureDefault(customerId);
    },

    async listOrders(customerId: string, page: number): Promise<OrderHistoryPage> {
      const where = { customerId };
      const [total, rows] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * ORDERS_PAGE_SIZE,
          take: ORDERS_PAGE_SIZE,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            type: true,
            createdAt: true,
            grandTotal: true,
            trackingToken: true,
            items: { select: { productNameSnapshot: true, quantity: true } },
          },
        }),
      ]);
      return {
        total,
        page,
        pageSize: ORDERS_PAGE_SIZE,
        rows: rows.map((row) => ({
          id: row.id,
          orderNumber: row.orderNumber,
          status: row.status,
          type: row.type,
          createdAt: row.createdAt.toISOString(),
          grandTotal: toNumber(row.grandTotal),
          trackingToken: row.trackingToken,
          items: row.items.map((item) => ({
            name: item.productNameSnapshot,
            quantity: item.quantity,
          })),
        })),
      };
    },
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;

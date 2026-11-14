import type { Prisma, PrismaClient } from '@prisma/client';
import { toNumber } from '@/features/menu/services/menu.mappers';
import { normalizePhone } from '@/lib/validation/phone';
import { effectiveLimit } from '../logic/khata-rules';
import type { KhataDetail, KhataEntryView, KhataPage, KhataSummary } from '../types/khata.types';
import { readDefaultLimit } from './khata.store';

export const KHATA_PAGE_SIZE = 30;

type Db = Pick<PrismaClient, 'khata' | 'khataEntry' | 'setting' | 'user'>;
type Money = { toString(): string } | number;

interface KhataRow {
  id: string;
  phone: string;
  name: string;
  balance: Money;
  creditLimit: Money | null;
  createdAt: Date;
  updatedAt: Date;
}

const summarySelect = {
  id: true,
  phone: true,
  name: true,
  balance: true,
  creditLimit: true,
  createdAt: true,
  updatedAt: true,
} as const;

const entrySelect = {
  id: true,
  kind: true,
  amount: true,
  balanceAfter: true,
  note: true,
  createdAt: true,
  order: { select: { id: true, orderNumber: true, trackingToken: true } },
  createdBy: { select: { phone: true, email: true, customer: { select: { name: true } } } },
} as const;

type EntryRow = Prisma.KhataEntryGetPayload<{ select: typeof entrySelect }>;

function toSummary(row: KhataRow, defaultLimit: number): KhataSummary {
  const creditLimit = row.creditLimit === null ? null : toNumber(row.creditLimit);
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    balance: toNumber(row.balance),
    creditLimit,
    limit: effectiveLimit(creditLimit, defaultLimit),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A staff member as shown next to their entries: name, else number, else email. */
export function staffLabel(user: EntryRow['createdBy']): string {
  return user.customer?.name ?? user.phone ?? user.email ?? 'Staff';
}

function toEntry(row: EntryRow, withAuthor: boolean): KhataEntryView {
  return {
    id: row.id,
    kind: row.kind,
    amount: toNumber(row.amount),
    balanceAfter: toNumber(row.balanceAfter),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    by: withAuthor ? staffLabel(row.createdBy) : null,
    order: row.order,
  };
}

/**
 * What a search box value means: something that looks like a phone number matches numbers (in
 * any of the ways people write them), anything else matches names.
 */
export function searchFilter(search: string | undefined): Prisma.KhataWhereInput {
  const text = search?.trim();
  if (!text) return {};
  const digits = text.replace(/[\s\-+().]/g, '');
  if (/^\d{3,}$/.test(digits)) {
    const phone = normalizePhone(text);
    if (phone) return { phone };
    // Part of a number: "0300", "1234567", or a 92-prefixed start.
    const local = digits.startsWith('92') ? `0${digits.slice(2)}` : digits;
    return { phone: { contains: local } };
  }
  return { name: { contains: text, mode: 'insensitive' } };
}

/** Reads khatas for the staff screens, the admin list and the customer's own page. */
export function createKhataRepository(db: Db) {
  async function defaultLimit(): Promise<number> {
    const setting = await db.setting.findUnique({
      where: { key: 'restaurant' },
      select: { value: true },
    });
    return readDefaultLimit(setting?.value);
  }

  async function detail(
    where: Prisma.KhataWhereUniqueInput,
    withAuthor: boolean,
  ): Promise<KhataDetail | null> {
    const [row, limit] = await Promise.all([
      db.khata.findUnique({
        where,
        select: {
          ...summarySelect,
          entries: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: entrySelect },
        },
      }),
      defaultLimit(),
    ]);
    if (!row) return null;
    return {
      ...toSummary(row, limit),
      createdAt: row.createdAt.toISOString(),
      entries: row.entries.map((entry) => toEntry(entry, withAuthor)),
    };
  }

  return {
    defaultLimit,

    /** Khatas biggest balance first; `owingOnly` hides the ones that are paid up. */
    async list({
      search,
      owingOnly = true,
      page = 1,
    }: {
      search?: string | undefined;
      owingOnly?: boolean | undefined;
      page?: number | undefined;
    }): Promise<KhataPage> {
      const where: Prisma.KhataWhereInput = {
        ...searchFilter(search),
        ...(owingOnly ? { balance: { gt: 0 } } : {}),
      };
      const [rows, total, sum, limit] = await Promise.all([
        db.khata.findMany({
          where,
          orderBy: [{ balance: 'desc' }, { name: 'asc' }],
          skip: (page - 1) * KHATA_PAGE_SIZE,
          take: KHATA_PAGE_SIZE,
          select: summarySelect,
        }),
        db.khata.count({ where }),
        db.khata.aggregate({ where, _sum: { balance: true } }),
        defaultLimit(),
      ]);
      return {
        items: rows.map((row) => toSummary(row, limit)),
        total,
        page,
        pageSize: KHATA_PAGE_SIZE,
        totalOwed: sum._sum.balance === null ? 0 : toNumber(sum._sum.balance),
      };
    },

    /** One khata with every entry, for staff (shows who made each entry). */
    findById: (id: string) => detail({ id }, true),

    /** The counter's lookup when a phone number is typed. */
    async findByPhone(phone: string): Promise<KhataSummary | null> {
      const [row, limit] = await Promise.all([
        db.khata.findUnique({ where: { phone }, select: summarySelect }),
        defaultLimit(),
      ]);
      return row ? toSummary(row, limit) : null;
    },

    /**
     * The signed-in customer's own khata: the one for their account's number, once that number
     * is proven theirs. Staff names are left out.
     */
    async findForUser(userId: string): Promise<KhataDetail | null> {
      const phone = await this.verifiedPhone(userId);
      return phone ? detail({ phone }, false) : null;
    },

    /** The account's number if it was proven (WhatsApp), else null. */
    async verifiedPhone(userId: string): Promise<string | null> {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { phone: true, phoneVerifiedAt: true },
      });
      return user?.phone && user.phoneVerifiedAt ? user.phone : null;
    },

    /** One entry with its khata, for a payment receipt. */
    async findEntry(entryId: string) {
      const row = await db.khataEntry.findUnique({
        where: { id: entryId },
        select: { ...entrySelect, khata: { select: summarySelect } },
      });
      if (!row) return null;
      const limit = await defaultLimit();
      return { entry: toEntry(row, true), khata: toSummary(row.khata, limit) };
    },

    /** Admin sets a customer's own limit, or clears it (null) to use the shop's default. */
    async setLimit(id: string, creditLimit: number | null): Promise<boolean> {
      const { count } = await db.khata.updateMany({ where: { id }, data: { creditLimit } });
      return count === 1;
    },
  };
}

export type KhataRepository = ReturnType<typeof createKhataRepository>;

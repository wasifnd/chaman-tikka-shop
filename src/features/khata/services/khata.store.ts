import type { Prisma, PrismaClient } from '@prisma/client';
import { qualifier } from '@/lib/prisma/sql';
import { DEFAULT_KHATA_LIMIT } from '../logic/khata-rules';
import type { KhataStore, KhataTx, LockedKhata } from './khata.ports';

interface KhataLockRow {
  id: string;
  phone: string;
  name: string;
  balance: string;
  credit_limit: string | null;
}

const toLocked = (row: KhataLockRow): LockedKhata => ({
  id: row.id,
  phone: row.phone,
  name: row.name,
  balance: Number(row.balance),
  creditLimit: row.credit_limit === null ? null : Number(row.credit_limit),
});

/** Reads the default limit from the restaurant settings, falling back to Rs. 10,000. */
export function readDefaultLimit(value: unknown): number {
  if (typeof value !== 'object' || value === null) return DEFAULT_KHATA_LIMIT;
  const limit = (value as Record<string, unknown>)['khataLimit'];
  return typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
    ? limit
    : DEFAULT_KHATA_LIMIT;
}

/** Khata changes inside an open transaction (shared by the counter order flow). */
export function createKhataTx(db: Prisma.TransactionClient, schema: string): KhataTx {
  const table = qualifier(schema);

  async function lockWhere(column: 'id' | 'phone', value: string): Promise<LockedKhata | null> {
    // FOR UPDATE holds the row until the transaction ends, so the balance read here is still the
    // balance when the entry is written.
    const rows =
      column === 'id'
        ? await db.$queryRaw<KhataLockRow[]>`
            SELECT id::text AS id, phone, name, balance::text AS balance,
                   credit_limit::text AS credit_limit
            FROM ${table('khatas')} WHERE id = ${value}::uuid FOR UPDATE`
        : await db.$queryRaw<KhataLockRow[]>`
            SELECT id::text AS id, phone, name, balance::text AS balance,
                   credit_limit::text AS credit_limit
            FROM ${table('khatas')} WHERE phone = ${value} FOR UPDATE`;
    const row = rows[0];
    return row ? toLocked(row) : null;
  }

  return {
    lock: (khataId) => lockWhere('id', khataId),

    async lockOrOpen(phone, name) {
      // ON CONFLICT DO NOTHING: two tills opening the same number's khata at once both end up
      // with the one row (the second waits for the first, then finds it).
      await db.$executeRaw`
        INSERT INTO ${table('khatas')} (phone, name, updated_at)
        VALUES (${phone}, ${name}, now())
        ON CONFLICT (phone) DO NOTHING`;
      const locked = await lockWhere('phone', phone);
      if (!locked) throw new Error('Could not open the khata');
      return locked;
    },

    async addEntry(entry) {
      const created = await db.khataEntry.create({
        data: {
          khataId: entry.khataId,
          kind: entry.kind,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          orderId: entry.orderId,
          note: entry.note,
          createdByUserId: entry.userId,
          requestKey: entry.requestKey ?? null,
          createdAt: entry.at,
        },
        select: { id: true },
      });
      await db.khata.update({
        where: { id: entry.khataId },
        data: { balance: entry.balanceAfter },
      });
      return created;
    },

    async findByRequestKey(requestKey) {
      const row = await db.khataEntry.findUnique({
        where: { requestKey },
        select: { id: true, khataId: true, amount: true, balanceAfter: true },
      });
      return row
        ? {
            id: row.id,
            khataId: row.khataId,
            amount: Number(row.amount.toString()),
            balanceAfter: Number(row.balanceAfter.toString()),
          }
        : null;
    },

    async defaultLimit() {
      const setting = await db.setting.findUnique({
        where: { key: 'restaurant' },
        select: { value: true },
      });
      return readDefaultLimit(setting?.value);
    },
  };
}

export interface KhataStoreOptions {
  schema?: string;
  maxWaitMs?: number;
  timeoutMs?: number;
}

export function createPrismaKhataStore(
  prisma: PrismaClient,
  { schema = 'public', maxWaitMs = 10_000, timeoutMs = 20_000 }: KhataStoreOptions = {},
): KhataStore {
  return {
    transaction: (work) =>
      prisma.$transaction((db) => work(createKhataTx(db, schema)), {
        maxWait: maxWaitMs,
        timeout: timeoutMs,
      }),
  };
}

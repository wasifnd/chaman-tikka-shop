import { Prisma, type PrismaClient } from '@prisma/client';
import { createQuoteLoader } from '@/features/checkout/services/quote.repository';
import type { OrderRecord, PlacedOrder } from '../types/order.types';
import type { IdempotencyClaim, OrderStore, OrderTx } from './order.ports';

const SAFE_SCHEMA = /^[a-z0-9_]+$/i;

/** Table names in raw SQL, qualified with the schema so they work through connection poolers. */
function qualifier(schema: string) {
  if (!SAFE_SCHEMA.test(schema)) throw new Error(`Invalid schema name: ${schema}`);
  return (table: string) => Prisma.raw(`"${schema}"."${table}"`);
}

function createTx(db: Prisma.TransactionClient, schema: string): OrderTx {
  const table = qualifier(schema);
  const loadQuote = createQuoteLoader(db);

  return {
    async claimIdempotencyKey(key, requestHash): Promise<IdempotencyClaim> {
      // INSERT ... ON CONFLICT DO NOTHING: a duplicate is reported, not raised, so it does not
      // abort the transaction. If another transaction holds the key, this waits for it to finish.
      const { count } = await db.idempotencyKey.createMany({
        data: [{ key, requestHash }],
        skipDuplicates: true,
      });
      if (count === 1) return { claimed: true };
      const existing = await db.idempotencyKey.findUniqueOrThrow({ where: { key } });
      return { claimed: false, requestHash: existing.requestHash, orderId: existing.orderId };
    },

    loadQuoteData: loadQuote,

    async redeemCoupon(couponId, now) {
      // One statement checks the limit and increments, so two orders can never both take the
      // last redemption.
      const updated = await db.$executeRaw`
        UPDATE ${table('coupons')}
        SET used_count = used_count + 1
        WHERE id = ${couponId}::uuid
          AND is_active
          AND (usage_limit IS NULL OR used_count < usage_limit)
          AND (expires_at IS NULL OR expires_at > ${now})`;
      return updated === 1;
    },

    async nextOrderSequence(year) {
      // Atomic upsert-and-increment. It locks the year's counter row until this transaction ends,
      // so order numbers are unique and, if the order fails, the number is given back.
      const rows = await db.$queryRaw<{ value: number }[]>`
        INSERT INTO ${table('order_counters')} (year, value) VALUES (${year}, 1)
        ON CONFLICT (year) DO UPDATE SET value = ${table('order_counters')}.value + 1
        RETURNING value`;
      const row = rows[0];
      if (!row) throw new Error('Could not allocate an order number');
      return row.value;
    },

    async createOrder(record: OrderRecord) {
      const order = await db.order.create({
        data: {
          orderNumber: record.orderNumber,
          customerId: record.customerId,
          guestName: record.contact.name,
          guestPhone: record.contact.phone,
          guestEmail: record.contact.email,
          type: record.type,
          status: record.status,
          ...(record.deliveryAddress
            ? {
                deliveryAddressSnapshot: record.deliveryAddress as unknown as Prisma.InputJsonValue,
              }
            : {}),
          subtotal: record.subtotal,
          couponDiscount: record.couponDiscount,
          deliveryCharge: record.deliveryCharge,
          taxAmount: record.taxAmount,
          grandTotal: record.grandTotal,
          couponId: record.couponId,
          paymentMethod: record.paymentMethod,
          specialInstructions: record.specialInstructions,
          estimatedReadyAt: record.estimatedReadyAt,
          items: {
            create: record.items.map((item) => ({
              productId: item.productId,
              dealId: item.dealId,
              productNameSnapshot: item.name,
              ...(item.variantSnapshot === null ? {} : { variantSnapshot: item.variantSnapshot }),
              ...(item.addonSnapshot === null ? {} : { addonSnapshot: item.addonSnapshot }),
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              subtotal: item.subtotal,
              note: item.note,
            })),
          },
        },
        select: { id: true, trackingToken: true },
      });
      return { id: order.id, trackingToken: order.trackingToken };
    },

    async recordOrderCreated(orderId, at) {
      await db.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: null,
          status: 'RECEIVED',
          note: 'Order placed',
          createdAt: at,
        },
      });
      await db.orderEvent.create({
        data: {
          orderId,
          type: 'order.created',
          payload: { status: 'RECEIVED', at: at.toISOString() },
        },
      });
    },

    async completeIdempotencyKey(key, orderId) {
      await db.idempotencyKey.update({ where: { key }, data: { orderId } });
    },

    async findPlacedOrder(orderId): Promise<Omit<PlacedOrder, 'replayed'>> {
      const order = await db.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          trackingToken: true,
          status: true,
          type: true,
          grandTotal: true,
          estimatedReadyAt: true,
        },
      });
      return { ...order, grandTotal: Number(order.grandTotal.toString()) };
    },
  };
}

export interface OrderStoreOptions {
  /** Postgres schema holding the tables. "public" in production; tests use an isolated one. */
  schema?: string;
  /** How long to wait for a free connection, and how long one order may take. Tests raise these. */
  maxWaitMs?: number;
  timeoutMs?: number;
}

export function createPrismaOrderStore(
  prisma: PrismaClient,
  { schema = 'public', maxWaitMs = 10_000, timeoutMs = 20_000 }: OrderStoreOptions = {},
): OrderStore {
  return {
    transaction: (work) =>
      // Neon can take a moment to wake up, so allow more than the 5 second default.
      prisma.$transaction((db) => work(createTx(db, schema)), {
        maxWait: maxWaitMs,
        timeout: timeoutMs,
      }),
  };
}

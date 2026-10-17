import type { Prisma } from '@prisma/client';
import type { OrdersQuery } from '../schemas/operations.schema';
import { karachiDayStart } from './karachi-time';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Turns the search box and filters into a database filter. Pure so it can be tested directly. */
export function buildOrderFilter(query: OrdersQuery): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  if (query.status) and.push({ status: query.status });
  if (query.type) and.push({ type: query.type });

  const from = query.from ? karachiDayStart(query.from) : null;
  const to = query.to ? karachiDayStart(query.to) : null;
  if (from || to) {
    and.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        // "to" is a whole day, so the range ends at the start of the following day.
        ...(to ? { lt: new Date(to.getTime() + DAY_MS) } : {}),
      },
    });
  }

  if (query.q) {
    const digits = query.q.replace(/\D/g, '');
    and.push({
      OR: [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { guestName: { contains: query.q, mode: 'insensitive' } },
        // Compare phone numbers by their digits only, so "0300-123" finds "03001234567".
        ...(digits.length >= 3 ? [{ guestPhone: { contains: digits } }] : []),
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

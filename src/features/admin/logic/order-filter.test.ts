import { describe, expect, it } from 'vitest';
import { ordersQuerySchema } from '../schemas/operations.schema';
import { buildOrderFilter } from './order-filter';

const parse = (input: Record<string, string> = {}) => ordersQuerySchema.parse(input);

describe('buildOrderFilter', () => {
  it('matches everything when nothing is chosen', () => {
    expect(buildOrderFilter(parse())).toEqual({});
  });

  it('filters by status and type', () => {
    expect(buildOrderFilter(parse({ status: 'PREPARING', type: 'PICKUP' }))).toEqual({
      AND: [{ status: 'PREPARING' }, { type: 'PICKUP' }],
    });
  });

  it('turns a date range into whole Karachi days', () => {
    const filter = buildOrderFilter(parse({ from: '2026-10-17', to: '2026-10-17' }));
    expect(filter).toEqual({
      AND: [
        {
          createdAt: {
            gte: new Date('2026-10-16T19:00:00.000Z'),
            lt: new Date('2026-10-17T19:00:00.000Z'),
          },
        },
      ],
    });
  });

  it('supports an open-ended range', () => {
    const filter = buildOrderFilter(parse({ from: '2026-10-17' }));
    expect(filter).toEqual({
      AND: [{ createdAt: { gte: new Date('2026-10-16T19:00:00.000Z') } }],
    });
  });

  it('ignores an impossible date instead of failing', () => {
    expect(buildOrderFilter(parse({ from: '2026-02-30' }))).toEqual({});
  });

  it('searches order number, name and phone digits', () => {
    const filter = buildOrderFilter(parse({ q: '0300-123' }));
    expect(filter).toEqual({
      AND: [
        {
          OR: [
            { orderNumber: { contains: '0300-123', mode: 'insensitive' } },
            { guestName: { contains: '0300-123', mode: 'insensitive' } },
            { guestPhone: { contains: '0300123' } },
          ],
        },
      ],
    });
  });

  it('does not search phones on a name', () => {
    const filter = buildOrderFilter(parse({ q: 'Ali' }));
    expect(JSON.stringify(filter)).not.toContain('guestPhone');
  });
});

describe('ordersQuerySchema', () => {
  it('defaults to page 1 and drops an empty search', () => {
    expect(parse({ q: '   ' })).toMatchObject({ page: 1, q: undefined });
  });
  it('rejects unknown statuses and bad pages', () => {
    expect(ordersQuerySchema.safeParse({ status: 'NOPE' }).success).toBe(false);
    expect(ordersQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(ordersQuerySchema.safeParse({ from: '17/10/2026' }).success).toBe(false);
  });
});

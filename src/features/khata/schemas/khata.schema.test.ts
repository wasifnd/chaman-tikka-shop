import { describe, expect, it } from 'vitest';
import { counterOrderSchema } from '@/features/orders/schemas/counter-order.schema';
import { adjustmentSchema, limitSchema, listQuerySchema, paymentSchema } from './khata.schema';

const PRODUCT = '33333333-3333-4333-8333-333333333333';
const KEY = '00000000-0000-4000-8000-000000000001';

const counter = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: KEY,
  lines: [{ kind: 'product', productId: PRODUCT, quantity: 1 }],
  orderType: 'PICKUP',
  expectedTotal: 790,
  amountPaid: 790,
  customer: {},
  ...overrides,
});

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? [];

describe('counter orders', () => {
  it('a walk-in paying in full needs no name or number', () => {
    const parsed = counterOrderSchema.parse(counter());
    expect(parsed.customer.name).toBeUndefined();
    expect(parsed.customer.phone).toBeUndefined();
    expect(parsed.amountPaid).toBe(790);
  });

  it('anything unpaid needs a number and a name for the khata', () => {
    const result = counterOrderSchema.safeParse(counter({ amountPaid: 300 }));
    expect(issues(result)).toEqual(['customer.phone', 'customer.name']);
  });

  it('turns any way of writing the number into the stored form', () => {
    const parsed = counterOrderSchema.parse(
      counter({ amountPaid: 0, customer: { name: ' Bilal ', phone: '+92 333 1234500' } }),
    );
    expect(parsed.customer).toEqual({ name: 'Bilal', phone: '03331234500' });
  });

  it('a blank number is "not given", not an invalid one', () => {
    expect(counterOrderSchema.parse(counter({ customer: { phone: '' } })).customer.phone).toBe(
      undefined,
    );
  });

  it('only takeaway and dine in, and never an empty order', () => {
    expect(counterOrderSchema.safeParse(counter({ orderType: 'DELIVERY' })).success).toBe(false);
    expect(counterOrderSchema.safeParse(counter({ lines: [] })).success).toBe(false);
    expect(counterOrderSchema.safeParse(counter({ amountPaid: -1 })).success).toBe(false);
  });
});

describe('khata payments and corrections', () => {
  it('a payment is a positive amount with an optional note', () => {
    const requestKey = '00000000-0000-4000-8000-000000000009';
    expect(paymentSchema.parse({ amount: 300, note: '  ', requestKey })).toEqual({
      amount: 300,
      requestKey,
    });
    expect(paymentSchema.safeParse({ amount: 0, requestKey }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: 10.555, requestKey }).success).toBe(false);
    // Every payment carries a key, so a retry can't be counted twice.
    expect(paymentSchema.safeParse({ amount: 300 }).success).toBe(false);
  });

  it('a correction always needs a reason', () => {
    expect(
      issues(
        adjustmentSchema.safeParse({
          kind: 'CHARGE',
          amount: 5,
          reason: '',
          requestKey: '00000000-0000-4000-8000-000000000009',
        }),
      ),
    ).toEqual(['reason']);
  });

  it('charges and reductions need an amount; a write-off does not', () => {
    expect(
      issues(
        adjustmentSchema.safeParse({
          kind: 'REDUCTION',
          reason: 'Wrong',
          requestKey: '00000000-0000-4000-8000-000000000009',
        }),
      ),
    ).toEqual(['amount']);
    expect(
      adjustmentSchema.parse({
        kind: 'WRITE_OFF',
        reason: 'Goodwill',
        requestKey: '00000000-0000-4000-8000-000000000009',
        expectedBalance: 490,
      }),
    ).toEqual({
      kind: 'WRITE_OFF',
      reason: 'Goodwill',
      requestKey: '00000000-0000-4000-8000-000000000009',
      expectedBalance: 490,
    });
    // A write-off must say which balance it clears.
    expect(
      issues(
        adjustmentSchema.safeParse({
          kind: 'WRITE_OFF',
          reason: 'Goodwill',
          requestKey: '00000000-0000-4000-8000-000000000009',
        }),
      ),
    ).toEqual(['expectedBalance']);
  });

  it('a limit is a non-negative amount, or null for the default', () => {
    expect(limitSchema.parse({ creditLimit: null })).toEqual({ creditLimit: null });
    expect(limitSchema.parse({ creditLimit: 0 })).toEqual({ creditLimit: 0 });
    expect(limitSchema.safeParse({ creditLimit: -1 }).success).toBe(false);
  });

  it('reads the list filters from the address bar', () => {
    expect(listQuerySchema.parse({ q: ' 0333 ', all: '1', page: '2' })).toEqual({
      q: '0333',
      all: '1',
      page: 2,
    });
    expect(listQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

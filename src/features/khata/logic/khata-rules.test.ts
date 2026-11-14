import { describe, expect, it } from 'vitest';
import {
  assertWithinLimit,
  balanceAfter,
  effectiveLimit,
  entryAmount,
  splitCounterPayment,
} from './khata-rules';

function caught(work: () => unknown) {
  try {
    work();
  } catch (error) {
    return error as { code: string; status: number; message: string };
  }
  throw new Error('expected an error');
}

describe('splitting a counter payment', () => {
  it('paid in full leaves nothing for the khata', () => {
    expect(splitCounterPayment(790, 790)).toEqual({ paid: 790, remaining: 0 });
  });

  it('part paid puts the rest on the khata, to the paisa', () => {
    expect(splitCounterPayment(790.5, 300)).toEqual({ paid: 300, remaining: 490.5 });
    expect(splitCounterPayment(0.3, 0.1)).toEqual({ paid: 0.1, remaining: 0.2 });
  });

  it('unpaid puts it all on the khata', () => {
    expect(splitCounterPayment(790, 0)).toEqual({ paid: 0, remaining: 790 });
  });

  it('refuses paying more than the total (change is given at the till)', () => {
    expect(caught(() => splitCounterPayment(790, 800))).toMatchObject({
      code: 'PAYMENT_TOO_LARGE',
      status: 422,
    });
  });
});

describe('khata limits', () => {
  it("uses the customer's own limit, else the shop default", () => {
    expect(effectiveLimit(null, 10_000)).toBe(10_000);
    expect(effectiveLimit(2_500, 10_000)).toBe(2_500);
    expect(effectiveLimit(0, 10_000)).toBe(0);
  });

  it('allows reaching the limit exactly', () => {
    expect(() => {
      assertWithinLimit(9_000, 1_000, 10_000);
    }).not.toThrow();
  });

  it('refuses going over, and says how much room is left', () => {
    const error = caught(() => {
      assertWithinLimit(9_500, 1_000, 10_000);
    });
    expect(error).toMatchObject({ code: 'KHATA_LIMIT_REACHED', status: 409 });
    expect(error.message).toContain('Rs. 500');
  });

  it('a khata already over a lowered limit has no room at all', () => {
    const error = caught(() => {
      assertWithinLimit(12_000, 1, 10_000);
    }) as unknown as { details: Record<string, string> };
    expect(error.details['room']).toBe('0');
  });
});

describe('entry amounts', () => {
  it('orders and charges add to what is owed', () => {
    expect(entryAmount('ORDER', 790, 0)).toBe(790);
    expect(entryAmount('CHARGE', 200, 500)).toBe(200);
  });

  it('payments and reductions take it away, but never below zero', () => {
    expect(entryAmount('PAYMENT', 300, 790)).toBe(-300);
    expect(entryAmount('REDUCTION', 790, 790)).toBe(-790);
    expect(caught(() => entryAmount('PAYMENT', 800, 790))).toMatchObject({
      code: 'MORE_THAN_OWED',
      status: 409,
    });
  });

  it('refuses zero or negative amounts', () => {
    expect(caught(() => entryAmount('PAYMENT', 0, 790))).toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(caught(() => entryAmount('CHARGE', -5, 790))).toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('a write-off clears the whole balance, whatever amount is given', () => {
    expect(entryAmount('WRITE_OFF', 0, 490.5)).toBe(-490.5);
    expect(caught(() => entryAmount('WRITE_OFF', 0, 0))).toMatchObject({ code: 'NOTHING_OWED' });
  });

  it('computes the next balance without float drift', () => {
    expect(balanceAfter(0.1, 0.2)).toBe(0.3);
    expect(balanceAfter(790, -300)).toBe(490);
  });
});

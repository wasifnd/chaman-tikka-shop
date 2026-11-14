import { AppError } from '@/lib/errors';
import { fromMinor, toMinor } from '@/lib/money';
import { formatPrice } from '@/shared/utils/format';

/** How much a customer may owe when admin hasn't set their own limit (changeable in Settings). */
export const DEFAULT_KHATA_LIMIT = 10_000;

export const KHATA_ENTRY_KINDS = ['ORDER', 'PAYMENT', 'CHARGE', 'REDUCTION', 'WRITE_OFF'] as const;
export type KhataEntryKind = (typeof KHATA_ENTRY_KINDS)[number];

/** Corrections only admin may make. */
export const ADJUSTMENT_KINDS = ['CHARGE', 'REDUCTION', 'WRITE_OFF'] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

/** How a counter order's total divides between the till and the khata. */
export interface CounterSplit {
  paid: number;
  remaining: number;
}

/**
 * Splits a counter order's total into what was paid now and what goes on the khata. Paying more
 * than the total is refused: change is given at the till, it isn't kept as credit.
 */
export function splitCounterPayment(total: number, amountPaid: number): CounterSplit {
  const totalMinor = toMinor(total);
  const paidMinor = toMinor(amountPaid);
  if (paidMinor < 0 || paidMinor > totalMinor) {
    throw new AppError(
      'PAYMENT_TOO_LARGE',
      `The amount paid can be at most the order total (${formatPrice(total)}).`,
      422,
      { amountPaid: `At most ${formatPrice(total)}` },
    );
  }
  return { paid: fromMinor(paidMinor), remaining: fromMinor(totalMinor - paidMinor) };
}

/** The customer's own limit when admin set one, else the shop's default. */
export function effectiveLimit(creditLimit: number | null, defaultLimit: number): number {
  return creditLimit ?? defaultLimit;
}

/** Refuses to put `adding` on a khata when that would take it over its limit. */
export function assertWithinLimit(balance: number, adding: number, limit: number): void {
  if (toMinor(balance) + toMinor(adding) <= toMinor(limit)) return;
  const room = Math.max(0, fromMinor(toMinor(limit) - toMinor(balance)));
  throw new AppError(
    'KHATA_LIMIT_REACHED',
    `This would take the khata over its limit of ${formatPrice(limit)}. ` +
      `It already has ${formatPrice(balance)}, so at most ${formatPrice(room)} more can be added.`,
    409,
    { balance: String(balance), limit: String(limit), room: String(room) },
  );
}

/**
 * The signed amount an entry changes the balance by: orders and charges add to what is owed,
 * payments and reductions take it away (never below zero), and a write-off clears it.
 */
export function entryAmount(kind: KhataEntryKind, amount: number, balance: number): number {
  const balanceMinor = toMinor(balance);
  if (kind === 'WRITE_OFF') {
    if (balanceMinor <= 0) {
      throw new AppError('NOTHING_OWED', 'This khata has nothing owed to write off.', 409);
    }
    return fromMinor(-balanceMinor);
  }
  const amountMinor = toMinor(amount);
  if (amountMinor <= 0) {
    throw new AppError('INVALID_AMOUNT', 'Enter an amount above zero.', 422, {
      amount: 'Enter an amount above zero',
    });
  }
  if (kind === 'ORDER' || kind === 'CHARGE') return fromMinor(amountMinor);
  if (amountMinor > balanceMinor) {
    throw new AppError(
      'MORE_THAN_OWED',
      `That is more than is owed. The balance is ${formatPrice(balance)}.`,
      409,
      { amount: `At most ${formatPrice(balance)}` },
    );
  }
  return fromMinor(-amountMinor);
}

/** The balance after adding a signed entry amount. */
export function balanceAfter(balance: number, signedAmount: number): number {
  return fromMinor(toMinor(balance) + toMinor(signedAmount));
}

import { AppError } from '@/lib/errors';
import { toMinor } from '@/lib/money';
import { formatPrice } from '@/shared/utils/format';
import { balanceAfter, entryAmount, type AdjustmentKind } from '../logic/khata-rules';
import type { KhataStore, KhataTx, LockedKhata } from './khata.ports';

export interface KhataChange {
  entryId: string;
  khataId: string;
  amount: number;
  balance: number;
  /** True when this was a repeat of a request already recorded (same request key). */
  replayed: boolean;
}

const notFound = () => new AppError('KHATA_NOT_FOUND', 'That khata does not exist.', 404);

/**
 * A repeat of a payment or correction already recorded: answers with that entry instead of
 * recording the money again. The key belongs to one khata; reusing it elsewhere is refused.
 */
async function earlier(tx: KhataTx, khataId: string, requestKey: string) {
  const found = await tx.findByRequestKey(requestKey);
  if (!found) return null;
  if (found.khataId !== khataId) {
    throw new AppError(
      'REQUEST_KEY_REUSED',
      'This request was already used for another khata.',
      409,
    );
  }
  return {
    entryId: found.id,
    khataId,
    amount: found.amount,
    balance: found.balanceAfter,
    replayed: true,
  };
}

async function lockOrFail(tx: KhataTx, khataId: string): Promise<LockedKhata> {
  const khata = await tx.lock(khataId);
  if (!khata) throw notFound();
  return khata;
}

/**
 * Changes to a khata after the order: payments (staff and admin) and corrections (admin only, a
 * reason required). Each is one new entry; nothing is ever edited or removed. Every change carries
 * the key the screen sent, so pressing Save again after a lost reply never counts it twice.
 */
export function createKhataService(store: KhataStore, now: () => Date = () => new Date()) {
  return {
    /** The customer paid some or all of what they owe. */
    recordPayment(
      khataId: string,
      {
        amount,
        note,
        requestKey,
      }: { amount: number; note?: string | undefined; requestKey: string },
      userId: string,
    ): Promise<KhataChange> {
      return store.transaction(async (tx) => {
        // Lock first: two presses of the same request then queue here, and the second finds
        // the first one's entry.
        const khata = await lockOrFail(tx, khataId);
        const repeat = await earlier(tx, khataId, requestKey);
        if (repeat) return repeat;

        const signed = entryAmount('PAYMENT', amount, khata.balance);
        const after = balanceAfter(khata.balance, signed);
        const entry = await tx.addEntry({
          khataId,
          kind: 'PAYMENT',
          amount: signed,
          balanceAfter: after,
          orderId: null,
          note: note ?? null,
          userId,
          at: now(),
          requestKey,
        });
        return { entryId: entry.id, khataId, amount: signed, balance: after, replayed: false };
      });
    },

    /**
     * An admin's correction: add a charge, take some off, or write off everything owed. A
     * write-off names the balance the admin saw, so one placed after an order landed on the same
     * khata is refused rather than clearing more than they meant to.
     */
    adjust(
      khataId: string,
      {
        kind,
        amount,
        reason,
        requestKey,
        expectedBalance,
      }: {
        kind: AdjustmentKind;
        amount?: number | undefined;
        reason: string;
        requestKey: string;
        expectedBalance?: number | undefined;
      },
      userId: string,
    ): Promise<KhataChange> {
      return store.transaction(async (tx) => {
        const khata = await lockOrFail(tx, khataId);
        const repeat = await earlier(tx, khataId, requestKey);
        if (repeat) return repeat;

        if (
          kind === 'WRITE_OFF' &&
          (expectedBalance === undefined || toMinor(expectedBalance) !== toMinor(khata.balance))
        ) {
          throw new AppError(
            'BALANCE_CHANGED',
            `The balance is now ${formatPrice(khata.balance)}. Check it and write off again.`,
            409,
            { balance: String(khata.balance) },
          );
        }
        // Admin may charge past the limit: the limit is for what tills put on, not for admin.
        const signed = entryAmount(kind, amount ?? 0, khata.balance);
        const after = balanceAfter(khata.balance, signed);
        const entry = await tx.addEntry({
          khataId,
          kind,
          amount: signed,
          balanceAfter: after,
          orderId: null,
          note: reason,
          userId,
          at: now(),
          requestKey,
        });
        return { entryId: entry.id, khataId, amount: signed, balance: after, replayed: false };
      });
    },
  };
}

export type KhataService = ReturnType<typeof createKhataService>;

import type { KhataEntryKind } from '../logic/khata-rules';

/** A khata as locked for a change. Amounts are rupees. */
export interface LockedKhata {
  id: string;
  phone: string;
  name: string;
  balance: number;
  creditLimit: number | null;
}

export interface NewKhataEntry {
  khataId: string;
  kind: KhataEntryKind;
  /** Signed: positive adds to what is owed. */
  amount: number;
  balanceAfter: number;
  orderId: string | null;
  note: string | null;
  userId: string;
  at: Date;
  /** The key the screen sent with a payment or correction (none for order entries). */
  requestKey?: string | null;
}

/**
 * What changing a khata needs from storage, inside one database transaction. Every change locks
 * the khata row first, so two tills taking money at once can't both read the same balance.
 */
export interface KhataTx {
  /** Locks a khata by id; null when there is none. */
  lock(khataId: string): Promise<LockedKhata | null>;
  /** Opens the khata for this number if it has none yet, then locks it. */
  lockOrOpen(phone: string, name: string): Promise<LockedKhata>;
  /** Writes the entry and moves the khata's balance to `balanceAfter`. */
  addEntry(entry: NewKhataEntry): Promise<{ id: string }>;
  /** The entry recorded for this request key, if any (to answer a repeated request). */
  findByRequestKey(
    requestKey: string,
  ): Promise<{ id: string; khataId: string; amount: number; balanceAfter: number } | null>;
  /** The shop's default limit from Settings. */
  defaultLimit(): Promise<number>;
}

export interface KhataStore {
  transaction<T>(work: (tx: KhataTx) => Promise<T>): Promise<T>;
}

import type { KhataEntryKind } from '../logic/khata-rules';

/** One khata in the list: who, what they owe, and their limit. Amounts are rupees. */
export interface KhataSummary {
  id: string;
  phone: string;
  name: string;
  balance: number;
  /** The customer's own limit, or null when the shop's default applies. */
  creditLimit: number | null;
  /** The limit that applies right now. */
  limit: number;
  updatedAt: string;
}

export interface KhataEntryView {
  id: string;
  kind: KhataEntryKind;
  /** Signed: positive added to what is owed, negative took it away. */
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  /** Who made the entry (staff only; left out of the customer's own view). */
  by: string | null;
  order: { id: string; orderNumber: string; trackingToken: string } | null;
}

export interface KhataDetail extends KhataSummary {
  createdAt: string;
  /** Newest first. */
  entries: KhataEntryView[];
}

export interface KhataPage {
  items: KhataSummary[];
  total: number;
  page: number;
  pageSize: number;
  /** Everything owed across every khata in the list's filter. */
  totalOwed: number;
}

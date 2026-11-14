import { toCsv } from '@/features/admin/logic/csv';
import { isoToKarachiLocal } from '@/features/admin/logic/karachi-time';
import {
  BLACK,
  GREY,
  RED,
  dateTime,
  finishStrip,
  startStrip,
  type ReceiptShop,
} from '@/features/orders/receipt/pdf-layout';
import { formatPrice } from '@/shared/utils/format';
import type { KhataEntryKind } from '../logic/khata-rules';
import type { KhataDetail, KhataEntryView, KhataSummary } from '../types/khata.types';

export const KIND_LABEL: Record<KhataEntryKind, string> = {
  ORDER: 'Order',
  PAYMENT: 'Payment',
  CHARGE: 'Charge',
  REDUCTION: 'Reduction',
  WRITE_OFF: 'Written off',
};

/** "-500" for money taken off, "+1,200" for money added. */
export function signedPrice(amount: number): string {
  return `${amount < 0 ? '-' : '+'}${formatPrice(Math.abs(amount))}`;
}

const fileSafe = (text: string) => text.replace(/[^0-9A-Za-z-]/g, '');

export const statementFileName = (khata: Pick<KhataSummary, 'phone'>, extension: 'pdf' | 'csv') =>
  `khata-${fileSafe(khata.phone)}.${extension}`;

export const paymentReceiptFileName = (entryId: string) =>
  `khata-payment-${fileSafe(entryId.slice(0, 8))}.pdf`;

/** A small receipt for one payment towards a khata. */
export async function renderPaymentReceipt(
  entry: KhataEntryView,
  khata: KhataSummary,
  shop: ReceiptShop,
): Promise<Uint8Array> {
  const { pdf, doc } = await startStrip('Khata payment', shop, new Date(entry.createdAt));
  doc.shopHeader(shop);
  doc.text('KHATA PAYMENT', { size: 10, bold: true, align: 'center' });
  doc.gap(2);
  doc.pair('Date', dateTime.format(new Date(entry.createdAt)));
  doc.pair('Customer', khata.name);
  doc.pair('Phone', khata.phone);
  if (entry.by) doc.pair('Received by', entry.by);
  doc.rule();
  doc.pair(KIND_LABEL[entry.kind], formatPrice(Math.abs(entry.amount)), { size: 11, bold: true });
  if (entry.note) doc.text(`Note: ${entry.note}`, { size: 7.5, color: GREY });
  doc.rule(false);
  doc.pair('Balance before', formatPrice(entry.balanceAfter - entry.amount));
  doc.pair('Balance now', formatPrice(entry.balanceAfter), {
    bold: true,
    color: entry.balanceAfter > 0 ? RED : BLACK,
  });
  doc.rule(false);
  doc.gap(4);
  doc.text('Thank you!', { size: 8.5, bold: true, align: 'center' });
  return finishStrip(pdf, doc);
}

/** The whole khata, oldest entry first, with the running balance after each. */
export async function renderStatementPdf(
  khata: KhataDetail,
  shop: ReceiptShop,
  now: Date,
): Promise<Uint8Array> {
  const { pdf, doc } = await startStrip(`Khata ${khata.phone}`, shop, now);
  doc.shopHeader(shop);
  doc.text('KHATA STATEMENT', { size: 10, bold: true, align: 'center' });
  doc.gap(2);
  doc.pair('Customer', khata.name);
  doc.pair('Phone', khata.phone);
  doc.pair('Printed', dateTime.format(now));
  doc.pair('Limit', formatPrice(khata.limit));
  doc.rule();

  const oldestFirst = [...khata.entries].reverse();
  if (oldestFirst.length === 0) doc.text('No entries yet.', { color: GREY });
  for (const entry of oldestFirst) {
    const label = entry.order
      ? `${KIND_LABEL[entry.kind]} ${entry.order.orderNumber}`
      : KIND_LABEL[entry.kind];
    doc.pair(label, signedPrice(entry.amount), { size: 8 });
    const when = dateTime.format(new Date(entry.createdAt));
    doc.pair(when, `Bal. ${formatPrice(entry.balanceAfter)}`, { size: 6.5, color: GREY });
    if (entry.note && entry.kind !== 'ORDER') {
      doc.text(entry.note, { size: 6.5, color: GREY, indent: 6 });
    }
    doc.gap(2);
  }

  doc.rule(false);
  doc.pair('BALANCE OWED', formatPrice(khata.balance), {
    size: 11,
    bold: true,
    color: khata.balance > 0 ? RED : BLACK,
  });
  doc.rule(false);
  return finishStrip(pdf, doc);
}

/** The same statement as a spreadsheet (opens in Excel or Google Sheets). */
export function statementCsv(khata: KhataDetail): string {
  const rows = [...khata.entries]
    .reverse()
    .map((entry) => [
      isoToKarachiLocal(entry.createdAt).replace('T', ' '),
      KIND_LABEL[entry.kind],
      entry.order?.orderNumber ?? '',
      entry.note ?? '',
      entry.amount,
      entry.balanceAfter,
      entry.by ?? '',
    ]);
  return toCsv(
    ['Date (Lahore)', 'Type', 'Order', 'Note', 'Amount', 'Balance after', 'By'],
    [...rows, ['Balance owed', '', '', '', '', khata.balance, '']],
  );
}

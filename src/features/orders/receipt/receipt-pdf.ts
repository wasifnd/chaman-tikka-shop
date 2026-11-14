import { formatPrice } from '@/shared/utils/format';
import type { ReceiptData } from './receipt-data';
import {
  GREY,
  RED,
  BLACK,
  dateTime,
  finishStrip,
  startStrip,
  type ReceiptShop,
} from './pdf-layout';

export type { ReceiptShop } from './pdf-layout';

const TYPE_LABEL = { DELIVERY: 'Delivery', PICKUP: 'Pickup', DINE_IN: 'Dine in' } as const;
const PAYMENT_LABEL = { COD: 'Cash on delivery', CASH_AT_RESTAURANT: 'Cash at the counter' };
const PAYMENT_STATUS = {
  PENDING: 'Not paid yet',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
  ON_KHATA: 'On khata',
};

/** Draws the receipt as a PDF. Every figure comes from the stored order. */
export async function renderReceiptPdf(
  receipt: ReceiptData,
  shop: ReceiptShop,
): Promise<Uint8Array> {
  const { pdf, doc } = await startStrip(
    `Receipt ${receipt.orderNumber}`,
    shop,
    new Date(receipt.placedAt),
  );
  doc.shopHeader(shop);

  // ---- The order ----
  doc.text(receipt.status === 'CANCELLED' ? 'RECEIPT - CANCELLED' : 'RECEIPT', {
    size: 10,
    bold: true,
    align: 'center',
    color: receipt.status === 'CANCELLED' ? RED : BLACK,
  });
  doc.gap(2);
  doc.pair('Order', receipt.orderNumber, { bold: true });
  doc.pair('Date', dateTime.format(new Date(receipt.placedAt)));
  doc.pair('Order type', TYPE_LABEL[receipt.type]);
  doc.pair('Payment', PAYMENT_LABEL[receipt.paymentMethod]);
  doc.pair('Payment status', PAYMENT_STATUS[receipt.paymentStatus]);

  // ---- The customer ----
  doc.rule();
  doc.pair('Customer', receipt.customer.name || '-');
  if (receipt.customer.phone) doc.pair('Phone', receipt.customer.phone);
  if (receipt.customer.email) doc.pair('Email', receipt.customer.email);
  if (receipt.address) {
    const street = [receipt.address.line1, receipt.address.line2].filter(Boolean).join(', ');
    if (street) doc.text(`Deliver to: ${street}`);
    if (receipt.address.area) doc.pair('Area', receipt.address.area);
  }
  if (receipt.instructions) doc.text(`Instructions: ${receipt.instructions}`, { color: GREY });

  // ---- What was ordered ----
  doc.rule();
  for (const item of receipt.items) {
    doc.pair(`${String(item.quantity)} x ${item.name}`, formatPrice(item.lineTotal), { size: 8.5 });
    if (item.quantity > 1) {
      doc.text(`${formatPrice(item.unitPrice)} each`, { size: 7, color: GREY, indent: 10 });
    }
    for (const option of item.options) doc.text(option, { size: 7, color: GREY, indent: 10 });
    if (item.note) doc.text(`Note: ${item.note}`, { size: 7, color: GREY, indent: 10 });
    doc.gap(1.5);
  }

  // ---- Totals ----
  doc.rule();
  doc.pair('Subtotal', formatPrice(receipt.subtotal));
  if (receipt.couponDiscount > 0) {
    doc.pair(
      receipt.couponCode ? `Coupon ${receipt.couponCode}` : 'Coupon discount',
      `-${formatPrice(receipt.couponDiscount)}`,
    );
  }
  if (receipt.type === 'DELIVERY') {
    doc.pair(
      'Delivery',
      receipt.deliveryCharge === 0 ? 'Free' : formatPrice(receipt.deliveryCharge),
    );
  }
  if (receipt.taxAmount > 0) doc.pair('Tax', formatPrice(receipt.taxAmount));
  doc.rule(false);
  doc.pair('TOTAL', formatPrice(receipt.grandTotal), { size: 11, bold: true });

  // Counter orders: what was paid at the till, and what is left on the customer's khata.
  if (receipt.amountPaid !== null) {
    const remaining = Math.max(0, receipt.grandTotal - receipt.amountPaid);
    doc.pair('Paid', formatPrice(receipt.amountPaid), { size: 9 });
    doc.pair('Remaining', formatPrice(remaining), {
      size: 9,
      bold: remaining > 0,
      color: remaining > 0 ? RED : BLACK,
    });
    if (remaining > 0) {
      doc.text('The remaining amount was added to your khata.', { size: 7, color: GREY });
    }
  }
  doc.rule(false);

  doc.gap(4);
  doc.text('Thank you for ordering!', { size: 8.5, bold: true, align: 'center' });
  doc.text('Prices include all charges shown above.', { size: 7, align: 'center', color: GREY });

  return finishStrip(pdf, doc);
}

export const receiptFileName = (orderNumber: string) => `receipt-${orderNumber}.pdf`;

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { formatPrice } from '@/shared/utils/format';
import type { ReceiptData } from './receipt-data';

/** Shop details printed at the top (from siteConfig, passed in so this stays testable). */
export interface ReceiptShop {
  name: string;
  address: string;
  hours: string;
}

// 80 mm wide, the size of a shop's thermal receipt printer, and easy to read on a phone.
const WIDTH = 226.77;
const MARGIN = 14;
const INNER = WIDTH - MARGIN * 2;

const BLACK = rgb(0.08, 0.06, 0.05);
const GREY = rgb(0.38, 0.36, 0.34);
const RED = rgb(0.72, 0.1, 0.08);

const TYPE_LABEL = { DELIVERY: 'Delivery', PICKUP: 'Pickup', DINE_IN: 'Dine in' } as const;
const PAYMENT_LABEL = { COD: 'Cash on delivery', CASH_AT_RESTAURANT: 'Cash at the counter' };
const PAYMENT_STATUS = { PENDING: 'Not paid yet', PAID: 'Paid', REFUNDED: 'Refunded' };

const dateTime = new Intl.DateTimeFormat('en-PK', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Karachi',
});

type Align = 'left' | 'right' | 'center';
type Op =
  | {
      kind: 'text';
      text: string;
      font: PDFFont;
      size: number;
      x: number;
      y: number;
      color: typeof BLACK;
    }
  | { kind: 'rule'; y: number; dashed: boolean };

/**
 * Lays the receipt out top to bottom, then sizes the page to fit, so a two-item order and a
 * twenty-item order both come out as one tidy strip.
 */
class Layout {
  readonly ops: Op[] = [];
  y = 0; // distance from the top, grows downwards

  constructor(
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  /** Characters the built-in PDF font can't draw (e.g. Urdu) become "?" instead of failing. */
  private safe(value: string): string {
    const supported = new Set(this.regular.getCharacterSet());
    return value
      .replace(/\s+/g, ' ')
      .replace(/[\s\S]/gu, (char) => (supported.has(char.codePointAt(0) ?? 0) ? char : '?'));
  }

  private wrap(value: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of this.safe(value).split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  text(
    value: string,
    {
      size = 8,
      bold = false,
      align = 'left',
      color = BLACK,
      indent = 0,
    }: { size?: number; bold?: boolean; align?: Align; color?: typeof BLACK; indent?: number } = {},
  ) {
    const font = bold ? this.bold : this.regular;
    for (const line of this.wrap(value, font, size, INNER - indent)) {
      const width = font.widthOfTextAtSize(line, size);
      const x =
        align === 'center'
          ? MARGIN + (INNER - width) / 2
          : align === 'right'
            ? MARGIN + INNER - width
            : MARGIN + indent;
      this.y += size * 1.35;
      this.ops.push({ kind: 'text', text: line, font, size, x, y: this.y, color });
    }
  }

  /** A label on the left and a value on the right, on one line. */
  pair(label: string, value: string, { size = 8, bold = false } = {}) {
    const font = bold ? this.bold : this.regular;
    const right = this.safe(value);
    const rightWidth = font.widthOfTextAtSize(right, size);
    const lines = this.wrap(label, font, size, INNER - rightWidth - 8);
    this.y += size * 1.35;
    this.ops.push({
      kind: 'text',
      text: right,
      font,
      size,
      x: MARGIN + INNER - rightWidth,
      y: this.y,
      color: BLACK,
    });
    lines.forEach((line, index) => {
      if (index > 0) this.y += size * 1.35;
      this.ops.push({ kind: 'text', text: line, font, size, x: MARGIN, y: this.y, color: BLACK });
    });
  }

  rule(dashed = true) {
    this.y += 6;
    this.ops.push({ kind: 'rule', y: this.y, dashed });
    this.y += 2;
  }

  gap(points: number) {
    this.y += points;
  }
}

/** Draws the receipt as a PDF. Every figure comes from the stored order. */
export async function renderReceiptPdf(
  receipt: ReceiptData,
  shop: ReceiptShop,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${receipt.orderNumber} - ${shop.name}`);
  pdf.setAuthor(shop.name);
  pdf.setCreator(shop.name);
  pdf.setProducer(shop.name);
  pdf.setCreationDate(new Date(receipt.placedAt));

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const doc = new Layout(regular, bold);

  // ---- The shop ----
  doc.text(shop.name.toUpperCase(), { size: 13, bold: true, align: 'center', color: RED });
  doc.text(shop.address, { size: 7.5, align: 'center', color: GREY });
  doc.text(shop.hours, { size: 7.5, align: 'center', color: GREY });
  doc.rule(false);

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
  doc.rule(false);

  doc.gap(4);
  doc.text('Thank you for ordering!', { size: 8.5, bold: true, align: 'center' });
  doc.text('Prices include all charges shown above.', { size: 7, align: 'center', color: GREY });

  // ---- Draw it on a page exactly as tall as the receipt ----
  const height = doc.y + MARGIN * 1.5;
  const page = pdf.addPage([WIDTH, height]);
  for (const op of doc.ops) {
    if (op.kind === 'text') {
      page.drawText(op.text, {
        x: op.x,
        y: height - op.y,
        size: op.size,
        font: op.font,
        color: op.color,
      });
    } else {
      page.drawLine({
        start: { x: MARGIN, y: height - op.y },
        end: { x: WIDTH - MARGIN, y: height - op.y },
        thickness: 0.6,
        color: GREY,
        ...(op.dashed ? { dashArray: [2, 2] } : {}),
      });
    }
  }
  return pdf.save();
}

export const receiptFileName = (orderNumber: string) => `receipt-${orderNumber}.pdf`;

import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  canSeeFullReceipt,
  mapReceipt,
  maskPhone,
  redactForLink,
  type ReceiptData,
  type ReceiptRow,
} from './receipt-data';
import { receiptFileName, renderReceiptPdf } from './receipt-pdf';

const shop = {
  name: 'Chaman Tikka Shop',
  address: '441-2-D1 Township, Lahore',
  hours: 'Open daily, 6 PM to 2 AM',
};

const row: ReceiptRow = {
  orderNumber: 'BBQ-2026-0042',
  createdAt: new Date('2026-11-14T16:30:00Z'), // 9:30 PM in Lahore
  type: 'DELIVERY',
  status: 'RECEIVED',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  guestName: 'Sana Ahmed',
  guestPhone: '03001234567',
  guestEmail: 'sana@example.com',
  deliveryAddressSnapshot: {
    line1: '14 Canal View',
    line2: 'Gate 2',
    area: 'Johar Town',
    city: 'Lahore',
  },
  specialInstructions: 'Call when outside',
  subtotal: 1620,
  couponDiscount: 162,
  deliveryCharge: 0,
  taxAmount: 0,
  grandTotal: 1458,
  coupon: { code: 'SAVE10' },
  items: [
    {
      productNameSnapshot: 'Chicken Tikka',
      variantSnapshot: [{ name: 'Full' }],
      addonSnapshot: [{ name: 'Raita' }],
      quantity: 2,
      unitPrice: 780,
      subtotal: 1560,
      note: 'extra crispy',
      dealId: null,
    },
    {
      productNameSnapshot: 'Naan',
      variantSnapshot: [],
      addonSnapshot: [],
      quantity: 2,
      unitPrice: 30,
      subtotal: 60,
      note: null,
      dealId: null,
    },
  ],
};

/** The text drawn on the PDF's pages, read back from its (compressed) content streams. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  await PDFDocument.load(bytes); // it must be a valid PDF
  const raw = Buffer.from(bytes).toString('latin1');
  const chunks: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const body = Buffer.from(match[1] ?? '', 'latin1');
    let content: string;
    try {
      content = inflateSync(body).toString('latin1');
    } catch {
      content = body.toString('latin1');
    }
    for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      chunks.push(Buffer.from(hex[1] ?? '', 'hex').toString('latin1'));
    }
  }
  return chunks.join('\n');
}

describe('receipt data', () => {
  it('reads everything a receipt needs from the stored order', () => {
    const receipt = mapReceipt(row);
    expect(receipt).toMatchObject({
      orderNumber: 'BBQ-2026-0042',
      customer: { name: 'Sana Ahmed', phone: '03001234567', email: 'sana@example.com' },
      address: { line1: '14 Canal View', line2: 'Gate 2', area: 'Johar Town' },
      instructions: 'Call when outside',
      couponCode: 'SAVE10',
      grandTotal: 1458,
    });
    expect(receipt.items[0]).toEqual({
      name: 'Chicken Tikka',
      options: ['Full', 'Raita'],
      quantity: 2,
      unitPrice: 780,
      lineTotal: 1560,
      note: 'extra crispy',
    });
  });

  it('has no address for pickup or dine-in, and copes with missing details', () => {
    const pickup = mapReceipt({
      ...row,
      type: 'PICKUP',
      guestName: null,
      guestPhone: null,
      deliveryAddressSnapshot: null,
      specialInstructions: '  ',
      coupon: null,
    });
    expect(pickup.address).toBeNull();
    expect(pickup.customer).toEqual({ name: '', phone: '', email: 'sana@example.com' });
    expect(pickup.instructions).toBeNull();
    expect(pickup.couponCode).toBeNull();
  });

  it('masks a phone number, keeping only enough to recognise it', () => {
    expect(maskPhone('03001234567')).toBe('0300*****67');
    expect(maskPhone('12345')).toBe('*****');
  });

  it('hides what would identify or locate the customer when opened from a shared link', () => {
    const shared = redactForLink(mapReceipt(row));
    expect(shared.customer).toEqual({ name: 'Sana', phone: '0300*****67', email: null });
    expect(shared.address).toEqual({ line1: null, line2: null, area: 'Johar Town' });
    expect(shared.instructions).toBeNull();
    // The order itself is unchanged.
    expect(shared.items).toEqual(mapReceipt(row).items);
    expect(shared.grandTotal).toBe(1458);
    expect(redactForLink(mapReceipt({ ...row, type: 'PICKUP' })).address).toBeNull();
  });
});

describe('receipt PDF', () => {
  it('prints the shop, the order, each item and the totals', async () => {
    const text = await pdfText(await renderReceiptPdf(mapReceipt(row), shop));
    for (const expected of [
      'CHAMAN TIKKA SHOP',
      '441-2-D1 Township, Lahore',
      'RECEIPT',
      'BBQ-2026-0042',
      'Cash on delivery',
      'Not paid yet',
      'Sana Ahmed',
      '03001234567',
      'Deliver to: 14 Canal View, Gate 2',
      'Johar Town',
      'Instructions: Call when outside',
      '2 x Chicken Tikka',
      'Rs. 1,560',
      'Rs. 780 each',
      'Full',
      'Raita',
      'Note: extra crispy',
      '2 x Naan',
      'Coupon SAVE10',
      '-Rs. 162',
      'Free',
      'TOTAL',
      'Rs. 1,458',
      'Thank you for ordering!',
    ]) {
      expect(text, expected).toContain(expected);
    }
    // Times are shown in Lahore.
    expect(text).toMatch(/14-Nov-2026, 9:30 pm/);
  });

  it('is an 80 mm strip that grows with the order', async () => {
    const short = await PDFDocument.load(await renderReceiptPdf(mapReceipt(row), shop));
    const long = await PDFDocument.load(
      await renderReceiptPdf(
        mapReceipt({ ...row, items: [...row.items, ...row.items, ...row.items, ...row.items] }),
        shop,
      ),
    );
    const [shortPage] = short.getPages();
    const [longPage] = long.getPages();
    expect(short.getPageCount()).toBe(1);
    expect(shortPage?.getWidth()).toBeCloseTo(226.77, 1);
    expect(longPage?.getHeight() ?? 0).toBeGreaterThan(shortPage?.getHeight() ?? 0);
    expect(short.getTitle()).toBe('Receipt BBQ-2026-0042 - Chaman Tikka Shop');
  });

  it('marks a cancelled order and shows payment and order type plainly', async () => {
    const text = await pdfText(
      await renderReceiptPdf(
        mapReceipt({
          ...row,
          status: 'CANCELLED',
          type: 'PICKUP',
          paymentMethod: 'CASH_AT_RESTAURANT',
          paymentStatus: 'PAID',
          deliveryAddressSnapshot: null,
          taxAmount: 50,
          couponDiscount: 0,
        }),
        shop,
      ),
    );
    expect(text).toContain('RECEIPT - CANCELLED');
    expect(text).toContain('Cash at the counter');
    expect(text).toContain('Paid');
    expect(text).toContain('Pickup');
    expect(text).toContain('Tax');
    expect(text).not.toContain('Delivery');
    expect(text).not.toContain('Coupon');
  });

  it('prints letters the PDF font lacks as "?" instead of failing', async () => {
    const receipt: ReceiptData = {
      ...mapReceipt(row),
      customer: { name: 'ثناء Ahmed', phone: '03001234567', email: null },
    };
    const text = await pdfText(await renderReceiptPdf(receipt, shop));
    expect(text).toContain('???? Ahmed');
  });

  it('wraps a long address instead of running off the page', async () => {
    const long =
      'House 12, Street 4, near the big mosque, behind the petrol pump, opposite the park';
    const text = await pdfText(
      await renderReceiptPdf(
        { ...mapReceipt(row), address: { line1: long, line2: null, area: 'Johar Town' } },
        shop,
      ),
    );
    expect(text).toContain('Deliver to: House 12');
    expect(text).toContain('opposite the park');
    expect(text.split('\n').find((line) => line.startsWith('Deliver to:'))?.length).toBeLessThan(
      long.length,
    );
  });

  it('names the file after the order', () => {
    expect(receiptFileName('BBQ-2026-0042')).toBe('receipt-BBQ-2026-0042.pdf');
  });
});

describe('who sees the full receipt from a tracking link', () => {
  it('the account the order belongs to, and the shop staff', () => {
    expect(canSeeFullReceipt('c1', { role: 'CUSTOMER', customerId: 'c1' })).toBe(true);
    expect(canSeeFullReceipt('c1', { role: 'STORE_STAFF' })).toBe(true);
    expect(canSeeFullReceipt(null, { role: 'ADMIN' })).toBe(true);
  });

  it('not a visitor, another customer, or anyone on a guest order', () => {
    expect(canSeeFullReceipt('c1', null)).toBe(false);
    expect(canSeeFullReceipt('c1', { role: 'CUSTOMER', customerId: 'c2' })).toBe(false);
    expect(canSeeFullReceipt(null, { role: 'CUSTOMER', customerId: 'c2' })).toBe(false);
    expect(canSeeFullReceipt(null, { role: 'CUSTOMER' })).toBe(false);
  });
});

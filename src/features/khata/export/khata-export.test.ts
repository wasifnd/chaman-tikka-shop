import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { KhataDetail } from '../types/khata.types';
import {
  paymentReceiptFileName,
  renderPaymentReceipt,
  renderStatementPdf,
  signedPrice,
  statementCsv,
  statementFileName,
} from './khata-export';

const shop = { name: 'Chaman Tikka Shop', address: '441-2-D1 Township, Lahore', hours: 'Daily' };

/** The text drawn on a PDF, read back out of its content streams. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  await PDFDocument.load(bytes);
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

const khata: KhataDetail = {
  id: 'k1',
  phone: '03331234500',
  name: 'Bilal',
  balance: 490,
  creditLimit: null,
  limit: 10_000,
  updatedAt: '2026-11-14T10:54:00.000Z',
  createdAt: '2026-11-14T10:53:00.000Z',
  // Newest first, as the repository returns them.
  entries: [
    {
      id: 'e2',
      kind: 'PAYMENT',
      amount: -300,
      balanceAfter: 490,
      note: '=cash',
      createdAt: '2026-11-14T10:54:00.000Z',
      by: 'Ahmed',
      order: null,
    },
    {
      id: 'e1',
      kind: 'ORDER',
      amount: 790,
      balanceAfter: 790,
      note: 'Order BBQ-2026-0346',
      createdAt: '2026-11-14T10:53:00.000Z',
      by: 'Ahmed',
      order: { id: 'o1', orderNumber: 'BBQ-2026-0346', trackingToken: 't1' },
    },
  ],
};

describe('khata statements', () => {
  it('the PDF lists every entry oldest first, with the balance owed', async () => {
    const text = await pdfText(await renderStatementPdf(khata, shop, new Date(khata.updatedAt)));
    for (const expected of [
      'CHAMAN TIKKA SHOP',
      'KHATA STATEMENT',
      'Bilal',
      '03331234500',
      'Order BBQ-2026-0346',
      '+Rs. 790',
      '-Rs. 300',
      'BALANCE OWED',
      'Rs. 490',
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text.indexOf('Order BBQ-2026-0346')).toBeLessThan(text.indexOf('Payment'));
  });

  it('an empty khata says so', async () => {
    const text = await pdfText(
      await renderStatementPdf({ ...khata, entries: [], balance: 0 }, shop, new Date()),
    );
    expect(text).toContain('No entries yet.');
  });

  it('the spreadsheet has one row per entry, in Lahore time, and the balance last', () => {
    const csv = statementCsv(khata);
    const rows = csv.replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(rows[0]).toBe('Date (Lahore),Type,Order,Note,Amount,Balance after,By');
    expect(rows[1]).toBe('2026-11-14 15:53,Order,BBQ-2026-0346,Order BBQ-2026-0346,790,790,Ahmed');
    // A note starting with "=" can't run as a spreadsheet formula.
    expect(rows[2]).toBe("2026-11-14 15:54,Payment,,'=cash,-300,490,Ahmed");
    expect(rows[3]).toBe('Balance owed,,,,,490,');
  });

  it('names files after the number', () => {
    expect(statementFileName(khata, 'pdf')).toBe('khata-03331234500.pdf');
    expect(statementFileName(khata, 'csv')).toBe('khata-03331234500.csv');
    expect(paymentReceiptFileName('2c6c6648-b63d-4720')).toBe('khata-payment-2c6c6648.pdf');
  });

  it('signs amounts', () => {
    expect(signedPrice(790)).toBe('+Rs. 790');
    expect(signedPrice(-300)).toBe('-Rs. 300');
  });
});

describe('payment receipts', () => {
  it('shows the payment, who took it, and the balance before and after', async () => {
    const payment = khata.entries[0];
    if (!payment) throw new Error('fixture missing');
    const text = await pdfText(await renderPaymentReceipt(payment, khata, shop));
    for (const expected of [
      'KHATA PAYMENT',
      'Bilal',
      '03331234500',
      'Received by',
      'Ahmed',
      'Rs. 300',
      'Balance before',
      'Rs. 790',
      'Balance now',
      'Rs. 490',
    ]) {
      expect(text, expected).toContain(expected);
    }
  });

  it('leaves out who took it when that is hidden (the customer copy)', async () => {
    const payment = khata.entries[0];
    if (!payment) throw new Error('fixture missing');
    const text = await pdfText(await renderPaymentReceipt({ ...payment, by: null }, khata, shop));
    expect(text).not.toContain('Received by');
  });
});

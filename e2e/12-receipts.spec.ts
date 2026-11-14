import { inflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { STAFF, newApi, randomPhone, signUp, signedIn, type Api } from './support/client';
import {
  guestContact,
  kababLine,
  loadWorld,
  naanLine,
  placeOrder,
  type World,
} from './support/world';

interface Pdf {
  status: number;
  type: string;
  disposition: string;
  cache: string;
  /** The text drawn on the receipt. */
  text: string;
  bytes: Buffer;
}

/** Fetches a receipt and reads the text back out of the PDF. */
async function receipt(api: Api, path: string): Promise<Pdf> {
  const response = await api.context.fetch(path);
  const bytes = await response.body();
  const raw = bytes.toString('latin1');
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
  const headers = response.headers();
  return {
    status: response.status(),
    type: headers['content-type'] ?? '',
    disposition: headers['content-disposition'] ?? '',
    cache: headers['cache-control'] ?? '',
    text: chunks.join('\n'),
    bytes,
  };
}

/** Receipts as PDFs: made for every order, with full details only for the right people. */
test.describe('order receipts', () => {
  let world: World;
  test.beforeAll(() => {
    world = loadWorld();
  });

  test.describe('from the tracking link', () => {
    let token: string;
    let orderNumber: string;
    const phone = randomPhone();

    test.beforeAll(async () => {
      const guest = await newApi();
      const { reply, order } = await placeOrder(guest, {
        lines: [kababLine(world), naanLine(world, 3)],
        orderType: 'DELIVERY',
        zoneId: world.zone.id,
        contact: { name: 'Receipt Guest', phone, email: 'receipt.guest@example.com' },
        address: { line1: '9 Receipt Road', line2: 'Flat 2' },
      });
      expect(reply.status, reply.text).toBe(201);
      token = order?.trackingToken ?? '';
      orderNumber = order?.orderNumber ?? '';
      await guest.dispose();
    });

    test('is a real PDF with the order, items and total', async () => {
      const api = await newApi();
      const pdf = await receipt(api, `/api/v1/orders/${token}/receipt`);
      expect(pdf.status).toBe(200);
      expect(pdf.type).toBe('application/pdf');
      expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.disposition).toBe(`inline; filename="receipt-${orderNumber}.pdf"`);
      expect(pdf.cache).toContain('no-store');
      for (const expected of ['CHAMAN TIKKA SHOP', 'RECEIPT', orderNumber, '3 x', 'TOTAL']) {
        expect(pdf.text, expected).toContain(expected);
      }
      await api.dispose();
    });

    test('downloads as a file when asked', async () => {
      const api = await newApi();
      const pdf = await receipt(api, `/api/v1/orders/${token}/receipt?download=1`);
      expect(pdf.disposition).toBe(`attachment; filename="receipt-${orderNumber}.pdf"`);
      await api.dispose();
    });

    test('hides the street, email and full number from whoever else holds the link', async () => {
      const stranger = await newApi();
      const pdf = await receipt(stranger, `/api/v1/orders/${token}/receipt`);
      expect(pdf.text).toContain('Receipt');
      expect(pdf.text).toContain(`${phone.slice(0, 4)}*****${phone.slice(-2)}`);
      expect(pdf.text).not.toContain(phone);
      expect(pdf.text).not.toContain('9 Receipt Road');
      expect(pdf.text).not.toContain('receipt.guest@example.com');
      expect(pdf.text).not.toContain('Receipt Guest'); // first name only
      await stranger.dispose();
    });

    test('unknown or malformed links find nothing', async () => {
      const api = await newApi();
      expect((await receipt(api, `/api/v1/orders/${randomUUID()}/receipt`)).status).toBe(404);
      expect((await receipt(api, '/api/v1/orders/not-a-token/receipt')).status).toBe(404);
      await api.dispose();
    });
  });

  test('the customer whose order it is gets every detail', async () => {
    const customer = await newApi();
    const { phone } = await signUp(customer, {
      name: 'Receipt Owner',
      password: 'correct-horse-9',
    });
    const { reply, order } = await placeOrder(customer, {
      lines: [kababLine(world), naanLine(world, 1)],
      orderType: 'DELIVERY',
      zoneId: world.zone.id,
      contact: guestContact(phone, 'Receipt Owner'),
      address: { line1: '21 Owner Street' },
      unverified: true, // their own number, proven at sign-up
    });
    expect(reply.status, reply.text).toBe(201);
    const pdf = await receipt(customer, `/api/v1/orders/${order?.trackingToken ?? ''}/receipt`);
    expect(pdf.text).toContain('Receipt Owner');
    expect(pdf.text).toContain(phone);
    expect(pdf.text).toContain('21 Owner Street');

    // And the order history offers it.
    const history = await customer.get('/account/orders');
    expect(history.text).toContain(`/api/v1/orders/${order?.trackingToken ?? ''}/receipt`);
    await customer.dispose();
  });

  test.describe('for the shop', () => {
    let orderId: string;
    const phone = randomPhone();

    test.beforeAll(async () => {
      const guest = await newApi();
      const { order } = await placeOrder(guest, {
        lines: [naanLine(world, 2)],
        orderType: 'PICKUP',
        contact: guestContact(phone, 'Counter Customer'),
      });
      await guest.dispose();
      const staff = await signedIn(STAFF);
      const board = (await staff.get('/api/v1/store/orders')).data as {
        orders: { id: string; orderNumber: string }[];
      };
      orderId = board.orders.find((o) => o.orderNumber === order?.orderNumber)?.id ?? '';
      expect(orderId).not.toBe('');
    });

    test('staff get the full receipt to print', async () => {
      const staff = await signedIn(STAFF);
      const pdf = await receipt(staff, `/api/v1/store/orders/${orderId}/receipt`);
      expect(pdf.status).toBe(200);
      expect(pdf.text).toContain('Counter Customer');
      expect(pdf.text).toContain(phone);
      expect(pdf.text).toContain('Cash at the counter');
    });

    test('nobody else can open it by order id', async () => {
      const visitor = await newApi();
      expect((await receipt(visitor, `/api/v1/store/orders/${orderId}/receipt`)).status).toBe(401);
      const customer = await newApi();
      await signUp(customer, { name: 'Nosy Customer', password: 'correct-horse-9' });
      expect((await receipt(customer, `/api/v1/store/orders/${orderId}/receipt`)).status).toBe(403);
      const staff = await signedIn(STAFF);
      expect((await receipt(staff, `/api/v1/store/orders/${randomUUID()}/receipt`)).status).toBe(
        404,
      );
      await Promise.all([visitor.dispose(), customer.dispose()]);
    });
  });
});

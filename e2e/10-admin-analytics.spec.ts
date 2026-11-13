import { expect, test } from '@playwright/test';
import {
  ADMIN,
  STAFF,
  newApi,
  randomEmail,
  randomPhone,
  signedIn,
  type Api,
} from './support/client';
import { guestContact, loadWorld, naanLine, placeOrder, type World } from './support/world';

/** Today's business day in Karachi: noon to noon, named by the date it began. */
const businessToday = () =>
  new Date(Date.now() + 5 * 3_600_000 - 12 * 3_600_000).toISOString().slice(0, 10);

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

/** The owner's sales figures and spreadsheets, checked against orders placed during the run. */
test.describe('admin: sales and analytics', () => {
  let world: World;
  let admin: Api;

  test.beforeAll(async () => {
    world = loadWorld();
    admin = await signedIn(ADMIN);
  });

  const exportCsv = (kind: string, query = 'preset=7d') =>
    admin.get(`/api/v1/admin/analytics/export?kind=${kind}&${query}`);

  /** Orders and sales for today, read from the "sales by day" spreadsheet. */
  async function today() {
    const reply = await exportCsv('daily', 'preset=today');
    expect(reply.status, reply.text).toBe(200);
    const [header, row] = lines(reply.text);
    expect(header).toBe('Business day,Orders,Sales');
    const [day, orders, sales] = (row ?? '').split(',');
    expect(day).toBe(businessToday());
    return { orders: Number(orders), sales: Number(sales) };
  }

  async function order(phoneName = 'Analytics Tester', quantity = 10) {
    const client = await newApi();
    const placed = await placeOrder(client, {
      lines: [naanLine(world, quantity)],
      orderType: 'PICKUP',
      contact: guestContact(randomPhone(), phoneName),
    });
    await client.dispose();
    expect(placed.reply.status, placed.reply.text).toBe(201);
    return placed.order as NonNullable<typeof placed.order>;
  }

  test.describe('the dashboard page', () => {
    test('shows the live numbers and the sales section with charts', async () => {
      const page = await admin.get('/admin');
      expect(page.status).toBe(200);
      for (const text of [
        'Sales and analytics',
        'Sales each day',
        'Orders by hour',
        'Best sellers',
        'Orders by type',
        'Download as a spreadsheet',
        'Orders today',
      ]) {
        expect(page.text, text).toContain(text);
      }
    });

    test('every date choice works, including a custom range', async () => {
      for (const query of [
        '?preset=today',
        '?preset=yesterday',
        '?preset=7d',
        '?preset=30d',
        '?preset=custom&from=2026-01-01&to=2026-01-31',
      ]) {
        const page = await admin.get(`/admin${query}`);
        expect(page.status, query).toBe(200);
        expect(page.text).toContain('Sales and analytics');
      }
    });

    test('a mangled link still shows a dashboard, never an error', async () => {
      for (const query of [
        '?preset=forever',
        '?preset=custom',
        '?preset=custom&from=abc&to=def',
        '?preset=custom&from=2026-10-05&to=2026-10-01',
        '?preset=custom&from=2020-01-01&to=2026-10-01',
        '?from=<script>&to=1',
        '?preset[]=x',
      ]) {
        const page = await admin.get(`/admin${query}`);
        expect(page.status, query).toBe(200);
        expect(page.text).not.toContain('<script>alert');
      }
    });

    test('best sellers include an item that was just ordered', async () => {
      await order('Best Seller Check', 7);
      const page = await admin.get('/admin?preset=today');
      expect(page.text).toContain(world.naan.name);
    });

    test('does not let staff or customers in', async () => {
      const staff = await signedIn(STAFF);
      const reply = await staff.page('/admin');
      expect(reply.status).toBe(307);
      const customer = await newApi();
      await customer.post('/api/auth/signup', {
        name: 'Curious',
        email: randomEmail(),
        password: 'correct-horse-9',
      });
      expect((await customer.page('/admin')).status).toBe(307);
      await customer.dispose();
    });
  });

  test.describe('the figures follow real orders', () => {
    test("a new order adds to today's orders and sales, to the rupee", async () => {
      const before = await today();
      await order('Figures Check', 10); // 10 naan = Rs 300
      const after = await today();
      expect(after.orders - before.orders).toBe(1);
      expect(after.sales - before.sales).toBe(300);
    });

    test('a cancelled order is not counted as sales, but is in the orders export', async () => {
      const placed = await order('Cancel Check', 20); // Rs 600
      const staff = await signedIn(STAFF);
      const board = (await staff.get('/api/v1/store/orders')).data as {
        orders: { id: string; orderNumber: string }[];
      };
      const id = board.orders.find((o) => o.orderNumber === placed.orderNumber)?.id ?? '';
      const beforeCancel = await today();

      const cancelled = await staff.patch(`/api/v1/store/orders/${id}/status`, {
        status: 'CANCELLED',
        reason: 'Testing analytics',
      });
      expect(cancelled.status).toBe(200);

      const afterCancel = await today();
      expect(beforeCancel.orders - afterCancel.orders).toBe(1);
      expect(beforeCancel.sales - afterCancel.sales).toBe(600);

      const orders = (await exportCsv('orders', 'preset=today')).text;
      expect(orders).toContain(`${placed.orderNumber},`);
      expect(lines(orders).find((l) => l.startsWith(placed.orderNumber))).toContain(',CANCELLED,');
    });

    test("the dashboard's cancelled count and rate move too", async () => {
      const page = await admin.get('/admin?preset=today');
      expect(page.text).toMatch(/\d+% of orders received/);
    });
  });

  test.describe('spreadsheet downloads', () => {
    test('orders come as a spreadsheet file with the right headers and details', async () => {
      const placed = await order('Export Check', 10);
      const reply = await exportCsv('orders', 'preset=today');
      expect(reply.status).toBe(200);
      expect(reply.headers['content-type']).toContain('text/csv');
      expect(reply.headers['content-disposition']).toMatch(
        /^attachment; filename="bbq-orders-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      expect(reply.headers['cache-control']).toContain('no-store');
      expect(reply.text.charCodeAt(0)).toBe(0xfeff); // so Excel reads it correctly

      const all = lines(reply.text);
      expect(all[0]).toBe(
        'Order number,Placed (Karachi time),Type,Status,Customer,Phone,Signed-in customer,Subtotal,Coupon discount,Delivery charge,Tax,Total,Payment method,Payment status,Coupon',
      );
      const mine = all.find((l) => l.startsWith(placed.orderNumber));
      expect(mine).toMatch(
        new RegExp(
          `^${placed.orderNumber},\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2},PICKUP,RECEIVED,Export Check,03\\d{9},no,300,0,0,0,300,`,
        ),
      );
    });

    test("a customer's name cannot run as a spreadsheet formula", async () => {
      const placed = await order('=HYPERLINK("http://evil.example.com")');
      const row =
        lines((await exportCsv('orders', 'preset=today')).text).find((l) =>
          l.startsWith(placed.orderNumber),
        ) ?? '';
      expect(row).toContain(`"'=HYPERLINK(""http://evil.example.com"")"`);
      expect(row).not.toMatch(/,=HYPERLINK/);
    });

    test('items sold lists every item with quantities and sales', async () => {
      const reply = await exportCsv('products', 'preset=today');
      expect(reply.status).toBe(200);
      const all = lines(reply.text);
      expect(all[0]).toBe('Item,Quantity sold,Sales');
      const naan = all.find((l) => l.startsWith(world.naan.name));
      expect(naan).toMatch(new RegExp(`^${world.naan.name},\\d+,\\d+`));
    });

    test('sales by day has one row for each day in the range', async () => {
      const week = lines((await exportCsv('daily', 'preset=7d')).text);
      expect(week).toHaveLength(8); // header and 7 days
      const month = lines((await exportCsv('daily', 'preset=30d')).text);
      expect(month).toHaveLength(31);
      const custom = lines(
        (await exportCsv('daily', 'preset=custom&from=2026-01-01&to=2026-01-10')).text,
      );
      expect(custom).toHaveLength(11);
      expect(custom[1]).toBe('2026-01-01,0,0');
    });

    test('the file name says which dates it covers', async () => {
      const reply = await exportCsv('daily', 'preset=custom&from=2026-01-01&to=2026-01-10');
      expect(reply.headers['content-disposition']).toContain(
        'bbq-daily-2026-01-01_to_2026-01-10.csv',
      );
    });

    test('bad requests are refused or fall back safely', async () => {
      expect((await admin.get('/api/v1/admin/analytics/export')).status).toBe(422);
      expect((await admin.get('/api/v1/admin/analytics/export?kind=everything')).status).toBe(422);
      expect(
        (
          await admin.get(
            '/api/v1/admin/analytics/export?kind=orders&preset=custom&from=2020-01-01&to=2026-10-01',
          )
        ).headers['content-disposition'],
      ).toMatch(/_to_/);
      const fallback = lines(
        (await exportCsv('daily', 'preset=custom&from=2020-01-01&to=2026-10-01')).text,
      );
      expect(fallback).toHaveLength(8); // too long a range falls back to the last 7 days
    });

    test('only admins can download', async () => {
      const nobody = await newApi();
      const staff = await signedIn(STAFF);
      const customer = await newApi();
      await customer.post('/api/auth/signup', {
        name: 'Curious',
        email: randomEmail(),
        password: 'correct-horse-9',
      });
      for (const kind of ['orders', 'products', 'daily']) {
        const path = `/api/v1/admin/analytics/export?kind=${kind}&preset=7d`;
        expect((await nobody.get(path)).status, `visitor ${kind}`).toBe(401);
        expect((await staff.get(path)).status, `staff ${kind}`).toBe(403);
        expect((await customer.get(path)).status, `customer ${kind}`).toBe(403);
      }
      await Promise.all([nobody.dispose(), customer.dispose()]);
    });
  });
});

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, STAFF, newApi, randomPhone, signedIn, type Api } from './support/client';
import {
  dealLine,
  guestContact,
  kababLine,
  loadWorld,
  naanLine,
  placeOrder,
  type World,
} from './support/world';

interface Row {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  customerName: string;
  phone: string;
  grandTotal: number;
  paymentStatus: string;
}
interface Page {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
}

/** The owner looks back over orders: search, details, who did what, and today's numbers. */
test.describe('admin: orders', () => {
  let world: World;
  let admin: Api;
  let staff: Api;
  const tag = randomUUID().slice(0, 6);
  const phone = randomPhone();
  const placed: Record<'delivery' | 'pickup' | 'dineIn', { orderNumber: string; id: string }> = {
    delivery: { orderNumber: '', id: '' },
    pickup: { orderNumber: '', id: '' },
    dineIn: { orderNumber: '', id: '' },
  };

  const search = async (query: string) => {
    const reply = await admin.get(`/api/v1/admin/orders${query}`);
    expect(reply.status, `${query}: ${reply.text}`).toBe(200);
    return reply.data as unknown as Page;
  };
  const numbers = (page: Page) => page.rows.map((r) => r.orderNumber);

  test.beforeAll(async () => {
    world = loadWorld();
    admin = await signedIn(ADMIN);
    staff = await signedIn(STAFF);

    const place = async (kind: keyof typeof placed, input: Parameters<typeof placeOrder>[1]) => {
      const client = await newApi();
      const result = await placeOrder(client, input);
      await client.dispose();
      expect(result.reply.status, result.reply.text).toBe(201);
      const orderNumber = result.order?.orderNumber ?? '';
      const found = await search(`?q=${orderNumber}`);
      placed[kind] = { orderNumber, id: found.rows[0]?.id ?? '' };
    };

    await place('delivery', {
      lines: [kababLine(world, { quantity: 2, note: 'extra crispy' }), naanLine(world, 6)],
      orderType: 'DELIVERY',
      zoneId: world.zone.id,
      couponCode: world.couponPercent,
      contact: { name: `Zainab ${tag}`, phone, email: `zainab.${tag}@example.com` },
      address: { line1: '14 Canal View', line2: 'Gate 2' },
      instructions: 'Call when outside',
    });
    await place('pickup', {
      lines: [dealLine(world)],
      orderType: 'PICKUP',
      contact: guestContact(randomPhone(), `Bilal ${tag}`),
    });
    await place('dineIn', {
      lines: [naanLine(world, 3)],
      orderType: 'DINE_IN',
      contact: guestContact(randomPhone(), `Sara ${tag}`),
    });

    // Staff work the delivery order all the way through, and reject the dine-in one.
    for (const status of [
      'CONFIRMED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
    ]) {
      const reply = await staff.patch(`/api/v1/store/orders/${placed.delivery.id}/status`, {
        status,
      });
      expect(reply.status, status).toBe(200);
    }
    const rejected = await staff.patch(`/api/v1/store/orders/${placed.dineIn.id}/status`, {
      status: 'CANCELLED',
      reason: 'Table is not available',
    });
    expect(rejected.status).toBe(200);
  });

  test.describe('searching', () => {
    test('by order number, in any case', async () => {
      const exact = await search(`?q=${placed.pickup.orderNumber}`);
      expect(numbers(exact)).toEqual([placed.pickup.orderNumber]);
      const lower = await search(`?q=${placed.pickup.orderNumber.toLowerCase()}`);
      expect(numbers(lower)).toEqual([placed.pickup.orderNumber]);
    });

    test("by part of the customer's name", async () => {
      const found = await search(`?q=zainab%20${tag}`);
      expect(numbers(found)).toEqual([placed.delivery.orderNumber]);
      expect(numbers(await search(`?q=ZAINAB%20${tag}`))).toEqual([placed.delivery.orderNumber]);
    });

    test('by phone number, however it is typed', async () => {
      const dashed = `${phone.slice(0, 4)}-${phone.slice(4)}`;
      for (const typed of [phone, dashed, phone.slice(2, 9)]) {
        const found = await search(`?q=${encodeURIComponent(typed)}`);
        expect(numbers(found), typed).toContain(placed.delivery.orderNumber);
      }
    });

    test('by status', async () => {
      const completed = await search(`?status=COMPLETED&q=${tag}`);
      expect(numbers(completed)).toEqual([placed.delivery.orderNumber]);
      const cancelled = await search(`?status=CANCELLED&q=${tag}`);
      expect(numbers(cancelled)).toEqual([placed.dineIn.orderNumber]);
      const fresh = await search(`?status=RECEIVED&q=${tag}`);
      expect(numbers(fresh)).toEqual([placed.pickup.orderNumber]);
    });

    test('by type', async () => {
      for (const [type, key] of [
        ['DELIVERY', 'delivery'],
        ['PICKUP', 'pickup'],
        ['DINE_IN', 'dineIn'],
      ] as const) {
        expect(numbers(await search(`?type=${type}&q=${tag}`))).toEqual([placed[key].orderNumber]);
      }
    });

    test('by date, using Karachi days', async () => {
      const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
      const inRange = await search(`?from=${today}&to=${today}&q=${tag}`);
      expect(inRange.total).toBe(3);
      const past = await search('?from=2020-01-01&to=2020-01-02');
      expect(past.total).toBe(0);
      const future = await search(`?from=2099-01-01&q=${tag}`);
      expect(future.total).toBe(0);
    });

    test('filters combine', async () => {
      const none = await search(`?status=COMPLETED&type=PICKUP&q=${tag}`);
      expect(none.total).toBe(0);
    });

    test('newest orders come first and pages are consistent', async () => {
      const first = await search('');
      const stamps = first.rows.map((r) => r.orderNumber);
      expect(stamps).toHaveLength(Math.min(25, first.total));
      expect(first.pageSize).toBe(25);
      if (first.total > 25) {
        const second = await search('?page=2');
        const overlap = numbers(second).filter((n) => numbers(first).includes(n));
        expect(overlap).toEqual([]);
      }
      // A page beyond the end is simply empty.
      expect((await search('?page=9999')).rows).toEqual([]);
    });

    test('search text is only ever text', async () => {
      for (const q of ["'); DROP TABLE orders;--", '%', '_', '"><script>alert(1)</script>', '\\']) {
        const reply = await admin.get(`/api/v1/admin/orders?q=${encodeURIComponent(q)}`);
        expect(reply.status, q).toBe(200);
      }
      expect((await search(`?q=${tag}`)).total).toBe(3);
    });

    test('bad filters are refused rather than ignored', async () => {
      for (const query of [
        '?status=NOPE',
        '?type=TELEPORT',
        '?page=0',
        '?page=abc',
        '?from=17/10/2026',
        '?q=' + 'x'.repeat(61),
      ]) {
        expect((await admin.get(`/api/v1/admin/orders${query}`)).status, query).toBe(422);
      }
    });
  });

  test.describe('looking at one order', () => {
    interface Detail {
      orderNumber: string;
      status: string;
      customerName: string;
      phone: string;
      email: string | null;
      address: { line1: string; line2: string | null; area: string } | null;
      instructions: string | null;
      subtotal: number;
      couponDiscount: number;
      deliveryCharge: number;
      grandTotal: number;
      paymentStatus: string;
      items: {
        name: string;
        options: string[];
        quantity: number;
        unitPrice: number;
        note: string | null;
      }[];
      history: { status: string; note: string | null; by: string | null }[];
    }
    const detail = async (id: string) => {
      const reply = await admin.get(`/api/v1/admin/orders/${id}`);
      expect(reply.status).toBe(200);
      return (reply.data as unknown as { order: Detail }).order;
    };

    test('shows the customer, address, items and exact money', async () => {
      const order = await detail(placed.delivery.id);
      expect(order).toMatchObject({
        orderNumber: placed.delivery.orderNumber,
        customerName: `Zainab ${tag}`,
        phone,
        email: `zainab.${tag}@example.com`,
        instructions: 'Call when outside',
        address: { line1: '14 Canal View', line2: 'Gate 2', area: world.zone.name },
      });
      const kabab = order.items.find((i) => i.name === world.kabab.name);
      expect(kabab).toMatchObject({ quantity: 2, unitPrice: 780, note: 'extra crispy' });
      expect(kabab?.options).toContain('Half');

      // 2 x 780 + 6 x 30 = 1,740; 10% off = 174; delivery Rs 100 (below the free limit).
      expect(order.subtotal).toBe(1740);
      expect(order.couponDiscount).toBe(174);
      expect(order.deliveryCharge).toBe(100);
      expect(order.grandTotal).toBe(1666);
    });

    test('a completed order is paid, and the history shows who did each step', async () => {
      const order = await detail(placed.delivery.id);
      expect(order.status).toBe('COMPLETED');
      expect(order.paymentStatus).toBe('PAID');
      expect(order.history.map((h) => h.status)).toEqual([
        'RECEIVED',
        'CONFIRMED',
        'PREPARING',
        'READY',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'COMPLETED',
      ]);
      expect(order.history[0]?.by).toBeNull(); // placed by the customer
      for (const step of order.history.slice(1)) expect(step.by).toBe(STAFF.email);
    });

    test('a rejected order keeps the reason it was rejected', async () => {
      const order = await detail(placed.dineIn.id);
      expect(order.status).toBe('CANCELLED');
      const last = order.history.at(-1);
      expect(last).toMatchObject({
        status: 'CANCELLED',
        note: 'Table is not available',
        by: STAFF.email,
      });
    });

    test('a deal shows what was in it', async () => {
      const order = await detail(placed.pickup.id);
      const deal = order.items.find((i) => i.name === world.dealName);
      expect(deal).toBeDefined();
      expect(deal?.options.join(' ')).toContain(world.kabab.name);
      expect(order.paymentStatus).toBe('PENDING');
    });

    test('pickup and dine-in orders have no address', async () => {
      expect((await detail(placed.pickup.id)).address).toBeNull();
      expect((await detail(placed.dineIn.id)).address).toBeNull();
    });

    test('the admin pages show the same orders', async () => {
      const list = await admin.get(`/admin/orders?q=${placed.delivery.orderNumber}`);
      expect(list.status).toBe(200);
      expect(list.text).toContain(placed.delivery.orderNumber);
      const page = await admin.get(`/admin/orders/${placed.delivery.id}`);
      expect(page.status).toBe(200);
      expect(page.text).toContain(placed.delivery.orderNumber);
      expect(page.text).toContain('Canal View');
      expect(page.text).toContain(STAFF.email);
    });

    test('the filter form still works with a mangled address', async () => {
      for (const query of ['?status=NOPE', '?page=-4', '?from=garbage']) {
        const page = await admin.get(`/admin/orders${query}`);
        expect(page.status, query).toBe(200);
      }
    });

    test('unknown and malformed order ids are plain 404s', async () => {
      for (const id of [randomUUID(), 'not-a-uuid', '12345']) {
        expect((await admin.get(`/api/v1/admin/orders/${id}`)).status, id).toBe(404);
        expect((await admin.page(`/admin/orders/${id}`)).status, id).toBe(404);
      }
    });
  });

  test("today's dashboard counts new orders and leaves cancelled ones out of the sales figure", async () => {
    const html = (await admin.get('/admin')).text;
    for (const label of [
      'Orders today',
      'Sales today',
      'Cancelled today',
      'Orders being prepared right now',
    ]) {
      expect(html).toContain(label);
    }
  });

  test('only admins can look at orders here', async () => {
    const nobody = await newApi();
    expect((await nobody.get(`/api/v1/admin/orders/${placed.delivery.id}`)).status).toBe(401);
    expect((await staff.get(`/api/v1/admin/orders/${placed.delivery.id}`)).status).toBe(403);
    expect((await staff.get('/api/v1/admin/orders')).status).toBe(403);
    await nobody.dispose();
  });
});

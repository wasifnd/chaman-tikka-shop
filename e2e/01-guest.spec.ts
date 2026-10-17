import { expect, test } from '@playwright/test';
import { newApi, randomPhone, type Api } from './support/client';
import {
  dealLine,
  guestContact,
  kababLine,
  loadWorld,
  naanLine,
  newKey,
  placeOrder,
  quote,
  type World,
} from './support/world';

/** A visitor with no account: browsing, pricing a cart, ordering and following the order. */
test.describe('guest', () => {
  let world: World;
  let guest: Api;

  test.beforeAll(async () => {
    world = loadWorld();
    guest = await newApi();
  });
  test.afterAll(async () => {
    await guest.dispose();
  });

  test.describe('browsing', () => {
    for (const path of [
      '/',
      '/menu',
      '/deals',
      '/auth/login',
      '/auth/signup',
      '/cart',
      '/checkout',
    ]) {
      test(`${path} opens without signing in`, async () => {
        const page = await guest.page(path);
        expect(page.status).toBe(200);
      });
    }

    test('the menu shows the new item straight after the admin added it', async () => {
      const page = await guest.get('/menu');
      expect(page.text).toContain(world.kabab.name);
      expect(page.text).toContain(world.naan.name);
    });

    test('an item has its own page with its options and price', async () => {
      const page = await guest.get(`/menu/${world.kabab.slug}`);
      expect(page.status).toBe(200);
      expect(page.text).toContain(world.kabab.name);
      expect(page.text).toContain('Quarter');
      expect(page.text).toContain('Half');
    });

    test('the deals page lists the deal', async () => {
      const page = await guest.get('/deals');
      expect(page.text).toContain(world.dealName);
    });

    test('unknown items and addresses are a clean 404, not an error page', async () => {
      expect((await guest.page('/menu/definitely-not-a-real-dish')).status).toBe(404);
      expect((await guest.page('/deals/definitely-not-a-real-deal')).status).toBe(404);
      expect((await guest.page('/track/not-a-token')).status).toBe(404);
      expect((await guest.page('/no/such/page')).status).toBe(404);
    });

    test('search engines get a sitemap and robots file, and private areas are not indexed', async () => {
      const robots = await guest.get('/robots.txt');
      expect(robots.status).toBe(200);
      expect(robots.text).toMatch(/Disallow:\s*\/admin/);
      expect(robots.text).toMatch(/Disallow:\s*\/store/);
      const sitemap = await guest.get('/sitemap.xml');
      expect(sitemap.status).toBe(200);
      expect(sitemap.text).toContain(`/menu/${world.kabab.slug}`);
    });

    test('pages set the security headers', async () => {
      const page = await guest.get('/');
      expect(page.headers['x-content-type-options']).toBe('nosniff');
      expect(page.headers['x-frame-options']).toBe('DENY');
      expect(page.headers['referrer-policy']).toBeTruthy();
      expect(page.headers['x-powered-by']).toBeUndefined();
    });
  });

  test.describe('pricing a cart', () => {
    test('a portion must be chosen before anything can be ordered', async () => {
      const q = await quote(guest, {
        lines: [kababLine(world, { variantIds: [] })],
        orderType: 'PICKUP',
      });
      expect(q.canCheckout).toBe(false);
      expect(q.issues.map((i) => i.code)).toContain('MISSING_REQUIRED_OPTION');
    });

    test('the price follows the chosen option and quantity', async () => {
      const half = await quote(guest, {
        lines: [kababLine(world, { quantity: 2 })],
        orderType: 'PICKUP',
      });
      expect(half.canCheckout).toBe(true);
      expect(half.subtotal).toBe(2 * (400 + 380));

      const quarter = await quote(guest, {
        lines: [kababLine(world, { variantIds: [world.kabab.quarter] })],
        orderType: 'PICKUP',
      });
      expect(quarter.subtotal).toBe(400);
    });

    test('add-ons are added to the price', async () => {
      const q = await quote(guest, {
        lines: [kababLine(world, { addonIds: [world.chutneyId], quantity: 3 })],
        orderType: 'PICKUP',
      });
      expect(q.subtotal).toBe(3 * (400 + 380 + 20));
    });

    test('a deal is one price', async () => {
      const q = await quote(guest, { lines: [dealLine(world, 2)], orderType: 'PICKUP' });
      expect(q.subtotal).toBe(1800);
    });

    test("delivery needs an area, then adds that area's charge", async () => {
      const lines = [naanLine(world, 20)]; // Rs 600
      const noArea = await quote(guest, { lines, orderType: 'DELIVERY' });
      expect(noArea.issues.map((i) => i.code)).toContain('ZONE_REQUIRED');
      expect(noArea.canCheckout).toBe(false);

      const withArea = await quote(guest, { lines, orderType: 'DELIVERY', zoneId: world.zone.id });
      expect(withArea.canCheckout).toBe(true);
      expect(withArea.deliveryCharge).toBe(100);
      expect(withArea.grandTotal).toBe(700);
    });

    test("delivery is free above the area's threshold", async () => {
      const q = await quote(guest, {
        lines: [dealLine(world, 3)], // Rs 2,700
        orderType: 'DELIVERY',
        zoneId: world.zone.id,
      });
      expect(q.deliveryCharge).toBe(0);
      expect(q.grandTotal).toBe(2700);
    });

    test("a small order below the area's minimum cannot be delivered", async () => {
      const q = await quote(guest, {
        lines: [naanLine(world, 2)], // Rs 60, minimum is 300
        orderType: 'DELIVERY',
        zoneId: world.zone.id,
      });
      expect(q.canCheckout).toBe(false);
      expect(q.issues.map((i) => i.code)).toContain('BELOW_MINIMUM');
    });

    test('pickup and dine-in never pay delivery', async () => {
      for (const orderType of ['PICKUP', 'DINE_IN'] as const) {
        const q = await quote(guest, { lines: [naanLine(world, 4)], orderType });
        expect(q.deliveryCharge).toBe(0);
        expect(q.grandTotal).toBe(120);
      }
    });

    test('a percentage coupon takes the right amount off', async () => {
      const q = await quote(guest, {
        lines: [kababLine(world, { quantity: 2 })], // Rs 1,560
        orderType: 'PICKUP',
        couponCode: world.couponPercent,
      });
      expect(q.coupon).toMatchObject({ applied: true, discount: 156 });
      expect(q.grandTotal).toBe(1404);
    });

    test('a fixed coupon takes its amount off, and the code is not case sensitive', async () => {
      const q = await quote(guest, {
        lines: [naanLine(world, 10)], // Rs 300
        orderType: 'PICKUP',
        couponCode: ` ${world.couponFixed.toLowerCase()} `,
      });
      expect(q.coupon).toMatchObject({ applied: true, discount: 50 });
      expect(q.grandTotal).toBe(250);
    });

    test('a coupon below its minimum order, or a wrong one, is refused with a reason', async () => {
      const small = await quote(guest, {
        lines: [naanLine(world, 1)],
        orderType: 'PICKUP',
        couponCode: world.couponPercent,
      });
      expect(small.coupon).toMatchObject({ applied: false, reason: 'MIN_ORDER' });
      expect(small.grandTotal).toBe(30);

      const wrong = await quote(guest, {
        lines: [naanLine(world, 10)],
        orderType: 'PICKUP',
        couponCode: 'NOSUCHCODE',
      });
      expect(wrong.coupon).toMatchObject({ applied: false, reason: 'NOT_FOUND' });
    });

    test('prices sent by the browser are ignored', async () => {
      const reply = await guest.post('/api/v1/cart/quote', {
        lines: [{ ...naanLine(world, 1), unitPrice: 1, price: 1, lineTotal: 1 }],
        orderType: 'PICKUP',
        subtotal: 1,
        grandTotal: 1,
      });
      expect(reply.status).toBe(200);
      const q = (reply.data as { quote: { grandTotal: number } }).quote;
      expect(q.grandTotal).toBe(30);
    });

    test('rubbish in the cart is rejected cleanly', async () => {
      const cases: unknown[] = [
        { lines: [{ ...naanLine(world), quantity: 0 }], orderType: 'PICKUP' },
        { lines: [{ ...naanLine(world), quantity: -3 }], orderType: 'PICKUP' },
        { lines: [{ ...naanLine(world), quantity: 21 }], orderType: 'PICKUP' },
        { lines: [{ ...naanLine(world), quantity: 1.5 }], orderType: 'PICKUP' },
        { lines: [{ ...naanLine(world), productId: 'not-a-uuid' }], orderType: 'PICKUP' },
        { lines: [{ kind: 'hacker' }], orderType: 'PICKUP' },
        { lines: Array.from({ length: 51 }, () => naanLine(world)), orderType: 'PICKUP' },
        { lines: [naanLine(world)], orderType: 'TELEPORT' },
        { lines: 'not a list', orderType: 'PICKUP' },
        {},
        null,
      ];
      for (const body of cases) {
        const reply = await guest.post('/api/v1/cart/quote', body);
        expect(reply.status, JSON.stringify(body)?.slice(0, 80)).toBe(422);
        expect(reply.error?.code).toBe('VALIDATION_ERROR');
      }
    });

    test('broken JSON is a 400, and nothing leaks an internal error', async () => {
      const raw = await guest.context.fetch('/api/v1/cart/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        data: Buffer.from('{not json'),
      });
      expect(raw.status()).toBe(400);
      expect(await raw.text()).not.toMatch(/stack|prisma|SELECT/i);
    });

    test('a product that does not exist, and SQL-looking text, are harmless', async () => {
      const missing = await quote(guest, {
        lines: [{ ...naanLine(world), productId: '00000000-0000-4000-8000-000000000000' }],
        orderType: 'PICKUP',
      });
      expect(missing.canCheckout).toBe(false);
      expect(missing.issues.map((i) => i.code)).toContain('PRODUCT_NOT_FOUND');

      const sql = await quote(guest, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        couponCode: "x'; DROP TABLE orders;--",
      });
      expect(sql.coupon).toMatchObject({ applied: false });
    });
  });

  test.describe('placing an order', () => {
    // Each test is a different visitor, because the shop limits how many orders one address can place.
    let client: Api;
    test.beforeEach(async () => {
      client = await newApi();
    });
    test.afterEach(async () => {
      await client.dispose();
    });

    test('a guest can order pickup with just a name and phone', async () => {
      const phone = randomPhone();
      const { reply, order } = await placeOrder(client, {
        lines: [kababLine(world, { quantity: 2 }), naanLine(world, 4)],
        orderType: 'PICKUP',
        contact: guestContact(phone),
      });
      expect(reply.status).toBe(201);
      expect(order?.orderNumber).toMatch(/^BBQ-\d{4}-\d{4,}$/);
      expect(order?.status).toBe('RECEIVED');
      expect(order?.grandTotal).toBe(2 * 780 + 4 * 30);
      expect(order?.trackingToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(order?.estimatedReadyAt).toBeTruthy();
    });

    test('the tracking link shows progress but no personal details', async () => {
      const phone = randomPhone();
      const { order } = await placeOrder(client, {
        lines: [naanLine(world, 2)],
        orderType: 'PICKUP',
        contact: { name: 'Private Person', phone, email: 'private.person@example.com' },
      });

      // Anyone holding the link (no cookies) can follow the order.
      const stranger = await newApi();
      const tracked = await stranger.get(`/api/v1/orders/${order?.trackingToken ?? ''}`);
      expect(tracked.status).toBe(200);
      expect(tracked.headers['cache-control']).toContain('no-store');
      const body = tracked.text;
      expect(body).toContain(order?.orderNumber ?? 'missing');
      expect(body).not.toContain(phone);
      expect(body).not.toContain('Private Person');
      expect(body).not.toContain('private.person@example.com');
      await stranger.dispose();

      const page = await client.get(`/track/${order?.trackingToken ?? ''}`);
      expect(page.status).toBe(200);
    });

    test('an order number is never reusable as a tracking link', async () => {
      const { order } = await placeOrder(client, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
      });
      const byNumber = await client.get(`/api/v1/orders/${order?.orderNumber ?? ''}`);
      expect(byNumber.status).toBe(404);
      const random = await client.get('/api/v1/orders/00000000-0000-4000-8000-000000000000');
      expect(random.status).toBe(404);
    });

    test('pressing the button twice makes one order', async () => {
      const key = newKey();
      const phone = randomPhone();
      const input = {
        lines: [naanLine(world, 3)],
        orderType: 'PICKUP' as const,
        contact: guestContact(phone),
        idempotencyKey: key,
      };
      const first = await placeOrder(client, input);
      const again = await placeOrder(client, input);
      expect(first.reply.status).toBe(201);
      expect(again.reply.status).toBe(200);
      expect(again.order?.orderNumber).toBe(first.order?.orderNumber);
      expect(again.order?.trackingToken).toBe(first.order?.trackingToken);
    });

    test("the same key with a different cart is refused, never returning someone else's order", async () => {
      const key = newKey();
      const first = await placeOrder(client, {
        lines: [naanLine(world, 3)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
        idempotencyKey: key,
      });
      const other = await newApi();
      const clash = await placeOrder(other, {
        lines: [naanLine(world, 5)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
        idempotencyKey: key,
      });
      expect(first.reply.status).toBe(201);
      expect(clash.reply.status).toBe(409);
      expect(clash.reply.error?.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(clash.reply.text).not.toContain(first.order?.orderNumber ?? 'missing');
      await other.dispose();
    });

    test('ten identical simultaneous submits still make exactly one order', async () => {
      const key = newKey();
      const phone = randomPhone();
      const clients = await Promise.all(Array.from({ length: 10 }, () => newApi()));
      const priced = await quote(client, { lines: [naanLine(world, 2)], orderType: 'PICKUP' });
      const replies = await Promise.all(
        clients.map((client) =>
          client.post('/api/v1/orders', {
            lines: [naanLine(world, 2)],
            orderType: 'PICKUP',
            contact: guestContact(phone),
            idempotencyKey: key,
            expectedTotal: priced.grandTotal,
          }),
        ),
      );
      const numbers = new Set(
        replies.flatMap((r) => {
          const order = (r.data as { order?: { orderNumber: string } } | null)?.order;
          return order ? [order.orderNumber] : [];
        }),
      );
      expect(numbers.size).toBe(1);
      // Everyone got either the order or a polite "still being placed", never an error page.
      for (const reply of replies) {
        expect([200, 201, 409, 429]).toContain(reply.status);
      }
      await Promise.all(clients.map((c) => c.dispose()));
    });

    test('an order is refused if the price changed since the customer looked', async () => {
      const { reply } = await placeOrder(client, {
        lines: [naanLine(world, 2)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
        expectedTotal: 1,
      });
      expect(reply.status).toBe(409);
      expect(reply.error?.code).toBe('PRICE_CHANGED');
    });

    test('delivery needs an address, a known area and meets the minimum', async () => {
      const lines = [naanLine(world, 20)];
      const noAddress = await placeOrder(client, {
        lines,
        orderType: 'DELIVERY',
        zoneId: world.zone.id,
        contact: guestContact(randomPhone()),
      });
      expect(noAddress.reply.status).toBe(422);
      expect(noAddress.reply.error?.details?.['address.line1']).toBeTruthy();

      const ok = await placeOrder(client, {
        lines,
        orderType: 'DELIVERY',
        zoneId: world.zone.id,
        contact: guestContact(randomPhone()),
        address: { line1: 'House 12, Street 4', line2: 'Near the park' },
        instructions: 'Ring the bell twice',
      });
      expect(ok.reply.status).toBe(201);
      expect(ok.order?.grandTotal).toBe(700);

      const tooSmall = await placeOrder(client, {
        lines: [naanLine(world, 1)],
        orderType: 'DELIVERY',
        zoneId: world.zone.id,
        contact: guestContact(randomPhone()),
        address: { line1: 'House 12, Street 4' },
        expectedTotal: 130,
      });
      expect(tooSmall.reply.status).toBe(409);
      expect(tooSmall.reply.error?.code).toBe('CART_INVALID');
    });

    test('dine-in works the same way, with no address', async () => {
      const { reply, order } = await placeOrder(client, {
        lines: [dealLine(world)],
        orderType: 'DINE_IN',
        contact: guestContact(randomPhone()),
      });
      expect(reply.status).toBe(201);
      expect(order?.grandTotal).toBe(900);
    });

    test('a coupon is applied to the order and counted', async () => {
      const { reply, order } = await placeOrder(client, {
        lines: [kababLine(world, { quantity: 2 })],
        orderType: 'PICKUP',
        couponCode: world.couponPercent,
        contact: guestContact(randomPhone()),
      });
      expect(reply.status).toBe(201);
      expect(order?.grandTotal).toBe(1404);
    });

    test('contact details are checked', async () => {
      const bad = [
        { name: 'A', phone: randomPhone() },
        { name: 'Valid Name', phone: '12345' },
        { name: 'Valid Name', phone: '0412345678' },
        { name: 'Valid Name', phone: randomPhone(), email: 'not-an-email' },
        { name: '', phone: randomPhone() },
      ];
      for (const contact of bad) {
        const { reply } = await placeOrder(client, {
          lines: [naanLine(world)],
          orderType: 'PICKUP',
          contact,
          expectedTotal: 30,
        });
        expect(reply.status, JSON.stringify(contact)).toBe(422);
      }
    });

    test('phone numbers are accepted with spaces, dashes or +92', async () => {
      const digits = randomPhone().slice(2); // 9 digits after "03"
      for (const phone of [`03${digits.slice(0, 2)}-${digits.slice(2)}`, `+923${digits}`]) {
        const client = await newApi();
        const { reply } = await placeOrder(client, {
          lines: [naanLine(world)],
          orderType: 'PICKUP',
          contact: guestContact(phone),
        });
        expect(reply.status, phone).toBe(201);
        await client.dispose();
      }
    });

    test('one phone number cannot flood the kitchen', async () => {
      const phone = randomPhone();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const client = await newApi();
        const { reply } = await placeOrder(client, {
          lines: [naanLine(world)],
          orderType: 'PICKUP',
          contact: guestContact(phone),
        });
        statuses.push(reply.status);
        await client.dispose();
      }
      expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
      expect(statuses.slice(3)).toEqual([429, 429]);
    });

    test('an empty cart cannot be ordered', async () => {
      const reply = await client.post('/api/v1/orders', {
        lines: [],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
        idempotencyKey: newKey(),
        expectedTotal: 0,
      });
      expect(reply.status).toBe(409);
      expect(reply.error?.code).toBe('CART_INVALID');
    });
  });
});

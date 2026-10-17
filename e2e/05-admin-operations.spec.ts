import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, STAFF, newApi, randomPhone, signedIn, type Api } from './support/client';
import {
  ALL_DAY,
  guestContact,
  loadWorld,
  naanLine,
  placeOrder,
  quote,
  type World,
} from './support/world';

/** Karachi is always UTC+5, so "right now" there is simple to work out. */
function karachiNow() {
  const d = new Date(Date.now() + 5 * 3_600_000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const hhmm = (total: number) => {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** The owner runs the restaurant day to day: opening hours, tax, delivery areas and coupons. */
test.describe('admin: running the restaurant', () => {
  let world: World;
  let admin: Api;
  let visitor: Api;
  let restaurant: Record<string, unknown>;
  const tag = randomUUID().slice(0, 5).toUpperCase();
  const cleanup: (() => Promise<unknown>)[] = [];

  test.beforeAll(async () => {
    world = loadWorld();
    admin = await signedIn(ADMIN);
    visitor = await newApi();
    restaurant = (
      (await admin.get('/api/v1/admin/settings')).data as { restaurant: Record<string, unknown> }
    ).restaurant;
  });
  test.afterEach(async () => {
    // Whatever a scenario changed, the next one starts from "open all day, no tax".
    await save({ hours: ALL_DAY });
  });
  test.afterAll(async () => {
    for (const undo of cleanup.reverse()) await undo();
    await save({ hours: ALL_DAY });
    await visitor.dispose();
  });

  const save = (change: { hours?: unknown; restaurant?: Record<string, unknown> }) =>
    admin.put('/api/v1/admin/settings', {
      restaurant: { ...restaurant, orderingEnabled: true, taxRatePercent: 0, ...change.restaurant },
      hours: change.hours ?? ALL_DAY,
    });
  const cartNow = () => ({ lines: [naanLine(world, 10)], orderType: 'PICKUP' as const });

  test.describe('settings', () => {
    test('the current settings and a full week of hours can be read', async () => {
      const reply = await admin.get('/api/v1/admin/settings');
      expect(reply.status).toBe(200);
      const data = reply.data as { restaurant: { name: string }; hours: { dayOfWeek: number }[] };
      expect(data.restaurant.name).toBeTruthy();
      expect(data.hours.map((h) => h.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    test('tax set by the owner is added to every order, to the paisa', async () => {
      await save({ restaurant: { taxRatePercent: 5 } });
      const q = await quote(visitor, cartNow());
      expect(q.subtotal).toBe(300);
      expect(q.grandTotal).toBe(315);

      await save({ restaurant: { taxRatePercent: 16.5 } });
      expect((await quote(visitor, cartNow())).grandTotal).toBe(349.5);

      await save({ restaurant: { taxRatePercent: 0 } });
      expect((await quote(visitor, cartNow())).grandTotal).toBe(300);
    });

    test('an order placed with tax stores that tax', async () => {
      await save({ restaurant: { taxRatePercent: 10 } });
      const client = await newApi();
      const placed = await placeOrder(client, {
        lines: [naanLine(world, 10)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
      });
      await client.dispose();
      expect(placed.reply.status).toBe(201);
      expect(placed.order?.grandTotal).toBe(330);
    });

    test('switching online ordering off stops new orders but leaves the menu readable', async () => {
      await save({ restaurant: { orderingEnabled: false } });
      const q = await quote(visitor, cartNow());
      expect(q.canCheckout).toBe(false);
      expect(q.issues.map((i) => i.code)).toContain('ORDERING_DISABLED');
      expect((await visitor.page('/menu')).status).toBe(200);

      const client = await newApi();
      const attempt = await client.post('/api/v1/orders', {
        ...cartNow(),
        contact: guestContact(randomPhone()),
        idempotencyKey: randomUUID(),
        expectedTotal: 300,
      });
      await client.dispose();
      expect(attempt.status).toBe(409);
      expect(attempt.error?.code).toBe('CART_INVALID');

      await save({ restaurant: { orderingEnabled: true } });
      expect((await quote(visitor, cartNow())).canCheckout).toBe(true);
    });

    test('the restaurant name and address can be changed', async () => {
      await save({ restaurant: { name: `BBQ Store ${tag}`, address: '12 Test Road' } });
      const now = (await admin.get('/api/v1/admin/settings')).data as {
        restaurant: { name: string; address: string };
      };
      expect(now.restaurant).toMatchObject({ name: `BBQ Store ${tag}`, address: '12 Test Road' });
      await save({ restaurant: { name: restaurant['name'], address: restaurant['address'] } });
    });

    test('nonsense settings are refused and nothing changes', async () => {
      const before = (await admin.get('/api/v1/admin/settings')).text;
      const bad: Record<string, unknown>[] = [
        { taxRatePercent: -1 },
        { taxRatePercent: 31 },
        { taxRatePercent: 5.123 },
        { taxRatePercent: 'ten' },
        { name: '   ' },
        { orderingEnabled: 'yes' },
      ];
      for (const change of bad) {
        const reply = await save({ restaurant: change });
        expect(reply.status, JSON.stringify(change)).toBe(422);
      }
      expect((await admin.get('/api/v1/admin/settings')).text).toBe(before);
    });
  });

  test.describe('opening hours', () => {
    test('outside the hours nobody can order; inside them they can', async () => {
      const { minutes } = karachiNow();
      await save({
        hours: ALL_DAY.map((d) => ({
          ...d,
          openTime: hhmm(minutes + 120),
          closeTime: hhmm(minutes + 180),
        })),
      });
      const closed = await quote(visitor, cartNow());
      expect(closed.canCheckout).toBe(false);
      expect(closed.issues.map((i) => i.code)).toContain('RESTAURANT_CLOSED');

      await save({
        hours: ALL_DAY.map((d) => ({
          ...d,
          openTime: hhmm(minutes - 60),
          closeTime: hhmm(minutes + 60),
        })),
      });
      expect((await quote(visitor, cartNow())).canCheckout).toBe(true);
    });

    test('a night shift that closes after midnight is understood', async () => {
      const { minutes } = karachiNow();
      // Opens an hour ago, closes "before" it opened: that means closing the next morning.
      await save({
        hours: ALL_DAY.map((d) => ({
          ...d,
          openTime: hhmm(minutes - 60),
          closeTime: hhmm(minutes - 120),
        })),
      });
      expect((await quote(visitor, cartNow())).canCheckout).toBe(true);
      // Opens in an hour and closes late: right now is before opening.
      await save({
        hours: ALL_DAY.map((d) => ({
          ...d,
          openTime: hhmm(minutes + 60),
          closeTime: hhmm(minutes - 120),
        })),
      });
      expect((await quote(visitor, cartNow())).canCheckout).toBe(false);
    });

    test('closing today only shuts today', async () => {
      const { day } = karachiNow();
      await save({
        hours: ALL_DAY.map((d) =>
          d.dayOfWeek === day
            ? { dayOfWeek: day, isClosed: true, openTime: null, closeTime: null }
            : d,
        ),
      });
      const closed = await quote(visitor, cartNow());
      expect(closed.issues.map((i) => i.code)).toContain('RESTAURANT_CLOSED');
      const stored = (
        (await admin.get('/api/v1/admin/settings')).data as {
          hours: { dayOfWeek: number; isClosed: boolean; openTime: string | null }[];
        }
      ).hours;
      expect(stored.find((h) => h.dayOfWeek === day)).toMatchObject({
        isClosed: true,
        openTime: null,
      });
      expect(stored.filter((h) => !h.isClosed)).toHaveLength(6);
    });

    test('a closed restaurant also refuses an order that was prepared earlier', async () => {
      const { minutes } = karachiNow();
      await save({
        hours: ALL_DAY.map((d) => ({
          ...d,
          openTime: hhmm(minutes + 120),
          closeTime: hhmm(minutes + 180),
        })),
      });
      const client = await newApi();
      const reply = await client.post('/api/v1/orders', {
        ...cartNow(),
        contact: guestContact(randomPhone()),
        idempotencyKey: randomUUID(),
        expectedTotal: 300,
      });
      await client.dispose();
      expect(reply.status).toBe(409);
      expect(reply.error?.code).toBe('CART_INVALID');
    });

    test('bad hours are refused', async () => {
      const week = (change: (d: (typeof ALL_DAY)[number]) => unknown) => ALL_DAY.map(change);
      const bad: [string, unknown][] = [
        ['six days', ALL_DAY.slice(0, 6)],
        ['a repeated day', week((d) => ({ ...d, dayOfWeek: 1 }))],
        ['day 7', week((d) => (d.dayOfWeek === 6 ? { ...d, dayOfWeek: 7 } : d))],
        ['6pm', week((d) => ({ ...d, openTime: '6pm' }))],
        ['25:00', week((d) => ({ ...d, openTime: '25:00' }))],
        ['same time', week((d) => ({ ...d, openTime: '10:00', closeTime: '10:00' }))],
        ['open without times', week((d) => ({ ...d, openTime: null, closeTime: null }))],
      ];
      for (const [label, hours] of bad) {
        const reply = await save({ hours });
        expect(reply.status, label).toBe(422);
      }
    });
  });

  test.describe('delivery areas', () => {
    const zone = (name: string, extra: Record<string, unknown> = {}) => ({
      name,
      charge: 150,
      freeDeliveryAbove: 1500,
      minOrderAmount: 200,
      isActive: true,
      sortOrder: 901,
      ...extra,
    });
    async function makeZone(name: string, extra: Record<string, unknown> = {}) {
      const reply = await admin.post('/api/v1/admin/zones', zone(name, extra));
      expect(reply.status, reply.text).toBe(201);
      const id = (reply.data as { id: string }).id;
      cleanup.push(() => admin.del(`/api/v1/admin/zones/${id}`));
      return id;
    }
    const delivery = (zoneId: string, quantity = 10) => ({
      lines: [naanLine(world, quantity)],
      orderType: 'DELIVERY' as const,
      zoneId,
    });

    test('a new area charges its own delivery fee', async () => {
      const id = await makeZone(`Area A ${tag}`, { charge: 180 });
      const q = await quote(visitor, delivery(id));
      expect(q.deliveryCharge).toBe(180);
      expect(q.grandTotal).toBe(480);
    });

    test('changing the fee, the free-delivery limit or the minimum changes the next order', async () => {
      const id = await makeZone(`Area B ${tag}`);
      expect((await quote(visitor, delivery(id))).deliveryCharge).toBe(150);

      await admin.patch(`/api/v1/admin/zones/${id}`, zone(`Area B ${tag}`, { charge: 90 }));
      expect((await quote(visitor, delivery(id))).deliveryCharge).toBe(90);

      await admin.patch(
        `/api/v1/admin/zones/${id}`,
        zone(`Area B ${tag}`, { charge: 90, freeDeliveryAbove: 250 }),
      );
      expect((await quote(visitor, delivery(id))).deliveryCharge).toBe(0);

      await admin.patch(
        `/api/v1/admin/zones/${id}`,
        zone(`Area B ${tag}`, { charge: 90, freeDeliveryAbove: null, minOrderAmount: 500 }),
      );
      const below = await quote(visitor, delivery(id));
      expect(below.canCheckout).toBe(false);
      expect(below.issues.map((i) => i.code)).toContain('BELOW_MINIMUM');
      expect(below.deliveryCharge).toBe(90);
    });

    test('a free area never charges delivery', async () => {
      const id = await makeZone(`Area C ${tag}`, {
        charge: 0,
        freeDeliveryAbove: null,
        minOrderAmount: 0,
      });
      expect((await quote(visitor, delivery(id, 1))).deliveryCharge).toBe(0);
    });

    test('switching an area off stops deliveries there', async () => {
      const id = await makeZone(`Area D ${tag}`);
      await admin.patch(`/api/v1/admin/zones/${id}`, zone(`Area D ${tag}`, { isActive: false }));
      const q = await quote(visitor, delivery(id));
      expect(q.canCheckout).toBe(false);
      expect(q.issues.map((i) => i.code)).toContain('ZONE_INVALID');
    });

    test('an unknown area is rejected', async () => {
      const q = await quote(visitor, delivery(randomUUID()));
      expect(q.canCheckout).toBe(false);
      expect(q.issues.map((i) => i.code)).toContain('ZONE_INVALID');
    });

    test('an order to an area records the area for the kitchen', async () => {
      const id = await makeZone(`Area E ${tag}`, { minOrderAmount: 0 });
      const client = await newApi();
      const placed = await placeOrder(client, {
        ...delivery(id, 4),
        contact: guestContact(randomPhone()),
        address: { line1: '5 Test Lane' },
      });
      await client.dispose();
      expect(placed.reply.status).toBe(201);
      const staff = await signedIn(STAFF);
      const board = (await staff.get('/api/v1/store/orders')).data as {
        orders: { orderNumber: string; address: { area: string } | null }[];
      };
      expect(
        board.orders.find((o) => o.orderNumber === placed.order?.orderNumber)?.address?.area,
      ).toBe(`Area E ${tag}`);
    });

    test('an area can be deleted when no customer has saved an address in it', async () => {
      const id = await makeZone(`Area F ${tag}`);
      expect((await admin.del(`/api/v1/admin/zones/${id}`)).data).toMatchObject({
        outcome: 'deleted',
      });
      const list = (await admin.get('/api/v1/admin/zones')).data as { zones: { id: string }[] };
      expect(list.zones.some((z) => z.id === id)).toBe(false);
    });

    test('bad area details are refused', async () => {
      for (const extra of [
        { name: '' },
        { charge: -1 },
        { charge: 'free' },
        { minOrderAmount: -5 },
        { freeDeliveryAbove: -1 },
        { sortOrder: -1 },
      ]) {
        expect(
          (await admin.post('/api/v1/admin/zones', zone('Bad Area', extra))).status,
          JSON.stringify(extra),
        ).toBe(422);
      }
      expect((await admin.patch(`/api/v1/admin/zones/${randomUUID()}`, zone('x'))).status).toBe(
        404,
      );
      expect((await admin.del('/api/v1/admin/zones/not-a-uuid')).status).toBe(404);
    });
  });

  test.describe('coupons', () => {
    const coupon = (code: string, extra: Record<string, unknown> = {}) => ({
      code,
      type: 'PERCENTAGE',
      amount: 20,
      minimumOrderAmount: 100,
      usageLimit: null,
      expiresAt: null,
      isActive: true,
      ...extra,
    });
    async function makeCoupon(code: string, extra: Record<string, unknown> = {}) {
      const reply = await admin.post('/api/v1/admin/coupons', coupon(code, extra));
      expect(reply.status, reply.text).toBe(201);
      const id = (reply.data as { id: string }).id;
      cleanup.push(() => admin.del(`/api/v1/admin/coupons/${id}`));
      return id;
    }
    const withCode = (couponCode: string) => ({ ...cartNow(), couponCode });
    const listed = async (id: string) =>
      (
        (await admin.get('/api/v1/admin/coupons')).data as {
          coupons: { id: string; usedCount: number; isActive: boolean }[];
        }
      ).coupons.find((c) => c.id === id);

    test('a new coupon works at checkout the moment it is saved', async () => {
      await makeCoupon(`NEW${tag}`);
      const q = await quote(visitor, withCode(`NEW${tag}`));
      expect(q.coupon).toMatchObject({ applied: true, discount: 60 });
      expect(q.grandTotal).toBe(240);
    });

    test('codes are saved in capitals and typed in any case', async () => {
      await makeCoupon(`mixed${tag.toLowerCase()}`);
      const q = await quote(visitor, withCode(`MiXeD${tag}`));
      expect(q.coupon?.applied).toBe(true);
    });

    test('a coupon below its minimum order, expired, or switched off says why', async () => {
      await makeCoupon(`MIN${tag}`, { minimumOrderAmount: 1000 });
      expect((await quote(visitor, withCode(`MIN${tag}`))).coupon).toMatchObject({
        applied: false,
        reason: 'MIN_ORDER',
      });

      await makeCoupon(`OLD${tag}`, { expiresAt: new Date(Date.now() - 86_400_000).toISOString() });
      expect((await quote(visitor, withCode(`OLD${tag}`))).coupon).toMatchObject({
        applied: false,
        reason: 'EXPIRED',
      });

      const off = await makeCoupon(`OFF${tag}`);
      await admin.patch(`/api/v1/admin/coupons/${off}`, coupon(`OFF${tag}`, { isActive: false }));
      expect((await quote(visitor, withCode(`OFF${tag}`))).coupon).toMatchObject({
        applied: false,
        reason: 'INACTIVE',
      });

      await makeCoupon(`LATE${tag}`, {
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect((await quote(visitor, withCode(`LATE${tag}`))).coupon?.applied).toBe(true);
    });

    test('a fixed coupon cannot take more than the order is worth', async () => {
      await makeCoupon(`BIG${tag}`, { type: 'FIXED', amount: 5000, minimumOrderAmount: 0 });
      const q = await quote(visitor, withCode(`BIG${tag}`));
      expect(q.grandTotal).toBeGreaterThanOrEqual(0);
      expect(q.couponDiscount).toBeLessThanOrEqual(300);
    });

    test('a coupon with a limit stops working after that many orders, and counts them', async () => {
      const id = await makeCoupon(`LIM${tag}`, { usageLimit: 2 });
      const results: number[] = [];
      const totals: number[] = [];
      for (let i = 0; i < 3; i++) {
        const client = await newApi();
        const placed = await placeOrder(client, {
          ...cartNow(),
          couponCode: `LIM${tag}`,
          contact: guestContact(randomPhone()),
        });
        results.push(placed.reply.status);
        totals.push(placed.order?.grandTotal ?? -1);
        await client.dispose();
      }
      expect(results.slice(0, 2)).toEqual([201, 201]);
      // The third customer is still served, but the coupon is no longer applied to their order.
      expect(results[2]).toBe(201);
      expect(totals).toEqual([240, 240, 300]);
      expect((await listed(id))?.usedCount).toBe(2);
      expect((await quote(visitor, withCode(`LIM${tag}`))).coupon).toMatchObject({
        applied: false,
        reason: 'USAGE_LIMIT',
      });
    });

    test('six people racing for the last two uses: exactly two win', async () => {
      const id = await makeCoupon(`RACE${tag}`, { usageLimit: 2 });
      const clients = await Promise.all(Array.from({ length: 6 }, () => newApi()));
      const replies = await Promise.all(
        clients.map(async (client) => {
          const priced = await quote(client, withCode(`RACE${tag}`));
          return client.post('/api/v1/orders', {
            ...withCode(`RACE${tag}`),
            contact: guestContact(randomPhone()),
            idempotencyKey: randomUUID(),
            expectedTotal: priced.grandTotal,
          });
        }),
      );
      expect(replies.filter((r) => r.status === 201)).toHaveLength(2);
      expect((await listed(id))?.usedCount).toBe(2);
      for (const loser of replies.filter((r) => r.status !== 201)) {
        expect([409, 429]).toContain(loser.status);
      }
      await Promise.all(clients.map((c) => c.dispose()));
    });

    test('a code cannot be created twice, in any case', async () => {
      await makeCoupon(`DUP${tag}`);
      const again = await admin.post('/api/v1/admin/coupons', coupon(`dup${tag.toLowerCase()}`));
      expect(again.status).toBe(409);
      expect(again.error?.code).toBe('COUPON_CODE_TAKEN');
      expect(again.error?.details?.['code']).toBeTruthy();
    });

    test('a used coupon is switched off rather than erased; an unused one is deleted', async () => {
      const used = await makeCoupon(`USED${tag}`);
      const client = await newApi();
      await placeOrder(client, {
        ...cartNow(),
        couponCode: `USED${tag}`,
        contact: guestContact(randomPhone()),
      });
      await client.dispose();
      expect((await admin.del(`/api/v1/admin/coupons/${used}`)).data).toMatchObject({
        outcome: 'archived',
      });
      expect((await listed(used))?.isActive).toBe(false);

      const unused = await makeCoupon(`UNUSED${tag}`);
      expect((await admin.del(`/api/v1/admin/coupons/${unused}`)).data).toMatchObject({
        outcome: 'deleted',
      });
      expect(await listed(unused)).toBeUndefined();
    });

    test('bad coupon details are refused', async () => {
      const bad: Record<string, unknown>[] = [
        { code: 'AB' },
        { code: 'has space' },
        { code: 'bad!code' },
        { code: 'X'.repeat(25) },
        { amount: 0 },
        { amount: -5 },
        { type: 'PERCENTAGE', amount: 101 },
        { usageLimit: 0 },
        { usageLimit: 2.5 },
        { expiresAt: 'soon' },
        { minimumOrderAmount: -1 },
        { type: 'FREEBIE' },
      ];
      for (const extra of bad) {
        const reply = await admin.post('/api/v1/admin/coupons', coupon(`BAD${tag}`, extra));
        expect(reply.status, JSON.stringify(extra)).toBe(422);
      }
      expect(
        (await admin.patch(`/api/v1/admin/coupons/${randomUUID()}`, coupon('ANYCODE'))).status,
      ).toBe(404);
    });
  });

  test.describe('who may change any of this', () => {
    test('a visitor, a customer and store staff are all refused', async () => {
      const staff = await signedIn(STAFF);
      const customer = await newApi();
      await customer.post('/api/auth/signup', {
        name: 'Just A Customer',
        email: `c.${randomUUID().slice(0, 8)}@example.com`,
        password: 'correct-horse-9',
      });
      const nobody = await newApi();

      const attempts: [string, string, unknown][] = [
        [
          'PUT',
          '/api/v1/admin/settings',
          {
            restaurant: { name: 'Hacked', taxRatePercent: 0, orderingEnabled: false },
            hours: ALL_DAY,
          },
        ],
        [
          'POST',
          '/api/v1/admin/zones',
          { name: 'Hacked', charge: 0, minOrderAmount: 0, isActive: true, sortOrder: 0 },
        ],
        [
          'POST',
          '/api/v1/admin/coupons',
          {
            code: 'HACKED',
            type: 'PERCENTAGE',
            amount: 100,
            minimumOrderAmount: 0,
            isActive: true,
          },
        ],
      ];
      for (const [who, api, expected] of [
        [nobody, 'nobody', 401],
        [customer, 'customer', 403],
        [staff, 'staff', 403],
      ] as const) {
        void api;
        for (const [method, path, body] of attempts) {
          const reply = method === 'PUT' ? await who.put(path, body) : await who.post(path, body);
          expect(reply.status, `${api} ${method} ${path}`).toBe(expected);
        }
      }
      // And nothing changed.
      expect((await quote(visitor, cartNow())).canCheckout).toBe(true);
      await Promise.all([customer.dispose(), nobody.dispose()]);
    });
  });
});

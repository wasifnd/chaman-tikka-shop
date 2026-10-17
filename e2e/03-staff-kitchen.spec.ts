import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  STAFF,
  newApi,
  randomEmail,
  randomPhone,
  signedIn,
  type Api,
} from './support/client';
import {
  dealLine,
  guestContact,
  kababLine,
  loadWorld,
  naanLine,
  placeOrder,
  type World,
} from './support/world';

interface StaffOrder {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  customerName: string;
  phone: string;
  address: { line1: string; line2: string | null; area: string } | null;
  instructions: string | null;
  items: { name: string; options: string[]; quantity: number; note: string | null }[];
  paymentStatus: string;
  cancelReason: string | null;
  grandTotal: number;
}

/** The store panel and kitchen display: what staff see, and how orders move through the shop. */
test.describe('store staff and kitchen', () => {
  let world: World;
  let staff: Api;
  let guest: Api;

  test.beforeAll(async () => {
    world = loadWorld();
    staff = await signedIn(STAFF);
  });
  test.beforeEach(async () => {
    // A different visitor each time: the shop limits how many orders one address can place.
    guest = await newApi();
  });
  test.afterEach(async () => {
    await guest.dispose();
  });

  async function order(
    type: 'DELIVERY' | 'PICKUP' | 'DINE_IN',
    extra: { name?: string; phone?: string; instructions?: string } = {},
  ) {
    const base = {
      orderType: type,
      contact: guestContact(extra.phone ?? randomPhone(), extra.name ?? 'Kitchen Test'),
      ...(extra.instructions ? { instructions: extra.instructions } : {}),
    };
    const placed =
      type === 'DELIVERY'
        ? await placeOrder(guest, {
            ...base,
            lines: [kababLine(world, { quantity: 2, note: 'less spicy' }), naanLine(world, 6)],
            zoneId: world.zone.id,
            address: { line1: 'House 7, Street 3', line2: 'Behind the market' },
          })
        : await placeOrder(guest, { ...base, lines: [dealLine(world), naanLine(world, 2)] });
    expect(placed.reply.status).toBe(201);
    return placed.order as NonNullable<typeof placed.order>;
  }

  const board = async (scope: 'active' | 'finished' = 'active') => {
    const reply = await staff.get(
      `/api/v1/store/orders${scope === 'finished' ? '?scope=finished' : ''}`,
    );
    expect(reply.status).toBe(200);
    return (reply.data as { orders: StaffOrder[]; lastEventId: number }).orders;
  };
  const find = async (orderNumber: string, scope: 'active' | 'finished' = 'active') =>
    (await board(scope)).find((o) => o.orderNumber === orderNumber);

  const move = (id: string, status: string, reason?: string) =>
    staff.patch(`/api/v1/store/orders/${id}/status`, { status, ...(reason ? { reason } : {}) });

  const customerSees = async (token: string) => {
    const reply = await newApi().then(async (api) => {
      const r = await api.get(`/api/v1/orders/${token}`);
      await api.dispose();
      return r;
    });
    return (reply.data as { order: { status: string; timeline: { status: string }[] } }).order;
  };

  test.describe('seeing new orders', () => {
    test('a new order shows up on the board with everything needed to cook and hand it over', async () => {
      const placed = await order('DELIVERY', {
        name: 'Hina Ahmed',
        phone: '03211234567',
        instructions: 'Gate code 4421',
      });
      const seen = await find(placed.orderNumber);
      expect(seen).toBeDefined();
      expect(seen).toMatchObject({
        status: 'RECEIVED',
        type: 'DELIVERY',
        customerName: 'Hina Ahmed',
        phone: '03211234567',
        instructions: 'Gate code 4421',
        paymentStatus: 'PENDING',
        address: { line1: 'House 7, Street 3', line2: 'Behind the market', area: world.zone.name },
      });
      const kabab = seen?.items.find((i) => i.name === world.kabab.name);
      expect(kabab).toMatchObject({ quantity: 2, note: 'less spicy' });
      expect(kabab?.options).toContain('Half');
    });

    test('a deal shows what is inside it, so the kitchen knows what to make', async () => {
      const placed = await order('PICKUP');
      const seen = await find(placed.orderNumber);
      const deal = seen?.items.find((i) => i.name === world.dealName);
      expect(deal?.options.join(' ')).toContain(world.kabab.name);
      expect(deal?.options.join(' ')).toMatch(/4 ×|4x|× 4/);
    });

    test("staff see the customer details that the customer's own link hides", async () => {
      const phone = randomPhone();
      const placed = await order('PICKUP', { name: 'Only Staff See Me', phone });
      expect(JSON.stringify(await find(placed.orderNumber))).toContain(phone);
      const tracked = await newApi();
      const text = (await tracked.get(`/api/v1/orders/${placed.trackingToken}`)).text;
      expect(text).not.toContain(phone);
      expect(text).not.toContain('Only Staff See Me');
      await tracked.dispose();
    });

    test('the oldest order is listed first so nothing waits at the bottom', async () => {
      const first = await order('PICKUP');
      const second = await order('PICKUP');
      const numbers = (await board()).map((o) => o.orderNumber);
      expect(numbers.indexOf(first.orderNumber)).toBeLessThan(numbers.indexOf(second.orderNumber));
    });
  });

  test.describe('working an order through the shop', () => {
    const journeys: [string, 'DELIVERY' | 'PICKUP' | 'DINE_IN', string[]][] = [
      [
        'delivery',
        'DELIVERY',
        ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'],
      ],
      ['pickup', 'PICKUP', ['CONFIRMED', 'PREPARING', 'READY', 'PICKED', 'COMPLETED']],
      ['dine-in', 'DINE_IN', ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']],
    ];

    for (const [label, type, steps] of journeys) {
      test(`a ${label} order goes from new to complete, and the customer sees every step`, async () => {
        const placed = await order(type);
        const id = (await find(placed.orderNumber))?.id ?? '';
        expect(id).not.toBe('');

        for (const status of steps) {
          const reply = await move(id, status);
          expect(reply.status, `${label} -> ${status}: ${reply.text}`).toBe(200);
          expect((await customerSees(placed.trackingToken)).status).toBe(status);
        }

        const timeline = (await customerSees(placed.trackingToken)).timeline.map((t) => t.status);
        expect(timeline).toEqual(['RECEIVED', ...steps]);

        // Finished orders leave the live board and move to "recently finished".
        expect(await find(placed.orderNumber)).toBeUndefined();
        const done = await find(placed.orderNumber, 'finished');
        expect(done).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID' });
      });
    }

    test('staff can reject a new order with a reason that stays on record', async () => {
      const placed = await order('PICKUP');
      const id = (await find(placed.orderNumber))?.id ?? '';

      const noReason = await move(id, 'CANCELLED');
      expect(noReason.status).toBe(400);
      expect(noReason.error?.code).toBe('REASON_REQUIRED');
      expect((await find(placed.orderNumber))?.status).toBe('RECEIVED');

      expect((await move(id, 'CANCELLED', 'Out of chicken tonight')).status).toBe(200);
      const done = await find(placed.orderNumber, 'finished');
      expect(done).toMatchObject({ status: 'CANCELLED', cancelReason: 'Out of chicken tonight' });
      expect((await customerSees(placed.trackingToken)).status).toBe('CANCELLED');
    });

    test('an order can be cancelled part-way through cooking, but not once it is out the door', async () => {
      const cooking = await order('DELIVERY');
      const cookingId = (await find(cooking.orderNumber))?.id ?? '';
      await move(cookingId, 'CONFIRMED');
      await move(cookingId, 'PREPARING');
      expect((await move(cookingId, 'CANCELLED', 'Customer called to cancel')).status).toBe(200);

      const onTheWay = await order('DELIVERY');
      const onTheWayId = (await find(onTheWay.orderNumber))?.id ?? '';
      for (const status of ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']) {
        await move(onTheWayId, status);
      }
      const late = await move(onTheWayId, 'CANCELLED', 'Too late');
      expect(late.status).toBe(409);
      expect(late.error?.code).toBe('INVALID_TRANSITION');
    });

    test('steps cannot be skipped, repeated or taken backwards', async () => {
      const placed = await order('PICKUP');
      const id = (await find(placed.orderNumber))?.id ?? '';
      const invalid = async (status: string) => {
        const reply = await move(id, status);
        expect(reply.status, status).toBe(409);
        expect(reply.error?.code).toBe('INVALID_TRANSITION');
      };

      await invalid('PREPARING'); // skipping "accept"
      await invalid('COMPLETED');
      await invalid('RECEIVED');
      expect((await move(id, 'CONFIRMED')).status).toBe(200);
      await invalid('CONFIRMED'); // repeating
      await invalid('RECEIVED'); // backwards
      await invalid('READY'); // skipping "preparing"
      // Pickup orders are never "out for delivery" or "served".
      await move(id, 'PREPARING');
      await move(id, 'READY');
      await invalid('OUT_FOR_DELIVERY');
      await invalid('SERVED');
      expect((await move(id, 'PICKED')).status).toBe(200);
    });

    test('a finished order is final', async () => {
      const placed = await order('DINE_IN');
      const id = (await find(placed.orderNumber))?.id ?? '';
      for (const status of ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']) {
        await move(id, status);
      }
      for (const status of ['PREPARING', 'CANCELLED', 'RECEIVED', 'COMPLETED']) {
        const reply = await move(id, status, 'x');
        expect(reply.status, status).toBe(409);
      }
    });

    test('ten people pressing Accept at once: exactly one succeeds, the rest are told it moved', async () => {
      const placed = await order('PICKUP');
      const id = (await find(placed.orderNumber))?.id ?? '';
      const replies = await Promise.all(Array.from({ length: 10 }, () => move(id, 'CONFIRMED')));
      expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
      expect(replies.filter((r) => r.status === 409)).toHaveLength(9);
      // The history has the step exactly once.
      const timeline = (await customerSees(placed.trackingToken)).timeline.map((t) => t.status);
      expect(timeline.filter((s) => s === 'CONFIRMED')).toHaveLength(1);
    });

    test('staff can work on different orders at the same time without interfering', async () => {
      const placed = await Promise.all(
        Array.from({ length: 4 }, async () => {
          const client = await newApi();
          const result = await placeOrder(client, {
            lines: [naanLine(world, 2)],
            orderType: 'PICKUP',
            contact: guestContact(randomPhone()),
          });
          await client.dispose();
          return result.order as NonNullable<typeof result.order>;
        }),
      );
      const ids = await Promise.all(placed.map(async (p) => (await find(p.orderNumber))?.id ?? ''));
      const replies = await Promise.all(ids.map((id) => move(id, 'CONFIRMED')));
      expect(replies.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    });
  });

  test.describe('bad requests', () => {
    test('unknown, malformed and invalid input get clear errors', async () => {
      expect((await move('00000000-0000-4000-8000-000000000000', 'CONFIRMED')).status).toBe(404);
      expect((await move('not-a-uuid', 'CONFIRMED')).status).toBe(404);

      const placed = await order('PICKUP');
      const id = (await find(placed.orderNumber))?.id ?? '';
      expect((await move(id, 'TELEPORTED')).status).toBe(422);
      expect((await staff.patch(`/api/v1/store/orders/${id}/status`, {})).status).toBe(422);
      expect(
        (
          await staff.patch(`/api/v1/store/orders/${id}/status`, {
            status: 'CONFIRMED',
            reason: 'x'.repeat(201),
          })
        ).status,
      ).toBe(422);
    });

    test('a request from another website is refused', async () => {
      const placed = await order('PICKUP');
      const id = (await find(placed.orderNumber))?.id ?? '';
      const reply = await staff.patch(
        `/api/v1/store/orders/${id}/status`,
        { status: 'CONFIRMED' },
        { origin: 'https://evil.example.com' },
      );
      expect(reply.status).toBe(403);
      expect(reply.error?.code).toBe('BAD_ORIGIN');
      expect((await find(placed.orderNumber))?.status).toBe('RECEIVED');
    });
  });

  test.describe('the live kitchen feed', () => {
    /** Reads the live feed for a few seconds, like the kitchen display's connection. */
    async function listen(
      path: string,
      cookie: string,
      ms: number,
      headers: Record<string, string> = {},
      until: (text: string) => boolean = () => false,
    ) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, ms);
      let text = '';
      try {
        const response = await fetch(`${BASE_URL}${path}`, {
          headers: { cookie, ...headers },
          signal: controller.signal,
        });
        if (!response.body) return { status: response.status, text };
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          // Stop early once everything expected has arrived; a slow connection gets the full time.
          if (until(text)) break;
        }
        return { status: response.status, text };
      } catch {
        return { status: 200, text };
      } finally {
        clearTimeout(timer);
      }
    }

    const cookieHeader = async (api: Api) =>
      (await api.context.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    test('only staff can listen', async () => {
      const visitor = await newApi();
      expect((await visitor.get('/api/v1/store/events')).status).toBe(401);
      await visitor.post('/api/auth/signup', {
        name: 'Plain Customer',
        email: randomEmail(),
        password: 'correct-horse-9',
      });
      expect((await visitor.get('/api/v1/store/events')).status).toBe(403);
      await visitor.dispose();
    });

    test('a new order and each status change arrive without refreshing', async () => {
      const before = await board();
      void before;
      const latest = (await staff.get('/api/v1/store/orders')).data as { lastEventId: number };
      const cookie = await cookieHeader(staff);

      const listening = listen(
        `/api/v1/store/events?after=${String(latest.lastEventId)}`,
        cookie,
        24_000,
        {},
        (text) => text.includes('"status":"PREPARING"'),
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const placed = await order('PICKUP');
      const id = (await find(placed.orderNumber))?.id ?? '';
      await move(id, 'CONFIRMED');
      await move(id, 'PREPARING');

      const { status, text } = await listening;
      expect(status).toBe(200);
      expect(text).toContain('event: order.created');
      expect(text).toContain(`"status":"RECEIVED"`);
      expect(text).toContain('event: order.status_changed');
      expect(text).toContain(`"status":"PREPARING"`);
      expect(text).toContain(placed.orderNumber);
    });

    test('a display that was offline catches up on what it missed when it reconnects', async () => {
      const latest = (await staff.get('/api/v1/store/orders')).data as { lastEventId: number };
      const cookie = await cookieHeader(staff);

      // Orders arrive while the screen is disconnected.
      const first = await order('PICKUP');
      const second = await order('DINE_IN');

      const caughtUp = await listen('/api/v1/store/events', cookie, 6_000, {
        'last-event-id': String(latest.lastEventId),
      });
      expect(caughtUp.text).toContain(first.orderNumber);
      expect(caughtUp.text).toContain(second.orderNumber);
    });

    test("a customer's own feed shows only their order", async () => {
      const mine = await order('PICKUP');
      const other = await order('PICKUP');
      const reader = await newApi();
      const cookie = '';
      const feed = await listen(
        `/api/v1/orders/${mine.trackingToken}/events?after=0`,
        cookie,
        4_000,
      );
      expect(feed.text).toContain('order.created');
      expect(feed.text).not.toContain(other.orderNumber);
      expect(feed.text).not.toContain(other.trackingToken);
      await reader.dispose();
    });
  });
});

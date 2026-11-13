import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  STAFF,
  newApi,
  randomEmail,
  randomPhone,
  signUp,
  signedIn,
  type Api,
} from './support/client';
import { guestContact, loadWorld, naanLine, placeOrder, type World } from './support/world';

const PASSWORD = 'correct-horse-9';

interface Address {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  zoneId: string;
  zoneName: string;
  zoneActive: boolean;
  isDefault: boolean;
}

/** A customer's own pages: their order history and saved addresses, and who may see them. */
test.describe('customer account', () => {
  let world: World;
  let admin: Api;

  test.beforeAll(async () => {
    world = loadWorld();
    admin = await signedIn(ADMIN);
  });

  async function newCustomer(name = 'Account Tester') {
    const api = await newApi();
    const email = randomEmail('acct');
    const signup = await signUp(api, { name, email, password: PASSWORD });
    expect(signup.status).toBe(201);
    return { api, email, phone: signup.phone };
  }

  const body = (zoneId: string, extra: Record<string, unknown> = {}) => ({
    label: 'Home',
    addressLine1: 'House 12, Street 4',
    addressLine2: '',
    zoneId,
    isDefault: false,
    ...extra,
  });
  const list = async (api: Api) =>
    ((await api.get('/api/v1/account/addresses')).data as { addresses: Address[] }).addresses;

  test.describe('order history', () => {
    test('shows a signed-in customer their own orders, newest first, with a tracking link', async () => {
      const { api } = await newCustomer();
      const first = await placeOrder(api, {
        lines: [naanLine(world, 2)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone(), 'Account Tester'),
      });
      const second = await placeOrder(api, {
        lines: [naanLine(world, 3)],
        orderType: 'DINE_IN',
        contact: guestContact(randomPhone(), 'Account Tester'),
      });
      expect(first.reply.status).toBe(201);
      expect(second.reply.status).toBe(201);

      const page = await api.get('/account/orders');
      expect(page.status).toBe(200);
      const a = first.order?.orderNumber ?? '';
      const b = second.order?.orderNumber ?? '';
      expect(page.text).toContain(a);
      expect(page.text).toContain(b);
      expect(page.text.indexOf(b)).toBeLessThan(page.text.indexOf(a));
      expect(page.text).toContain(`/track/${second.order?.trackingToken ?? ''}`);
      expect(page.text).toContain(world.naan.name);
      expect(page.text).toMatch(/2 orders/);
      await api.dispose();
    });

    test("never shows anyone else's orders, and guest orders are not in it", async () => {
      const alice = await newCustomer('Alice');
      const bob = await newCustomer('Bob');
      const aliceOrder = await placeOrder(alice.api, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone(), 'Alice'),
      });
      const guest = await newApi();
      const guestOrder = await placeOrder(guest, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone(), 'Guest'),
      });

      const bobPage = (await bob.api.get('/account/orders')).text;
      expect(bobPage).not.toContain(aliceOrder.order?.orderNumber ?? 'missing');
      expect(bobPage).not.toContain(guestOrder.order?.orderNumber ?? 'missing');
      expect(bobPage).toContain('You have not placed an order while signed in yet.');

      const alicePage = (await alice.api.get('/account/orders')).text;
      expect(alicePage).toContain(aliceOrder.order?.orderNumber ?? 'missing');
      expect(alicePage).not.toContain(guestOrder.order?.orderNumber ?? 'missing');
      await Promise.all([alice.api.dispose(), bob.api.dispose(), guest.dispose()]);
    });

    test('shows a delivery order as a delivery and its current status', async () => {
      const { api } = await newCustomer();
      const placed = await placeOrder(api, {
        lines: [naanLine(world, 12)],
        orderType: 'DELIVERY',
        zoneId: world.zone.id,
        contact: guestContact(randomPhone()),
        address: { line1: '9 Test Lane' },
      });
      expect(placed.reply.status).toBe(201);
      const page = (await api.get('/account/orders')).text;
      expect(page).toContain('Delivery');
      expect(page).toContain('Order received');
      await api.dispose();
    });

    test('a mangled page number still shows a page', async () => {
      const { api } = await newCustomer();
      for (const q of ['?page=abc', '?page=-3', '?page=0', '?page=99999', '?page=1.5']) {
        expect((await api.get(`/account/orders${q}`)).status, q).toBe(200);
      }
      await api.dispose();
    });
  });

  test.describe('who may open the account pages', () => {
    test('a visitor is sent to sign in', async () => {
      const visitor = await newApi();
      for (const path of ['/account', '/account/orders', '/account/addresses']) {
        const reply = await visitor.page(path);
        expect([302, 303, 307, 308], path).toContain(reply.status);
        expect(reply.headers['location'] ?? '', path).toMatch(/\/api\/auth\/refresh|\/auth\/login/);
      }
      await visitor.dispose();
    });

    test('/account goes to the order history', async () => {
      const { api } = await newCustomer();
      const reply = await api.page('/account');
      expect([307, 308]).toContain(reply.status);
      expect(reply.headers['location']).toContain('/account/orders');
      await api.dispose();
    });

    test('staff and admins are told they have no order history instead of seeing an empty one', async () => {
      const staff = await signedIn(STAFF);
      const page = await staff.get('/account/orders');
      expect(page.status).toBe(200);
      expect(page.text).toContain('no order history');
      // (all site messages travel inside the page, so check the visible markup, not the raw text)
      expect(page.text).not.toMatch(new RegExp('<h2[^>]*>My orders</h2>'));
      expect((await admin.get('/account/addresses')).text).toContain('no order history');
    });

    test('the account pages are never indexed', async () => {
      const { api } = await newCustomer();
      expect((await api.get('/account/orders')).text).toMatch(/noindex/i);
      await api.dispose();
    });
  });

  test.describe('saved addresses', () => {
    test('the first address becomes the default, and choosing another moves the default', async () => {
      const { api } = await newCustomer();
      const first = await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { label: 'Home' }),
      );
      expect(first.status, first.text).toBe(201);
      let addresses = await list(api);
      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toMatchObject({
        label: 'Home',
        isDefault: true,
        zoneName: world.zone.name,
        zoneActive: true,
        addressLine2: null,
      });

      await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { label: 'Office', addressLine1: 'Plot 5, Main Blvd' }),
      );
      addresses = await list(api);
      expect(addresses.find((a) => a.label === 'Home')?.isDefault).toBe(true);

      await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { label: 'Parents', addressLine1: 'Flat 2', isDefault: true }),
      );
      addresses = await list(api);
      expect(addresses.filter((a) => a.isDefault).map((a) => a.label)).toEqual(['Parents']);
      expect(addresses[0]?.label).toBe('Parents'); // the default is listed first
      await api.dispose();
    });

    test('an address can be edited, and deleting the default promotes another', async () => {
      const { api } = await newCustomer();
      await api.post('/api/v1/account/addresses', body(world.zone.id, { label: 'A' }));
      await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { label: 'B', addressLine1: 'Second place' }),
      );
      const [a, b] = [
        (await list(api)).find((x) => x.label === 'A'),
        (await list(api)).find((x) => x.label === 'B'),
      ];

      const edited = await api.patch(
        `/api/v1/account/addresses/${a?.id ?? ''}`,
        body(world.zone.id, {
          label: 'A renamed',
          addressLine1: 'New street',
          addressLine2: 'Gate 1',
          isDefault: true,
        }),
      );
      expect(edited.status, edited.text).toBe(200);
      expect((await list(api)).find((x) => x.id === a?.id)).toMatchObject({
        label: 'A renamed',
        addressLine1: 'New street',
        addressLine2: 'Gate 1',
        isDefault: true,
      });

      expect((await api.del(`/api/v1/account/addresses/${a?.id ?? ''}`)).status).toBe(200);
      const after = await list(api);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ id: b?.id, isDefault: true });
      await api.dispose();
    });

    test('they show up on the addresses page and in the checkout profile', async () => {
      const { api, email, phone } = await newCustomer('Profile Person');
      await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { label: 'Visible Home', addressLine1: '77 Visible Road' }),
      );
      const page = await api.get('/account/addresses');
      expect(page.status).toBe(200);
      expect(page.text).toContain('Visible Home');
      expect(page.text).toContain('77 Visible Road');

      const profile = (await api.get('/api/v1/account/profile')).data as {
        profile: { name: string; email: string; phone: string; phoneVerified: boolean };
        addresses: Address[];
      };
      // The sign-in number, already proven, so checkout won't ask to verify it again.
      expect(profile.profile).toMatchObject({
        name: 'Profile Person',
        email,
        phone,
        phoneVerified: true,
      });
      expect(profile.addresses).toHaveLength(1);
      await api.dispose();
    });

    test('an order can be placed to a saved address', async () => {
      const { api } = await newCustomer();
      await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { addressLine1: '5 Saved Street', addressLine2: 'Back gate' }),
      );
      const [saved] = await list(api);
      const placed = await placeOrder(api, {
        lines: [naanLine(world, 12)],
        orderType: 'DELIVERY',
        zoneId: saved?.zoneId ?? '',
        contact: guestContact(randomPhone()),
        address: { line1: saved?.addressLine1 ?? '', line2: saved?.addressLine2 ?? '' },
      });
      expect(placed.reply.status).toBe(201);
      const found = await admin.get(`/api/v1/admin/orders?q=${placed.order?.orderNumber ?? ''}`);
      const row = (found.data as { rows: { id: string }[] }).rows[0];
      const detail = await admin.get(`/api/v1/admin/orders/${row?.id ?? ''}`);
      expect(detail.text).toContain('5 Saved Street');
      await api.dispose();
    });

    test('an area that is not served is refused, and a closed area is flagged afterwards', async () => {
      const { api } = await newCustomer();
      const zone = await admin.post('/api/v1/admin/zones', {
        name: `Soon Closed ${randomUUID().slice(0, 4)}`,
        charge: 50,
        freeDeliveryAbove: null,
        minOrderAmount: 0,
        isActive: true,
        sortOrder: 903,
      });
      const zoneId = (zone.data as { id: string }).id;

      const unknown = await api.post('/api/v1/account/addresses', body(randomUUID()));
      expect(unknown.status).toBe(422);
      expect(unknown.error?.code).toBe('ZONE_INVALID');

      await api.post('/api/v1/account/addresses', body(zoneId, { label: 'Soon closed' }));
      await admin.patch(`/api/v1/admin/zones/${zoneId}`, {
        name: 'Closed now',
        charge: 50,
        freeDeliveryAbove: null,
        minOrderAmount: 0,
        isActive: false,
        sortOrder: 903,
      });
      expect((await list(api)).find((a) => a.label === 'Soon closed')?.zoneActive).toBe(false);
      const refused = await api.post(
        '/api/v1/account/addresses',
        body(zoneId, { label: 'Another' }),
      );
      expect(refused.status).toBe(422);

      await admin.del(`/api/v1/admin/zones/${zoneId}`);
      await api.dispose();
    });

    test('bad details are refused with a message for each field', async () => {
      const { api } = await newCustomer();
      const bad: [Record<string, unknown>, string][] = [
        [{ label: '' }, 'label'],
        [{ label: 'x'.repeat(31) }, 'label'],
        [{ addressLine1: 'ab' }, 'addressLine1'],
        [{ addressLine1: 'x'.repeat(201) }, 'addressLine1'],
        [{ zoneId: '' }, 'zoneId'],
        [{ zoneId: 'nope' }, 'zoneId'],
      ];
      for (const [change, field] of bad) {
        const reply = await api.post('/api/v1/account/addresses', body(world.zone.id, change));
        expect(reply.status, JSON.stringify(change)).toBe(422);
        expect(reply.error?.details?.[field]).toBeTruthy();
      }
      for (const payload of [[], 'text', null, 5]) {
        expect((await api.post('/api/v1/account/addresses', payload)).status).toBeLessThan(500);
      }
      await api.dispose();
    });

    test('at most ten addresses can be saved', async () => {
      const { api } = await newCustomer();
      for (let i = 0; i < 10; i++) {
        expect(
          (
            await api.post(
              '/api/v1/account/addresses',
              body(world.zone.id, { label: `Place ${String(i)}` }),
            )
          ).status,
        ).toBe(201);
      }
      const eleventh = await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { label: 'Eleventh' }),
      );
      expect(eleventh.status).toBe(409);
      expect(eleventh.error?.code).toBe('ADDRESS_LIMIT');
      expect(await list(api)).toHaveLength(10);
      await api.dispose();
    });

    test('unknown and malformed ids are plain 404s', async () => {
      const { api } = await newCustomer();
      for (const id of [randomUUID(), 'not-a-uuid', '1']) {
        expect(
          (await api.patch(`/api/v1/account/addresses/${id}`, body(world.zone.id))).status,
          id,
        ).toBe(404);
        expect((await api.del(`/api/v1/account/addresses/${id}`)).status, id).toBe(404);
      }
      await api.dispose();
    });
  });

  test.describe('privacy and safety', () => {
    test("one customer cannot read, change or delete another's address", async () => {
      const alice = await newCustomer('Alice');
      const bob = await newCustomer('Bob');
      await alice.api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, { label: 'Alice Secret', addressLine1: '1 Private Road' }),
      );
      const aliceAddress = (await list(alice.api))[0];

      expect(JSON.stringify(await list(bob.api))).not.toContain('Alice Secret');
      expect((await bob.api.get('/account/addresses')).text).not.toContain('1 Private Road');
      expect(
        (
          await bob.api.patch(
            `/api/v1/account/addresses/${aliceAddress?.id ?? ''}`,
            body(world.zone.id, { label: 'Hacked' }),
          )
        ).status,
      ).toBe(404);
      expect(
        (await bob.api.del(`/api/v1/account/addresses/${aliceAddress?.id ?? ''}`)).status,
      ).toBe(404);

      expect((await list(alice.api))[0]).toMatchObject({
        label: 'Alice Secret',
        addressLine1: '1 Private Road',
      });
      await Promise.all([alice.api.dispose(), bob.api.dispose()]);
    });

    test('a customer cannot attach an address to someone else by sending their id', async () => {
      const alice = await newCustomer('Alice');
      const bob = await newCustomer('Bob');
      const reply = await bob.api.post('/api/v1/account/addresses', {
        ...body(world.zone.id, { label: 'Sneaky' }),
        customerId: randomUUID(),
      });
      expect(reply.status).toBe(201);
      expect(await list(alice.api)).toHaveLength(0);
      expect((await list(bob.api)).map((a) => a.label)).toEqual(['Sneaky']);
      await Promise.all([alice.api.dispose(), bob.api.dispose()]);
    });

    test('visitors get 401 and staff or admins get 403 from every account endpoint', async () => {
      const visitor = await newApi();
      const staff = await signedIn(STAFF);
      const routes: [string, string, unknown?][] = [
        ['GET', '/api/v1/account/addresses'],
        ['POST', '/api/v1/account/addresses', body(world.zone.id)],
        ['PATCH', `/api/v1/account/addresses/${randomUUID()}`, body(world.zone.id)],
        ['DELETE', `/api/v1/account/addresses/${randomUUID()}`],
        ['GET', '/api/v1/account/profile'],
      ];
      const send = (who: Api, [method, path, payload]: [string, string, unknown?]) =>
        method === 'GET'
          ? who.get(path)
          : method === 'POST'
            ? who.post(path, payload)
            : method === 'PATCH'
              ? who.patch(path, payload)
              : who.del(path);
      for (const route of routes) {
        expect((await send(visitor, route)).status, `visitor ${route[0]} ${route[1]}`).toBe(401);
        const asStaff = await send(staff, route);
        expect(asStaff.status, `staff ${route[0]} ${route[1]}`).toBe(403);
        expect(asStaff.error?.code).toBe('NO_CUSTOMER_PROFILE');
        expect((await send(admin, route)).status, `admin ${route[0]} ${route[1]}`).toBe(403);
      }
      await visitor.dispose();
    });

    test('changes from another website are refused', async () => {
      const { api } = await newCustomer();
      const foreign = { origin: 'https://evil.example.com' };
      const created = await api.post('/api/v1/account/addresses', body(world.zone.id), foreign);
      expect(created.status).toBe(403);
      expect(created.error?.code).toBe('BAD_ORIGIN');
      await api.post('/api/v1/account/addresses', body(world.zone.id));
      const [mine] = await list(api);
      expect(
        (
          await api.patch(
            `/api/v1/account/addresses/${mine?.id ?? ''}`,
            body(world.zone.id, { label: 'X' }),
            foreign,
          )
        ).status,
      ).toBe(403);
      expect((await api.del(`/api/v1/account/addresses/${mine?.id ?? ''}`, foreign)).status).toBe(
        403,
      );
      expect(await list(api)).toHaveLength(1);
      await api.dispose();
    });

    test('script in an address is shown as text', async () => {
      const { api } = await newCustomer();
      await api.post(
        '/api/v1/account/addresses',
        body(world.zone.id, {
          label: '<img src=x onerror=alert(1)>',
          addressLine1: '</script><script>alert(2)</script>',
        }),
      );
      const html = (await api.get('/account/addresses')).text;
      expect(html).not.toContain('<img src=x onerror');
      expect(html).not.toContain('<script>alert(2)');
      expect(html).toContain('&lt;');
      await api.dispose();
    });

    test('the profile reply is never cached', async () => {
      const { api } = await newCustomer();
      expect((await api.get('/api/v1/account/profile')).headers['cache-control']).toContain(
        'no-store',
      );
      expect((await api.get('/api/v1/account/addresses')).headers['cache-control']).toContain(
        'no-store',
      );
      await api.dispose();
    });
  });
});

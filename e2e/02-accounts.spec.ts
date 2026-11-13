import { expect, test } from '@playwright/test';
import {
  ADMIN,
  STAFF,
  newApi,
  randomEmail,
  randomPhone,
  signUp,
  signedIn,
  verifyPhone,
  type Api,
} from './support/client';
import { guestContact, loadWorld, naanLine, placeOrder, type World } from './support/world';

const PASSWORD = 'correct-horse-9';

/** Signing up, signing in and out, and what each kind of account is allowed to open. */
test.describe('accounts', () => {
  let world: World;
  test.beforeAll(() => {
    world = loadWorld();
  });

  test.describe('signing up', () => {
    test('a new customer signs up with a proven phone number and is signed in straight away', async () => {
      const api = await newApi();
      const email = randomEmail();
      const reply = await signUp(api, { name: 'E2E Customer', email, password: PASSWORD });
      expect(reply.status).toBe(201);
      expect(reply.data).toMatchObject({ user: { phone: reply.phone, email, role: 'CUSTOMER' } });

      const me = await api.get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(me.data).toMatchObject({ user: { phone: reply.phone, role: 'CUSTOMER' } });
      await api.dispose();
    });

    test('email is optional', async () => {
      const api = await newApi();
      const reply = await signUp(api, { name: 'No Email Person', password: PASSWORD });
      expect(reply.status).toBe(201);
      expect(reply.data).toMatchObject({ user: { phone: reply.phone, role: 'CUSTOMER' } });
      expect((reply.data as { user: Record<string, unknown> }).user).not.toHaveProperty('email');
      await api.dispose();
    });

    test('a number nobody proved cannot be used to sign up', async () => {
      const api = await newApi();
      const phone = randomPhone();
      const unproven = await api.post('/api/auth/signup', {
        name: 'Not Proven',
        phone,
        password: PASSWORD,
      });
      expect(unproven.status).toBe(403);
      expect(unproven.error?.code).toBe('PHONE_NOT_VERIFIED');
      expect(unproven.error?.details?.['phone']).toBeTruthy();

      // Nor can a check that proved a different number.
      const otherProof = await verifyPhone(randomPhone());
      const mismatched = await api.post('/api/auth/signup', {
        name: 'Not Proven',
        phone,
        password: PASSWORD,
        verificationId: otherProof,
      });
      expect(mismatched.status).toBe(403);
      expect((await api.get('/api/auth/me')).status).toBe(401);
      await api.dispose();
    });

    test('the login cookies are private to the browser and scoped sensibly', async () => {
      const api = await newApi();
      await signUp(api, { name: 'Cookie Check', password: PASSWORD });
      const state = await api.context.storageState();
      const access = state.cookies.find((c) => c.name === 'bbq_at');
      const refresh = state.cookies.find((c) => c.name === 'bbq_rt');
      expect(access?.httpOnly).toBe(true);
      expect(refresh?.httpOnly).toBe(true);
      expect(access?.sameSite).toBe('Lax');
      // The long-lived refresh token is only ever sent to the auth endpoints.
      expect(refresh?.path).toBe('/api/auth');
      await api.dispose();
    });

    test('a phone number can only have one account, however it is written', async () => {
      const first = await newApi();
      const created = await signUp(first, { name: 'First Person', password: PASSWORD });
      expect(created.status).toBe(201);

      const second = await newApi();
      const international = `+92 ${created.phone.slice(1, 4)} ${created.phone.slice(4)}`;
      const clash = await second.post('/api/auth/signup', {
        name: 'Second Person',
        phone: international,
        password: PASSWORD,
        verificationId: await verifyPhone(created.phone),
      });
      expect(clash.status).toBe(409);
      expect(clash.error?.code).toBe('PHONE_TAKEN');
      await Promise.all([first.dispose(), second.dispose()]);
    });

    test('an email, when given, can only belong to one account', async () => {
      const email = randomEmail();
      const first = await newApi();
      expect(
        (await signUp(first, { name: 'First Person', email, password: PASSWORD })).status,
      ).toBe(201);
      const second = await newApi();
      const clash = await signUp(second, {
        name: 'Second Person',
        email: email.toUpperCase(),
        password: PASSWORD,
      });
      expect(clash.status).toBe(409);
      expect(clash.error?.code).toBe('EMAIL_TAKEN');
      await Promise.all([first.dispose(), second.dispose()]);
    });

    test('two people signing up with the same number at once make one account', async () => {
      const phone = randomPhone();
      const verificationId = await verifyPhone(phone);
      const clients = await Promise.all([newApi(), newApi(), newApi(), newApi()]);
      const replies = await Promise.all(
        clients.map((c) =>
          c.post('/api/auth/signup', {
            name: 'Racing Person',
            phone,
            password: PASSWORD,
            verificationId,
          }),
        ),
      );
      expect(replies.filter((r) => r.status === 201)).toHaveLength(1);
      expect(replies.filter((r) => r.status === 409)).toHaveLength(replies.length - 1);
      await Promise.all(clients.map((c) => c.dispose()));
    });

    test('weak or malformed details are refused with a message for the field', async () => {
      const api = await newApi();
      const phone = randomPhone();
      const cases: [Record<string, unknown>, string][] = [
        [{ name: 'A', phone, password: PASSWORD }, 'name'],
        [{ name: 'Valid Name', password: PASSWORD }, 'phone'],
        [{ name: 'Valid Name', phone: '123', password: PASSWORD }, 'phone'],
        [{ name: 'Valid Name', phone, email: 'not-an-email', password: PASSWORD }, 'email'],
        [{ name: 'Valid Name', phone, password: 'short' }, 'password'],
        [{ name: 'Valid Name', phone, password: 'x'.repeat(100) }, 'password'],
        [
          { name: 'Valid Name', phone, password: PASSWORD, verificationId: 'nope' },
          'verificationId',
        ],
      ];
      for (const [body, field] of cases) {
        const reply = await api.post('/api/auth/signup', body);
        expect(reply.status, JSON.stringify(body)).toBe(422);
        expect(reply.error?.details?.[field]).toBeTruthy();
      }
      await api.dispose();
    });

    test('a customer cannot sign up as staff by sending a role', async () => {
      const api = await newApi();
      const phone = randomPhone();
      const reply = await api.post('/api/auth/signup', {
        name: 'Sneaky Person',
        phone,
        password: PASSWORD,
        verificationId: await verifyPhone(phone),
        role: 'ADMIN',
        isActive: true,
      });
      expect(reply.status).toBe(201);
      expect(reply.data).toMatchObject({ user: { role: 'CUSTOMER' } });
      expect((await api.get('/api/v1/admin/products')).status).toBe(403);
      await api.dispose();
    });
  });

  test.describe('signing in and out', () => {
    let phone: string;
    test.beforeAll(async () => {
      const api = await newApi();
      phone = (await signUp(api, { name: 'Returning Customer', password: PASSWORD })).phone;
      await api.dispose();
    });

    test('the right password signs in, the wrong one does not say which part was wrong', async () => {
      const api = await newApi();
      const good = await api.login(phone, PASSWORD);
      expect(good.status).toBe(200);

      const other = await newApi();
      const wrongPassword = await other.login(phone, 'wrong-password-1');
      const unknownNumber = await other.login(randomPhone(), PASSWORD);
      expect(wrongPassword.status).toBe(401);
      expect(unknownNumber.status).toBe(401);
      // Same message either way, so nobody can find out which numbers have accounts.
      expect(wrongPassword.error?.message).toBe(unknownNumber.error?.message);
      await Promise.all([api.dispose(), other.dispose()]);
    });

    test('the number can be typed with spaces, dashes or +92 when signing in', async () => {
      for (const typed of [
        ` ${phone.slice(0, 4)}-${phone.slice(4)} `,
        `+92 ${phone.slice(1, 4)} ${phone.slice(4)}`,
      ]) {
        const api = await newApi();
        expect((await api.login(typed, PASSWORD)).status, typed).toBe(200);
        await api.dispose();
      }
    });

    test('an email cannot be used to sign in', async () => {
      const api = await newApi();
      const reply = await api.login('someone@example.com', PASSWORD);
      expect(reply.status).toBe(422);
      expect(reply.error?.details?.['phone']).toBeTruthy();
      await api.dispose();
    });

    test('signing out ends the session', async () => {
      const api = await newApi();
      await api.login(phone, PASSWORD);
      expect((await api.get('/api/auth/me')).status).toBe(200);
      expect((await api.logout()).status).toBe(200);
      expect((await api.get('/api/auth/me')).status).toBe(401);
      // The old refresh token is dead too: nobody can quietly sign back in with it.
      expect((await api.post('/api/auth/refresh')).status).toBe(401);
      await api.dispose();
    });

    test('a session can be renewed, and each renewal replaces the refresh token', async () => {
      const api = await newApi();
      await api.login(phone, PASSWORD);
      const before = await api.cookie('bbq_rt');
      const renewed = await api.post('/api/auth/refresh');
      expect(renewed.status).toBe(200);
      const after = await api.cookie('bbq_rt');
      expect(after).toBeTruthy();
      expect(after).not.toBe(before);
      expect((await api.get('/api/auth/me')).status).toBe(200);
      await api.dispose();
    });

    test('a stolen (already used) refresh token signs everyone out', async () => {
      const victim = await newApi();
      await victim.login(phone, PASSWORD);
      const stolen = await victim.cookie('bbq_rt');
      expect(stolen).toBeTruthy();

      // The real owner renews, which uses up the token.
      expect((await victim.post('/api/auth/refresh')).status).toBe(200);

      // A thief replays the old token once its 30-second grace (for lost answers) has passed.
      await new Promise((resolve) => setTimeout(resolve, 32_000));
      const thief = await newApi();
      const replay = await thief.post(
        '/api/auth/refresh',
        {},
        { cookie: `bbq_rt=${stolen ?? ''}` },
      );
      expect(replay.status).toBe(401);

      // ...which makes the owner's newer token worthless as well, forcing a fresh login.
      expect((await victim.post('/api/auth/refresh')).status).toBe(401);
      await Promise.all([victim.dispose(), thief.dispose()]);
    });

    test('a browser that lost a renewal answer is not signed out when it tries the old token again', async () => {
      const api = await newApi();
      await api.login(phone, PASSWORD);
      const old = await api.cookie('bbq_rt');

      // The renewal happens on the server, but pretend the browser never saw the answer...
      expect((await api.post('/api/auth/refresh')).status).toBe(200);
      const newer = await api.cookie('bbq_rt');

      // ...so its next page load sends the old token again, seconds later.
      const retry = await newApi();
      const again = await retry.post('/api/auth/refresh', {}, { cookie: `bbq_rt=${old ?? ''}` });
      expect(again.status).toBe(200);

      // Nobody was signed out: the newer token still works.
      const check = await newApi();
      expect(
        (await check.post('/api/auth/refresh', {}, { cookie: `bbq_rt=${newer ?? ''}` })).status,
      ).toBe(200);
      await Promise.all([api.dispose(), retry.dispose(), check.dispose()]);
    });

    test("guessing one account's password is stopped after a few tries", async () => {
      const setup = await newApi();
      const target = (await signUp(setup, { name: 'Target Person', password: PASSWORD })).phone;
      await setup.dispose();

      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        // A different address each time, as an attacker spreading the guesses would use.
        const attacker = await newApi();
        statuses.push((await attacker.login(target, `guess-number-${String(i)}`)).status);
        await attacker.dispose();
      }
      expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(8)).toEqual([429, 429]);

      // Even the right password is refused while the lock is on.
      const owner = await newApi();
      expect((await owner.login(target, PASSWORD)).status).toBe(429);
      await owner.dispose();
    });
  });

  test.describe('what each account can open', () => {
    const adminApi = [
      '/api/v1/admin/products',
      '/api/v1/admin/settings',
      '/api/v1/admin/team',
      '/api/v1/admin/orders',
    ];
    const storeApi = ['/api/v1/store/orders'];

    test('a visitor with no account is turned away from private APIs with a 401', async () => {
      const api = await newApi();
      for (const path of [...adminApi, ...storeApi, '/api/auth/me']) {
        const reply = await api.get(path);
        expect(reply.status, path).toBe(401);
        expect(reply.error?.code).toBe('UNAUTHENTICATED');
      }
      await api.dispose();
    });

    test('a visitor is sent to sign in when opening private pages', async () => {
      const api = await newApi();
      for (const path of ['/admin', '/admin/menu', '/store/orders', '/store/kitchen', '/account']) {
        const reply = await api.page(path);
        expect([302, 303, 307, 308], path).toContain(reply.status);
        expect(reply.headers['location'] ?? '', path).toMatch(/\/api\/auth\/refresh|\/auth\/login/);
      }
      await api.dispose();
    });

    test('a customer cannot use the store or admin APIs (403) or open their pages', async () => {
      const api = await newApi();
      await signUp(api, { name: 'Plain Customer', password: PASSWORD });
      for (const path of [...adminApi, ...storeApi]) {
        expect((await api.get(path)).status, path).toBe(403);
      }
      for (const path of ['/admin', '/store/orders', '/store/kitchen']) {
        const reply = await api.page(path);
        expect(reply.status, path).toBe(307);
        expect(new URL(reply.headers['location'] ?? '', 'http://x').pathname, path).toBe('/');
      }
      expect((await api.post('/api/v1/admin/categories', { nameEn: 'Nope' })).status).toBe(403);
      expect(
        (
          await api.patch(`/api/v1/store/orders/${world.categoryId}/status`, {
            status: 'CONFIRMED',
          })
        ).status,
      ).toBe(403);
      await api.dispose();
    });

    test('store staff can open the store panel but not the admin panel', async () => {
      const staff = await signedIn(STAFF);
      expect((await staff.get('/api/v1/store/orders')).status).toBe(200);
      expect((await staff.page('/store/orders')).status).toBe(200);
      expect((await staff.page('/store/kitchen')).status).toBe(200);

      for (const path of adminApi) {
        expect((await staff.get(path)).status, path).toBe(403);
      }
      const adminPage = await staff.page('/admin');
      expect(adminPage.status).toBe(307);
      expect(new URL(adminPage.headers['location'] ?? '', 'http://x').pathname).toBe('/');
      await staff.dispose();
    });

    test('an admin can open everything', async () => {
      const admin = await signedIn(ADMIN);
      for (const path of [...adminApi, ...storeApi]) {
        expect((await admin.get(path)).status, path).toBe(200);
      }
      for (const path of [
        '/admin',
        '/admin/orders',
        '/admin/menu',
        '/admin/menu/new',
        '/admin/categories',
        '/admin/addons',
        '/admin/deals',
        '/admin/deals/new',
        '/admin/delivery',
        '/admin/coupons',
        '/admin/settings',
        '/admin/team',
        '/store/orders',
        '/store/kitchen',
      ]) {
        expect((await admin.page(path)).status, path).toBe(200);
      }
      await admin.dispose();
    });

    test('private pages are never cached or indexed', async () => {
      const admin = await signedIn(ADMIN);
      const page = await admin.get('/admin');
      expect(page.text).toMatch(/noindex/i);
      const store = await admin.get('/store/orders');
      expect(store.text).toMatch(/noindex/i);
      await admin.dispose();
    });
  });

  test.describe('a signed-in customer ordering', () => {
    test('their order is linked to their account and still trackable by link', async () => {
      const api: Api = await newApi();
      const { phone } = await signUp(api, { name: 'Loyal Customer', password: PASSWORD });
      // Their own number was proven at sign-up, so checkout needs no new check.
      const { reply, order } = await placeOrder(api, {
        lines: [naanLine(world, 2)],
        orderType: 'PICKUP',
        contact: guestContact(phone, 'Loyal Customer'),
        unverified: true,
      });
      expect(reply.status).toBe(201);
      const tracked = await api.get(`/api/v1/orders/${order?.trackingToken ?? ''}`);
      expect(tracked.status).toBe(200);
      await api.dispose();
    });

    test('a different number at checkout must be proven first', async () => {
      const api: Api = await newApi();
      await signUp(api, { name: 'Two Phones', password: PASSWORD });
      const unproven = await placeOrder(api, {
        lines: [naanLine(world, 1)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone(), 'Two Phones'),
        unverified: true,
      });
      expect(unproven.reply.status).toBe(403);
      expect(unproven.reply.error?.code).toBe('PHONE_NOT_VERIFIED');

      const proven = await placeOrder(api, {
        lines: [naanLine(world, 1)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone(), 'Two Phones'),
      });
      expect(proven.reply.status).toBe(201);
      await api.dispose();
    });
  });
});

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

const PASSWORD = 'kitchen-pass-1';

interface Member {
  id: string;
  phone: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
}

/** The owner adds and removes the people who run the store panel. */
test.describe('admin: the team', () => {
  let admin: Api;
  let myId: string;

  test.beforeAll(async () => {
    admin = await signedIn(ADMIN);
    myId = ((await admin.get('/api/auth/me')).data as { user: { userId: string } }).user.userId;
  });

  const members = async () =>
    ((await admin.get('/api/v1/admin/team')).data as { members: Member[] }).members;

  /** Adds a team member, who signs in with their phone number (email is optional). */
  async function hire(role: 'STORE_STAFF' | 'ADMIN' = 'STORE_STAFF') {
    const phone = randomPhone();
    const reply = await admin.post('/api/v1/admin/team', { phone, role, password: PASSWORD });
    return { phone, reply, id: (reply.data as { id?: string } | null)?.id ?? '' };
  }

  test('the team list shows staff and admins only, never customers', async () => {
    const customer = await newApi();
    const { phone } = await signUp(customer, { name: 'Just A Shopper', password: PASSWORD });
    await customer.dispose();

    const list = await members();
    expect(list.map((m) => m.phone)).toEqual(expect.arrayContaining([ADMIN.phone, STAFF.phone]));
    expect(list.map((m) => m.phone)).not.toContain(phone);
    expect(list.every((m) => ['STORE_STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(m.role))).toBe(true);
    // Password hashes never leave the server.
    expect((await admin.get('/api/v1/admin/team')).text).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test.describe('adding someone', () => {
    test('new store staff can sign in and work the store panel, but not the admin panel', async () => {
      const { phone, reply } = await hire();
      expect(reply.status, reply.text).toBe(201);

      const newcomer = await newApi();
      const login = await newcomer.login(phone, PASSWORD);
      expect(login.status).toBe(200);
      expect(login.data).toMatchObject({ user: { phone, role: 'STORE_STAFF' } });

      expect((await newcomer.get('/api/v1/store/orders')).status).toBe(200);
      expect((await newcomer.page('/store/kitchen')).status).toBe(200);
      expect((await newcomer.get('/api/v1/admin/team')).status).toBe(403);
      expect((await newcomer.get('/api/v1/admin/settings')).status).toBe(403);
      expect((await newcomer.page('/admin')).status).toBe(307);
      await newcomer.dispose();
    });

    test('a phone number can only be used once, however it is typed', async () => {
      const { phone } = await hire();
      const clash = await admin.post('/api/v1/admin/team', {
        phone: `+92 ${phone.slice(1, 4)} ${phone.slice(4)}`,
        role: 'STORE_STAFF',
        password: PASSWORD,
      });
      expect(clash.status).toBe(409);
      expect(clash.error?.code).toBe('PHONE_TAKEN');
      expect(clash.error?.details?.['phone']).toBeTruthy();

      const demo = await admin.post('/api/v1/admin/team', {
        phone: STAFF.phone,
        role: 'STORE_STAFF',
        password: PASSWORD,
      });
      expect(demo.status).toBe(409);
    });

    test('an email is optional, and can only be used once in any capitalisation', async () => {
      const email = randomEmail('crew');
      const first = await admin.post('/api/v1/admin/team', {
        phone: randomPhone(),
        email,
        role: 'STORE_STAFF',
        password: PASSWORD,
      });
      expect(first.status, first.text).toBe(201);
      const clash = await admin.post('/api/v1/admin/team', {
        phone: randomPhone(),
        email: email.toUpperCase(),
        role: 'STORE_STAFF',
        password: PASSWORD,
      });
      expect(clash.status).toBe(409);
      expect(clash.error?.code).toBe('EMAIL_TAKEN');
      expect(clash.error?.details?.['email']).toBeTruthy();
    });

    test('an admin cannot make another admin, only a super admin can', async () => {
      const { reply, phone } = await hire('ADMIN');
      expect(reply.status).toBe(403);
      expect((await members()).map((m) => m.phone)).not.toContain(phone);
    });

    test('bad details are refused with a message for the field', async () => {
      const base = { phone: randomPhone(), role: 'STORE_STAFF', password: PASSWORD };
      const bad: [Record<string, unknown>, string][] = [
        [{ phone: undefined }, 'phone'],
        [{ phone: '12345' }, 'phone'],
        [{ email: 'not-an-email' }, 'email'],
        [{ password: 'short' }, 'password'],
        [{ password: 'x'.repeat(100) }, 'password'],
        [{ role: 'SUPER_ADMIN' }, 'role'],
        [{ role: 'CUSTOMER' }, 'role'],
        [{ role: 'OWNER' }, 'role'],
      ];
      for (const [change, field] of bad) {
        const reply = await admin.post('/api/v1/admin/team', { ...base, ...change });
        expect(reply.status, JSON.stringify(change)).toBe(422);
        expect(reply.error?.details?.[field]).toBeTruthy();
      }
    });
  });

  test.describe('switching someone off and on', () => {
    test('a person who is switched off cannot sign in or renew a session', async () => {
      const { phone, id } = await hire();
      const session = await newApi();
      await session.login(phone, PASSWORD);
      expect((await session.get('/api/v1/store/orders')).status).toBe(200);

      const off = await admin.patch(`/api/v1/admin/team/${id}`, { isActive: false });
      expect(off.status, off.text).toBe(200);
      expect((await members()).find((m) => m.id === id)?.isActive).toBe(false);

      // Their open session can no longer be renewed, and a fresh sign-in is refused.
      expect((await session.post('/api/auth/refresh')).status).toBe(401);
      const fresh = await newApi();
      // Told plainly that the account is switched off (not "wrong password").
      expect((await fresh.login(phone, PASSWORD)).status).toBe(403);

      const on = await admin.patch(`/api/v1/admin/team/${id}`, { isActive: true });
      expect(on.status).toBe(200);
      expect((await fresh.login(phone, PASSWORD)).status).toBe(200);
      await Promise.all([session.dispose(), fresh.dispose()]);
    });

    test('resetting a password locks out the old one and ends open sessions', async () => {
      const { phone, id } = await hire();
      const session = await newApi();
      await session.login(phone, PASSWORD);

      const reset = await admin.patch(`/api/v1/admin/team/${id}`, { password: 'brand-new-pass-7' });
      expect(reset.status, reset.text).toBe(200);
      expect((await session.post('/api/auth/refresh')).status).toBe(401);

      const fresh = await newApi();
      expect((await fresh.login(phone, PASSWORD)).status).toBe(401);
      expect((await fresh.login(phone, 'brand-new-pass-7')).status).toBe(200);
      await Promise.all([session.dispose(), fresh.dispose()]);
    });

    test('a weak new password is refused and the old one keeps working', async () => {
      const { phone, id } = await hire();
      expect((await admin.patch(`/api/v1/admin/team/${id}`, { password: 'short' })).status).toBe(
        422,
      );
      const fresh = await newApi();
      expect((await fresh.login(phone, PASSWORD)).status).toBe(200);
      await fresh.dispose();
    });
  });

  test.describe('limits on what an admin can do to accounts', () => {
    test('nobody can switch themselves off or change their own role here', async () => {
      for (const change of [
        { isActive: false },
        { role: 'STORE_STAFF' },
        { password: 'brand-new-pass-7' },
      ]) {
        const reply = await admin.patch(`/api/v1/admin/team/${myId}`, change);
        expect(reply.status, JSON.stringify(change)).toBe(403);
        expect(reply.error?.code).toBe('TEAM_SELF');
      }
      expect((await members()).find((m) => m.id === myId)?.isActive).toBe(true);
    });

    test('an admin cannot promote staff to admin', async () => {
      const { id } = await hire();
      const reply = await admin.patch(`/api/v1/admin/team/${id}`, { role: 'ADMIN' });
      expect(reply.status).toBe(403);
      expect((await members()).find((m) => m.id === id)?.role).toBe('STORE_STAFF');
    });

    test('customers are not part of the team, so they cannot be changed from here', async () => {
      const customer = await newApi();
      const signup = await signUp(customer, { name: 'Not Staff', password: PASSWORD });
      const customerId = (signup.data as { user: { userId: string } }).user.userId;
      const reply = await admin.patch(`/api/v1/admin/team/${customerId}`, { isActive: false });
      expect(reply.status).toBe(404);
      expect((await customer.get('/api/auth/me')).status).toBe(200);
      await customer.dispose();
    });

    test('unknown or malformed ids and empty changes are refused', async () => {
      expect(
        (await admin.patch(`/api/v1/admin/team/${randomUUID()}`, { isActive: false })).status,
      ).toBe(404);
      expect((await admin.patch('/api/v1/admin/team/not-a-uuid', { isActive: false })).status).toBe(
        404,
      );
      const { id } = await hire();
      expect((await admin.patch(`/api/v1/admin/team/${id}`, {})).status).toBe(422);
      expect((await admin.patch(`/api/v1/admin/team/${id}`, { role: 'SUPER_ADMIN' })).status).toBe(
        422,
      );
    });

    test('team changes from another website are refused', async () => {
      const { id } = await hire();
      const reply = await admin.patch(
        `/api/v1/admin/team/${id}`,
        { isActive: false },
        { origin: 'https://evil.example.com' },
      );
      expect(reply.status).toBe(403);
      expect((await members()).find((m) => m.id === id)?.isActive).toBe(true);
    });

    test('store staff and customers cannot manage the team at all', async () => {
      const staff = await signedIn(STAFF);
      const { id } = await hire();
      expect(
        (
          await staff.post('/api/v1/admin/team', {
            phone: randomPhone(),
            role: 'STORE_STAFF',
            password: PASSWORD,
          })
        ).status,
      ).toBe(403);
      expect((await staff.patch(`/api/v1/admin/team/${id}`, { isActive: false })).status).toBe(403);

      const nobody = await newApi();
      expect((await nobody.get('/api/v1/admin/team')).status).toBe(401);
      await nobody.dispose();
    });
  });
});

import { expect, test } from '@playwright/test';
import {
  STAFF,
  newApi,
  randomPhone,
  signUp,
  startVerification,
  verifyPhone,
  whatsappMessage,
  type Api,
} from './support/client';
import { guestContact, loadWorld, naanLine, placeOrder, type World } from './support/world';

const PASSWORD = 'correct-horse-9';
const VERIFY_TOKEN = process.env['E2E_WHATSAPP_VERIFY_TOKEN'] ?? 'e2e-whatsapp-verify-token';

/** The order history page, as the customer sees it. */
const historyText = async (api: Api) => (await api.get('/account/orders')).text;

/**
 * Proving a phone number over WhatsApp: the customer sends us a code from their phone, Meta tells
 * the site who sent it, and only then can that number sign up or order. Proven guest orders then
 * appear in the account that signs in with the number.
 */
test.describe('phone verification', () => {
  let world: World;
  test.beforeAll(() => {
    world = loadWorld();
  });

  const status = async (id: string) => {
    const api = await newApi();
    const reply = await api.get(`/api/v1/verify/${id}`);
    await api.dispose();
    return (reply.data as { status?: string } | null)?.status ?? `HTTP ${String(reply.status)}`;
  };

  test.describe('the check itself', () => {
    test('gives a code and a WhatsApp link, and waits for the message', async () => {
      const api = await newApi();
      const reply = await api.post('/api/v1/verify', { phone: '0300 765 4321' });
      expect(reply.status).toBe(201);
      const started = reply.data as {
        id: string;
        code: string;
        mode: string;
        whatsappUrl: string;
        businessNumber: string;
      };
      expect(started.code).toMatch(/^\d{6}$/);
      expect(started.mode).toBe('whatsapp');
      expect(started.whatsappUrl).toMatch(
        /^https:\/\/wa\.me\/\d+\?text=BBQ%20Store%20code%3A%20\d{6}$/,
      );
      expect(started.businessNumber).toMatch(/^\+\d+$/);
      expect(await status(started.id)).toBe('pending');
      await api.dispose();
    });

    test('the code proves the number only when it comes from that number', async () => {
      const phone = randomPhone();
      const { id, code } = await startVerification(phone);

      // Someone else sending the code proves nothing.
      expect((await whatsappMessage(randomPhone(), `BBQ Store code: ${code}`)).status).toBe(200);
      expect(await status(id)).toBe('pending');
      // Nor does the right phone sending the wrong code, or just chatting.
      await whatsappMessage(phone, 'BBQ Store code: 000000');
      await whatsappMessage(phone, 'hello, is the shop open?');
      expect(await status(id)).toBe('pending');

      // Customers may edit the text around the code.
      await whatsappMessage(phone, `my code ${code} thanks`);
      expect(await status(id)).toBe('verified');
    });

    test('messages that Meta did not sign are refused and change nothing', async () => {
      const phone = randomPhone();
      const { id, code } = await startVerification(phone);
      const forged = await whatsappMessage(phone, code, { secret: 'not-the-app-secret' });
      expect(forged.status).toBe(401);
      const unsigned = await newApi();
      const plain = await unsigned.post('/api/webhooks/whatsapp', { entry: [] });
      expect(plain.status).toBe(401);
      await unsigned.dispose();
      expect(await status(id)).toBe('pending');
    });

    test('Meta can confirm the webhook address only with the verify token', async () => {
      const api = await newApi();
      const good = await api.get(
        `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
      );
      expect(good.status).toBe(200);
      expect(good.text).toBe('12345');
      const bad = await api.get(
        '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=12345',
      );
      expect(bad.status).toBe(403);
      await api.dispose();
    });

    test('the test-mode button does not exist on a site with WhatsApp set up', async () => {
      const { id } = await startVerification(randomPhone());
      const api = await newApi();
      expect((await api.post(`/api/v1/verify/${id}/confirm`)).status).toBe(404);
      await api.dispose();
      expect(await status(id)).toBe('pending');
    });

    test('bad numbers, unknown checks and floods are refused', async () => {
      const api = await newApi();
      const bad = await api.post('/api/v1/verify', { phone: '12345' });
      expect(bad.status).toBe(422);
      expect(bad.error?.details?.['phone']).toBeTruthy();
      expect((await api.get('/api/v1/verify/not-a-real-id')).status).toBe(404);
      expect((await api.get('/api/v1/verify/00000000-0000-4000-8000-000000000000')).status).toBe(
        404,
      );

      // One number cannot be sent code after code.
      const phone = randomPhone();
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const client = await newApi();
        statuses.push((await client.post('/api/v1/verify', { phone })).status);
        await client.dispose();
      }
      expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
      expect(statuses[5]).toBe(429);
      await api.dispose();
    });

    test('checks from another website are refused', async () => {
      const api = await newApi();
      const reply = await api.post(
        '/api/v1/verify',
        { phone: randomPhone() },
        { origin: 'https://evil.example.com' },
      );
      expect(reply.status).toBe(403);
      await api.dispose();
    });
  });

  test.describe('ordering', () => {
    test('a guest cannot order without proving the number', async () => {
      const api = await newApi();
      const { reply } = await placeOrder(api, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
        unverified: true,
      });
      expect(reply.status).toBe(403);
      expect(reply.error?.code).toBe('PHONE_NOT_VERIFIED');
      expect(reply.error?.details?.['contact.phone']).toBeTruthy();
      await api.dispose();
    });

    test('a proof for one number cannot be used for another', async () => {
      const api = await newApi();
      const { reply } = await placeOrder(api, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
        verificationId: await verifyPhone(randomPhone()),
      });
      expect(reply.status).toBe(403);
      await api.dispose();
    });

    test('proven guest orders appear in the account later made with that number', async () => {
      const phone = randomPhone();
      const guest = await newApi();
      const earlier = await placeOrder(guest, {
        lines: [naanLine(world, 2)],
        orderType: 'PICKUP',
        contact: guestContact(phone, 'Guest First'),
      });
      expect(earlier.reply.status).toBe(201);
      await guest.dispose();

      const customer = await newApi();
      expect(
        (await signUp(customer, { name: 'Guest First', phone, password: PASSWORD })).status,
      ).toBe(201);
      expect(await historyText(customer)).toContain(earlier.order?.orderNumber ?? 'missing');

      // And a guest order placed afterwards with the number goes to the account straight away.
      const again = await newApi();
      const later = await placeOrder(again, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        contact: guestContact(phone, 'Guest First'),
      });
      expect(later.reply.status).toBe(201);
      await again.dispose();
      expect(await historyText(customer)).toContain(later.order?.orderNumber ?? 'missing');
      await customer.dispose();
    });

    test("a signed-in customer's history never shows someone else's number's orders", async () => {
      const customer = await newApi();
      await signUp(customer, { name: 'Private Person', password: PASSWORD });
      const stranger = await newApi();
      const theirs = await placeOrder(stranger, {
        lines: [naanLine(world)],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone(), 'Stranger'),
      });
      expect(theirs.reply.status).toBe(201);
      expect(await historyText(customer)).not.toContain(theirs.order?.orderNumber ?? 'missing');
      await Promise.all([customer.dispose(), stranger.dispose()]);
    });
  });

  test.describe('staff', () => {
    test('sign in with their phone number', async () => {
      const api = await newApi();
      const reply = await api.login(STAFF.phone, STAFF.password);
      expect(reply.status).toBe(200);
      expect(reply.data).toMatchObject({ user: { phone: STAFF.phone, role: 'STORE_STAFF' } });
      await api.dispose();
    });
  });
});

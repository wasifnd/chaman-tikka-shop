import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, BASE_URL, newApi, randomEmail, signedIn, type Api } from './support/client';
import { loadWorld, type World } from './support/world';

const ID = () => randomUUID();

/** Every admin endpoint, as [method, path, body]. Ids are random, so nothing real is touched. */
const ADMIN_ROUTES: [string, string, unknown?][] = [
  ['GET', '/api/v1/admin/categories'],
  ['POST', '/api/v1/admin/categories', { nameEn: 'X' }],
  ['PATCH', `/api/v1/admin/categories/${ID()}`, { nameEn: 'X' }],
  ['DELETE', `/api/v1/admin/categories/${ID()}`],
  ['GET', '/api/v1/admin/products'],
  ['POST', '/api/v1/admin/products', { nameEn: 'X' }],
  ['GET', `/api/v1/admin/products/${ID()}`],
  ['PATCH', `/api/v1/admin/products/${ID()}`, { nameEn: 'X' }],
  ['DELETE', `/api/v1/admin/products/${ID()}`],
  ['PUT', `/api/v1/admin/products/${ID()}/availability`, { isAvailable: false }],
  ['GET', '/api/v1/admin/addons'],
  ['POST', '/api/v1/admin/addons', { nameEn: 'X', price: 1, isAvailable: true }],
  ['PATCH', `/api/v1/admin/addons/${ID()}`, { nameEn: 'X', price: 1, isAvailable: true }],
  ['DELETE', `/api/v1/admin/addons/${ID()}`],
  ['GET', '/api/v1/admin/deals'],
  ['POST', '/api/v1/admin/deals', { nameEn: 'X' }],
  ['PATCH', `/api/v1/admin/deals/${ID()}`, { nameEn: 'X' }],
  ['DELETE', `/api/v1/admin/deals/${ID()}`],
  ['GET', '/api/v1/admin/zones'],
  ['POST', '/api/v1/admin/zones', { name: 'X' }],
  ['PATCH', `/api/v1/admin/zones/${ID()}`, { name: 'X' }],
  ['DELETE', `/api/v1/admin/zones/${ID()}`],
  ['GET', '/api/v1/admin/coupons'],
  ['POST', '/api/v1/admin/coupons', { code: 'ABC' }],
  ['PATCH', `/api/v1/admin/coupons/${ID()}`, { code: 'ABC' }],
  ['DELETE', `/api/v1/admin/coupons/${ID()}`],
  ['GET', '/api/v1/admin/settings'],
  ['PUT', '/api/v1/admin/settings', {}],
  ['GET', '/api/v1/admin/team'],
  ['POST', '/api/v1/admin/team', { email: 'a@b.pk' }],
  ['PATCH', `/api/v1/admin/team/${ID()}`, { isActive: false }],
  ['GET', '/api/v1/admin/orders'],
  ['GET', `/api/v1/admin/orders/${ID()}`],
  ['POST', '/api/v1/admin/uploads/sign', {}],
];

const send = (
  api: Api,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) => {
  switch (method) {
    case 'GET':
      return api.get(path, headers);
    case 'POST':
      return api.post(path, body, headers);
    case 'PATCH':
      return api.patch(path, body, headers);
    case 'PUT':
      return api.put(path, body, headers);
    default:
      return api.del(path, headers);
  }
};

/** Attacks and mistakes that must never get through, across the whole site. */
test.describe('security', () => {
  let world: World;
  test.beforeAll(() => {
    world = loadWorld();
  });

  test('every admin endpoint turns away a visitor who is not signed in', async () => {
    const nobody = await newApi();
    for (const [method, path, body] of ADMIN_ROUTES) {
      const reply = await send(nobody, method, path, body);
      expect(reply.status, `${method} ${path}`).toBe(401);
    }
    await nobody.dispose();
  });

  test('every admin endpoint turns away a customer', async () => {
    const customer = await newApi();
    await customer.post('/api/auth/signup', {
      name: 'Curious Customer',
      email: randomEmail(),
      password: 'correct-horse-9',
    });
    for (const [method, path, body] of ADMIN_ROUTES) {
      const reply = await send(customer, method, path, body);
      expect(reply.status, `${method} ${path}`).toBe(403);
    }
    await customer.dispose();
  });

  test('every admin change is refused when it comes from another website', async () => {
    const admin = await signedIn(ADMIN);
    for (const [method, path, body] of ADMIN_ROUTES.filter(([m]) => m !== 'GET')) {
      const reply = await send(admin, method, path, body, { origin: 'https://evil.example.com' });
      expect(reply.status, `${method} ${path}`).toBe(403);
      expect(reply.error?.code).toBe('BAD_ORIGIN');
    }
  });

  test('a change from our own site is not mistaken for an attack', async () => {
    const admin = await signedIn(ADMIN);
    const reply = await admin.post('/api/v1/admin/uploads/sign', {}, { origin: BASE_URL });
    expect([200, 503]).toContain(reply.status);
  });

  test('the same-origin check cannot be fooled by look-alike addresses', async () => {
    const admin = await signedIn(ADMIN);
    const host = new URL(BASE_URL).host;
    for (const origin of [
      `${BASE_URL}.evil.com`,
      `https://${host}.evil.com`,
      `http://evil.com/${host}`,
      'null',
    ]) {
      const reply = await admin.post('/api/v1/admin/uploads/sign', {}, { origin });
      expect(reply.status, origin).toBe(403);
    }
  });

  test('malformed JSON and wrong shapes never cause a 500', async () => {
    const admin = await signedIn(ADMIN);
    for (const [method, path] of ADMIN_ROUTES.filter(
      // The upload permit takes no body, so there is nothing in it to break (503 means "not set up").
      ([m, path]) =>
        (m === 'POST' || m === 'PATCH' || m === 'PUT') && !path.endsWith('/uploads/sign'),
    )) {
      const raw = await admin.context.fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        data: Buffer.from('{broken'),
      });
      expect(raw.status(), `${method} ${path}`).toBeLessThan(500);
      const text = await raw.text();
      expect(text).not.toMatch(/prisma|stack|at \w+ \(|ECONN|SELECT /i);
      for (const body of [[], 'text', 42, null, { nested: { deep: [1, 2, 3] } }]) {
        const reply = await send(admin, method, path, body);
        expect(reply.status, `${method} ${path} ${JSON.stringify(body)}`).toBeLessThan(500);
      }
    }
  });

  test('script in a dish name is shown as text everywhere, never run', async () => {
    const admin = await signedIn(ADMIN);
    const visitor = await newApi();
    const evil = `<img src=x onerror=alert(1)> </script><script>alert(2)</script> ${randomUUID().slice(0, 4)}`;
    const category = await admin.post('/api/v1/admin/categories', {
      nameEn: evil.slice(0, 60),
      descriptionEn: '<b>bold</b>',
      imageUrl: '',
      sortOrder: 902,
      isActive: true,
      isFeatured: false,
    });
    const categoryId = (category.data as { id: string }).id;
    const product = await admin.post('/api/v1/admin/products', {
      nameEn: evil.slice(0, 80),
      descriptionEn: '<script>alert(3)</script>',
      categoryId,
      basePrice: 100,
      thumbnailUrl: '',
      preparationTime: 5,
      sortOrder: 0,
      isAvailable: true,
      isFeatured: false,
      isPopular: false,
      isActive: true,
      stockStatus: 'IN_STOCK',
      variantGroups: [],
      addonIds: [],
    });
    const productId = (product.data as { id: string }).id;
    const slug = (
      (await admin.get(`/api/v1/admin/products/${productId}`)).data as { product: { slug: string } }
    ).product.slug;

    for (const path of ['/menu', `/menu/${slug}`]) {
      const html = (await visitor.get(path)).text;
      expect(html, path).not.toContain('<img src=x onerror');
      expect(html, path).not.toContain('<script>alert');
      expect(html, path).toContain('&lt;');
    }
    // The admin screens escape it too.
    const adminHtml = (await admin.get('/admin/menu')).text;
    expect(adminHtml).not.toContain('<img src=x onerror');

    await admin.del(`/api/v1/admin/products/${productId}`);
    await admin.del(`/api/v1/admin/categories/${categoryId}`);
    await visitor.dispose();
  });

  test('a photo address must come from the approved photo host', async () => {
    const admin = await signedIn(ADMIN);
    for (const imageUrl of [
      'http://res.cloudinary.com/demo/a.jpg',
      'https://evil.example.com/a.jpg',
      'https://res.cloudinary.com.evil.example/a.jpg',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//res.cloudinary.com/demo/a.jpg',
    ]) {
      const reply = await admin.post('/api/v1/admin/categories', {
        nameEn: 'Photo Test',
        descriptionEn: '',
        imageUrl,
        sortOrder: 0,
        isActive: true,
        isFeatured: false,
      });
      expect(reply.status, imageUrl).toBe(422);
    }
    const good = await admin.post('/api/v1/admin/categories', {
      nameEn: `Photo Test ${randomUUID().slice(0, 4)}`,
      descriptionEn: '',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      sortOrder: 0,
      isActive: true,
      isFeatured: false,
    });
    expect(good.status).toBe(201);
    await admin.del(`/api/v1/admin/categories/${(good.data as { id: string }).id}`);
  });

  test('the photo-upload permit is for admins only and never contains the secret', async () => {
    const admin = await signedIn(ADMIN);
    const reply = await admin.post('/api/v1/admin/uploads/sign');
    if (reply.status === 200) {
      expect(reply.text).toMatch(/signature/);
      expect(reply.text).not.toMatch(/api_?secret/i);
    } else {
      expect(reply.status).toBe(503);
      expect(reply.error?.code).toBe('UPLOADS_NOT_CONFIGURED');
    }
  });

  test('a redirect address after sign-in cannot send people to another site', async () => {
    const visitor = await newApi();
    for (const next of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)']) {
      const reply = await visitor.page(`/api/auth/refresh?next=${encodeURIComponent(next)}`);
      const location = reply.headers['location'] ?? '';
      if (location) {
        expect(new URL(location, BASE_URL).host, next).toBe(new URL(BASE_URL).host);
      }
    }
    await visitor.dispose();
  });

  test('wrong methods are refused, and API replies are not sniffable', async () => {
    const visitor = await newApi();
    expect((await visitor.del('/api/v1/orders')).status).toBe(405);
    expect((await visitor.get('/api/v1/cart/quote')).status).toBe(405);
    expect((await visitor.get('/api/auth/login')).status).toBe(405);
    const reply = await visitor.get('/api/v1/orders/00000000-0000-4000-8000-000000000000');
    expect(reply.headers['x-content-type-options']).toBe('nosniff');
    expect(reply.headers['content-type']).toContain('application/json');
    await visitor.dispose();
  });

  test("another customer's order cannot be found by guessing", async () => {
    const visitor = await newApi();
    for (let i = 0; i < 15; i++) {
      const reply = await visitor.get(`/api/v1/orders/${randomUUID()}`);
      expect(reply.status).toBe(404);
    }
    // And the repeated guessing is slowed down.
    let limited = false;
    for (let i = 0; i < 130 && !limited; i++) {
      limited = (await visitor.get(`/api/v1/orders/${randomUUID()}`)).status === 429;
    }
    expect(limited).toBe(true);
    await visitor.dispose();
    void world;
  });
});

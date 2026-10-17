import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, newApi, randomPhone, signedIn, type Api } from './support/client';
import { guestContact, loadWorld, placeOrder, quote, type World } from './support/world';

/**
 * The owner changes the menu; customers see it at once, and pricing follows. These scenarios make
 * a change in the admin API and then look at the site as a visitor would.
 */
test.describe('admin: the menu', () => {
  let world: World;
  let admin: Api;
  let visitor: Api;
  const tag = randomUUID().slice(0, 5);
  const created = {
    categories: [] as string[],
    products: [] as string[],
    deals: [] as string[],
    addons: [] as string[],
  };

  test.beforeAll(async () => {
    world = loadWorld();
    admin = await signedIn(ADMIN);
    visitor = await newApi();
  });
  test.afterAll(async () => {
    for (const id of created.deals) await admin.del(`/api/v1/admin/deals/${id}`);
    for (const id of created.products) await admin.del(`/api/v1/admin/products/${id}`);
    for (const id of created.addons) await admin.del(`/api/v1/admin/addons/${id}`);
    for (const id of created.categories) await admin.del(`/api/v1/admin/categories/${id}`);
    await visitor.dispose();
  });

  const category = (name: string, extra: Record<string, unknown> = {}) => ({
    nameEn: name,
    descriptionEn: '',
    imageUrl: '',
    sortOrder: 901,
    isActive: true,
    isFeatured: false,
    ...extra,
  });
  const productBody = (name: string, categoryId: string, extra: Record<string, unknown> = {}) => ({
    nameEn: name,
    descriptionEn: '',
    categoryId,
    basePrice: 250,
    thumbnailUrl: '',
    preparationTime: 12,
    sortOrder: 0,
    isAvailable: true,
    isFeatured: false,
    isPopular: false,
    isActive: true,
    stockStatus: 'IN_STOCK',
    variantGroups: [],
    addonIds: [],
    ...extra,
  });

  async function makeCategory(name: string, extra: Record<string, unknown> = {}) {
    const reply = await admin.post('/api/v1/admin/categories', category(name, extra));
    expect(reply.status, reply.text).toBe(201);
    const id = (reply.data as { id: string }).id;
    created.categories.push(id);
    return id;
  }
  async function makeProduct(
    name: string,
    categoryId: string,
    extra: Record<string, unknown> = {},
  ) {
    const reply = await admin.post('/api/v1/admin/products', productBody(name, categoryId, extra));
    expect(reply.status, reply.text).toBe(201);
    const id = (reply.data as { id: string }).id;
    created.products.push(id);
    const detail = await admin.get(`/api/v1/admin/products/${id}`);
    const product = (
      detail.data as {
        product: { slug: string; variantGroups: { variants: { id: string; nameEn: string }[] }[] };
      }
    ).product;
    return { id, slug: product.slug, product };
  }
  const menuHtml = async () => (await visitor.get('/menu')).text;
  const productPage = (slug: string) => visitor.get(`/menu/${slug}`);

  test.describe('categories', () => {
    test('a category stays off the menu until it has something to sell, then appears', async () => {
      const name = `Fresh Cat ${tag}`;
      const id = await makeCategory(name);
      expect(await menuHtml()).not.toContain(name);

      await makeProduct(`Fresh Dish ${tag}`, id);
      const html = await menuHtml();
      expect(html).toContain(name);
      expect(html).toContain(`Fresh Dish ${tag}`);
    });

    test('renaming a category shows the new name straight away, keeping its address', async () => {
      const id = await makeCategory(`Old Name ${tag}`);
      await makeProduct(`Rename Dish ${tag}`, id);
      expect(await menuHtml()).toContain(`Old Name ${tag}`);

      const renamed = await admin.patch(
        `/api/v1/admin/categories/${id}`,
        category(`New Name ${tag}`),
      );
      expect(renamed.status).toBe(200);
      const html = await menuHtml();
      expect(html).toContain(`New Name ${tag}`);
      expect(html).not.toContain(`Old Name ${tag}`);
    });

    test('hiding a category takes all its dishes off the menu and out of reach', async () => {
      const id = await makeCategory(`Hide Cat ${tag}`);
      const { slug } = await makeProduct(`Hide Dish ${tag}`, id);
      expect((await productPage(slug)).status).toBe(200);

      await admin.patch(
        `/api/v1/admin/categories/${id}`,
        category(`Hide Cat ${tag}`, { isActive: false }),
      );
      expect(await menuHtml()).not.toContain(`Hide Dish ${tag}`);
      expect((await productPage(slug)).status).toBe(404);

      await admin.patch(
        `/api/v1/admin/categories/${id}`,
        category(`Hide Cat ${tag}`, { isActive: true }),
      );
      expect(await menuHtml()).toContain(`Hide Dish ${tag}`);
    });

    test("a hidden category's dishes cannot be ordered either", async () => {
      const id = await makeCategory(`Locked Cat ${tag}`);
      const { id: productId } = await makeProduct(`Locked Dish ${tag}`, id);
      const line = {
        kind: 'product' as const,
        productId,
        quantity: 1,
        variantIds: [],
        addonIds: [],
      };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(true);

      await admin.patch(
        `/api/v1/admin/categories/${id}`,
        category(`Locked Cat ${tag}`, { isActive: false }),
      );
      const blocked = await quote(visitor, { lines: [line], orderType: 'PICKUP' });
      expect(blocked.canCheckout).toBe(false);
      expect(blocked.issues.map((i) => i.code)).toContain('PRODUCT_UNAVAILABLE');
    });

    test('a category with dishes cannot be deleted, an empty one can', async () => {
      const full = await makeCategory(`Full Cat ${tag}`);
      await makeProduct(`Full Dish ${tag}`, full);
      const refused = await admin.del(`/api/v1/admin/categories/${full}`);
      expect(refused.status).toBe(409);
      expect(refused.error?.code).toBe('CATEGORY_NOT_EMPTY');

      const empty = await makeCategory(`Empty Cat ${tag}`);
      expect((await admin.del(`/api/v1/admin/categories/${empty}`)).status).toBe(200);
      const list = await admin.get('/api/v1/admin/categories');
      expect(JSON.stringify(list.data)).not.toContain(empty);
    });

    test('bad category details are refused with field messages', async () => {
      for (const [body, field] of [
        [category(''), 'nameEn'],
        [category('x'.repeat(61)), 'nameEn'],
        [category('Ok', { sortOrder: -1 }), 'sortOrder'],
        [category('Ok', { imageUrl: 'https://evil.example.com/a.jpg' }), 'imageUrl'],
        [category('Ok', { imageUrl: 'javascript:alert(1)' }), 'imageUrl'],
      ] as const) {
        const reply = await admin.post('/api/v1/admin/categories', body);
        expect(reply.status, JSON.stringify(body)).toBe(422);
        expect(reply.error?.details?.[field]).toBeTruthy();
      }
    });

    test('two categories with the same name both work, with different addresses', async () => {
      const a = await makeCategory(`Twin Cat ${tag}`);
      const b = await makeCategory(`Twin Cat ${tag}`);
      const list = (await admin.get('/api/v1/admin/categories')).data as {
        categories: { id: string; slug: string }[];
      };
      const slugs = list.categories.filter((c) => [a, b].includes(c.id)).map((c) => c.slug);
      expect(new Set(slugs).size).toBe(2);
    });
  });

  test.describe('products', () => {
    let categoryId: string;
    test.beforeAll(async () => {
      categoryId = await makeCategory(`Products Cat ${tag}`);
    });

    test('a new dish appears with its price, options and add-ons', async () => {
      const addon = await admin.post('/api/v1/admin/addons', {
        nameEn: `Dip ${tag}`,
        price: 35,
        isAvailable: true,
      });
      const addonId = (addon.data as { id: string }).id;
      created.addons.push(addonId);

      const { slug } = await makeProduct(`Full Dish Two ${tag}`, categoryId, {
        basePrice: 455,
        descriptionEn: 'Smoky and tender',
        variantGroups: [
          {
            nameEn: 'Spice',
            isRequired: true,
            variants: [
              { nameEn: 'Mild', priceModifier: 0, isAvailable: true },
              { nameEn: 'Fiery', priceModifier: 25, isAvailable: true },
            ],
          },
        ],
        addonIds: [addonId],
      });
      const page = await productPage(slug);
      expect(page.status).toBe(200);
      for (const text of [
        `Full Dish Two ${tag}`,
        'Smoky and tender',
        'Rs. 455',
        'Mild',
        'Fiery',
        `Dip ${tag}`,
      ]) {
        expect(page.text, text).toContain(text);
      }
    });

    test('changing a price changes the menu, the product page and what a cart costs, at once', async () => {
      const { id, slug } = await makeProduct(`Price Dish ${tag}`, categoryId, { basePrice: 300 });
      const line = {
        kind: 'product' as const,
        productId: id,
        quantity: 2,
        variantIds: [],
        addonIds: [],
      };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(600);
      expect(await menuHtml()).toContain('Rs. 300');

      const updated = await admin.patch(
        `/api/v1/admin/products/${id}`,
        productBody(`Price Dish ${tag}`, categoryId, { basePrice: 345 }),
      );
      expect(updated.status, updated.text).toBe(200);

      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(690);
      expect((await productPage(slug)).text).toContain('Rs. 345');
      expect((await productPage(slug)).text).not.toContain('Rs. 300<');
    });

    test('a sale price is shown and charged, and removing it restores the normal price', async () => {
      const { id } = await makeProduct(`Sale Dish ${tag}`, categoryId, { basePrice: 500 });
      const line = {
        kind: 'product' as const,
        productId: id,
        quantity: 1,
        variantIds: [],
        addonIds: [],
      };

      await admin.patch(
        `/api/v1/admin/products/${id}`,
        productBody(`Sale Dish ${tag}`, categoryId, { basePrice: 500, discountPrice: 399 }),
      );
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(399);

      await admin.patch(
        `/api/v1/admin/products/${id}`,
        productBody(`Sale Dish ${tag}`, categoryId, { basePrice: 500, discountPrice: null }),
      );
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(500);
    });

    test('"sold out" stops orders at once and "back on" restores them', async () => {
      const { id } = await makeProduct(`Sold Dish ${tag}`, categoryId);
      const line = {
        kind: 'product' as const,
        productId: id,
        quantity: 1,
        variantIds: [],
        addonIds: [],
      };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(true);

      expect(
        (await admin.put(`/api/v1/admin/products/${id}/availability`, { isAvailable: false }))
          .status,
      ).toBe(200);
      const blocked = await quote(visitor, { lines: [line], orderType: 'PICKUP' });
      expect(blocked.canCheckout).toBe(false);
      expect(blocked.issues.map((i) => i.code)).toContain('PRODUCT_UNAVAILABLE');
      expect(await menuHtml()).toContain('Sold out');

      // Even an order that was prepared earlier cannot sneak through.
      const sneaky = await visitor.post('/api/v1/orders', {
        lines: [line],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
        idempotencyKey: randomUUID(),
        expectedTotal: 250,
      });
      expect(sneaky.status).toBe(409);
      expect(sneaky.error?.code).toBe('CART_INVALID');

      await admin.put(`/api/v1/admin/products/${id}/availability`, { isAvailable: true });
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(true);
    });

    test('out-of-stock stock status also blocks orders', async () => {
      const { id } = await makeProduct(`Stock Dish ${tag}`, categoryId);
      await admin.patch(
        `/api/v1/admin/products/${id}`,
        productBody(`Stock Dish ${tag}`, categoryId, { stockStatus: 'OUT_OF_STOCK' }),
      );
      const line = {
        kind: 'product' as const,
        productId: id,
        quantity: 1,
        variantIds: [],
        addonIds: [],
      };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(
        false,
      );
    });

    test('hiding a dish removes its page and blocks orders; showing it brings it back', async () => {
      const { id, slug } = await makeProduct(`Visible Dish ${tag}`, categoryId);
      expect((await productPage(slug)).status).toBe(200);

      await admin.patch(
        `/api/v1/admin/products/${id}`,
        productBody(`Visible Dish ${tag}`, categoryId, { isActive: false }),
      );
      expect(await menuHtml()).not.toContain(`Visible Dish ${tag}`);
      expect((await productPage(slug)).status).toBe(404);
      const line = {
        kind: 'product' as const,
        productId: id,
        quantity: 1,
        variantIds: [],
        addonIds: [],
      };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(
        false,
      );

      await admin.patch(
        `/api/v1/admin/products/${id}`,
        productBody(`Visible Dish ${tag}`, categoryId, { isActive: true }),
      );
      expect((await productPage(slug)).status).toBe(200);
    });

    test('bad product details are refused with a message for each field', async () => {
      const bad: [Record<string, unknown>, string][] = [
        [{ basePrice: -5 }, 'basePrice'],
        [{ basePrice: 10.999 }, 'basePrice'],
        [{ basePrice: 2_000_000 }, 'basePrice'],
        [{ nameEn: '' }, 'nameEn'],
        [{ preparationTime: 0 }, 'preparationTime'],
        [{ basePrice: 100, discountPrice: 100 }, 'discountPrice'],
        [{ basePrice: 100, discountPrice: 150 }, 'discountPrice'],
        [{ stockStatus: 'MAYBE' }, 'stockStatus'],
        [{ thumbnailUrl: 'https://evil.example.com/x.jpg' }, 'thumbnailUrl'],
        [{ categoryId: 'nope' }, 'categoryId'],
        [{ addonIds: [randomUUID(), randomUUID()].slice(0, 1).concat([]) }, 'addonIds'],
      ];
      for (const [extra, field] of bad) {
        const reply = await admin.post(
          '/api/v1/admin/products',
          productBody('Bad Dish', categoryId, extra),
        );
        expect(reply.status, JSON.stringify(extra)).toBeGreaterThanOrEqual(400);
        expect(reply.status).toBeLessThan(500);
        expect(Object.keys(reply.error?.details ?? {}).join(' '), JSON.stringify(extra)).toContain(
          field,
        );
      }
    });

    test('option groups are checked: a required group needs options, names cannot repeat', async () => {
      const noOptions = await admin.post(
        '/api/v1/admin/products',
        productBody('Opt Dish', categoryId, {
          variantGroups: [{ nameEn: 'Size', isRequired: true, variants: [] }],
        }),
      );
      expect(noOptions.status).toBe(422);

      const duplicates = await admin.post(
        '/api/v1/admin/products',
        productBody('Opt Dish', categoryId, {
          variantGroups: [
            {
              nameEn: 'Size',
              isRequired: false,
              variants: [
                { nameEn: 'Big', priceModifier: 0, isAvailable: true },
                { nameEn: 'big', priceModifier: 5, isAvailable: true },
              ],
            },
          ],
        }),
      );
      expect(duplicates.status).toBe(422);
      expect(duplicates.error?.details?.['variantGroups.0.variants.1.nameEn']).toBeTruthy();
    });

    test('a category or add-on that does not exist is refused cleanly', async () => {
      const noCategory = await admin.post(
        '/api/v1/admin/products',
        productBody('Orphan Dish', randomUUID()),
      );
      expect(noCategory.status).toBe(422);
      expect(noCategory.error?.code).toBe('CATEGORY_NOT_FOUND');
      const noAddon = await admin.post(
        '/api/v1/admin/products',
        productBody('Orphan Dish', categoryId, { addonIds: [randomUUID()] }),
      );
      expect(noAddon.status).toBe(422);
      expect(noAddon.error?.code).toBe('ADDON_NOT_FOUND');
    });

    test("editing options keeps the ids a customer's open cart already holds", async () => {
      const { id, product } = await makeProduct(`Cart Dish ${tag}`, categoryId, {
        variantGroups: [
          {
            nameEn: 'Size',
            isRequired: true,
            variants: [
              { nameEn: 'Small', priceModifier: 0, isAvailable: true },
              { nameEn: 'Large', priceModifier: 100, isAvailable: true },
            ],
          },
        ],
      });
      const group = product.variantGroups[0];
      const large = group?.variants.find((v) => v.nameEn === 'Large');
      const line = {
        kind: 'product' as const,
        productId: id,
        quantity: 1,
        variantIds: [large?.id ?? ''],
        addonIds: [],
      };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(350);

      const current = (await admin.get(`/api/v1/admin/products/${id}`)).data as {
        product: Record<string, unknown>;
      };
      const groups = (
        current.product['variantGroups'] as {
          id: string;
          nameEn: string;
          isRequired: boolean;
          variants: { id: string; nameEn: string; priceModifier: number; isAvailable: boolean }[];
        }[]
      ).map((g) => ({
        ...g,
        variants: g.variants.map((v) =>
          v.nameEn === 'Large' ? { ...v, nameEn: 'Extra Large', priceModifier: 120 } : v,
        ),
      }));
      const edit = await admin.patch(`/api/v1/admin/products/${id}`, {
        ...current.product,
        variantGroups: groups,
      });
      expect(edit.status, edit.text).toBe(200);

      // The customer's cart still points at the same option, now with its new name and price.
      const after = await quote(visitor, { lines: [line], orderType: 'PICKUP' });
      expect(after.canCheckout).toBe(true);
      expect(after.subtotal).toBe(370);
    });

    test('removing an option leaves old carts with a clear problem instead of a wrong price', async () => {
      const { id, product } = await makeProduct(`Gone Dish ${tag}`, categoryId, {
        variantGroups: [
          {
            nameEn: 'Size',
            isRequired: false,
            variants: [
              { nameEn: 'One', priceModifier: 0, isAvailable: true },
              { nameEn: 'Two', priceModifier: 50, isAvailable: true },
            ],
          },
        ],
      });
      const two = product.variantGroups[0]?.variants.find((v) => v.nameEn === 'Two');
      const current = (await admin.get(`/api/v1/admin/products/${id}`)).data as {
        product: { variantGroups: { variants: { nameEn: string }[] }[] };
      };
      const trimmed = current.product.variantGroups.map((g) => ({
        ...g,
        variants: g.variants.filter((v) => v.nameEn !== 'Two'),
      }));
      await admin.patch(`/api/v1/admin/products/${id}`, {
        ...current.product,
        variantGroups: trimmed,
      });

      const q = await quote(visitor, {
        lines: [
          {
            kind: 'product',
            productId: id,
            quantity: 1,
            variantIds: [two?.id ?? ''],
            addonIds: [],
          },
        ],
        orderType: 'PICKUP',
      });
      expect(q.canCheckout).toBe(false);
      expect(q.issues.map((i) => i.code)).toContain('INVALID_OPTION');
    });

    test('an option from another dish cannot be smuggled into an edit', async () => {
      const a = await makeProduct(`Owner A ${tag}`, categoryId, {
        variantGroups: [
          {
            nameEn: 'Size',
            isRequired: false,
            variants: [{ nameEn: 'Only', priceModifier: 0, isAvailable: true }],
          },
        ],
      });
      const b = await makeProduct(`Owner B ${tag}`, categoryId, {
        variantGroups: [
          {
            nameEn: 'Size',
            isRequired: false,
            variants: [{ nameEn: 'Only', priceModifier: 0, isAvailable: true }],
          },
        ],
      });
      const foreignGroup = b.product.variantGroups[0] as unknown as { id: string };
      void foreignGroup;
      const current = (await admin.get(`/api/v1/admin/products/${a.id}`)).data as {
        product: Record<string, unknown>;
      };
      const bDetail = (await admin.get(`/api/v1/admin/products/${b.id}`)).data as {
        product: { variantGroups: { id: string }[] };
      };
      const reply = await admin.patch(`/api/v1/admin/products/${a.id}`, {
        ...current.product,
        variantGroups: [
          {
            id: bDetail.product.variantGroups[0]?.id,
            nameEn: 'Size',
            isRequired: false,
            variants: [],
          },
        ],
      });
      expect(reply.status).toBe(409);
      expect(reply.error?.code).toBe('INVALID_GROUP');
    });

    test('a dish nobody ordered is deleted for good', async () => {
      const { id, slug } = await makeProduct(`Delete Dish ${tag}`, categoryId);
      const reply = await admin.del(`/api/v1/admin/products/${id}`);
      expect(reply.status).toBe(200);
      expect(reply.data).toMatchObject({ outcome: 'deleted' });
      expect((await productPage(slug)).status).toBe(404);
      expect((await admin.get(`/api/v1/admin/products/${id}`)).status).toBe(404);
    });

    test('a dish that was ordered is hidden, not erased, so past orders stay readable', async () => {
      const { id } = await makeProduct(`Ordered Dish ${tag}`, categoryId);
      const client = await newApi();
      const placed = await placeOrder(client, {
        lines: [{ kind: 'product', productId: id, quantity: 1, variantIds: [], addonIds: [] }],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
      });
      await client.dispose();
      expect(placed.reply.status).toBe(201);

      const reply = await admin.del(`/api/v1/admin/products/${id}`);
      expect(reply.status).toBe(200);
      expect(reply.data).toMatchObject({ outcome: 'archived' });

      const detail = await admin.get(`/api/v1/admin/products/${id}`);
      expect((detail.data as { product: { isActive: boolean } }).product.isActive).toBe(false);

      // The earlier order still names the dish for the kitchen and for the admin.
      const found = await admin.get(`/api/v1/admin/orders?q=${placed.order?.orderNumber ?? ''}`);
      const row = (found.data as { rows: { id: string }[] }).rows[0];
      const order = await admin.get(`/api/v1/admin/orders/${row?.id ?? ''}`);
      expect(order.text).toContain(`Ordered Dish ${tag}`);
    });

    test('unknown or malformed product ids are plain 404s', async () => {
      for (const id of [randomUUID(), 'not-a-uuid', '1']) {
        expect((await admin.get(`/api/v1/admin/products/${id}`)).status, id).toBe(404);
        expect((await admin.del(`/api/v1/admin/products/${id}`)).status, id).toBe(404);
        expect(
          (await admin.put(`/api/v1/admin/products/${id}/availability`, { isAvailable: false }))
            .status,
          id,
        ).toBe(404);
      }
    });

    test('the product list can be searched and filtered', async () => {
      await makeProduct(`Searchable Zebra ${tag}`, categoryId);
      const byName = (await admin.get(`/api/v1/admin/products?q=zebra%20${tag}`)).data as {
        products: { nameEn: string }[];
      };
      expect(byName.products.map((p) => p.nameEn)).toEqual([`Searchable Zebra ${tag}`]);
      const byCategory = (await admin.get(`/api/v1/admin/products?categoryId=${categoryId}`))
        .data as { products: { categoryId: string }[] };
      expect(byCategory.products.length).toBeGreaterThan(0);
      expect(byCategory.products.every((p) => p.categoryId === categoryId)).toBe(true);
      expect((await admin.get('/api/v1/admin/products?categoryId=nope')).status).toBe(422);
    });
  });

  test.describe('add-ons', () => {
    test('an add-on can be created, repriced and removed, and customers see each change', async () => {
      const categoryId = await makeCategory(`Addon Cat ${tag}`);
      const created1 = await admin.post('/api/v1/admin/addons', {
        nameEn: `Side ${tag}`,
        price: 40,
        isAvailable: true,
      });
      const addonId = (created1.data as { id: string }).id;
      created.addons.push(addonId);
      const { id, slug } = await makeProduct(`Addon Host ${tag}`, categoryId, {
        addonIds: [addonId],
        basePrice: 200,
      });
      const line = {
        kind: 'product' as const,
        productId: id,
        quantity: 1,
        variantIds: [],
        addonIds: [addonId],
      };

      expect((await productPage(slug)).text).toContain(`Side ${tag}`);
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(240);

      await admin.patch(`/api/v1/admin/addons/${addonId}`, {
        nameEn: `Side ${tag}`,
        price: 55,
        isAvailable: true,
      });
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(255);

      await admin.patch(`/api/v1/admin/addons/${addonId}`, {
        nameEn: `Side ${tag}`,
        price: 55,
        isAvailable: false,
      });
      const unavailable = await quote(visitor, { lines: [line], orderType: 'PICKUP' });
      expect(unavailable.canCheckout).toBe(false);

      expect((await admin.del(`/api/v1/admin/addons/${addonId}`)).status).toBe(200);
      expect((await productPage(slug)).text).not.toContain(`Side ${tag}`);
      expect((await productPage(slug)).status).toBe(200);
    });

    test('add-on details are checked', async () => {
      for (const body of [
        { nameEn: '', price: 10, isAvailable: true },
        { nameEn: 'X', price: -1, isAvailable: true },
        { nameEn: 'X', price: 'free', isAvailable: true },
      ]) {
        expect((await admin.post('/api/v1/admin/addons', body)).status).toBe(422);
      }
      expect(
        (
          await admin.patch(`/api/v1/admin/addons/${randomUUID()}`, {
            nameEn: 'X',
            price: 1,
            isAvailable: true,
          })
        ).status,
      ).toBe(404);
    });
  });

  test.describe('deals', () => {
    const deal = (name: string, items: unknown[], extra: Record<string, unknown> = {}) => ({
      nameEn: name,
      descriptionEn: '',
      imageUrl: '',
      price: 1000,
      startDate: null,
      endDate: null,
      isAvailable: true,
      isActive: true,
      isFeatured: false,
      items,
      ...extra,
    });
    const items = () => [
      { productId: world.naan.id, variantId: null, quantity: 5 },
      { productId: world.kabab.id, variantId: world.kabab.quarter, quantity: 1 },
    ];
    async function makeDeal(
      name: string,
      extra: Record<string, unknown> = {},
      list: unknown[] = items(),
    ) {
      const reply = await admin.post('/api/v1/admin/deals', deal(name, list, extra));
      expect(reply.status, reply.text).toBe(201);
      const id = (reply.data as { id: string }).id;
      created.deals.push(id);
      return id;
    }
    const dealsPage = async () => (await visitor.get('/deals')).text;

    test('a new deal is on the deals page with its price', async () => {
      await makeDeal(`Deal One ${tag}`, { price: 1234 });
      const html = await dealsPage();
      expect(html).toContain(`Deal One ${tag}`);
      expect(html).toContain('Rs. 1,234');
    });

    test('changing the deal price or switching it off changes what customers see and pay', async () => {
      const id = await makeDeal(`Deal Two ${tag}`, { price: 1100 });
      const line = { kind: 'deal' as const, dealId: id, quantity: 1 };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(1100);

      await admin.patch(
        `/api/v1/admin/deals/${id}`,
        deal(`Deal Two ${tag}`, items(), { price: 999 }),
      );
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).subtotal).toBe(999);

      await admin.patch(
        `/api/v1/admin/deals/${id}`,
        deal(`Deal Two ${tag}`, items(), { isActive: false }),
      );
      expect(await dealsPage()).not.toContain(`Deal Two ${tag}`);
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(
        false,
      );
    });

    test('a deal that has not started or has ended is not shown or sold', async () => {
      const day = 86_400_000;
      const future = await makeDeal(`Deal Future ${tag}`, {
        startDate: new Date(Date.now() + day).toISOString(),
        endDate: new Date(Date.now() + 2 * day).toISOString(),
      });
      const past = await makeDeal(`Deal Past ${tag}`, {
        startDate: new Date(Date.now() - 3 * day).toISOString(),
        endDate: new Date(Date.now() - day).toISOString(),
      });
      const now = await makeDeal(`Deal Now ${tag}`, {
        startDate: new Date(Date.now() - day).toISOString(),
        endDate: new Date(Date.now() + day).toISOString(),
      });
      const html = await dealsPage();
      expect(html).not.toContain(`Deal Future ${tag}`);
      expect(html).not.toContain(`Deal Past ${tag}`);
      expect(html).toContain(`Deal Now ${tag}`);

      for (const [id, sellable] of [
        [future, false],
        [past, false],
        [now, true],
      ] as const) {
        const q = await quote(visitor, {
          lines: [{ kind: 'deal', dealId: id, quantity: 1 }],
          orderType: 'PICKUP',
        });
        expect(q.canCheckout, id).toBe(sellable);
      }
    });

    test('a deal disappears while any item inside it is sold out, and returns afterwards', async () => {
      const categoryId = await makeCategory(`Deal Cat ${tag}`);
      const inner = await makeProduct(`Deal Inner ${tag}`, categoryId);
      const id = await makeDeal(`Deal Three ${tag}`, {}, [
        { productId: inner.id, variantId: null, quantity: 2 },
      ]);
      const line = { kind: 'deal' as const, dealId: id, quantity: 1 };
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(true);

      await admin.put(`/api/v1/admin/products/${inner.id}/availability`, { isAvailable: false });
      const blocked = await quote(visitor, { lines: [line], orderType: 'PICKUP' });
      expect(blocked.canCheckout).toBe(false);
      expect(blocked.issues.map((i) => i.code)).toContain('DEAL_UNAVAILABLE');

      await admin.put(`/api/v1/admin/products/${inner.id}/availability`, { isAvailable: true });
      expect((await quote(visitor, { lines: [line], orderType: 'PICKUP' })).canCheckout).toBe(true);
    });

    test('a product inside a deal cannot be deleted until it is taken out', async () => {
      const categoryId = await makeCategory(`Deal Cat Two ${tag}`);
      const inner = await makeProduct(`Deal Inner Two ${tag}`, categoryId);
      const id = await makeDeal(`Deal Four ${tag}`, {}, [
        { productId: inner.id, variantId: null, quantity: 1 },
      ]);
      const refused = await admin.del(`/api/v1/admin/products/${inner.id}`);
      expect(refused.status).toBe(409);
      expect(refused.error?.code).toBe('PRODUCT_IN_DEAL');

      expect((await admin.del(`/api/v1/admin/deals/${id}`)).status).toBe(200);
      expect((await admin.del(`/api/v1/admin/products/${inner.id}`)).status).toBe(200);
    });

    test('deal details are checked: items, quantities, dates and option ownership', async () => {
      const cases: [Record<string, unknown>, unknown[]][] = [
        [{}, []],
        [{}, [{ productId: world.naan.id, variantId: null, quantity: 0 }]],
        [{}, [{ productId: world.naan.id, variantId: null, quantity: 51 }]],
        [{ price: -1 }, items()],
        [{ startDate: '2026-01-02T00:00:00.000Z', endDate: '2026-01-01T00:00:00.000Z' }, items()],
        [{ startDate: 'tomorrow' }, items()],
        [{ imageUrl: 'https://evil.example.com/x.jpg' }, items()],
      ];
      for (const [extra, list] of cases) {
        const reply = await admin.post('/api/v1/admin/deals', deal('Bad Deal', list, extra));
        expect(reply.status, JSON.stringify([extra, list])).toBe(422);
      }
      const noProduct = await admin.post(
        '/api/v1/admin/deals',
        deal('Bad Deal', [{ productId: randomUUID(), variantId: null, quantity: 1 }]),
      );
      expect(noProduct.status).toBe(422);
      expect(noProduct.error?.code).toBe('PRODUCT_NOT_FOUND');
      // The kabab's "Half" option cannot be attached to a naan.
      const wrongOption = await admin.post(
        '/api/v1/admin/deals',
        deal('Bad Deal', [{ productId: world.naan.id, variantId: world.kabab.half, quantity: 1 }]),
      );
      expect(wrongOption.status).toBe(422);
      expect(wrongOption.error?.code).toBe('INVALID_VARIANT');
    });

    test('a deal that was ordered is switched off instead of deleted', async () => {
      const id = await makeDeal(`Deal Five ${tag}`, { price: 800 });
      const client = await newApi();
      const placed = await placeOrder(client, {
        lines: [{ kind: 'deal', dealId: id, quantity: 1 }],
        orderType: 'PICKUP',
        contact: guestContact(randomPhone()),
      });
      await client.dispose();
      expect(placed.reply.status).toBe(201);
      const reply = await admin.del(`/api/v1/admin/deals/${id}`);
      expect(reply.data).toMatchObject({ outcome: 'archived' });
      expect(await dealsPage()).not.toContain(`Deal Five ${tag}`);
    });

    test('an unused deal is deleted outright, and unknown deals are plain 404s', async () => {
      const id = await makeDeal(`Deal Six ${tag}`);
      expect((await admin.del(`/api/v1/admin/deals/${id}`)).data).toMatchObject({
        outcome: 'deleted',
      });
      expect((await admin.del(`/api/v1/admin/deals/${id}`)).status).toBe(404);
      expect((await admin.del('/api/v1/admin/deals/not-a-uuid')).status).toBe(404);
      expect(
        (await admin.patch(`/api/v1/admin/deals/${randomUUID()}`, deal('x', items()))).status,
      ).toBe(404);
    });
  });
});

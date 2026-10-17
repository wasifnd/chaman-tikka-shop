import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMenuRepository } from '@/features/menu/services/menu.repository';
import { createQuoteLoader } from '@/features/checkout/services/quote.repository';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import type { CategoryInput, DealInput, ProductInput } from '../schemas/catalog.schema';
import { createCategoryRepository } from './category.repository';
import { createDealRepository } from './deal.repository';
import { createProductRepository } from './product.repository';

/**
 * Real-database tests for editing the menu: categories, products with options and add-ons, deals.
 * Run in a private schema that is dropped afterwards. Skipped unless a URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

// A remote development database adds a delay to every query; these tests make many.
vi.setConfig({ testTimeout: 90_000 });

const category = (overrides: Partial<CategoryInput> = {}): CategoryInput => ({
  nameEn: 'Grill',
  descriptionEn: null,
  imageUrl: null,
  sortOrder: 5,
  isActive: true,
  isFeatured: false,
  ...overrides,
});

const product = (categoryId: string, overrides: Partial<ProductInput> = {}): ProductInput => ({
  nameEn: 'Seekh Kabab',
  descriptionEn: null,
  categoryId,
  basePrice: 400,
  discountPrice: null,
  thumbnailUrl: null,
  preparationTime: 15,
  sortOrder: 0,
  isAvailable: true,
  isFeatured: false,
  isPopular: false,
  isActive: true,
  stockStatus: 'IN_STOCK',
  variantGroups: [],
  addonIds: [],
  ...overrides,
});

describe.skipIf(!url)('editing the menu against Postgres', () => {
  let db: TestDatabase;
  let categories: ReturnType<typeof createCategoryRepository>;
  let products: ReturnType<typeof createProductRepository>;
  let deals: ReturnType<typeof createDealRepository>;
  let menu: ReturnType<typeof createMenuRepository>;

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    categories = createCategoryRepository(db.prisma);
    products = createProductRepository(db.prisma);
    deals = createDealRepository(db.prisma);
    menu = createMenuRepository(db.prisma);
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  describe('categories', () => {
    it('creates, lists with product counts, updates and deletes an empty one', async () => {
      const id = await categories.create(category({ nameEn: 'Drinks' }));
      let listed = (await categories.list()).find((c) => c.id === id);
      expect(listed).toMatchObject({ nameEn: 'Drinks', slug: 'drinks', productCount: 0 });

      await categories.update(id, category({ nameEn: 'Cold Drinks', isActive: false }));
      listed = (await categories.list()).find((c) => c.id === id);
      // The address (slug) does not change when a category is renamed.
      expect(listed).toMatchObject({ nameEn: 'Cold Drinks', slug: 'drinks', isActive: false });

      await categories.remove(id);
      expect((await categories.list()).some((c) => c.id === id)).toBe(false);
    });

    it('gives categories with the same name different addresses, even when created at once', async () => {
      const ids = await Promise.all(
        Array.from({ length: 6 }, () => categories.create(category({ nameEn: 'Sides' }))),
      );
      const slugs = (await categories.list()).filter((c) => ids.includes(c.id)).map((c) => c.slug);
      expect(new Set(slugs).size).toBe(6);
      expect(slugs).toContain('sides');
    });

    it('refuses to delete a category that still has products', async () => {
      await expect(categories.remove(db.ids.category)).rejects.toMatchObject({
        code: 'CATEGORY_NOT_EMPTY',
        status: 409,
      });
      expect((await categories.list()).some((c) => c.id === db.ids.category)).toBe(true);
    });

    it('reports a missing category cleanly', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(categories.update(missing, category())).rejects.toMatchObject({ status: 404 });
      await expect(categories.remove(missing)).rejects.toMatchObject({ status: 404 });
    });

    it('hides a hidden category and its products from the public menu', async () => {
      const id = await categories.create(category({ nameEn: 'Seasonal' }));
      await products.create(product(id, { nameEn: 'Seasonal Special' }));
      expect((await menu.listMenu()).some((c) => c.slug === 'seasonal')).toBe(true);

      await categories.update(id, category({ nameEn: 'Seasonal', isActive: false }));
      expect((await menu.listMenu()).some((c) => c.slug === 'seasonal')).toBe(false);
    });
  });

  describe('products', () => {
    it('creates a product with options and add-ons and reads it back exactly', async () => {
      const addonId = await products.createAddon({
        nameEn: 'Chutney',
        price: 20,
        isAvailable: true,
      });
      const id = await products.create(
        product(db.ids.category, {
          nameEn: 'Malai Boti',
          discountPrice: 450,
          basePrice: 500,
          variantGroups: [
            {
              nameEn: 'Portion',
              isRequired: true,
              variants: [
                { nameEn: 'Quarter', priceModifier: 0, isAvailable: true },
                { nameEn: 'Half', priceModifier: 450, isAvailable: true },
              ],
            },
          ],
          addonIds: [addonId],
        }),
      );

      const saved = await products.get(id);
      expect(saved).toMatchObject({
        nameEn: 'Malai Boti',
        slug: 'malai-boti',
        basePrice: 500,
        discountPrice: 450,
        addonIds: [addonId],
      });
      expect(saved?.variantGroups).toHaveLength(1);
      expect(saved?.variantGroups[0]?.variants.map((v) => [v.nameEn, v.priceModifier])).toEqual([
        ['Quarter', 0],
        ['Half', 450],
      ]);
    });

    it('shows a new product on the customer menu and product page straight away', async () => {
      const id = await products.create(product(db.ids.category, { nameEn: 'Reshmi Kabab' }));
      const page = await menu.findProduct('reshmi-kabab');
      expect(page).toMatchObject({ name: 'Reshmi Kabab', price: 400 });

      // Marking it sold out keeps it listed but not orderable.
      await products.setAvailability(id, false);
      expect((await menu.findProduct('reshmi-kabab'))?.orderable).toBe(false);

      // Hiding it removes it from customers entirely.
      await products.update(
        id,
        product(db.ids.category, { nameEn: 'Reshmi Kabab', isActive: false }),
      );
      expect(await menu.findProduct('reshmi-kabab')).toBeNull();
    });

    it('makes a price change visible to checkout pricing immediately', async () => {
      const id = await products.create(
        product(db.ids.category, { nameEn: 'Price Test', basePrice: 100 }),
      );
      const load = createQuoteLoader(db.prisma);
      const input = { lines: [{ kind: 'product' as const, productId: id, quantity: 1 }] } as never;
      expect((await load(input)).products.get(id)?.basePrice).toBe(100);

      await products.update(id, product(db.ids.category, { nameEn: 'Price Test', basePrice: 175 }));
      expect((await load(input)).products.get(id)?.basePrice).toBe(175);
    });

    it('gives products with the same name different addresses', async () => {
      const ids = await Promise.all(
        Array.from({ length: 4 }, () =>
          products.create(product(db.ids.category, { nameEn: 'Twin' })),
        ),
      );
      const slugs = await Promise.all(ids.map(async (id) => (await products.get(id))?.slug));
      expect(new Set(slugs).size).toBe(4);
    });

    it('rejects a product in a category or with an add-on that does not exist', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(products.create(product(missing))).rejects.toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
        status: 422,
      });
      await expect(
        products.create(product(db.ids.category, { addonIds: [missing] })),
      ).rejects.toMatchObject({ code: 'ADDON_NOT_FOUND', status: 422 });
    });

    describe('editing options', () => {
      async function makeWithOptions() {
        return products.create(
          product(db.ids.category, {
            nameEn: `Options ${crypto.randomUUID().slice(0, 6)}`,
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
          }),
        );
      }

      it('keeps the ids of options that were only edited, so open carts keep working', async () => {
        const id = await makeWithOptions();
        const before = await products.get(id);
        const group = before?.variantGroups[0];
        const small = group?.variants[0];
        const large = group?.variants[1];

        await products.update(id, {
          ...product(db.ids.category, { nameEn: before?.nameEn ?? '' }),
          variantGroups: [
            {
              id: group?.id,
              nameEn: 'Size',
              isRequired: true,
              variants: [
                { id: small?.id, nameEn: 'Small', priceModifier: 10, isAvailable: true },
                { id: large?.id, nameEn: 'Large', priceModifier: 120, isAvailable: false },
                { nameEn: 'Jumbo', priceModifier: 250, isAvailable: true },
              ],
            },
          ],
        });

        const after = await products.get(id);
        const variants = after?.variantGroups[0]?.variants ?? [];
        expect(after?.variantGroups[0]?.id).toBe(group?.id);
        expect(variants.map((v) => [v.nameEn, v.priceModifier, v.isAvailable])).toEqual([
          ['Small', 10, true],
          ['Large', 120, false],
          ['Jumbo', 250, true],
        ]);
        expect(variants[0]?.id).toBe(small?.id);
        expect(variants[1]?.id).toBe(large?.id);
      });

      it('removes options and groups that are no longer listed', async () => {
        const id = await makeWithOptions();
        const before = await products.get(id);
        const group = before?.variantGroups[0];

        await products.update(id, {
          ...product(db.ids.category, { nameEn: before?.nameEn ?? '' }),
          variantGroups: [
            {
              id: group?.id,
              nameEn: 'Size',
              isRequired: false,
              variants: [
                {
                  id: group?.variants[0]?.id,
                  nameEn: 'Small',
                  priceModifier: 0,
                  isAvailable: true,
                },
              ],
            },
          ],
        });
        expect((await products.get(id))?.variantGroups[0]?.variants.map((v) => v.nameEn)).toEqual([
          'Small',
        ]);

        await products.update(id, {
          ...product(db.ids.category, { nameEn: before?.nameEn ?? '' }),
          variantGroups: [],
        });
        expect((await products.get(id))?.variantGroups).toEqual([]);
      });

      it('re-orders options by their position in the form', async () => {
        const id = await makeWithOptions();
        const before = await products.get(id);
        const group = before?.variantGroups[0];
        const [small, large] = group?.variants ?? [];

        await products.update(id, {
          ...product(db.ids.category, { nameEn: before?.nameEn ?? '' }),
          variantGroups: [
            {
              id: group?.id,
              nameEn: 'Size',
              isRequired: true,
              variants: [
                { id: large?.id, nameEn: 'Large', priceModifier: 100, isAvailable: true },
                { id: small?.id, nameEn: 'Small', priceModifier: 0, isAvailable: true },
              ],
            },
          ],
        });
        expect((await products.get(id))?.variantGroups[0]?.variants.map((v) => v.nameEn)).toEqual([
          'Large',
          'Small',
        ]);
      });

      it('replaces the add-ons attached to a product', async () => {
        const a = await products.createAddon({ nameEn: 'Add A', price: 10, isAvailable: true });
        const b = await products.createAddon({ nameEn: 'Add B', price: 20, isAvailable: true });
        const id = await products.create(
          product(db.ids.category, { nameEn: 'With Addons', addonIds: [a] }),
        );
        await products.update(
          id,
          product(db.ids.category, { nameEn: 'With Addons', addonIds: [b] }),
        );
        expect((await products.get(id))?.addonIds).toEqual([b]);
        await products.update(
          id,
          product(db.ids.category, { nameEn: 'With Addons', addonIds: [] }),
        );
        expect((await products.get(id))?.addonIds).toEqual([]);
      });

      it('refuses ids that do not belong to this product, leaving it untouched', async () => {
        const id = await makeWithOptions();
        const other = await makeWithOptions();
        const before = await products.get(id);
        const foreignGroup = (await products.get(other))?.variantGroups[0];

        await expect(
          products.update(id, {
            ...product(db.ids.category, { nameEn: 'Hacked' }),
            variantGroups: [
              { id: foreignGroup?.id, nameEn: 'Size', isRequired: false, variants: [] },
            ],
          }),
        ).rejects.toMatchObject({ code: 'INVALID_GROUP' });

        await expect(
          products.update(id, {
            ...product(db.ids.category, { nameEn: 'Hacked' }),
            variantGroups: [
              {
                id: before?.variantGroups[0]?.id,
                nameEn: 'Size',
                isRequired: false,
                variants: [
                  {
                    id: foreignGroup?.variants[0]?.id,
                    nameEn: 'Small',
                    priceModifier: 0,
                    isAvailable: true,
                  },
                ],
              },
            ],
          }),
        ).rejects.toMatchObject({ code: 'INVALID_VARIANT' });

        expect(await products.get(id)).toEqual(before);
      });

      it('refuses to remove an option that a deal uses, but allows marking it unavailable', async () => {
        const id = await makeWithOptions();
        const before = await products.get(id);
        const group = before?.variantGroups[0];
        const large = group?.variants[1];
        const dealId = await deals.create({
          ...deal(),
          nameEn: `Uses Option ${crypto.randomUUID().slice(0, 6)}`,
          items: [{ productId: id, variantId: large?.id ?? null, quantity: 1 }],
        });

        const withoutLarge = {
          ...product(db.ids.category, { nameEn: before?.nameEn ?? '' }),
          variantGroups: [
            {
              id: group?.id,
              nameEn: 'Size',
              isRequired: true,
              variants: [
                {
                  id: group?.variants[0]?.id,
                  nameEn: 'Small',
                  priceModifier: 0,
                  isAvailable: true,
                },
              ],
            },
          ],
        };
        await expect(products.update(id, withoutLarge)).rejects.toMatchObject({
          code: 'VARIANT_IN_DEAL',
          status: 409,
        });
        expect((await products.get(id))?.variantGroups[0]?.variants).toHaveLength(2);

        await products.update(id, {
          ...withoutLarge,
          variantGroups: [
            {
              id: group?.id,
              nameEn: 'Size',
              isRequired: true,
              variants: [
                {
                  id: group?.variants[0]?.id,
                  nameEn: 'Small',
                  priceModifier: 0,
                  isAvailable: true,
                },
                { id: large?.id, nameEn: 'Large', priceModifier: 100, isAvailable: false },
              ],
            },
          ],
        });
        expect((await products.get(id))?.variantGroups[0]?.variants[1]?.isAvailable).toBe(false);
        await deals.remove(dealId);
      });
    });

    it('deletes a never-sold product, archives a sold one and protects one inside a deal', async () => {
      const fresh = await products.create(product(db.ids.category, { nameEn: 'Delete Me' }));
      expect(await products.remove(fresh)).toBe('deleted');
      expect(await products.get(fresh)).toBeNull();

      const sold = await products.create(product(db.ids.category, { nameEn: 'Sold Item' }));
      const order = await db.prisma.order.create({
        data: {
          orderNumber: `ADM-${crypto.randomUUID().slice(0, 8)}`,
          type: 'PICKUP',
          subtotal: 400,
          grandTotal: 400,
          paymentMethod: 'COD',
          items: {
            create: {
              productId: sold,
              productNameSnapshot: 'Sold Item',
              unitPrice: 400,
              quantity: 1,
              subtotal: 400,
            },
          },
        },
      });
      expect(await products.remove(sold)).toBe('archived');
      const archived = await products.get(sold);
      expect(archived).toMatchObject({ isActive: false, isAvailable: false });
      // The old order still shows what was bought.
      const item = await db.prisma.orderItem.findFirst({ where: { orderId: order.id } });
      expect(item?.productNameSnapshot).toBe('Sold Item');

      await expect(products.remove(db.ids.tikka)).rejects.toMatchObject({
        code: 'PRODUCT_IN_DEAL',
        status: 409,
      });
      expect(await products.get(db.ids.tikka)).not.toBeNull();
    });

    it('lists products, filtered by name (ignoring case) and category', async () => {
      const otherCategory = await categories.create(category({ nameEn: 'Filter Cat' }));
      await products.create(product(otherCategory, { nameEn: 'Zesty Wrap' }));

      const byName = await products.list({ q: 'zESTY' });
      expect(byName.map((p) => p.nameEn)).toEqual(['Zesty Wrap']);
      expect(byName[0]?.categoryName).toBe('Filter Cat');

      const byCategory = await products.list({ categoryId: otherCategory });
      expect(byCategory).toHaveLength(1);
      expect(await products.list({ q: 'no-such-product-xyz' })).toEqual([]);
    });

    it('reports a missing product cleanly', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(products.update(missing, product(db.ids.category))).rejects.toMatchObject({
        status: 404,
      });
      await expect(products.remove(missing)).rejects.toMatchObject({ status: 404 });
      await expect(products.setAvailability(missing, true)).rejects.toMatchObject({ status: 404 });
      expect(await products.get(missing)).toBeNull();
    });
  });

  describe('add-ons', () => {
    it('creates, edits, counts usage and deletes', async () => {
      const id = await products.createAddon({
        nameEn: 'Extra Raita',
        price: 60,
        isAvailable: true,
      });
      const productId = await products.create(
        product(db.ids.category, { nameEn: 'Addon Host', addonIds: [id] }),
      );
      await products.updateAddon(id, { nameEn: 'Extra Raita', price: 70, isAvailable: false });
      const listed = (await products.listAddons()).find((a) => a.id === id);
      expect(listed).toMatchObject({ price: 70, isAvailable: false, productCount: 1 });

      await products.removeAddon(id);
      expect((await products.listAddons()).some((a) => a.id === id)).toBe(false);
      // The product survives; it just no longer offers the add-on.
      expect((await products.get(productId))?.addonIds).toEqual([]);
    });

    it('reports a missing add-on cleanly', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(
        products.updateAddon(missing, { nameEn: 'x', price: 1, isAvailable: true }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(products.removeAddon(missing)).rejects.toMatchObject({ status: 404 });
    });
  });

  function deal(): DealInput {
    return {
      nameEn: 'Test Deal',
      descriptionEn: null,
      imageUrl: null,
      price: 999,
      startDate: null,
      endDate: null,
      isAvailable: true,
      isActive: true,
      isFeatured: false,
      items: [{ productId: db.ids.tikka, variantId: db.ids.half, quantity: 1 }],
    };
  }

  describe('deals', () => {
    it('creates a deal that appears on the customer deals page with its contents', async () => {
      const id = await deals.create({
        ...deal(),
        nameEn: 'Weekend Feast',
        items: [
          { productId: db.ids.tikka, variantId: db.ids.half, quantity: 2 },
          { productId: db.ids.naan, variantId: null, quantity: 6 },
        ],
      });
      const live = await menu.findDeal('weekend-feast', new Date());
      expect(live).toMatchObject({ name: 'Weekend Feast', price: 999 });
      expect(live?.items).toHaveLength(2);

      const saved = await deals.get(id);
      expect(saved?.items.map((i) => [i.productName, i.quantity])).toEqual(
        expect.arrayContaining([
          ['Chicken Tikka', 2],
          ['Naan', 6],
        ]),
      );
    });

    it('replaces the contents and details on update', async () => {
      const id = await deals.create({ ...deal(), nameEn: 'Editable Deal' });
      await deals.update(id, {
        ...deal(),
        nameEn: 'Editable Deal',
        price: 800,
        items: [{ productId: db.ids.naan, variantId: null, quantity: 10 }],
      });
      const saved = await deals.get(id);
      expect(saved).toMatchObject({ price: 800, slug: 'editable-deal' });
      expect(saved?.items).toHaveLength(1);
      expect(saved?.items[0]).toMatchObject({ productId: db.ids.naan, quantity: 10 });
    });

    it('stores deal dates and hides a deal outside its window', async () => {
      const past = '2020-01-01T00:00:00.000Z';
      const pastEnd = '2020-01-02T00:00:00.000Z';
      const id = await deals.create({
        ...deal(),
        nameEn: 'Old Deal',
        startDate: past,
        endDate: pastEnd,
      });
      expect((await deals.get(id))?.endDate).toBe(pastEnd);
      expect(await menu.findDeal('old-deal', new Date())).toBeNull();
    });

    it('rejects a missing product or an option from another product', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(
        deals.create({ ...deal(), items: [{ productId: missing, variantId: null, quantity: 1 }] }),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', status: 422 });
      // "Half" belongs to the tikka, not to the naan.
      await expect(
        deals.create({
          ...deal(),
          items: [{ productId: db.ids.naan, variantId: db.ids.half, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_VARIANT', status: 422 });
    });

    it('deletes an unused deal and archives one that was ordered', async () => {
      const unused = await deals.create({ ...deal(), nameEn: 'Unused Deal' });
      expect(await deals.remove(unused)).toBe('deleted');
      expect(await deals.get(unused)).toBeNull();

      const ordered = await deals.create({ ...deal(), nameEn: 'Ordered Deal' });
      await db.prisma.order.create({
        data: {
          orderNumber: `ADM-${crypto.randomUUID().slice(0, 8)}`,
          type: 'PICKUP',
          subtotal: 999,
          grandTotal: 999,
          paymentMethod: 'COD',
          items: {
            create: {
              dealId: ordered,
              productNameSnapshot: 'Ordered Deal',
              unitPrice: 999,
              quantity: 1,
              subtotal: 999,
            },
          },
        },
      });
      expect(await deals.remove(ordered)).toBe('archived');
      expect(await deals.get(ordered)).toMatchObject({ isActive: false, isAvailable: false });
    });

    it('reports a missing deal cleanly', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(deals.update(missing, deal())).rejects.toMatchObject({ status: 404 });
      await expect(deals.remove(missing)).rejects.toMatchObject({ status: 404 });
      expect(await deals.get(missing)).toBeNull();
    });

    it('lists deals including hidden ones, for the admin', async () => {
      const id = await deals.create({ ...deal(), nameEn: 'Hidden Deal', isActive: false });
      expect((await deals.list()).some((d) => d.id === id)).toBe(true);
      expect((await menu.listDeals(new Date())).some((d) => d.name === 'Hidden Deal')).toBe(false);
    });
  });
});

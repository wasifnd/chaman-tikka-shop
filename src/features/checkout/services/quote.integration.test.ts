import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLOSED_NOW, OPEN_NOW } from '../testing/fixtures';
import type { QuoteInput } from '../types/quote.types';
import { createQuoteLoader } from './quote.repository';
import { createQuoteService } from './quote.service';
import { createZonesRepository } from './zones.repository';

/**
 * Runs the real loader and pricing engine against a database seeded with `npm run db:seed`.
 * Read-only, so it is safe on a development database. Skipped unless a URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 * CI sets it to a throwaway Postgres container.
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

describe.skipIf(!url)('quote against the seeded database', () => {
  let prisma: PrismaClient;
  let quote: (
    input: QuoteInput,
    now?: Date,
  ) => ReturnType<ReturnType<typeof createQuoteService>['quote']>;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
    const loader = createQuoteLoader(prisma);
    quote = (input, now = OPEN_NOW) => createQuoteService(loader, () => now).quote(input);

    const tikka = await prisma.product.findUniqueOrThrow({
      where: { slug: 'chicken-tikka' },
      include: {
        variantGroups: { include: { variants: true } },
        productAddons: { include: { addon: true } },
      },
    });
    const variants = tikka.variantGroups[0]?.variants ?? [];
    id['tikka'] = tikka.id;
    id['half'] = variants.find((v) => v.nameEn === 'Half')?.id ?? '';
    id['quarter'] = variants.find((v) => v.nameEn === 'Quarter')?.id ?? '';
    id['raita'] = tikka.productAddons.find((p) => p.addon.nameEn === 'Raita')?.addon.id ?? '';
    id['naan'] = (await prisma.product.findUniqueOrThrow({ where: { slug: 'naan' } })).id;
    id['deal'] = (await prisma.deal.findUniqueOrThrow({ where: { slug: 'family-platter' } })).id;
    id['johar'] = (
      await prisma.deliveryZone.findFirstOrThrow({ where: { name: 'Johar Town' } })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const tikkaLine = (variantId: string, quantity: number, addonIds: string[] = []) => ({
    kind: 'product' as const,
    productId: id['tikka'] ?? '',
    quantity,
    variantIds: [variantId],
    addonIds,
  });

  it('prices real products, options, add-ons and delivery from the database', async () => {
    const result = await quote({
      orderType: 'DELIVERY',
      zoneId: id['johar'] ?? '',
      lines: [tikkaLine(id['half'] ?? '', 2, [id['raita'] ?? ''])],
    });
    // (350 + 330 + 50) * 2 = 1460, plus Rs. 100 delivery to Johar Town
    expect(result.issues).toEqual([]);
    expect(result.lines[0]).toMatchObject({ name: 'Chicken Tikka', unitPrice: 730, quantity: 2 });
    expect(result.subtotal).toBe(1460);
    expect(result.deliveryCharge).toBe(100);
    expect(result.grandTotal).toBe(1560);
    expect(result.canCheckout).toBe(true);
  }, 30_000);

  it('makes delivery free at the zone threshold', async () => {
    const result = await quote({
      orderType: 'DELIVERY',
      zoneId: id['johar'] ?? '',
      lines: [tikkaLine(id['half'] ?? '', 3)],
    });
    expect(result.subtotal).toBe(2040);
    expect(result.deliveryCharge).toBe(0);
  }, 30_000);

  it('prices a deal at its own price', async () => {
    const result = await quote({
      orderType: 'PICKUP',
      lines: [{ kind: 'deal', dealId: id['deal'] ?? '', quantity: 2 }],
    });
    expect(result.lines[0]).toMatchObject({
      kind: 'deal',
      name: 'Family Platter',
      unitPrice: 1350,
    });
    expect(result.subtotal).toBe(2700);
    expect(result.canCheckout).toBe(true);
  }, 30_000);

  it('rejects a missing required option and an unknown product', async () => {
    const missing = await quote({
      orderType: 'PICKUP',
      lines: [{ ...tikkaLine('', 1), variantIds: [] }],
    });
    expect(missing.issues.map((i) => i.code)).toEqual(['MISSING_REQUIRED_OPTION']);

    const unknown = await quote({
      orderType: 'PICKUP',
      lines: [
        {
          kind: 'product',
          productId: '99999999-9999-4999-8999-999999999999',
          quantity: 1,
          variantIds: [],
          addonIds: [],
        },
      ],
    });
    expect(unknown.issues.map((i) => i.code)).toEqual(['PRODUCT_NOT_FOUND']);
  }, 30_000);

  it('rejects an unknown delivery area and an unknown coupon', async () => {
    const result = await quote({
      orderType: 'DELIVERY',
      zoneId: '99999999-9999-4999-8999-999999999999',
      couponCode: 'does-not-exist',
      lines: [
        { kind: 'product', productId: id['naan'] ?? '', quantity: 1, variantIds: [], addonIds: [] },
      ],
    });
    expect(result.issues.map((i) => i.code)).toEqual(['ZONE_INVALID']);
    expect(result.coupon).toMatchObject({ applied: false, reason: 'NOT_FOUND' });
  }, 30_000);

  it('uses the stored opening hours', async () => {
    const lines = [
      {
        kind: 'product' as const,
        productId: id['naan'] ?? '',
        quantity: 1,
        variantIds: [],
        addonIds: [],
      },
    ];
    expect((await quote({ orderType: 'PICKUP', lines }, OPEN_NOW)).canCheckout).toBe(true);
    const closed = await quote({ orderType: 'PICKUP', lines }, CLOSED_NOW);
    expect(closed.issues.map((i) => i.code)).toEqual(['RESTAURANT_CLOSED']);
  }, 30_000);

  it('loads only active delivery areas, in display order', async () => {
    const zones = await createZonesRepository(prisma).listActive();
    expect(zones.map((z) => z.name)).toEqual(['Township', 'Johar Town', 'Model Town']);
    expect(zones[1]).toMatchObject({ charge: 100, freeDeliveryAbove: 2000 });
  }, 30_000);
});

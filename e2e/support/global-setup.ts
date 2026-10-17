import { randomUUID } from 'node:crypto';
import { ADMIN, signedIn } from './client';
import { ALL_DAY, saveWorld, type World } from './world';

/**
 * Prepares one known restaurant for every scenario: open all day, with a small test menu, a
 * delivery area and two coupons, all created through the admin screens' own API. This is itself
 * a check that the admin can set a restaurant up from nothing.
 */
export default async function globalSetup() {
  const admin = await signedIn(ADMIN);
  const suffix = randomUUID().slice(0, 6);

  const before = await admin.get('/api/v1/admin/settings');
  if (before.status !== 200) throw new Error(`Admin API unavailable: ${before.status}`);
  const original = before.data;

  const must = async <T>(label: string, reply: ReturnType<typeof admin.post>): Promise<T> => {
    const result = await reply;
    if (result.status >= 300) {
      throw new Error(`Setup step "${label}" failed: ${result.status} ${result.text}`);
    }
    return result.data as T;
  };

  const restaurant = (original as { restaurant: Record<string, unknown> }).restaurant;
  await must(
    'open all day',
    admin.put('/api/v1/admin/settings', {
      restaurant: { ...restaurant, orderingEnabled: true, taxRatePercent: 0 },
      hours: ALL_DAY,
    }),
  );

  const { id: categoryId } = await must<{ id: string }>(
    'category',
    admin.post('/api/v1/admin/categories', {
      nameEn: `E2E Grill ${suffix}`,
      descriptionEn: '',
      imageUrl: '',
      sortOrder: 900,
      isActive: true,
      isFeatured: false,
    }),
  );
  const { id: chutneyId } = await must<{ id: string }>(
    'add-on',
    admin.post('/api/v1/admin/addons', {
      nameEn: `E2E Chutney ${suffix}`,
      price: 20,
      isAvailable: true,
    }),
  );

  const product = (nameEn: string, basePrice: number, extra: Record<string, unknown> = {}) => ({
    nameEn,
    descriptionEn: '',
    categoryId,
    basePrice,
    thumbnailUrl: '',
    preparationTime: 10,
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

  const kababName = `E2E Seekh Kabab ${suffix}`;
  const { id: kababId } = await must<{ id: string }>(
    'kabab',
    admin.post(
      '/api/v1/admin/products',
      product(kababName, 400, {
        variantGroups: [
          {
            nameEn: 'Portion',
            isRequired: true,
            variants: [
              { nameEn: 'Quarter', priceModifier: 0, isAvailable: true },
              { nameEn: 'Half', priceModifier: 380, isAvailable: true },
            ],
          },
        ],
        addonIds: [chutneyId],
      }),
    ),
  );
  const naanName = `E2E Naan ${suffix}`;
  const { id: naanId } = await must<{ id: string }>(
    'naan',
    admin.post('/api/v1/admin/products', product(naanName, 30)),
  );

  const products = await admin.get(`/api/v1/admin/products?q=${suffix}`);
  const listed = (products.data as { products: { id: string; slug: string }[] }).products;
  const slugOf = (id: string) => listed.find((p) => p.id === id)?.slug ?? '';

  // The option ids are assigned by the server, so read them back.
  const saved = await admin.get(`/api/v1/admin/products/${kababId}`);
  const variants = (
    saved.data as { product: { variantGroups: { variants: { id: string; nameEn: string }[] }[] } }
  ).product.variantGroups.flatMap((group) => group.variants);
  const optionIds = {
    quarter: variants.find((v) => v.nameEn === 'Quarter')?.id ?? '',
    half: variants.find((v) => v.nameEn === 'Half')?.id ?? '',
  };

  const dealName = `E2E Combo ${suffix}`;
  const { id: dealId } = await must<{ id: string }>(
    'deal',
    admin.post('/api/v1/admin/deals', {
      nameEn: dealName,
      descriptionEn: '',
      imageUrl: '',
      price: 900,
      startDate: null,
      endDate: null,
      isAvailable: true,
      isActive: true,
      isFeatured: false,
      items: [
        { productId: kababId, variantId: optionIds.half, quantity: 1 },
        { productId: naanId, variantId: null, quantity: 4 },
      ],
    }),
  );

  const zoneName = `E2E Area ${suffix}`;
  const { id: zoneId } = await must<{ id: string }>(
    'zone',
    admin.post('/api/v1/admin/zones', {
      name: zoneName,
      charge: 100,
      freeDeliveryAbove: 2000,
      minOrderAmount: 300,
      isActive: true,
      sortOrder: 900,
    }),
  );

  const couponPercent = `E2ETEN${suffix.toUpperCase()}`;
  const couponFixed = `E2E50${suffix.toUpperCase()}`;
  await must(
    'percent coupon',
    admin.post('/api/v1/admin/coupons', coupon(couponPercent, 'PERCENTAGE', 10, 200)),
  );
  await must(
    'fixed coupon',
    admin.post('/api/v1/admin/coupons', coupon(couponFixed, 'FIXED', 50, 100)),
  );

  const world: World = {
    suffix,
    categoryId,
    kabab: {
      id: kababId,
      slug: slugOf(kababId),
      name: kababName,
      basePrice: 400,
      half: optionIds.half,
      quarter: optionIds.quarter,
    },
    naan: { id: naanId, slug: slugOf(naanId), name: naanName, basePrice: 30 },
    chutneyId,
    dealId,
    dealName,
    zone: { id: zoneId, name: zoneName, charge: 100, freeAbove: 2000, minOrder: 300 },
    couponPercent,
    couponFixed,
    original: { settings: original },
  };
  saveWorld(world);
  await admin.dispose();
}

function coupon(
  code: string,
  type: 'PERCENTAGE' | 'FIXED',
  amount: number,
  minimumOrderAmount: number,
) {
  return {
    code,
    type,
    amount,
    minimumOrderAmount,
    usageLimit: null,
    expiresAt: null,
    isActive: true,
  };
}

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] ?? '' }),
});

const categories = [
  { slug: 'chicken', nameEn: 'Chicken', sortOrder: 1 },
  { slug: 'beef-mutton', nameEn: 'Beef & Mutton', sortOrder: 2 },
  { slug: 'bread', nameEn: 'Bread', sortOrder: 3 },
  { slug: 'drinks', nameEn: 'Drinks', sortOrder: 4 },
];

const products = [
  {
    slug: 'chicken-tikka',
    nameEn: 'Chicken Tikka',
    category: 'chicken',
    price: 350,
    popular: true,
  },
  { slug: 'malai-boti', nameEn: 'Malai Boti', category: 'chicken', price: 380, popular: true },
  {
    slug: 'seekh-kabab',
    nameEn: 'Seekh Kabab',
    category: 'beef-mutton',
    price: 320,
    popular: false,
  },
  {
    slug: 'mutton-chops',
    nameEn: 'Mutton Chops',
    category: 'beef-mutton',
    price: 950,
    popular: false,
  },
  { slug: 'naan', nameEn: 'Naan', category: 'bread', price: 30, popular: false },
  { slug: 'cold-drink', nameEn: 'Cold Drink', category: 'drinks', price: 90, popular: false },
];

/** Portion choices, add-ons and one deal, so the menu and product pages have real options. */
async function seedOptionsAndDeals() {
  const tikka = await prisma.product.findUnique({ where: { slug: 'chicken-tikka' } });
  const boti = await prisma.product.findUnique({ where: { slug: 'malai-boti' } });
  const naan = await prisma.product.findUnique({ where: { slug: 'naan' } });
  const drink = await prisma.product.findUnique({ where: { slug: 'cold-drink' } });
  if (!tikka || !boti || !naan || !drink) return;

  const hasVariants = await prisma.productVariantGroup.count({ where: { productId: tikka.id } });
  if (hasVariants === 0) {
    await prisma.productVariantGroup.create({
      data: {
        productId: tikka.id,
        nameEn: 'Portion',
        isRequired: true,
        variants: {
          create: [
            { nameEn: 'Quarter', priceModifier: 0, sortOrder: 1 },
            { nameEn: 'Half', priceModifier: 330, sortOrder: 2 },
            { nameEn: 'Full', priceModifier: 650, sortOrder: 3 },
          ],
        },
      },
    });
  }

  if ((await prisma.addon.count()) === 0) {
    const addons = await Promise.all(
      [
        { nameEn: 'Raita', price: 50 },
        { nameEn: 'Mint chutney', price: 30 },
        { nameEn: 'Extra naan', price: 30 },
      ].map((addon) => prisma.addon.create({ data: addon })),
    );
    for (const product of [tikka, boti]) {
      await prisma.productAddon.createMany({
        data: addons.map((addon) => ({ productId: product.id, addonId: addon.id })),
      });
    }
  }

  const deal = await prisma.deal.findUnique({ where: { slug: 'family-platter' } });
  if (!deal) {
    await prisma.deal.create({
      data: {
        slug: 'family-platter',
        nameEn: 'Family Platter',
        descriptionEn: 'Tikka, malai boti, fresh naan and drinks for the whole table.',
        price: 1350,
        isFeatured: true,
        items: {
          create: [
            { productId: tikka.id, quantity: 2 },
            { productId: boti.id, quantity: 1 },
            { productId: naan.id, quantity: 4 },
            { productId: drink.id, quantity: 4 },
          ],
        },
      },
    });
  }
}

async function main() {
  const categoryIds = new Map<string, string>();
  for (const c of categories) {
    const row = await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
    categoryIds.set(c.slug, row.id);
  }

  for (const p of products) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) continue;
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        nameEn: p.nameEn,
        categoryId,
        basePrice: p.price,
        isPopular: p.popular,
        isFeatured: p.popular,
      },
    });
  }

  await seedOptionsAndDeals();

  // 18:00 -> 02:00 every day (closing time earlier than opening = after midnight).
  for (let day = 0; day < 7; day++) {
    await prisma.businessHour.upsert({
      where: { dayOfWeek: day },
      update: {},
      create: { dayOfWeek: day, openTime: '18:00', closeTime: '02:00' },
    });
  }

  const zoneCount = await prisma.deliveryZone.count();
  if (zoneCount === 0) {
    await prisma.deliveryZone.createMany({
      data: [
        { name: 'Township', charge: 0, freeDeliveryAbove: null, sortOrder: 1 },
        { name: 'Johar Town', charge: 100, freeDeliveryAbove: 2000, sortOrder: 2 },
        { name: 'Model Town', charge: 150, freeDeliveryAbove: 2500, sortOrder: 3 },
      ],
    });
  }

  await prisma.setting.upsert({
    where: { key: 'restaurant' },
    update: {},
    create: {
      key: 'restaurant',
      group: 'general',
      value: {
        name: 'BBQ Store',
        address: '441-2-D1 Township, Lahore',
        timezone: 'Asia/Karachi',
        taxRatePercent: 0,
        orderingEnabled: true,
      },
    },
  });

  // Demo staff/admin accounts for local development only.
  const demoPassword = process.env['SEED_DEMO_PASSWORD'] ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  for (const user of [
    { email: 'admin@bbqstore.local', role: 'ADMIN' as const },
    { email: 'staff@bbqstore.local', role: 'STORE_STAFF' as const },
  ]) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash, emailVerified: true },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

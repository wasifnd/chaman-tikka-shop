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

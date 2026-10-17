import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

export interface TestDatabase {
  prisma: PrismaClient;
  schema: string;
  ids: {
    tikka: string;
    half: string;
    quarter: string;
    raita: string;
    naan: string;
    deal: string;
    zone: string;
    customer: string;
    category: string;
  };
  drop(): Promise<void>;
}

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');

/**
 * Builds a private schema inside the given database, applies the real migrations to it and seeds
 * a small menu. Tests run against that schema and drop it afterwards, so they never touch the
 * data in the `public` schema, even on a shared development database.
 */
export async function createTestDatabase(url: string): Promise<TestDatabase> {
  const schema = `itest_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const name of migrations) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
      // One batch: the schema is switched only for this transaction, which also works through
      // connection poolers that don't keep session settings.
      await admin
        .query(`BEGIN; SET LOCAL search_path TO "${schema}"; ${sql}\nCOMMIT;`)
        .catch(async (error: unknown) => {
          await admin.query('ROLLBACK');
          throw error;
        });
    }
  } catch (error) {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    throw error;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 10 }, { schema }),
  });

  const category = await prisma.category.create({ data: { slug: 'main', nameEn: 'Main' } });
  const tikka = await prisma.product.create({
    data: {
      slug: 'chicken-tikka',
      nameEn: 'Chicken Tikka',
      categoryId: category.id,
      basePrice: 350,
      preparationTime: 20,
      variantGroups: {
        create: {
          nameEn: 'Portion',
          isRequired: true,
          variants: {
            create: [
              { nameEn: 'Quarter', priceModifier: 0, sortOrder: 1 },
              { nameEn: 'Half', priceModifier: 330, sortOrder: 2 },
            ],
          },
        },
      },
    },
    include: { variantGroups: { include: { variants: true } } },
  });
  const naan = await prisma.product.create({
    data: {
      slug: 'naan',
      nameEn: 'Naan',
      categoryId: category.id,
      basePrice: 30,
      preparationTime: 8,
    },
  });
  const raita = await prisma.addon.create({ data: { nameEn: 'Raita', price: 50 } });
  await prisma.productAddon.create({ data: { productId: tikka.id, addonId: raita.id } });

  const deal = await prisma.deal.create({
    data: {
      slug: 'family-platter',
      nameEn: 'Family Platter',
      price: 1350,
      items: {
        create: [
          { productId: tikka.id, quantity: 2 },
          { productId: naan.id, quantity: 4 },
        ],
      },
    },
  });
  const zone = await prisma.deliveryZone.create({
    data: { name: 'Johar Town', charge: 100, freeDeliveryAbove: 2000 },
  });

  for (let day = 0; day < 7; day++) {
    await prisma.businessHour.create({
      data: { dayOfWeek: day, openTime: '18:00', closeTime: '02:00' },
    });
  }
  await prisma.setting.create({
    data: { key: 'restaurant', value: { taxRatePercent: 0, orderingEnabled: true } },
  });

  const user = await prisma.user.create({
    data: {
      email: 'customer@example.com',
      passwordHash: 'not-a-real-hash',
      customer: { create: { name: 'Test Customer' } },
    },
    include: { customer: true },
  });

  const variants = tikka.variantGroups[0]?.variants ?? [];
  const idOf = (name: string) => variants.find((v) => v.nameEn === name)?.id ?? '';

  return {
    prisma,
    schema,
    ids: {
      tikka: tikka.id,
      half: idOf('Half'),
      quarter: idOf('Quarter'),
      raita: raita.id,
      naan: naan.id,
      deal: deal.id,
      zone: zone.id,
      customer: user.customer?.id ?? '',
      category: category.id,
    },
    async drop() {
      await prisma.$disconnect();
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    },
  };
}

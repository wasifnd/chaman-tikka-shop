import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations use the direct (non-pooled) Neon URL; the app runtime uses DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // `||` (not `??`) so a blank DIRECT_URL in .env falls back to DATABASE_URL.
  datasource: { url: process.env['DIRECT_URL'] || process.env['DATABASE_URL'] || '' },
});

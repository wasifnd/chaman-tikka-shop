import { defineConfig } from '@playwright/test';

/**
 * End-to-end scenarios that drive the running site over HTTP, one role at a time (guest,
 * customer, store staff, admin). They need no browser: they call the same endpoints the pages
 * call, with real cookies, against a real database.
 *
 *   npm run build && npm start        (or: npm run dev)
 *   E2E_BASE_URL=http://localhost:3000 npm run e2e
 *
 * They create their own menu items, areas and coupons, and put everything back afterwards, so a
 * run can be repeated safely. Run them against a development or CI database, never production.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  // One scenario at a time: they share one restaurant, and orders are numbered in sequence.
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000' },
});

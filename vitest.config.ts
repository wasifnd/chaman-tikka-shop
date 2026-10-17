import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/app/**', // routes are covered by Playwright; logic lives in src/features + src/lib
        'src/**/types/**',
        'src/lib/prisma/**', // thin client wiring; exercised by DB integration tests
      ],
      // Merge blocker: CI fails below these numbers.
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});

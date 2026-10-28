import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'web/src/**/*.test.ts', 'supabase/**/*.test.ts'],
    // The database tests boot an in-process Postgres; give them room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

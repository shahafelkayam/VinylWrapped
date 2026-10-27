import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'scripts/**/*.test.ts', 'web/src/**/*.test.ts'],
  },
});

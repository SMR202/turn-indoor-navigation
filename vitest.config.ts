import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'tooling/**/*.test.ts',
      'apps/mobile/src/sensors/**/*.test.ts',
    ],
  },
});

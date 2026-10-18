import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'tooling/**/*.test.ts',
      'apps/api/**/*.test.ts',
      'apps/mobile/src/sensors/**/*.test.ts',
      'apps/mobile/src/navigation/**/*.test.ts',
      'apps/mobile/src/fingerprinting/**/*.test.ts',
    ],
  },
});

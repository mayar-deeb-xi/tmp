import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // config/env.ts exits without DATABASE_URL; tests never connect to it (see src/test/fake-db.ts).
    env: { DATABASE_URL: 'postgres://test:test@localhost:5432/test' },
    mockReset: true,
  },
});

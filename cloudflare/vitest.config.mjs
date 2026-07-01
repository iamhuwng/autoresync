import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          UPLOAD_GRANT_SECRET: 'TEST_ONLY_NOT_A_SECRET',
        },
      },
    }),
  ],
  test: {
    include: ['__tests__/**/*.test.js', 'test/**/*.test.ts'],
  },
});

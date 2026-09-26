import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      main: './test/fixtures/notification-rpc-worker.js',
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        durableObjects: {
          NOTIFICATION_RETRY_EXECUTOR: { className: 'NotificationRetryExecutor', useSQLite: true },
        },
        bindings: {
          UPLOAD_GRANT_SECRET: 'TEST_ONLY_NOT_A_SECRET',
        },
      },
    }),
  ],
  test: {
    include: ['__tests__/**/*.test.js', 'test/**/*.test.ts'],
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['pdf-lib', 'pako', '@pdf-lib/standard-fonts', '@pdf-lib/upng'],
        },
      },
    },
  },
});

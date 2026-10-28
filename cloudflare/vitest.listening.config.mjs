import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: false,
    miniflare: { compatibilityDate: '2026-06-24', compatibilityFlags: ['nodejs_compat'], r2Buckets: ['R2_BUCKET'],
      bindings: { UPLOAD_GRANT_SECRET: 'TEST_ONLY_NOT_A_SECRET' } },
  })],
  test: { include: ['test/listening-*.test.ts'], fileParallelism: false, maxWorkers: 1 },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./test/fixtures/cloudflare-workers-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['cloudflare/test/prd0062-m1-rule-enforced-composition.emulator.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

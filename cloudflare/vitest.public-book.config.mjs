import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { 'cloudflare:workers': fileURLToPath(new URL('./test/fixtures/cloudflare-workers-stub.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['test/public-book-production.test.ts'], fileParallelism: false, maxWorkers: 1 },
});

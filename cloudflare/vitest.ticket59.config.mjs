import { fileURLToPath } from 'node:url';

export default {
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./test/fixtures/cloudflare-workers-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: [
      'test/book-route-manifest.test.ts',
      'test/book-router.test.ts',
      'test/book-worker-integration.test.ts',
    ],
  },
};

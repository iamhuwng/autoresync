import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/book-source-document-delivery-worker.test.ts',
      'test/book-document-authorization.test.ts',
      'test/book-source-backblaze-b2-source-provider.test.ts',
      'test/book-source-backblaze-b2-provider-wiring.test.ts',
      'test/book-source-r2-quarantine.test.ts',
    ],
  },
});

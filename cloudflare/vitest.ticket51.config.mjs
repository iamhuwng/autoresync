import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/book-document-authorization.test.ts',
      'test/book-delivery-worker.test.ts',
      'test/book-delivery-repository.test.ts',
    ],
  },
});

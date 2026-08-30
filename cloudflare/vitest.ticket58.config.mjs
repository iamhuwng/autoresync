import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/book-assembly-preview-worker.test.ts',
      'test/book-assembly-worker.test.ts',
      'test/book-source-backblaze-b2-source-provider.test.ts',
      'test/book-source-document-composition.test.ts',
      'test/book-teacher-assembly-authority.test.ts',
      'test/book-teacher-assembly-preview-worker.test.ts',
    ],
  },
});

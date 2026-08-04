import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/book-teacher-assembly-authority.test.ts',
      'test/book-teacher-assembly-preview-worker.test.ts',
    ],
  },
});

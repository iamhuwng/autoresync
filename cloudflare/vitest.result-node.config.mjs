import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/book-results-production-projection.test.ts',
      'test/book-results-production-projection-concurrency.test.ts',
      'test/book-results-production-read.test.ts',
      'test/book-results-worker.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
  },
});

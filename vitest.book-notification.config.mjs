import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'cloudflare/test/book-notification-emitter.test.ts',
      'cloudflare/test/book-notification-post-commit.test.ts',
      'cloudflare/test/notification-command-worker.test.ts',
    ],
  },
});

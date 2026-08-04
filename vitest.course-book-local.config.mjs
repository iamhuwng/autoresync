import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'cloudflare/test/course-book-*.test.ts',
      'cloudflare/test/rtdb-multi-location-patch.test.ts',
      'src/services/book-delivery/courseBook*.test.ts',
    ],
  },
});

import { defineConfig } from 'vitest/config';

/**
 * Provider-neutral control tests do not need Miniflare/workerd. Keeping this
 * harness separate also prevents local native Worker binaries from becoming
 * part of Ticket 06A's metadata-only acceptance.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/book-source-control-{host,worker}.test.ts'],
  },
});

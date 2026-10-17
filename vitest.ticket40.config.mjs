import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'src/components/book-runtime/interactions/long-response/**/*.test.{ts,tsx}',
      'src/services/book-activity/runtime/codecs/longResponseResponseCodec.test.ts',
      'src/services/book-activity/runtime/registrations/activityRendererRegistrations.test.ts',
      'src/services/book-activity/runtime/activityRendererManifest.test.ts',
      'src/services/book-activity/runtime/activityRendererRegistry.test.tsx',
    ],
  },
});

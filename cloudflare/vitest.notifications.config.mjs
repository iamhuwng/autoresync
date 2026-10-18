import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: false,
    wrangler: { configPath: './wrangler.notifications.jsonc' },
    // The locked local workerd predates the deployed compatibility date.
    miniflare: { compatibilityDate: '2026-06-24' },
  })],
  test: {
    include: [
      'test/notification-public-entry.test.ts',
      'test/notification-release-homework.test.ts',
      'test/homework-notification.test.ts',
      'test/homework-result-authority.test.ts',
      'test/notification-firestore-bridge.test.ts',
      'test/course-enrollment-approval-route.test.ts',
      'test/course-enrollment-authority.test.ts',
      'test/homework-submission-notification-worker.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
  },
});

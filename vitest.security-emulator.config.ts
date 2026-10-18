import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/__tests__/security/notificationFirebaseRules.emulator.test.ts',
      'src/__tests__/security/student-private-thcs-homework-current-rules.emulator.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});

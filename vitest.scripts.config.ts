import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/__tests__/**/*.{test,spec}.{js,mjs,ts}'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      'scripts/__tests__/branch-doctor.test.mjs',
      'scripts/__tests__/check-assessment-unification-guardrails.test.mjs',
      'scripts/__tests__/check-mantine-boundary.test.mjs',
      'scripts/__tests__/end-active-sessions.test.mjs',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/__tests__/**/*.{test,spec}.{js,mjs,ts}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
  },
});

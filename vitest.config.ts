import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const emulatorTestPattern = /[\\/].+\.emulator\.test\.(ts|tsx|js|jsx)$/u;
const isExplicitEmulatorTestRun = process.argv.some((arg) => emulatorTestPattern.test(arg));
const defaultExclude = ['node_modules', 'dist', '.idea', '.git', '.cache'];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 4,
    minWorkers: 1,
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.spec.ts',
        '**/*.test.tsx',
        '**/*.config.*',
      ],
    },
    include: [
      'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
      'scripts/**/*.{test,spec}.{ts,tsx,js,jsx}',
    ],
    exclude: [
      ...defaultExclude,
      ...(isExplicitEmulatorTestRun ? [] : ['src/**/*.emulator.test.{ts,tsx,js,jsx}']),
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
    },
  },
});

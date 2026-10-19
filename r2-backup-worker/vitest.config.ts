import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.{test,spec}.ts', '../functions/src/readingV2SubmitCore.test.ts'],
        exclude: ['node_modules', 'dist', '.wrangler'],
    },
});

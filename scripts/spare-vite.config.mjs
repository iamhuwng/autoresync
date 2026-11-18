import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  envDir: false,
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
    esbuildOptions: { supported: { 'top-level-await': true } },
  },
  build: {
    minify: 'terser',
    terserOptions: { maxWorkers: 1, compress: { drop_debugger: true } },
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/database', 'firebase/auth'],
          'chart-vendor': ['recharts'],
        },
      },
    },
  },
});

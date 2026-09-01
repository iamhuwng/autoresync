import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBookSourcePreviewCsp } from './src/services/book-source-delivery/sourceUpload.browserPolicy';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedEnvDir = path.resolve(
  process.env.LUYENTAP_ENV_DIR || path.join(os.homedir(), '.luyentap', 'env'),
);
const sharedEnvFiles = ['.env', '.env.local', '.env.development', '.env.development.local'];
const envDir = sharedEnvFiles.some((name) => fs.existsSync(path.join(sharedEnvDir, name)))
  ? sharedEnvDir
  : repoRoot;
const enableBundleVisualizer = process.env.VITE_BUNDLE_ANALYZE === 'true';

const bookSourcePreviewCsp = createBookSourcePreviewCsp(process.env);

// https://vitejs.dev/config/
export default defineConfig({
  // Keep machine-local secrets/config outside Git worktrees so every checkout loads the same values.
  envDir,
  // IMPORTANT: Fixed port for OAuth compatibility with Google Drive
  // The OAuth credentials in Google Cloud Console must include this exact origin
  // If you get 403 errors, ensure http://localhost:5173 is in your authorized origins
  server: {
    port: 5173,
    strictPort: true, // Fail if port is occupied rather than auto-switching
  },
  preview: {
    port: 5173,
    ...(bookSourcePreviewCsp
      ? {
          headers: {
            'Content-Security-Policy': bookSourcePreviewCsp,
          },
        }
      : {}),
  },
  resolve: {
    alias: {
      '@': path.resolve(repoRoot, './src'),
    },
  },
  plugins: [
    react(),
    ...(enableBundleVisualizer
      ? [visualizer({
          filename: './dist/stats.html',
          open: false,
          gzipSize: true,
          brotliSize: true,
        })]
      : []),
  ],
  experimental: {},
  optimizeDeps: {
    include: ['pdfjs-dist'],
    esbuildOptions: {
      // Needed for pdfjs-dist worker
      supported: {
        'top-level-await': true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React and React-DOM into separate chunk
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Split Firebase
          'firebase-vendor': ['firebase/app', 'firebase/database', 'firebase/auth'],
          // Split chart libraries
          'chart-vendor': ['recharts'],
        },
      },
    },
    // Increase chunk size warning limit to 600KB (from default 500KB)
    chunkSizeWarningLimit: 600,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // KEEP console.log for debugging (was: true)
        drop_debugger: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    exclude: ['**/node_modules/**', '**/tests/**'],
    define: {
      'process.env.NODE_ENV': JSON.stringify('test'),
    },
    server: {
      deps: {
        inline: ['@mantine/hooks', '@mantine/core']
      }
    }
  },
});

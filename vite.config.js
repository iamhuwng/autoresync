import { defineConfig, loadEnv } from 'vite';
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
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const providerKeys = Object.keys({ ...env, ...process.env }).filter((key) =>
    /^VITE_(?:GROQ|GEMINI)_API_KEY(?:_\d+)?$/.test(key) || /^VITE_GOOGLE_API_KEY(?:_\d+)?$/.test(key),
  );
  if (providerKeys.some((key) => env[key] || process.env[key])) {
    throw new Error(`Provider API keys cannot be embedded in the browser bundle: ${providerKeys.join(', ')}`);
  }

  if (mode === 'production') {
    const readingV2RolloutMode = process.env.VITE_READING_V2_ROLLOUT_MODE || env.VITE_READING_V2_ROLLOUT_MODE;
    if (!['off', 'internal-only', 'teacher-preview', 'public'].includes(readingV2RolloutMode)) {
      throw new Error('Production builds require an explicit VITE_READING_V2_ROLLOUT_MODE.');
    }
    if (readingV2RolloutMode === 'teacher-preview' || readingV2RolloutMode === 'public') {
      const submissionEndpoint = process.env.VITE_READING_V2_SUBMISSION_ENDPOINT || env.VITE_READING_V2_SUBMISSION_ENDPOINT;
      try {
        if (new URL(submissionEndpoint || '').protocol !== 'https:') throw new Error();
      } catch {
        throw new Error('Production Reading V2 rollout requires an HTTPS VITE_READING_V2_SUBMISSION_ENDPOINT.');
      }
    }

    const backupWorkerUrl = process.env.VITE_BACKUP_WORKER_URL || env.VITE_BACKUP_WORKER_URL;
    try {
      const parsed = new URL(backupWorkerUrl || '');
      if (parsed.protocol !== 'https:' || parsed.href !== `${parsed.origin}/`) throw new Error();
    } catch {
      throw new Error('Production homework assignment requires VITE_BACKUP_WORKER_URL as an exact HTTPS origin.');
    }

    const databaseUrl = process.env.VITE_FIREBASE_DATABASE_URL || env.VITE_FIREBASE_DATABASE_URL;
    try {
      const parsed = new URL(databaseUrl || '');
      const hostname = parsed.hostname.toLowerCase();
      if (parsed.protocol !== 'https:'
        || !(hostname.endsWith('.firebaseio.com') || hostname.endsWith('.firebasedatabase.app'))) {
        throw new Error();
      }
    } catch {
      throw new Error('Production builds require VITE_FIREBASE_DATABASE_URL for a Firebase RTDB host.');
    }

    const workerUrl = process.env.VITE_THCS_GEMMA_WORKER_URL || env.VITE_THCS_GEMMA_WORKER_URL;
    try {
      const parsed = new URL(workerUrl || '');
      if (
        parsed.protocol !== 'https:'
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash
      ) throw new Error();
    } catch {
      throw new Error('Production builds require VITE_THCS_GEMMA_WORKER_URL as an exact HTTPS origin.');
    }
  }

  const publicEnv = loadEnv(mode, envDir, 'VITE_');
  const bookEnv = {
    ...loadEnv(mode, sharedEnvDir, 'VITE_BOOK_'),
    ...loadEnv(mode, repoRoot, 'VITE_BOOK_'),
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.startsWith('VITE_BOOK_')),
    ),
  };
  const bookEnvDefinitions = Object.fromEntries(
    Object.entries(bookEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );
  const enableBundleVisualizer = process.env.VITE_BUNDLE_ANALYZE === 'true';
  const bookSourcePreviewCsp = createBookSourcePreviewCsp({ ...publicEnv, ...process.env, ...bookEnv });

  return {
    // Keep machine-local secrets/config outside Git worktrees so every checkout loads the same values.
    envDir,
    define: bookEnvDefinitions,
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
  };
});

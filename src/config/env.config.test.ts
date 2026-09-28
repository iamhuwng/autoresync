import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const getActiveKeyIds = vi.hoisted(() => vi.fn());
vi.mock('../services/api-keys.service', () => ({ getActiveKeyIds }));

const firebaseEnv = {
  VITE_FIREBASE_API_KEY: 'firebase-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://demo.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abc123',
};

beforeEach(() => {
  for (const [key, value] of Object.entries(firebaseEnv)) vi.stubEnv(key, value);
  getActiveKeyIds.mockResolvedValue(['worker-key-id']);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('loads opaque Gemini key IDs from the Worker inventory', async () => {
  const { loadAllGeminiApiKeys, loadEnv } = await import('./env.config');
  expect(loadEnv()).toEqual(firebaseEnv);
  await expect(loadAllGeminiApiKeys()).resolves.toEqual(['worker-key-id']);
  expect(getActiveKeyIds).toHaveBeenCalledWith('gemini');
});

it('does not accept provider keys from Vite environment variables', async () => {
  vi.stubEnv('VITE_GEMINI_API_KEY_1', 'browser-exposed-key');
  vi.stubEnv('VITE_GROQ_API_KEY', 'browser-exposed-groq-key');
  vi.stubEnv('VITE_GOOGLE_API_KEY', 'browser-exposed-google-key');
  const { loadEnv } = await import('./env.config');
  expect(loadEnv()).not.toHaveProperty('VITE_GEMINI_API_KEY_1');
  expect(loadEnv()).not.toHaveProperty('VITE_GROQ_API_KEY');
  expect(loadEnv()).not.toHaveProperty('VITE_GOOGLE_API_KEY');
});

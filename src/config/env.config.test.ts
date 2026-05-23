import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api-keys.service', () => ({
  getDecryptedKeys: vi.fn(() => Promise.resolve([])),
}));

const baseEnv = {
  VITE_FIREBASE_API_KEY: 'firebase-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://demo.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-project',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abc123',
  VITE_GEMINI_API_KEY_1: '',
  VITE_GEMINI_API_KEY_2: '',
  VITE_GEMINI_API_KEY_3: '',
  VITE_GEMINI_API_KEY_4: '',
  VITE_GEMINI_API_KEY_5: '',
  VITE_GOOGLE_API_KEY: '',
  VITE_GOOGLE_DRIVE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
};

function stubBaseEnv() {
  for (const [key, value] of Object.entries(baseEnv)) {
    vi.stubEnv(key, value);
  }
}

async function loadConfigModule() {
  vi.resetModules();
  return import('./env.config');
}

describe('env.config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    stubBaseEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('ignores VITE_GOOGLE_API_KEY when loading Gemini keys', async () => {
    vi.stubEnv('VITE_GOOGLE_API_KEY', 'legacy-key');
    vi.stubEnv('VITE_GEMINI_API_KEY_1', 'env-key-1');

    const { getDecryptedKeys } = await import('../services/api-keys.service');
    vi.mocked(getDecryptedKeys).mockResolvedValue(['firestore-key', 'env-key-1']);

    const { loadAllGeminiApiKeys } = await loadConfigModule();
    const keys = await loadAllGeminiApiKeys();

    expect(keys).toEqual(['env-key-1', 'firestore-key']);
  });

  it('requires numbered Gemini keys even when only the legacy key is present', async () => {
    vi.stubEnv('VITE_GOOGLE_API_KEY', 'legacy-key');

    const { loadEnv } = await loadConfigModule();

    expect(() => loadEnv()).toThrow(/VITE_GEMINI_API_KEY_1-5/);
  });

  it('preserves numbered Groq key slots for shared provider rotation', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY_1', 'env-key-1');
    vi.stubEnv('VITE_GROQ_API_KEY_1', 'groq-slot-1');
    vi.stubEnv('VITE_GROQ_API_KEY_5', 'groq-slot-5');

    const { getEnv } = await loadConfigModule();

    expect(getEnv().VITE_GROQ_API_KEY_1).toBe('groq-slot-1');
    expect(getEnv().VITE_GROQ_API_KEY_5).toBe('groq-slot-5');
  });
});

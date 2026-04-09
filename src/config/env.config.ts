import { z } from 'zod';
import { getDecryptedKeys } from '../services/api-keys.service';

/**
 * Environment variable schema
 * Validates all required config at startup
 * 
 * CRITICAL: Must support all environment variables from current wizard.
 */
const envSchema = z.object({
  // Firebase (required - 7 variables)
  VITE_FIREBASE_API_KEY: z.string().min(1, 'Firebase API key required'),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1, 'Firebase auth domain required'),
  VITE_FIREBASE_DATABASE_URL: z.string().url('Invalid Firebase database URL'),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1, 'Firebase project ID required'),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1, 'Firebase storage bucket required'),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1, 'Firebase messaging sender ID required'),
  VITE_FIREBASE_APP_ID: z.string().min(1, 'Firebase app ID required'),

  // Google Gemini AI (at least one key required)
  VITE_GEMINI_API_KEY_1: z.string().optional(),
  VITE_GEMINI_API_KEY_2: z.string().optional(),
  VITE_GEMINI_API_KEY_3: z.string().optional(),
  VITE_GEMINI_API_KEY_4: z.string().optional(),
  VITE_GEMINI_API_KEY_5: z.string().optional(),

  // Google Drive OAuth (required for image upload)
  VITE_GOOGLE_DRIVE_CLIENT_ID: z.string().min(1, 'Google Drive client ID required'),

  // Groq fallback (optional)
  VITE_GROQ_API_KEY: z.string().optional(),

  // Chunking configuration
  VITE_CHUNK_SIZE: z.string().default('1000'),
  VITE_CHUNK_OVERLAP: z.string().default('50'),
  VITE_MAX_DOCUMENT_SIZE: z.string().default('10000'),
}).refine(
  (data) => {
    // At least one Gemini API key must be provided
    return [
      data.VITE_GEMINI_API_KEY_1,
      data.VITE_GEMINI_API_KEY_2,
      data.VITE_GEMINI_API_KEY_3,
      data.VITE_GEMINI_API_KEY_4,
      data.VITE_GEMINI_API_KEY_5,
    ].some(key => !!key);
  },
  {
    message: 'At least one Gemini API key required (VITE_GEMINI_API_KEY_1-5)',
  }
);

/**
 * Validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Load and validate environment configuration
 * @throws {Error} if validation fails
 */
export const loadEnv = (): Env => {
  const rawEnv = {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_DATABASE_URL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_GEMINI_API_KEY_1: import.meta.env.VITE_GEMINI_API_KEY_1,
    VITE_GEMINI_API_KEY_2: import.meta.env.VITE_GEMINI_API_KEY_2,
    VITE_GEMINI_API_KEY_3: import.meta.env.VITE_GEMINI_API_KEY_3,
    VITE_GEMINI_API_KEY_4: import.meta.env.VITE_GEMINI_API_KEY_4,
    VITE_GEMINI_API_KEY_5: import.meta.env.VITE_GEMINI_API_KEY_5,
    VITE_GOOGLE_DRIVE_CLIENT_ID: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID,
    VITE_GROQ_API_KEY: import.meta.env.VITE_GROQ_API_KEY,
    VITE_CHUNK_SIZE: import.meta.env.VITE_CHUNK_SIZE,
    VITE_CHUNK_OVERLAP: import.meta.env.VITE_CHUNK_OVERLAP,
    VITE_MAX_DOCUMENT_SIZE: import.meta.env.VITE_MAX_DOCUMENT_SIZE,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `❌ Environment configuration error:\n\n${errors}\n\n` +
      `Create a .env file at the project root with these variables.\n` +
      `See env.example.txt for reference.`
    );
  }

  return result.data;
};

/**
 * Singleton instance
 */
let cachedEnv: Env | null = null;

export const getEnv = (): Env => {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
};

/**
 * Get chunking configuration
 */
export const getChunkConfig = () => {
  const env = getEnv();
  return {
    chunkSize: parseInt(env.VITE_CHUNK_SIZE),
    chunkOverlap: parseInt(env.VITE_CHUNK_OVERLAP),
    maxDocumentSize: parseInt(env.VITE_MAX_DOCUMENT_SIZE),
  };
};

/**
 * Load all Gemini API keys (with rotation support)
 */
export const loadAllGeminiApiKeys = async (): Promise<string[]> => {
  const env = getEnv();
  const keys: string[] = [];

  // Load keys from VITE_GEMINI_API_KEY_1 through VITE_GEMINI_API_KEY_5
  for (let i = 1; i <= 5; i++) {
    const key = env[`VITE_GEMINI_API_KEY_${i}` as keyof Env] as string | undefined;
    if (key && key.trim().length > 0 && !key.includes('your_')) {
      keys.push(key);
    }
  }

  // Load from Firestore (encrypted keys)
  try {
    const firestoreKeys = await getDecryptedKeys('gemini');
    for (const key of firestoreKeys) {
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }
  } catch (error) {
    console.warn('[Gemini] Failed to load Firestore keys:', error);
  }

  return keys;
};

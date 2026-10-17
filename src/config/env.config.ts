import { z } from 'zod';
import { getActiveKeyIds } from '../services/api-keys.service';

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

});

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
 * Load all Gemini API keys (with rotation support)
 */
export const loadAllGeminiApiKeys = (): Promise<string[]> => getActiveKeyIds('gemini');

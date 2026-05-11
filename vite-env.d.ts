/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_DATABASE_URL: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;

  // Google Gemini AI
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY_1?: string;
  readonly VITE_GEMINI_API_KEY_2?: string;
  readonly VITE_GEMINI_API_KEY_3?: string;
  readonly VITE_GEMINI_API_KEY_4?: string;
  readonly VITE_GEMINI_API_KEY_5?: string;

  // Google Drive
  readonly VITE_GOOGLE_DRIVE_CLIENT_ID: string;

  // Groq
  readonly VITE_GROQ_API_KEY?: string;

  // Admin
  readonly VITE_ADMIN_USERNAME?: string;
  readonly VITE_ADMIN_PASSWORD?: string;

  // Reading V2 rollout controls
  readonly VITE_READING_V2_ROLLOUT_MODE?: string;
  readonly VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY?: string;
  readonly VITE_READING_V2_SUBMISSION_ENDPOINT?: string;
  readonly VITE_READING_V2_SUBMISSION_EMULATOR_ORIGIN?: string;
  readonly VITE_LIBRARY_DIAGNOSTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.jsx' {
  import type { ComponentType } from 'react';

  const Component: ComponentType<Record<string, unknown>>;
  export default Component;
  export const ThemeProvider: ComponentType<Record<string, unknown>>;
}

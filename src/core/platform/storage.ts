/**
 * Platform Storage Abstraction
 *
 * Provides a unified async storage API that works across:
 * - Web (localStorage / sessionStorage)
 * - React Native (AsyncStorage) — swap implementation later
 * - Capacitor (@capacitor/preferences) — swap implementation later
 *
 * IMPORTANT: All methods are async to maintain compatibility with mobile
 * storage APIs which are inherently asynchronous.
 *
 * @see documentation/rules/mobile-portability.md — Rule 18
 */

// ─── Persistent Storage (survives app close) ────────────────────────

export const storage = {
  /**
   * Get a value from persistent storage.
   * Returns null if key doesn't exist.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      // If JSON.parse fails, return raw string value
      return localStorage.getItem(key) as unknown as T;
    }
  },

  /**
   * Get raw string value without JSON parsing.
   */
  async getString(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },

  /**
   * Set a value in persistent storage.
   * Objects/arrays are automatically JSON-serialized.
   */
  async set(key: string, value: unknown): Promise<void> {
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  },

  /**
   * Remove a key from persistent storage.
   */
  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },

  /**
   * Check if a key exists in persistent storage.
   */
  async has(key: string): Promise<boolean> {
    return localStorage.getItem(key) !== null;
  },

  /**
   * Clear all persistent storage.
   * Use with caution — this removes ALL stored data.
   */
  async clear(): Promise<void> {
    localStorage.clear();
  },
};

// ─── Session Storage (cleared when tab/app closes) ──────────────────

export const sessionStore = {
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return sessionStorage.getItem(key) as unknown as T;
    }
  },

  async getString(key: string): Promise<string | null> {
    return sessionStorage.getItem(key);
  },

  async set(key: string, value: unknown): Promise<void> {
    if (typeof value === 'string') {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  },

  async remove(key: string): Promise<void> {
    sessionStorage.removeItem(key);
  },

  async has(key: string): Promise<boolean> {
    return sessionStorage.getItem(key) !== null;
  },

  async clear(): Promise<void> {
    sessionStorage.clear();
  },
};

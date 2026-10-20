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
   * List keys in persistent storage, optionally filtered by prefix.
   */
  async keys(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
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

  async keys(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key) continue;
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  },

  async clear(): Promise<void> {
    sessionStorage.clear();
  },
};

/**
 * Small IndexedDB adapter for structured, device-local state.
 * Keep browser APIs in this platform boundary so callers stay portable.
 */
export const indexedDbStore = <T>(
  databaseName: string,
  storeName: string,
  version = 1,
  storeNames: readonly string[] = [storeName],
) => {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('indexeddb_unavailable'));
    }
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, version);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error ?? new Error('indexeddb_open_failed'));
      };
      request.onupgradeneeded = () => {
        for (const name of storeNames) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          databasePromise = null;
        };
        resolve(request.result);
      };
    });
    return databasePromise;
  };
  const request = <R>(operation: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> =>
    open().then((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      let result: IDBRequest<R>;
      try {
        result = operation(transaction.objectStore(storeName));
      } catch (error) {
        transaction.abort();
        reject(error);
        return;
      }
      transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb_transaction_aborted'));
      transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb_request_failed'));
      transaction.oncomplete = () => resolve(result.result);
    }));
  // Read and write in one transaction so concurrent tabs always patch the latest record.
  const update = async (key: IDBValidKey, updater: (current: T | null) => T | null): Promise<T | null> => (
    open().then((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      let next: T | null = null;
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const read = store.get(key);
      read.onerror = () => fail(read.error ?? new Error('indexeddb_request_failed'));
      read.onsuccess = () => {
        try {
          next = updater((read.result as T | undefined) ?? null);
          if (next === null) store.delete(key);
          else store.put(next, key);
        } catch (error) {
          try { transaction.abort(); } catch { /* transaction is already closing */ }
          fail(error);
        }
      };
      transaction.onerror = () => fail(transaction.error ?? new Error('indexeddb_request_failed'));
      transaction.onabort = () => fail(transaction.error ?? new Error('indexeddb_transaction_aborted'));
      transaction.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(next);
        }
      };
    }))
  );
  return {
    get: async (key: IDBValidKey): Promise<T | null> => (await request<T | undefined>((store) => store.get(key))) ?? null,
    set: async (key: IDBValidKey, value: T): Promise<void> => { await request((store) => store.put(value, key)); },
    update,
    remove: async (key: IDBValidKey): Promise<void> => { await request((store) => store.delete(key)); },
    keys: async (): Promise<IDBValidKey[]> => (await request<IDBValidKey[]>((store) => store.getAllKeys())) ?? [],
    clear: async (): Promise<void> => { await request((store) => store.clear()); },
  };
};

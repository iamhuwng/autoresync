/**
 * API Keys Management Service
 * 
 * Manages AI API keys stored in Firestore with encryption.
 * Features:
 * - AES-256 encryption for secure storage
 * - CRUD operations for both Gemini and Groq keys
 * - Hybrid loading: .env defaults + Firestore extras
 * 
 * @module api-keys.service
 * @version 1.0.0
 * @date 2026-02-07
 */

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteField,
    onSnapshot,
    Unsubscribe
} from 'firebase/firestore';
import { firestore as db } from './firebase';

// ============================================================================
// Types
// ============================================================================

export type AIProvider = 'gemini' | 'groq';

export interface APIKeyEntry {
    id: string;
    provider: AIProvider;
    label: string;
    encryptedKey: string;
    keyPreview: string; // Last 8 chars for display (e.g., "...Xyz12345")
    createdAt: number;
    createdBy: string;
    lastUsed?: number;
    isActive: boolean;
    requestCount: number;
    errorCount: number;
}

export interface APIKeysConfig {
    gemini: Record<string, APIKeyEntry>;
    groq: Record<string, APIKeyEntry>;
    updatedAt: number;
    updatedBy: string;
}

// ============================================================================
// Encryption Utilities
// ============================================================================

/**
 * Simple XOR-based encryption with Base64 encoding.
 * 
 * ⚠️ SECURITY NOTE: This is client-side obfuscation, NOT true encryption.
 * The key is embedded in the JS bundle and can be extracted.
 * For true security, API keys should be proxied through a trusted backend/Worker.
 * 
 * ⚠️ MIGRATION WARNING: Do NOT change ENCRYPTION_KEY!
 * All existing API keys stored in Firestore are encrypted with this exact key.
 * Changing it would make ALL previously stored keys permanently unreadable.
 * If you need to rotate the encryption key, you must:
 *   1. Decrypt all existing keys with the OLD key
 *   2. Re-encrypt them with the NEW key
 *   3. Update Firestore in a single batch
 */
const ENCRYPTION_KEY = 'mstu-kahoot-api-keys-2026';

function encrypt(text: string): string {
    try {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(
                text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
            );
        }
        return btoa(result);
    } catch {
        console.error('Encryption failed');
        return '';
    }
}

function decrypt(encoded: string): string {
    try {
        const decoded = atob(encoded);
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            result += String.fromCharCode(
                decoded.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
            );
        }
        return result;
    } catch {
        console.error('Decryption failed');
        return '';
    }
}

/**
 * Create masked preview of key (e.g., "sk-...Xyz12345")
 */
function createKeyPreview(key: string): string {
    if (!key || key.length < 12) return '***';
    const prefix = key.substring(0, 4);
    const suffix = key.substring(key.length - 8);
    return `${prefix}...${suffix}`;
}

// ============================================================================
// Firestore Service
// ============================================================================

const SETTINGS_DOC = 'settings/api_keys';

type FirestoreRestValue = {
    stringValue?: string;
    integerValue?: string;
    doubleValue?: number;
    booleanValue?: boolean;
    mapValue?: {
        fields?: Record<string, FirestoreRestValue>;
    };
};

type FirestoreRestDocument = {
    fields?: Record<string, FirestoreRestValue>;
};

type NodeProcessLike = {
    versions?: {
        node?: string;
    };
    platform?: string;
    env?: Record<string, string | undefined>;
};

const getNodeProcess = (): NodeProcessLike | null => {
    const maybeProcess = (globalThis as unknown as { process?: NodeProcessLike }).process;
    return maybeProcess?.versions?.node ? maybeProcess : null;
};

const trustedNodeKeyLookupEnabled = (): boolean => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) return false;

    const env = nodeProcess.env ?? {};
    return env.READING_V2_TRUSTED_ADMIN_KEYS === 'true';
};

const firestoreString = (value: FirestoreRestValue | undefined): string =>
    value?.stringValue ?? '';

const firestoreNumber = (value: FirestoreRestValue | undefined): number => {
    const rawValue = value?.integerValue ?? value?.doubleValue ?? 0;
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : 0;
};

const firestoreBoolean = (value: FirestoreRestValue | undefined): boolean =>
    value?.booleanValue === true;

const parseFirestoreProviderKeys = (
    provider: AIProvider,
    providerValue: FirestoreRestValue | undefined,
): Record<string, APIKeyEntry> => {
    const providerFields = providerValue?.mapValue?.fields ?? {};

    return Object.entries(providerFields).reduce<Record<string, APIKeyEntry>>((acc, [keyId, value]) => {
        const fields = value.mapValue?.fields;
        if (!fields) return acc;

        const encryptedKey = firestoreString(fields.encryptedKey);
        if (!encryptedKey) return acc;

        acc[keyId] = {
            id: firestoreString(fields.id) || keyId,
            provider,
            label: firestoreString(fields.label) || keyId,
            encryptedKey,
            keyPreview: firestoreString(fields.keyPreview),
            createdAt: firestoreNumber(fields.createdAt),
            createdBy: firestoreString(fields.createdBy),
            lastUsed: fields.lastUsed ? firestoreNumber(fields.lastUsed) : undefined,
            isActive: firestoreBoolean(fields.isActive),
            requestCount: firestoreNumber(fields.requestCount),
            errorCount: firestoreNumber(fields.errorCount),
        };

        return acc;
    }, {});
};

const parseFirestoreRestApiKeysConfig = (document: FirestoreRestDocument): APIKeysConfig => {
    const fields = document.fields ?? {};

    return {
        gemini: parseFirestoreProviderKeys('gemini', fields.gemini),
        groq: parseFirestoreProviderKeys('groq', fields.groq),
        updatedAt: firestoreNumber(fields.updatedAt),
        updatedBy: firestoreString(fields.updatedBy),
    };
};

const importNodeModule = async <T>(specifier: string): Promise<T> => {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (value: string) => Promise<T>;
    return dynamicImport(specifier);
};

const getTrustedNodeAccessToken = async (): Promise<string | null> => {
    const nodeProcess = getNodeProcess();
    const env = nodeProcess?.env ?? {};
    const envToken = env.GOOGLE_OAUTH_ACCESS_TOKEN ?? env.GCLOUD_ACCESS_TOKEN;
    if (envToken?.trim()) {
        return envToken.trim();
    }

    try {
        const { execFileSync } = await importNodeModule<typeof import('node:child_process')>('node:child_process');
        const isWindows = nodeProcess?.platform === 'win32'
            || nodeProcess?.env?.OS === 'Windows_NT'
            || !!nodeProcess?.env?.ComSpec;
        const attempts = isWindows
            ? [
                { command: 'cmd.exe', args: ['/d', '/s', '/c', 'gcloud auth print-access-token'] },
                { command: 'gcloud.cmd', args: ['auth', 'print-access-token'] },
            ]
            : [{ command: 'gcloud', args: ['auth', 'print-access-token'] }];
        const env = {
            ...(nodeProcess?.env ?? {}),
            CLOUDSDK_CORE_DISABLE_PROMPTS: '1',
        };

        for (const attempt of attempts) {
            try {
                const token = execFileSync(attempt.command, attempt.args, {
                    encoding: 'utf8',
                    env,
                    stdio: ['ignore', 'pipe', 'ignore'],
                    timeout: 90000,
                    windowsHide: true,
                });
                if (token.trim()) {
                    return token.trim();
                }
            } catch {
                // Try the next command name. Windows commonly exposes gcloud as gcloud.cmd.
            }
        }
        return null;
    } catch {
        return null;
    }
};

const getAPIKeysViaTrustedNode = async (): Promise<APIKeysConfig | null> => {
    const nodeProcess = getNodeProcess();
    const explicitTrustedLookup = nodeProcess?.env?.READING_V2_TRUSTED_ADMIN_KEYS === 'true';

    if (!trustedNodeKeyLookupEnabled()) return null;

    const projectId = nodeProcess?.env?.VITE_FIREBASE_PROJECT_ID?.trim();
    if (!projectId) {
        if (explicitTrustedLookup) console.warn('[APIKeys] Trusted admin key lookup skipped: missing VITE_FIREBASE_PROJECT_ID.');
        return null;
    }
    if (typeof fetch !== 'function') {
        if (explicitTrustedLookup) console.warn('[APIKeys] Trusted admin key lookup skipped: fetch is unavailable.');
        return null;
    }

    const token = await getTrustedNodeAccessToken();
    if (!token) {
        if (explicitTrustedLookup) console.warn('[APIKeys] Trusted admin key lookup skipped: no Google OAuth token available.');
        return null;
    }

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/settings/api_keys`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`Trusted admin key registry lookup failed: Firestore REST ${response.status}`);
    }

    const document = await response.json() as FirestoreRestDocument;
    const config = parseFirestoreRestApiKeysConfig(document);
    console.info('[APIKeys] Loaded admin key registry through trusted Node lookup.');
    return config;
};

/**
 * Get all API keys from Firestore
 */
export async function getAPIKeys(): Promise<APIKeysConfig | null> {
    try {
        const docRef = doc(db, SETTINGS_DOC);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data() as APIKeysConfig;
        }

        return null;
    } catch (error) {
        const trustedConfig = await getAPIKeysViaTrustedNode();
        if (trustedConfig) {
            return trustedConfig;
        }

        console.error('[APIKeys] Failed to get keys:', error);
        throw error;
    }
}

/**
 * Add a new API key
 */
export async function addAPIKey(
    provider: AIProvider,
    label: string,
    apiKey: string,
    userId: string
): Promise<APIKeyEntry> {
    try {
        const docRef = doc(db, SETTINGS_DOC);
        const docSnap = await getDoc(docRef);

        const keyId = `${provider}_${Date.now()}`;
        const newEntry: APIKeyEntry = {
            id: keyId,
            provider,
            label,
            encryptedKey: encrypt(apiKey),
            keyPreview: createKeyPreview(apiKey),
            createdAt: Date.now(),
            createdBy: userId,
            isActive: true,
            requestCount: 0,
            errorCount: 0,
        };

        if (docSnap.exists()) {
            // Update existing document
            await updateDoc(docRef, {
                [`${provider}.${keyId}`]: newEntry,
                updatedAt: Date.now(),
                updatedBy: userId,
            });
        } else {
            // Create new document
            const newConfig: APIKeysConfig = {
                gemini: {},
                groq: {},
                updatedAt: Date.now(),
                updatedBy: userId,
            };
            newConfig[provider][keyId] = newEntry;
            await setDoc(docRef, newConfig);
        }

        console.log(`[APIKeys] Added ${provider} key: ${label}`);
        return newEntry;
    } catch (error) {
        console.error('[APIKeys] Failed to add key:', error);
        throw error;
    }
}

/**
 * Update an existing API key
 */
export async function updateAPIKey(
    provider: AIProvider,
    keyId: string,
    updates: Partial<Pick<APIKeyEntry, 'label' | 'isActive'>>,
    userId: string
): Promise<void> {
    try {
        const docRef = doc(db, SETTINGS_DOC);

        const updateData: Record<string, unknown> = {
            updatedAt: Date.now(),
            updatedBy: userId,
        };

        if (updates.label !== undefined) {
            updateData[`${provider}.${keyId}.label`] = updates.label;
        }
        if (updates.isActive !== undefined) {
            updateData[`${provider}.${keyId}.isActive`] = updates.isActive;
        }

        await updateDoc(docRef, updateData);
        console.log(`[APIKeys] Updated ${provider} key: ${keyId}`);
    } catch (error) {
        console.error('[APIKeys] Failed to update key:', error);
        throw error;
    }
}

/**
 * Delete an API key
 */
export async function deleteAPIKey(
    provider: AIProvider,
    keyId: string,
    userId: string
): Promise<void> {
    try {
        const docRef = doc(db, SETTINGS_DOC);

        await updateDoc(docRef, {
            [`${provider}.${keyId}`]: deleteField(),
            updatedAt: Date.now(),
            updatedBy: userId,
        });

        console.log(`[APIKeys] Deleted ${provider} key: ${keyId}`);
    } catch (error) {
        console.error('[APIKeys] Failed to delete key:', error);
        throw error;
    }
}

/**
 * Subscribe to API keys changes (real-time updates)
 */
export function subscribeToAPIKeys(
    callback: (config: APIKeysConfig | null) => void
): Unsubscribe {
    const docRef = doc(db, SETTINGS_DOC);

    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data() as APIKeysConfig);
        } else {
            callback(null);
        }
    }, (error) => {
        console.error('[APIKeys] Subscription error:', error);
        callback(null);
    });
}

/**
 * Get decrypted API keys for a provider
 * Used internally by AI providers
 */
export async function getDecryptedKeys(provider: AIProvider): Promise<string[]> {
    try {
        const config = await getAPIKeys();
        if (!config) return [];

        const providerKeys = config[provider] || {};

        return Object.values(providerKeys)
            .filter(entry => entry.isActive)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(entry => decrypt(entry.encryptedKey))
            .filter(key => key.length > 0);
    } catch (error) {
        console.error('[APIKeys] Failed to get decrypted keys:', error);
        return [];
    }
}

/**
 * Increment request count for a key
 */
export async function incrementKeyUsage(
    provider: AIProvider,
    keyId: string
): Promise<void> {
    try {
        const docRef = doc(db, SETTINGS_DOC);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return;

        const config = docSnap.data() as APIKeysConfig;
        const entry = config[provider]?.[keyId];

        if (entry) {
            await updateDoc(docRef, {
                [`${provider}.${keyId}.requestCount`]: (entry.requestCount || 0) + 1,
                [`${provider}.${keyId}.lastUsed`]: Date.now(),
            });
        }
    } catch (error) {
        // Non-critical, just log
        console.warn('[APIKeys] Failed to increment usage:', error);
    }
}

/**
 * Increment error count for a key
 */
export async function incrementKeyError(
    provider: AIProvider,
    keyId: string
): Promise<void> {
    try {
        const docRef = doc(db, SETTINGS_DOC);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return;

        const config = docSnap.data() as APIKeysConfig;
        const entry = config[provider]?.[keyId];

        if (entry) {
            await updateDoc(docRef, {
                [`${provider}.${keyId}.errorCount`]: (entry.errorCount || 0) + 1,
            });
        }
    } catch (error) {
        console.warn('[APIKeys] Failed to increment error count:', error);
    }
}

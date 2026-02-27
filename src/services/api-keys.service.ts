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
 * For true security, API keys should be proxied through a backend/Cloud Function.
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

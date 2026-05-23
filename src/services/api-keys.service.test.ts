import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    doc: vi.fn(() => ({ path: 'settings/api_keys' })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteField: vi.fn(() => ({ __delete: true })),
    onSnapshot: vi.fn(),
}));

vi.mock('./firebase', () => ({
    firestore: {},
}));

vi.mock('firebase/firestore', () => firestoreMocks);

const activeGroqKey = {
    mapValue: {
        fields: {
            id: { stringValue: 'groq_1' },
            label: { stringValue: 'Admin Groq' },
            encryptedKey: { stringValue: 'CgEbBAAKBQUGAVlGBAk=' },
            keyPreview: { stringValue: 'groq...n-key' },
            createdAt: { integerValue: '1' },
            createdBy: { stringValue: 'admin' },
            isActive: { booleanValue: true },
            requestCount: { integerValue: '0' },
            errorCount: { integerValue: '0' },
        },
    },
};

const inactiveGroqKey = {
    mapValue: {
        fields: {
            id: { stringValue: 'groq_2' },
            label: { stringValue: 'Inactive Groq' },
            encryptedKey: { stringValue: 'CgEbBAAKBQUGAVlGBAk=' },
            keyPreview: { stringValue: 'groq...n-key' },
            createdAt: { integerValue: '2' },
            createdBy: { stringValue: 'admin' },
            isActive: { booleanValue: false },
            requestCount: { integerValue: '0' },
            errorCount: { integerValue: '0' },
        },
    },
};

describe('api-keys.service trusted key inventory', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubEnv('VITEST', 'true');
        vi.stubEnv('READING_V2_TRUSTED_ADMIN_KEYS', 'true');
        vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-project');
        vi.stubEnv('GOOGLE_OAUTH_ACCESS_TOKEN', 'oauth-token');
        firestoreMocks.getDoc.mockRejectedValue({ code: 'permission-denied' });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('uses trusted Node Firestore REST fallback when client registry read is denied', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                fields: {
                    groq: {
                        mapValue: {
                            fields: {
                                groq_1: activeGroqKey,
                                groq_2: inactiveGroqKey,
                            },
                        },
                    },
                    gemini: { mapValue: { fields: {} } },
                    updatedAt: { integerValue: '123' },
                    updatedBy: { stringValue: 'admin' },
                },
            }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const { getDecryptedKeys } = await import('./api-keys.service');

        await expect(getDecryptedKeys('groq')).resolves.toEqual(['groq-admin-key']);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents/settings/api_keys',
            { headers: { Authorization: 'Bearer oauth-token' } },
        );
    });

    it('does not use trusted Node fallback unless explicitly enabled', async () => {
        vi.unstubAllEnvs();
        vi.stubEnv('VITEST', 'true');
        vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-project');
        vi.stubEnv('GOOGLE_OAUTH_ACCESS_TOKEN', 'oauth-token');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        firestoreMocks.getDoc.mockRejectedValue({ code: 'permission-denied' });

        const { getDecryptedKeys } = await import('./api-keys.service');

        await expect(getDecryptedKeys('groq')).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

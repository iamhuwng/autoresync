import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../types';
import { verifyFirebaseToken } from './firebase-auth';

const env = {
    LOCAL_EMULATOR_AUTH: 'true',
    FIREBASE_PROJECT_ID: 'demo-luyentap-local',
    FIREBASE_DB_URL: 'http://localhost:9000?ns=demo-luyentap-local',
    FIRESTORE_EMULATOR_HOST: 'localhost:8080',
} as WorkerEnv;
const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_');
const token = (header = { alg: 'none' }, payload: Record<string, unknown> = {}) =>
    `${encode(header)}.${encode({ aud: env.FIREBASE_PROJECT_ID, iss: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, sub: 'student', exp: Math.floor(Date.now() / 1000) + 60, ...payload })}.`;

describe('local emulator token boundary', () => {
    it('accepts an unsigned emulator token only in the isolated local configuration', async () => {
        expect(await verifyFirebaseToken(`Bearer ${token()}`, env)).toMatchObject({ valid: true, uid: 'student' });
        for (const change of [
            { FIREBASE_PROJECT_ID: 'production' },
            { FIREBASE_DB_URL: 'https://production.example.test' },
            { FIREBASE_DB_URL: 'http://localhost:9000?ns=production' },
            { FIRESTORE_EMULATOR_HOST: 'production:8080' },
        ]) {
            expect((await verifyFirebaseToken(`Bearer ${token()}`, { ...env, ...change })).valid).toBe(false);
        }
    });

    it('rejects wrong algorithms, signatures, and claims', async () => {
        for (const value of [token({ alg: 'RS256' }), `${token()}signature`, token(undefined, { aud: 'production' }), token(undefined, { iss: 'bad' }), token(undefined, { sub: '' }), token(undefined, { exp: 0 })]) {
            expect((await verifyFirebaseToken(`Bearer ${value}`, env)).valid).toBe(false);
        }
    });
});

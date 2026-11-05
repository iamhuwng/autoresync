/**
 * Firebase ID Token Verification + super_admin Claim Check (PRD §4.8.1)
 *
 * Verifies Firebase ID tokens from the admin browser using Google's JWK endpoint.
 * Uses jose.createRemoteJWKSet() — dramatically simpler than manually parsing x509 certificates.
 *
 * ⚠️ Uses the JWK endpoint (NOT the x509 endpoint):
 *   https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { WorkerEnv } from '../types';

// JWK key set for Firebase ID token verification
// ⚠️ DO NOT use the x509 cert endpoint — parsing x509 to CryptoKey in a Worker is extremely complex
const JWKS = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

interface VerifyResult {
    valid: boolean;
    uid?: string;
    name?: string | null;
    email?: string | null;
    error?: string;
}

export const isLocalHomeworkEmulator = (env: WorkerEnv): boolean =>
    env.LOCAL_EMULATOR_AUTH === 'true'
    && env.FIREBASE_PROJECT_ID === 'demo-luyentap-local'
    && env.FIREBASE_DB_URL === 'http://localhost:9000?ns=demo-luyentap-local'
    && env.FIRESTORE_EMULATOR_HOST === 'localhost:8080';

const decodeLocalPart = (encoded: string): Record<string, unknown> | null => {
    try {
        const normalized = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
    } catch {
        return null;
    }
};

export async function verifyFirebaseToken(
    authHeader: string | null,
    env: WorkerEnv
): Promise<VerifyResult> {
    try {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn('[Auth] Missing or invalid Authorization header');
            return { valid: false, error: 'Missing Authorization header' };
        }

        const token = authHeader.slice(7);
        if (!token) {
            console.warn('[Auth] Empty token after stripping Bearer prefix');
            return { valid: false, error: 'Missing Authorization header' };
        }

        if (env.LOCAL_EMULATOR_AUTH === 'true') {
            if (!isLocalHomeworkEmulator(env)) {
                return { valid: false, error: 'Invalid local emulator configuration' };
            }
            const parts = token.split('.');
            const header = decodeLocalPart(parts[0]);
            const payload = decodeLocalPart(parts[1] || '');
            const now = Math.floor(Date.now() / 1000);
            if (
                parts.length !== 3 || parts[2] !== '' || header?.alg !== 'none'
                || payload?.aud !== env.FIREBASE_PROJECT_ID
                || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
                || typeof payload.sub !== 'string'
                || !payload.sub
                || typeof payload.exp !== 'number'
                || payload.exp <= now
            ) {
                return { valid: false, error: 'Invalid local emulator token' };
            }
            return { valid: true, uid: payload.sub };
        }

        console.log('[Auth] Verifying JWT for project:', env.FIREBASE_PROJECT_ID);
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
            audience: env.FIREBASE_PROJECT_ID,
        });

        const uid = payload.sub;
        if (!uid) {
            return { valid: false, error: 'Token is missing subject uid' };
        }

        console.log('[Auth] JWT verified, uid:', uid);
        return {
            valid: true,
            uid,
            name: typeof payload.name === 'string' ? payload.name : null,
            email: typeof payload.email === 'string' ? payload.email : null,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Token verification failed';
        console.error('[Auth] JWT verification failed:', message);
        return { valid: false, error: message };
    }
}

/**
 * Verify a Firebase ID token from the Authorization header and check for super_admin role.
 *
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT signature, kid, iss, aud, exp using jose
 * 3. Check the `role` custom claim for 'super_admin'
 * 4. Return verification result
 */
export async function verifyAdminToken(
    authHeader: string | null,
    env: WorkerEnv
): Promise<VerifyResult> {
    try {
        // 1. Extract Bearer token
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn('[Auth] Missing or invalid Authorization header');
            return { valid: false, error: 'Missing Authorization header' };
        }

        const token = authHeader.slice(7); // Strip "Bearer " prefix
        if (!token) {
            console.warn('[Auth] Empty token after stripping Bearer prefix');
            return { valid: false, error: 'Missing Authorization header' };
        }

        // 2. Verify the JWT — handles signature, kid matching, iss, aud, exp automatically
        console.log('[Auth] Verifying JWT for project:', env.FIREBASE_PROJECT_ID);
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
            audience: env.FIREBASE_PROJECT_ID,
        });

        const uid = payload.sub;
        console.log('[Auth] JWT verified, uid:', uid);

        // 3. Check admin access via ADMIN_UID env var
        // Note: This app stores roles in RTDB (users/<uid>/role), NOT in Firebase custom claims.
        // The JWT does not contain a 'role' claim, so we verify against the known admin UID.
        if (!env.ADMIN_UID) {
            console.error('[Auth] ADMIN_UID env var is not set');
            return { valid: false, error: 'Server configuration error: ADMIN_UID not set' };
        }

        if (uid !== env.ADMIN_UID) {
            console.warn('[Auth] Access denied. UID:', uid, 'Expected ADMIN_UID:', env.ADMIN_UID);
            return { valid: false, error: 'Forbidden: super_admin required' };
        }

        console.log('[Auth] Admin access granted for uid:', uid);
        return { valid: true, uid };
    } catch (err: unknown) {
        // Any jose verification error (expired, bad signature, etc.)
        const message = err instanceof Error ? err.message : 'Token verification failed';
        console.error('[Auth] JWT verification failed:', message);
        return { valid: false, error: message };
    }
}

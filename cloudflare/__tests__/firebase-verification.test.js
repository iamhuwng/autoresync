import { describe, expect, it, vi } from 'vitest';
import {
  FIREBASE_JWKS_URL,
  createFirebaseVerifier,
} from '../src/upload-worker/firebase-verification.js';

const env = { FIREBASE_PROJECT_ID: 'temp-a1437' };

describe('upload-worker Firebase verifier', () => {
  it('verifies Firebase tokens with JWKS, issuer, audience, and maps sub to uid', async () => {
    const jwks = vi.fn();
    const jwtVerify = vi.fn().mockResolvedValue({
      payload: { sub: 'teacher-uid' },
    });
    const verifier = createFirebaseVerifier({ jwtVerify, jwks });

    await expect(
      verifier.verifyAuthorizationHeader('Bearer firebase-token', env),
    ).resolves.toEqual({ valid: true, uid: 'teacher-uid' });

    expect(jwtVerify).toHaveBeenCalledWith('firebase-token', jwks, {
      issuer: 'https://securetoken.google.com/temp-a1437',
      audience: 'temp-a1437',
    });
  });

  it('rejects missing and malformed bearer headers without calling JWT verification', async () => {
    const jwtVerify = vi.fn();
    const verifier = createFirebaseVerifier({ jwtVerify, jwks: vi.fn() });

    await expect(verifier.verifyAuthorizationHeader(null, env)).resolves.toEqual({
      valid: false,
      reason: 'missing_authorization',
    });
    await expect(
      verifier.verifyAuthorizationHeader('Basic abc123', env),
    ).resolves.toEqual({
      valid: false,
      reason: 'malformed_authorization',
    });
    await expect(verifier.verifyAuthorizationHeader('Bearer ', env)).resolves.toEqual({
      valid: false,
      reason: 'missing_token',
    });
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it('rejects tokens without a subject uid', async () => {
    const verifier = createFirebaseVerifier({
      jwtVerify: vi.fn().mockResolvedValue({ payload: {} }),
      jwks: vi.fn(),
    });

    await expect(
      verifier.verifyAuthorizationHeader('Bearer firebase-token', env),
    ).resolves.toEqual({
      valid: false,
      reason: 'missing_subject',
    });
  });

  it('keeps token verification injectable for route tests without Google network', async () => {
    const verifyToken = vi.fn().mockResolvedValue({ valid: true, uid: 'mock-uid' });
    const verifier = createFirebaseVerifier({ verifyToken });

    await expect(
      verifier.verifyAuthorizationHeader('Bearer mock-token', env),
    ).resolves.toEqual({ valid: true, uid: 'mock-uid' });
    expect(verifyToken).toHaveBeenCalledWith('mock-token', env);
  });

  it('exposes the Firebase securetoken JWKS endpoint without service-account secrets', () => {
    expect(FIREBASE_JWKS_URL).toBe(
      'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    );
  });
});

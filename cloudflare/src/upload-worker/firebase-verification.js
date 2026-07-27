import { createRemoteJWKSet, jwtVerify as joseJwtVerify } from 'jose';

export const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const DEFAULT_JWKS = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

function extractBearerToken(authHeader) {
  if (!authHeader) {
    return { valid: false, reason: 'missing_authorization' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, reason: 'malformed_authorization' };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { valid: false, reason: 'missing_token' };
  }

  return { valid: true, token };
}

function getFirebaseProjectId(env) {
  return typeof env?.FIREBASE_PROJECT_ID === 'string'
    ? env.FIREBASE_PROJECT_ID.trim()
    : '';
}

async function verifyFirebaseJwt(token, env, jwtVerify, jwks) {
  const projectId = getFirebaseProjectId(env);
  if (!projectId) {
    return { valid: false, reason: 'missing_project_id' };
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return { valid: false, reason: 'missing_subject' };
    }

    return {
      valid: true,
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: payload.email_verified === true,
    };
  } catch {
    return { valid: false, reason: 'invalid_token' };
  }
}

export function createFirebaseVerifier({
  verifyToken,
  jwtVerify = joseJwtVerify,
  jwks = DEFAULT_JWKS,
} = {}) {
  const tokenVerifier =
    verifyToken ?? ((token, env) => verifyFirebaseJwt(token, env, jwtVerify, jwks));

  return {
    verifyToken: tokenVerifier,
    async verifyAuthorizationHeader(authHeader, env) {
      const extracted = extractBearerToken(authHeader);
      if (!extracted.valid) return extracted;

      return tokenVerifier(extracted.token, env);
    },
  };
}

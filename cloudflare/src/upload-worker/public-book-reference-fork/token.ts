import { SignJWT, importPKCS8 } from 'jose';
import type { RepositoryEnv } from '../listening-authoring/rtdb.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@_-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';

export interface PublicBookCanonicalForkTokenClaims {
  readonly operation: 'public-book-canonical-fork-v1';
  readonly actorId: string;
  readonly operationId: string;
  readonly sourceVersionId: string;
  readonly sourceActivityId: string;
  readonly sourceActivityVersionId: string;
  readonly sourcePlacementId: string;
  readonly sourcePlacementSetFingerprint: string;
  readonly sourceNodeKey: string;
  readonly selectionOrder: number;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly destinationPayloadFingerprint: string;
  readonly targetBookId: string;
  readonly targetNodeId: string;
  readonly placementId: string;
  readonly expectedUpdatedAt: string;
  readonly planFingerprint: string;
  readonly commitTimestamp: string;
  readonly targetAppendOrder: number;
  readonly targetRefIndex: number;
  readonly targetBookStatus: 'draft-empty' | 'draft-in-progress' | 'ready';
  readonly sourceContextFingerprint: string | null;
  readonly intentFingerprint: string;
  readonly canonicalFingerprint: string;
  readonly safeProjectionFingerprint: string;
}

export interface PublicBookCanonicalForkTokenEnv extends RepositoryEnv {
  PUBLIC_BOOK_CANONICAL_FORK_SERVICE_IDENTITY?: string;
  PUBLIC_BOOK_CANONICAL_FORK_GOOGLE_SA_KEY?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const MAX_FIREBASE_CUSTOM_CLAIMS_BYTES = 1000;
const CAPABILITY_LIFETIME_SECONDS = 5 * 60;

/**
 * Firebase places the custom-token `claims` object on `auth.token` after
 * exchange. Keep the fork authorization data under one compact namespace.
 * pbcf keys: s service, a actor, o operationId, sv source version,
 * sa source activity, svi source activity version id,
 * spi source placement,
 * sps placement-set fingerprint, sn node,
 * sel selection order, ia issued activity, iv issued version, df destination
 * fingerprint, tb target book, tn target node, tp target placement,
 * eu expected updatedAt, fp plan fingerprint, ct commit timestamp, ao append order,
 * ri zero-based target ref index,
 * bs planned Book status, dl capability deadline in milliseconds,
 * cx context fingerprint, if intent fingerprint, cf/sf canonical/safe
 * fingerprints.
 */
const compactClaimsFor = (
  claims: PublicBookCanonicalForkTokenClaims,
  deadlineMs: number,
) => ({
  pbcf: {
    s: true,
    a: claims.actorId,
    o: claims.operationId,
    sv: claims.sourceVersionId,
    sa: claims.sourceActivityId,
    svi: claims.sourceActivityVersionId,
    spi: claims.sourcePlacementId,
    sps: claims.sourcePlacementSetFingerprint,
    sn: claims.sourceNodeKey,
    sel: claims.selectionOrder,
    ia: claims.activityId,
    iv: claims.activityVersionId,
    df: claims.destinationPayloadFingerprint,
    tb: claims.targetBookId,
    tn: claims.targetNodeId,
    tp: claims.placementId,
    eu: claims.expectedUpdatedAt,
    fp: claims.planFingerprint,
    ct: claims.commitTimestamp,
    ao: claims.targetAppendOrder,
    ri: claims.targetRefIndex,
    bs: claims.targetBookStatus,
    dl: deadlineMs,
    cx: claims.sourceContextFingerprint,
    if: claims.intentFingerprint,
    cf: claims.canonicalFingerprint,
    sf: claims.safeProjectionFingerprint,
  },
});

const assertClaims = (claims: PublicBookCanonicalForkTokenClaims): void => {
  const expected = [
    'actorId', 'operation', 'operationId', 'placementId',
    'sourceActivityId', 'sourceActivityVersionId', 'sourceNodeKey',
    'sourcePlacementId',
    'sourcePlacementSetFingerprint',
    'sourceVersionId', 'selectionOrder', 'activityId', 'activityVersionId',
    'destinationPayloadFingerprint',
    'targetBookId', 'targetNodeId', 'expectedUpdatedAt', 'planFingerprint',
    'canonicalFingerprint', 'safeProjectionFingerprint',
    'commitTimestamp', 'intentFingerprint',
    'sourceContextFingerprint',
    'targetAppendOrder', 'targetRefIndex', 'targetBookStatus',
  ].sort();
  const actual = Object.keys(claims).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_public_book_canonical_fork_claims');
  }
  if (claims.operation !== 'public-book-canonical-fork-v1'
    || !UUID.test(claims.operationId)
    || ![claims.actorId, claims.sourceVersionId,
      claims.sourceActivityId, claims.sourceActivityVersionId,
      claims.sourcePlacementId, claims.sourcePlacementSetFingerprint, claims.sourceNodeKey,
      claims.targetBookId, claims.targetNodeId,
      claims.activityId, claims.activityVersionId, claims.destinationPayloadFingerprint,
      claims.placementId, claims.expectedUpdatedAt, claims.planFingerprint,
      ]
      .every((value) => typeof value === 'string' && ID.test(value))) {
    throw new Error('invalid_public_book_canonical_fork_claims');
  }
  if (!Number.isSafeInteger(claims.selectionOrder)
      || claims.selectionOrder < 0) {
    throw new Error('invalid_public_book_canonical_fork_claims');
  }
  if (!ID.test(claims.commitTimestamp)
    || !Number.isSafeInteger(claims.targetAppendOrder)
    || claims.targetAppendOrder < 0
    || !Number.isSafeInteger(claims.targetRefIndex)
    || claims.targetRefIndex < 0
    || !['draft-empty', 'draft-in-progress', 'ready'].includes(claims.targetBookStatus)
    || (claims.sourceContextFingerprint !== null && !ID.test(claims.sourceContextFingerprint))
    || !/^sha256:[A-Za-z0-9_-]+$/u.test(claims.intentFingerprint)
    || !/^sha256:[A-Za-z0-9_-]+$/u.test(claims.canonicalFingerprint)
    || !/^sha256:[A-Za-z0-9_-]+$/u.test(claims.safeProjectionFingerprint)) {
    throw new Error('invalid_public_book_canonical_fork_claims');
  }
}

export const createPublicBookCanonicalForkTokenProvider = (options: {
  readonly env: PublicBookCanonicalForkTokenEnv;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}) => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  return async (claims: PublicBookCanonicalForkTokenClaims): Promise<string> => {
    assertClaims(claims);
    const issuedAtMs = now();
    const issuedAt = Math.floor(issuedAtMs / 1000);
    const customClaims = compactClaimsFor(
      claims,
      issuedAtMs + CAPABILITY_LIFETIME_SECONDS * 1000,
    );
    if (new TextEncoder().encode(JSON.stringify(customClaims)).byteLength > MAX_FIREBASE_CUSTOM_CLAIMS_BYTES) {
      throw new Error('public_book_canonical_fork_claims_too_large');
    }
    const keyJson = options.env.PUBLIC_BOOK_CANONICAL_FORK_GOOGLE_SA_KEY?.trim();
    const identity = options.env.PUBLIC_BOOK_CANONICAL_FORK_SERVICE_IDENTITY?.trim();
    const apiKey = options.env.FIREBASE_WEB_API_KEY?.trim();
    if (!keyJson || !identity || !apiKey) throw new Error('public_book_canonical_fork_token_unavailable');
    let serviceAccount: { client_email: string; private_key: string };
    try {
      const parsed = JSON.parse(keyJson) as unknown;
      if (!isRecord(parsed) || typeof parsed.client_email !== 'string'
        || typeof parsed.private_key !== 'string'
        || parsed.client_email !== identity) throw new Error('invalid');
      serviceAccount = parsed as { client_email: string; private_key: string };
    } catch {
      throw new Error('invalid_public_book_canonical_fork_service_account');
    }
    const customToken = await new SignJWT({
      uid: `public-book-canonical-fork:${claims.operationId}`,
      claims: customClaims,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(serviceAccount.client_email)
      .setSubject(serviceAccount.client_email)
      .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + CAPABILITY_LIFETIME_SECONDS)
      .sign(await importPKCS8(serviceAccount.private_key, 'RS256'));
    const response = await fetchImpl(TOKEN_URL + '?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken }),
    });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok || !isRecord(body) || typeof body.idToken !== 'string' || body.idToken === '') {
      throw new Error(`public_book_canonical_fork_token_exchange_failed:${response.status}`);
    }
    return body.idToken;
  };
};

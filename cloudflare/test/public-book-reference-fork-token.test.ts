import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  createPublicBookCanonicalForkTokenProvider,
  type PublicBookCanonicalForkTokenClaims,
} from '../src/upload-worker/public-book-reference-fork/token.ts';

const NOW_MS = 1_784_000_000_000;
const SERVICE_IDENTITY = 'public-book-canonical-fork@example.test';
const AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const PLACEMENT_SET = 'fnv1a64:0123456789abcdef';
const DESTINATION_PAYLOAD = 'fnv1a64:fedcba9876543210';
const PLAN = 'sha256:' + 'd'.repeat(43);
const INTENT = 'sha256:' + 'e'.repeat(43);
const CANONICAL = 'sha256:' + 'f'.repeat(43);
const SAFE = 'sha256:' + 'g'.repeat(43);

const errorMessage = (value: unknown): string =>
  value instanceof Error ? value.message : String(value);

const baseClaims: PublicBookCanonicalForkTokenClaims = {
  operation: 'public-book-canonical-fork-v1',
  actorId: 'teacher-01HZY3V8QZ',
  operationId: '00000000-0000-4000-8000-000000000107',
  sourceVersionId: 'pdf-01HZY3V8QZ',
  sourceActivityId: 'activity-01HZY3V8QZ',
  sourceActivityVersionId: 'version-01HZY3V8QZ',
  sourcePlacementId: 'placement-01HZY3V8QZ',
  sourcePlacementSetFingerprint: PLACEMENT_SET,
  sourceNodeKey: 'node-01HZY3V8QZ',
  selectionOrder: 0,
  activityId: 'fork-' + 'a'.repeat(43),
  activityVersionId: 'fork-version-' + 'b'.repeat(43),
  destinationPayloadFingerprint: DESTINATION_PAYLOAD,
  targetBookId: 'book-01HZY3V8QZ',
  targetNodeId: 'node-target-01HZY3V8QZ',
  placementId: 'placement-target-01HZY3V8QZ',
  expectedUpdatedAt: '2026-08-09T00:00:00.000Z',
  planFingerprint: PLAN,
  commitTimestamp: '2026-08-09T00:01:00.000Z',
  targetAppendOrder: 1,
  targetRefIndex: 0,
  targetBookStatus: 'draft-in-progress',
  sourceContextFingerprint: null,
  intentFingerprint: INTENT,
  canonicalFingerprint: CANONICAL,
  safeProjectionFingerprint: SAFE,
};

const tokenProviderFor = async (fetchImpl: typeof fetch) => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const privateKeyPem = await exportPKCS8(privateKey);
  const exchange = fetchImpl as typeof fetch;
  return {
    publicKey,
    tokenFor: createPublicBookCanonicalForkTokenProvider({
      env: {
        FIREBASE_WEB_API_KEY: 'api-key',
        PUBLIC_BOOK_CANONICAL_FORK_SERVICE_IDENTITY: SERVICE_IDENTITY,
        PUBLIC_BOOK_CANONICAL_FORK_GOOGLE_SA_KEY: JSON.stringify({
          client_email: SERVICE_IDENTITY,
          private_key: privateKeyPem,
        }),
      },
      fetchImpl: exchange,
      now: () => NOW_MS,
    }),
  };
};

describe('public Book canonical fork Firebase token', () => {
  it('signs standard root claims and nests every fork pin under claims.pbcf', async () => {
    const customTokens: string[] = [];
    const exchangeBodies: unknown[] = [];
    const exchange = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      exchangeBodies.push(body);
      customTokens.push(String(body.token));
      return Response.json({ idToken: 'public-book-canonical-fork-id-token', expiresIn: '300' });
    });
    const { publicKey, tokenFor } = await tokenProviderFor(exchange as typeof fetch);

    await expect(tokenFor(baseClaims)).resolves.toBe('public-book-canonical-fork-id-token');
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchangeBodies).toEqual([{ token: customTokens[0] }]);
    const verified = await jwtVerify(customTokens[0]!, publicKey, {
      issuer: SERVICE_IDENTITY,
      subject: SERVICE_IDENTITY,
      audience: AUDIENCE,
      algorithms: ['RS256'],
      currentDate: new Date(NOW_MS),
    });

    expect(Object.keys(verified.payload).sort()).toEqual(['aud', 'claims', 'exp', 'iat', 'iss', 'sub', 'uid']);
    expect(verified.payload).toMatchObject({
      uid: `public-book-canonical-fork:${baseClaims.operationId}`,
      claims: {
        pbcf: {
          s: true,
          a: baseClaims.actorId,
          o: baseClaims.operationId,
          sv: baseClaims.sourceVersionId,
          sa: baseClaims.sourceActivityId,
          svi: baseClaims.sourceActivityVersionId,
          spi: baseClaims.sourcePlacementId,
          sps: baseClaims.sourcePlacementSetFingerprint,
          sn: baseClaims.sourceNodeKey,
          sel: baseClaims.selectionOrder,
          ia: baseClaims.activityId,
          iv: baseClaims.activityVersionId,
          df: baseClaims.destinationPayloadFingerprint,
          tb: baseClaims.targetBookId,
          tn: baseClaims.targetNodeId,
          tp: baseClaims.placementId,
          eu: baseClaims.expectedUpdatedAt,
          fp: baseClaims.planFingerprint,
          ct: baseClaims.commitTimestamp,
          ao: baseClaims.targetAppendOrder,
          ri: baseClaims.targetRefIndex,
          bs: baseClaims.targetBookStatus,
          dl: NOW_MS + 300_000,
          cx: baseClaims.sourceContextFingerprint,
          if: baseClaims.intentFingerprint,
          cf: baseClaims.canonicalFingerprint,
          sf: baseClaims.safeProjectionFingerprint,
        },
      },
    });
    expect((verified.payload.exp as number) - (verified.payload.iat as number)).toBe(300);
    expect(Object.keys((verified.payload.claims as { pbcf: Record<string, unknown> }).pbcf).sort())
      .toEqual([
        'a', 'ao', 'bs', 'cf', 'ct', 'cx', 'df', 'dl', 'eu', 'fp', 'ia', 'if', 'iv',
        'o', 'ri', 's', 'sa', 'sel', 'sf', 'sn', 'spi', 'sps', 'sv', 'svi', 'tb', 'tn', 'tp',
      ]);
    expect(Object.keys(verified.payload).filter((key) => key.startsWith('public_book_canonical_fork_'))).toEqual([]);
    expect(new TextEncoder().encode(JSON.stringify(verified.payload.claims)).byteLength).toBeLessThanOrEqual(1000);
  });

  it('mints a maximum normal-length command below the Firebase custom-claim limit', async () => {
    const exchange = vi.fn(async () => Response.json({ idToken: 'max-normal-id-token' }));
    const { tokenFor } = await tokenProviderFor(exchange as typeof fetch);
    const maximumNormalClaims: PublicBookCanonicalForkTokenClaims = {
      ...baseClaims,
      sourceContextFingerprint: 'sha256:' + 'c'.repeat(43),
    };

    await expect(tokenFor(maximumNormalClaims)).resolves.toBe('max-normal-id-token');
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized UTF-8 custom claims before token exchange', async () => {
    const exchange = vi.fn();
    const { tokenFor } = await tokenProviderFor(exchange as typeof fetch);
    const oversized = {
      ...baseClaims,
      actorId: 'a'.repeat(160),
      sourceVersionId: 'f'.repeat(160),
      sourceActivityId: 'g'.repeat(160),
      sourceActivityVersionId: 'h'.repeat(160),
      sourcePlacementSetFingerprint: 'j'.repeat(160),
    };

    await expect(tokenFor(oversized)).rejects.toThrow('public_book_canonical_fork_claims_too_large');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('fails closed on an invalid Identity Toolkit exchange response', async () => {
    const exchange = vi.fn(async () => Response.json({ idToken: '' }));
    const { tokenFor } = await tokenProviderFor(exchange as typeof fetch);

    await expect(tokenFor(baseClaims)).rejects.toThrow('public_book_canonical_fork_token_exchange_failed:200');
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('does not expose either token in exchange errors', async () => {
    let customToken = '';
    const exchange = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      customToken = String((JSON.parse(String(init?.body)) as Record<string, unknown>).token);
      return Response.json({ error: { message: customToken }, refreshToken: 'refresh-secret' }, { status: 401 });
    });
    const { tokenFor } = await tokenProviderFor(exchange as typeof fetch);

    const failure = await tokenFor(baseClaims).catch(errorMessage);
    expect(failure).toBe('public_book_canonical_fork_token_exchange_failed:401');
    expect(failure).not.toContain(customToken);
    expect(failure).not.toContain('refresh-secret');
  });
});

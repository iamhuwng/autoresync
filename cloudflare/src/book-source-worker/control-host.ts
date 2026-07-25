import { createFirebaseVerifier } from '../upload-worker/firebase-verification.js';
import type { SourceUploadInspectionClaim } from '../../../src/services/book-source-delivery/sourceUpload.protocol';

const MAX_CONTROL_BODY_BYTES = 16 * 1024;
const SAFE_ID = /^[A-Za-z0-9._~-]{1,160}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;

interface ControlHostEnv {
  readonly FIREBASE_PROJECT_ID?: string;
  readonly BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN?: string;
}

interface VerifiedAuthorization {
  readonly valid: boolean;
  readonly uid?: string;
  readonly reason?: string;
}

interface ControlHostVerifier {
  verifyAuthorizationHeader(
    authorization: string | null,
    env: ControlHostEnv,
  ): Promise<VerifiedAuthorization>;
}

export interface BookSourceUploadControlService {
  begin(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly idempotencyKey: string;
    readonly sourceKey: string;
    readonly kind: 'initial' | 'replacement';
    readonly claim: SourceUploadInspectionClaim;
  }): Promise<{
    readonly status: 'reserved' | 'replayed';
    readonly uploadUrl: string;
    readonly expiresAt: string;
    readonly requiredHeaders: Readonly<Record<string, string>>;
    readonly reservationId: string;
    readonly sourceVersionId: string;
  }>;
  complete(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
    readonly providerFileId: string;
    readonly providerFileVersionId: string;
  }): Promise<{
    readonly status: 'verified_completed';
    readonly reservationId: string;
    readonly sourceVersionId: string;
  }>;
}

export interface BookSourceControlHostOptions {
  readonly service: BookSourceUploadControlService;
  readonly verifier?: ControlHostVerifier;
}

class ControlRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ControlRequestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const safeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new ControlRequestError(`invalid_${label}`, 400);
  }
  return value;
};

const parseInspection = (value: unknown) => {
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion',
    'trust',
    'state',
    'displayFilename',
    'exactByteSize',
    'sha256Hex',
    'physicalPageCount',
    'pdfType',
    'readability',
  ])) {
    throw new ControlRequestError('invalid_inspection', 400);
  }
  if (
    value.schemaVersion !== 1
    || value.trust !== 'browser-supplied-untrusted'
    || value.state !== 'complete'
    || typeof value.displayFilename !== 'string'
    || value.displayFilename.length < 1
    || value.displayFilename.length > 255
    || !Number.isSafeInteger(value.exactByteSize)
    || (value.exactByteSize as number) <= 0
    || typeof value.sha256Hex !== 'string'
    || !SHA256.test(value.sha256Hex)
    || !Number.isSafeInteger(value.physicalPageCount)
    || (value.physicalPageCount as number) <= 0
    || value.pdfType !== 'application/pdf'
    || value.readability !== 'readable'
  ) {
    throw new ControlRequestError('invalid_inspection', 400);
  }
  return {
    schemaVersion: 1 as const,
    trust: 'browser-supplied-untrusted' as const,
    state: 'complete' as const,
    displayFilename: value.displayFilename,
    exactByteSize: value.exactByteSize as number,
    sha256Hex: value.sha256Hex,
    physicalPageCount: value.physicalPageCount as number,
    pdfType: 'application/pdf' as const,
    readability: 'readable' as const,
  };
};

const parseBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new ControlRequestError('unsupported_media_type', 415);
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONTROL_BODY_BYTES) {
    throw new ControlRequestError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CONTROL_BODY_BYTES) {
    throw new ControlRequestError('body_too_large', 413);
  }
  try {
    const body = JSON.parse(text) as unknown;
    if (!isRecord(body)) throw new Error('not an object');
    return body;
  } catch {
    throw new ControlRequestError('invalid_json', 400);
  }
};

type Route =
  | { readonly action: 'begin'; readonly bookId: string }
  | { readonly action: 'complete'; readonly bookId: string; readonly reservationId: string };

const routeFor = (request: Request): Route | undefined => {
  if (request.method !== 'POST') return undefined;
  const segments = new URL(request.url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (
    segments.length === 6
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'upload'
    && segments[5] === 'begin'
  ) {
    return { action: 'begin', bookId: safeId(segments[3], 'book_id') };
  }
  if (
    segments.length === 7
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'upload'
    && segments[6] === 'complete'
  ) {
    return {
      action: 'complete',
      bookId: safeId(segments[3], 'book_id'),
      reservationId: safeId(segments[5], 'reservation_id'),
    };
  }
  return undefined;
};

const responseHeaders = (request: Request, env: ControlHostEnv): HeadersInit => {
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    vary: 'Origin',
  };
  const origin = request.headers.get('origin');
  if (origin && origin === env.BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
    headers['access-control-allow-headers'] = 'Authorization, Content-Type, Idempotency-Key';
  }
  return headers;
};

const json = (request: Request, env: ControlHostEnv, body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(request, env) });

const publicFailure = (error: unknown): { readonly code: string; readonly status: number } => {
  if (error instanceof ControlRequestError) return error;
  if (isRecord(error)) {
    const code = typeof error.code === 'string' && /^[a-z0-9_]{1,80}$/u.test(error.code)
      ? error.code
      : undefined;
    if (code) {
      if (code === 'authority_denied') return { code, status: 403 };
      if (code === 'invalid_input' || code === 'invalid_claim') return { code, status: 400 };
      if (code === 'rollout_denied' || code === 'invalid_deployment' || code === 'account_state_unavailable') {
        return { code, status: 503 };
      }
      if (code.startsWith('provider_')) return { code, status: 502 };
      if (
        code === 'idempotency_conflict'
        || code === 'active_artifact_conflict'
        || code === 'reservation_not_found'
        || code === 'reservation_released'
        || code === 'stale_cas'
        || code === 'reservation_conflict'
      ) {
        return { code, status: 409 };
      }
    }
  }
  return { code: 'book_source_upload_unavailable', status: 503 };
};

export const createBookSourceControlHost = (options: BookSourceControlHostOptions) => ({
  async fetch(request: Request, env: ControlHostEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders(request, env) });
    }
    try {
      const route = routeFor(request);
      if (!route) return json(request, env, { code: 'not_found' }, 404);

      const authorization = await (options.verifier ?? createFirebaseVerifier())
        .verifyAuthorizationHeader(request.headers.get('authorization'), env);
      if (!authorization.valid || !authorization.uid) {
        return json(request, env, { code: 'unauthorized' }, 401);
      }

      const body = await parseBody(request);
      if (route.action === 'begin') {
        if (!exactKeys(body, ['operationId', 'sourceKey', 'kind', 'inspection'])) {
          throw new ControlRequestError('invalid_begin_request', 400);
        }
        if (typeof body.operationId !== 'string' || !UUID.test(body.operationId)) {
          throw new ControlRequestError('invalid_operation_id', 400);
        }
        if (request.headers.get('idempotency-key') !== body.operationId) {
          throw new ControlRequestError('idempotency_mismatch', 409);
        }
        if (body.kind !== 'initial' && body.kind !== 'replacement') {
          throw new ControlRequestError('invalid_upload_kind', 400);
        }
        const result = await options.service.begin({
          actorId: authorization.uid,
          bookId: route.bookId,
          idempotencyKey: body.operationId,
          sourceKey: safeId(body.sourceKey, 'source_key'),
          kind: body.kind,
          claim: parseInspection(body.inspection),
        });
        return json(request, env, {
          status: result.status,
          reservationId: result.reservationId,
          sourceVersionId: result.sourceVersionId,
          upload: {
            url: result.uploadUrl,
            expiresAt: result.expiresAt,
            requiredHeaders: result.requiredHeaders,
          },
        });
      }

      if (!exactKeys(body, ['providerFileId', 'providerFileVersionId'])) {
        throw new ControlRequestError('invalid_complete_request', 400);
      }
      const result = await options.service.complete({
        actorId: authorization.uid,
        bookId: route.bookId,
        reservationId: route.reservationId,
        providerFileId: safeId(body.providerFileId, 'provider_file_id'),
        providerFileVersionId: safeId(body.providerFileVersionId, 'provider_file_version_id'),
      });
      return json(request, env, {
        status: result.status,
        reservationId: result.reservationId,
        sourceVersionId: result.sourceVersionId,
      });
    } catch (error) {
      const failure = publicFailure(error);
      return json(request, env, { code: failure.code }, failure.status);
    }
  },
});

import { createFirebaseVerifier } from '../upload-worker/firebase-verification.js';
import type { SourceUploadInspectionClaim } from '../../../src/services/book-source-delivery/sourceUpload.protocol';
import type {
  ComponentPdfSourceCandidate,
  FullPdfSourceCandidate,
  SourceSetCandidate,
} from '../../../src/types/bookAssembly.types';
import type {
  BookSourceChecksum,
  BookSourcePurpose,
  BookSourceStudentSafeDecision,
  BookSourceStudentSafeReasonCode,
  BookSourceStudentSafeStatus,
} from '../../../src/types/bookSource.types';
import {
  readTrustedSourceChecksum,
  readTrustedSourceSafety,
} from '../upload-worker/book-source/trusted-source-contract.ts';

const MAX_CONTROL_BODY_BYTES = 16 * 1024;
const CONTROL_REQUEST_TIMEOUT_MS = 55_000;
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
  sources?(input: {
    readonly actorId: string;
    readonly bookId: string;
  }): Promise<{
    readonly sources: readonly {
      readonly sourceKey: string;
      readonly sourceVersionId: string;
      readonly bookId: string;
      readonly checksum: BookSourceChecksum;
      readonly physicalPageCount: number;
      readonly verifiedUsable: boolean;
      readonly purpose: BookSourcePurpose;
      readonly studentSafeStatus: BookSourceStudentSafeStatus;
      readonly studentSafeDecision?: BookSourceStudentSafeDecision;
    }[];
  }>;
  attachSourceSet?(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly operationId: string;
    readonly expectedBookRevision: number;
    readonly expectedSourceSetRevision: number;
    readonly sourceSet: SourceSetCandidate;
  }): Promise<{
    readonly status: 'attached' | 'replaced' | 'replayed';
    readonly bookRevision: number;
    readonly sourceSetRevision: number;
    readonly sourceSet: SourceSetCandidate;
  }>;
  begin(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly idempotencyKey: string;
    readonly sourceKey: string;
    readonly kind: 'initial' | 'replacement';
    readonly purpose: BookSourcePurpose;
    readonly claim: SourceUploadInspectionClaim;
  }): Promise<{
    readonly status: 'reserved' | 'replayed';
    readonly uploadUrl: string;
    readonly expiresAt: string;
    readonly requiredHeaders: Readonly<Record<string, string>>;
    readonly reservationId: string;
    readonly sourceVersionId: string;
  }>;
  decideStudentSafeSource?(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
    readonly operationId: string;
    readonly studentSafeStatus: Exclude<BookSourceStudentSafeStatus, 'unreviewed'>;
    readonly reasonCode: BookSourceStudentSafeReasonCode;
  }): Promise<{
    readonly status: 'verified_completed';
    readonly reservationId: string;
    readonly sourceVersionId: string;
    readonly checksum: BookSourceChecksum;
    readonly purpose: BookSourcePurpose;
    readonly studentSafeStatus: BookSourceStudentSafeStatus;
    readonly studentSafeDecision: BookSourceStudentSafeDecision;
  }>;
  complete(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
    readonly operationId: string;
  }, context?: {
    readonly signal?: AbortSignal;
    readonly deadlineAt?: number;
    readonly deferCleanup?: (promise: Promise<unknown>) => void;
  }): Promise<{
    readonly status: 'verified_completed';
    readonly reservationId: string;
    readonly sourceVersionId: string;
    readonly checksum: BookSourceChecksum;
  }>;
  status?(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
  }): Promise<BookSourceUploadSafeLifecycleStatus>;
  requestCleanup?(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
    readonly reason: 'cancel_requested';
    readonly providerFileId?: string;
    readonly providerFileVersionId?: string;
  }): Promise<BookSourceUploadSafeLifecycleStatus>;
  reconcile?(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
  }): Promise<BookSourceUploadSafeLifecycleStatus>;
}

interface BookSourceUploadSafeLifecycleStatus {
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly status: 'reserved' | 'cleanup_pending' | 'verified_completed' | 'released';
  readonly retryKind: 'bytes' | 'completion' | 'cleanup' | 'none';
  readonly nextRetryAt?: string;
  readonly lastErrorCode?: string;
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

const parseSourceSet = (value: unknown): SourceSetCandidate => {
  if (!isRecord(value) || !exactKeys(value, ['sourceStrategy', 'sources'])
    || (value.sourceStrategy !== 'full_pdf' && value.sourceStrategy !== 'component_pdfs')
    || !Array.isArray(value.sources)
    || (value.sourceStrategy === 'full_pdf' && value.sources.length !== 1)
    || (value.sourceStrategy === 'component_pdfs' && (value.sources.length < 2 || value.sources.length > 20))) {
    throw new ControlRequestError('invalid_source_set', 400);
  }
  const seenKeys = new Set<string>();
  const seenVersions = new Set<string>();
  const seenOrders = new Set<number>();
  const parseCommon = (entry: Record<string, unknown>, index: number): Omit<FullPdfSourceCandidate, 'ownerNodeKey'> => {
    const sourceKey = safeId(entry.sourceKey, 'source_key');
    const sourceVersionId = safeId(entry.sourceVersionId, 'source_version_id');
    if (!Number.isSafeInteger(entry.sourceOrder) || (entry.sourceOrder as number) !== index + 1
      || seenKeys.has(sourceKey) || seenVersions.has(sourceVersionId)
      || seenOrders.has(entry.sourceOrder as number)) {
      throw new ControlRequestError('invalid_source_set', 400);
    }
    seenKeys.add(sourceKey);
    seenVersions.add(sourceVersionId);
    seenOrders.add(entry.sourceOrder as number);
    return { sourceKey, sourceVersionId, sourceOrder: entry.sourceOrder as number };
  };

  if (value.sourceStrategy === 'full_pdf') {
    const [entry] = value.sources;
    if (!isRecord(entry) || !exactKeys(entry, ['sourceKey', 'sourceOrder', 'sourceVersionId'])) {
      throw new ControlRequestError('invalid_source_set', 400);
    }
    const source = parseCommon(entry, 0);
    return {
      sourceStrategy: 'full_pdf',
      sources: [source],
    };
  }

  const sources = value.sources.map((entry, index): ComponentPdfSourceCandidate => {
    if (!isRecord(entry)) throw new ControlRequestError('invalid_source_set', 400);
    if (!exactKeys(entry, ['ownerNodeKey', 'sourceKey', 'sourceOrder', 'sourceVersionId'])) {
      throw new ControlRequestError('invalid_source_set', 400);
    }
    return {
      ...parseCommon(entry, index),
      ownerNodeKey: safeId(entry.ownerNodeKey, 'owner_node_key'),
    };
  });
  const [first, ...rest] = sources;
  if (!first) throw new ControlRequestError('invalid_source_set', 400);
  return { sourceStrategy: 'component_pdfs', sources: [first, ...rest] };
};

const readBoundedRequestText = async (request: Request, deadlineAt: number): Promise<string> => {
  if (!request.body) return '';
  if (request.signal.aborted) throw new ControlRequestError('request_aborted', 408);
  const remainingMs = Math.floor(deadlineAt - Date.now());
  if (remainingMs <= 0) throw new ControlRequestError('request_timed_out', 408);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelledReject!: (reason: ControlRequestError) => void;
  const cancelled = new Promise<never>((_, reject) => {
    cancelledReject = reject;
  });
  const onAbort = () => cancelledReject(new ControlRequestError('request_aborted', 408));
  request.signal.addEventListener('abort', onAbort, { once: true });
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ControlRequestError('request_timed_out', 408)), remainingMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), cancelled, timedOut]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_CONTROL_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new ControlRequestError('body_too_large', 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    request.signal.removeEventListener('abort', onAbort);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
};

const parseBody = async (request: Request, deadlineAt: number): Promise<Record<string, unknown>> => {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new ControlRequestError('unsupported_media_type', 415);
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONTROL_BODY_BYTES) {
    const body = request.body;
    if (body) void body.cancel('body_too_large').catch(() => undefined);
    throw new ControlRequestError('body_too_large', 413);
  }
  const text = await readBoundedRequestText(request, deadlineAt);
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

export type BookSourceControlRoute =
  | { readonly action: 'begin'; readonly bookId: string }
  | { readonly action: 'decideStudentSafeSource'; readonly bookId: string; readonly reservationId: string }
  | { readonly action: 'attach'; readonly bookId: string }
  | { readonly action: 'sources'; readonly bookId: string }
  | {
      readonly action: 'complete' | 'cancel' | 'retry' | 'reconcile' | 'status';
      readonly bookId: string;
      readonly reservationId: string;
    };

const routeFor = (request: Request): BookSourceControlRoute | undefined => {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (
    request.method === 'POST'
    && segments.length === 6
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'upload'
    && segments[5] === 'begin'
  ) {
    return { action: 'begin', bookId: safeId(segments[3], 'book_id') };
  }
  if (
    request.method === 'POST'
    && segments.length === 8
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'upload'
    && segments[6] === 'student-safe'
    && segments[7] === 'decide'
  ) {
    return {
      action: 'decideStudentSafeSource',
      bookId: safeId(segments[3], 'book_id'),
      reservationId: safeId(segments[5], 'reservation_id'),
    };
  }
  if (
    request.method === 'POST'
    && segments.length === 6
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'source-set'
    && segments[5] === 'attach'
  ) {
    return { action: 'attach', bookId: safeId(segments[3], 'book_id') };
  }
  if (
    request.method === 'POST'
    && segments.length === 7
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'upload'
    && ['complete', 'cancel', 'retry', 'reconcile'].includes(segments[6]!)
  ) {
    return {
      action: segments[6] as 'complete' | 'cancel' | 'retry' | 'reconcile',
      bookId: safeId(segments[3], 'book_id'),
      reservationId: safeId(segments[5], 'reservation_id'),
    };
  }
  if (
    request.method === 'GET'
    && segments.length === 5
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'sources'
  ) {
    return {
      action: 'sources',
      bookId: safeId(segments[3], 'book_id'),
    };
  }
  if (
    request.method === 'GET'
    && segments.length === 7
    && segments[0] === 'v1'
    && segments[1] === 'book-source'
    && segments[2] === 'books'
    && segments[4] === 'upload'
    && segments[6] === 'status'
  ) {
    return {
      action: 'status',
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
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    headers['access-control-allow-headers'] = 'Authorization, Content-Type, Idempotency-Key';
  }
  return headers;
};

const json = (request: Request, env: ControlHostEnv, body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(request, env) });

const publicFailure = (error: unknown): { readonly code: string; readonly status: number } => {
  if (error instanceof ControlRequestError) return error;
  if (isRecord(error) || error instanceof Error) {
    const candidate = isRecord(error) && typeof error.code === 'string'
      ? error.code
      : error instanceof Error
        ? error.message
        : undefined;
    const code = typeof candidate === 'string' && /^[a-z0-9_]{1,80}$/u.test(candidate)
      ? candidate
      : undefined;
    if (code) {
      if (code === 'authority_denied') return { code, status: 403 };
      if (code === 'invalid_input' || code === 'invalid_claim') return { code, status: 400 };
      if (code.startsWith('material_book_source_attachment_')) {
        if (code.includes('authority_denied') || code.includes('wrong_owner')) return { code, status: 403 };
        if (code.includes('invalid')) return { code, status: 400 };
        return { code, status: 409 };
      }
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
        || code === 'operation_not_eligible'
        || code === 'cleanup_pending'
      ) {
        return { code, status: 409 };
      }
    }
  }
  return { code: 'book_source_upload_unavailable', status: 503 };
};

export interface BookSourceControlDispatchInput {
  readonly request: Request;
  readonly uid: string;
  readonly route: BookSourceControlRoute;
  readonly service: BookSourceUploadControlService;
  readonly executionContext?: ExecutionContext;
}

export interface BookSourceControlDispatchResult {
  readonly body: unknown;
  readonly init: { readonly status: number };
}

const dispatchResult = (body: unknown, status = 200): BookSourceControlDispatchResult => ({
  body,
  init: { status },
});

/** Trusted dispatch after the canonical HTTP boundary has authenticated and routed the request. */
export const dispatchBookSourceControlRequest = async ({
  request,
  uid,
  route,
  service,
  executionContext,
}: BookSourceControlDispatchInput): Promise<BookSourceControlDispatchResult> => {
  try {
    const deadlineAt = Date.now() + CONTROL_REQUEST_TIMEOUT_MS;
    if (route.action === 'status') {
      if (!service.status) throw new ControlRequestError('cleanup_unavailable', 503);
      return dispatchResult(await service.status({
        actorId: uid,
        bookId: route.bookId,
        reservationId: route.reservationId,
      }));
    }

    if (route.action === 'sources') {
      if (!service.sources) throw new ControlRequestError('source_projection_unavailable', 503);
      return dispatchResult(await service.sources({ actorId: uid, bookId: route.bookId }));
    }

    const body = await parseBody(request, deadlineAt);
    if (route.action === 'decideStudentSafeSource') {
      if (!service.decideStudentSafeSource
        || !exactKeys(body, ['operationId', 'studentSafeStatus', 'reasonCode'])) {
        throw new ControlRequestError(
          'invalid_student_safe_decision_request',
          service.decideStudentSafeSource ? 400 : 503,
        );
      }
      if (typeof body.operationId !== 'string' || !UUID.test(body.operationId)) {
        throw new ControlRequestError('invalid_operation_id', 400);
      }
      if (request.headers.get('idempotency-key') !== body.operationId) {
        throw new ControlRequestError('idempotency_mismatch', 409);
      }
      if (!['review-required', 'ready', 'rejected'].includes(String(body.studentSafeStatus))
        || !['teacher-reviewed', 'teacher-only-content', 'invalid-document', 'superseded']
          .includes(String(body.reasonCode))) {
        throw new ControlRequestError('invalid_student_safe_decision_request', 400);
      }
      const result = await service.decideStudentSafeSource({
        actorId: uid,
        bookId: route.bookId,
        reservationId: route.reservationId,
        operationId: body.operationId,
        studentSafeStatus: body.studentSafeStatus as Exclude<BookSourceStudentSafeStatus, 'unreviewed'>,
        reasonCode: body.reasonCode as BookSourceStudentSafeReasonCode,
      });
      const checksum = readTrustedSourceChecksum(result.checksum);
      const decision = isRecord(result.studentSafeDecision)
        ? result.studentSafeDecision
        : undefined;
      const safety = readTrustedSourceSafety(result, {
        sourceVersionId: result.sourceVersionId,
        checksum,
      });
      if (result.status !== 'verified_completed'
        || result.reservationId !== route.reservationId
        || result.purpose !== 'book-source'
        || result.studentSafeStatus !== body.studentSafeStatus
        || !checksum
        || !decision
        || !safety
        || safety.studentSafeDecision === undefined
        || safety.studentSafeDecision.decidedBy !== uid
        || safety.studentSafeDecision.reasonCode !== body.reasonCode
        || decision.sourceVersionId !== result.sourceVersionId
        || !SHA256.test(safety.studentSafeDecision.sha256Hex)
        || safety.studentSafeDecision.sha256Hex !== checksum.value) {
        throw new ControlRequestError('student_safe_decision_conflict', 409);
      }
      return dispatchResult({
        status: result.status,
        reservationId: result.reservationId,
        sourceVersionId: result.sourceVersionId,
        checksum,
        purpose: result.purpose,
        studentSafeStatus: result.studentSafeStatus,
        studentSafeDecision: safety.studentSafeDecision,
      });
    }
    if (route.action === 'attach') {
      if (!service.attachSourceSet
        || !exactKeys(body, ['operationId', 'expectedBookRevision', 'expectedSourceSetRevision', 'sourceSet'])) {
        throw new ControlRequestError('invalid_source_set_attach_request', service.attachSourceSet ? 400 : 503);
      }
      if (typeof body.operationId !== 'string' || !UUID.test(body.operationId)
        || request.headers.get('idempotency-key') !== body.operationId
        || !Number.isSafeInteger(body.expectedBookRevision) || (body.expectedBookRevision as number) < 0
        || !Number.isSafeInteger(body.expectedSourceSetRevision) || (body.expectedSourceSetRevision as number) < 0) {
        throw new ControlRequestError('invalid_source_set_attach_request', 400);
      }
      return dispatchResult(await service.attachSourceSet({
        actorId: uid,
        bookId: route.bookId,
        operationId: body.operationId,
        expectedBookRevision: body.expectedBookRevision as number,
        expectedSourceSetRevision: body.expectedSourceSetRevision as number,
        sourceSet: parseSourceSet(body.sourceSet),
      }));
    }

    if (route.action === 'begin') {
      if (!exactKeys(body, ['operationId', 'sourceKey', 'kind', 'purpose', 'inspection'])) {
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
      if (body.purpose !== 'book-source' && body.purpose !== 'student-document') {
        throw new ControlRequestError('invalid_upload_purpose', 400);
      }
      const result = await service.begin({
        actorId: uid,
        bookId: route.bookId,
        idempotencyKey: body.operationId,
        sourceKey: safeId(body.sourceKey, 'source_key'),
        kind: body.kind,
        purpose: body.purpose,
        claim: parseInspection(body.inspection),
      });
      return dispatchResult({
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

    if (route.action === 'cancel') {
      if (!service.requestCleanup) throw new ControlRequestError('cleanup_unavailable', 503);
      const hasIdentity = exactKeys(body, ['providerFileId', 'providerFileVersionId']);
      if (!hasIdentity && !exactKeys(body, [])) {
        throw new ControlRequestError('invalid_cancel_request', 400);
      }
      return dispatchResult(await service.requestCleanup({
        actorId: uid,
        bookId: route.bookId,
        reservationId: route.reservationId,
        reason: 'cancel_requested',
        ...(hasIdentity ? {
          providerFileId: safeId(body.providerFileId, 'provider_file_id'),
          providerFileVersionId: safeId(body.providerFileVersionId, 'provider_file_version_id'),
        } : {}),
      }));
    }

    if (route.action === 'retry' || route.action === 'reconcile') {
      if (!service.reconcile || !exactKeys(body, [])) {
        throw new ControlRequestError(
          route.action === 'retry' ? 'invalid_retry_request' : 'invalid_reconcile_request',
          service.reconcile ? 400 : 503,
        );
      }
      return dispatchResult(await service.reconcile({
        actorId: uid,
        bookId: route.bookId,
        reservationId: route.reservationId,
      }));
    }

    if (!exactKeys(body, ['operationId'])) {
      throw new ControlRequestError('invalid_complete_request', 400);
    }
    if (typeof body.operationId !== 'string' || !UUID.test(body.operationId)) {
      throw new ControlRequestError('invalid_operation_id', 400);
    }
    if (request.headers.get('idempotency-key') !== body.operationId) {
      throw new ControlRequestError('idempotency_mismatch', 409);
    }
    if (!executionContext) throw new ControlRequestError('cleanup_unavailable', 503);
    const result = await service.complete({
      actorId: uid,
      bookId: route.bookId,
      reservationId: route.reservationId,
      operationId: body.operationId,
    }, {
      signal: request.signal,
      deadlineAt,
      deferCleanup: (promise) => executionContext.waitUntil(promise),
    });
    const checksum = readTrustedSourceChecksum(result.checksum);
    if (!checksum
      || result.status !== 'verified_completed'
      || result.reservationId !== route.reservationId) {
      throw new ControlRequestError('completion_conflict', 409);
    }
    return dispatchResult({
      status: result.status,
      reservationId: result.reservationId,
      sourceVersionId: result.sourceVersionId,
      checksum,
    });
  } catch (error) {
    const failure = publicFailure(error);
    console.info('book_source_control_failure_detail', {
      code: failure.code,
      status: failure.status,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : undefined,
    });
    return dispatchResult({ code: failure.code }, failure.status);
  }
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

      const result = await dispatchBookSourceControlRequest({
        request,
        uid: authorization.uid,
        route,
        service: options.service,
      });
      return json(request, env, result.body, result.init.status);
    } catch (error) {
      const failure = publicFailure(error);
      console.info('book_source_control_failure_detail', {
        code: failure.code,
        status: failure.status,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : undefined,
      });
      return json(request, env, { code: failure.code }, failure.status);
    }
  },
});

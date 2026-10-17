import type {
  BookSourceChecksum,
  BookSourcePurpose,
  BookSourceStudentSafeDecision,
  BookSourceStudentSafeReasonCode,
  BookSourceStudentSafeStatus,
  BookSourceUploadKind,
} from '../../types/bookSource.types';
import type {
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import { sessionStore } from '../../core/platform/storage';
import type { SourceUploadInspectionClaim } from './sourceUpload.protocol';

export const BOOK_SOURCE_UPLOAD_ROUTE = '/v1/book-source/books';

export interface BeginSourceUploadCommand {
  readonly bookId: string;
  readonly operationId: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly purpose: BookSourcePurpose;
  readonly inspection: SourceUploadInspectionClaim;
}

export interface CompleteSourceUploadCommand {
  readonly bookId: string;
  readonly reservationId: string;
  readonly operationId: string;
}

export interface BeginSourceUploadResult {
  readonly status: 'reserved' | 'replayed';
  readonly reservationId: string;
  readonly sourceVersionId: string;
  readonly upload: {
    readonly url: string;
    readonly expiresAt: string;
    readonly requiredHeaders: Readonly<Record<string, string>>;
  };
}

export interface CompleteSourceUploadResult {
  readonly status: 'verified_completed' | 'replayed';
  readonly reservationId: string;
  readonly sourceVersionId: string;
  readonly checksum: BookSourceChecksum;
}

export interface DecideStudentSafeSourceCommand {
  readonly bookId: string;
  readonly reservationId: string;
  readonly operationId: string;
  readonly studentSafeStatus: Exclude<BookSourceStudentSafeStatus, 'unreviewed'>;
  readonly reasonCode: BookSourceStudentSafeReasonCode;
}

export interface DecideStudentSafeSourceResult {
  readonly status: 'verified_completed';
  readonly reservationId: string;
  readonly sourceVersionId: string;
  readonly checksum: BookSourceChecksum;
  readonly purpose: BookSourcePurpose;
  readonly studentSafeStatus: Exclude<BookSourceStudentSafeStatus, 'unreviewed'>;
  readonly studentSafeDecision: BookSourceStudentSafeDecision;
}

export interface AttachSourceSetCommand {
  readonly bookId: string;
  readonly operationId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
}

export interface AttachSourceSetResult {
  readonly status: 'attached' | 'replaced' | 'replayed';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
}

export interface CancelSourceUploadCommand {
  readonly bookId: string;
  readonly reservationId: string;
  readonly providerFileId?: string;
  readonly providerFileVersionId?: string;
}

export interface SourceUploadLifecycleStatus {
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly status: 'reserved' | 'cleanup_pending' | 'verified_completed' | 'released';
  readonly retryKind: 'bytes' | 'completion' | 'cleanup' | 'none';
  readonly nextRetryAt?: string;
  readonly lastErrorCode?: string;
}

interface SourceUploadSafeOperationBase {
  readonly schemaVersion: 1;
  readonly bookId: string;
  readonly operationId: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly purpose?: BookSourcePurpose;
  readonly displayFilename: string;
  readonly exactByteSize: number;
  readonly sha256Hex: string;
}

export interface SourceUploadBeginPendingState extends SourceUploadSafeOperationBase {
  readonly phase: 'begin_pending';
  readonly reservationId?: never;
  readonly sourceVersionId?: never;
  readonly providerFileId?: never;
  readonly providerFileVersionId?: never;
}

export interface SourceUploadBoundOperationState extends SourceUploadSafeOperationBase {
  readonly reservationId: string;
  readonly sourceVersionId: string;
  readonly phase:
    | 'reserved'
    | 'completion_pending'
    | 'cancel_requested'
    | 'verified';
  readonly providerFileId?: string;
  readonly providerFileVersionId?: string;
}

export type SourceUploadSafeOperationState =
  | SourceUploadBeginPendingState
  | SourceUploadBoundOperationState;

export interface SourceUploadStatePort {
  load(bookId: string): Promise<SourceUploadSafeOperationState | null>;
  save(state: SourceUploadSafeOperationState): Promise<void>;
  clear(bookId: string): Promise<void>;
}

export class SourceUploadClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(`source_upload_${code}`);
    this.name = 'SourceUploadClientError';
  }
}

export interface SourceUploadClientOptions {
  readonly baseUrl: string;
  /** Optional separately scoped #50 reconciliation Worker origin. */
  readonly reconciliationBaseUrl?: string;
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

export interface SourceSetAttachmentClient {
  attachSourceSet(command: AttachSourceSetCommand): Promise<AttachSourceSetResult>;
}

export type SourceUploadSourceVersionProjection = TrustedBookSourceVersionProjection & {
  readonly sourceKey: string;
};

export interface SourceUploadSourceVersionReader {
  listSourceVersions(bookId: string): Promise<readonly SourceUploadSourceVersionProjection[]>;
}

const trimBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, '');

const controlBaseUrl = (value: string): string => {
  const trimmed = trimBaseUrl(value);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SourceUploadClientError('unavailable', 0);
  }
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new SourceUploadClientError('unavailable', 0);
  }
  return url.href.replace(/\/$/u, '');
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0;

const readBody = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return record(await response.json()) ?? {};
  } catch {
    return {};
  }
};

const request = async (
  options: SourceUploadClientOptions,
  path: string,
  body?: unknown,
  operationId?: string,
  method: 'GET' | 'POST' = 'POST',
  baseUrlValue: string = options.baseUrl,
): Promise<Record<string, unknown>> => {
  const baseUrl = controlBaseUrl(baseUrlValue);

  const token = (await options.getIdToken()).trim();
  if (!token) throw new SourceUploadClientError('unauthorized', 401);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  if (operationId) headers['Idempotency-Key'] = operationId;

  const requestUrl = `${baseUrl}${path}`;
  const response = await (options.fetchImpl ?? globalThis.fetch)(requestUrl, {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    credentials: 'omit',
    redirect: 'error',
  });
  if (response.redirected || (response.url !== '' && response.url !== requestUrl)) {
    throw new SourceUploadClientError('response_binding_mismatch', 502);
  }
  const responseBody = await readBody(response);
  if (!response.ok) {
    throw new SourceUploadClientError(
      nonEmpty(responseBody.code) ? responseBody.code : `http_${response.status}`,
      response.status,
    );
  }
  return responseBody;
};

const safeId = (value: unknown): value is string =>
  nonEmpty(value) && /^[A-Za-z0-9._:-]{1,512}$/u.test(value);

const sourceSetCandidate = (value: unknown): SourceSetCandidate | null => {
  const candidate = record(value);
  if (!candidate
    || !exactKeys(candidate, ['sourceStrategy', 'sources'])
    || !Array.isArray(candidate.sources)
    || (candidate.sourceStrategy === 'full_pdf' && candidate.sources.length !== 1)
    || (candidate.sourceStrategy === 'component_pdfs'
      && (candidate.sources.length < 2 || candidate.sources.length > 20))) return null;
  if (candidate.sourceStrategy !== 'full_pdf' && candidate.sourceStrategy !== 'component_pdfs') return null;

  const sourceKeys = new Set<string>();
  const sourceVersions = new Set<string>();
  const sources = candidate.sources.map((entry, index) => {
    const source = record(entry);
    const keys = candidate.sourceStrategy === 'full_pdf'
      ? ['sourceKey', 'sourceOrder', 'sourceVersionId']
      : ['ownerNodeKey', 'sourceKey', 'sourceOrder', 'sourceVersionId'];
    if (!source
      || !exactKeys(source, keys)
      || !safeId(source.sourceKey)
      || !safeId(source.sourceVersionId)
      || !Number.isSafeInteger(source.sourceOrder)
      || source.sourceOrder !== index + 1
      || sourceKeys.has(source.sourceKey)
      || sourceVersions.has(source.sourceVersionId)
      || (candidate.sourceStrategy === 'component_pdfs' && !safeId(source.ownerNodeKey))) return null;
    sourceKeys.add(source.sourceKey);
    sourceVersions.add(source.sourceVersionId);
    return candidate.sourceStrategy === 'full_pdf'
      ? { sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId, sourceOrder: source.sourceOrder }
      : {
        ownerNodeKey: source.ownerNodeKey,
        sourceKey: source.sourceKey,
        sourceVersionId: source.sourceVersionId,
        sourceOrder: source.sourceOrder,
      };
  });
  if (sources.some((source) => source === null)) return null;
  return {
    sourceStrategy: candidate.sourceStrategy,
    sources: sources as unknown as SourceSetCandidate['sources'],
  } as SourceSetCandidate;
};

const safeProjectionId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value);

const projectionPurposes = ['book-source', 'student-document'] as const;
const projectionStatuses = ['unreviewed', 'review-required', 'ready', 'rejected'] as const;
const projectionReasonCodes = [
  'teacher-reviewed',
  'teacher-only-content',
  'invalid-document',
  'superseded',
] as const;
const projectionHash = /^[a-f0-9]{64}$/iu;
const projectionIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
};

const sourceVersionProjection = (
  value: unknown,
  bookId: string,
): SourceUploadSourceVersionProjection => {
  const candidate = record(value);
  const checksum = record(candidate?.checksum);
  const hasDecision = candidate?.studentSafeDecision !== undefined;
  const projectionKeys = [
    'bookId',
    'checksum',
    'physicalPageCount',
    'purpose',
    'sourceKey',
    'sourceVersionId',
    'studentSafeStatus',
    'verifiedUsable',
    ...(hasDecision ? ['studentSafeDecision'] : []),
  ];
  if (!candidate
    || !exactKeys(candidate, projectionKeys)
    || candidate.bookId !== bookId
    || !checksum
    || !exactKeys(checksum, ['algorithm', 'value'])
    || checksum.algorithm !== 'sha-256'
    || typeof checksum.value !== 'string'
    || !/^[a-f0-9]{64}$/u.test(checksum.value)
    || !safeProjectionId(candidate.bookId)
    || !safeProjectionId(candidate.sourceKey)
    || !safeProjectionId(candidate.sourceVersionId)
    || !Number.isSafeInteger(candidate.physicalPageCount)
    || (candidate.physicalPageCount as number) <= 0
    || !projectionPurposes.includes(candidate.purpose as typeof projectionPurposes[number])
    || !projectionStatuses.includes(candidate.studentSafeStatus as typeof projectionStatuses[number])
    || typeof candidate.verifiedUsable !== 'boolean'
    || (candidate.studentSafeStatus === 'unreviewed' ? hasDecision : !hasDecision)) {
    throw new SourceUploadClientError('invalid_response', 502);
  }
  let studentSafeDecision: SourceUploadSourceVersionProjection['studentSafeDecision'];
  if (hasDecision) {
    const decision = record(candidate.studentSafeDecision);
    if (!decision
      || !exactKeys(decision, [
        'decidedBy',
        'decidedAt',
        'sourceVersionId',
        'sha256Hex',
        'reasonCode',
      ])
      || !safeProjectionId(decision.decidedBy)
      || typeof decision.decidedAt !== 'string'
      || !projectionIso.test(decision.decidedAt)
      || !Number.isFinite(Date.parse(decision.decidedAt))
      || decision.sourceVersionId !== candidate.sourceVersionId
      || !safeProjectionId(decision.sourceVersionId)
      || typeof decision.sha256Hex !== 'string'
      || !projectionHash.test(decision.sha256Hex)
      || decision.sha256Hex !== checksum.value
      || !projectionReasonCodes.includes(decision.reasonCode as typeof projectionReasonCodes[number])) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    studentSafeDecision = Object.freeze({
      decidedBy: decision.decidedBy,
      decidedAt: decision.decidedAt,
      sourceVersionId: decision.sourceVersionId,
      sha256Hex: decision.sha256Hex.toLowerCase(),
      reasonCode: decision.reasonCode,
    }) as SourceUploadSourceVersionProjection['studentSafeDecision'];
  }
  return Object.freeze({
    sourceKey: candidate.sourceKey,
    sourceVersionId: candidate.sourceVersionId,
    bookId: candidate.bookId,
    checksum: Object.freeze({
      algorithm: 'sha-256',
      value: checksum.value,
    }) as BookSourceChecksum,
    physicalPageCount: candidate.physicalPageCount as number,
    verifiedUsable: candidate.verifiedUsable,
    purpose: candidate.purpose as SourceUploadSourceVersionProjection['purpose'],
    studentSafeStatus: candidate.studentSafeStatus as SourceUploadSourceVersionProjection['studentSafeStatus'],
    ...(studentSafeDecision === undefined ? {} : { studentSafeDecision }),
  });
};

const safeRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const lifecycleStatus = (
  value: Record<string, unknown>,
  command: Pick<CancelSourceUploadCommand, 'bookId' | 'reservationId'>,
): SourceUploadLifecycleStatus => {
  const allowed = new Set([
    'reservationId',
    'bookId',
    'sourceVersionId',
    'status',
    'retryKind',
    'nextRetryAt',
    'lastErrorCode',
  ]);
  if (!Object.keys(value).every((key) => allowed.has(key))
    || value.reservationId !== command.reservationId
    || value.bookId !== command.bookId
    || !safeId(value.sourceVersionId)
    || !['reserved', 'cleanup_pending', 'verified_completed', 'released'].includes(String(value.status))
    || !['bytes', 'completion', 'cleanup', 'none'].includes(String(value.retryKind))
    || (value.nextRetryAt !== undefined && !nonEmpty(value.nextRetryAt))
    || (value.lastErrorCode !== undefined
      && (typeof value.lastErrorCode !== 'string' || !/^[a-z0-9_]{1,80}$/u.test(value.lastErrorCode)))) {
    throw new SourceUploadClientError('invalid_response', 502);
  }
  return Object.freeze(value as unknown as SourceUploadLifecycleStatus);
};

const safeState = (value: unknown, bookId: string): SourceUploadSafeOperationState | null => {
  const candidate = record(value);
  if (!candidate || candidate.schemaVersion !== 1 || candidate.bookId !== bookId) return null;
  const allowedKeys = new Set([
    'schemaVersion',
    'bookId',
    'operationId',
    'reservationId',
    'sourceVersionId',
    'sourceKey',
    'kind',
    'purpose',
    'displayFilename',
    'exactByteSize',
    'sha256Hex',
    'phase',
    'providerFileId',
    'providerFileVersionId',
  ]);
  if (
    !Object.keys(candidate).every((key) => allowedKeys.has(key))
    || !safeId(candidate.bookId)
    || !safeId(candidate.operationId)
    || !safeId(candidate.sourceKey)
    || (candidate.kind !== 'initial' && candidate.kind !== 'replacement')
    || (candidate.purpose !== undefined
      && candidate.purpose !== 'book-source'
      && candidate.purpose !== 'student-document')
    || !nonEmpty(candidate.displayFilename)
    || !Number.isSafeInteger(candidate.exactByteSize)
    || (candidate.exactByteSize as number) < 1
    || typeof candidate.sha256Hex !== 'string'
    || !/^[a-f0-9]{64}$/u.test(candidate.sha256Hex)
    || !['begin_pending', 'reserved', 'completion_pending', 'cancel_requested', 'verified']
      .includes(String(candidate.phase))
  ) {
    return null;
  }
  if (candidate.phase === 'begin_pending') {
    if (
      candidate.reservationId !== undefined
      || candidate.sourceVersionId !== undefined
      || candidate.providerFileId !== undefined
      || candidate.providerFileVersionId !== undefined
    ) {
      return null;
    }
    return Object.freeze({
      schemaVersion: 1,
      bookId: candidate.bookId,
      operationId: candidate.operationId,
      sourceKey: candidate.sourceKey,
      kind: candidate.kind,
      ...(candidate.purpose === undefined ? {} : { purpose: candidate.purpose }),
      displayFilename: candidate.displayFilename,
      exactByteSize: candidate.exactByteSize as number,
      sha256Hex: candidate.sha256Hex,
      phase: 'begin_pending',
    } as SourceUploadBeginPendingState);
  }
  if (!safeId(candidate.reservationId) || !safeId(candidate.sourceVersionId)) {
    return null;
  }
  const hasProviderFileId = candidate.providerFileId !== undefined;
  const hasProviderVersionId = candidate.providerFileVersionId !== undefined;
  if (
    hasProviderFileId !== hasProviderVersionId
    || (
      hasProviderFileId
      && (!safeId(candidate.providerFileId) || !safeId(candidate.providerFileVersionId))
    )
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1,
    bookId: candidate.bookId,
    operationId: candidate.operationId,
    reservationId: candidate.reservationId,
    sourceVersionId: candidate.sourceVersionId,
    sourceKey: candidate.sourceKey,
    kind: candidate.kind,
    ...(candidate.purpose === undefined ? {} : { purpose: candidate.purpose }),
    displayFilename: candidate.displayFilename,
    exactByteSize: candidate.exactByteSize,
    sha256Hex: candidate.sha256Hex,
    phase: candidate.phase,
    ...(hasProviderFileId
      ? {
          providerFileId: candidate.providerFileId,
          providerFileVersionId: candidate.providerFileVersionId,
        }
      : {}),
  } as SourceUploadSafeOperationState);
};

const stateKey = (bookId: string, scopeKey = 'main'): string =>
  `prd0062:book-source-upload:v1:${encodeURIComponent(bookId)}:${encodeURIComponent(scopeKey)}`;

/** Session-scoped metadata only. Never stores bytes, ID tokens, signed URLs, or headers. */
export const createSourceUploadSessionStatePort = (options: {
  readonly scopeKey?: string;
} = {}): SourceUploadStatePort => ({
  async load(bookId) {
    const key = stateKey(bookId, options.scopeKey);
    const value = await sessionStore.get(key);
    const state = safeState(value, bookId);
    if (value !== null && !state) await sessionStore.remove(key);
    return state;
  },
  async save(state) {
    const validated = safeState(state, state.bookId);
    if (!validated) throw new SourceUploadClientError('invalid_state', 0);
    await sessionStore.set(stateKey(state.bookId, options.scopeKey), validated);
  },
  async clear(bookId) {
    await sessionStore.remove(stateKey(bookId, options.scopeKey));
  },
});

const requiredHeaders = (value: unknown): Readonly<Record<string, string>> | undefined => {
  const candidate = record(value);
  if (!candidate) return undefined;
  const entries = Object.entries(candidate);
  if (!entries.every(([key, headerValue]) => nonEmpty(key) && nonEmpty(headerValue))) return undefined;
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
};

const validUploadAuthority = (
  upload: Record<string, unknown>,
  headers: Readonly<Record<string, string>>,
  command: BeginSourceUploadCommand,
): boolean => {
  if (!nonEmpty(upload.url) || !nonEmpty(upload.expiresAt)) return false;
  let url: URL;
  try {
    url = new URL(upload.url);
  } catch {
    return false;
  }
  const expiresAt = Date.parse(upload.expiresAt);
  const headerEntries = Object.entries(headers);
  const normalizedEntries = headerEntries.map(([key, value]) => [key.toLowerCase(), value] as const);
  const normalizedHeaders = Object.fromEntries(normalizedEntries);
  const allowedHeaders = [
    'content-type',
    'x-amz-content-sha256',
    'x-amz-meta-book-source-byte-size',
    'x-amz-meta-book-source-sha256',
  ];
  const checksum = command.inspection.sha256Hex.toLowerCase();
  return url.protocol === 'https:'
    && url.username === ''
    && url.password === ''
    && url.hash === ''
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
    && headerEntries.length === allowedHeaders.length
    && new Set(normalizedEntries.map(([key]) => key)).size === allowedHeaders.length
    && allowedHeaders.every((key) => Object.hasOwn(normalizedHeaders, key))
    && normalizedHeaders['content-type'] === 'application/pdf'
    && normalizedHeaders['x-amz-content-sha256'] === checksum
    && normalizedHeaders['x-amz-meta-book-source-byte-size'] === String(command.inspection.exactByteSize)
    && normalizedHeaders['x-amz-meta-book-source-sha256'] === checksum;
};

export const createSourceUploadClient = (options: SourceUploadClientOptions) => ({
  async begin(command: BeginSourceUploadCommand): Promise<BeginSourceUploadResult> {
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/begin`,
      {
        operationId: command.operationId,
        sourceKey: command.sourceKey,
        kind: command.kind,
        purpose: command.purpose,
        inspection: command.inspection,
      },
      command.operationId,
    );
    const upload = record(body.upload);
    const headers = requiredHeaders(upload?.requiredHeaders);
    if (
      (body.status !== 'reserved' && body.status !== 'replayed')
      || !nonEmpty(body.reservationId)
      || !nonEmpty(body.sourceVersionId)
      || !headers
      || !upload
      || !validUploadAuthority(upload, headers, command)
    ) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    return {
      status: body.status,
      reservationId: body.reservationId,
      sourceVersionId: body.sourceVersionId,
      upload: {
        url: upload.url as string,
        expiresAt: upload.expiresAt as string,
        requiredHeaders: headers,
      },
    };
  },

  async complete(command: CompleteSourceUploadCommand): Promise<CompleteSourceUploadResult> {
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/${encodeURIComponent(command.reservationId)}/complete`,
      { operationId: command.operationId },
      command.operationId,
    );
    const checksum = record(body.checksum);
    if (
      !exactKeys(body, ['checksum', 'reservationId', 'sourceVersionId', 'status'])
      ||
      (body.status !== 'verified_completed' && body.status !== 'replayed')
      || body.reservationId !== command.reservationId
      || !nonEmpty(body.sourceVersionId)
      || !checksum
      || !exactKeys(checksum, ['algorithm', 'value'])
      || checksum.algorithm !== 'sha-256'
      || typeof checksum.value !== 'string'
      || !projectionHash.test(checksum.value)
    ) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    return {
      status: body.status,
      reservationId: command.reservationId,
      sourceVersionId: body.sourceVersionId,
      checksum: {
        algorithm: 'sha-256',
        value: checksum.value.toLowerCase(),
      },
    };
  },

  async decideStudentSafeSource(
    command: DecideStudentSafeSourceCommand,
  ): Promise<DecideStudentSafeSourceResult> {
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/${encodeURIComponent(command.reservationId)}/student-safe/decide`,
      {
        operationId: command.operationId,
        studentSafeStatus: command.studentSafeStatus,
        reasonCode: command.reasonCode,
      },
      command.operationId,
    );
    const decision = record(body.studentSafeDecision);
    const checksum = record(body.checksum);
    if (
      body.status !== 'verified_completed'
      || body.reservationId !== command.reservationId
      || !safeId(body.sourceVersionId)
      || !checksum
      || !exactKeys(checksum, ['algorithm', 'value'])
      || checksum.algorithm !== 'sha-256'
      || typeof checksum.value !== 'string'
      || !projectionHash.test(checksum.value)
      || !projectionPurposes.includes(body.purpose as BookSourcePurpose)
      || body.studentSafeStatus !== command.studentSafeStatus
      || !['review-required', 'ready', 'rejected'].includes(String(body.studentSafeStatus))
      || !decision
      || !exactKeys(decision, ['decidedBy', 'decidedAt', 'sourceVersionId', 'sha256Hex', 'reasonCode'])
      || !safeProjectionId(decision.decidedBy)
      || typeof decision.decidedAt !== 'string'
      || !projectionIso.test(decision.decidedAt)
      || !Number.isFinite(Date.parse(decision.decidedAt))
      || decision.sourceVersionId !== body.sourceVersionId
      || decision.reasonCode !== command.reasonCode
      || typeof decision.sha256Hex !== 'string'
      || !projectionHash.test(decision.sha256Hex)
      || decision.sha256Hex.toLowerCase() !== checksum.value.toLowerCase()
      || !projectionReasonCodes.includes(decision.reasonCode as typeof projectionReasonCodes[number])
    ) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    return {
      status: 'verified_completed',
      reservationId: command.reservationId,
      sourceVersionId: body.sourceVersionId,
      checksum: {
        algorithm: 'sha-256',
        value: checksum.value.toLowerCase(),
      },
      purpose: body.purpose as BookSourcePurpose,
      studentSafeStatus: body.studentSafeStatus as DecideStudentSafeSourceResult['studentSafeStatus'],
      studentSafeDecision: {
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
        sourceVersionId: decision.sourceVersionId,
        sha256Hex: decision.sha256Hex.toLowerCase(),
        reasonCode: decision.reasonCode as BookSourceStudentSafeReasonCode,
      },
    };
  },

  async attachSourceSet(command: AttachSourceSetCommand): Promise<AttachSourceSetResult> {
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/source-set/attach`,
      {
        operationId: command.operationId,
        expectedBookRevision: command.expectedBookRevision,
        expectedSourceSetRevision: command.expectedSourceSetRevision,
        sourceSet: command.sourceSet,
      },
      command.operationId,
    );
    const sourceSet = sourceSetCandidate(body.sourceSet);
    if (!['attached', 'replaced', 'replayed'].includes(String(body.status))
      || !safeRevision(body.bookRevision)
      || !safeRevision(body.sourceSetRevision)
      || !sourceSet) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    return {
      status: body.status as AttachSourceSetResult['status'],
      bookRevision: body.bookRevision as number,
      sourceSetRevision: body.sourceSetRevision as number,
      sourceSet,
    };
  },

  /**
   * Browser-side request seam for Ticket 07 cleanup. A response confirms only
   * request receipt; it never claims provider deletion.
   */
  async requestCancellation(command: CancelSourceUploadCommand): Promise<void> {
    const hasProviderIdentity = command.providerFileId !== undefined
      || command.providerFileVersionId !== undefined;
    if (hasProviderIdentity
      && (!safeId(command.providerFileId) || !safeId(command.providerFileVersionId))) {
      throw new SourceUploadClientError('invalid_operation', 0);
    }
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/${encodeURIComponent(command.reservationId)}/cancel`,
      hasProviderIdentity ? {
        providerFileId: command.providerFileId,
        providerFileVersionId: command.providerFileVersionId,
      } : {},
    );
    if (Object.keys(body).length === 1
      && (body.status === 'cancellation_requested' || body.status === 'released')) return;
    lifecycleStatus(body, command);
  },

  async status(command: Pick<CancelSourceUploadCommand, 'bookId' | 'reservationId'>): Promise<SourceUploadLifecycleStatus> {
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/${encodeURIComponent(command.reservationId)}/status`,
      undefined,
      undefined,
      'GET',
    );
    return lifecycleStatus(body, command);
  },

  async listSourceVersions(bookId: string): Promise<readonly SourceUploadSourceVersionProjection[]> {
    if (!nonEmpty(bookId)) throw new SourceUploadClientError('invalid_input', 0);
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(bookId)}/sources`,
      undefined,
      undefined,
      'GET',
    );
    if (Object.keys(body).length !== 1 || !Array.isArray(body.sources) || body.sources.length > 128) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    return Object.freeze(body.sources
      .map((source) => sourceVersionProjection(source, bookId))
      .filter((source) => source.purpose === 'book-source'
        && source.studentSafeStatus !== 'rejected'
        && source.verifiedUsable));
  },

  async reconcile(command: Pick<CancelSourceUploadCommand, 'bookId' | 'reservationId'>): Promise<SourceUploadLifecycleStatus> {
    const reconciliationBaseUrl = options.reconciliationBaseUrl?.trim();
    if (!reconciliationBaseUrl) {
      throw new SourceUploadClientError('unavailable', 503);
    }
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/${encodeURIComponent(command.reservationId)}/reconcile`,
      {},
      undefined,
      'POST',
      reconciliationBaseUrl,
    );
    return lifecycleStatus(body, command);
  },
});

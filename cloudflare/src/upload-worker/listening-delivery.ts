import {
  issueListeningAssetDeliveryUrl,
  refreshListeningAssetDeliveryUrl,
  ListeningAssetDeliveryError,
  type IssueListeningAssetDeliveryUrlInput,
  type ListeningAssetDeliveryDependencies,
  type ListeningDeliveryAssetGraph,
  type ListeningDeliveryIssuedUrl,
  type ListeningDeliveryLiveScope,
  type ListeningDeliveryRefreshedUrl,
  type ListeningDeliveryRangeProbeRequest,
  type ListeningDeliveryRangeProbeResult,
  type ListeningDeliveryRetainedLiveSession,
  type ListeningDeliveryRetainedResult,
  type ListeningDeliveryRetainedSoloAccess,
  type ListeningDeliveryRetainedVersion,
  type RefreshListeningAssetDeliveryUrlInput,
} from '../../../src/features/assessment/listening/storage/listeningAssetDelivery.service.ts';
import type { ListeningMediaAssetReferences } from '../../../src/features/assessment/listening/storage/listeningAssetRegistry.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from './listening-authoring/rtdb.ts';

export interface ListeningDeliveryWorkerIssuer {
  issue(input: IssueListeningAssetDeliveryUrlInput): Promise<ListeningDeliveryIssuedUrl>;
  refresh?(input: RefreshListeningAssetDeliveryUrlInput): Promise<ListeningDeliveryRefreshedUrl>;
}

type WorkerEnv = RepositoryEnv & Record<string, unknown> & {
  LISTENING_DELIVERY_SECRET?: string;
  FIREBASE_DATABASE_EMULATOR_URL?: string;
  readDatabaseValue?: (path: string) => Promise<unknown>;
  resolveListeningDeliveryAssetGraph?: (assetId: string) => Promise<ListeningDeliveryAssetGraph | null>;
  createListeningAuthorizedUrl?: ListeningAssetDeliveryDependencies['signer']['createAuthorizedUrl'];
  probeListeningDeliveryRange?: (
    input: ListeningDeliveryRangeProbeRequest,
  ) => Promise<ListeningDeliveryRangeProbeResult>;
  R2_BUCKET?: {
    get?: (key: string, options?: unknown) => Promise<unknown>;
    head?: (key: string) => Promise<unknown>;
  };
};

export class ListeningDeliveryWorkerError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) {
    super(code);
    this.name = 'ListeningDeliveryWorkerError';
  }
}

const BROWSER_AUTHORITY_FIELDS = [
  'ownerId',
  'callerUserId',
  'context',
  'runtime',
  'durableKey',
  'url',
  'tokenId',
  'issuedAt',
  'expiresAt',
  'refreshAfter',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DELIVERY_TOKEN_VERSION = 1;
const DELIVERY_CONTENT_PATH = '/listening-delivery/content';
const MIN_DELIVERY_SECRET_LENGTH = 32;
const DELIVERY_TTL_MS = 60 * 60 * 1000;
const DELIVERY_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

interface ListeningDeliveryContentToken {
  readonly version: 1;
  readonly tokenId: string;
  readonly assetId: string;
  readonly durableKey: string;
  readonly contentType: string;
  readonly expiresAt: number;
}

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const base64UrlToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const requireDeliverySecret = (env: WorkerEnv): string => {
  const secret = env.LISTENING_DELIVERY_SECRET;
  if (typeof secret !== 'string' || secret.length < MIN_DELIVERY_SECRET_LENGTH) {
    throw new ListeningDeliveryWorkerError('delivery_secret_unavailable', 500);
  }
  return secret;
};

const importDeliveryHmacKey = (
  env: WorkerEnv,
  usages: KeyUsage[],
): Promise<CryptoKey> => crypto.subtle.importKey(
  'raw',
  textEncoder.encode(requireDeliverySecret(env)),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  usages,
);

const createOpaqueId = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

const createDeliveryContentToken = async (
  env: WorkerEnv,
  payload: ListeningDeliveryContentToken,
): Promise<string> => {
  const encodedPayload = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importDeliveryHmacKey(env, ['sign']),
    textEncoder.encode(encodedPayload),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
};

const readDeliveryContentToken = async (
  env: WorkerEnv,
  rawToken: string,
  now: number,
): Promise<ListeningDeliveryContentToken> => {
  const [encodedPayload, encodedSignature, extra] = rawToken.split('.');
  if (!encodedPayload || !encodedSignature || extra) {
    throw new ListeningDeliveryWorkerError('delivery_token_invalid', 403);
  }

  let signature: Uint8Array;
  let payload: unknown;
  try {
    signature = base64UrlToBytes(encodedSignature);
    payload = JSON.parse(textDecoder.decode(base64UrlToBytes(encodedPayload)));
  } catch {
    throw new ListeningDeliveryWorkerError('delivery_token_invalid', 403);
  }

  const signatureValid = await crypto.subtle.verify(
    'HMAC',
    await importDeliveryHmacKey(env, ['verify']),
    signature,
    textEncoder.encode(encodedPayload),
  );
  if (!signatureValid || !isRecord(payload)) {
    throw new ListeningDeliveryWorkerError('delivery_token_invalid', 403);
  }

  if (
    payload.version !== DELIVERY_TOKEN_VERSION
    || typeof payload.tokenId !== 'string'
    || !payload.tokenId
    || typeof payload.assetId !== 'string'
    || !payload.assetId
    || typeof payload.durableKey !== 'string'
    || !payload.durableKey
    || typeof payload.contentType !== 'string'
    || !payload.contentType
    || !Number.isSafeInteger(payload.expiresAt)
  ) {
    throw new ListeningDeliveryWorkerError('delivery_token_invalid', 403);
  }
  if (now >= Number(payload.expiresAt)) {
    throw new ListeningDeliveryWorkerError('delivery_token_expired', 403);
  }

  return payload as unknown as ListeningDeliveryContentToken;
};

const readJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) return {};
  try {
    return await request.json();
  } catch {
    throw new ListeningDeliveryWorkerError('invalid_request', 400);
  }
};

const requireString = (
  body: Record<string, unknown>,
  field: 'assetId' | 'resultId' | 'versionId' | 'testId' | 'mode' | 'sessionCode',
): string => {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ListeningDeliveryWorkerError(`${field}_required`, 400);
  }
  return value.trim();
};

const requireDatabaseKey = (
  body: Record<string, unknown>,
  field: 'assetId' | 'versionId' | 'testId' | 'sessionCode',
): string => {
  const value = requireString(body, field);
  if (value.length > 256 || /[.#$\[\]\/\u0000-\u001f\u007f]/.test(value)) {
    throw new ListeningDeliveryWorkerError(`${field}_invalid`, 400);
  }
  return value;
};

const requireSoloMode = (body: Record<string, unknown>) => {
  const mode = requireString(body, 'mode');
  if (mode !== 'self_study' && mode !== 'course_material' && mode !== 'homework') {
    throw new ListeningDeliveryWorkerError('mode_invalid', 400);
  }
  return mode;
};

const optionalString = (body: Record<string, unknown>, field: string): string | undefined => {
  const value = body[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const optionalNumber = (body: Record<string, unknown>, field: string): number | undefined => {
  const value = body[field];
  return Number.isSafeInteger(value) ? value : undefined;
};

const requirePositiveNumber = (body: Record<string, unknown>, field: string): number => {
  const value = optionalNumber(body, field);
  if (value === undefined || value <= 0) {
    throw new ListeningDeliveryWorkerError(`${field}_required`, 400);
  }
  return value;
};

const assertNoBrowserAuthority = (body: Record<string, unknown>): void => {
  for (const field of BROWSER_AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      throw new ListeningDeliveryWorkerError('browser_authority_not_allowed', 400);
    }
  }
};

const normalizeBooleanMap = (value: unknown): Record<string, true> | undefined => {
  if (!isRecord(value)) return undefined;
  const normalized: Record<string, true> = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled === true) normalized[key] = true;
  }
  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeReferences = (value: unknown): ListeningMediaAssetReferences => {
  const references = isRecord(value) ? value : {};
  return {
    drafts: normalizeBooleanMap(references.drafts),
    tests: normalizeBooleanMap(references.tests),
    versions: normalizeBooleanMap(references.versions),
    results: normalizeBooleanMap(references.results),
    assignments: normalizeBooleanMap(references.assignments),
    sessions: normalizeBooleanMap(references.sessions),
  };
};

const normalizeArray = <T>(
  value: unknown,
  normalize: (entry: Record<string, unknown>) => T | null,
): readonly T[] => {
  const rawEntries = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return rawEntries
    .filter(isRecord)
    .map(normalize)
    .filter((entry): entry is T => entry !== null);
};

const normalizeStringArray = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()));
  return entries.length ? entries : undefined;
};

const normalizeNumberArray = (value: unknown): readonly number[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is number => Number.isSafeInteger(entry));
  return entries.length ? entries : undefined;
};

const normalizeRetainedVersions = (value: unknown): readonly ListeningDeliveryRetainedVersion[] =>
  normalizeArray(value, (entry) => {
    const versionId = typeof entry.versionId === 'string' ? entry.versionId : '';
    const ownerId = typeof entry.ownerId === 'string' ? entry.ownerId : '';
    if (!versionId || !ownerId) return null;
    return {
      versionId,
      ownerId,
      immutable: entry.immutable === true,
      active: entry.active === true,
    };
  });

const normalizeRetainedResults = (value: unknown): readonly ListeningDeliveryRetainedResult[] =>
  normalizeArray(value, (entry) => {
    const resultId = typeof entry.resultId === 'string' ? entry.resultId : '';
    const versionId = typeof entry.versionId === 'string' ? entry.versionId : '';
    const viewers = Array.isArray(entry.viewerUserIds)
      ? entry.viewerUserIds.filter((viewer): viewer is string => typeof viewer === 'string')
      : [];
    if (!resultId || !versionId) return null;
    return {
      resultId,
      versionId,
      active: entry.active === true,
      viewerUserIds: viewers,
    };
  });

const normalizeRetainedSoloAccess = (value: unknown): readonly ListeningDeliveryRetainedSoloAccess[] =>
  normalizeArray(value, (entry) => {
    const testId = typeof entry.testId === 'string' ? entry.testId : '';
    const versionId = typeof entry.versionId === 'string' ? entry.versionId : '';
    const studentUserIds = normalizeStringArray(entry.studentUserIds) ?? [];
    if (!testId || !versionId || studentUserIds.length === 0) return null;
    return {
      testId,
      versionId,
      active: entry.active === true,
      studentUserIds,
      modes: normalizeStringArray(entry.modes) as ListeningDeliveryRetainedSoloAccess['modes'],
      courseIds: normalizeStringArray(entry.courseIds),
      moduleIds: normalizeStringArray(entry.moduleIds),
      homeworkIds: normalizeStringArray(entry.homeworkIds),
      submissionIds: normalizeStringArray(entry.submissionIds),
    };
  });

const normalizeRetainedLiveSessions = (value: unknown): readonly ListeningDeliveryRetainedLiveSession[] =>
  normalizeArray(value, (entry) => {
    const sessionCode = typeof entry.sessionCode === 'string' ? entry.sessionCode : '';
    const testId = typeof entry.testId === 'string' ? entry.testId : '';
    const versionId = typeof entry.versionId === 'string' ? entry.versionId : '';
    const studentUserIds = normalizeStringArray(entry.studentUserIds) ?? [];
    if (!sessionCode || !testId || !versionId || studentUserIds.length === 0) return null;
    return {
      sessionCode,
      testId,
      versionId,
      active: entry.active === true,
      studentUserIds,
      classIds: normalizeStringArray(entry.classIds),
      sectionNumbers: normalizeNumberArray(entry.sectionNumbers),
    };
  });

const normalizeAssetGraph = (
  requestedAssetId: string,
  record: Record<string, unknown>,
): ListeningDeliveryAssetGraph | null => {
  const assetId = typeof record.assetId === 'string' ? record.assetId : requestedAssetId;
  const ownerId = typeof record.ownerId === 'string' ? record.ownerId : '';
  const state = typeof record.state === 'string' ? record.state : '';
  const durableKey = typeof record.durableKey === 'string'
    ? record.durableKey
    : typeof record.tempKey === 'string'
      ? record.tempKey
      : '';
  const contentType = typeof record.contentType === 'string' ? record.contentType : '';
  const sizeBytes = typeof record.sizeBytes === 'number' ? record.sizeBytes : Number(record.sizeBytes);
  if (!ownerId || !state || !durableKey || !contentType || !Number.isSafeInteger(sizeBytes)) {
    return null;
  }

  return {
    assetId,
    canonicalAssetId: typeof record.canonicalAssetId === 'string'
      ? record.canonicalAssetId
      : assetId,
    ownerId,
    state: state as ListeningDeliveryAssetGraph['state'],
    durableKey,
    contentType,
    sizeBytes,
    references: normalizeReferences(record.references),
    retainedVersions: normalizeRetainedVersions(record.retainedVersions),
    retainedResults: normalizeRetainedResults(record.retainedResults),
    retainedSoloAccess: normalizeRetainedSoloAccess(record.retainedSoloAccess),
    retainedLiveSessions: normalizeRetainedLiveSessions(record.retainedLiveSessions),
  };
};

const bodyLength = async (value: unknown): Promise<number> => {
  if (typeof value === 'string') return value.length;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  if (isRecord(value) && typeof value.arrayBuffer === 'function') {
    return (await (value.arrayBuffer as () => Promise<ArrayBuffer>)()).byteLength;
  }
  if (isRecord(value) && value.body) {
    return (await new Response(value.body as BodyInit).arrayBuffer()).byteLength;
  }
  return 0;
};

const probeR2Range = async (
  env: WorkerEnv,
  input: ListeningDeliveryRangeProbeRequest,
): Promise<ListeningDeliveryRangeProbeResult> => {
  const bucket = env.R2_BUCKET;
  if (!bucket?.get) {
    throw new ListeningDeliveryWorkerError('delivery_range_probe_unavailable', 500);
  }
  const object = await bucket.get(input.durableKey, {
    range: { offset: 0, length: 1 },
  });
  if (!isRecord(object)) {
    return {
      requestRange: input.rangeHeader,
      status: 404,
      headers: {},
      bodyLengthBytes: 0,
    };
  }
  const size = typeof object.size === 'number'
    ? object.size
    : Number(object.size);
  const length = await bodyLength(object);
  return {
    requestRange: input.rangeHeader,
    status: 206,
    headers: {
      'accept-ranges': 'bytes',
      'content-length': length,
      'content-range': `bytes 0-${Math.max(0, length - 1)}/${size}`,
    },
    bodyLengthBytes: length,
  };
};

const readWorkerDatabaseValue = async (
  env: WorkerEnv,
  path: string,
): Promise<unknown> => {
  if (typeof env.readDatabaseValue === 'function') {
    return env.readDatabaseValue(path);
  }
  if (typeof env.FIREBASE_DATABASE_EMULATOR_URL === 'string') {
    const emulatorUrl = new URL(env.FIREBASE_DATABASE_EMULATOR_URL);
    if (
      emulatorUrl.protocol !== 'http:'
      || (emulatorUrl.hostname !== 'localhost' && emulatorUrl.hostname !== '127.0.0.1')
    ) {
      throw new ListeningDeliveryWorkerError('delivery_emulator_url_invalid', 500);
    }
    const response = await fetch(
      `${emulatorUrl.toString().replace(/\/$/, '')}/${path}.json`,
    );
    if (!response.ok) {
      throw new ListeningDeliveryWorkerError('delivery_emulator_read_failed', 500);
    }
    return response.json();
  }
  return new FirebaseRtdbRestClient({
    env,
    fetchImpl: globalThis.fetch.bind(globalThis),
  }).readValue(path);
};

const readNestedString = (
  record: Record<string, unknown>,
  field: string,
): string | undefined => {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const readAuthoritativeVersionId = (test: Record<string, unknown>): string | undefined => {
  const authoringVersioning = isRecord(test.authoringVersioning)
    ? test.authoringVersioning
    : undefined;
  return (
    (authoringVersioning ? readNestedString(authoringVersioning, 'versionId') : undefined)
    ?? readNestedString(test, 'versionId')
    ?? readNestedString(test, 'latestPublishedVersionId')
    ?? readNestedString(test, 'publishedVersionId')
  );
};

const findAuthoritativeAudioSection = (
  test: Record<string, unknown>,
  sectionNumber: number,
): Record<string, unknown> | undefined => {
  const sections = Array.isArray(test.audioSections)
    ? test.audioSections
    : isRecord(test.audioSections)
      ? Object.values(test.audioSections)
      : [];
  return sections
    .filter(isRecord)
    .find((section) => Number(section.number) === sectionNumber);
};

const readSessionTeacherUserIds = (sessionValue: Record<string, unknown>): readonly string[] => (
  [
    readNestedString(sessionValue, 'createdByUserId'),
    readNestedString(sessionValue, 'createdBy'),
    readNestedString(sessionValue, 'teacherId'),
  ].filter((value, index, values): value is string =>
    typeof value === 'string' && values.indexOf(value) === index)
);

const resolveCurrentLiveAuthorization = async (
  env: WorkerEnv,
  scope: ListeningDeliveryLiveScope,
  callerUserId: string,
  assetId: string,
): Promise<{
  readonly scope: ListeningDeliveryLiveScope;
  readonly retainedSession: ListeningDeliveryRetainedLiveSession;
}> => {
  const sessionValue = await readWorkerDatabaseValue(
    env,
    `game_sessions/${scope.sessionCode}`,
  );
  if (!isRecord(sessionValue) || sessionValue.status !== 'in-progress') {
    throw new ListeningDeliveryWorkerError('delivery_live_session_inactive', 403);
  }
  if (readNestedString(sessionValue, 'testId') !== scope.testId) {
    throw new ListeningDeliveryWorkerError('delivery_live_scope_mismatch', 403);
  }

  const players = isRecord(sessionValue.players) ? sessionValue.players : {};
  const students = isRecord(sessionValue.students) ? sessionValue.students : {};
  const bannedPlayers = isRecord(sessionValue.bannedPlayers) ? sessionValue.bannedPlayers : {};
  const teacherUserIds = readSessionTeacherUserIds(sessionValue);
  const callerIsTeacher = teacherUserIds.includes(callerUserId);
  const callerIsPlayer = (
    Object.prototype.hasOwnProperty.call(players, callerUserId)
    || Object.prototype.hasOwnProperty.call(students, callerUserId)
  );
  if (
    (!callerIsTeacher && !callerIsPlayer)
    || Object.prototype.hasOwnProperty.call(bannedPlayers, callerUserId)
  ) {
    throw new ListeningDeliveryWorkerError('delivery_not_authorized', 403);
  }

  const testValue = await readWorkerDatabaseValue(env, `tests/${scope.testId}`);
  if (
    !isRecord(testValue)
    || readAuthoritativeVersionId(testValue) !== scope.versionId
    || scope.sectionNumber === undefined
  ) {
    throw new ListeningDeliveryWorkerError('delivery_live_scope_mismatch', 403);
  }
  const section = findAuthoritativeAudioSection(testValue, scope.sectionNumber);
  if (!section || readNestedString(section, 'assetId') !== assetId) {
    throw new ListeningDeliveryWorkerError('delivery_live_asset_mismatch', 403);
  }

  const classId = readNestedString(sessionValue, 'classId');
  const authoritativeScope: ListeningDeliveryLiveScope = {
    sessionCode: scope.sessionCode,
    testId: scope.testId,
    versionId: scope.versionId,
    studentId: callerUserId,
    classId,
    sectionNumber: scope.sectionNumber,
  };
  return {
    scope: authoritativeScope,
    retainedSession: {
      sessionCode: scope.sessionCode,
      testId: scope.testId,
      versionId: scope.versionId,
      active: true,
      studentUserIds: [callerUserId],
      classIds: classId ? [classId] : undefined,
      sectionNumbers: [scope.sectionNumber],
    },
  };
};

const createDeliveryDependencies = (
  env: WorkerEnv,
  requestUrl?: string,
  liveAuthorization?: ListeningDeliveryRetainedLiveSession,
): ListeningAssetDeliveryDependencies => ({
  referenceGraph: {
    async resolveCanonicalAssetGraph(assetId) {
      if (typeof env.resolveListeningDeliveryAssetGraph === 'function') {
        return env.resolveListeningDeliveryAssetGraph(assetId);
      }
      const record = await readWorkerDatabaseValue(env, `media_assets/${assetId}`);
      if (!isRecord(record)) return null;
      const graph = normalizeAssetGraph(assetId, record);
      return graph && liveAuthorization
        ? { ...graph, retainedLiveSessions: [liveAuthorization] }
        : graph;
    },
  },
  signer: {
    async createAuthorizedUrl(input) {
      if (typeof env.createListeningAuthorizedUrl === 'function') {
        return env.createListeningAuthorizedUrl(input);
      }
      if (!requestUrl) {
        throw new ListeningDeliveryWorkerError('delivery_request_origin_unavailable', 500);
      }
      const tokenId = createOpaqueId();
      const token = await createDeliveryContentToken(env, {
        version: DELIVERY_TOKEN_VERSION,
        tokenId,
        assetId: input.assetId,
        durableKey: input.durableKey,
        contentType: input.contentType,
        expiresAt: input.expiresAt,
      });
      const url = new URL(DELIVERY_CONTENT_PATH, requestUrl);
      url.search = '';
      url.searchParams.set('token', token);
      return {
        url: url.toString(),
        tokenId,
      };
    },
  },
  rangeProbe: {
    async probe(input) {
      if (typeof env.probeListeningDeliveryRange === 'function') {
        return env.probeListeningDeliveryRange(input);
      }
      return probeR2Range(env, input);
    },
  },
});

const assertSignedPreviousDelivery = async (
  env: WorkerEnv,
  requestUrl: string | undefined,
  input: RefreshListeningAssetDeliveryUrlInput,
): Promise<void> => {
  if (!requestUrl) {
    throw new ListeningDeliveryWorkerError('delivery_request_origin_unavailable', 500);
  }
  let previousUrl: URL;
  let currentUrl: URL;
  try {
    previousUrl = new URL(input.previous.url);
    currentUrl = new URL(requestUrl);
  } catch {
    throw new ListeningDeliveryWorkerError('previous_delivery_invalid', 400);
  }
  const token = previousUrl.searchParams.get('token');
  if (
    previousUrl.origin !== currentUrl.origin
    || previousUrl.pathname !== DELIVERY_CONTENT_PATH
    || !token
    || [...previousUrl.searchParams.keys()].some((key) => key !== 'token')
  ) {
    throw new ListeningDeliveryWorkerError('previous_delivery_invalid', 400);
  }

  const signed = await readDeliveryContentToken(env, token, input.now);
  const expectedIssuedAt = signed.expiresAt - DELIVERY_TTL_MS;
  const expectedRefreshAfter = signed.expiresAt - DELIVERY_REFRESH_THRESHOLD_MS;
  if (
    signed.assetId !== input.previous.assetId
    || signed.tokenId !== input.previous.tokenId
    || signed.expiresAt !== input.previous.expiresAt
    || input.previous.issuedAt !== expectedIssuedAt
    || input.previous.refreshAfter !== expectedRefreshAfter
    || input.previous.ttlMs !== DELIVERY_TTL_MS
  ) {
    throw new ListeningDeliveryWorkerError('previous_delivery_invalid', 400);
  }
};

const createWorkerBoundIssuer = (
  env: WorkerEnv,
  requestUrl?: string,
): ListeningDeliveryWorkerIssuer => ({
  async issue(input) {
    const liveAuthorization = input.liveScope
      ? await resolveCurrentLiveAuthorization(
          env,
          input.liveScope,
          input.context.callerUserId,
          input.assetId,
        )
      : undefined;
    const authorizedInput = liveAuthorization
      ? { ...input, liveScope: liveAuthorization.scope }
      : input;
    return issueListeningAssetDeliveryUrl(
      authorizedInput,
      createDeliveryDependencies(env, requestUrl, liveAuthorization?.retainedSession),
    );
  },
  async refresh(input) {
    await assertSignedPreviousDelivery(env, requestUrl, input);
    const liveAuthorization = input.liveScope
      ? await resolveCurrentLiveAuthorization(
          env,
          input.liveScope,
          input.context.callerUserId,
          input.previous.assetId,
        )
      : undefined;
    const authorizedInput = liveAuthorization
      ? { ...input, liveScope: liveAuthorization.scope }
      : input;
    return refreshListeningAssetDeliveryUrl(
      authorizedInput,
      createDeliveryDependencies(env, requestUrl, liveAuthorization?.retainedSession),
    );
  },
});

const readPreviousDelivery = (body: Record<string, unknown>): ListeningDeliveryIssuedUrl | undefined => {
  if (!isRecord(body.previous)) return undefined;
  const previous = body.previous;
  const range = isRecord(previous.range) ? previous.range : {};
  if (range.acceptRanges !== 'bytes') {
    throw new ListeningDeliveryWorkerError('previous_delivery_invalid', 400);
  }
  const delivery: Partial<ListeningDeliveryIssuedUrl> = {
    assetId: typeof previous.assetId === 'string' ? previous.assetId : undefined,
    url: typeof previous.url === 'string' ? previous.url : undefined,
    tokenId: typeof previous.tokenId === 'string' ? previous.tokenId : undefined,
    issuedAt: Number(previous.issuedAt),
    expiresAt: Number(previous.expiresAt),
    refreshAfter: Number(previous.refreshAfter),
    ttlMs: Number(previous.ttlMs) as ListeningDeliveryIssuedUrl['ttlMs'],
    deliveryReady: previous.deliveryReady === true ? true : undefined,
    range: {
      requestRange: typeof range.requestRange === 'string' ? range.requestRange : '',
      status: Number(range.status) as 206,
      acceptRanges: 'bytes',
      contentLength: Number(range.contentLength),
      contentRange: typeof range.contentRange === 'string' ? range.contentRange : '',
    },
  };

  if (
    !delivery.assetId
    || !delivery.url
    || !delivery.tokenId
    || !Number.isSafeInteger(delivery.issuedAt)
    || !Number.isSafeInteger(delivery.expiresAt)
    || !Number.isSafeInteger(delivery.refreshAfter)
    || !Number.isSafeInteger(delivery.ttlMs)
    || delivery.deliveryReady !== true
    || !delivery.range?.requestRange
    || delivery.range.status !== 206
    || !Number.isSafeInteger(delivery.range.contentLength)
    || !delivery.range.contentRange
  ) {
    throw new ListeningDeliveryWorkerError('previous_delivery_invalid', 400);
  }

  return delivery as ListeningDeliveryIssuedUrl;
};

const issueOrRefresh = async (
  issuer: ListeningDeliveryWorkerIssuer,
  input: IssueListeningAssetDeliveryUrlInput,
  body: Record<string, unknown>,
): Promise<ListeningDeliveryIssuedUrl | ListeningDeliveryRefreshedUrl> => {
  const previous = readPreviousDelivery(body);
  if (!previous) {
    return issuer.issue(input);
  }
  if (!issuer.refresh) {
    throw new ListeningDeliveryWorkerError('delivery_refresh_unavailable', 500);
  }
  if (previous.assetId !== input.assetId) {
    throw new ListeningDeliveryWorkerError('previous_delivery_asset_mismatch', 400);
  }
  return issuer.refresh({
    previous,
    context: input.context,
    now: input.now,
    resultScope: input.resultScope,
    soloScope: input.soloScope,
    liveScope: input.liveScope,
  });
};

const withDeliveryErrors = async (
  action: () => Promise<ListeningDeliveryIssuedUrl | ListeningDeliveryRefreshedUrl>,
) => {
  try {
    return {
      body: await action(),
    };
  } catch (error) {
    const safeError = asError(error);
    if (safeError.statusCode >= 500) {
      console.error(JSON.stringify({
        message: 'Listening delivery request failed',
        code: safeError.code,
        ...(safeError.code === 'delivery_unexpected_error'
          ? {
              diagnosticCode: diagnosticCodeForUnexpectedError(error),
              diagnosticMessage: diagnosticMessageForUnexpectedError(error),
            }
          : {}),
      },
      ));
    }
    return {
      body: { code: safeError.code },
      init: { status: safeError.statusCode },
    };
  }
};

const statusForDeliveryCode = (code: string): number => {
  if (code === 'asset_not_found') return 404;
  if (
    code === 'delivery_not_authorized'
    || code === 'asset_id_not_canonical'
    || code === 'asset_not_committed'
    || code === 'asset_not_deliverable'
  ) {
    return 403;
  }
  if (code.startsWith('range_')) return 502;
  return 400;
};

const asError = (error: unknown): ListeningDeliveryWorkerError => {
  if (error instanceof ListeningDeliveryWorkerError) return error;
  if (error instanceof ListeningAssetDeliveryError) {
    return new ListeningDeliveryWorkerError(
      error.code,
      statusForDeliveryCode(error.code),
    );
  }
  return new ListeningDeliveryWorkerError('delivery_unexpected_error', 500);
};

const diagnosticCodeForUnexpectedError = (error: unknown): string => {
  if (error instanceof TypeError) return 'type_error';
  if (!(error instanceof Error)) return 'non_error_throw';
  const message = error.message;
  if (message.startsWith('firebase_rtdb_get_failed:')) return 'firebase_rtdb_get_failed';
  if (message.startsWith('firebase_rtdb_put_failed:')) return 'firebase_rtdb_put_failed';
  if (message.startsWith('google_oauth_failed:')) return 'google_oauth_failed';
  if (message === 'invalid_google_sa_key') return 'invalid_google_sa_key';
  if (message === 'missing_google_sa_key') return 'missing_google_sa_key';
  if (message === 'missing_firebase_db_url') return 'missing_firebase_db_url';
  if (message.startsWith('missing_firebase_etag:')) return 'missing_firebase_etag';
  return error.name || 'unknown_error';
};

const diagnosticMessageForUnexpectedError = (error: unknown): string | undefined => {
  if (!(error instanceof Error) || !error.message) return undefined;
  return error.message
    .replace(/[A-Za-z0-9_-]{80,}/g, '[redacted]')
    .slice(0, 240);
};

interface DeliveryByteRange {
  readonly offset: number;
  readonly length: number;
  readonly start: number;
  readonly end: number;
}

const readObjectSize = (value: unknown): number => {
  if (!isRecord(value)) return 0;
  const size = typeof value.size === 'number' ? value.size : Number(value.size);
  return Number.isSafeInteger(size) && size > 0 ? size : 0;
};

const parseDeliveryRange = (
  rangeHeader: string | null,
  size: number,
): DeliveryByteRange | null => {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    throw new ListeningDeliveryWorkerError('delivery_range_invalid', 416);
  }

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new ListeningDeliveryWorkerError('delivery_range_invalid', 416);
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || start >= size
    || end < start
  ) {
    throw new ListeningDeliveryWorkerError('delivery_range_invalid', 416);
  }
  end = Math.min(end, size - 1);
  return {
    offset: start,
    length: end - start + 1,
    start,
    end,
  };
};

const objectBody = (value: unknown): BodyInit | null => {
  if (!isRecord(value) || value.body === undefined || value.body === null) return null;
  return value.body as BodyInit;
};

const createDeliveryContentResponse = async (input: {
  request: Request;
  env: WorkerEnv;
  now: number;
}): Promise<Response> => {
  const token = new URL(input.request.url).searchParams.get('token');
  if (!token) {
    throw new ListeningDeliveryWorkerError('delivery_token_required', 403);
  }
  const payload = await readDeliveryContentToken(input.env, token, input.now);
  const bucket = input.env.R2_BUCKET;
  if (!bucket?.head || !bucket.get) {
    throw new ListeningDeliveryWorkerError('delivery_bucket_unavailable', 500);
  }

  const metadata = await bucket.head(payload.durableKey);
  const size = readObjectSize(metadata);
  if (size <= 0) {
    throw new ListeningDeliveryWorkerError('delivery_object_not_found', 404);
  }

  let range: DeliveryByteRange | null;
  try {
    range = parseDeliveryRange(input.request.headers.get('Range'), size);
  } catch (error) {
    const safeError = asError(error);
    return new Response(JSON.stringify({ code: safeError.code }), {
      status: safeError.statusCode,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${size}`,
        'Content-Type': 'application/json',
      },
    });
  }

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Type': payload.contentType,
    'X-Content-Type-Options': 'nosniff',
  });
  if (isRecord(metadata)) {
    const etag = typeof metadata.httpEtag === 'string'
      ? metadata.httpEtag
      : typeof metadata.etag === 'string'
        ? metadata.etag
        : undefined;
    if (etag) headers.set('ETag', etag);
  }

  if (input.request.method === 'HEAD') {
    headers.set('Content-Length', String(size));
    return new Response(null, { status: 200, headers });
  }

  const object = await bucket.get(
    payload.durableKey,
    range ? { range: { offset: range.offset, length: range.length } } : undefined,
  );
  const body = objectBody(object);
  if (!body) {
    throw new ListeningDeliveryWorkerError('delivery_object_not_found', 404);
  }

  if (range) {
    headers.set('Content-Length', String(range.length));
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    return new Response(body, { status: 206, headers });
  }

  headers.set('Content-Length', String(size));
  return new Response(body, { status: 200, headers });
};

const withDeliveryContentErrors = async (
  action: () => Promise<Response>,
): Promise<Response> => {
  try {
    return await action();
  } catch (error) {
    const safeError = asError(error);
    if (safeError.statusCode >= 500) {
      console.error(JSON.stringify({
        message: 'Listening delivery content request failed',
        code: safeError.code,
        ...(safeError.code === 'delivery_unexpected_error'
          ? {
              diagnosticCode: diagnosticCodeForUnexpectedError(error),
              diagnosticMessage: diagnosticMessageForUnexpectedError(error),
            }
          : {}),
      }));
    }
    return new Response(JSON.stringify({ code: safeError.code }), {
      status: safeError.statusCode,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/json',
      },
    });
  }
};

export const createListeningDeliveryWorkerHandlers = (options: {
  deliveryIssuer?: ListeningDeliveryWorkerIssuer;
  now?: () => number;
} = {}) => ({
  async content(input: {
    request: Request;
    env: WorkerEnv;
    now: () => number;
  }) {
    return withDeliveryContentErrors(() => createDeliveryContentResponse({
      request: input.request,
      env: input.env,
      now: (options.now ?? input.now)(),
    }));
  },

  async resultReview(input: {
    request: Request;
    env: WorkerEnv;
    uid: string;
    now: () => number;
  }) {
    return withDeliveryErrors(async () => {
      const rawBody = await readJsonBody(input.request);
      if (!isRecord(rawBody)) {
        throw new ListeningDeliveryWorkerError('invalid_request', 400);
      }
      assertNoBrowserAuthority(rawBody);
      const assetId = requireDatabaseKey(rawBody, 'assetId');
      const resultId = requireString(rawBody, 'resultId');
      const versionId = requireDatabaseKey(rawBody, 'versionId');
      const issuer = options.deliveryIssuer ?? createWorkerBoundIssuer(input.env, input.request.url);

      return issueOrRefresh(issuer, {
        assetId,
        context: {
          runtime: 'trusted-server',
          callerUserId: input.uid,
        },
        now: (options.now ?? input.now)(),
        resultScope: {
          resultId,
          versionId,
        },
      }, rawBody);
    });
  },

  async solo(input: {
    request: Request;
    env: WorkerEnv;
    uid: string;
    now: () => number;
  }) {
    return withDeliveryErrors(async () => {
      const rawBody = await readJsonBody(input.request);
      if (!isRecord(rawBody)) {
        throw new ListeningDeliveryWorkerError('invalid_request', 400);
      }
      assertNoBrowserAuthority(rawBody);
      const assetId = requireDatabaseKey(rawBody, 'assetId');
      const testId = requireDatabaseKey(rawBody, 'testId');
      const versionId = requireDatabaseKey(rawBody, 'versionId');
      const mode = requireSoloMode(rawBody);
      const issuer = options.deliveryIssuer ?? createWorkerBoundIssuer(input.env, input.request.url);

      return issueOrRefresh(issuer, {
        assetId,
        context: {
          runtime: 'trusted-server',
          callerUserId: input.uid,
        },
        now: (options.now ?? input.now)(),
        soloScope: {
          testId,
          versionId,
          studentId: input.uid,
          mode,
          courseId: optionalString(rawBody, 'courseId'),
          moduleId: optionalString(rawBody, 'moduleId'),
          homeworkId: optionalString(rawBody, 'homeworkId'),
          submissionId: optionalString(rawBody, 'submissionId'),
        },
      }, rawBody);
    });
  },

  async live(input: {
    request: Request;
    env: WorkerEnv;
    uid: string;
    now: () => number;
  }) {
    return withDeliveryErrors(async () => {
      const rawBody = await readJsonBody(input.request);
      if (!isRecord(rawBody)) {
        throw new ListeningDeliveryWorkerError('invalid_request', 400);
      }
      assertNoBrowserAuthority(rawBody);
      const assetId = requireDatabaseKey(rawBody, 'assetId');
      const sessionCode = requireDatabaseKey(rawBody, 'sessionCode');
      const testId = requireDatabaseKey(rawBody, 'testId');
      const versionId = requireDatabaseKey(rawBody, 'versionId');
      const sectionNumber = requirePositiveNumber(rawBody, 'sectionNumber');
      const issuer = options.deliveryIssuer ?? createWorkerBoundIssuer(input.env, input.request.url);

      return issueOrRefresh(issuer, {
        assetId,
        context: {
          runtime: 'trusted-server',
          callerUserId: input.uid,
        },
        now: (options.now ?? input.now)(),
        liveScope: {
          sessionCode,
          testId,
          versionId,
          studentId: input.uid,
          classId: optionalString(rawBody, 'classId'),
          sectionNumber,
        },
      }, rawBody);
    });
  },
});

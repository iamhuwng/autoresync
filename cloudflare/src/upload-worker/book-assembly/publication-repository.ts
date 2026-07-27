import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';

export const BOOK_ASSEMBLY_PUBLICATION_ROOT = 'book_assembly_publications/books';

const MAX_RETRIES = 5;
const MAX_SCOPE_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS_PER_FAMILY = 256;
const MAX_RECORD_BYTES = 512 * 1024;
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const SENSITIVE_KEYS = new Set([
  'answer',
  'answerkey',
  'answers',
  'credential',
  'credentials',
  'firebasetoken',
  'fulldiff',
  'pdfbytes',
  'privatekey',
  'providerauthority',
  'secret',
  'sourcebytes',
]);

export interface BookAssemblyPublicationRepositoryEnv extends RepositoryEnv {
  BOOK_ASSEMBLY_SERVICE_IDENTITY?: string;
  BOOK_ASSEMBLY_GOOGLE_SA_KEY?: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const jsonBytes = (value: unknown): number => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('invalid_book_assembly_publication_json');
  return new TextEncoder().encode(encoded).byteLength;
};
const assertPathId = (value: unknown, code: string): asserts value is string => {
  if (typeof value !== 'string' || !PATH_ID.test(value)) throw new Error(code);
};
const hasSensitiveKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/gu, '')) || hasSensitiveKey(child)
  ));
};
const scopePath = (bookId: string): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  return BOOK_ASSEMBLY_PUBLICATION_ROOT + '/' + bookId;
};

type PublicationFamily =
  | 'versions'
  | 'activityVersions'
  | 'activitySafeProjections'
  | 'placements'
  | 'unitProjections'
  | 'deliveryPlans'
  | 'audits';

const nonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && PATH_ID.test(value)
);
const safeIntegerAtLeast = (value: unknown, minimum: number): value is number => (
  Number.isSafeInteger(value) && (value as number) >= minimum
);
const stringArray = (value: unknown, minimumLength = 0): value is readonly string[] => (
  Array.isArray(value)
  && value.length >= minimumLength
  && value.every((entry) => typeof entry === 'string' && PATH_ID.test(entry))
);
const recordArray = (value: unknown, minimumLength = 0): value is readonly Record<string, unknown>[] => (
  Array.isArray(value)
  && value.length >= minimumLength
  && value.every(isRecord)
);
const strategy = (value: unknown): value is 'full_pdf' | 'component_pdfs' => (
  value === 'full_pdf' || value === 'component_pdfs'
);
const qualifiedPages = (value: unknown): boolean => (
  recordArray(value, 1)
  && value.every((page) => (
    nonEmptyString(page.sourceKey)
    && nonEmptyString(page.sourceVersionId)
    && safeIntegerAtLeast(page.physicalPageNumber, 1)
  ))
);
const sourceSet = (value: unknown, expectedStrategy?: unknown): boolean => {
  if (!isRecord(value) || !strategy(value.sourceStrategy)
    || (expectedStrategy !== undefined && value.sourceStrategy !== expectedStrategy)
    || !recordArray(value.sources, 1)) return false;
  if (value.sourceStrategy === 'full_pdf' && value.sources.length !== 1) return false;
  return value.sources.every((source) => (
    nonEmptyString(source.sourceKey)
    && nonEmptyString(source.sourceVersionId)
    && safeIntegerAtLeast(source.sourceOrder, 1)
    && (value.sourceStrategy === 'full_pdf'
      ? source.ownerNodeKey === undefined
      : nonEmptyString(source.ownerNodeKey))
  ));
};
const unitStructures = (value: unknown): boolean => (
  recordArray(value, 1)
  && value.every((unit) => (
    nonEmptyString(unit.unitKey)
    && recordArray(unit.activitySlots, 1)
    && unit.activitySlots.every((slot) => (
      nonEmptyString(slot.activityKey)
      && safeIntegerAtLeast(slot.order, 1)
      && ['required', 'optional', 'none'].includes(String(slot.contextRequirement))
      && stringArray(slot.pageGroupKeys, 1)
    ))
    && recordArray(unit.pageGroups, 1)
    && unit.pageGroups.every((group) => (
      nonEmptyString(group.pageGroupKey)
      && nonEmptyString(group.sourceKey)
      && Array.isArray(group.pages)
      && group.pages.length > 0
      && group.pages.every((page) => safeIntegerAtLeast(page, 1))
      && stringArray(group.activityKeys, 1)
      && ['activity', 'reference_only'].includes(String(group.mode))
      && (group.defaultPhysicalPageNumber === undefined
        || safeIntegerAtLeast(group.defaultPhysicalPageNumber, 1))
    ))
  ))
);
const manifest = (value: unknown, bookId: string): boolean => (
  isRecord(value)
  && value.bookId === bookId
  && sourceSet(value.sourceSet)
  && recordArray(value.nodes, 1)
  && unitStructures(value.units)
  && value.nodes.every((node) => (
    nonEmptyString(node.nodeKey)
    && (node.parentNodeKey === null || nonEmptyString(node.parentNodeKey))
    && nonEmptyString(node.nodeType)
    && safeIntegerAtLeast(node.order, 1)
  ))
  && value.units.every((unit) => (
    nonEmptyString(unit.unitKey)
  ))
);
const studentSafeProjection = (
  value: unknown,
  bookId: string,
  publicationId: string,
  publicationRevision: number,
  expectedStrategy: unknown,
): boolean => (
  isRecord(value)
  && value.schemaVersion === 1
  && value.bookId === bookId
  && value.publicationId === publicationId
  && value.publicationRevision === publicationRevision
  && value.sourceStrategy === expectedStrategy
  && sourceSet(value.sourceSet, expectedStrategy)
  && unitStructures(value.units)
);
const publicationResultStatus = (value: unknown): boolean => (
  value === 'published'
  || value === 'rolled-back'
  || value === 'replayed'
  || value === 'conflict'
  || value === 'invalid'
  || value === 'idempotency-conflict'
  || value === 'not-found'
  || value === 'forbidden'
);

const assertStoredRecord = (
  value: unknown,
  bookId: string,
  key: string,
  keyField: string,
  family: PublicationFamily,
): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error('invalid_book_assembly_publication_record');
  if (jsonBytes(value) > MAX_RECORD_BYTES || hasSensitiveKey(value)) {
    throw new Error('invalid_book_assembly_publication_record');
  }
  if (value[keyField] !== key || value.bookId !== bookId || typeof value.ownerId !== 'string') {
    throw new Error('invalid_book_assembly_publication_record');
  }
  assertPathId(value.ownerId, 'invalid_book_assembly_publication_owner_id');
  if ((family !== 'audits' && value.schemaVersion !== 1)
    || !nonEmptyString(value.manifestVersionId)
    || !nonEmptyString(value.publicationId)
    || !safeIntegerAtLeast(value.publicationRevision, 1)) {
    throw new Error('invalid_book_assembly_publication_record');
  }
  switch (family) {
    case 'versions':
      if (value.lifecycle !== 'published'
        || !strategy(value.strategy)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.inputFingerprint)
        || !nonEmptyString(value.createdAt)
        || !manifest(value.manifest, bookId)
        || !studentSafeProjection(
          value.studentSafeProjection,
          bookId,
          String(value.publicationId),
          value.publicationRevision as number,
          value.strategy,
        )) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'activityVersions':
      if (!nonEmptyString(value.activityId)
        || !safeIntegerAtLeast(value.activityVersion, 1)
        || !nonEmptyString(value.unitKey)
        || !nonEmptyString(value.activityKey)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.createdAt)
        || !qualifiedPages(value.sourcePages)
        || !nonEmptyString(value.payloadFingerprint)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'activitySafeProjections':
      if (!nonEmptyString(value.activityId)
        || !nonEmptyString(value.activityVersionId)
        || !stringArray(value.placementIds)
        || !qualifiedPages(value.sourcePages)
        || !nonEmptyString(value.payloadFingerprint)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'placements':
      if (!nonEmptyString(value.unitKey)
        || !nonEmptyString(value.nodeKey)
        || !nonEmptyString(value.activityKey)
        || !nonEmptyString(value.activityId)
        || !nonEmptyString(value.activityVersionId)
        || !safeIntegerAtLeast(value.order, 1)
        || !stringArray(value.pageGroupKeys, 1)
        || !qualifiedPages(value.sourcePages)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'unitProjections':
      if (!nonEmptyString(value.unitKey)
        || !stringArray(value.placementIds)
        || !qualifiedPages(value.sourcePages)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.createdAt)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'deliveryPlans':
      if (!strategy(value.sourceStrategy)
        || !sourceSet(value.sourceSet, value.sourceStrategy)
        || !stringArray(value.placementIds)
        || !stringArray(value.unitProjectionIds)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.createdAt)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'audits':
      if (!OPERATION_ID.test(String(value.operationId ?? ''))
        || (value.action !== 'publish' && value.action !== 'rollback')
        || !nonEmptyString(value.inputFingerprint)
        || !nonEmptyString(value.createdAt)
        || !['committed', 'replayed', 'rejected'].includes(String(value.status))) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
  }
  return clone(value);
};

const parseFamily = <T>(
  value: unknown,
  bookId: string,
  keyField: string,
  family: PublicationFamily,
): Record<string, T> | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error('invalid_book_assembly_publication_family');
  const entries = Object.entries(value);
  if (entries.length > MAX_RECORDS_PER_FAMILY) {
    throw new Error('book_assembly_publication_capacity_exceeded');
  }
  const parsed: Record<string, T> = {};
  for (const [key, record] of entries) {
    assertPathId(key, 'invalid_book_assembly_publication_record_id');
    parsed[key] = assertStoredRecord(record, bookId, key, keyField, family) as T;
  }
  return entries.length > 0 ? parsed : undefined;
};

const parseCurrent = (value: unknown): BookAssemblyPublicationScope['current'] => {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || jsonBytes(value) > MAX_RECORD_BYTES || hasSensitiveKey(value)) {
    throw new Error('invalid_book_assembly_publication_current');
  }
  assertPathId(value.publicationId, 'invalid_book_assembly_publication_current');
  assertPathId(value.manifestVersionId, 'invalid_book_assembly_publication_current');
  if (!OPERATION_ID.test(String(value.updatedByCommandId ?? ''))) {
    throw new Error('invalid_book_assembly_publication_current');
  }
  if (!Number.isSafeInteger(value.publicationRevision) || (value.publicationRevision as number) < 1
    || !Number.isSafeInteger(value.bookRevision) || (value.bookRevision as number) < 0
    || !Number.isSafeInteger(value.sourceSetRevision) || (value.sourceSetRevision as number) < 0
    || !nonEmptyString(value.inputFingerprint)
    || !nonEmptyString(value.updatedAt)) {
    throw new Error('invalid_book_assembly_publication_current');
  }
  return clone(value) as BookAssemblyPublicationScope['current'];
};

const parseOperations = <Result>(
  value: unknown,
): BookAssemblyPublicationScope<Result>['operations'] => {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error('invalid_book_assembly_publication_operations');
  const entries = Object.entries(value);
  if (entries.length > MAX_RECORDS_PER_FAMILY) {
    throw new Error('book_assembly_publication_capacity_exceeded');
  }
  const parsed: NonNullable<BookAssemblyPublicationScope<Result>['operations']> = {};
  for (const [key, record] of entries) {
    if (!OPERATION_ID.test(key) || !isRecord(record)
      || jsonBytes(record) > MAX_RECORD_BYTES || hasSensitiveKey(record)
      || typeof record.ownerId !== 'string'
      || !nonEmptyString(record.fingerprint)
      || !nonEmptyString(record.createdAt)
        || !isRecord(record.result)
        || !publicationResultStatus(record.result.status)) {
      throw new Error('invalid_book_assembly_publication_operation');
    }
    assertPathId(record.ownerId, 'invalid_book_assembly_publication_owner_id');
    parsed[key] = clone(record) as NonNullable<BookAssemblyPublicationScope<Result>['operations']>[string];
  }
  return entries.length > 0 ? parsed : undefined;
};

const parseScope = <Result>(
  value: unknown,
  bookId: string,
): BookAssemblyPublicationScope<Result> => {
  if (value === undefined || value === null) return {};
  if (!isRecord(value) || jsonBytes(value) > MAX_SCOPE_BYTES || hasSensitiveKey(value)) {
    throw new Error('invalid_book_assembly_publication_scope');
  }
  const allowed = new Set([
    'versions',
    'activityVersions',
    'activitySafeProjections',
    'placements',
    'unitProjections',
    'deliveryPlans',
    'current',
    'operations',
    'audits',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('invalid_book_assembly_publication_scope');
  }
  return {
    versions: parseFamily(value.versions, bookId, 'manifestVersionId', 'versions'),
    activityVersions: parseFamily(value.activityVersions, bookId, 'activityVersionId', 'activityVersions'),
    activitySafeProjections: parseFamily(
      value.activitySafeProjections, bookId, 'projectionId', 'activitySafeProjections',
    ),
    placements: parseFamily(value.placements, bookId, 'placementId', 'placements'),
    unitProjections: parseFamily(value.unitProjections, bookId, 'unitProjectionId', 'unitProjections'),
    deliveryPlans: parseFamily(value.deliveryPlans, bookId, 'deliveryPlanId', 'deliveryPlans'),
    current: parseCurrent(value.current),
    operations: parseOperations<Result>(value.operations),
    audits: parseFamily(value.audits, bookId, 'auditId', 'audits'),
  };
};

const tokenProvider = (
  keyJson: string,
  identity: string,
  fetchImpl: typeof fetch,
): (() => Promise<string>) => {
  let key: ServiceAccountKey;
  try {
    const parsed = JSON.parse(keyJson) as unknown;
    if (!isRecord(parsed)
      || typeof parsed.client_email !== 'string'
      || typeof parsed.private_key !== 'string') {
      throw new Error('invalid_book_assembly_publication_google_sa_key');
    }
    key = parsed as unknown as ServiceAccountKey;
  } catch {
    throw new Error('invalid_book_assembly_publication_google_sa_key');
  }
  if (!key.client_email || !key.private_key || key.client_email !== identity) {
    throw new Error('book_assembly_publication_service_identity_mismatch');
  }
  let cached = '';
  let expiresAt = 0;
  return async () => {
    if (cached && Date.now() < expiresAt - 300_000) return cached;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      iss: key.client_email,
      sub: key.client_email,
      aud: OAUTH2_TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: FIREBASE_SCOPES,
    }).setProtectedHeader({ alg: 'RS256' })
      .sign(await importPKCS8(key.private_key, 'RS256'));
    const response = await fetchImpl(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + assertion,
    });
    if (!response.ok) throw new Error('book_assembly_publication_google_oauth_failed:' + response.status);
    const body = JSON.parse(await response.text()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('book_assembly_publication_google_oauth_failed:invalid_response');
    cached = body.access_token;
    expiresAt = Date.now() + Math.max(0, (body.expires_in ?? 3600) * 1000);
    return cached;
  };
};

export class FirebaseRestBookAssemblyPublicationRepository
implements BookAssemblyPublicationRepository<BookAssemblyPublicationResult> {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: BookAssemblyPublicationRepositoryEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_ASSEMBLY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_assembly_publication_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const keyJson = options.env.BOOK_ASSEMBLY_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new Error('missing_book_assembly_publication_google_sa_key');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl,
      getAccessToken: options.getAccessToken
        ?? tokenProvider(keyJson!, identity, fetchImpl),
    });
  }

  async readScope(bookId: string): Promise<BookAssemblyPublicationScope<BookAssemblyPublicationResult>> {
    const value = await this.rtdb.readWithEtag<unknown>(scopePath(bookId));
    return parseScope<BookAssemblyPublicationResult>(value.data, bookId);
  }

  async transaction<T>(
    bookId: string,
    mutate: (current: BookAssemblyPublicationScope<BookAssemblyPublicationResult>) => {
      readonly outcome: T;
      readonly next?: BookAssemblyPublicationScope<BookAssemblyPublicationResult>;
      readonly write: boolean;
    },
  ): Promise<T> {
    const path = scopePath(bookId);
    const maxRetries = this.options.maxRetries ?? MAX_RETRIES;
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
      throw new Error('invalid_book_assembly_publication_max_retries');
    }
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const parsed = parseScope<BookAssemblyPublicationResult>(current.data, bookId);
      const mutation = mutate(parsed);
      if (!mutation.write) return mutation.outcome;
      const next = parseScope<BookAssemblyPublicationResult>(mutation.next ?? parsed, bookId);
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return mutation.outcome;
    }
    throw new Error('book_assembly_publication_scope_cas_retries_exhausted');
  }
}

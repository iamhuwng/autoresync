import type {
  BookHomeworkCompatibilityProjection,
} from '../../../../src/types/homework.types.ts';
import {
  assertBookHomeworkCompatibilityProjection,
  isBookHomeworkCompatibilityProjection,
} from '../../../../src/services/book-homework/bookHomeworkCompatibilityProjection.service.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';
import {
  BookHomeworkProjectionDiagnosticError,
  type BookHomeworkProjectionDiagnostic,
} from './projection-diagnostics.ts';

const assertCompatibilityProjection: (
  value: unknown,
) => asserts value is BookHomeworkCompatibilityProjection = assertBookHomeworkCompatibilityProjection;

export type BookHomeworkCompatibilityFirebaseClaim = Extract<
  BookFirebaseClaimTuple,
  { readonly service: 'book_homework_compatibility' }
>;

export const BOOK_HOMEWORK_COMPATIBILITY_ROOT = 'homework_assignments';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9_:@-]{0,127}$/u;

export interface BookHomeworkCompatibilityStoredDocument {
  readonly value: unknown;
  readonly updateTime: string;
}

export interface BookHomeworkCompatibilityDocumentStore {
  read(path: string, ownerId: string): Promise<BookHomeworkCompatibilityStoredDocument | null>;
  write(
    path: string,
    value: BookHomeworkCompatibilityProjection,
    updateTime?: string,
  ): Promise<boolean>;
}

export interface EnsureCompatibilityProjectionInput {
  readonly projection: BookHomeworkCompatibilityProjection;
}

export type BookHomeworkCompatibilityProjectionResult =
  | 'created'
  | 'updated'
  | 'replayed'
  | 'conflict';

export class BookHomeworkCompatibilityRepositoryError extends BookHomeworkProjectionDiagnosticError {
  constructor(readonly code: 'invalid-projection' | 'readback-mismatch') {
    const diagnostic: BookHomeworkProjectionDiagnostic = code === 'invalid-projection'
      ? { stage: 'derived_projection_validation', errorClass: 'invalid-derived-projection' }
      : { stage: 'readback', errorClass: 'readback-mismatch' };
    super(diagnostic, code);
    this.name = 'BookHomeworkCompatibilityRepositoryError';
  }
}

const storageFailure = (
  stage: 'token_exchange' | 'firestore_get' | 'firestore_patch',
  errorClass: 'token-authentication' | 'firestore-read' | 'firestore-write',
): BookHomeworkProjectionDiagnosticError => new BookHomeworkProjectionDiagnosticError({ stage, errorClass });

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stable(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

function assertId(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(code);
}

function assertRootId(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !ROOT_ID.test(value)) throw new Error(code);
}

export const bookHomeworkCompatibilityPath = (assignmentId: string): string => {
  assertRootId(assignmentId, 'invalid_book_homework_compatibility_assignment_id');
  return `${BOOK_HOMEWORK_COMPATIBILITY_ROOT}/${assignmentId}`;
};

const projectionFromInput = (
  input: EnsureCompatibilityProjectionInput | BookHomeworkCompatibilityProjection,
): BookHomeworkCompatibilityProjection => {
  const projection = isBookHomeworkCompatibilityProjection(input)
    ? input
    : input && typeof input === 'object' && 'projection' in input
      ? input.projection
      : undefined;
  try {
    assertCompatibilityProjection(projection);
  } catch {
    throw new BookHomeworkCompatibilityRepositoryError('invalid-projection');
  }
  return projection;
};

const sameProjection = (
  left: unknown,
  right: BookHomeworkCompatibilityProjection,
): boolean => stable(left) === stable(right);

const assertReadback = (
  stored: BookHomeworkCompatibilityStoredDocument | null,
  expected: BookHomeworkCompatibilityProjection,
): void => {
  if (!stored || !isBookHomeworkCompatibilityProjection(stored.value)
    || !sameProjection(stored.value, expected)
    || stored.value.bookHomeworkCompatibility.sourceFingerprint
      !== expected.bookHomeworkCompatibility.sourceFingerprint) {
    throw new BookHomeworkCompatibilityRepositoryError('readback-mismatch');
  }
};

export class InMemoryBookHomeworkCompatibilityDocumentStore
  implements BookHomeworkCompatibilityDocumentStore {
  private readonly documents = new Map<string, BookHomeworkCompatibilityStoredDocument>();
  private clock = 0;

  async read(path: string, _ownerId: string): Promise<BookHomeworkCompatibilityStoredDocument | null> {
    const stored = this.documents.get(path);
    return stored ? { value: clone(stored.value), updateTime: stored.updateTime } : null;
  }

  async write(
    path: string,
    value: BookHomeworkCompatibilityProjection,
    updateTime?: string,
  ): Promise<boolean> {
    const current = this.documents.get(path);
    if (updateTime === undefined ? current !== undefined : current?.updateTime !== updateTime) return false;
    this.documents.set(path, {
      value: clone(value),
      updateTime: `memory-${++this.clock}`,
    });
    return true;
  }
}

export class BookHomeworkCompatibilityRepository {
  private readonly maxRetries: number;

  constructor(
    private readonly store: BookHomeworkCompatibilityDocumentStore,
    options: { readonly maxRetries?: number } = {},
  ) {
    const maxRetries = options.maxRetries ?? 5;
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
      throw new Error('invalid_book_homework_compatibility_max_retries');
    }
    this.maxRetries = maxRetries;
  }

  async read(assignmentId: string, ownerId: string): Promise<BookHomeworkCompatibilityProjection | null> {
    assertId(ownerId, 'invalid_book_homework_compatibility_owner_id');
    const path = bookHomeworkCompatibilityPath(assignmentId);
    const stored = await this.store.read(path, ownerId);
    if (!stored || !isBookHomeworkCompatibilityProjection(stored.value)) return null;
    if (stored.value.id !== assignmentId || stored.value.createdBy !== ownerId) return null;
    return clone(stored.value);
  }

  async ensureCommittedProjection(
    input: EnsureCompatibilityProjectionInput | BookHomeworkCompatibilityProjection,
  ): Promise<BookHomeworkCompatibilityProjectionResult> {
    const projection = projectionFromInput(input);
    const assignmentId = projection.id;
    const path = bookHomeworkCompatibilityPath(assignmentId);
    const sourceRevision = projection.bookHomeworkCompatibility.sourceSagaRevision;
    const sourceFingerprint = projection.bookHomeworkCompatibility.sourceFingerprint;

    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const stored = await this.store.read(path, projection.createdBy);
      if (!stored) {
        if (!await this.store.write(path, clone(projection))) continue;
        assertReadback(await this.store.read(path, projection.createdBy), projection);
        return 'created';
      }

      const current = stored.value;
      if (!isBookHomeworkCompatibilityProjection(current)
        || current.id !== assignmentId
        || current.bookHomeworkCompatibility.assignmentId !== assignmentId) return 'conflict';

      const currentMarker = current.bookHomeworkCompatibility;
      if (currentMarker.sourceSagaRevision > sourceRevision) return 'conflict';
      if (currentMarker.sourceSagaRevision === sourceRevision) {
        if (currentMarker.sourceFingerprint !== sourceFingerprint) return 'conflict';
        assertReadback(stored, projection);
        return 'replayed';
      }

      if (!await this.store.write(path, clone(projection), stored.updateTime)) continue;
      assertReadback(await this.store.read(path, projection.createdBy), projection);
      return 'updated';
    }
    return 'conflict';
  }

  async ensure(
    input: EnsureCompatibilityProjectionInput | BookHomeworkCompatibilityProjection,
  ): Promise<BookHomeworkCompatibilityProjectionResult> {
    return this.ensureCommittedProjection(input);
  }
}

type FirestoreValue = {
  readonly nullValue?: 'NULL_VALUE';
  readonly booleanValue?: boolean;
  readonly integerValue?: string;
  readonly doubleValue?: number;
  readonly stringValue?: string;
  readonly mapValue?: { readonly fields: Record<string, FirestoreValue> };
  readonly arrayValue?: { readonly values?: readonly FirestoreValue[] };
};

const encodeValue = (value: unknown): FirestoreValue => {
  if (value === null) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('book_homework_compatibility_firestore_value_invalid');
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (isRecord(value)) {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)])),
      },
    };
  }
  throw new Error('book_homework_compatibility_firestore_value_invalid');
};

const decodeValue = (value: FirestoreValue): unknown => {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, entry]) => [key, decodeValue(entry)]));
  }
  throw new Error('book_homework_compatibility_firestore_value_invalid');
};

const encodeMap = (value: Record<string, unknown>): Record<string, FirestoreValue> => (
  Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)]))
);

const decodeMap = (value: Record<string, FirestoreValue> | undefined): unknown => (
  Object.fromEntries(Object.entries(value ?? {}).map(([key, entry]) => [key, decodeValue(entry)]))
);

export interface BookHomeworkCompatibilityRepositoryEnv {
  readonly FIREBASE_PROJECT_ID?: string;
  readonly FIREBASE_WEB_API_KEY?: string;
  readonly BOOK_HOMEWORK_SERVICE_IDENTITY?: string;
  readonly BOOK_HOMEWORK_GOOGLE_SA_KEY?: string;
  readonly BOOK_HOMEWORK_COMPATIBILITY_SERVICE_IDENTITY?: string;
  readonly BOOK_HOMEWORK_COMPATIBILITY_GOOGLE_SA_KEY?: string;
}

export interface FirebaseRestBookHomeworkCompatibilityDocumentStoreOptions {
  readonly env: BookHomeworkCompatibilityRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getFirebaseIdToken?: (claims: BookHomeworkCompatibilityFirebaseClaim) => Promise<string>;
}

const assignmentIdFromPath = (path: string): string => {
  const prefix = `${BOOK_HOMEWORK_COMPATIBILITY_ROOT}/`;
  if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) {
    throw new Error('invalid_book_homework_compatibility_path');
  }
  const assignmentId = path.slice(prefix.length);
  assertRootId(assignmentId, 'invalid_book_homework_compatibility_assignment_id');
  return assignmentId;
};

export class FirebaseRestBookHomeworkCompatibilityDocumentStore
  implements BookHomeworkCompatibilityDocumentStore {
  private readonly projectId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getFirebaseIdToken: (
    claims: BookHomeworkCompatibilityFirebaseClaim,
  ) => Promise<string>;

  constructor(options: FirebaseRestBookHomeworkCompatibilityDocumentStoreOptions) {
    this.projectId = options.env.FIREBASE_PROJECT_ID?.trim() ?? '';
    if (!this.projectId) throw new Error('missing_book_homework_compatibility_firestore_project');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (options.getFirebaseIdToken) {
      this.getFirebaseIdToken = options.getFirebaseIdToken;
    } else {
      const keyJson = (options.env.BOOK_HOMEWORK_COMPATIBILITY_GOOGLE_SA_KEY
        ?? options.env.BOOK_HOMEWORK_GOOGLE_SA_KEY)?.trim() ?? '';
      const identity = (options.env.BOOK_HOMEWORK_COMPATIBILITY_SERVICE_IDENTITY
        ?? options.env.BOOK_HOMEWORK_SERVICE_IDENTITY)?.trim() ?? '';
      const apiKey = options.env.FIREBASE_WEB_API_KEY?.trim() ?? '';
      if (!keyJson || !identity || !apiKey) {
        throw new Error('missing_book_homework_compatibility_firebase_credentials');
      }
      const provider = createFirebaseClaimTokenProvider({
        serviceAccountJson: keyJson,
        serviceIdentity: identity,
        firebaseProjectId: this.projectId,
        firebaseWebApiKey: apiKey,
        fetchImpl: this.fetchImpl,
      });
      this.getFirebaseIdToken = (claims) => provider(claims);
    }
  }

  async read(path: string, ownerId: string): Promise<BookHomeworkCompatibilityStoredDocument | null> {
    const assignmentId = assignmentIdFromPath(path);
    assertId(ownerId, 'invalid_book_homework_compatibility_owner_id');
    let token: string;
    try {
      token = await this.getFirebaseIdToken({
        service: 'book_homework_compatibility', assignmentId, ownerId,
      });
    } catch {
      throw storageFailure('token_exchange', 'token-authentication');
    }
    let response: Response;
    try {
      response = await this.fetchImpl.call(globalThis, this.url(path), {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw storageFailure('firestore_get', 'firestore-read');
    }
    if (response.status === 404) return null;
    const body = await response.text();
    if (!response.ok) {
      throw storageFailure(
        'firestore_get',
        response.status === 401 || response.status === 403 ? 'token-authentication' : 'firestore-read',
      );
    }
    try {
      const document = JSON.parse(body) as {
        readonly fields?: Record<string, FirestoreValue>;
        readonly updateTime?: string;
      };
      if (!document.updateTime) throw new Error('missing_update_time');
      return { value: decodeMap(document.fields), updateTime: document.updateTime };
    } catch {
      throw storageFailure('firestore_get', 'firestore-read');
    }
  }

  async write(
    path: string,
    value: BookHomeworkCompatibilityProjection,
    updateTime?: string,
  ): Promise<boolean> {
    assertCompatibilityProjection(value);
    const assignmentId = assignmentIdFromPath(path);
    if (value.id !== assignmentId) throw new Error('book_homework_compatibility_path_mismatch');
    const query = updateTime === undefined
      ? '?currentDocument.exists=false'
      : `?currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    let token: string;
    try {
      token = await this.getFirebaseIdToken({
        service: 'book_homework_compatibility', assignmentId, ownerId: value.createdBy,
      });
    } catch {
      throw storageFailure('token_exchange', 'token-authentication');
    }
    let response: Response;
    try {
      response = await this.fetchImpl.call(globalThis, `${this.url(path)}${query}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: encodeMap(value as unknown as Record<string, unknown>) }),
      });
    } catch {
      throw storageFailure('firestore_patch', 'firestore-write');
    }
    const body = await response.text();
    if (response.status === 409 || response.status === 412) return false;
    if (response.status === 400) {
      try {
        const parsed = JSON.parse(body) as { readonly error?: { readonly status?: string } };
        if (parsed.error?.status === 'FAILED_PRECONDITION') return false;
      } catch {
        return false;
      }
    }
    if (!response.ok) {
      throw storageFailure(
        'firestore_patch',
        response.status === 401 || response.status === 403 ? 'token-authentication' : 'firestore-write',
      );
    }
    return true;
  }

  private url(path: string): string {
    const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/(default)/documents/${encodedPath}`;
  }
}

export class FirebaseRestBookHomeworkCompatibilityRepository extends BookHomeworkCompatibilityRepository {
  constructor(options: {
    readonly env: BookHomeworkCompatibilityRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getFirebaseIdToken?: (claims: BookHomeworkCompatibilityFirebaseClaim) => Promise<string>;
    readonly maxRetries?: number;
  }) {
    super(new FirebaseRestBookHomeworkCompatibilityDocumentStore(options), {
      maxRetries: options.maxRetries,
    });
  }
}

export const createFirebaseRestBookHomeworkCompatibilityRepository = (
  options: ConstructorParameters<typeof FirebaseRestBookHomeworkCompatibilityRepository>[0],
): FirebaseRestBookHomeworkCompatibilityRepository => (
  new FirebaseRestBookHomeworkCompatibilityRepository(options)
);

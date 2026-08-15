import {
  FirebaseRtdbRestClient,
  type FirebaseRtdbAuthRequest,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';
import type {
  BookAssemblyActivityVersionReference,
} from '../../../../src/types/bookAssembly.types.ts';
import type {
  CanonicalActivityVersionPrepareResult,
  CanonicalActivityVersionWriter,
  ExactPublishedActivityVersionRequest,
  ExactPublishedActivityVersionReader,
} from '../../../../src/services/book-assembly/canonicalPublicationRepository.ts';
import {
  assertCanonicalPublishedActivityVersion,
  type CanonicalPublishedActivityVersionRecord,
} from '../../../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import {
  bookAssemblyActivityVersionScopeKey,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';

export const CANONICAL_ACTIVITY_VERSION_ROOT = 'book_activity/versions';
export const CANONICAL_ACTIVITY_STUDENT_SAFE_PROJECTION_ROOT =
  'book_activity/student_safe_projections';
export const BOOK_ASSEMBLY_PUBLICATION_ROOT = 'book_assembly_publications/books';

export const CANONICAL_ACTIVITY_VERSION_WRITER_IDENTITY_ENV =
  'BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_SERVICE_IDENTITY';
export const CANONICAL_ACTIVITY_VERSION_WRITER_KEY_ENV =
  'BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_GOOGLE_SA_KEY';
export const CANONICAL_ACTIVITY_VERSION_READER_IDENTITY_ENV =
  'BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY';
export const CANONICAL_ACTIVITY_VERSION_READER_KEY_ENV =
  'BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_GOOGLE_SA_KEY';

const MAX_RETRIES = 5;
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;

export interface CanonicalActivityVersionWriterEnv extends RepositoryEnv {
  BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_SERVICE_IDENTITY?: string;
  BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_GOOGLE_SA_KEY?: string;
  /** Existing Assembly credential fallback for initial full-PDF publication. */
  BOOK_ASSEMBLY_SERVICE_IDENTITY?: string;
  BOOK_ASSEMBLY_GOOGLE_SA_KEY?: string;
}

export interface CanonicalActivityVersionReaderEnv extends RepositoryEnv {
  BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY?: string;
  BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_GOOGLE_SA_KEY?: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

const assertPathId: (value: unknown, code: string) => asserts value is string = (
  value,
  code,
) => {
  if (typeof value !== 'string' || !PATH_ID.test(value)) throw new Error(code);
};

const canonicalPath = (activityId: string, activityVersionId: string): string => {
  assertPathId(activityId, 'invalid_canonical_activity_id');
  assertPathId(activityVersionId, 'invalid_canonical_activity_version_id');
  return `${CANONICAL_ACTIVITY_VERSION_ROOT}/${activityId}/${activityVersionId}`;
};

const studentSafeProjectionPath = (activityId: string, activityVersionId: string): string => {
  assertPathId(activityId, 'invalid_canonical_activity_id');
  assertPathId(activityVersionId, 'invalid_canonical_activity_version_id');
  return `${CANONICAL_ACTIVITY_STUDENT_SAFE_PROJECTION_ROOT}/${activityId}/${activityVersionId}`;
};

const manifestPath = (bookId: string, manifestVersionId: string): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  assertPathId(manifestVersionId, 'invalid_book_assembly_publication_manifest_version_id');
  return `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${bookId}/versions/${manifestVersionId}`;
};

const bookActivityVersionPath = (
  bookId: string,
  manifestVersionId: string,
  activityVersionId: string,
): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  assertPathId(manifestVersionId, 'invalid_book_assembly_publication_manifest_version_id');
  assertPathId(activityVersionId, 'invalid_book_assembly_publication_activity_version_id');
  return `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${bookId}/activity_versions/`
    + bookAssemblyActivityVersionScopeKey(manifestVersionId, activityVersionId);
};

const bookSafeProjectionPath = (bookId: string, projectionId: string): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  assertPathId(projectionId, 'invalid_book_assembly_publication_projection_id');
  return `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${bookId}/activity_safe_projections/${projectionId}`;
};

const bookPlacementPath = (bookId: string, placementId: string): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  assertPathId(placementId, 'invalid_book_assembly_publication_placement_id');
  return `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${bookId}/placements/${placementId}`;
};

const bookCurrentPath = (bookId: string): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  return `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${bookId}/current`;
};

const bookOperationPath = (bookId: string, operationId: string): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  assertPathId(operationId, 'invalid_book_assembly_publication_operation_id');
  return `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${bookId}/operations/${operationId}`;
};

/**
 * RTDB erases null and empty-array object children. For schema version 1 these
 * seven fields have one domain-defined erased value, so reconstruct them at
 * the read boundary before strict canonical validation. No present value and
 * no field with ambiguous absence is changed.
 */
const hydrateCanonicalActivityShapeFromRtdb = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  return {
    ...value,
    ...(!Object.hasOwn(value, 'taskProfile') ? { taskProfile: null } : {}),
    ...(!Object.hasOwn(value, 'stimulus') ? { stimulus: null } : {}),
    ...(!Object.hasOwn(value, 'assetRefs') ? { assetRefs: [] } : {}),
  };
};

export const hydrateCanonicalActivityVersionFromRtdb = (value: unknown): unknown => {
  if (!isRecord(value) || value.schemaVersion !== 1) return value;
  return {
    ...value,
    ...(!Object.hasOwn(value, 'evidenceRefs') ? { evidenceRefs: [] } : {}),
    ...(isRecord(value.activity)
      ? { activity: hydrateCanonicalActivityShapeFromRtdb(value.activity) }
      : {}),
    ...(isRecord(value.projection)
      ? { projection: hydrateCanonicalActivityShapeFromRtdb(value.projection) }
      : {}),
  };
};

const parseCanonical = (
  value: unknown,
): CanonicalPublishedActivityVersionRecord | null => {
  try {
    return assertCanonicalPublishedActivityVersion(value);
  } catch {
    return null;
  }
};

const parseCanonicalFromRtdb = (
  value: unknown,
): CanonicalPublishedActivityVersionRecord | null => {
  try {
    return assertCanonicalPublishedActivityVersion(hydrateCanonicalActivityVersionFromRtdb(value));
  } catch {
    return null;
  }
};

const safeProjectionFor = (
  record: CanonicalPublishedActivityVersionRecord,
): Record<string, unknown> => ({
  schemaVersion: 1,
  projectionKind: 'student-safe',
  activityId: record.activityId,
  activityVersionId: record.activityVersionId,
  ownerId: record.ownerId,
  content: record.projection,
  payloadFingerprint: record.payloadFingerprint,
  createdByOperationId: record.createdByOperationId,
  publishedAt: record.publishedAt,
});

const hydrateStudentSafeProjectionFromRtdb = (value: unknown): unknown => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.content)) return value;
  return {
    ...value,
    content: hydrateCanonicalActivityShapeFromRtdb(value.content),
  };
};

const assertServiceAccountMatchesIdentity = (
  keyJson: string,
  identity: string,
  errorPrefix: string,
): void => {
  let key: ServiceAccountKey;
  try {
    const parsed = JSON.parse(keyJson) as unknown;
    if (!isRecord(parsed)
      || typeof parsed.client_email !== 'string'
      || typeof parsed.private_key !== 'string'
      || parsed.client_email === ''
      || parsed.private_key === '') {
      throw new Error('invalid');
    }
    key = parsed as unknown as ServiceAccountKey;
  } catch {
    throw new Error(`invalid_${errorPrefix}_google_sa_key`);
  }
  if (key.client_email !== identity) {
    throw new Error(`${errorPrefix}_service_identity_mismatch`);
  }
};

const rtdbClient = (
  env: RepositoryEnv,
  keyJson: string | undefined,
  fetchImpl: typeof fetch,
  getAccessToken: (() => Promise<string>) | undefined,
  getFirebaseAuthToken?: (request?: FirebaseRtdbAuthRequest) => Promise<string>,
): FirebaseRtdbRestClient => new FirebaseRtdbRestClient({
  // Do not allow the shared/generic key to become an implicit authority.
  env: { ...env, GOOGLE_SA_KEY: keyJson },
  fetchImpl,
  getAccessToken,
  ...(getFirebaseAuthToken === undefined ? {} : {
    firebaseAuthToken: true,
    getFirebaseAuthToken,
  }),
});

const assertRetryCount = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new Error('invalid_canonical_activity_version_max_retries');
  }
  return value;
};

const sameReference = (
  value: unknown,
  reference: BookAssemblyActivityVersionReference,
): boolean => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && value.activityId === reference.activityId
    && value.activityVersionId === reference.activityVersionId
    && value.activityVersion === reference.activityVersion
    && typeof reference.canonicalPayloadFingerprint === 'string'
    && value.payloadFingerprint === reference.canonicalPayloadFingerprint;
};

const sameManifest = (
  value: unknown,
  request: ExactPublishedActivityVersionRequest,
): boolean => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && value.lifecycle === 'published'
    && value.bookId === request.bookId
    && value.manifestVersionId === request.manifestVersionId
    && value.publicationId === request.publicationId
    && value.ownerId === request.ownerId
    && Number.isSafeInteger(value.publicationRevision)
    && (value.publicationRevision as number) >= 1
    && isRecord(value.manifest)
    && isRecord(value.studentSafeProjection);
};

const sameBookActivityVersion = (
  value: unknown,
  request: ExactPublishedActivityVersionRequest,
  expectedPublicationRevision: number,
): boolean => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && value.bookId === request.bookId
    && value.manifestVersionId === request.manifestVersionId
    && value.publicationId === request.publicationId
    && value.ownerId === request.ownerId
    && value.activityId === request.activityId
    && value.activityVersionId === request.activityVersionId
    && value.activityVersion === request.activityVersion
    && value.publicationRevision === expectedPublicationRevision
    && value.canonicalPayloadFingerprint === request.payloadFingerprint
    && typeof value.safeProjectionId === 'string'
    && PATH_ID.test(value.safeProjectionId)
    && typeof value.createdByCommandId === 'string'
    && PATH_ID.test(value.createdByCommandId);
};

const sameBookSafeProjection = (
  value: unknown,
  bookActivityVersion: Record<string, unknown>,
  request: ExactPublishedActivityVersionRequest,
  expectedPublicationRevision: number,
): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && value.projectionId === bookActivityVersion.safeProjectionId
    && value.bookId === request.bookId
    && value.manifestVersionId === request.manifestVersionId
    && value.publicationId === request.publicationId
    && value.publicationRevision === expectedPublicationRevision
    && value.ownerId === request.ownerId
    && value.activityId === request.activityId
    && value.activityVersionId === request.activityVersionId
    && Array.isArray(value.placementIds)
    && value.placementIds.length > 0
    && value.placementIds.every((candidate) => typeof candidate === 'string' && PATH_ID.test(candidate))
    && stable(value.sourcePages) === stable(bookActivityVersion.sourcePages);
};

const sameBookPlacement = (
  value: unknown,
  bookActivityVersion: Record<string, unknown>,
  request: ExactPublishedActivityVersionRequest,
  expectedPublicationRevision: number,
): boolean => {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && value.bookId === request.bookId
    && value.manifestVersionId === request.manifestVersionId
    && value.publicationId === request.publicationId
    && value.publicationRevision === expectedPublicationRevision
    && value.ownerId === request.ownerId
    && value.activityId === request.activityId
    && value.activityVersionId === request.activityVersionId
    && value.unitKey === bookActivityVersion.unitKey
    && value.activityKey === bookActivityVersion.activityKey
    && stable(value.sourcePages) === stable(bookActivityVersion.sourcePages);
};

const publicationVisible = (
  current: unknown,
  operation: unknown,
  bookActivityVersion: Record<string, unknown>,
  request: ExactPublishedActivityVersionRequest,
): boolean => {
  if (isRecord(current)
    && current.manifestVersionId === request.manifestVersionId
    && current.publicationId === request.publicationId) return true;
  if (!isRecord(operation) || !isRecord(operation.result)) return false;
  const result = operation.result;
  return operation.ownerId === request.ownerId
    && result.status === 'published'
    && isRecord(result.pointer)
    && result.pointer.manifestVersionId === request.manifestVersionId
    && result.pointer.publicationId === request.publicationId
    && bookActivityVersion.createdByCommandId !== undefined;
};

const sameCanonicalIdentity = (
  record: CanonicalPublishedActivityVersionRecord,
  request: ExactPublishedActivityVersionRequest,
  bookActivityVersion: Record<string, unknown>,
): boolean => {
  const candidate = record as unknown as Record<string, unknown>;
  const provenance = candidate.provenance;
  if (!isRecord(provenance)) return false;
  const provenanceBookId = provenance.bookId;
  const initialLineageMatches = provenance.kind !== 'initial-book-publication'
    || (provenance.manifestVersionId === bookActivityVersion.canonicalOriginManifestVersionId
      && provenance.publicationId === bookActivityVersion.canonicalOriginPublicationId
      && candidate.createdByOperationId === bookActivityVersion.canonicalOriginOperationId);
  return candidate.lifecycle === 'published'
    && candidate.activityId === request.activityId
    && candidate.activityVersionId === request.activityVersionId
    && candidate.activityVersion === request.activityVersion
    && candidate.ownerId === request.ownerId
    && candidate.payloadFingerprint === request.payloadFingerprint
    && initialLineageMatches
    // Initial-publication provenance is Book-bound; revision provenance is
    // reusable and is bound to the Book by the exact local reference above.
    && (provenanceBookId === undefined || provenanceBookId === request.bookId);
};

const exactRequestPaths = (request: ExactPublishedActivityVersionRequest): {
  manifest: string;
  bookActivityVersion: string;
  canonical: string;
  studentSafeProjection: string;
} => ({
  manifest: manifestPath(request.bookId, request.manifestVersionId),
    bookActivityVersion: bookActivityVersionPath(
      request.bookId,
      request.manifestVersionId,
      request.activityVersionId,
    ),
  canonical: canonicalPath(request.activityId, request.activityVersionId),
  studentSafeProjection: studentSafeProjectionPath(
    request.activityId,
    request.activityVersionId,
  ),
});

const readerClaimsForPath = (
  path: string,
  request: ExactPublishedActivityVersionRequest,
): BookFirebaseClaimTuple => {
  const paths = exactRequestPaths(request);
  if (path === paths.canonical || path === paths.studentSafeProjection) {
    return {
      service: 'book_activity_runtime_reader',
      ownerId: request.ownerId,
      bookId: request.bookId,
      manifestVersionId: request.manifestVersionId,
      activityId: request.activityId,
      activityVersionId: request.activityVersionId,
    };
  }
  const publicationPrefix = `${BOOK_ASSEMBLY_PUBLICATION_ROOT}/${request.bookId}/`;
  if (path.startsWith(publicationPrefix)) {
    return {
      service: 'book_assembly_publication',
      bookId: request.bookId,
      ownerId: request.ownerId,
    };
  }
  throw new Error('canonical_activity_version_reader_path_invalid');
};

/** Exact Firebase claim tuple used for each protected read in one request. */
export const canonicalActivityVersionReaderClaimsForPath = readerClaimsForPath;

export class FirebaseRestCanonicalActivityVersionWriter
implements CanonicalActivityVersionWriter {
  /**
   * Exact-key compatibility reader. `BookAssemblyActivityVersionReference`
   * intentionally has no Book scope, so only `prepare` mints scoped Firebase
   * tokens; this client cannot read a parent or scan an Activity root.
   */
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly rtdbForPrepare: (
    record: CanonicalPublishedActivityVersionRecord,
  ) => FirebaseRtdbRestClient;
  private readonly prepared = new Map<string, CanonicalPublishedActivityVersionRecord>();
  private readonly allowCompatibilityRead: boolean;
  private readonly maxRetries: number;

  constructor(private readonly options: {
    env: CanonicalActivityVersionWriterEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const dedicatedIdentity = options.env
      .BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_SERVICE_IDENTITY?.trim();
    const dedicatedKey = options.env
      .BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_GOOGLE_SA_KEY?.trim();
    // Dedicated credentials remain an optional override. Production-normal
    // publication otherwise reuses the Assembly account with Firebase claims.
    const identity = dedicatedIdentity ?? options.env.BOOK_ASSEMBLY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_canonical_activity_version_writer_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const keyJson = dedicatedKey ?? options.env.BOOK_ASSEMBLY_GOOGLE_SA_KEY?.trim();
    if (keyJson) {
      assertServiceAccountMatchesIdentity(
        keyJson,
        identity,
        'canonical_activity_version_writer',
      );
    }
    if (!keyJson && !options.getAccessToken) {
      throw new Error('missing_canonical_activity_version_writer_google_sa_key');
    }
    this.maxRetries = assertRetryCount(options.maxRetries ?? MAX_RETRIES);
    this.allowCompatibilityRead = options.getAccessToken !== undefined;
    this.rtdb = rtdbClient(options.env, keyJson, fetchImpl, options.getAccessToken);
    if (options.getAccessToken) {
      // Preserve the injected OAuth seam for existing compatibility callers.
      this.rtdbForPrepare = () => this.rtdb;
      return;
    }
    if (!keyJson) throw new Error('missing_canonical_activity_version_writer_google_sa_key');
    const getFirebaseAuthToken = createFirebaseClaimTokenProvider({
      serviceAccountJson: keyJson,
      serviceIdentity: identity,
      firebaseProjectId: options.env.FIREBASE_PROJECT_ID?.trim() ?? '',
      firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '',
      fetchImpl,
    });
    this.rtdbForPrepare = (record) => {
      if (record.provenance.kind !== 'initial-book-publication') {
        throw new Error('canonical_activity_version_writer_publication_scope_unavailable');
      }
      const claims: BookFirebaseClaimTuple = {
        service: 'book_activity_publication_writer',
        ownerId: record.ownerId,
        activityId: record.activityId,
        activityVersionId: record.activityVersionId,
      };
      return rtdbClient(
        options.env,
        keyJson,
        fetchImpl,
        undefined,
        async () => getFirebaseAuthToken(claims),
      );
    };
  }

  async prepare(
    record: CanonicalPublishedActivityVersionRecord,
  ): Promise<CanonicalActivityVersionPrepareResult> {
    const parsedRecord = parseCanonical(record);
    if (!parsedRecord) return { status: 'conflict' };
    const versionPath = canonicalPath(parsedRecord.activityId, parsedRecord.activityVersionId);
    const projectionPath = studentSafeProjectionPath(
      parsedRecord.activityId,
      parsedRecord.activityVersionId,
    );
    const expectedProjection = safeProjectionFor(parsedRecord);
    const rtdb = this.rtdbForPrepare(parsedRecord);

    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const currentVersion = await rtdb.readWithEtag<unknown>(versionPath);
      const currentProjection = await rtdb.readWithEtag<unknown>(projectionPath);
      const versionPresent = currentVersion.data !== null && currentVersion.data !== undefined;
      const projectionPresent = currentProjection.data !== null
        && currentProjection.data !== undefined;

      if (versionPresent) {
        const existing = parseCanonicalFromRtdb(currentVersion.data);
        if (!existing || stable(existing) !== stable(parsedRecord)) {
          return { status: 'conflict' };
        }
      }
      if (projectionPresent
        && stable(hydrateStudentSafeProjectionFromRtdb(currentProjection.data))
          !== stable(expectedProjection)) {
        return { status: 'conflict' };
      }
      if (versionPresent && projectionPresent) {
        this.prepared.set(versionPath, parsedRecord);
        return { status: 'replayed' };
      }

      if (!versionPresent
        && !(await rtdb.writeIfMatch(versionPath, parsedRecord, currentVersion.etag))) {
        continue;
      }
      if (!projectionPresent
        && !(await rtdb.writeIfMatch(projectionPath, expectedProjection, currentProjection.etag))) {
        continue;
      }
      this.prepared.set(versionPath, parsedRecord);
      return { status: 'created' };
    }

    throw new Error('canonical_activity_version_cas_retries_exhausted');
  }

  async readPrepared(
    reference: BookAssemblyActivityVersionReference,
  ): Promise<CanonicalPublishedActivityVersionRecord | null> {
    const path = canonicalPath(reference.activityId, reference.activityVersionId);
    const prepared = this.prepared.get(path);
    if (prepared) return sameReference(prepared, reference) ? structuredClone(prepared) : null;
    if (!this.allowCompatibilityRead) return null;
    const parsed = parseCanonicalFromRtdb(await this.rtdb.readValue(path));
    if (!parsed || !sameReference(parsed, reference)) return null;
    return parsed;
  }
}

export class FirebaseRestExactPublishedActivityVersionReader
implements ExactPublishedActivityVersionReader {
  private readonly rtdbFor: (
    request: ExactPublishedActivityVersionRequest,
  ) => FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: CanonicalActivityVersionReaderEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    /** Injectable Firebase ID-token seam; takes precedence over production token minting. */
    getFirebaseAuthToken?: (request?: FirebaseRtdbAuthRequest) => Promise<string>;
  }) {
    const dedicatedIdentity = options.env.BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_SERVICE_IDENTITY?.trim();
    const dedicatedKey = options.env.BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_READER_GOOGLE_SA_KEY?.trim();
    const hasPartialDedicatedBinding = Boolean(dedicatedIdentity || dedicatedKey) && !(
      dedicatedIdentity && dedicatedKey
    );
    if (hasPartialDedicatedBinding && !options.getAccessToken && !options.getFirebaseAuthToken) {
      throw new Error('incomplete_canonical_activity_version_reader_binding');
    }
    // Reader credentials are deliberately dedicated. The generic assembly
    // identity/key are not a production fallback; route composition must
    // provide this binding (or an explicit injected auth seam).
    const identity = dedicatedIdentity;
    if (!identity) throw new Error('missing_canonical_activity_version_reader_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const keyJson = dedicatedKey;
    if (keyJson) {
      assertServiceAccountMatchesIdentity(
        keyJson,
        identity,
        'canonical_activity_version_reader',
      );
    }
    if (!keyJson && !options.getAccessToken && !options.getFirebaseAuthToken) {
      throw new Error('missing_canonical_activity_version_reader_google_sa_key');
    }
    if (options.getFirebaseAuthToken) {
      this.rtdbFor = () => rtdbClient(
          options.env,
          keyJson,
          fetchImpl,
          options.getAccessToken,
          options.getFirebaseAuthToken,
        );
      return;
    }
    if (options.getAccessToken) {
      // Existing tests and mutation-adjacent callers use OAuth injection. Keep
      // that seam unchanged; production credentials below use Firebase Auth.
      this.rtdbFor = () => rtdbClient(options.env, keyJson, fetchImpl, options.getAccessToken);
      return;
    }
    if (!keyJson) throw new Error('missing_canonical_activity_version_reader_google_sa_key');
    const getFirebaseAuthToken = createFirebaseClaimTokenProvider({
      serviceAccountJson: keyJson,
      serviceIdentity: identity,
      firebaseProjectId: options.env.FIREBASE_PROJECT_ID?.trim() ?? '',
      firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '',
      fetchImpl,
    });
    this.rtdbFor = (request) => rtdbClient(
        options.env,
        keyJson,
        fetchImpl,
        undefined,
        async (authRequest = { path: '' }) => getFirebaseAuthToken(
          readerClaimsForPath(authRequest.path, request),
        ),
      );
  }

  async readExact(
    request: ExactPublishedActivityVersionRequest,
  ): Promise<CanonicalPublishedActivityVersionRecord | null> {
    const rtdb = this.rtdbFor(request);
    const paths = exactRequestPaths(request);
    const manifest = await rtdb.readValue(paths.manifest);
    if (!sameManifest(manifest, request)) return null;
    const publicationRevision = (manifest as Record<string, unknown>).publicationRevision;

      const bookActivityVersion = await rtdb.readValue(paths.bookActivityVersion);
      if (!sameBookActivityVersion(bookActivityVersion, request, publicationRevision as number)) return null;
      const bookActivity = bookActivityVersion as Record<string, unknown>;
      const current = await rtdb.readValue(bookCurrentPath(request.bookId));
      const operation = isRecord(current)
        && current.manifestVersionId === request.manifestVersionId
        && current.publicationId === request.publicationId
        ? null
        : await rtdb.readValue(bookOperationPath(
          request.bookId,
          bookActivity.createdByCommandId as string,
        ));
      if (!publicationVisible(current, operation, bookActivity, request)) return null;
    const bookSafeProjection = await rtdb.readValue(bookSafeProjectionPath(
      request.bookId,
      bookActivity.safeProjectionId as string,
    ));
    if (!sameBookSafeProjection(
      bookSafeProjection,
      bookActivity,
      request,
      publicationRevision as number,
    )) return null;

    const canonical = parseCanonicalFromRtdb(await rtdb.readValue(paths.canonical));
    if (!canonical || !sameCanonicalIdentity(canonical, request, bookActivity)) return null;
    const placementIds = (bookSafeProjection as Record<string, unknown>).placementIds as string[];
    if (stable([...placementIds].sort()) !== stable([...canonical.placementIds].sort())) return null;
    for (const placementId of placementIds) {
      if (!sameBookPlacement(
        await rtdb.readValue(bookPlacementPath(request.bookId, placementId)),
        bookActivity,
        request,
        publicationRevision as number,
      )) return null;
    }
    const studentSafeProjection = hydrateStudentSafeProjectionFromRtdb(
      await rtdb.readValue(paths.studentSafeProjection),
    );
    if (stable(studentSafeProjection) !== stable(safeProjectionFor(canonical))) return null;
    return canonical;
  }
}

// Descriptive aliases keep the port names discoverable to Worker composition
// without creating a second implementation or a broader repository surface.
export { FirebaseRestCanonicalActivityVersionWriter as FirebaseRestCanonicalActivityVersionRepository };
export { FirebaseRestExactPublishedActivityVersionReader as FirebaseRestCanonicalActivityVersionReader };

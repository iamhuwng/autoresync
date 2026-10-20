import { validateLocalBookAuthoring } from '../../../../src/services/materialCatalog/localBookAuthoringValidation.service.ts';
import { normalizeActivity } from '../../../../src/services/book-activity/activityCanonical.service.ts';
import type { LocalBookAuthoringValidationInput } from '../../../../src/services/materialCatalog/localBookAuthoringValidation.service.ts';
import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import type { BookAssemblyManifestCandidate } from '../../../../src/types/bookAssembly.types.ts';
import { readTrustedBookSourceProjection, readTrustedSourceSafety } from '../book-source/trusted-source-contract.ts';
import { createBookSourceUploadRuntime } from '../book-source/worker.ts';
import {
  createStudentDocumentUploadSink,
  prepareTrustedComponentPdf,
  type ComponentPdfPreparationDependencies,
  type PreparedComponentPdfArtifact,
  type TrustedComponentSource,
} from './component-preparation.ts';
import { createBookSourceVersionStorageIdentity } from '../../../../src/services/book-source-delivery/sourceVersion.service.ts';
import { resolveBackblazeB2ProviderWiring } from '../../book-source-worker/backblaze-b2-provider-wiring.ts';
import { computeBookSubmissionFingerprint } from '../../../../src/services/materialCatalog/bookSubmissionInput.service.ts';
import { createProductionBookSubmissionPublicationFinalizer, normalizeMetadata } from './publication.ts';
import type { BookSubmissionPreparedPublication, BookSubmissionPublicationFinalizer, BookSubmissionVerifiedSource } from './publication.ts';
export { createProductionBookSubmissionPublicationFinalizer } from './publication.ts';
export type { BookSubmissionPreparedPublication, BookSubmissionPublicationFinalizer } from './publication.ts';
import {
  createBookSubmissionCommitAdapter,
  BookSubmissionWorkerError,
  type BookSubmissionCommitAdapter,
  type BookSubmissionWorkerEnv,
} from './worker.ts';

const ACCOUNT_ID = /^[A-Za-z0-9_:@-]{1,256}$/u;

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
);

const databaseUrl = (value: unknown, allowInsecureLocalhost = false): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('book_submission_database_unavailable');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('book_submission_database_unavailable'); }
  const localHttp = allowInsecureLocalhost && parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  const localNamespace = localHttp && parsed.search === '?ns=demo-luyentap-local';
  if ((!localHttp && parsed.protocol !== 'https:') || parsed.username || parsed.password || (parsed.search && !localNamespace) || parsed.hash) {
    throw new Error('book_submission_database_unavailable');
  }
  return parsed.href.replace(/\/$/u, '');
};

const productionIdentity = (env: BookSubmissionWorkerEnv): { baseUrl: string; token: () => Promise<string> } => {
  const baseUrl = databaseUrl(env.FIREBASE_DB_URL, env.LOCAL_EMULATOR_AUTH === 'true');
  const identity = env.BOOK_SUBMISSION_SERVICE_IDENTITY;
  const raw = env.BOOK_SUBMISSION_GOOGLE_SA_KEY;
  if (typeof identity !== 'string' || !identity.trim() || typeof raw !== 'string' || !raw.trim()) {
    throw new Error('book_submission_service_unavailable');
  }
  let parsed: RecordValue | null;
  try { parsed = record(JSON.parse(raw)); } catch { parsed = null; }
  if (parsed?.client_email !== identity || typeof parsed.private_key !== 'string') {
    throw new Error('book_submission_service_unavailable');
  }
  // Importing the existing provider keeps token caching and service-account
  // validation in the same trusted path as Source Upload.
  const providerPromise = env.LOCAL_EMULATOR_AUTH === 'true'
    ? Promise.resolve({ getAccessToken: async () => 'owner' })
    : import('../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts')
      .then(({ createTrustedFirebaseRtdbServiceAccountAccessTokenProvider }) =>
        createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
          serviceAccountEmail: identity,
          serviceAccountPrivateKey: (parsed!.private_key as string).replace(/\\n/gu, '\n'),
        }));
  return { baseUrl, token: async () => (await providerPromise).getAccessToken() };
};

const readJson = async (baseUrl: string, token: () => Promise<string>, path: string): Promise<unknown> => {
  const url = new URL(baseUrl); const query = url.search; url.search = ''; url.pathname = `${url.pathname.replace(/\/$/u, '')}/${path}.json`; url.search = query;
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${await token()}` } });
  if (!response.ok) throw new Error('book_submission_state_unavailable');
  return response.json();
};

const sourceProjectionPath = (accountId: string, bookId: string, sourceVersionId: string) =>
  `book_source_upload_accounts/${accountId}/assemblyBooks/${bookId}/${sourceVersionId}`;

const createProductionSourceReceiptReader = (env: BookSubmissionWorkerEnv) => {
  const account = env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID;
  if (typeof account !== 'string' || !ACCOUNT_ID.test(account)) throw new Error('book_submission_source_account_unavailable');
  const identity = productionIdentity(env);
  return async (input: Parameters<NonNullable<Parameters<typeof createBookSubmissionCommitAdapter>[0]['readSourceReceipt']>>[0]): Promise<BookSubmissionVerifiedSource | null> => {
    const accountState = record(await readJson(identity.baseUrl, identity.token, `book_source_upload_accounts/${account}`));
    const rawProjection = record(record(accountState?.assemblyBooks)?.[input.operation.finalBookId])?.[input.receipt.sourceVersionId];
    const projection = readTrustedBookSourceProjection(rawProjection, {
      ownerId: input.uid,
      bookId: input.operation.finalBookId,
      sourceKey: typeof (input.receipt as unknown as Record<string, unknown>).sourceKey === 'string'
        ? (input.receipt as unknown as Record<string, unknown>).sourceKey as string : 'full',
      sourceVersionId: input.receipt.sourceVersionId,
      purpose: input.receipt.purpose,
    });
    if (!projection || projection.studentSafeStatus !== 'ready'
      || projection.checksum.value.toLowerCase() !== input.receipt.sha256Hex.toLowerCase()
      || projection.physicalPageCount !== input.receipt.physicalPageCount) return null;
    const operations = record(accountState?.operations);
    const operation = operations
      ? Object.values(operations).map(record).find((entry) => entry?.sourceVersionId === input.receipt.sourceVersionId)
      : null;
    const storage = record(operation?.verifiedStorage);
    let storageIdentity;
    try { storageIdentity = createBookSourceVersionStorageIdentity(storage); } catch { return null; }
    const safety = readTrustedSourceSafety(operation, { sourceVersionId: input.receipt.sourceVersionId,
      purpose: input.receipt.purpose, checksum: operation?.expectedChecksum });
    const valid = operation?.ownerId === input.uid
      && operation?.bookId === input.operation.finalBookId
      && operation?.submissionOperationId === input.operation.operationId
      && operation?.status === 'verified_completed'
      && operation?.purpose === input.receipt.purpose
      && operation?.sourceKey === input.receipt.sourceKey
      && safety?.studentSafeStatus === 'ready' && !!safety.studentSafeDecision
      && operation?.physicalPageCount === input.receipt.physicalPageCount
      && storageIdentity.bookId === input.operation.finalBookId
      && storageIdentity.sourceVersionId === input.receipt.sourceVersionId
      && storageIdentity.checksum.value === projection.checksum.value
      && storageIdentity.byteSize === input.receipt.byteSize
      && typeof record(operation?.expectedChecksum)?.value === 'string'
      && (record(operation?.expectedChecksum)?.value as string).toLowerCase() === input.receipt.sha256Hex.toLowerCase();
    return valid ? { ...projection, byteSize: input.receipt.byteSize } : null;
  };
};

const createProductionComponentPreparationDependencies = async (input: {
  readonly operation: import('../../../../src/services/materialCatalog/bookSubmission.contract.ts').BookSubmissionOperation;
  readonly env: BookSubmissionWorkerEnv;
  readonly uid: string;
}): Promise<ComponentPdfPreparationDependencies> => {
  const account = input.env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID;
  if (typeof account !== 'string' || !ACCOUNT_ID.test(account)) throw new BookSubmissionWorkerError('book_submission_source_account_unavailable', 503);
  const provider = resolveBackblazeB2ProviderWiring(input.env).provider;
  if (!provider) throw new BookSubmissionWorkerError('book_submission_source_provider_unavailable', 503);
  const runtime = await createBookSourceUploadRuntime(input.env as never);
  const identity = productionIdentity(input.env);
  const readSource = async ({ sourceKey, sourceVersionId }: { readonly sourceKey: string; readonly sourceVersionId: string }) => {
    const state = record(await readJson(identity.baseUrl, identity.token, `book_source_upload_accounts/${account}`));
    const rawProjection = record(record(state?.assemblyBooks)?.[input.operation.finalBookId])?.[sourceVersionId];
    const projection = readTrustedBookSourceProjection(rawProjection, {
      ownerId: input.uid, bookId: input.operation.finalBookId, sourceKey, sourceVersionId, purpose: 'book-source',
    });
    const operations = record(state?.operations);
    const operation = operations ? Object.values(operations).map(record).find((entry) => entry?.sourceVersionId === sourceVersionId) : null;
    const storage = record(operation?.verifiedStorage);
    const checksum = projection?.checksum;
    if (!projection || !checksum || !storage || operation?.ownerId !== input.uid || operation.bookId !== input.operation.finalBookId
      || operation.submissionOperationId !== input.operation.operationId
      || operation.status !== 'verified_completed' || operation.purpose !== 'book-source' || projection.studentSafeStatus !== 'ready') {
      throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
    }
    let storageIdentity;
    try { storageIdentity = createBookSourceVersionStorageIdentity(storage); }
    catch { throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409); }
    if (storageIdentity.bookId !== input.operation.finalBookId
      || storageIdentity.sourceVersionId !== sourceVersionId
      || storageIdentity.checksum.value.toLowerCase() !== checksum.value.toLowerCase()
      || storageIdentity.byteSize !== operation?.byteSize) {
      throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
    }
    return {
      sourceKey, sourceVersionId,
      identity: storageIdentity,
      checksum,
      byteSize: storageIdentity.byteSize,
      physicalPageCount: projection.physicalPageCount,
    };
  };
  const uploadStudentDocument = createStudentDocumentUploadSink({ control: {
    begin: runtime.service.begin,
    complete: runtime.service.complete,
    decideStudentSafeSource: async (value) => {
      if (!runtime.service.decideStudentSafeSource) throw new Error('student_document_control_unavailable');
      return runtime.service.decideStudentSafeSource(value);
    },
  } });
  return {
    sourceProvider: provider,
    readSource,
    uploadStudentDocument,
    persistPreparedArtifact: async () => undefined,
  };
};

const validateAuthoring = (
  value: unknown,
  receipts: readonly RecordValue[],
  finalBookId: string,
): BookSubmissionPreparedPublication => {
  const authoring = record(value);
  if (!authoring || Object.keys(authoring).some((key) => ![
    'strategy', 'pdfs', 'structureJson', 'unitsJson', 'pageMappingJson', 'pdfPageCounts',
  ].includes(key))) throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409);
  const strategy = authoring.strategy === 'full' || authoring.strategy === 'component'
    ? authoring.strategy : null;
  const pdfs = Array.isArray(authoring.pdfs) ? authoring.pdfs : [];
  const trustedPageCounts: Record<string, number> = {};
  for (const pdf of pdfs) {
    const entry = record(pdf);
    if (!entry || Object.keys(entry).some((key) => ![
      'sourceKey', 'displayFilename', 'sha256Hex', 'byteSize', 'physicalPageCount',
    ].includes(key)) || typeof entry.sourceKey !== 'string'
      || typeof entry.displayFilename !== 'string' || typeof entry.sha256Hex !== 'string'
      || !/^[a-f0-9]{64}$/iu.test(entry.sha256Hex)
      || !Number.isSafeInteger(entry.byteSize) || (entry.byteSize as number) < 1
      || !Number.isSafeInteger(entry.physicalPageCount) || (entry.physicalPageCount as number) < 1) {
      throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409);
    }
    const receipt = receipts.find((candidate) => candidate.sourceKey === entry.sourceKey);
    if (!receipt || String(receipt.sha256Hex).toLowerCase() !== entry.sha256Hex.toLowerCase()
      || receipt.byteSize !== entry.byteSize || receipt.physicalPageCount !== entry.physicalPageCount) {
      throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
    }
    trustedPageCounts[entry.sourceKey] = receipt.physicalPageCount as number;
  }
  if (pdfs.length === 0 || pdfs.some((pdf) => {
    const entry = record(pdf);
    return !entry || typeof entry.sourceKey !== 'string'
      || !receipts.some((receipt) => receipt.sourceKey === entry.sourceKey);
  })) throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409);
  const result = validateLocalBookAuthoring({
    strategy,
    pdfs: pdfs as never,
    structureJson: authoring.structureJson,
    unitsJson: authoring.unitsJson,
    pageMappingJson: authoring.pageMappingJson,
    pdfPageCounts: trustedPageCounts,
  } as LocalBookAuthoringValidationInput);
  if (!result.valid || !result.manifest || !result.activitiesByKey) {
    throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409);
  }
  const sourceSet = result.manifest.sourceSet;
  const boundSources = sourceSet.sources.map((source) => {
    const receipt = receipts.find((candidate) => candidate.sourceKey === source.sourceKey);
    if (!receipt || typeof receipt.sourceVersionId !== 'string') {
      throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
    }
    return { ...source, sourceVersionId: receipt.sourceVersionId };
  });
  const activitiesByKey: Record<string, NormalizedActivity> = {};
  for (const [key, activity] of Object.entries(result.activitiesByKey)) {
    try {
      const separator = key.indexOf(':');
      const unitKey = separator > 0 ? key.slice(0, separator) : undefined;
      const activityKey = separator > 0 ? key.slice(separator + 1) : key;
      const unit = unitKey ? result.manifest.units.find((candidate) => candidate.unitKey === unitKey) : undefined;
      const slot = unit?.activitySlots.find((candidate) => candidate.activityKey === activityKey);
      const mappedBookPageRefs = slot?.pageGroupKeys.flatMap((pageGroupKey) => {
        const group = unit?.pageGroups.find((candidate) => candidate.pageGroupKey === pageGroupKey);
        return group?.pages.map((page) => `source:${group.sourceKey}:page:${page}`) ?? [];
      }) ?? [];
      activitiesByKey[key] = normalizeActivity(activity, {
        createId: () => `submission-${crypto.randomUUID()}`,
      }, undefined, { mappedBookPageRefs });
    } catch {
      throw new BookSubmissionWorkerError('book_submission_activity_invalid', 409);
    }
  }
  return {
    strategy: strategy === 'full' ? 'full_pdf' : 'component_pdfs',
    manifest: { ...result.manifest, bookId: finalBookId, sourceSet: { ...sourceSet, sources: boundSources } },
    activitiesByKey,
  };
};

/** Production finalizer. It prepares the immutable publication scope in memory
 * and exposes the Book, publication pointer, activity projections, catalog
 * references, and committed operation receipt in one fenced RTDB patch. */
export const createProductionBookSubmissionCommitAdapter = (
  options: { readonly publication?: BookSubmissionPublicationFinalizer } = {},
): BookSubmissionCommitAdapter => {
  const publication = options.publication ?? createProductionBookSubmissionPublicationFinalizer();
  let cached: { env: BookSubmissionWorkerEnv; reader: ReturnType<typeof createProductionSourceReceiptReader> } | undefined;
  return async (input) => {
    if (!cached || cached.env !== input.env) {
      cached = { env: input.env, reader: createProductionSourceReceiptReader(input.env) };
    }
    const reader = cached.reader;
    const sources: BookSubmissionVerifiedSource[] = [];
    await createBookSubmissionCommitAdapter({ readSourceReceipt: async (request) => {
      const source = await reader(request);
      if (source) sources.push(source);
      return source !== null;
    } })(input);
    const metadata = normalizeMetadata(input.payload.metadata);
    const receipts = Array.isArray(input.payload.sourceReceipts)
      ? input.payload.sourceReceipts.map((value) => record(value)).filter((value): value is RecordValue => value !== null)
      : [];
    if (receipts.length === 0 || receipts.some((receipt) => receipt.purpose !== 'book-source')) {
      throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
    }
    const prepared = validateAuthoring(input.payload.authoring, receipts, input.operation.finalBookId);
    const recomputedFingerprint = await computeBookSubmissionFingerprint(metadata, input.payload.authoring);
    if (recomputedFingerprint !== input.operation.fingerprint) {
      throw new BookSubmissionWorkerError('book_submission_fingerprint_mismatch', 409);
    }
    // Component sources require an independently rebuilt student-document
    // receipt. Until the bounded source-provider preparation step is wired,
    // fail before any canonical or catalog write rather than exposing a
    // component publication backed only by client mapping claims.
    if (prepared.strategy === 'component_pdfs' && !input.preparedComponent) {
      throw new BookSubmissionWorkerError('book_submission_component_preparation_required', 409);
    }
    const document = input.preparedComponent?.studentDocument;
    const studentDocumentSource = document ? await reader({
      uid: input.uid, operation: input.operation, env: input.env,
      receipt: { ...document, sourceKey: 'student-document', purpose: 'student-document' },
    }) : undefined;
    if (document && !studentDocumentSource) throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
    await publication.commit({
      operation: input.operation,
      uid: input.uid,
      operationId: input.operation.operationId,
      finalBookId: input.operation.finalBookId,
      fingerprint: input.operation.fingerprint,
      metadata,
      prepared,
      sources,
      ...(studentDocumentSource ? { studentDocumentSource } : {}),
      env: input.env,
      request: input.request,
      ...(input.preparedComponent ? { componentArtifact: input.preparedComponent } : {}),
    });
  };
};

/** Builds the client-driven preparation step from the same authoring validator used by commit. */
export const createProductionComponentPreparationAdapter = (options: {
  readonly dependenciesFactory?: (input: {
    readonly operation: import('../../../../src/services/materialCatalog/bookSubmission.contract.ts').BookSubmissionOperation;
    readonly env: BookSubmissionWorkerEnv;
    readonly uid: string;
    readonly request: Request;
  }) => Promise<ComponentPdfPreparationDependencies> | ComponentPdfPreparationDependencies;
} = {}) => async (input: {
  readonly operation: import('../../../../src/services/materialCatalog/bookSubmission.contract.ts').BookSubmissionOperation;
  readonly payload: Record<string, unknown>;
  readonly request: Request;
  readonly env: BookSubmissionWorkerEnv;
  readonly uid: string;
}) => {
  const receipts = Array.isArray(input.payload.sourceReceipts)
    ? input.payload.sourceReceipts.map((value) => record(value)).filter((value): value is RecordValue => value !== null)
    : [];
  if (receipts.length === 0 || receipts.some((receipt) => receipt.purpose !== 'book-source')) {
    throw new BookSubmissionWorkerError('book_submission_source_receipt_invalid', 409);
  }
  const prepared = validateAuthoring(input.payload.authoring, receipts, input.operation.finalBookId);
  if (prepared.strategy !== 'component_pdfs') throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409);
  const descriptorRevision = input.payload.descriptorRevision;
  if (!Number.isSafeInteger(descriptorRevision) || (descriptorRevision as number) < 1) {
    throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409);
  }
  const dependencies = options.dependenciesFactory
    ? await options.dependenciesFactory({ operation: input.operation, env: input.env, uid: input.uid, request: input.request })
    : await createProductionComponentPreparationDependencies({ operation: input.operation, env: input.env, uid: input.uid });
  return prepareTrustedComponentPdf({
    operationId: input.operation.operationId, ownerId: input.uid, bookId: input.operation.finalBookId,
    fingerprint: input.operation.fingerprint,
    descriptorRevision: descriptorRevision as number,
    sourceSet: prepared.manifest instanceof Object
      ? (prepared.manifest as BookAssemblyManifestCandidate).sourceSet as import('../../../../src/types/bookAssembly.types.ts').ComponentPdfsSourceSetCandidate
      : (() => { throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409); })(),
    dependencies,
  });
};

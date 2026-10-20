import type {
  BookSourceVersionStorageIdentity,
  BookSourceChecksum,
} from '../../../../src/types/bookSource.types.ts';
import type {
  ComponentPdfsSourceSetCandidate,
} from '../../../../src/types/bookAssembly.types.ts';
import type { SourceProviderPort } from '../../../../src/services/book-source-delivery/sourceProvider.port.ts';
import type { SourceUploadInspectionClaim } from '../../../../src/services/book-source-delivery/sourceUpload.protocol.ts';
import {
  composeComponentPdfBytes,
  type ComposedComponentPdfBytes,
} from '../../../../src/services/book-source-delivery/componentPdfComposition.worker.ts';
import {
  createComponentStudentDocument,
  type ComponentStudentDocument,
} from '../../../../src/services/book-assembly/componentStudentDocument.types.ts';

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const DEFAULT_RANGE_BYTES = 1024 * 1024;
const DEFAULT_MAX_RANGE_REQUESTS = 128;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const SHA256 = /^[a-f0-9]{64}$/iu;

export class ComponentPdfPreparationError extends Error {
  constructor(public readonly code:
    | 'invalid_input'
    | 'source_unavailable'
    | 'source_identity_mismatch'
    | 'source_checksum_mismatch'
    | 'source_page_count_mismatch'
    | 'composition_failed'
    | 'student_document_upload_failed'
    | 'artifact_persist_failed') {
    super(`component_pdf_preparation_${code}`);
    this.name = 'ComponentPdfPreparationError';
  }
}

export interface TrustedComponentSource {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly identity: BookSourceVersionStorageIdentity;
  readonly checksum: BookSourceChecksum;
  readonly byteSize: number;
  readonly physicalPageCount: number;
}

export interface StudentDocumentReceipt {
  readonly sourceVersionId: string;
  readonly sha256Hex: string;
  readonly byteSize: number;
  readonly physicalPageCount: number;
  readonly verifiedUsable: true;
  readonly studentSafeStatus: 'ready';
}

/** Safe receipt persisted with the inactive artifact; provider credentials/coordinates stay in memory. */
export type PreparedComponentSourceReceipt = Pick<TrustedComponentSource,
  'sourceKey' | 'sourceVersionId' | 'checksum' | 'byteSize' | 'physicalPageCount'>;

export interface PreparedComponentPdfArtifact {
  readonly schemaVersion: 1;
  readonly kind: 'component-pdf-prepared-artifact';
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly fingerprint: string;
  /** Prepared records are deliberately invisible until final publication adopts them. */
  readonly active: false;
  readonly sourceSet: ComponentPdfsSourceSetCandidate;
  readonly sourceReceipts: readonly PreparedComponentSourceReceipt[];
  readonly composition: Pick<ComposedComponentPdfBytes, 'sha256Hex' | 'mapping' | 'inputManifest'>;
  readonly studentDocument: StudentDocumentReceipt;
  readonly descriptor: ComponentStudentDocument;
}

export interface ComponentPdfPreparationDependencies {
  readonly sourceProvider: Pick<SourceProviderPort, 'readBounded'>;
  readonly readSource: (input: {
    readonly sourceKey: string;
    readonly sourceVersionId: string;
  }) => Promise<TrustedComponentSource>;
  readonly uploadStudentDocument: (input: {
    readonly operationId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly bytes: Uint8Array;
    readonly sha256Hex: string;
    readonly physicalPageCount: number;
  }) => Promise<StudentDocumentReceipt>;
  readonly persistPreparedArtifact: (artifact: PreparedComponentPdfArtifact) => Promise<void>;
  readonly compose?: (files: readonly File[]) => Promise<ComposedComponentPdfBytes>;
}

/** Structural subset of the existing Source Upload control used for the derived PDF. */
export interface StudentDocumentUploadControl {
  readonly begin: (input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly idempotencyKey: string;
    readonly submissionOperationId: string;
    readonly sourceKey: string;
    readonly kind: 'initial';
    readonly purpose: 'student-document';
    readonly claim: SourceUploadInspectionClaim;
  }) => Promise<{
    readonly status: 'reserved' | 'replayed';
    readonly uploadUrl: string;
    readonly expiresAt: string;
    readonly requiredHeaders: Readonly<Record<string, string>>;
    readonly reservationId: string;
    readonly sourceVersionId: string;
  }>;
  readonly complete: (input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
    readonly operationId: string;
  }, context?: { readonly signal?: AbortSignal }) => Promise<{
    readonly status: 'verified_completed';
    readonly reservationId: string;
    readonly sourceVersionId: string;
    readonly checksum: BookSourceChecksum;
  }>;
  readonly decideStudentSafeSource: (input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly reservationId: string;
    readonly operationId: string;
    readonly studentSafeStatus: 'ready';
    readonly reasonCode: 'teacher-reviewed';
  }) => Promise<unknown>;
}

/** Adapter to the existing reservation/verification control for composed bytes. */
export const createStudentDocumentUploadSink = (input: {
  readonly control: StudentDocumentUploadControl;
  readonly fetchImpl?: typeof fetch;
}): ComponentPdfPreparationDependencies['uploadStudentDocument'] => {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  return async (document) => {
    const claim: SourceUploadInspectionClaim = {
      schemaVersion: 1,
      trust: 'browser-supplied-untrusted',
      state: 'complete',
      displayFilename: 'student-document.pdf',
      exactByteSize: document.bytes.byteLength,
      sha256Hex: document.sha256Hex,
      physicalPageCount: document.physicalPageCount,
      pdfType: 'application/pdf',
      readability: 'readable',
    };
    const reservation = await input.control.begin({
      actorId: document.ownerId, bookId: document.bookId, idempotencyKey: document.operationId,
      submissionOperationId: document.operationId,
      sourceKey: 'student-document', kind: 'initial', purpose: 'student-document', claim,
    });
    if (reservation.status === 'reserved') {
      const response = await fetchImpl(reservation.uploadUrl, {
        method: 'PUT', headers: reservation.requiredHeaders,
        body: document.bytes as unknown as BodyInit,
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 240);
        console.error(JSON.stringify({ event: 'book_submission_student_document_upload_failed', status: response.status, body }));
        throw new ComponentPdfPreparationError('student_document_upload_failed');
      }
    }
    const completed = await input.control.complete({
      actorId: document.ownerId, bookId: document.bookId,
      reservationId: reservation.reservationId, operationId: document.operationId,
    });
    console.error(JSON.stringify({ event: 'book_submission_student_document_completed', sourceVersionId: completed.sourceVersionId, checksum: completed.checksum?.value, reservationId: completed.reservationId }));
    const decided = await input.control.decideStudentSafeSource({
      actorId: document.ownerId, bookId: document.bookId,
      reservationId: completed.reservationId, operationId: document.operationId,
      studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    });
    const safety = decided as { readonly studentSafeStatus?: unknown };
    if (safety.studentSafeStatus !== 'ready') {
      console.error(JSON.stringify({ event: 'book_submission_student_document_decision_failed', studentSafeStatus: safety.studentSafeStatus }));
      throw new ComponentPdfPreparationError('student_document_upload_failed');
    }
    return {
      sourceVersionId: completed.sourceVersionId,
      sha256Hex: completed.checksum.value.toLowerCase(),
      byteSize: document.bytes.byteLength,
      physicalPageCount: document.physicalPageCount,
      verifiedUsable: true,
      studentSafeStatus: 'ready',
    };
  };
};

const assertSourceSet = (sourceSet: ComponentPdfsSourceSetCandidate): void => {
  if (!sourceSet || sourceSet.sourceStrategy !== 'component_pdfs'
    || !Array.isArray(sourceSet.sources) || sourceSet.sources.length < 2) {
    throw new ComponentPdfPreparationError('invalid_input');
  }
  const keys = new Set<string>();
  const versions = new Set<string>();
  sourceSet.sources.forEach((source, index) => {
    if (!source || !ID.test(source.sourceKey) || !ID.test(source.sourceVersionId)
      || !ID.test(source.ownerNodeKey) || source.sourceOrder !== index + 1
      || keys.has(source.sourceKey) || versions.has(source.sourceVersionId)) {
      throw new ComponentPdfPreparationError('invalid_input');
    }
    keys.add(source.sourceKey);
    versions.add(source.sourceVersionId);
  });
};

const equalIdentity = (
  identity: BookSourceVersionStorageIdentity,
  source: TrustedComponentSource,
): boolean => identity.bookId === source.identity.bookId
  && identity.sourceVersionId === source.sourceVersionId
  && identity.sourceVersionId === source.identity.sourceVersionId
  && identity.storageLocationId === source.identity.storageLocationId
  && identity.providerKind === source.identity.providerKind
  && identity.privateBucketId === source.identity.privateBucketId
  && identity.providerObjectKey === source.identity.providerObjectKey
  && identity.providerFileId === source.identity.providerFileId
  && identity.providerFileVersionId === source.identity.providerFileVersionId
  && identity.checksum.algorithm === source.checksum.algorithm
  && identity.checksum.value.toLowerCase() === source.checksum.value.toLowerCase()
  && identity.byteSize === source.byteSize
  && source.byteSize === source.identity.byteSize
  && source.checksum.value.toLowerCase() === source.identity.checksum.value.toLowerCase();

const validSource = (source: TrustedComponentSource, bookId: string): boolean =>
  ID.test(source.sourceKey)
  && ID.test(source.sourceVersionId)
  && source.identity.bookId === bookId
  && source.identity.sourceVersionId === source.sourceVersionId
  && source.checksum.algorithm === 'sha-256'
  && SHA256.test(source.checksum.value)
  && source.identity.checksum.algorithm === 'sha-256'
  && SHA256.test(source.identity.checksum.value)
  && source.identity.checksum.value.toLowerCase() === source.checksum.value.toLowerCase()
  && Number.isSafeInteger(source.byteSize) && source.byteSize > 0 && source.byteSize <= MAX_SOURCE_BYTES
  && source.identity.byteSize === source.byteSize
  && Number.isSafeInteger(source.physicalPageCount) && source.physicalPageCount > 0;

/** Read a complete immutable source using bounded provider ranges. */
export const readSourceBytesFromProvider = async (
  provider: Pick<SourceProviderPort, 'readBounded'>,
  identity: BookSourceVersionStorageIdentity,
  options: { readonly rangeBytes?: number; readonly maxRangeRequests?: number; readonly signal?: AbortSignal } = {},
): Promise<Uint8Array> => {
  const rangeBytes = options.rangeBytes ?? DEFAULT_RANGE_BYTES;
  const maxRequests = options.maxRangeRequests ?? DEFAULT_MAX_RANGE_REQUESTS;
  if (!Number.isSafeInteger(rangeBytes) || rangeBytes < 65_536 || rangeBytes > DEFAULT_RANGE_BYTES
    || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 128
    || !Number.isSafeInteger(identity.byteSize) || identity.byteSize < 1 || identity.byteSize > MAX_SOURCE_BYTES) {
    throw new ComponentPdfPreparationError('invalid_input');
  }
  const output = new Uint8Array(identity.byteSize);
  let offset = 0;
  let requests = 0;
  while (offset < identity.byteSize) {
    if (options.signal?.aborted) throw new ComponentPdfPreparationError('source_unavailable');
    if (++requests > maxRequests) throw new ComponentPdfPreparationError('source_unavailable');
    const length = Math.min(rangeBytes, identity.byteSize - offset);
    let result;
    try {
      result = await provider.readBounded({ identity, range: { offset, length } }, { signal: options.signal });
    } catch {
      throw new ComponentPdfPreparationError('source_unavailable');
    }
    if (result.offset !== offset || result.totalByteSize !== identity.byteSize
      || result.bytes.byteLength !== length
      || (result.contentIdentity !== undefined && !equalIdentity(result.contentIdentity, {
        sourceKey: 'source', sourceVersionId: identity.sourceVersionId, identity,
        checksum: identity.checksum, byteSize: identity.byteSize, physicalPageCount: 1,
      })) ) {
      throw new ComponentPdfPreparationError('source_identity_mismatch');
    }
    output.set(result.bytes, offset);
    offset += length;
  }
  return output;
};

const sourceFile = (source: TrustedComponentSource, bytes: Uint8Array): File =>
  new File([bytes.slice().buffer as ArrayBuffer], `${source.sourceKey}.pdf`, { type: 'application/pdf' });

/**
 * Rebuild the component student-document from trusted provider bytes. The
 * caller supplies the operation-bound upload and storage adapters so the
 * resulting artifact can never become active as a side effect of preparation.
 */
export const prepareTrustedComponentPdf = async (input: {
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly fingerprint: string;
  readonly descriptorRevision: number;
  readonly sourceSet: ComponentPdfsSourceSetCandidate;
  readonly dependencies: ComponentPdfPreparationDependencies;
  readonly signal?: AbortSignal;
}): Promise<PreparedComponentPdfArtifact> => {
  if (!ID.test(input.operationId) || !ID.test(input.ownerId) || !ID.test(input.bookId)
    || !SHA256.test(input.fingerprint)
    || !Number.isSafeInteger(input.descriptorRevision) || input.descriptorRevision < 1) {
    throw new ComponentPdfPreparationError('invalid_input');
  }
  assertSourceSet(input.sourceSet);
  const sources: TrustedComponentSource[] = [];
  for (const source of input.sourceSet.sources) {
    let trusted: TrustedComponentSource;
    try { trusted = await input.dependencies.readSource({ sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId }); }
    catch { throw new ComponentPdfPreparationError('source_unavailable'); }
    if (!validSource(trusted, input.bookId) || trusted.sourceKey !== source.sourceKey
      || trusted.sourceVersionId !== source.sourceVersionId) {
      throw new ComponentPdfPreparationError('source_identity_mismatch');
    }
    sources.push(trusted);
  }
  const files: File[] = [];
  for (const source of sources) {
    const bytes = await readSourceBytesFromProvider(input.dependencies.sourceProvider, source.identity, { signal: input.signal });
    files.push(sourceFile(source, bytes));
  }
  let composition: ComposedComponentPdfBytes;
  try { composition = await (input.dependencies.compose ?? ((value) => composeComponentPdfBytes(value)))(files); }
  catch { throw new ComponentPdfPreparationError('composition_failed'); }
  if (composition.mapping.length !== sources.length || composition.inputManifest.length !== sources.length
    || composition.mapping.some((entry, index) => entry.pageCount !== sources[index]!.physicalPageCount)
    || composition.inputManifest.some((entry, index) => entry.sha256Hex !== sources[index]!.checksum.value.toLowerCase()
      || entry.byteSize !== sources[index]!.byteSize || entry.pageCount !== sources[index]!.physicalPageCount)) {
    throw new ComponentPdfPreparationError('source_checksum_mismatch');
  }
  const physicalPageCount = composition.mapping.at(-1)?.endPage ?? 0;
  if (!Number.isSafeInteger(physicalPageCount) || physicalPageCount < 1 || composition.bytes.byteLength > MAX_OUTPUT_BYTES) {
    throw new ComponentPdfPreparationError('composition_failed');
  }
  let studentDocument: StudentDocumentReceipt;
  try {
    studentDocument = await input.dependencies.uploadStudentDocument({
      operationId: input.operationId, ownerId: input.ownerId, bookId: input.bookId,
      bytes: composition.bytes, sha256Hex: composition.sha256Hex, physicalPageCount,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'book_submission_student_document_receipt_failed', message: error instanceof Error ? error.message : String(error) }));
    throw new ComponentPdfPreparationError('student_document_upload_failed');
  }
  if (!studentDocument.verifiedUsable || studentDocument.studentSafeStatus !== 'ready'
    || studentDocument.sha256Hex.toLowerCase() !== composition.sha256Hex
    || studentDocument.byteSize !== composition.bytes.byteLength
    || studentDocument.physicalPageCount !== physicalPageCount) {
    throw new ComponentPdfPreparationError('student_document_upload_failed');
  }
  const descriptor = createComponentStudentDocument({
    sourceVersionId: studentDocument.sourceVersionId,
    descriptorRevision: input.descriptorRevision,
    sha256Hex: studentDocument.sha256Hex,
    byteSize: studentDocument.byteSize,
    physicalPageCount,
    compositionFingerprint: composition.sha256Hex,
    components: sources.map((source, index) => ({
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      sourceOrder: index + 1,
      ownerNodeKey: input.sourceSet.sources[index]!.ownerNodeKey,
      localPageCount: source.physicalPageCount,
      combinedStartPage: composition.mapping[index]!.startPage,
      combinedEndPage: composition.mapping[index]!.endPage,
    })),
  });
  const artifact: PreparedComponentPdfArtifact = Object.freeze({
    schemaVersion: 1, kind: 'component-pdf-prepared-artifact',
    operationId: input.operationId, ownerId: input.ownerId, bookId: input.bookId,
    fingerprint: input.fingerprint.toLowerCase(), active: false,
    sourceSet: structuredClone(input.sourceSet), sourceReceipts: sources.map(({ sourceKey, sourceVersionId, checksum, byteSize, physicalPageCount }) => ({
      sourceKey, sourceVersionId, checksum: { ...checksum }, byteSize, physicalPageCount,
    })),
    composition: { sha256Hex: composition.sha256Hex, mapping: structuredClone(composition.mapping), inputManifest: structuredClone(composition.inputManifest) },
    studentDocument: structuredClone(studentDocument), descriptor,
  });
  try { await input.dependencies.persistPreparedArtifact(artifact); }
  catch { throw new ComponentPdfPreparationError('artifact_persist_failed'); }
  return artifact;
};

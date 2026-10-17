import type { SourceUploadInspectionClaim } from '../book-source-delivery/sourceUpload.protocol';
import type { BeginSourceUploadInput, BookSourceUploadControl, SourceUploadBeginResult, SourceUploadCompletionContext, SourceUploadVerifiedOperation } from '../book-source-delivery/sourceUpload.service';
import type { BookAssemblyPublicationRepository } from './publicationRepository';
import type { BookAssemblyPublicationPointer, BookSourceVersionAuthority, ComponentPdfsSourceSetCandidate } from '../../types/bookAssembly.types';
import { validateSourceSetCandidate } from './sourceSet.service';
import { fingerprintBookAssemblyOperation } from './publicationTransaction.service';
import { createComponentStudentDocument, type ComponentStudentDocument } from './componentStudentDocument.types';

type Upload = (input: { readonly authorization: SourceUploadBeginResult; readonly claim: SourceUploadInspectionClaim; readonly signal?: AbortSignal }) => Promise<void>;

export interface ComponentPdfStagingComponent {
  readonly sourceKey: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey: string;
  readonly claim: SourceUploadInspectionClaim;
  readonly upload?: Upload;
}

export interface ComponentPdfStagingUpload {
  readonly bookId: string;
  readonly actorId: string;
  readonly operationId: string;
  readonly claim: SourceUploadInspectionClaim;
  readonly sourceSetRevision: number;
  readonly compositionFingerprint: string;
  readonly currentPointer: BookAssemblyPublicationPointer;
  readonly components: readonly ComponentPdfStagingComponent[];
  readonly upload?: Upload;
  readonly completionContext?: SourceUploadCompletionContext;
  readonly now?: string;
}

export interface ComponentPdfStagingResult {
  readonly status: 'committed' | 'replayed';
  readonly descriptor: ComponentStudentDocument;
  readonly verifiedSourceSet: ComponentPdfsSourceSetCandidate;
}

export interface ComponentPdfTrustedCompletion {
  readonly reservationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly purpose: 'book-source' | 'student-document';
  readonly status: 'verified_completed';
  readonly checksum: { readonly algorithm: 'sha-256'; readonly value: string };
  readonly byteSize: number;
  readonly physicalPageCount: number;
  readonly studentSafeStatus: 'unreviewed' | 'ready' | 'rejected';
}

export const prepareComponentPdfDescriptor = async (input: {
  readonly ownerId: string;
  readonly bookId: string;
  readonly descriptorRevision: number;
  readonly sourceSet: ComponentPdfsSourceSetCandidate;
  readonly components: readonly ComponentPdfTrustedCompletion[];
  readonly studentDocument: ComponentPdfTrustedCompletion;
  readonly publicationRepository: BookAssemblyPublicationRepository<unknown>;
}): Promise<{ readonly status: 'committed' | 'replayed'; readonly descriptor: ComponentStudentDocument }> => {
  const ordered = [...input.sourceSet.sources].sort((left, right) => left.sourceOrder - right.sourceOrder);
  if (ordered.length < 2 || input.components.length !== ordered.length
    || input.studentDocument.ownerId !== input.ownerId || input.studentDocument.bookId !== input.bookId
    || input.studentDocument.sourceKey !== 'student-document' || input.studentDocument.purpose !== 'student-document'
    || input.studentDocument.status !== 'verified_completed' || input.studentDocument.studentSafeStatus !== 'ready') {
    throw new ComponentPdfStagingError('completion_invalid');
  }
  let nextPage = 1;
  const components = ordered.map((source, index) => {
    const trusted = input.components[index];
    if (!trusted || trusted.ownerId !== input.ownerId || trusted.bookId !== input.bookId
      || trusted.status !== 'verified_completed' || trusted.purpose !== 'book-source'
      || trusted.sourceKey !== source.sourceKey || trusted.sourceVersionId !== source.sourceVersionId
      || trusted.physicalPageCount < 1) throw new ComponentPdfStagingError('completion_invalid');
    const combinedStartPage = nextPage;
    nextPage += trusted.physicalPageCount;
    return { ...source, localPageCount: trusted.physicalPageCount, combinedStartPage, combinedEndPage: nextPage - 1 };
  });
  if (nextPage - 1 !== input.studentDocument.physicalPageCount) throw new ComponentPdfStagingError('completion_invalid');
  const compositionFingerprint = fingerprintBookAssemblyOperation({
    sourceSet: input.sourceSet,
    componentReservations: input.components.map((operation) => operation.reservationId),
    studentDocumentReservation: input.studentDocument.reservationId,
  }).replace(':', '-');
  const descriptor = createComponentStudentDocument({
    sourceVersionId: input.studentDocument.sourceVersionId,
    descriptorRevision: input.descriptorRevision,
    sha256Hex: input.studentDocument.checksum.value,
    byteSize: input.studentDocument.byteSize,
    physicalPageCount: input.studentDocument.physicalPageCount,
    compositionFingerprint,
    components,
  });
  const descriptorFingerprint = fingerprintBookAssemblyOperation(descriptor);
  return input.publicationRepository.transaction<Pick<ComponentPdfStagingResult, 'status' | 'descriptor'>>(input.bookId, (current) => {
    const prepared = current.studentDocuments?.[descriptor.sourceVersionId];
    if (prepared) {
      if (fingerprintBookAssemblyOperation(prepared) !== descriptorFingerprint) throw new ComponentPdfStagingError('conflict');
      return { outcome: { status: 'replayed' as const, descriptor: prepared }, write: false };
    }
    return { outcome: { status: 'committed' as const, descriptor }, next: {
      ...current,
      studentDocuments: { ...(current.studentDocuments ?? {}), [descriptor.sourceVersionId]: descriptor },
    }, write: true };
  });
};

export class ComponentPdfStagingError extends Error {
  constructor(public readonly code: 'conflict' | 'stale_revision' | 'upload_required' | 'completion_invalid') {
    super(`component_pdf_staging_${code}`);
    this.name = 'ComponentPdfStagingError';
  }
}

const rowOperationId = (operationId: string, index: number): string => {
  const left = fingerprintBookAssemblyOperation({ domain: 'component-row-left', operationId, index }).split(':')[1]!;
  const right = fingerprintBookAssemblyOperation({ domain: 'component-row-right', operationId, index }).split(':')[1]!;
  const hash = left + right;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const completeUpload = async (
  sourceUpload: Pick<BookSourceUploadControl, 'begin' | 'complete'>,
  input: ComponentPdfStagingUpload,
  beginInput: BeginSourceUploadInput,
  upload: Upload | undefined,
): Promise<SourceUploadVerifiedOperation> => {
  const begin = await sourceUpload.begin(beginInput);
  if (begin.status === 'reserved') {
    if (!upload) throw new ComponentPdfStagingError('upload_required');
    await upload({ authorization: begin, claim: beginInput.claim, signal: input.completionContext?.signal });
  }
  return sourceUpload.complete({ actorId: input.actorId, bookId: input.bookId, reservationId: begin.reservationId, operationId: beginInput.idempotencyKey }, input.completionContext);
};

/** Serially stages canonical component sources, then their combined student document. */
export const createComponentPdfStagingService = (dependencies: {
  readonly sourceUpload: Pick<BookSourceUploadControl, 'begin' | 'complete' | 'decideStudentSafeSource'>;
  readonly publicationRepository: BookAssemblyPublicationRepository<unknown>;
}) => ({
  async stage(input: ComponentPdfStagingUpload): Promise<ComponentPdfStagingResult> {
    if (input.components.length < 2) throw new ComponentPdfStagingError('completion_invalid');
    const completedComponents: SourceUploadVerifiedOperation[] = [];
    for (let index = 0; index < input.components.length; index += 1) {
      const row = input.components[index]!;
      const completed = await completeUpload(dependencies.sourceUpload, input, {
        actorId: input.actorId, bookId: input.bookId, idempotencyKey: rowOperationId(input.operationId, index),
        sourceKey: row.sourceKey, kind: 'initial', purpose: 'book-source', claim: row.claim,
      }, row.upload);
      if (completed.sourceKey !== row.sourceKey) throw new ComponentPdfStagingError('completion_invalid');
      completedComponents.push(completed);
    }

    const verifiedSourceSet: ComponentPdfsSourceSetCandidate = {
      sourceStrategy: 'component_pdfs',
      sources: input.components.map((row, index) => ({
        sourceKey: completedComponents[index]!.sourceKey,
        sourceVersionId: completedComponents[index]!.sourceVersionId,
        sourceOrder: row.sourceOrder,
        ownerNodeKey: row.ownerNodeKey,
      })) as unknown as ComponentPdfsSourceSetCandidate['sources'],
    };
    const authority: BookSourceVersionAuthority = { getSourceVersion: (sourceVersionId) => {
      const completed = completedComponents.find((candidate) => candidate.sourceVersionId === sourceVersionId);
      return completed ? {
        sourceKey: completed.sourceKey, sourceVersionId: completed.sourceVersionId, bookId: completed.bookId,
        checksum: completed.checksum, purpose: completed.purpose, studentSafeStatus: completed.studentSafeStatus,
        ...(completed.studentSafeDecision ? { studentSafeDecision: completed.studentSafeDecision } : {}),
        physicalPageCount: completed.physicalPageCount, verifiedUsable: true,
      } : undefined;
    } };
    if (!validateSourceSetCandidate(verifiedSourceSet, { bookId: input.bookId, sourceVersionAuthority: authority }).valid) {
      throw new ComponentPdfStagingError('completion_invalid');
    }

    const combined = await completeUpload(dependencies.sourceUpload, input, {
      actorId: input.actorId, bookId: input.bookId, idempotencyKey: input.operationId,
      sourceKey: 'student-document', kind: 'initial', purpose: 'student-document', claim: input.claim,
    }, input.upload);
    const completion = await dependencies.sourceUpload.decideStudentSafeSource({
      actorId: input.actorId, bookId: input.bookId, reservationId: combined.reservationId,
      operationId: input.operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    });
    if (completion.purpose !== 'student-document' || completion.studentSafeStatus !== 'ready' || !completion.studentSafeDecision) {
      throw new ComponentPdfStagingError('completion_invalid');
    }

    let nextPage = 1;
    const components = verifiedSourceSet.sources.map((source, index) => {
      const trusted = completedComponents[index]!;
      const combinedStartPage = nextPage;
      nextPage += trusted.physicalPageCount;
      return { sourceKey: trusted.sourceKey, sourceVersionId: trusted.sourceVersionId, sourceOrder: source.sourceOrder,
        ownerNodeKey: source.ownerNodeKey, localPageCount: trusted.physicalPageCount,
        combinedStartPage, combinedEndPage: nextPage - 1 };
    });
    const descriptor = createComponentStudentDocument({ sourceVersionId: completion.sourceVersionId,
      descriptorRevision: input.sourceSetRevision, sha256Hex: completion.checksum.value,
      byteSize: input.claim.exactByteSize, physicalPageCount: completion.physicalPageCount,
      compositionFingerprint: input.compositionFingerprint, components });
    const fingerprint = fingerprintBookAssemblyOperation(descriptor);
    return dependencies.publicationRepository.transaction<ComponentPdfStagingResult>(input.bookId, (current) => {
      const prepared = current.studentDocuments?.[descriptor.sourceVersionId];
      if (prepared) {
        if (fingerprintBookAssemblyOperation(prepared) !== fingerprint) throw new ComponentPdfStagingError('conflict');
        return { outcome: { status: 'replayed', descriptor: prepared, verifiedSourceSet }, write: false };
      }
      return { outcome: { status: 'committed', descriptor, verifiedSourceSet }, next: { ...current,
        studentDocuments: { ...(current.studentDocuments ?? {}), [descriptor.sourceVersionId]: descriptor },
      }, write: true };
    });
  },
});

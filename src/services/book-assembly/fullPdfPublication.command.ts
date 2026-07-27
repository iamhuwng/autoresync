import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import {
  type BookAssemblyPublicationResult,
  type PublishBookAssemblyInput,
} from './publicationTransaction.service';
import type {
  BookAssemblyPreviewApprovalReference,
} from '../../types/bookAssembly.types';
import {
  createFullPdfPublicationCommandPlan,
  FullPdfPublicationAdapterError,
  type FullPdfActivityLineage,
} from './fullPdfPublication.adapter';

export interface FullPdfPublicationRequest {
  readonly ownerId: string;
  readonly bookId: string;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly expectedCandidateRevision: number;
  readonly expectedCurrentPublicationId: string | null;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly previewApproval: BookAssemblyPreviewApprovalReference;
}

export interface FullPdfPublicationCommandReceipt {
  readonly operationId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly result: BookAssemblyPublicationResult;
}

export interface FullPdfPublicationPorts {
  readonly readCandidate: (
    bookId: string,
    unitKey: string,
    candidateId: string,
  ) => Promise<BookAssemblyCandidateRecord | null>;
  readonly readAuthority: (bookId: string) => Promise<BookAssemblyBookAuthority | null>;
  readonly readLineage?: (
    bookId: string,
    unitKey: string,
  ) => Promise<Readonly<Record<string, FullPdfActivityLineage>>>;
  readonly publish: (input: PublishBookAssemblyInput) => Promise<BookAssemblyPublicationResult>;
  readonly allocateOperationId: () => string;
  readonly allocateId: (kind: string, key: string) => string;
  readonly now: () => string;
}

export class FullPdfPublicationCommandError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'FullPdfPublicationCommandError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;

const assertId = (value: string, code: string): void => {
  if (!ID.test(value)) throw new FullPdfPublicationCommandError(code);
};

const assertRevision = (value: number, code: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FullPdfPublicationCommandError(code);
  }
};

export const createFullPdfPublicationCommand = (
  ports: FullPdfPublicationPorts,
) => async (
  request: FullPdfPublicationRequest,
): Promise<FullPdfPublicationCommandReceipt> => {
  assertId(request.ownerId, 'invalid_owner_id');
  assertId(request.bookId, 'invalid_book_id');
  assertId(request.unitKey, 'invalid_unit_key');
  assertId(request.candidateId, 'invalid_candidate_id');
  if (request.expectedCurrentPublicationId !== null) {
    assertId(request.expectedCurrentPublicationId, 'invalid_expected_current_publication_id');
  }
  assertRevision(request.expectedCandidateRevision, 'invalid_expected_candidate_revision');
  assertRevision(request.expectedBookRevision, 'invalid_expected_book_revision');
  assertRevision(request.expectedSourceSetRevision, 'invalid_expected_source_set_revision');

  const [authority, candidate, lineage] = await Promise.all([
    ports.readAuthority(request.bookId),
    ports.readCandidate(request.bookId, request.unitKey, request.candidateId),
    ports.readLineage?.(request.bookId, request.unitKey) ?? Promise.resolve({}),
  ]);
  if (!authority || !candidate) {
    throw new FullPdfPublicationCommandError('full_pdf_publication_not_found', 404);
  }
  if (authority.ownerId !== request.ownerId || candidate.ownerId !== request.ownerId) {
    throw new FullPdfPublicationCommandError('full_pdf_publication_forbidden', 403);
  }
  const operationId = ports.allocateOperationId();
  if (!UUID.test(operationId)) {
    throw new FullPdfPublicationCommandError('trusted_operation_id_failed', 503);
  }
  try {
    const now = ports.now();
    const plan = createFullPdfPublicationCommandPlan({
      operationId,
      now,
      ownerId: request.ownerId,
      unitKey: request.unitKey,
      candidate,
      authority,
      expectedCandidateRevision: request.expectedCandidateRevision,
      expectedBookRevision: request.expectedBookRevision,
      expectedSourceSetRevision: request.expectedSourceSetRevision,
      previewApproval: request.previewApproval,
      existingLineageByActivityKey: lineage,
      allocateId: ports.allocateId,
    });
    const manifestVersionId = plan.atomicWrites.deliveryPlans[0]?.manifestVersionId;
    if (!manifestVersionId) {
      throw new FullPdfPublicationCommandError('trusted_publication_ids_failed', 503);
    }
    const result = await ports.publish({
      operationId,
      expectedCurrentPublicationId: request.expectedCurrentPublicationId,
      manifestVersionId,
      publicationId: plan.studentSafeProjection.publicationId,
      publicationRevision: plan.studentSafeProjection.publicationRevision,
      plan,
      now,
    });
    return {
      operationId,
      manifestVersionId,
      publicationId: plan.studentSafeProjection.publicationId,
      publicationRevision: plan.studentSafeProjection.publicationRevision,
      result,
    };
  } catch (error) {
    if (error instanceof FullPdfPublicationCommandError) throw error;
    if (error instanceof FullPdfPublicationAdapterError) {
      throw new FullPdfPublicationCommandError(error.code, 422);
    }
    throw error;
  }
};

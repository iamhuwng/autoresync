import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import {
  type BookAssemblyPublicationResult,
} from './publicationTransaction.service';
import type { CanonicalPublishBookAssemblyInput } from './canonicalPublication.service';
import type {
  BookAssemblyPreviewApprovalReference,
} from '../../types/bookAssembly.types';
import {
  canonicalActivityPayloadFingerprint,
  createCandidateUnitPreview,
  previewInputFingerprint,
  type BookAssemblyPreviewApprovalRecord,
} from './unitPreview.service';
import {
  createFullPdfPublicationCommandOutput,
  FullPdfPublicationAdapterError,
  type FullPdfActivityLineage,
  type FullPdfValidatedActivityPayload,
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
  readonly readActivities: (
    input: {
      readonly ownerId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly activityKeys: readonly string[];
    },
  ) => Promise<Readonly<Record<string, FullPdfValidatedActivityPayload>>>;
  readonly readPreviewApproval: (
    approvalId: string,
  ) => Promise<(BookAssemblyPreviewApprovalRecord & { readonly revoked?: boolean }) | null>;
  readonly sourceIsPreviewReady: (
    input: { readonly bookId: string; readonly sourceVersionId: string },
  ) => Promise<boolean>;
  readonly publish: (input: CanonicalPublishBookAssemblyInput) => Promise<BookAssemblyPublicationResult>;
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

const resolveCurrentPreviewApproval = async (input: {
  readonly ports: FullPdfPublicationPorts;
  readonly request: FullPdfPublicationRequest;
  readonly candidate: BookAssemblyCandidateRecord;
  readonly authority: BookAssemblyBookAuthority;
  readonly activitiesByKey: Readonly<Record<string, FullPdfValidatedActivityPayload>>;
  readonly now: string;
}): Promise<BookAssemblyPreviewApprovalReference> => {
  const current = await input.ports.readPreviewApproval(input.request.previewApproval.approvalId);
  if (!current
    || current.approvalId !== input.request.previewApproval.approvalId
    || current.revoked === true
    || current.actorId !== input.request.ownerId
    || current.bookId !== input.request.bookId
    || current.candidateId !== input.request.candidateId
    || current.candidateRevision !== input.request.expectedCandidateRevision
    || current.sourceSetRevision !== input.request.expectedSourceSetRevision
    || current.approvalRevision !== input.request.previewApproval.approvalRevision
    || current.approvedAt !== input.request.previewApproval.approvedAt
    || current.expiresAt !== input.request.previewApproval.expiresAt) {
    throw new FullPdfPublicationCommandError('full_pdf_preview_approval_invalid', 422);
  }
  const sourceVersions = input.candidate.manifest?.sourceSet.sources
    .map((source) => input.authority.sourceVersionAuthority.getSourceVersion(source.sourceVersionId))
    .filter((source): source is NonNullable<typeof source> => source !== undefined) ?? [];
  const readySourceVersionIds = new Set(
    (await Promise.all(sourceVersions.map(async (source) => (
      await input.ports.sourceIsPreviewReady({
        bookId: input.request.bookId,
        sourceVersionId: source.sourceVersionId,
      }) ? source.sourceVersionId : null
    )))).filter((sourceVersionId): sourceVersionId is string => sourceVersionId !== null),
  );
  try {
    const preview = createCandidateUnitPreview({
      candidate: input.candidate,
      sourceVersions,
      sourceIsPreviewReady: (source) => readySourceVersionIds.has(source.sourceVersionId),
      activitiesByKey: Object.fromEntries(
        Object.entries(input.activitiesByKey).map(([key, payload]) => [key, payload.activity]),
      ),
      registryVersion: current.registryVersion,
    });
    const nowMs = Date.parse(input.now);
    const canonicalFingerprints = current.canonicalActivityFingerprintsByKey;
    const activityKeys = Object.keys(input.activitiesByKey);
    if (previewInputFingerprint(preview) !== current.inputFingerprint
      || !canonicalFingerprints
      || Object.keys(canonicalFingerprints).length !== activityKeys.length
      || activityKeys.some((activityKey) =>
        canonicalFingerprints[activityKey]
          !== canonicalActivityPayloadFingerprint(input.activitiesByKey[activityKey]!.activity))
      || !Number.isFinite(nowMs)
      || Date.parse(current.approvedAt) > nowMs
      || Date.parse(current.expiresAt) <= nowMs) {
      throw new Error('approval_mismatch');
    }
  } catch {
    throw new FullPdfPublicationCommandError('full_pdf_preview_approval_invalid', 422);
  }
  return {
    approvalId: current.approvalId,
    approvalRevision: current.approvalRevision,
    approvedAt: current.approvedAt,
    expiresAt: current.expiresAt,
    approvedInputFingerprint: current.inputFingerprint,
  };
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
  if (candidate.revision !== request.expectedCandidateRevision
    || candidate.bookRevision !== request.expectedBookRevision
    || authority.bookRevision !== request.expectedBookRevision
    || candidate.sourceSetRevision !== request.expectedSourceSetRevision
    || authority.sourceSetRevision !== request.expectedSourceSetRevision) {
    throw new FullPdfPublicationCommandError('full_pdf_revision_conflict', 422);
  }
  const activityKeys = candidate.manifest?.units
    .find((unit) => unit.unitKey === request.unitKey)?.activitySlots
    .map((slot) => slot.activityKey) ?? [];
  const activitiesByKey = await ports.readActivities({
    ownerId: request.ownerId,
    bookId: request.bookId,
    unitKey: request.unitKey,
    activityKeys,
  });
  if (activityKeys.some((activityKey) => activitiesByKey[activityKey] === undefined)) {
    throw new FullPdfPublicationCommandError('full_pdf_activity_payload_missing', 422);
  }
  const now = ports.now();
  const previewApproval = await resolveCurrentPreviewApproval({
    ports,
    request,
    candidate,
    authority,
    activitiesByKey,
    now,
  });
  const operationId = ports.allocateOperationId();
  if (!UUID.test(operationId)) {
    throw new FullPdfPublicationCommandError('trusted_operation_id_failed', 503);
  }
  try {
    const output = createFullPdfPublicationCommandOutput({
      operationId,
      now,
      ownerId: request.ownerId,
      unitKey: request.unitKey,
      candidate,
      authority,
      expectedCandidateRevision: request.expectedCandidateRevision,
      expectedBookRevision: request.expectedBookRevision,
      expectedSourceSetRevision: request.expectedSourceSetRevision,
      previewApproval,
      activitiesByKey,
      existingLineageByActivityKey: lineage,
      allocateId: ports.allocateId,
    });
    const { plan, canonicalActivityVersions } = output;
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
      canonicalActivityVersions,
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

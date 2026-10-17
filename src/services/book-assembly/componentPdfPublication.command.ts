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
  wholeActivationApprovalFingerprint,
  type BookAssemblyPreviewApprovalRecord,
  type WholeActivationApprovalInput,
} from './unitPreview.service';
import {
  createComponentPdfMultiUnitPublicationOutput,
  ComponentPdfPublicationAdapterError,
  type ComponentPdfActivityLineage,
  type ComponentPdfValidatedActivityPayload,
} from './componentPdfPublication.adapter';

export interface ComponentPdfPublicationRequest {
  readonly ownerId: string;
  readonly bookId: string;
  readonly expectedCurrentPublicationId: string | null;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly unitApprovals: readonly (BookAssemblyPreviewApprovalReference & {
    readonly unitKey: string;
    readonly candidateId: string;
    readonly candidateRevision: number;
  })[];
  /** Trusted transport fingerprint used by the durable operation ledger. */
  readonly operationFingerprint?: string;
}

export interface ComponentPdfPublicationCommandReceipt {
  readonly operationId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly result: BookAssemblyPublicationResult;
}

export interface ComponentPdfPublicationPorts {
  readonly readCandidate: (
    bookId: string,
    unitKey: string,
    candidateId: string,
  ) => Promise<BookAssemblyCandidateRecord | null>;
  readonly readAuthority: (bookId: string) => Promise<BookAssemblyBookAuthority | null>;
  readonly readWholeActivationApprovalInput: (bookId: string) => Promise<WholeActivationApprovalInput | null>;
  readonly readLineage?: (
    bookId: string,
    unitKey: string,
  ) => Promise<Readonly<Record<string, ComponentPdfActivityLineage>>>;
  readonly readActivities: (
    input: {
      readonly ownerId: string;
      readonly bookId: string;
      readonly unitKey: string;
      readonly activityKeys: readonly string[];
    },
  ) => Promise<Readonly<Record<string, ComponentPdfValidatedActivityPayload>>>;
  readonly readPreviewApproval: (
    input: {
      readonly bookId: string;
      readonly unitKey: string;
      readonly approvalId: string;
    },
  ) => Promise<(BookAssemblyPreviewApprovalRecord & { readonly revoked?: boolean }) | null>;
  readonly sourceIsPreviewReady: (
    input: { readonly bookId: string; readonly sourceVersionId: string },
  ) => Promise<boolean>;
  readonly publish: (input: CanonicalPublishBookAssemblyInput) => Promise<BookAssemblyPublicationResult>;
  readonly allocateOperationId: () => string;
  readonly allocateId: (kind: string, key: string) => string;
  readonly now: () => string;
}

export class ComponentPdfPublicationCommandError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'ComponentPdfPublicationCommandError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;

const assertId = (value: string, code: string): void => {
  if (!ID.test(value)) throw new ComponentPdfPublicationCommandError(code);
};

const assertRevision = (value: number, code: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ComponentPdfPublicationCommandError(code);
  }
};

const resolveCurrentPreviewApproval = async (input: {
  readonly ports: ComponentPdfPublicationPorts;
  readonly request: ComponentPdfPublicationRequest;
  readonly unitApproval: ComponentPdfPublicationRequest['unitApprovals'][number];
  readonly wholeActivationFingerprint: string;
  readonly activitiesByKey: Readonly<Record<string, ComponentPdfValidatedActivityPayload>>;
  readonly now: string;
}): Promise<BookAssemblyPreviewApprovalReference> => {
  const current = await input.ports.readPreviewApproval({
    bookId: input.request.bookId,
    unitKey: input.unitApproval.unitKey,
    approvalId: input.unitApproval.approvalId,
  });
  if (!current
    || current.approvalId !== input.unitApproval.approvalId
    || current.revoked === true
    || current.actorId !== input.request.ownerId
    || current.bookId !== input.request.bookId
    || current.bookRevision !== input.request.expectedBookRevision
    || current.unitKey !== input.unitApproval.unitKey
    || current.candidateId !== input.unitApproval.candidateId
    || current.candidateRevision !== input.unitApproval.candidateRevision
    || current.sourceSetRevision !== input.request.expectedSourceSetRevision
    || current.approvalRevision !== input.unitApproval.approvalRevision
    || current.approvedAt !== input.unitApproval.approvedAt
    || current.expiresAt !== input.unitApproval.expiresAt
    || current.wholeActivationFingerprint !== input.wholeActivationFingerprint) {
    throw new ComponentPdfPublicationCommandError('component_pdfs_preview_approval_invalid', 422);
  }
  try {
    const nowMs = Date.parse(input.now);
    const canonicalFingerprints = current.canonicalActivityFingerprintsByKey ?? {};
    const activityKeys = Object.keys(input.activitiesByKey);
    if (Object.keys(canonicalFingerprints).length !== activityKeys.length
      || activityKeys.some((activityKey) =>
        canonicalFingerprints[activityKey]
          !== canonicalActivityPayloadFingerprint(input.activitiesByKey[activityKey]!.activity))
      || !Number.isFinite(nowMs)
      || Date.parse(current.approvedAt) > nowMs
      || Date.parse(current.expiresAt) <= nowMs) {
      throw new Error('approval_mismatch');
    }
  } catch {
    throw new ComponentPdfPublicationCommandError('component_pdfs_preview_approval_invalid', 422);
  }
  return {
    approvalId: current.approvalId,
    approvalRevision: current.approvalRevision,
    approvedAt: current.approvedAt,
    expiresAt: current.expiresAt,
    approvedInputFingerprint: current.inputFingerprint,
  };
};

export const createComponentPdfPublicationCommand = (
  ports: ComponentPdfPublicationPorts,
) => async (
  request: ComponentPdfPublicationRequest,
): Promise<ComponentPdfPublicationCommandReceipt> => {
  assertId(request.ownerId, 'invalid_owner_id');
  assertId(request.bookId, 'invalid_book_id');
  if (request.expectedCurrentPublicationId !== null) {
    assertId(request.expectedCurrentPublicationId, 'invalid_expected_current_publication_id');
  }
  assertRevision(request.expectedBookRevision, 'invalid_expected_book_revision');
  assertRevision(request.expectedSourceSetRevision, 'invalid_expected_source_set_revision');

  const [authority, whole] = await Promise.all([
    ports.readAuthority(request.bookId),
    ports.readWholeActivationApprovalInput(request.bookId),
  ]);
  if (!authority || !whole) {
    throw new ComponentPdfPublicationCommandError('component_pdfs_publication_not_found', 404);
  }
  if (authority.ownerId !== request.ownerId || whole.ownerId !== request.ownerId) {
    throw new ComponentPdfPublicationCommandError('component_pdfs_publication_forbidden', 403);
  }
  if (whole.bookRevision !== request.expectedBookRevision
    || authority.bookRevision !== request.expectedBookRevision
    || whole.sourceSetRevision !== request.expectedSourceSetRevision
    || authority.sourceSetRevision !== request.expectedSourceSetRevision) {
    throw new ComponentPdfPublicationCommandError('component_pdfs_revision_conflict', 422);
  }
  const wholeFingerprint = wholeActivationApprovalFingerprint(whole);
  const exactUnitKeys = whole.units.map((unit) => unit.unitKey);
  if (request.unitApprovals.length !== exactUnitKeys.length
    || new Set(request.unitApprovals.map((approval) => approval.unitKey)).size !== request.unitApprovals.length
    || request.unitApprovals.some((approval) => !exactUnitKeys.includes(approval.unitKey))) {
    throw new ComponentPdfPublicationCommandError('component_pdfs_approval_coverage_invalid', 422);
  }
  const now = ports.now();
  const units: Array<{
    readonly candidate: BookAssemblyCandidateRecord;
    readonly lineage: Readonly<Record<string, ComponentPdfActivityLineage>>;
    readonly activitiesByKey: Readonly<Record<string, ComponentPdfValidatedActivityPayload>>;
    readonly previewApproval: BookAssemblyPreviewApprovalReference;
    readonly reference: WholeActivationApprovalInput['units'][number];
  }> = [];
  for (const approval of request.unitApprovals) {
    const reference = whole.units.find((unit) => unit.unitKey === approval.unitKey)!;
    if (reference.candidateId !== approval.candidateId || reference.candidateRevision !== approval.candidateRevision) {
      throw new ComponentPdfPublicationCommandError('component_pdfs_approval_coverage_invalid', 422);
    }
    const [candidate, lineage] = await Promise.all([
      ports.readCandidate(request.bookId, approval.unitKey, approval.candidateId),
      ports.readLineage && (reference.manifest?.units.find((unit) => unit.unitKey === approval.unitKey)
        ?.activitySlots.length ?? 0) > 0
        ? ports.readLineage(request.bookId, approval.unitKey) : Promise.resolve({}),
    ]);
    if (!candidate) throw new ComponentPdfPublicationCommandError('component_pdfs_publication_not_found', 404);
    const activityKeys = candidate.manifest?.units.find((unit) => unit.unitKey === approval.unitKey)
      ?.activitySlots.map((slot) => slot.activityKey) ?? [];
    const activitiesByKey = await ports.readActivities({ ownerId: request.ownerId, bookId: request.bookId,
      unitKey: approval.unitKey, activityKeys });
    if (activityKeys.some((key) => !activitiesByKey[key])) {
      throw new ComponentPdfPublicationCommandError('component_pdfs_activity_payload_missing', 422);
    }
    const previewApproval = await resolveCurrentPreviewApproval({ ports, request, unitApproval: approval,
      wholeActivationFingerprint: wholeFingerprint, activitiesByKey, now });
    units.push({ candidate, lineage, activitiesByKey, previewApproval, reference });
  }
  const operationId = ports.allocateOperationId();
  if (!UUID.test(operationId)) {
    throw new ComponentPdfPublicationCommandError('trusted_operation_id_failed', 503);
  }
  try {
    const sharedIds = new Map<string, string>();
    const output = createComponentPdfMultiUnitPublicationOutput({
      aggregateCandidateId: `activation:${whole.activationReceipt.operationId}`,
      previewApproval: {
        ...units[0]!.previewApproval,
        approvedInputFingerprint: wholeFingerprint,
      },
      units: units.map(({ candidate, lineage, activitiesByKey, previewApproval, reference }) => ({
      operationId,
      now,
      ownerId: request.ownerId,
      unitKey: reference.unitKey,
      candidate,
      authority,
      expectedCandidateRevision: reference.candidateRevision,
      expectedBookRevision: request.expectedBookRevision,
      expectedSourceSetRevision: request.expectedSourceSetRevision,
      previewApproval,
      activitiesByKey,
      existingLineageByActivityKey: lineage,
      allocateId: (kind, key) => {
        if (['publication', 'plan', 'manifest-version'].includes(kind)) {
          const existing = sharedIds.get(kind);
          if (existing) return existing;
          const allocated = ports.allocateId(kind, whole.activationReceipt.operationId);
          sharedIds.set(kind, allocated);
          return allocated;
        }
        return ports.allocateId(kind, `${reference.unitKey}:${key}`);
      },
    })),
    });
    const { plan, canonicalActivityVersions } = output;
    const manifestVersionId = plan.atomicWrites.deliveryPlans[0]?.manifestVersionId;
    if (!manifestVersionId) {
      throw new ComponentPdfPublicationCommandError('trusted_publication_ids_failed', 503);
    }
    const finalWhole = await ports.readWholeActivationApprovalInput(request.bookId);
    if (!finalWhole || wholeActivationApprovalFingerprint(finalWhole) !== wholeFingerprint) {
      throw new ComponentPdfPublicationCommandError('component_pdfs_revision_conflict', 409);
    }
    for (const approval of request.unitApprovals) {
      await resolveCurrentPreviewApproval({ ports, request, unitApproval: approval,
        wholeActivationFingerprint: wholeFingerprint,
        activitiesByKey: units.find((unit) => unit.reference.unitKey === approval.unitKey)!.activitiesByKey, now });
    }
    const result = await ports.publish({
      operationId,
      expectedCurrentPublicationId: request.expectedCurrentPublicationId,
      manifestVersionId,
      publicationId: plan.studentSafeProjection.publicationId,
      publicationRevision: plan.studentSafeProjection.publicationRevision,
      plan,
      canonicalActivityVersions,
      operationFingerprint: request.operationFingerprint,
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
    if (error instanceof ComponentPdfPublicationCommandError) throw error;
    if (error instanceof ComponentPdfPublicationAdapterError) {
      throw new ComponentPdfPublicationCommandError(error.code, 422);
    }
    throw error;
  }
};

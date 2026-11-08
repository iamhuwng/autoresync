import {
  READING_V2_SCHEMA_VERSION,
  type ReadingV2AuthoringContext,
  type ReadingV2AuthoringRecoveryLocator,
  type ReadingV2AuthoringRecoveryRecord,
  type ReadingV2Document,
  type ReadingV2DraftId,
  type ReadingV2MaterialId,
  type ReadingV2SnapshotVersionId,
} from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { normalizeReadingV2FirebaseDocument } from './readingV2FirebaseDocument.service';

export interface ReadingV2RecoveryAuthoringInput {
  readonly draftId?: ReadingV2DraftId;
  readonly revision?: number;
  readonly workflowOrigin?: {
    readonly mode: string;
    readonly sourceMaterialId?: string;
    readonly sourceSnapshotVersionId?: string;
  };
  readonly authoringContext?: ReadingV2AuthoringContext;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly expectedBases?: Readonly<Record<string, unknown>>;
}

export const readingV2AuthoringRecoveryRecordId = (
  materialId: ReadingV2MaterialId,
  snapshotVersionId: ReadingV2SnapshotVersionId,
): string => {
  if ([materialId, snapshotVersionId].some((id) => !id || /[.:#$\[\]/\u0000-\u001f\u007f]/.test(id))) {
    throw new Error('Publication identity must use valid, colon-free Firebase key components.');
  }
  return `authoring-recovery:${materialId}:${snapshotVersionId}`;
};

const sourceRefsFromContext = (
  context: ReadingV2AuthoringContext | undefined,
): readonly { readonly sourceId: string }[] => {
  if (!context) return [];
  const sourceIds = new Set<string>();
  if (context.origin.kind === 'import') sourceIds.add(context.origin.sourceId);
  (context.requirements ?? []).forEach((requirement) => sourceIds.add(requirement.sourceId));
  return [...sourceIds].sort().map((sourceId) => ({ sourceId }));
};

const workflowModes = new Set([
  'create-blank', 'create-from-import', 'create-from-auto', 'resume-draft',
  'revise-published', 'duplicate-material', 'extract-task-group-material', 'direct-publication',
]);

export const buildReadingV2AuthoringRecoveryRecord = (input: {
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly locator: ReadingV2AuthoringRecoveryLocator;
  readonly authoring: ReadingV2RecoveryAuthoringInput;
  readonly operationId?: string;
  readonly commitKey?: string;
}): ReadingV2AuthoringRecoveryRecord => {
  const workflowOrigin = input.authoring.workflowOrigin ?? { mode: 'direct-publication' };
  const recordId = readingV2AuthoringRecoveryRecordId(input.materialId, input.snapshotVersionId);

  if (!input.ownerId || !input.createdAt || !input.createdBy) {
    throw new Error('Reading V2 authoring recovery requires owner and creation identity.');
  }
  if (input.locator.kind === 'published-snapshot'
    && (input.locator.materialId !== input.materialId
      || input.locator.snapshotVersionId !== input.snapshotVersionId)) {
    throw new Error('Reading V2 recovery snapshot locator must match its publication identity.');
  }
  if (input.locator.kind === 'inline') {
    assertValidReadingV2CanonicalDocument(input.locator.document);
  }

  return {
    kind: 'authoring-recovery',
    schemaVersion: READING_V2_SCHEMA_VERSION,
    recordId,
    ownerId: input.ownerId,
    materialId: input.materialId,
    snapshotVersionId: input.snapshotVersionId,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    ...(input.operationId ? { operationId: input.operationId } : {}),
    ...(input.commitKey ? { commitKey: input.commitKey } : {}),
    authoring: {
      ...(input.authoring.draftId ? { draftId: input.authoring.draftId } : {}),
      ...(Number.isSafeInteger(input.authoring.revision) && (input.authoring.revision ?? 0) >= 1
        ? { revision: input.authoring.revision }
        : {}),
      workflowOrigin,
      ...(input.authoring.authoringContext ? { authoringContext: structuredClone(input.authoring.authoringContext) } : {}),
      metadata: structuredClone(input.authoring.metadata),
      sourceRefs: sourceRefsFromContext(input.authoring.authoringContext),
      ...(input.authoring.expectedBases ? { expectedBases: structuredClone(input.authoring.expectedBases) } : {}),
    },
    locator: structuredClone(input.locator),
  };
};

export const isReadingV2AuthoringRecoveryRecord = (
  value: unknown,
): value is ReadingV2AuthoringRecoveryRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const locator = record.locator;
  const authoring = record.authoring;
  const context = authoring && typeof authoring === 'object' && 'authoringContext' in authoring
    ? authoring.authoringContext as ReadingV2AuthoringContext | undefined : undefined;
  const sourceRefs = authoring && typeof authoring === 'object' && 'sourceRefs' in authoring
    ? authoring.sourceRefs : undefined;
  const validContext = context === undefined || (context && typeof context === 'object'
    && context.origin && typeof context.origin === 'object'
    && ['manual', 'import', 'published'].includes(context.origin.kind)
    && (context.origin.kind !== 'import' || typeof context.origin.sourceId === 'string')
    && (context.requirements === undefined || Array.isArray(context.requirements))
    && (context.interpretations === undefined || Array.isArray(context.interpretations))
    && (context.unboundTargets === undefined || Array.isArray(context.unboundTargets))
    && context.scope && (context.scope.requirementIds === undefined || Array.isArray(context.scope.requirementIds))
    && (context.requirements ?? []).every((requirement) => requirement
      && typeof requirement.sourceId === 'string' && requirement.sourceId.length > 0
      && (requirement.lineIds === undefined || Array.isArray(requirement.lineIds))));
  const expectedSourceRefs = validContext ? sourceRefsFromContext(context) : [];
  const validSourceRefs = (sourceRefs === undefined && expectedSourceRefs.length === 0)
    || (Array.isArray(sourceRefs) && sourceRefs.length === expectedSourceRefs.length
    && sourceRefs.every((entry, index) => entry && typeof entry.sourceId === 'string'
      && entry.sourceId === expectedSourceRefs[index].sourceId));
  return record.kind === 'authoring-recovery'
    && record.schemaVersion === READING_V2_SCHEMA_VERSION
    && typeof record.materialId === 'string' && record.materialId.length > 0
    && typeof record.snapshotVersionId === 'string' && record.snapshotVersionId.length > 0
    && ![record.materialId, record.snapshotVersionId].some((id) => /[.:#$\[\]/\u0000-\u001f\u007f]/.test(id as string))
    && record.recordId === readingV2AuthoringRecoveryRecordId(
      record.materialId as ReadingV2MaterialId,
      record.snapshotVersionId as ReadingV2SnapshotVersionId,
    )
    && typeof record.ownerId === 'string' && record.ownerId.length > 0
    && typeof record.createdAt === 'string' && record.createdAt.length > 0
    && typeof record.createdBy === 'string' && record.createdBy.length > 0
    && Boolean(validContext && validSourceRefs)
    && Boolean(authoring && typeof authoring === 'object' && !Array.isArray(authoring)
      && 'workflowOrigin' in authoring && authoring.workflowOrigin
      && typeof authoring.workflowOrigin === 'object'
      && 'mode' in authoring.workflowOrigin && workflowModes.has(String(authoring.workflowOrigin.mode))
      && 'metadata' in authoring && authoring.metadata
      && typeof authoring.metadata === 'object' && !Array.isArray(authoring.metadata))
    && Boolean(locator && typeof locator === 'object' && !Array.isArray(locator)
      && ('kind' in locator)
      && (locator.kind === 'inline' && 'document' in locator
        || locator.kind === 'published-snapshot'
          && 'materialId' in locator && locator.materialId === record.materialId
          && 'snapshotVersionId' in locator && locator.snapshotVersionId === record.snapshotVersionId));
};

export const recoveryLocatorDocument = (
  recovery: ReadingV2AuthoringRecoveryRecord,
): ReadingV2Document | null => {
  if (recovery.locator.kind !== 'inline') return null;
  const document = normalizeReadingV2FirebaseDocument(recovery.locator.document);
  assertValidReadingV2CanonicalDocument(document);
  return document;
};

import type {
  CanonicalPublishedActivityVersionRecord,
  CanonicalPublicBookForkProvenance,
  CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint,
} from '../book-assembly/canonicalActivityVersion.service';
import {
  assertCanonicalPublishedActivityVersion,
  createCanonicalPublicBookForkPlacementSetFingerprint,
  createCanonicalActivityVersionFingerprint,
} from '../book-assembly/canonicalActivityVersion.service';
import type { SourceQualifiedPageIdentity } from '../../types/bookAssembly.types';
import type { PublicBookSelectionRequest } from './publicBookReferenceFork.types';
import {
  createPublicBookCanonicalForkIds,
} from './publicBookCanonicalFork.identity';
import { projectStudentActivity } from '../book-activity/activityProjection.service';

export interface PublicBookCanonicalForkSourcePins {
  readonly sourceBookId: string;
  readonly sourceOwnerId: string;
  readonly sourceManifestVersionId: string;
  readonly sourcePublicationId: string;
  readonly sourcePublicationRevision: number;
  readonly sourceVersionId: string;
  readonly sourceActivityId: string;
  readonly sourceActivityVersionId: string;
  readonly sourceActivityVersion: number;
  readonly sourcePayloadFingerprint: string;
  readonly sourcePlacementIds: readonly string[];
  readonly sourcePlacementSetFingerprint: string;
  readonly sourceNodeKey: string;
  readonly sourcePlacementId: string;
  readonly sourceUnitKey: string;
  readonly sourceActivityKey: string;
  readonly selectionPath: readonly string[];
  readonly selectionOrder: number;
  readonly sourcePages: readonly SourceQualifiedPageIdentity[];
  readonly sourcePageGroupKeys: readonly string[];
  readonly sourceContextFingerprint: string | null;
}

export interface PublicBookCanonicalForkTargetPins {
  readonly targetBookId: string;
  readonly targetOwnerId: string;
  readonly targetOriginalNodeId: string;
  readonly targetPlacementId: string;
  readonly targetAppendOrder: number;
  readonly targetBookUpdatedAt: string;
}

export interface BuildPublicBookCanonicalForkInput {
  readonly actorId: string;
  readonly operationId: string;
  readonly now: string;
  readonly source: CanonicalPublishedActivityVersionRecord;
  readonly sourcePins: PublicBookCanonicalForkSourcePins;
  readonly targetPins: PublicBookCanonicalForkTargetPins;
  readonly selection: PublicBookSelectionRequest;
}

export interface PublicBookCanonicalForkBuildResult {
  readonly record: CanonicalPublishedActivityVersionRecord;
  readonly activityId: string;
  readonly activityVersionId: string;
}

const clone = <T>(value: T): T => structuredClone(value);

const samePath = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const requireEqual = (condition: boolean, code: string): void => {
  if (!condition) throw new Error(code);
};

/**
 * Builds the complete immutable destination product without touching a
 * repository. All source validation and identity/projection derivation stays
 * in this runtime-neutral module so Worker persistence cannot mint a partial
 * or answer-divergent destination record.
 */
export const buildPublicBookCanonicalFork = async (
  input: BuildPublicBookCanonicalForkInput,
): Promise<PublicBookCanonicalForkBuildResult> => {
  const source = assertCanonicalPublishedActivityVersion(input.source);
  const sourcePins = input.sourcePins;
  const targetPins = input.targetPins;

  requireEqual(targetPins.targetOwnerId === input.actorId, 'public_book_fork_target_owner_mismatch');
  requireEqual(source.activityId === sourcePins.sourceActivityId, 'public_book_fork_source_activity_mismatch');
  requireEqual(source.activityVersionId === sourcePins.sourceActivityVersionId, 'public_book_fork_source_activity_version_mismatch');
  requireEqual(source.activityVersion === sourcePins.sourceActivityVersion, 'public_book_fork_source_activity_number_mismatch');
  requireEqual(source.ownerId === sourcePins.sourceOwnerId, 'public_book_fork_source_owner_mismatch');
  requireEqual(source.payloadFingerprint === sourcePins.sourcePayloadFingerprint, 'public_book_fork_source_fingerprint_mismatch');
  requireEqual(sourcePins.sourcePlacementIds.includes(sourcePins.sourcePlacementId), 'public_book_fork_source_placement_missing');
  requireEqual(
    [...sourcePins.sourcePlacementIds].every((value, index, values) => index === 0 || values[index - 1]! < value),
    'public_book_fork_source_placement_set_unsorted',
  );
  requireEqual(
    sourcePins.sourcePlacementSetFingerprint
      === createCanonicalPublicBookForkPlacementSetFingerprint(sourcePins.sourcePlacementIds),
    'public_book_fork_source_placement_set_fingerprint_mismatch',
  );
  requireEqual(source.placementIds.length === sourcePins.sourcePlacementIds.length
    && source.placementIds.every((value, index) => value === sourcePins.sourcePlacementIds[index]),
  'public_book_fork_source_placement_set_mismatch');
  requireEqual(input.selection.kind === 'activity' && input.selection.activities.length === 1,
    'public_book_fork_selection_invalid');
  const selected = input.selection.activities[0]!;
  requireEqual(selected.activityId === sourcePins.sourceActivityId
    && selected.activityVersionId === sourcePins.sourceActivityVersionId
    && selected.order === sourcePins.selectionOrder,
  'public_book_fork_selection_activity_mismatch');
  requireEqual(samePath(input.selection.selectionPath, sourcePins.selectionPath),
    'public_book_fork_selection_path_mismatch');

  const { activityId, activityVersionId } = await createPublicBookCanonicalForkIds({
    actorId: input.actorId,
    operationId: input.operationId,
  });
  requireEqual(activityId !== source.activityId, 'public_book_fork_activity_id_collision');

  // The private normalized Activity is one immutable semantic unit. Clone it
  // once, preserve every hidden identity/answer mapping, and derive only the
  // public sibling from the clone.
  const activity = clone(source.activity);
  const projection = projectStudentActivity(activity);
  const provenance: CanonicalPublicBookForkProvenance = {
    kind: 'public-book-fork',
    sourceBookId: sourcePins.sourceBookId,
    sourceOwnerId: sourcePins.sourceOwnerId,
    sourceManifestVersionId: sourcePins.sourceManifestVersionId,
    sourcePublicationId: sourcePins.sourcePublicationId,
    sourcePublicationRevision: sourcePins.sourcePublicationRevision,
    sourceVersionId: sourcePins.sourceVersionId,
    sourcePublicationBinding: {
      manifestVersionId: sourcePins.sourceManifestVersionId,
      publicationId: sourcePins.sourcePublicationId,
      publicationRevision: sourcePins.sourcePublicationRevision,
    },
    sourceActivityId: sourcePins.sourceActivityId,
    sourceActivityVersionId: sourcePins.sourceActivityVersionId,
    sourceActivityVersion: sourcePins.sourceActivityVersion,
    sourcePayloadFingerprint: sourcePins.sourcePayloadFingerprint,
    sourcePlacementIds: [...sourcePins.sourcePlacementIds],
    sourcePlacementSetFingerprint: sourcePins.sourcePlacementSetFingerprint,
    sourceNodeKey: sourcePins.sourceNodeKey,
    sourcePlacementId: sourcePins.sourcePlacementId,
    sourceUnitKey: sourcePins.sourceUnitKey,
    sourceActivityKey: sourcePins.sourceActivityKey,
    selectionKind: 'activity',
    selectionPath: [...sourcePins.selectionPath],
    selectionOrder: sourcePins.selectionOrder,
    sourcePages: clone(sourcePins.sourcePages),
    sourcePageGroupKeys: [...sourcePins.sourcePageGroupKeys],
    sourceContextFingerprint: sourcePins.sourceContextFingerprint,
    targetBookId: targetPins.targetBookId,
    targetOwnerId: targetPins.targetOwnerId,
    targetOriginalNodeId: targetPins.targetOriginalNodeId,
    targetPlacementId: targetPins.targetPlacementId,
    targetAppendOrder: targetPins.targetAppendOrder,
    targetBookUpdatedAt: targetPins.targetBookUpdatedAt,
  };
  const withoutFingerprint: CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint = {
    schemaVersion: 1,
    lifecycle: 'published',
    activityId,
    activityVersionId,
    activityVersion: 1,
    ownerId: targetPins.targetOwnerId,
    activity,
    projection,
    placementIds: [targetPins.targetPlacementId],
    evidenceRefs: ['public-book-fork'],
    sourceContextFingerprint: sourcePins.sourceContextFingerprint,
    createdByOperationId: input.operationId,
    publishedAt: input.now,
    provenance,
  };
  const record = assertCanonicalPublishedActivityVersion({
    ...withoutFingerprint,
    payloadFingerprint: createCanonicalActivityVersionFingerprint(withoutFingerprint),
  });
  return { record, activityId, activityVersionId };
};

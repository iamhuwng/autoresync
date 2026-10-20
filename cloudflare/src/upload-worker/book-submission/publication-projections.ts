import { fingerprintComponentPdfActivationValue } from '../../../../src/services/book-assembly/componentPdfActivation.service.ts';
import type { NormalizedActivity, EditableActivity } from '../../../../src/types/bookActivity.types.ts';
import type { BookAssemblyBookAuthority, BookAssemblyCandidateRecord } from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type { BookAssemblyManifestCandidate } from '../../../../src/types/bookAssembly.types.ts';
import type { BookAssemblyPublicationScope } from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { PreparedComponentPdfArtifact } from './component-preparation.ts';
import { BookSubmissionWorkerError } from './worker.ts';

export type RecordValue = Record<string, unknown>;

export const record = (value: unknown): RecordValue | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
);

export const publicationId = (kind: string, operationId: string, key: string): string =>
  `${kind}-${operationId.slice(0, 16)}-${key.replace(/[^A-Za-z0-9._:@-]/gu, '-').slice(0, 96)}`;

export const preparedCandidate = (
  uid: string, bookId: string, unitKey: string,
  manifest: BookAssemblyManifestCandidate, now: string,
): BookAssemblyCandidateRecord => ({
  candidateId: `submission-${bookId}`, ownerId: uid, bookId, bookRevision: 1,
  sourceSetRevision: 1, unitKey, revision: 1, lifecycle: 'validated',
  manifest, validation: { valid: true, errors: [] }, updatedAt: now,
});

export const activityPayloadsForUnit = (
  uid: string, unitKey: string, activities: Readonly<Record<string, NormalizedActivity>>,
) => Object.fromEntries(Object.entries(activities)
  .filter(([key]) => key.startsWith(`${unitKey}:`))
  .map(([key, activity]) => [key.slice(unitKey.length + 1), {
    activityKey: key.slice(unitKey.length + 1), ownerId: uid, revision: 1,
    lifecycle: 'draft' as const, activity,
  }]));

/** Rebuild the editable authoring shape from the normalized payload frozen by
 * submission. The answer key is identity based, so map it back to editable
 * indexes before seeding the saved authoring record. */
const editableActivityFor = (activity: NormalizedActivity): EditableActivity => {
  const interactions = activity.interactions.map((interaction) => {
    const answerKey = interaction.answerKey as Record<string, unknown>;
    const identities = interaction.itemIdentities as Record<string, unknown>;
    if (interaction.family === 'choice') {
      const ids = identities.optionIds as string[];
      const accepted = (answerKey.acceptedOptionItemIds as string[]).map((id) => ids.indexOf(id));
      return { ...interaction, acceptedOptionIndexes: accepted, ...{ interactionId: undefined, itemIdentities: undefined, answerKey: undefined } };
    }
    if (interaction.family === 'text-entry') {
      return { ...interaction, acceptedAnswers: answerKey.acceptedAnswers as string[], interactionId: undefined, itemIdentities: undefined, answerKey: undefined };
    }
    if (interaction.family === 'matching') {
      const leftIds = identities.leftItemIds as string[];
      const rightIds = identities.rightItemIds as string[];
      const leftItems = interaction.leftItems ?? [];
      const rightItems = interaction.rightItems ?? [];
      const acceptedPairs = (answerKey.acceptedPairs as Array<{ leftItemId: string; rightItemId: string }>).map((pair) => ({
        left: leftItems[leftIds.indexOf(pair.leftItemId)]!, right: rightItems[rightIds.indexOf(pair.rightItemId)]!,
      }));
      return { ...interaction, acceptedPairs, interactionId: undefined, itemIdentities: undefined, answerKey: undefined };
    }
    if (interaction.family === 'ordering') {
      const ids = identities.itemIds as string[];
      return { ...interaction, acceptedOrder: (answerKey.acceptedOrderItemIds as string[]).map((id) => ids.indexOf(id)), interactionId: undefined, itemIdentities: undefined, answerKey: undefined };
    }
    return { ...interaction, rubric: answerKey.rubric, interactionId: undefined, itemIdentities: undefined, answerKey: undefined };
  }).map((interaction) => {
    const next = { ...interaction } as Record<string, unknown>;
    delete next.interactionId; delete next.itemIdentities; delete next.answerKey; delete next.family;
    return next;
  });
  return { ...activity, interactions } as unknown as EditableActivity;
};

export const submissionAssemblySeedWrites = (
  uid: string, bookId: string, operationId: string, manifest: BookAssemblyManifestCandidate,
  activitiesByKey: Readonly<Record<string, NormalizedActivity>>, now: string,
  idsFor: (unitKey: string) => { unitProjectionId: string; deliveryPlanId: string; activitiesByKey: Record<string, { activityId: string; activityVersionId: string; activityVersion: number; projectionId: string; placementId: string }> },
) => {
  const candidateId = `submission-${bookId}`;
  const epoch = Date.parse(now);
  const writes: Array<{ path: string; value: unknown }> = [];
  for (const unit of manifest.units) {
    const candidate: BookAssemblyCandidateRecord = {
      candidateId, ownerId: uid, bookId, bookRevision: 1, sourceSetRevision: 1,
      unitKey: unit.unitKey, revision: 1, lifecycle: 'validated', manifest,
      validation: { valid: true, errors: [] }, updatedAt: now,
    };
    writes.push({ path: `book_assembly/books/${bookId}/units/${unit.unitKey}`, value: {
      current: { candidateId, candidateRevision: 1, bookRevision: 1, sourceSetRevision: 1, updatedAt: now },
      candidates: { [candidateId]: candidate },
    } });
    for (const slot of unit.activitySlots) {
      const key = `${unit.unitKey}:${slot.activityKey}`;
      const activity = activitiesByKey[key];
      const ids = idsFor(unit.unitKey).activitiesByKey[slot.activityKey];
      if (!activity || !ids) continue;
      const activityCandidateId = publicationId('activity-candidate', operationId, `${unit.unitKey}-${slot.activityKey}`);
      const targetActivityId = ids.activityId;
      const editable = editableActivityFor(activity);
      const seal = { activityKey: slot.activityKey, bookId, candidateId, candidateRevision: 1,
        manifestFingerprint: fingerprintComponentPdfActivationValue(manifest), unitKey: unit.unitKey };
      writes.push({ path: `book_activity_authoring/owners/${uid}/activities/${ids.activityId}`, value: {
        activityId: ids.activityId, ownerId: uid, revision: 1, lifecycle: 'draft',
        editableDraft: editable, draft: activity, updatedAt: epoch,
      } });
      writes.push({ path: `book_activity_authoring/owners/${uid}/candidates/${activityCandidateId}`, value: {
        candidateId: activityCandidateId, targetActivityId, ownerId: uid, bookId, assemblyDraft: seal,
        targetRevision: 0, revision: 1, lifecycle: 'saved', content: editable,
        validation: { valid: true, errors: [] }, diff: null, evidenceRefs: [], sourceEvidenceRefs: [], answerEvidenceRefs: [], updatedAt: epoch,
      } });
      writes.push({ path: `book_assembly_activity_bindings/owners/${uid}/books/${bookId}/units/${unit.unitKey}/activities/${slot.activityKey}`, value: {
        schemaVersion: 1, ownerId: uid, bookId, unitKey: unit.unitKey, activityKey: slot.activityKey,
        activityId: ids.activityId, candidateId: activityCandidateId, candidateRevision: 1, candidateLifecycle: 'saved',
      } });
    }
  }
  return writes;
};

export const publicationOperationUuid = (operationId: string): string => {
  const candidate = operationId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu)?.[0];
  if (!candidate) throw new BookSubmissionWorkerError('book_submission_operation_invalid', 409);
  return candidate;
};

export const materialNodes = (
  manifest: BookAssemblyManifestCandidate,
  bookId: string,
  now: string,
  ownerId: string,
  operationId: string,
  testTypeIds: readonly string[],
  placements: readonly { placementId: string; nodeKey: string; activityId: string; activityVersionId: string; activityKey: string; order: number }[],
) =>
  manifest.nodes.map((node) => ({
    nodeId: node.nodeKey, bookId, parentNodeId: node.parentNodeKey, type: node.nodeType,
    title: node.title ?? node.nodeKey, order: node.order,
    materialRefs: placements.filter((placement) => placement.nodeKey === node.nodeKey).map((placement, index) => ({
      refId: `submission-ref-${operationId.slice(0, 16)}-${placement.placementId}`,
      materialId: placement.activityId,
      materialKind: 'interactive-activity' as const,
      snapshotVersionId: placement.activityVersionId,
      titleSnapshot: placement.activityKey,
      testTypeIdsSnapshot: testTypeIds,
      visibilitySnapshot: 'private', availability: 'available' as const,
      updateState: 'current' as const, ownerIdSnapshot: ownerId,
      order: placement.order ?? index, addedAt: now, addedBy: ownerId,
    })),
    createdAt: now, updatedAt: now,
  }));

export type PublicationScope = BookAssemblyPublicationScope<unknown>;

export const publicationScopeWrites = (bookId: string, scope: PublicationScope) => {
  const root = `book_assembly_publications/books/${bookId}`;
  const writes: Array<{ path: string; value: unknown }> = [];
  const families: Array<[string, Record<string, unknown> | undefined]> = [
    ['versions', scope.versions as Record<string, unknown> | undefined],
    ['activity_versions', scope.activityVersions as Record<string, unknown> | undefined],
    ['activity_safe_projections', scope.activitySafeProjections as Record<string, unknown> | undefined],
    ['placements', scope.placements as Record<string, unknown> | undefined],
    ['unit_projections', scope.unitProjections as Record<string, unknown> | undefined],
    ['delivery_plans', scope.deliveryPlans as Record<string, unknown> | undefined],
    ['student_documents', scope.studentDocuments as Record<string, unknown> | undefined],
    ['operations', scope.operations as Record<string, unknown> | undefined],
    ['audits', scope.audits as Record<string, unknown> | undefined],
  ];
  for (const [family, values] of families)
    for (const [key, value] of Object.entries(values ?? {}))
      writes.push({ path: `${root}/${family}/${key}`, value });
  if (scope.current) writes.push({ path: `${root}/current`, value: scope.current });
  return writes;
};

export const sameComponentSourceSet = (
  left: PreparedComponentPdfArtifact['sourceSet'],
  right: BookAssemblyManifestCandidate['sourceSet'],
): boolean => left.sourceStrategy === right.sourceStrategy
  && left.sources.length === right.sources.length
  && left.sources.every((source, index) => {
    const candidate = right.sources[index];
    return !!candidate && source.sourceKey === candidate.sourceKey
      && source.sourceVersionId === candidate.sourceVersionId
      && source.sourceOrder === candidate.sourceOrder
      && 'ownerNodeKey' in candidate && source.ownerNodeKey === candidate.ownerNodeKey;
  });

export const isPreparedComponentArtifact = (value: unknown): value is PreparedComponentPdfArtifact => {
  const candidate = record(value);
  const sourceSet = record(candidate?.sourceSet);
  const composition = record(candidate?.composition);
  const studentDocument = record(candidate?.studentDocument);
  const descriptor = record(candidate?.descriptor);
  const sourceReceipts = Array.isArray(candidate?.sourceReceipts) ? candidate.sourceReceipts : null;
  const sourceEntries = Array.isArray(sourceSet?.sources) ? sourceSet.sources : null;
  return candidate?.schemaVersion === 1 && candidate.kind === 'component-pdf-prepared-artifact'
    && typeof candidate.operationId === 'string' && typeof candidate.ownerId === 'string'
    && typeof candidate.bookId === 'string' && typeof candidate.fingerprint === 'string'
    && /^[a-f0-9]{64}$/iu.test(candidate.fingerprint) && candidate.active === false
    && sourceSet?.sourceStrategy === 'component_pdfs' && sourceEntries !== null && sourceEntries.length >= 2
    && sourceEntries.every((entry, index) => {
      const source = record(entry);
      return typeof source?.sourceKey === 'string' && typeof source.sourceVersionId === 'string'
        && typeof source.ownerNodeKey === 'string' && source.sourceOrder === index + 1;
    })
    && sourceReceipts !== null && sourceReceipts.length === sourceEntries.length && sourceReceipts.every((entry) => {
      const receipt = record(entry);
      const checksum = record(receipt?.checksum);
      return typeof receipt?.sourceKey === 'string' && typeof receipt.sourceVersionId === 'string'
        && checksum?.algorithm === 'sha-256' && typeof checksum.value === 'string'
        && /^[a-f0-9]{64}$/iu.test(checksum.value)
        && Number.isSafeInteger(receipt.byteSize) && (receipt.byteSize as number) > 0
        && Number.isSafeInteger(receipt.physicalPageCount) && (receipt.physicalPageCount as number) > 0;
    })
    && typeof composition?.sha256Hex === 'string' && /^[a-f0-9]{64}$/iu.test(composition.sha256Hex)
    && Array.isArray(composition.mapping) && composition.mapping.length === sourceEntries.length
    && Array.isArray(composition.inputManifest) && composition.inputManifest.length === sourceEntries.length
    && studentDocument?.verifiedUsable === true && studentDocument.studentSafeStatus === 'ready'
    && typeof studentDocument.sourceVersionId === 'string' && typeof studentDocument.sha256Hex === 'string'
    && /^[a-f0-9]{64}$/iu.test(studentDocument.sha256Hex)
    && Number.isSafeInteger(studentDocument.byteSize) && (studentDocument.byteSize as number) > 0
    && Number.isSafeInteger(studentDocument.physicalPageCount) && (studentDocument.physicalPageCount as number) > 0
    && typeof descriptor?.sourceVersionId === 'string' && typeof descriptor.sha256Hex === 'string'
    && /^[a-f0-9]{64}$/iu.test(descriptor.sha256Hex) && Number.isSafeInteger(descriptor.descriptorRevision)
    && (descriptor.descriptorRevision as number) >= 1
    && Number.isSafeInteger(descriptor.byteSize) && (descriptor.byteSize as number) > 0
    && Number.isSafeInteger(descriptor.physicalPageCount) && (descriptor.physicalPageCount as number) > 0
    && typeof descriptor.compositionFingerprint === 'string'
    && Array.isArray(descriptor.components) && descriptor.components.length === sourceEntries.length;
};

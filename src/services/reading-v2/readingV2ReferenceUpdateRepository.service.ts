import type { MaterialBookMetadata, MaterialBookNode } from '../../types/materialCatalog.types';
import type { ReadingV2FullTestComposition, ReadingV2PublishedSnapshot, ReadingV2Document, ReadingV2SnapshotVersionId } from '../../types/readingV2.types';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import { readingV2Ids } from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import {
  applyReadingV2SelectedReferenceUpdates,
  findReadingV2ReferenceUpdateTargets,
  type ReadingV2ReferenceUpdateBook,
  type ReadingV2ReferenceUpdateBookNode,
  type ReadingV2ReferenceUpdateResult,
  type ReadingV2ReferenceUpdateSummary,
} from './readingV2ReferenceUpdate.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import { isReadingV2AuthoringRecoveryRecord, readingV2AuthoringRecoveryRecordId, recoveryLocatorDocument } from './readingV2PublicationRecovery.service';
import { buildReadingV2TeacherSelectedPassageDocument } from './readingV2TeacherComposition.service';
import { createReadingV2Repository } from './readingV2Repository.service';
import { publishReadingV2Material } from './readingV2PublishPipeline.service';
import { buildReadingV2FirebasePublishUpdates } from './readingV2FirebasePublishAdapter.service';
import { prepareReadingV2PublicationUpdates, readReadingV2PublicationBase } from './readingV2PublicationGuard.service';
import type { ReadingV2AuthoringSourceRecord } from './readingV2AuthoringQuality.service';

export interface ReadingV2ReferenceUpdateRepositoryAdapter {
  readonly read: (path: string) => Promise<unknown>;
  readonly update: (payload: Record<string, unknown | null>) => Promise<void>;
}

export interface ReadingV2ReferenceUpdateRepository {
  readonly discoverTargets: (input: {
    readonly ownerId: string;
    readonly passageMaterialId: string;
    readonly previousSnapshotVersionId: string;
    readonly nextSnapshotVersionId: string;
    readonly frozenAssignmentCount?: number;
    readonly resultSnapshotCount?: number;
  }) => Promise<ReadingV2ReferenceUpdateSummary>;
  readonly applySelected: (input: {
    readonly summary: ReadingV2ReferenceUpdateSummary;
    readonly selectedTargetIds: readonly string[];
  }) => Promise<ReadingV2ReferenceUpdateResult>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const values = (value: unknown): unknown[] => (isRecord(value) ? Object.values(value) : []);

const isComposition = (value: unknown): value is ReadingV2FullTestComposition =>
  isRecord(value) &&
  typeof value.compositionId === 'string' &&
  typeof value.ownerId === 'string' &&
  Array.isArray(value.passageRefs);

const isBookMetadata = (value: unknown): value is MaterialBookMetadata =>
  isRecord(value) &&
  typeof value.bookId === 'string' &&
  typeof value.ownerId === 'string' &&
  typeof value.title === 'string';

const isBookNode = (value: unknown): value is MaterialBookNode =>
  isRecord(value) &&
  typeof value.nodeId === 'string' &&
  typeof value.bookId === 'string' &&
  Array.isArray(value.materialRefs);

const isMaterialMetadata = (value: unknown): value is ReadingV2MaterialMetadata =>
  isRecord(value) && typeof value.materialId === 'string' && typeof value.ownerId === 'string'
  && typeof value.publishedSnapshotVersionId === 'string' && value.state === 'published'
  && Number.isSafeInteger(value.materialRevision);

const isSummaryRow = (value: unknown, ownerId: string): value is { materialId: string; ownerId: string; materialKind: string; lifecycleState: string } =>
  isRecord(value) && typeof value.materialId === 'string' && value.ownerId === ownerId
  && typeof value.materialKind === 'string' && value.lifecycleState === 'active';

const listOwnedCompositions = async (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
  ownerId: string,
): Promise<ReadingV2FullTestComposition[]> => {
  // The composition collection is private at the individual-record boundary.
  // Discover ids from the owner summary index, then read each authorized base.
  const rawSummaries = await adapter.read(`material_catalog/material_summary_indexes/v1/by_owner/${ownerId}`);
  const summaries = values(rawSummaries).filter((value) => isSummaryRow(value, ownerId))
    .filter((summary) => summary.materialKind === 'full-test');

  const compositions = await Promise.all(summaries.map(async (summary) => {
    const metadata = await adapter.read(readingV2StoragePaths.materialMetadata(summary.materialId));
    if (!isMaterialMetadata(metadata) || metadata.ownerId !== ownerId
      || (metadata.materialKind !== 'full-test' && metadata.materialKind !== 'reading-v2-full-test-composition')
      || !metadata.compositionId) {
      return null;
    }
    const composition = await adapter.read(readingV2StoragePaths.fullTestCompositions(metadata.compositionId));
    return isComposition(composition) && composition.ownerId === ownerId && composition.state !== 'removed'
      ? composition : null;
  }));

  return compositions.filter((composition): composition is ReadingV2FullTestComposition => composition !== null);
};

const listOwnedBooks = async (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
  ownerId: string,
): Promise<ReadingV2ReferenceUpdateBook[]> => {
  const rawBooks = await adapter.read(`material_catalog/book_indexes/by_owner/${ownerId}`);
  const indexedBooks = values(rawBooks).filter(isBookMetadata);

  return Promise.all(
    indexedBooks.map(async (book) => ({
      bookId: book.bookId,
      title: book.title,
      ownerId: book.ownerId,
      nodes: values(await adapter.read(`material_catalog/book_nodes/${book.bookId}`))
        .filter(isBookNode) as unknown as ReadingV2ReferenceUpdateBookNode[],
    })),
  );
};

const loadScope = async (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
  ownerId: string,
) => {
  const [masters, books] = await Promise.all([
    listOwnedCompositions(adapter, ownerId),
    listOwnedBooks(adapter, ownerId),
  ]);

  return { masters, books };
};

const isPublishedSnapshot = (value: unknown): value is ReadingV2PublishedSnapshot =>
  isRecord(value) && typeof value.materialId === 'string' && typeof value.ownerId === 'string'
  && typeof value.snapshotVersionId === 'string' && typeof value.publishedAt === 'string'
  && typeof value.publishedBy === 'string' && isRecord(value.document);

const childMaterialRevision = (
  value: unknown,
  ref: { readonly passageMaterialId: string; readonly snapshotVersionId: string },
  ownerId: string,
): number | null => {
  if (!isRecord(value)
    || value.passageMaterialId !== ref.passageMaterialId
    || value.currentSnapshotVersionId !== ref.snapshotVersionId
    || value.ownerId !== ownerId
    || !isRecord(value.document)
    || !Number.isSafeInteger(value.materialRevision)
    || Number(value.materialRevision) < 1) {
    return null;
  }
  return Number(value.materialRevision);
};

const addUpdates = (target: Record<string, unknown | null>, source: Readonly<Record<string, unknown>>): void => {
  Object.entries(source).forEach(([path, value]) => {
    if (Object.keys(target).some((existing) => existing === path || existing.startsWith(`${path}/`) || path.startsWith(`${existing}/`))) {
      throw new Error(`Reference update has overlapping publication writes at ${path}.`);
    }
    target[path] = value;
  });
};

const prefix = (value: unknown, scope: string): string => {
  const id = String(value ?? '');
  return id.startsWith(`${scope}-`) ? id : `${scope}-${id}`;
};

/** Rebuild only the selected child subtree. Existing sibling ids remain untouched. */
const replacePassageDocument = (
  base: ReadingV2Document,
  child: ReadingV2Document,
  passageIndex: number,
): ReadingV2Document => {
  const scope = `passage-${passageIndex + 1}`;
  const oldSectionId = base.sectionIds[passageIndex];
  const oldSection = oldSectionId ? base.sections[oldSectionId] : undefined;
  if (!oldSection || child.sectionIds.length !== 1) throw new Error('Reference update cannot identify one exact parent passage section.');
  const usesPrefix = oldSectionId.startsWith(`${scope}-`);
  const oldStimulusIds = oldSection.stimulusIds;
  const oldGroupIds = oldSection.taskGroupIds;
  const oldInteractionIds = oldGroupIds.flatMap((id) => base.taskGroups[id]?.interactionIds ?? []);
  const oldOptionIds = oldGroupIds.flatMap((id) => base.taskGroups[id]?.optionSetRefs ?? []);
  const oldAnchorIds = Object.values(base.anchors).filter((anchor) => oldStimulusIds.includes(anchor.stimulusId)).map((anchor) => anchor.anchorId);
  const oldIds = {
    sections: [oldSectionId], stimuli: oldStimulusIds, anchors: oldAnchorIds,
    taskGroups: oldGroupIds, interactions: oldInteractionIds, optionSets: oldOptionIds,
  };
  const childIds = new Set<string>([
    ...child.sectionIds, ...Object.keys(child.stimuli), ...Object.keys(child.anchors),
    ...Object.keys(child.taskGroups), ...Object.keys(child.interactions), ...Object.keys(child.optionSets),
  ]);
  const mapId = (id: string): string => usesPrefix && childIds.has(id) ? prefix(id, scope) : id;
  const mapValue = (value: unknown): unknown => {
    if (typeof value === 'string') return mapId(value);
    if (Array.isArray(value)) return value.map(mapValue);
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [mapId(key), mapValue(item)]));
    return value;
  };
  const result = structuredClone(base) as unknown as Record<string, any>;
  result.sectionIds.splice(passageIndex, 1, ...child.sectionIds.map(mapId));
  for (const name of Object.keys(oldIds) as (keyof typeof oldIds)[]) {
    const current = result[name] as Record<string, unknown>;
    oldIds[name].forEach((id) => delete current[id]);
    const replacement = mapValue(child[name]) as Record<string, unknown>;
    Object.entries(replacement).forEach(([id, value]) => {
      if (Object.hasOwn(current, id)) throw new Error(`Reference update would overwrite unrelated canonical id ${id}.`);
      current[id] = value;
    });
  }
  assertValidReadingV2CanonicalDocument(result as ReadingV2Document);
  return result as ReadingV2Document;
};

export const createReadingV2ReferenceUpdateRepository = (
  adapter: ReadingV2ReferenceUpdateRepositoryAdapter,
): ReadingV2ReferenceUpdateRepository => ({
  async discoverTargets(input) {
    const { masters, books } = await loadScope(adapter, input.ownerId);
    return findReadingV2ReferenceUpdateTargets({
      ...input,
      masters,
      books,
    });
  },

  async applySelected(input) {
    const ownerId = input.summary.targets[0]?.ownerId ?? '';
    if (!ownerId) {
      return {
        updatedMasters: [], updatedBooks: [], updatedTargetIds: [], skippedTargetIds: [],
        immutableFrozenCounts: {
          frozenAssignmentCount: input.summary.excluded.frozenAssignmentCount,
          resultSnapshotCount: input.summary.excluded.resultSnapshotCount,
        },
      };
    }

    // One call is one captured request. A retry must reuse the caller's captured
    // request; a later call intentionally re-reads and conflicts on stale refs.
    const operationId = `reference-update-${crypto.randomUUID()}`;
    const { masters, books } = await loadScope(adapter, ownerId);
    const freshSummary = findReadingV2ReferenceUpdateTargets({
      ownerId,
      passageMaterialId: input.summary.passageMaterialId,
      previousSnapshotVersionId: input.summary.previousSnapshotVersionId,
      nextSnapshotVersionId: input.summary.nextSnapshotVersionId,
      masters,
      books,
      frozenAssignmentCount: input.summary.excluded.frozenAssignmentCount,
      resultSnapshotCount: input.summary.excluded.resultSnapshotCount,
    });
    const selected = new Set(input.selectedTargetIds);
    if (selected.size !== input.selectedTargetIds.length
      || input.selectedTargetIds.some((id) => !input.summary.targets.some((target) => target.id === id))) {
      throw new Error('Reference update selection contains an unknown or duplicate target.');
    }
    const stale = input.summary.targets.some((target) => selected.has(target.id) && !freshSummary.targets.some((fresh) =>
      fresh.id === target.id && fresh.currentSnapshotVersionId === target.currentSnapshotVersionId
      && fresh.currentParentVersionId === target.currentParentVersionId
      && fresh.currentMaterialRevision === target.currentMaterialRevision));
    if (stale) {
      throw new Error('Reference update is stale. Reload the current references and choose again.');
    }
    const result = applyReadingV2SelectedReferenceUpdates({
      ...input,
      masters,
      books,
    });
    const updates: Record<string, unknown | null> = {};
    const versionIds: Record<string, ReadingV2SnapshotVersionId> = {};
    result.updatedMasters.forEach((master) => {
      const previous = masters.find((candidate) => candidate.compositionId === master.compositionId);
      if (!previous) throw new Error(`Reference update parent ${master.compositionId} was not found.`);
      const versionId = readingV2Ids.snapshotVersionId(`${operationId}-${master.compositionId}`);
      versionIds[master.compositionId] = versionId;
    });
    result.updatedBooks.forEach((book) => {
      book.nodes.forEach((node) => {
        const nodeId = node.nodeId ?? node.id;
        const original = books.find((candidate) => candidate.bookId === book.bookId)?.nodes.find(
          (candidate) => (candidate.nodeId ?? candidate.id) === nodeId,
        );
        if (nodeId && original && JSON.stringify(node) !== JSON.stringify(original)) {
          updates[`material_catalog/book_nodes/${book.bookId}/${nodeId}`] = node;
        }
      });
    });

    for (const master of result.updatedMasters) {
      const previous = masters.find((candidate) => candidate.compositionId === master.compositionId)!;
      const base = await readReadingV2PublicationBase({
        read: adapter.read, materialId: master.testMaterialId, ownerId,
        expectedHead: previous.publishedVersionId,
      });
      if (base.recordPath !== readingV2StoragePaths.fullTestCompositions(master.compositionId)
        || previous.materialRevision !== base.materialRevision) throw new Error('Reference update parent changed since discovery.');
      const versionId = versionIds[master.compositionId]!;
      const publishedAt = new Date().toISOString();
      const previousRecoveryRaw = await adapter.read(readingV2StoragePaths.provenance(
        readingV2AuthoringRecoveryRecordId(master.testMaterialId, previous.publishedVersionId),
      ));
      if (!isReadingV2AuthoringRecoveryRecord(previousRecoveryRaw)
        || previousRecoveryRaw.ownerId !== ownerId
        || previousRecoveryRaw.materialId !== master.testMaterialId
        || previousRecoveryRaw.snapshotVersionId !== previous.publishedVersionId) {
        throw new Error('Reference update requires exact owner-private parent recovery.');
      }
      const previousRecovery = previousRecoveryRaw;
      const inlineParent = recoveryLocatorDocument(previousRecovery);
      const snapshotRaw = inlineParent ? null : await adapter.read(
        readingV2StoragePaths.publishedSnapshots(master.testMaterialId, previous.publishedVersionId),
      );
      const previousSnapshot = isPublishedSnapshot(snapshotRaw) ? snapshotRaw : null;
      if (!inlineParent && (!previousSnapshot || previousSnapshot.ownerId !== ownerId
        || previousSnapshot.materialId !== master.testMaterialId
        || previousSnapshot.snapshotVersionId !== previous.publishedVersionId)) {
        throw new Error('Reference update requires the exact published parent snapshot.');
      }
      const childBases = await Promise.all(master.passageRefs.map(async (ref) => {
        const [snapshotRaw, metadataRaw, versionRaw] = await Promise.all([
          adapter.read(readingV2StoragePaths.publishedSnapshots(ref.passageMaterialId, ref.snapshotVersionId)),
          adapter.read(readingV2StoragePaths.materialMetadata(ref.passageMaterialId)),
          adapter.read(readingV2StoragePaths.readingPassageMaterialVersions(ref.passageMaterialId, ref.snapshotVersionId)),
        ]);
        if (!isPublishedSnapshot(snapshotRaw) || String(snapshotRaw.materialId) !== String(ref.passageMaterialId)
          || snapshotRaw.snapshotVersionId !== ref.snapshotVersionId
          || (snapshotRaw.ownerId !== ownerId && ref.visibility !== 'public')) {
          throw new Error(`Reference update cannot load pinned passage ${ref.passageMaterialId}/${ref.snapshotVersionId}.`);
        }
        if (!isMaterialMetadata(metadataRaw) || String(metadataRaw.materialId) !== String(ref.passageMaterialId)
          || (metadataRaw.ownerId !== ownerId && ref.visibility !== 'public')) {
          throw new Error(`Reference update cannot load current passage metadata ${ref.passageMaterialId}.`);
        }
        const materialRevision = childMaterialRevision(versionRaw, ref, snapshotRaw.ownerId);
        if (materialRevision === null) {
          throw new Error(`Reference update cannot load immutable passage revision ${ref.passageMaterialId}/${ref.snapshotVersionId}.`);
        }
        return { ref, snapshot: snapshotRaw, materialRevision };
      }));
      const childSnapshots = childBases.map((child) => child.snapshot);
      const nextMaster: ReadingV2FullTestComposition = {
        ...master,
        publishedVersionId: versionId,
        materialRevision: base.materialRevision + 1,
        state: 'published',
        updatedAt: publishedAt,
      };
      let document = inlineParent ?? previousSnapshot!.document;
      let expectedBases = previousRecovery.authoring.expectedBases;
      if (inlineParent) {
        const generated = previousRecovery.authoring.expectedBases?.generatedPassages;
        if (!Array.isArray(generated) || generated.length !== master.passageRefs.length) {
          throw new Error('Composition-first parent has no exact section association for reference update.');
        }
        const associationByMaterialId = new Map(generated.map((item) => {
          const association = item as { sectionId?: string; materialId?: string; snapshotVersionId?: string; materialRevision?: number };
          return [association.materialId, association] as const;
        }));
        if (associationByMaterialId.size !== generated.length) {
          throw new Error('Composition-first parent has duplicate generated passage associations.');
        }
        for (const [childIndex, child] of childBases.entries()) {
          const association = associationByMaterialId.get(child.ref.passageMaterialId);
          const sectionIndex = association?.sectionId
            ? document.sectionIds.indexOf(association.sectionId as typeof document.sectionIds[number]) : -1;
          if (!association || sectionIndex < 0 || String(association.materialId) !== String(child.ref.passageMaterialId)) {
            throw new Error('Reference update section association changed.');
          }
          const previousRef = previous.passageRefs.find((candidate) => candidate.refId === child.ref.refId);
          if (child.ref.snapshotVersionId !== previousRef?.snapshotVersionId) {
            document = replacePassageDocument(document, childSnapshots[childIndex]!.document, sectionIndex);
          }
        }
        expectedBases = {
          ...(previousRecovery.authoring.expectedBases ?? {}),
          generatedPassages: childBases.map(({ ref, materialRevision }) => {
            const association = associationByMaterialId.get(ref.passageMaterialId)!;
            return {
              sectionId: association.sectionId!, materialId: ref.passageMaterialId,
              snapshotVersionId: ref.snapshotVersionId, materialRevision,
            };
          }),
        };
      } else {
        const assembled = buildReadingV2TeacherSelectedPassageDocument({ composition: nextMaster, snapshots: childSnapshots });
        document = { ...assembled, documentId: document.documentId };
      }
      assertValidReadingV2CanonicalDocument(document);
      const sourceEvidence = await Promise.all((previousRecovery.authoring.sourceRefs ?? []).map(async ({ sourceId }) => {
        const raw = await adapter.read(readingV2StoragePaths.provenance(sourceId));
        if (!isRecord(raw) || raw.kind !== 'reading-v2-import-source' || raw.ownerId !== ownerId || raw.sourceId !== sourceId) {
          throw new Error('Reference update cannot load the owner-private source evidence.');
        }
        return raw as unknown as ReadingV2AuthoringSourceRecord;
      }));
      const published = publishReadingV2Material({
        repository: createReadingV2Repository(),
        materialId: readingV2Ids.materialId(master.testMaterialId),
        ownerId,
        document,
        publishedBy: ownerId,
        publishedAt,
        snapshotVersionId: versionId,
        operationId,
        expectedMaterialRevision: base.materialRevision,
        skipReadingPassageExtraction: true,
        canonicalSnapshotStorage: inlineParent ? 'private-recovery' : undefined,
        authoringContext: previousRecovery.authoring.authoringContext,
        resolvedSourceEvidence: sourceEvidence,
        workflowOrigin: previousRecovery.authoring.workflowOrigin,
        authoringMetadata: previousRecovery.authoring.metadata,
        expectedBases,
        metadata: {
          ...base.metadata,
          compositionId: master.compositionId,
          title: master.title,
        },
      });
      const planned = { ...buildReadingV2FirebasePublishUpdates(published.commitPlan, publishedAt).updates };
      planned[readingV2StoragePaths.fullTestCompositions(master.compositionId)] = nextMaster;
      planned[readingV2StoragePaths.fullTestCompositionVersions(master.compositionId, versionId)] = {
        ...nextMaster, publishedAt, publishedBy: ownerId,
      };
      addUpdates(updates, planned);
    }

    if (Object.keys(updates).length > 0) {
      await adapter.update(await prepareReadingV2PublicationUpdates(updates, adapter.read));
    }

    return { ...result, operationId, versionIds };
  },
});

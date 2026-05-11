import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2DraftRecord,
  type ReadingV2Interaction,
  type ReadingV2MaterialId,
  type ReadingV2PassageAsset,
  type ReadingV2PassageAssetId,
  type ReadingV2PassageAssetVersion,
  type ReadingV2TaskGroup,
  type ReadingV2TaskGroupId,
  type ReadingV2WhereUsedEntry,
} from '../../types/readingV2.types';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import type { createReadingV2Repository } from './readingV2Repository.service';

export interface ReadingV2PassageAssetSearchResult {
  readonly asset: ReadingV2PassageAsset;
  readonly currentVersion: ReadingV2PassageAssetVersion | null;
  readonly whereUsed: readonly ReadingV2WhereUsedEntry[];
}

export type ReadingV2RepositoryInstance = ReturnType<typeof createReadingV2Repository>;

export const searchReadingV2PassageAssets = (
  repository: ReadingV2RepositoryInstance,
  input: {
    readonly ownerId: string;
    readonly query?: string;
    readonly topic?: string;
  },
): ReadingV2PassageAssetSearchResult[] => {
  const query = input.query?.trim().toLowerCase();
  const topic = input.topic?.trim().toLowerCase();

  return Array.from(repository.store.passageAssets.values())
    .filter((asset) => asset.ownerId === input.ownerId && asset.state !== 'retired')
    .map((asset) => {
      const currentVersion =
        repository.store.passageAssetVersions.get(`${asset.passageAssetId}/${asset.currentVersionId}`) ?? null;
      return {
        asset,
        currentVersion,
        whereUsed: repository.getWhereUsedEntries(asset.passageAssetId),
      };
    })
    .filter((result) => {
      const searchable = [
        result.currentVersion?.title,
        result.currentVersion?.source,
        result.currentVersion?.topic,
        result.asset.reuseAdvisory,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (!query || searchable.includes(query)) && (!topic || result.currentVersion?.topic?.toLowerCase() === topic);
    });
};

export const selectReadingV2PassageAssetForDraft = (
  document: ReadingV2Document,
  input: {
    readonly passageAssetId: ReadingV2PassageAssetId;
    readonly version: ReadingV2PassageAssetVersion;
  },
): ReadingV2Document => {
  if (input.version.passageAssetId !== input.passageAssetId) {
    throw new Error('Reading V2 passage asset selection requires a version from the selected asset.');
  }

  const firstSectionId = document.sectionIds[0];
  const firstSection = firstSectionId ? document.sections[firstSectionId] : undefined;
  const firstStimulusId = firstSection?.stimulusIds[0];

  if (!firstSectionId || !firstSection || !firstStimulusId) {
    throw new Error('Reading V2 passage asset selection requires an existing draft stimulus slot.');
  }
  const firstStimulus = document.stimuli[firstStimulusId];

  if (!firstStimulus) {
    throw new Error('Reading V2 passage asset selection requires a valid draft stimulus slot.');
  }

  return {
    ...document,
    stimuli: {
      ...document.stimuli,
      [firstStimulusId]: {
        ...firstStimulus,
        title: input.version.title,
        content: structuredClone(input.version.content),
      },
    },
  };
};

export const writeReadingV2WhereUsedForPublish = (
  repository: ReadingV2RepositoryInstance,
  input: {
    readonly passageAssetId: ReadingV2PassageAssetId;
    readonly ownerId: string;
    readonly consumerId: string;
    readonly consumerKind: ReadingV2WhereUsedEntry['consumerKind'];
  },
): ReadingV2WhereUsedEntry =>
  repository.addWhereUsedEntry({
    passageAssetId: input.passageAssetId,
    ownerId: input.ownerId,
    consumerId: input.consumerId,
    consumerKind: input.consumerKind,
  });

export const extractReadingV2TaskGroupMaterialDraft = (
  repository: ReadingV2RepositoryInstance,
  input: {
    readonly sourceDocument: ReadingV2Document;
    readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
    readonly sourceMaterialId: ReadingV2MaterialId;
    readonly sourceSnapshotVersionId?: string;
    readonly sourcePassageAssetId: ReadingV2PassageAssetId;
    readonly sourcePassageAssetVersion: string;
    readonly newDraftId: string;
    readonly newMaterialId: ReadingV2MaterialId;
    readonly ownerId: string;
    readonly extractedBy: string;
    readonly extractedAt?: string;
  },
): ReadingV2DraftRecord => {
  const selectedTaskGroupIdSet = new Set(input.taskGroupIds);
  const nextDocumentId = readingV2Ids.documentId(`${input.sourceDocument.documentId}-extract-${input.newMaterialId}`);
  const taskGroupIdMap = new Map<string, string>();
  const interactionIdMap = new Map<string, string>();

  input.taskGroupIds.forEach((taskGroupId, index) => {
    taskGroupIdMap.set(taskGroupId, `extracted-task-group-${index + 1}-${input.newMaterialId}`);
  });

  const selectedTaskGroups = Object.values(input.sourceDocument.taskGroups).filter((taskGroup) =>
    selectedTaskGroupIdSet.has(taskGroup.taskGroupId),
  );

  selectedTaskGroups.forEach((taskGroup) => {
    taskGroup.interactionIds.forEach((interactionId, index) => {
      interactionIdMap.set(interactionId, `extracted-interaction-${index + 1}-${input.newMaterialId}`);
    });
  });

  const nextTaskGroups: Record<string, ReadingV2TaskGroup> = Object.fromEntries(
    selectedTaskGroups.map((taskGroup) => {
      const nextTaskGroupId = readingV2Ids.taskGroupId(taskGroupIdMap.get(taskGroup.taskGroupId) ?? `${taskGroup.taskGroupId}-copy`);
      return [
        nextTaskGroupId,
        {
          ...taskGroup,
          taskGroupId: nextTaskGroupId,
          importEvidenceRefs: undefined,
          interactionIds: taskGroup.interactionIds.map((interactionId) =>
            readingV2Ids.interactionId(interactionIdMap.get(interactionId) ?? `${interactionId}-copy`),
          ),
        },
      ];
    }),
  );

  const nextInteractions: Record<string, ReadingV2Interaction> = Object.fromEntries(
    selectedTaskGroups.flatMap((taskGroup) =>
      taskGroup.interactionIds.map((interactionId) => {
        const interaction = input.sourceDocument.interactions[interactionId];
        if (!interaction) {
          throw new Error(`Reading V2 extraction requires source interaction ${interactionId}.`);
        }

        const nextInteractionId = readingV2Ids.interactionId(interactionIdMap.get(interactionId) ?? `${interactionId}-copy`);
        const nextTaskGroupId = readingV2Ids.taskGroupId(taskGroupIdMap.get(taskGroup.taskGroupId) ?? `${taskGroup.taskGroupId}-copy`);
        return [
          nextInteractionId,
          {
            ...interaction,
            interactionId: nextInteractionId,
            taskGroupId: nextTaskGroupId,
          },
        ];
      }),
    ),
  );

  const firstSectionId = input.sourceDocument.sectionIds[0];
  const sourceSection = firstSectionId ? input.sourceDocument.sections[firstSectionId] : undefined;

  if (!firstSectionId || !sourceSection) {
    throw new Error('Reading V2 extraction requires a source section.');
  }

  const extractedDocument: ReadingV2Document = {
    ...input.sourceDocument,
    documentId: nextDocumentId,
    title: `${input.sourceDocument.title} extracted task-group material`,
    sections: {
      [sourceSection.sectionId]: {
        ...sourceSection,
        taskGroupIds: Object.keys(nextTaskGroups).map(readingV2Ids.taskGroupId),
      },
    },
    taskGroups: nextTaskGroups,
    interactions: nextInteractions,
    validationState: { issues: [] },
  };

  repository.createTaskGroupMaterial({
    materialId: input.newMaterialId,
    ownerId: input.ownerId,
    state: 'draft',
    primaryPassageAssetVersionId: `${input.sourcePassageAssetId}/${input.sourcePassageAssetVersion}`,
    taskGroupIds: Object.keys(nextTaskGroups).map(readingV2Ids.taskGroupId),
    provenance: {
      sourceMaterialId: input.sourceMaterialId,
      sourceSnapshotVersionId: input.sourceSnapshotVersionId,
      sourcePassageAssetId: input.sourcePassageAssetId,
      sourcePassageAssetVersion: input.sourcePassageAssetVersion,
      sourceTaskGroupIds: input.taskGroupIds,
      extractedBy: input.extractedBy,
      extractedAt: input.extractedAt ?? new Date().toISOString(),
      extractionMethod: 'manual',
    },
  });

  return repository.createDraft({
    draftId: readingV2Ids.draftId(input.newDraftId),
    ownerId: input.ownerId,
    materialId: input.newMaterialId,
    document: {
      ...extractedDocument,
      deliveryEngine: READING_V2_ENGINE,
      plane: 'canonical',
      schemaVersion: READING_V2_SCHEMA_VERSION,
    },
  });
};

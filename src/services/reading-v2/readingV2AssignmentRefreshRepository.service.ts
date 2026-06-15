import type { HomeworkAssignment, HomeworkSubmission } from '../../types/homework.types';
import type { ReadingV2FullTestComposition } from '../../types/readingV2.types';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import {
  createReadingV2MasterHomeworkSet,
  refreshReadingV2MasterAssignment,
  type ReadingV2AssignmentPayload,
} from './readingV2PassageHomework.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2AssignmentRefreshAdapter {
  readonly readRtdb: (path: string) => Promise<unknown>;
  readonly writeRtdb: (path: string, value: unknown) => Promise<void>;
  readonly deleteRtdb?: (path: string) => Promise<void>;
  readonly updateHomeworkAssignment: (
    homeworkId: string,
    patch: {
      readonly readingPassageSet: HomeworkAssignment['readingPassageSet'];
      readonly readingV2AssignmentPayloadPath: string;
      readonly updatedAt: number;
    },
  ) => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isComposition = (value: unknown): value is ReadingV2FullTestComposition =>
  isRecord(value) &&
  typeof value.compositionId === 'string' &&
  typeof value.ownerId === 'string' &&
  Array.isArray(value.passageRefs);

const isProjection = (value: unknown): value is ReadingV2DerivedProjection =>
  isRecord(value) &&
  value.deliveryEngine === 'reading-v2' &&
  value.plane === 'projection' &&
  typeof value.sourceSnapshotVersionId === 'string';

export const refreshReadingV2MasterAssignmentFromLatest = async (input: {
  readonly homework: HomeworkAssignment;
  readonly submissions: readonly HomeworkSubmission[];
  readonly adapter: ReadingV2AssignmentRefreshAdapter;
  readonly generatedAt?: string;
  readonly updatedAt?: number;
}): Promise<{
  readonly payload: ReadingV2AssignmentPayload;
  readonly passageCount: number;
}> => {
  const compositionId = input.homework.readingPassageSet?.compositionId;
  if (input.homework.materialType !== 'reading-passage-set' || !compositionId) {
    throw new Error('Reading V2 assignment refresh requires a composition-backed Reading Passage set.');
  }

  const rawComposition = await input.adapter.readRtdb(readingV2StoragePaths.fullTestCompositions(compositionId));
  if (!isComposition(rawComposition)) {
    throw new Error(`Reading V2 composition ${compositionId} was not found.`);
  }

  const homeworkSet = createReadingV2MasterHomeworkSet({
    homeworkId: input.homework.id,
    composition: rawComposition,
    frozenAt: input.generatedAt,
  });
  const projections = await Promise.all(
    homeworkSet.items.map(async (item) => {
      const path = readingV2StoragePaths.studentSafeTests(item.passageMaterialId, item.snapshotVersionId);
      const projection = await input.adapter.readRtdb(path);
      if (!isProjection(projection)) {
        throw new Error(`Missing frozen refresh source projection: ${path}`);
      }
      return projection;
    }),
  );

  const result = await refreshReadingV2MasterAssignment({
    homeworkId: input.homework.id,
    composition: rawComposition,
    homeworkSet,
    projections,
    submissions: input.submissions,
    repository: {
      writeAssignmentPayload: async (path, projection) => {
        await input.adapter.writeRtdb(path, projection);
      },
      updateHomeworkAssignment: input.adapter.updateHomeworkAssignment,
      deleteAssignmentPayload: input.adapter.deleteRtdb,
    },
    generatedAt: input.generatedAt,
    updatedAt: input.updatedAt,
  });

  return {
    payload: result.payload,
    passageCount: homeworkSet.items.length,
  };
};

import type {
  ReadingPassageHomeworkSet,
  ReadingPassageHomeworkSetItem,
  ReadingPassageHomeworkSnapshot,
} from '../../types/homework.types';
import type { MaterialTestTypeId } from '../../types/materialCatalog.types';
import type { ReadingV2FullTestComposition } from '../../types/readingV2.types';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import { composeReadingPassageSetProjection } from './readingV2PassageHomeworkLaunch.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import {
  assertReadingV2MasterHasNoBrokenRefs,
  getReadingV2BrokenReferenceSummaryFromComposition,
  type ReadingV2BrokenRefReason,
} from './readingV2BrokenReference.service';

export interface ReadingPassageHomeworkCandidate {
  readonly materialId: string;
  readonly title: string;
  readonly questionCount: number;
  readonly testTypeIds: readonly MaterialTestTypeId[] | readonly string[];
  readonly publishedSnapshotVersionId?: string;
  readonly sourceOrderDisplay?: string;
  readonly sourceFullTestTitle?: string;
  readonly hasStudentSafeProjection?: boolean;
  readonly accessible?: boolean;
  readonly archived?: boolean;
}

const requireAssignableReadingPassage = (
  candidate: ReadingPassageHomeworkCandidate,
): string => {
  const snapshotVersionId = candidate.publishedSnapshotVersionId?.trim();

  if (!snapshotVersionId) {
    throw new Error(`Reading Passage ${candidate.materialId} requires a published snapshot before assignment.`);
  }

  if (candidate.archived === true) {
    throw new Error(`Reading Passage ${candidate.materialId} is archived and cannot be assigned.`);
  }

  if (candidate.accessible === false) {
    throw new Error(`Reading Passage ${candidate.materialId} is inaccessible and cannot be assigned.`);
  }

  if (candidate.hasStudentSafeProjection === false) {
    throw new Error(`Reading Passage ${candidate.materialId} is missing a student-safe projection.`);
  }

  return snapshotVersionId;
};

export const createReadingPassageHomeworkSnapshot = (
  candidate: ReadingPassageHomeworkCandidate,
): ReadingPassageHomeworkSnapshot => {
  const snapshotVersionId = requireAssignableReadingPassage(candidate);

  return {
    passageMaterialId: candidate.materialId,
    snapshotVersionId,
    titleSnapshot: candidate.title,
    questionCount: candidate.questionCount,
    testTypeIds: [...candidate.testTypeIds],
    sourceOrderDisplay: candidate.sourceOrderDisplay,
    sourceFullTestTitle: candidate.sourceFullTestTitle,
  };
};

export const createReadingPassageSetHomework = (
  candidates: readonly ReadingPassageHomeworkCandidate[],
  title = 'Reading Passage set',
): ReadingPassageHomeworkSet => {
  if (candidates.length === 0) {
    throw new Error('Reading Passage set requires at least one selected passage.');
  }

  const items: ReadingPassageHomeworkSetItem[] = candidates.map((candidate, index) => ({
    ...createReadingPassageHomeworkSnapshot(candidate),
    order: index + 1,
  }));

  return {
    titleSnapshot: title,
    items,
  };
};

export interface ReadingV2MasterHomeworkSetInput {
  readonly homeworkId: string;
  readonly composition: ReadingV2FullTestComposition & {
    readonly state?: string;
    readonly hasBrokenRefs?: boolean;
    readonly brokenRefCount?: number;
    readonly brokenRefReasons?: readonly ReadingV2BrokenRefReason[];
  };
  readonly frozenAt?: string;
}

export interface ReadingV2AssignmentPayload {
  readonly path: string;
  readonly projection: ReadingV2DerivedProjection & {
    readonly assignmentManifest: {
      readonly homeworkId: string;
      readonly compositionId: string;
      readonly compositionVersionId: string;
      readonly frozenAt: string;
      readonly passageRefs: readonly {
        readonly passageMaterialId: string;
        readonly snapshotVersionId: string;
        readonly order: number;
      }[];
    };
  };
}

export interface ReadingV2HomeworkSubmissionStartRecord {
  readonly id?: string;
  readonly submissionId?: string;
  readonly status?: string;
  readonly startedAt?: number | string | null;
}

export interface ReadingV2AssignmentRefreshRepository {
  readonly writeAssignmentPayload: (
    path: string,
    projection: ReadingV2AssignmentPayload['projection'],
  ) => Promise<void>;
  readonly updateHomeworkAssignment: (
    homeworkId: string,
    patch: {
      readonly readingPassageSet: ReadingPassageHomeworkSet;
      readonly readingV2AssignmentPayloadPath: string;
      readonly updatedAt: number;
    },
  ) => Promise<void>;
  readonly deleteAssignmentPayload?: (path: string) => Promise<void>;
}

export const createReadingV2MasterHomeworkSet = (
  input: ReadingV2MasterHomeworkSetInput,
): ReadingPassageHomeworkSet => {
  const state = String(input.composition.state ?? 'published').trim().toLowerCase();
  if (state === 'removed' || state === 'archived') {
    throw new Error(`Reading V2 master ${input.composition.compositionId} is ${state} and cannot be assigned.`);
  }
  assertReadingV2MasterHasNoBrokenRefs(
    getReadingV2BrokenReferenceSummaryFromComposition(input.composition),
  );

  const items = [...input.composition.passageRefs]
    .sort((left, right) => left.order - right.order)
    .map((ref): ReadingPassageHomeworkSetItem => ({
      passageMaterialId: ref.passageMaterialId,
      snapshotVersionId: ref.snapshotVersionId,
      titleSnapshot: ref.titleSnapshot || ref.title,
      questionCount: ref.questionCountSnapshot || ref.questionCount,
      testTypeIds: [...ref.testTypeIdsSnapshot],
      sourceOrderDisplay: ref.sourceOrderDisplaySnapshot || ref.source?.sourceOrderDisplay,
      sourceFullTestTitle: ref.source?.sourceFullTestTitle,
      order: ref.order,
    }));

  if (items.length === 0) {
    throw new Error('Reading V2 master homework requires at least one passage reference.');
  }

  return {
    titleSnapshot: input.composition.title,
    items,
    compositionId: input.composition.compositionId,
    compositionVersionId: input.composition.publishedVersionId,
    assignmentPayloadPath: readingV2StoragePaths.assignmentPayloads(
      input.homeworkId,
      input.composition.publishedVersionId,
    ),
    assignmentPayloadKey: `${input.homeworkId}:${input.composition.publishedVersionId}`,
    frozenAt: input.frozenAt,
  };
};

export const createReadingV2AssignmentPayload = (input: {
  readonly homeworkId: string;
  readonly composition: ReadingV2FullTestComposition;
  readonly homeworkSet: ReadingPassageHomeworkSet;
  readonly projections: readonly ReadingV2DerivedProjection[];
  readonly generatedAt?: string;
}): ReadingV2AssignmentPayload => {
  const frozenAt = input.generatedAt ?? new Date().toISOString();
  const path = input.homeworkSet.assignmentPayloadPath ??
    readingV2StoragePaths.assignmentPayloads(input.homeworkId, input.composition.publishedVersionId);
  const projection = composeReadingPassageSetProjection({
    homework: {
      id: input.homeworkId,
      materialId: input.composition.testMaterialId,
      materialType: 'reading-passage-set',
      readingPassageSet: {
        ...input.homeworkSet,
        assignmentPayloadPath: path,
        compositionId: input.composition.compositionId,
        compositionVersionId: input.composition.publishedVersionId,
        frozenAt,
      },
    },
    projections: input.projections,
    generatedAt: frozenAt,
  });

  return {
    path,
    projection: {
      ...projection,
      assignmentManifest: {
        homeworkId: input.homeworkId,
        compositionId: input.composition.compositionId,
        compositionVersionId: input.composition.publishedVersionId,
        frozenAt,
        passageRefs: input.homeworkSet.items.map((item) => ({
          passageMaterialId: item.passageMaterialId,
          snapshotVersionId: item.snapshotVersionId,
          order: item.order,
        })),
      },
    },
  };
};

const hasStartedSubmission = (submission: ReadingV2HomeworkSubmissionStartRecord): boolean => {
  if (typeof submission.startedAt === 'number' && Number.isFinite(submission.startedAt)) {
    return true;
  }

  if (typeof submission.startedAt === 'string' && submission.startedAt.trim()) {
    return true;
  }

  const status = String(submission.status ?? 'not_started').trim();
  return Boolean(status && status !== 'not_started');
};

export const assertReadingV2AssignmentCanRefresh = (
  submissions: readonly ReadingV2HomeworkSubmissionStartRecord[],
): void => {
  const startedSubmission = submissions.find(hasStartedSubmission);

  if (startedSubmission) {
    throw new Error(
      `Reading V2 assignment cannot refresh because submission ${startedSubmission.id ?? startedSubmission.submissionId ?? 'unknown'} already started.`,
    );
  }
};

export const refreshReadingV2MasterAssignment = async (input: {
  readonly homeworkId: string;
  readonly composition: ReadingV2FullTestComposition;
  readonly homeworkSet: ReadingPassageHomeworkSet;
  readonly projections: readonly ReadingV2DerivedProjection[];
  readonly submissions: readonly ReadingV2HomeworkSubmissionStartRecord[];
  readonly repository: ReadingV2AssignmentRefreshRepository;
  readonly generatedAt?: string;
  readonly updatedAt?: number;
}): Promise<{
  readonly payload: ReadingV2AssignmentPayload;
  readonly homeworkPatch: {
    readonly readingPassageSet: ReadingPassageHomeworkSet;
    readonly readingV2AssignmentPayloadPath: string;
    readonly updatedAt: number;
  };
}> => {
  assertReadingV2AssignmentCanRefresh(input.submissions);

  const payload = createReadingV2AssignmentPayload({
    homeworkId: input.homeworkId,
    composition: input.composition,
    homeworkSet: input.homeworkSet,
    projections: input.projections,
    generatedAt: input.generatedAt,
  });
  const homeworkPatch = {
    readingPassageSet: {
      ...input.homeworkSet,
      assignmentPayloadPath: payload.path,
      compositionId: input.composition.compositionId,
      compositionVersionId: input.composition.publishedVersionId,
      frozenAt: payload.projection.assignmentManifest.frozenAt,
    },
    readingV2AssignmentPayloadPath: payload.path,
    updatedAt: input.updatedAt ?? Date.now(),
  };

  await input.repository.writeAssignmentPayload(payload.path, payload.projection);
  try {
    await input.repository.updateHomeworkAssignment(input.homeworkId, homeworkPatch);
  } catch (error) {
    await input.repository.deleteAssignmentPayload?.(payload.path);
    throw error;
  }

  return { payload, homeworkPatch };
};

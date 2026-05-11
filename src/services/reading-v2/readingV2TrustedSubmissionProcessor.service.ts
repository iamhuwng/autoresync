// Reading V2 trusted submission boundary: canonical snapshots and answer keys stay behind this processor.
// Browser runtime callers should send only projection-bound answer payloads to a trusted endpoint.
import type { TestResultRecord } from '../testResults.service';
import {
  readingV2Ids,
  type ReadingV2AttemptContext,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SnapshotVersionId,
} from '../../types/readingV2.types';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import {
  buildReadingV2GroupedReviewPayload,
  buildReadingV2ResultPersistencePlan,
  buildReadingV2SavedResultRecord,
  captureReadingV2Attempt,
  scoreReadingV2Attempt,
  type ReadingV2GroupedReviewPayload,
  type ReadingV2ResultPersistencePlan,
  type ReadingV2SubmittedAnswerValue,
} from './readingV2ResultAdapter.service';

export interface ReadingV2TrustedRuntimeSubmitAnswer {
  readonly interactionId: string;
  readonly taskGroupId: string;
  readonly visibleNumber?: number;
  readonly displayNumber?: number;
  readonly value: ReadingV2SubmittedAnswerValue;
}

export interface ReadingV2TrustedRuntimeSubmitPayload {
  readonly projectionId: string;
  readonly sourceSnapshotVersionId: string;
  readonly materialId?: string;
  readonly answers: readonly ReadingV2TrustedRuntimeSubmitAnswer[];
}

export interface ReadingV2TrustedSubmissionContext {
  readonly studentId: string;
  readonly studentName: string;
  readonly resultId: string;
  readonly attemptId: string;
  readonly mode: ReadingV2AttemptContext['mode'];
  readonly materialId?: string;
  readonly ownerId?: string;
  readonly sessionCode?: string;
  readonly homeworkId?: string;
  readonly courseId?: string;
  readonly classId?: string;
  readonly assignmentId?: string;
  readonly sourceName?: string;
  readonly submittedAt?: string;
  readonly timeElapsed?: number;
  readonly testDuration?: number;
  readonly teacherId?: string;
  readonly visibility?: TestResultRecord['visibility'];
  readonly courseName?: string | null;
  readonly className?: string | null;
  readonly moduleId?: string | null;
  readonly moduleName?: string | null;
}

export interface ReadingV2TrustedSubmissionDependencies {
  readonly loadPublishedSnapshot: (input: {
    readonly materialId: ReadingV2MaterialId;
    readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  }) => ReadingV2PublishedSnapshot | null | Promise<ReadingV2PublishedSnapshot | null>;
  readonly loadReviewProjection: (input: {
    readonly materialId: ReadingV2MaterialId;
    readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  }) => ReadingV2DerivedProjection | null | Promise<ReadingV2DerivedProjection | null>;
  readonly persistPlan: (plan: ReadingV2ResultPersistencePlan) => void | Promise<void>;
}

export interface ReadingV2TrustedPlanPersistenceWriter {
  readonly set: (path: string, value: unknown) => void | Promise<void>;
  readonly update: (updates: Record<string, unknown>) => void | Promise<void>;
}

export interface ReadingV2TrustedSubmissionResult {
  readonly attemptId: string;
  readonly resultId: string;
  readonly totalScore: number;
  readonly maxScore: number;
  readonly percentage: number;
  readonly savedResult: TestResultRecord;
  readonly reviewPayload: ReadingV2GroupedReviewPayload;
  readonly persistencePlan: ReadingV2ResultPersistencePlan;
}

export const persistReadingV2ResultPlanCanonicalFirst = async (
  plan: ReadingV2ResultPersistencePlan,
  writer: ReadingV2TrustedPlanPersistenceWriter,
): Promise<void> => {
  const canonicalResultOperation = plan.operations.find((operation) =>
    operation.key.startsWith('existing-result:'),
  );

  if (!canonicalResultOperation) {
    throw new Error('Reading V2 result persistence plan is missing the canonical existing result write.');
  }

  await writer.set(canonicalResultOperation.path, canonicalResultOperation.value);

  const secondaryUpdates = Object.fromEntries(
    plan.operations
      .filter((operation) => operation !== canonicalResultOperation)
      .map((operation) => [operation.path, operation.value]),
  );

  if (Object.keys(secondaryUpdates).length > 0) {
    await writer.update(secondaryUpdates);
  }
};

const materialIdFromSubmission = (
  payload: ReadingV2TrustedRuntimeSubmitPayload,
  context: ReadingV2TrustedSubmissionContext,
): ReadingV2MaterialId => readingV2Ids.materialId(String(context.materialId ?? payload.materialId ?? ''));

const snapshotVersionFromPayload = (
  payload: ReadingV2TrustedRuntimeSubmitPayload,
): ReadingV2SnapshotVersionId => readingV2Ids.snapshotVersionId(payload.sourceSnapshotVersionId);

const normalizeAnswers = (
  answers: readonly ReadingV2TrustedRuntimeSubmitAnswer[],
) => answers.map((answer) => {
  const displayNumber = answer.displayNumber ?? answer.visibleNumber;

  if (typeof displayNumber !== 'number' || !Number.isFinite(displayNumber)) {
    throw new Error(`Reading V2 submission is missing a display number for interaction ${answer.interactionId}.`);
  }

  return {
    interactionId: answer.interactionId,
    taskGroupId: answer.taskGroupId,
    displayNumber: Number(displayNumber),
    value: answer.value,
  };
});

const assertTrustedBindings = (input: {
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly snapshot: ReadingV2PublishedSnapshot;
  readonly reviewProjection: ReadingV2DerivedProjection;
  readonly requestedOwnerId?: string;
}): void => {
  if (input.snapshot.materialId !== input.materialId) {
    throw new Error('Reading V2 submission material binding does not match the published snapshot.');
  }

  if (input.snapshot.snapshotVersionId !== input.snapshotVersionId) {
    throw new Error('Reading V2 submission snapshot binding does not match the published snapshot.');
  }

  if (input.requestedOwnerId && input.requestedOwnerId !== input.snapshot.ownerId) {
    throw new Error('Reading V2 submission owner binding does not match the published snapshot.');
  }

  if (input.reviewProjection.projectionKind !== 'review') {
    throw new Error('Reading V2 trusted submission requires a review projection.');
  }

  if (input.reviewProjection.sourceSnapshotVersionId !== input.snapshotVersionId) {
    throw new Error('Reading V2 review projection binding does not match the submitted snapshot.');
  }
};

export const processReadingV2TrustedSubmission = async (input: {
  readonly payload: ReadingV2TrustedRuntimeSubmitPayload;
  readonly context: ReadingV2TrustedSubmissionContext;
  readonly dependencies: ReadingV2TrustedSubmissionDependencies;
}): Promise<ReadingV2TrustedSubmissionResult> => {
  const materialId = materialIdFromSubmission(input.payload, input.context);
  const snapshotVersionId = snapshotVersionFromPayload(input.payload);
  const [snapshot, reviewProjection] = await Promise.all([
    input.dependencies.loadPublishedSnapshot({ materialId, snapshotVersionId }),
    input.dependencies.loadReviewProjection({ materialId, snapshotVersionId }),
  ]);

  if (!snapshot) {
    throw new Error('Reading V2 trusted submission could not load the published snapshot.');
  }

  if (!reviewProjection) {
    throw new Error('Reading V2 trusted submission could not load the review projection.');
  }

  assertTrustedBindings({
    materialId,
    snapshotVersionId,
    snapshot,
    reviewProjection,
    requestedOwnerId: input.context.ownerId,
  });

  const attempt = captureReadingV2Attempt({
    attemptId: input.context.attemptId,
    studentId: input.context.studentId,
    submitPayload: {
      projectionId: input.payload.projectionId,
      sourceSnapshotVersionId: snapshotVersionId,
      materialId,
      answers: normalizeAnswers(input.payload.answers),
    },
    context: {
      mode: input.context.mode,
      sessionCode: input.context.sessionCode,
      homeworkId: input.context.homeworkId,
      courseId: input.context.courseId,
      classId: input.context.classId,
      assignmentId: input.context.assignmentId,
      sourceName: input.context.sourceName ?? reviewProjection.content.title,
      materialId,
    },
  });
  const result = scoreReadingV2Attempt({
    resultId: input.context.resultId,
    testId: materialId,
    studentId: input.context.studentId,
    ownerId: snapshot.ownerId,
    attempt,
    snapshot,
    projection: reviewProjection,
    submittedAt: input.context.submittedAt,
  });
  const reviewPayload = buildReadingV2GroupedReviewPayload({
    result,
    projection: reviewProjection,
  });
  const savedResult = buildReadingV2SavedResultRecord({
    result,
    reviewPayload,
    studentName: input.context.studentName,
    testTitle: reviewProjection.content.title,
    sessionCode: input.context.sessionCode,
    timeElapsed: input.context.timeElapsed,
    testDuration: input.context.testDuration,
    teacherId: input.context.teacherId ?? snapshot.ownerId,
    visibility: input.context.visibility,
    courseId: input.context.courseId,
    courseName: input.context.courseName,
    classId: input.context.classId,
    className: input.context.className,
    moduleId: input.context.moduleId,
    moduleName: input.context.moduleName,
  });
  const persistencePlan = buildReadingV2ResultPersistencePlan({
    attempt,
    result,
    savedResult,
    reviewPayload,
  });

  await input.dependencies.persistPlan(persistencePlan);

  return {
    attemptId: attempt.attemptId,
    resultId: result.resultId,
    totalScore: savedResult.totalScore,
    maxScore: savedResult.maxScore,
    percentage: savedResult.percentage,
    savedResult,
    reviewPayload,
    persistencePlan,
  };
};

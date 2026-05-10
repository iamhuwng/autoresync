import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import type { TestResultRecord } from '../testResults.service';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Attempt,
  type ReadingV2AttemptContext,
  type ReadingV2Interaction,
  type ReadingV2PublishedSnapshot,
  type ReadingV2RegradeArtifact,
  type ReadingV2Result,
  type ReadingV2ResultId,
  type ReadingV2ResultInteraction,
} from '../../types/readingV2.types';
import type {
  ReadingV2DerivedProjection,
  ReadingV2ProjectedStimulus,
  ReadingV2ProjectedTaskGroup,
} from './readingV2Projection.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export type ReadingV2SubmittedAnswerValue = string | readonly string[];

export interface ReadingV2SubmittedAnswerRecord {
  readonly interactionId: string;
  readonly taskGroupId: string;
  readonly displayNumber: number;
  readonly value: ReadingV2SubmittedAnswerValue;
}

export interface ReadingV2RuntimeSubmitSnapshot {
  readonly projectionId: string;
  readonly sourceSnapshotVersionId?: string;
  readonly materialId?: string;
  readonly answers: readonly ReadingV2SubmittedAnswerRecord[];
}

export type ReadingV2ResultOperationalState =
  | 'loading'
  | 'empty'
  | 'missing-result'
  | 'permission-denied'
  | 'release-policy-blocked'
  | 'adapter-failure'
  | 'feedback-save-failure'
  | 'regrade-conflict'
  | 'regrade-success'
  | 'regrade-failure';

export const READING_V2_RESULT_OPERATIONAL_STATES: Readonly<
  Record<ReadingV2ResultOperationalState, { readonly title: string; readonly message: string }>
> = {
  loading: {
    title: 'Loading result',
    message: 'The existing result shell is loading the Reading V2 saved result.',
  },
  empty: {
    title: 'No Reading V2 review content',
    message: 'The result record exists, but no grouped Reading V2 review payload is available.',
  },
  'missing-result': {
    title: 'Result unavailable',
    message: 'The Reading V2 result could not be found in the existing result store.',
  },
  'permission-denied': {
    title: 'Access revoked',
    message: 'The viewer no longer has permission to open this Reading V2 result.',
  },
  'release-policy-blocked': {
    title: 'Review locked',
    message: 'Release policy is hiding answer keys and explanations for this Reading V2 result.',
  },
  'adapter-failure': {
    title: 'Review unavailable',
    message: 'The Reading V2 review adapter could not render this saved result safely.',
  },
  'feedback-save-failure': {
    title: 'Feedback not saved',
    message: 'The existing feedback shell could not save feedback for this Reading V2 result.',
  },
  'regrade-conflict': {
    title: 'Regrade conflict',
    message: 'A newer Reading V2 result artifact exists. Reload before regrading.',
  },
  'regrade-success': {
    title: 'Regrade saved',
    message: 'A new Reading V2 regrade artifact was created without changing historical result truth.',
  },
  'regrade-failure': {
    title: 'Regrade failed',
    message: 'The Reading V2 regrade artifact could not be created.',
  },
};

export interface ReadingV2AttemptCaptureInput {
  readonly attemptId: string;
  readonly studentId: string;
  readonly submitPayload: ReadingV2RuntimeSubmitSnapshot;
  readonly context: ReadingV2AttemptContext;
}

export interface ReadingV2ReviewInteraction {
  readonly interactionId: string;
  readonly taskGroupId: string;
  readonly displayNumber: number;
  readonly taskFamily: string;
  readonly officialTaskType: string;
  readonly studentAnswer: unknown;
  readonly correctAnswer?: unknown;
  readonly score: number;
  readonly maxScore: number;
  readonly reviewState: 'pending' | 'released' | 'withheld';
  readonly anchorRef?: string;
}

export interface ReadingV2ReviewStimulusContext {
  readonly stimulusId: string;
  readonly title?: string;
  readonly kind: string;
  readonly anchorLabels: readonly string[];
  readonly excerpt: string;
}

export interface ReadingV2ReviewTaskGroup {
  readonly taskGroupId: string;
  readonly title?: string;
  readonly officialTaskType: string;
  readonly engineeringFamily: string;
  readonly instructionText: string;
  readonly stimulusContext: readonly ReadingV2ReviewStimulusContext[];
  readonly interactions: readonly ReadingV2ReviewInteraction[];
}

export interface ReadingV2GroupedReviewPayload {
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly schemaVersion: typeof READING_V2_SCHEMA_VERSION;
  readonly resultId: string;
  readonly sourceSnapshotVersionId: string;
  readonly materialId?: string;
  readonly title: string;
  readonly taskGroups: readonly ReadingV2ReviewTaskGroup[];
}

export interface ReadingV2ReleasePolicy {
  readonly showScore: boolean;
  readonly showCorrectAnswers: boolean;
  readonly showExplanations: boolean;
  readonly showFeedback: boolean;
}

export interface ReadingV2ResultPersistencePlan {
  readonly operations: readonly {
    readonly key: string;
    readonly path: string;
    readonly value: unknown;
  }[];
}

export interface ReadingV2RegradePersistencePlan {
  readonly operations: readonly {
    readonly key: string;
    readonly path: string;
    readonly value: unknown;
  }[];
}

export const isReadingV2SavedResult = (result: unknown): result is TestResultRecord & {
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly readingV2: {
    readonly result: ReadingV2Result;
    readonly reviewPayload?: ReadingV2GroupedReviewPayload;
    readonly regradeArtifacts?: readonly ReadingV2RegradeArtifact[];
  };
} => {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const record = result as { deliveryEngine?: unknown; readingV2?: unknown };
  return record.deliveryEngine === READING_V2_ENGINE
    && Boolean(record.readingV2)
    && typeof record.readingV2 === 'object';
};

const clone = <T>(value: T): T => structuredClone(value) as T;

const rtdbSafeValue = <T>(value: T): T => {
  if (value === undefined) {
    return null as T;
  }

  if (value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rtdbSafeValue(entry)) as T;
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        rtdbSafeValue(entry),
      ]),
    ) as T;
  }

  return value;
};

const persistenceValue = <T>(value: T): T => rtdbSafeValue(clone(value));

const normalizeText = (value: unknown, options: {
  readonly caseSensitive?: boolean;
  readonly punctuationSensitive?: boolean;
}): string => {
  const joined = Array.isArray(value) ? value.join('|') : String(value ?? '');
  const cased = options.caseSensitive ? joined : joined.toLowerCase();
  const punctuated = options.punctuationSensitive ? cased : cased.replace(/[^\p{L}\p{N}\s|]/gu, '');
  return punctuated.replace(/\s+/g, ' ').trim();
};

const normalizeAnswerItems = (
  value: unknown,
  options: {
    readonly caseSensitive?: boolean;
    readonly punctuationSensitive?: boolean;
  },
): string[] => (Array.isArray(value) ? value : [value]).map((entry) => normalizeText(entry, options));

const answerListsMatch = (
  studentItems: readonly string[],
  expectedItems: readonly string[],
  orderMatters: boolean,
): boolean => {
  if (studentItems.length !== expectedItems.length) {
    return false;
  }

  const left = orderMatters ? [...studentItems] : [...studentItems].sort();
  const right = orderMatters ? [...expectedItems] : [...expectedItems].sort();
  return left.every((entry, index) => entry === right[index]);
};

const answerMatches = (studentAnswer: unknown, interaction: ReadingV2Interaction): boolean => {
  const acceptableAnswers = interaction.scoringRule.acceptableAnswers ?? [];
  if (acceptableAnswers.length === 0) {
    return false;
  }

  if (Array.isArray(studentAnswer) || interaction.responseShape.kind === 'multi-select') {
    return answerListsMatch(
      normalizeAnswerItems(studentAnswer, interaction.scoringRule),
      normalizeAnswerItems(acceptableAnswers, interaction.scoringRule),
      interaction.scoringRule.orderMatters !== false,
    );
  }

  const normalizedStudent = normalizeText(studentAnswer, interaction.scoringRule);
  return acceptableAnswers.some(
    (answer) => normalizeText(answer, interaction.scoringRule) === normalizedStudent,
  );
};

const answerMapFromRuntime = (
  answers: readonly ReadingV2SubmittedAnswerRecord[],
): Readonly<Record<string, ReadingV2SubmittedAnswerRecord>> =>
  Object.fromEntries(answers.map((answer) => [answer.interactionId, answer]));

const findProjectedTaskGroup = (
  projection: ReadingV2DerivedProjection,
  interactionId: string,
): ReadingV2ProjectedTaskGroup | undefined =>
  projection.content.taskGroups.find((taskGroup) =>
    taskGroup.interactions.some((interaction) => interaction.interactionId === interactionId),
  );

const correctAnswerForInteraction = (interaction: ReadingV2Interaction): unknown => {
  const acceptableAnswers = interaction.scoringRule.acceptableAnswers ?? [];
  return interaction.scoringRule.orderMatters === false ? [...acceptableAnswers] : acceptableAnswers[0] ?? '';
};

const truncateContext = (value: string, maxLength = 220): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
};

const stimulusExcerpt = (
  stimulus: ReadingV2ProjectedStimulus,
  anchorIds: readonly string[],
): string => {
  const content = stimulus.content;
  const selectedAnchorIds = new Set(anchorIds);

  if (content.kind === 'passage-content') {
    const paragraphs = selectedAnchorIds.size > 0
      ? content.paragraphs.filter((paragraph) => paragraph.anchorId && selectedAnchorIds.has(paragraph.anchorId))
      : content.paragraphs.slice(0, 2);
    return truncateContext(paragraphs.map((paragraph) => paragraph.text).join(' '));
  }

  if (content.kind === 'table-content') {
    const cells = content.rows
      .flat()
      .filter((cell) => selectedAnchorIds.size === 0 || (cell.anchorId && selectedAnchorIds.has(cell.anchorId)))
      .map((cell) => cell.text)
      .filter(Boolean);
    return truncateContext(cells.join(' | '));
  }

  if (content.kind === 'flowchart-content') {
    const steps = content.steps
      .filter((step) => selectedAnchorIds.size === 0 || (step.anchorId && selectedAnchorIds.has(step.anchorId)))
      .map((step) => step.text);
    return truncateContext(steps.join(' -> '));
  }

  if (content.kind === 'diagram-content') {
    const labels = content.hotspots
      .filter((hotspot) => selectedAnchorIds.size === 0 || (hotspot.anchorId && selectedAnchorIds.has(hotspot.anchorId)))
      .map((hotspot) => hotspot.label);
    return truncateContext([content.imageAlt, ...labels].filter(Boolean).join(' | '));
  }

  return truncateContext(content.alt);
};

const stimulusContextForTaskGroup = (
  projection: ReadingV2DerivedProjection,
  taskGroup: ReadingV2ProjectedTaskGroup,
): ReadingV2ReviewStimulusContext[] =>
  taskGroup.stimulusRefs.map((stimulusRef) => {
    const stimulus = projection.content.stimuli.find(
      (candidate) => candidate.stimulusId === stimulusRef.stimulusId,
    );

    if (!stimulus) {
      throw new Error(`Reading V2 review projection is missing stimulus ${stimulusRef.stimulusId}.`);
    }

    const anchorIds = stimulusRef.anchorIds ?? [];
    const anchorLabels = projection.content.anchors
      .filter((anchor) => anchor.stimulusId === stimulusRef.stimulusId)
      .filter((anchor) => anchorIds.length === 0 || anchorIds.includes(anchor.anchorId))
      .map((anchor) => anchor.label ?? anchor.anchorId);

    return {
      stimulusId: stimulus.stimulusId,
      title: stimulus.title,
      kind: stimulus.kind,
      anchorLabels,
      excerpt: stimulusExcerpt(stimulus, anchorIds),
    };
  });

export const captureReadingV2Attempt = (
  input: ReadingV2AttemptCaptureInput,
): ReadingV2Attempt => {
  const payload = input.submitPayload;
  const sourceSnapshotVersionId = payload.sourceSnapshotVersionId
    ?? payload.projectionId
    ?? input.context.materialId
    ?? 'unknown-snapshot';

  return {
    attemptId: readingV2Ids.attemptId(input.attemptId),
    studentId: input.studentId,
    sourceSnapshotVersionId: readingV2Ids.snapshotVersionId(String(sourceSnapshotVersionId)),
    context: {
      ...input.context,
      materialId: input.context.materialId ?? (payload.materialId ? readingV2Ids.materialId(String(payload.materialId)) : undefined),
    },
    answers: Object.fromEntries(
      payload.answers.map((answer) => [
        answer.interactionId,
        {
          taskGroupId: answer.taskGroupId,
          visibleNumber: answer.displayNumber,
          value: clone(answer.value),
        },
      ]),
    ),
  };
};

export const scoreReadingV2Attempt = (input: {
  readonly resultId: ReadingV2ResultId | string;
  readonly testId: string;
  readonly studentId: string;
  readonly ownerId: string;
  readonly attempt: ReadingV2Attempt;
  readonly snapshot: ReadingV2PublishedSnapshot;
  readonly projection: ReadingV2DerivedProjection;
  readonly submittedAt?: string;
}): ReadingV2Result => {
  if (input.attempt.sourceSnapshotVersionId !== input.snapshot.snapshotVersionId) {
    throw new Error('Reading V2 attempt snapshot binding does not match the published snapshot.');
  }
  if (input.projection.sourceSnapshotVersionId !== input.snapshot.snapshotVersionId) {
    throw new Error('Reading V2 review projection binding does not match the published snapshot.');
  }

  const runtimeAnswers = answerMapFromRuntime(
    Object.entries(input.attempt.answers).map(([interactionId, record]) => {
      const value = (record as { value?: unknown }).value;
      const taskGroupId = (record as { taskGroupId?: string }).taskGroupId ?? '';
      const visibleNumber = Number((record as { visibleNumber?: number }).visibleNumber ?? 0);
      return {
        interactionId,
        taskGroupId,
        displayNumber: visibleNumber,
        value: value as ReadingV2SubmittedAnswerRecord['value'],
      };
    }),
  );

  const interactions: ReadingV2ResultInteraction[] = Object.values(input.snapshot.document.interactions)
    .map((interaction) => {
      const taskGroup = input.snapshot.document.taskGroups[interaction.taskGroupId];
      if (!taskGroup) {
        throw new Error(`Reading V2 result cannot score missing task group ${interaction.taskGroupId}.`);
      }

      const answer = runtimeAnswers[interaction.interactionId];
      const projectedGroup = findProjectedTaskGroup(input.projection, interaction.interactionId);
      const projectedInteraction = projectedGroup?.interactions.find(
        (candidate) => candidate.interactionId === interaction.interactionId,
      );
      const score = answerMatches(answer?.value, interaction) ? interaction.scoringRule.maxScore : 0;

      return {
        interactionId: interaction.interactionId,
        taskGroupId: interaction.taskGroupId,
        displayNumber: projectedInteraction?.displayNumber ?? answer?.displayNumber ?? 0,
        taskFamily: taskGroup.engineeringFamily,
        officialTaskType: taskGroup.officialTaskType,
        studentAnswer: answer?.value ?? '',
        scoredAnswer: correctAnswerForInteraction(interaction),
        score,
        maxScore: interaction.scoringRule.maxScore,
        reviewState: 'released',
        anchorRef: interaction.primaryAnchorId,
      };
    });

  return {
    resultId: typeof input.resultId === 'string'
      ? readingV2Ids.resultId(input.resultId)
      : input.resultId,
    testId: input.testId,
    studentId: input.studentId,
    ownerId: input.ownerId,
    deliveryEngine: READING_V2_ENGINE,
    publishedSnapshotVersion: input.snapshot.snapshotVersionId,
    attemptContext: input.attempt.context,
    submittedAt: input.submittedAt ?? new Date().toISOString(),
    interactions,
  };
};

export const buildReadingV2GroupedReviewPayload = (input: {
  readonly result: ReadingV2Result;
  readonly projection: ReadingV2DerivedProjection;
}): ReadingV2GroupedReviewPayload => {
  if (input.projection.sourceSnapshotVersionId !== input.result.publishedSnapshotVersion) {
    throw new Error('Reading V2 review projection binding does not match the saved result snapshot.');
  }

  return {
    deliveryEngine: READING_V2_ENGINE,
    schemaVersion: READING_V2_SCHEMA_VERSION,
    resultId: input.result.resultId,
    sourceSnapshotVersionId: input.result.publishedSnapshotVersion,
    materialId: input.projection.materialId,
    title: input.projection.content.title,
    taskGroups: input.projection.content.taskGroups.map((taskGroup) => ({
      taskGroupId: taskGroup.taskGroupId,
      title: taskGroup.groupTitle,
      officialTaskType: taskGroup.officialTaskType,
      engineeringFamily: taskGroup.engineeringFamily,
      instructionText: taskGroup.instructionBlocks.map((block) => block.text).join('\n'),
      stimulusContext: stimulusContextForTaskGroup(input.projection, taskGroup),
      interactions: taskGroup.interactions.map((interaction) => {
        const resultInteraction = input.result.interactions.find(
          (candidate) => candidate.interactionId === interaction.interactionId,
        );

        if (!resultInteraction) {
          throw new Error(`Reading V2 result is missing interaction ${interaction.interactionId}.`);
        }

        return {
          interactionId: resultInteraction.interactionId,
          taskGroupId: resultInteraction.taskGroupId,
          displayNumber: resultInteraction.displayNumber,
          taskFamily: resultInteraction.taskFamily,
          officialTaskType: resultInteraction.officialTaskType,
          studentAnswer: clone(resultInteraction.studentAnswer),
          correctAnswer: clone(resultInteraction.scoredAnswer),
          score: resultInteraction.score,
          maxScore: resultInteraction.maxScore,
          reviewState: resultInteraction.reviewState,
          anchorRef: resultInteraction.anchorRef,
        };
      }),
    })),
  };
};

const resultContextTypeForAttempt = (
  mode: ReadingV2AttemptContext['mode'],
): NonNullable<TestResultRecord['context']>['type'] => {
  if (mode === 'homework') {
    return 'homework';
  }
  if (mode === 'live-session') {
    return 'class_session';
  }
  if (mode === 'course-material') {
    return 'course_material';
  }
  return 'self_study';
};

const resultSourceTypeForAttempt = (
  mode: ReadingV2AttemptContext['mode'],
): NonNullable<TestResultRecord['context']>['source']['type'] => {
  if (mode === 'homework') {
    return 'homework';
  }
  if (mode === 'live-session') {
    return 'class';
  }
  if (mode === 'course-material') {
    return 'course';
  }
  if (mode === 'public-library') {
    return 'library';
  }
  return 'direct_link';
};

const resultSourceIdForAttempt = (result: ReadingV2Result): string => {
  const context = result.attemptContext;
  return context.homeworkId
    ?? context.sessionCode
    ?? context.courseId
    ?? context.materialId
    ?? result.testId;
};

const buildReadingV2ResultContext = (
  result: ReadingV2Result,
  testTitle: string,
): TestResultRecord['context'] => ({
  type: resultContextTypeForAttempt(result.attemptContext.mode),
  source: {
    type: resultSourceTypeForAttempt(result.attemptContext.mode),
    id: resultSourceIdForAttempt(result),
    name: result.attemptContext.sourceName ?? testTitle,
    ...(result.attemptContext.sessionCode !== undefined && {
      sessionCode: result.attemptContext.sessionCode,
    }),
  },
  ...(result.attemptContext.sessionCode !== undefined && {
    sessionCode: result.attemptContext.sessionCode,
  }),
  ...(result.attemptContext.classId !== undefined && {
    classId: result.attemptContext.classId,
  }),
  ...(result.attemptContext.courseId !== undefined && {
    courseId: result.attemptContext.courseId,
  }),
  ...((result.attemptContext.assignmentId !== undefined || result.attemptContext.homeworkId !== undefined) && {
    assignment: {
      ...(result.attemptContext.homeworkId !== undefined && {
        homeworkId: result.attemptContext.homeworkId,
      }),
      ...(result.attemptContext.assignmentId !== undefined && {
        assignmentId: result.attemptContext.assignmentId,
      }),
      attemptNumber: 1,
    },
  }),
  configApplied: {
    timerMinutes: null,
    feedbackTiming: 'after_completion',
    source: 'material_default',
  },
});

export const buildReadingV2SavedResultRecord = (input: {
  readonly result: ReadingV2Result;
  readonly reviewPayload: ReadingV2GroupedReviewPayload;
  readonly studentName: string;
  readonly testTitle: string;
  readonly sessionCode?: string;
  readonly timeElapsed?: number;
  readonly testDuration?: number;
  readonly teacherId?: string;
  readonly context?: TestResultRecord['context'];
  readonly visibility?: TestResultRecord['visibility'];
  readonly courseId?: string | null;
  readonly courseName?: string | null;
  readonly classId?: string | null;
  readonly className?: string | null;
  readonly moduleId?: string | null;
  readonly moduleName?: string | null;
}): TestResultRecord & {
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly readingV2: {
    readonly result: ReadingV2Result;
    readonly reviewPayload: ReadingV2GroupedReviewPayload;
    readonly regradeArtifacts: readonly ReadingV2RegradeArtifact[];
  };
} => {
  const maxScore = input.result.interactions.reduce((total, interaction) => total + interaction.maxScore, 0);
  const totalScore = input.result.interactions.reduce((total, interaction) => total + interaction.score, 0);
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const submittedAt = Date.parse(input.result.submittedAt);

  return {
    resultId: input.result.resultId,
    sessionCode: input.sessionCode ?? input.result.attemptContext.sessionCode ?? 'reading-v2',
    testId: input.result.testId,
    studentId: input.result.studentId,
    studentName: input.studentName,
    totalScore,
    maxScore,
    percentage,
    bandScore: Math.round((percentage / 10) * 2) / 2,
    questionResults: input.result.interactions.map((interaction) => ({
      questionNumber: interaction.displayNumber,
      questionType: interaction.officialTaskType,
      isCorrect: interaction.score >= interaction.maxScore,
      score: interaction.score,
      maxScore: interaction.maxScore,
      studentAnswer: clone(interaction.studentAnswer),
      correctAnswer: clone(interaction.scoredAnswer),
      feedback: '',
    })),
    correct: input.result.interactions.filter((interaction) => interaction.score >= interaction.maxScore).length,
    incorrect: input.result.interactions.filter((interaction) => interaction.score === 0).length,
    partialCredit: input.result.interactions.filter((interaction) => interaction.score > 0 && interaction.score < interaction.maxScore).length,
    totalQuestions: input.result.interactions.length,
    submittedAt: Number.isFinite(submittedAt) ? submittedAt : Date.now(),
    timeElapsed: input.timeElapsed ?? 0,
    testDuration: input.testDuration ?? 0,
    createdAt: Number.isFinite(submittedAt) ? submittedAt : Date.now(),
    teacherId: input.teacherId ?? input.result.ownerId,
    testTitle: input.testTitle,
    testType: 'ielts-reading-v2',
    testSkill: 'reading',
    ...(input.courseId !== undefined && { courseId: input.courseId }),
    ...(input.courseName !== undefined && { courseName: input.courseName }),
    ...(input.classId !== undefined && { classId: input.classId }),
    ...(input.className !== undefined && { className: input.className }),
    ...(input.moduleId !== undefined && { moduleId: input.moduleId }),
    ...(input.moduleName !== undefined && { moduleName: input.moduleName }),
    ...(input.visibility !== undefined && { visibility: input.visibility }),
    context: input.context ?? buildReadingV2ResultContext(input.result, input.testTitle),
    deliveryEngine: READING_V2_ENGINE,
    readingV2: {
      result: clone(input.result),
      reviewPayload: clone(input.reviewPayload),
      regradeArtifacts: [],
    },
  };
};

const buildReadingV2StudentIndexRow = (
  result: Pick<TestResultRecord, 'resultId' | 'sessionCode' | 'testId' | 'percentage' | 'submittedAt'>,
): Record<string, unknown> => ({
  resultId: result.resultId,
  sessionCode: result.sessionCode,
  testId: result.testId,
  percentage: result.percentage,
  submittedAt: result.submittedAt,
});

const buildReadingV2SessionIndexRow = (
  result: Pick<TestResultRecord, 'resultId' | 'studentId' | 'studentName' | 'percentage' | 'submittedAt'>,
): Record<string, unknown> => ({
  resultId: result.resultId,
  studentId: result.studentId,
  studentName: result.studentName,
  percentage: result.percentage,
  submittedAt: result.submittedAt,
});

const buildReadingV2TeacherIndexRow = (
  result: Pick<TestResultRecord, 'resultId' | 'sessionCode' | 'studentId' | 'studentName' | 'percentage' | 'submittedAt' | 'isGuest'>,
): Record<string, unknown> => ({
  resultId: result.resultId,
  sessionCode: result.sessionCode,
  studentId: result.studentId,
  studentName: result.studentName,
  percentage: result.percentage,
  submittedAt: result.submittedAt,
  isGuest: Boolean(result.isGuest),
});

const buildReadingV2CourseIndexRow = (
  result: Pick<TestResultRecord, 'resultId' | 'studentId' | 'studentName' | 'percentage' | 'bandScore' | 'testTitle' | 'testSkill' | 'submittedAt' | 'moduleId'>,
): Record<string, unknown> => ({
  resultId: result.resultId,
  studentId: result.studentId,
  studentName: result.studentName,
  percentage: result.percentage,
  bandScore: result.bandScore,
  testTitle: result.testTitle,
  testSkill: result.testSkill,
  submittedAt: result.submittedAt,
  moduleId: result.moduleId ?? null,
});

const buildReadingV2ClassIndexRow = (
  result: Pick<TestResultRecord, 'resultId' | 'studentId' | 'studentName' | 'percentage' | 'bandScore' | 'testTitle' | 'testSkill' | 'submittedAt'>,
  courseId: string | null,
): Record<string, unknown> => ({
  resultId: result.resultId,
  studentId: result.studentId,
  studentName: result.studentName,
  percentage: result.percentage,
  bandScore: result.bandScore,
  testTitle: result.testTitle,
  testSkill: result.testSkill,
  submittedAt: result.submittedAt,
  courseId,
});

const getReadingV2TeacherIndexOwnerId = (result: TestResultRecord): string | null => {
  if (!result.visibility?.ownershipResolved || result.visibility.contextType === 'solo_practice') {
    return null;
  }

  return result.visibility.visibilityOwnerTeacherId ?? null;
};

const isReadingV2SoloPracticeResult = (result: TestResultRecord): boolean =>
  Boolean(
    result.visibility
    && result.visibility.ownershipResolved
    && result.visibility.contextType === 'solo_practice',
  );

const isReadingV2ScopedIndexEligible = (result: TestResultRecord): boolean =>
  Boolean(
    result.visibility
    && result.visibility.ownershipResolved
    && result.visibility.contextType !== 'solo_practice',
  );

const getReadingV2CanonicalCourseIndexId = (result: TestResultRecord): string | null => {
  if (!isReadingV2ScopedIndexEligible(result)) {
    return null;
  }

  return result.visibility?.courseId ?? result.courseId ?? null;
};

const getReadingV2CanonicalClassIndexId = (result: TestResultRecord): string | null => {
  if (!isReadingV2ScopedIndexEligible(result)) {
    return null;
  }

  return result.visibility?.classId ?? result.classId ?? null;
};

export const buildReadingV2ResultPersistencePlan = (input: {
  readonly attempt: ReadingV2Attempt;
  readonly result: ReadingV2Result;
  readonly savedResult: TestResultRecord;
  readonly reviewPayload: ReadingV2GroupedReviewPayload;
}): ReadingV2ResultPersistencePlan => {
  const savedResult = input.savedResult;
  const materialId = input.attempt.context.materialId ?? input.result.testId;
  const studentIndexRow = buildReadingV2StudentIndexRow(savedResult);
  const sessionIndexRow = buildReadingV2SessionIndexRow(savedResult);
  const operations: ReadingV2ResultPersistencePlan['operations'] = [
    {
      key: `reading-v2-attempt:${input.attempt.attemptId}`,
      path: readingV2StoragePaths.attempts(input.attempt.attemptId),
      value: persistenceValue({
        ...input.attempt,
        materialId,
        sessionCode: input.attempt.context.sessionCode ?? null,
      }),
    },
    {
      key: `reading-v2-result:${input.result.resultId}`,
      path: readingV2StoragePaths.results(input.result.resultId),
      value: persistenceValue({
        ...input.result,
        materialId,
      }),
    },
    {
      key: `reading-v2-review-index:${input.result.resultId}`,
      path: readingV2StoragePaths.reviewIndexes(input.result.resultId),
      value: persistenceValue({
        ...input.reviewPayload,
        ownerId: input.result.ownerId,
        taskGroupIds: input.reviewPayload.taskGroups.map((taskGroup) => taskGroup.taskGroupId),
      }),
    },
    {
      key: `existing-result:${savedResult.resultId}`,
      path: `test_results/${savedResult.resultId}`,
      value: persistenceValue(savedResult),
    },
    {
      key: `existing-session-index:${savedResult.sessionCode}:${savedResult.resultId}`,
      path: `test_results_by_session/${savedResult.sessionCode}/${savedResult.resultId}`,
      value: persistenceValue(sessionIndexRow),
    },
    {
      key: `existing-student-index:${savedResult.studentId}:${savedResult.resultId}`,
      path: `test_results_by_student/${savedResult.studentId}/${savedResult.resultId}`,
      value: persistenceValue(studentIndexRow),
    },
  ];

  if (isReadingV2SoloPracticeResult(savedResult)) {
    operations.push({
      key: `existing-solo-practice-student-index:${savedResult.studentId}:${savedResult.resultId}`,
      path: `test_results_solo_practice_by_student/${savedResult.studentId}/${savedResult.resultId}`,
      value: persistenceValue(studentIndexRow),
    });
  }

  const teacherIndexOwnerId = getReadingV2TeacherIndexOwnerId(savedResult);
  if (teacherIndexOwnerId) {
    operations.push({
      key: `existing-teacher-index:${teacherIndexOwnerId}:${savedResult.resultId}`,
      path: `test_results_by_teacher/${teacherIndexOwnerId}/${savedResult.resultId}`,
      value: persistenceValue(buildReadingV2TeacherIndexRow(savedResult)),
    });
  }

  const canonicalCourseId = getReadingV2CanonicalCourseIndexId(savedResult);
  if (canonicalCourseId) {
    operations.push({
      key: `existing-course-index:${canonicalCourseId}:${savedResult.studentId}:${savedResult.resultId}`,
      path: `test_results_by_course/${canonicalCourseId}/${savedResult.studentId}/${savedResult.resultId}`,
      value: persistenceValue(buildReadingV2CourseIndexRow(savedResult)),
    });
  }

  const canonicalClassId = getReadingV2CanonicalClassIndexId(savedResult);
  if (canonicalClassId) {
    operations.push({
      key: `existing-class-index:${canonicalClassId}:${savedResult.studentId}:${savedResult.resultId}`,
      path: `test_results_by_class/${canonicalClassId}/${savedResult.studentId}/${savedResult.resultId}`,
      value: persistenceValue(buildReadingV2ClassIndexRow(savedResult, canonicalCourseId)),
    });
  }

  return {
    operations,
  };
};

export const sanitizeReadingV2ResultForReleasePolicy = <T extends TestResultRecord>(
  result: T,
  releasePolicy: ReadingV2ReleasePolicy,
): T => {
  if (!isReadingV2SavedResult(result)) {
    return result;
  }

  const sanitized = clone(result) as T & {
    readingV2: {
      result: ReadingV2Result;
      reviewPayload?: ReadingV2GroupedReviewPayload;
      regradeArtifacts?: readonly ReadingV2RegradeArtifact[];
    };
  };

  if (!releasePolicy.showScore) {
    sanitized.totalScore = 0;
    sanitized.percentage = 0;
    sanitized.bandScore = 0;
    sanitized.correct = 0;
    sanitized.incorrect = 0;
    sanitized.partialCredit = 0;
    sanitized.questionResults = sanitized.questionResults.map((question) => ({
      ...question,
      isCorrect: false,
      score: 0,
      maxScore: 0,
    }));
    sanitized.readingV2.result = {
      ...sanitized.readingV2.result,
      interactions: sanitized.readingV2.result.interactions.map((interaction) => ({
        ...interaction,
        score: 0,
        maxScore: 0,
      })),
    };
    if (sanitized.readingV2.reviewPayload) {
      sanitized.readingV2.reviewPayload = {
        ...sanitized.readingV2.reviewPayload,
        taskGroups: sanitized.readingV2.reviewPayload.taskGroups.map((taskGroup) => ({
          ...taskGroup,
          interactions: taskGroup.interactions.map((interaction) => ({
            ...interaction,
            score: 0,
            maxScore: 0,
          })),
        })),
      };
    }
  }

  if (!releasePolicy.showCorrectAnswers) {
    sanitized.questionResults = sanitized.questionResults.map((question) => ({
      ...question,
      correctAnswer: '',
      feedback: '',
    }));
    sanitized.readingV2.result = {
      ...sanitized.readingV2.result,
      interactions: sanitized.readingV2.result.interactions.map((interaction) => ({
        ...interaction,
        scoredAnswer: '',
        reviewState: 'withheld',
      })),
    };
    if (sanitized.readingV2.reviewPayload) {
      sanitized.readingV2.reviewPayload = {
        ...sanitized.readingV2.reviewPayload,
        taskGroups: sanitized.readingV2.reviewPayload.taskGroups.map((taskGroup) => ({
          ...taskGroup,
          interactions: taskGroup.interactions.map((interaction) => ({
            ...interaction,
            correctAnswer: undefined,
            reviewState: 'withheld',
          })),
        })),
      };
    }
  }

  if (!releasePolicy.showExplanations) {
    sanitized.questionResults = sanitized.questionResults.map((question) => ({
      ...question,
      feedback: '',
    }));
    if (sanitized.formativeFeedback) {
      sanitized.formativeFeedback = {
        ...sanitized.formativeFeedback,
        questionExplanations: {},
        fallbackQuestionExplanations: {},
      };
    }
  }

  if (!releasePolicy.showFeedback) {
    sanitized.formativeFeedback = undefined;
    sanitized.overallFeedback = undefined;
    sanitized.hasFeedback = undefined;
    sanitized.feedbackUpdatedAt = undefined;
    sanitized.feedbackUpdatedBy = undefined;
  }

  return sanitized;
};

export const createReadingV2RegradeArtifact = (input: {
  readonly result: ReadingV2Result;
  readonly regradeId: string;
  readonly reviewedScore: number;
  readonly changedBy: string;
  readonly reason: string;
  readonly changedAt?: string;
}): ReadingV2RegradeArtifact => ({
  resultId: input.result.resultId,
  regradeId: input.regradeId,
  originalScore: input.result.interactions.reduce((total, interaction) => total + interaction.score, 0),
  reviewedScore: input.reviewedScore,
  changedBy: input.changedBy,
  changedAt: input.changedAt ?? new Date().toISOString(),
  reason: input.reason,
});

export const buildReadingV2RegradePersistencePlan = (input: {
  readonly artifact: ReadingV2RegradeArtifact;
}): ReadingV2RegradePersistencePlan => ({
  operations: [
    {
      key: `reading-v2-regrade-artifact:${input.artifact.resultId}:${input.artifact.regradeId}`,
      path: readingV2StoragePaths.regradeArtifacts(input.artifact.resultId, input.artifact.regradeId),
      value: persistenceValue(input.artifact),
    },
    {
      key: `existing-result-regrade-artifact:${input.artifact.resultId}:${input.artifact.regradeId}`,
      path: `test_results/${input.artifact.resultId}/readingV2/regradeArtifactsById/${input.artifact.regradeId}`,
      value: persistenceValue(input.artifact),
    },
  ],
});

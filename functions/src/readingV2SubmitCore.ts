export const READING_V2_ENGINE = 'reading-v2';
export const READING_V2_SCHEMA_VERSION = 1;

export type ReadingV2SubmitSurface =
  | 'solo-practice'
  | 'homework'
  | 'course-material'
  | 'public-library'
  | 'live-session';

export interface ReadingV2TrustedSubmissionRequest {
  deliveryEngine: typeof READING_V2_ENGINE;
  projectionId: string;
  sourceSnapshotVersionId: string;
  materialId?: string;
  answers: readonly ReadingV2TrustedSubmissionAnswer[];
  context?: {
    surface?: ReadingV2SubmitSurface;
    sessionCode?: string;
    homeworkId?: string;
    courseId?: string;
    classId?: string;
    moduleId?: string;
    assignmentId?: string;
    sourceName?: string;
  };
}

export interface ReadingV2TrustedSubmissionAnswer {
  interactionId: string;
  taskGroupId: string;
  displayNumber: number;
  value: string | readonly string[];
}

export interface ReadingV2SubmitAuthContext {
  uid: string;
  name?: string | null;
  email?: string | null;
}

export interface ReadingV2SubmitLoadedRecords {
  snapshot: Record<string, any>;
  reviewProjection: Record<string, any>;
  metadata?: Record<string, any> | null;
  session?: Record<string, any> | null;
  studentProfile?: Record<string, any> | null;
}

export interface ReadingV2SubmitIdentity {
  resultId: string;
  attemptId: string;
  submittedAtIso: string;
  submittedAtMs: number;
}

export interface ReadingV2SubmitPlan {
  resultId: string;
  attemptId: string;
  savedResult: Record<string, any>;
  canonicalResultPath: string;
  secondaryUpdates: Record<string, unknown>;
  response: {
    resultId: string;
    attemptId: string;
    totalScore: number;
    maxScore: number;
    percentage: number;
  };
}

const storagePaths = {
  attempts: (attemptId: string): string => `reading_v2/attempts/${attemptId}`,
  results: (resultId: string): string => `reading_v2/results/${resultId}`,
  reviewIndexes: (resultId: string): string => `reading_v2/review_indexes/${resultId}`,
};

const isRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const requiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reading V2 submission is missing ${fieldName}.`);
  }

  return value.trim();
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const optionalNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

export const sanitizeRtdbValue = <T>(value: T): T => {
  if (value === undefined) {
    return null as T;
  }

  if (value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRtdbValue(entry)) as T;
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, sanitizeRtdbValue(entry)]),
    ) as T;
  }

  return value;
};

export const parseReadingV2TrustedSubmissionRequest = (
  body: unknown,
): ReadingV2TrustedSubmissionRequest => {
  if (!isRecord(body)) {
    throw new Error('Reading V2 submission body must be an object.');
  }

  if (body.deliveryEngine !== READING_V2_ENGINE) {
    throw new Error('Reading V2 trusted submission requires the reading-v2 delivery engine.');
  }

  if (!Array.isArray(body.answers)) {
    throw new Error('Reading V2 submission answers must be an array.');
  }

  return {
    deliveryEngine: READING_V2_ENGINE,
    projectionId: requiredString(body.projectionId, 'projectionId'),
    sourceSnapshotVersionId: requiredString(body.sourceSnapshotVersionId, 'sourceSnapshotVersionId'),
    materialId: optionalString(body.materialId),
    answers: body.answers.map((answer, index) => parseAnswer(answer, index)),
    context: isRecord(body.context) ? {
      surface: parseSurface(body.context.surface),
      sessionCode: optionalString(body.context.sessionCode),
      homeworkId: optionalString(body.context.homeworkId),
      courseId: optionalString(body.context.courseId),
      classId: optionalString(body.context.classId),
      moduleId: optionalString(body.context.moduleId),
      assignmentId: optionalString(body.context.assignmentId),
      sourceName: optionalString(body.context.sourceName),
    } : undefined,
  };
};

const parseSurface = (value: unknown): ReadingV2SubmitSurface | undefined => {
  if (
    value === 'solo-practice' ||
    value === 'homework' ||
    value === 'course-material' ||
    value === 'public-library' ||
    value === 'live-session'
  ) {
    return value;
  }

  return undefined;
};

const parseAnswer = (value: unknown, index: number): ReadingV2TrustedSubmissionAnswer => {
  if (!isRecord(value)) {
    throw new Error(`Reading V2 answer ${index + 1} must be an object.`);
  }

  const displayNumber = Number(value.displayNumber);
  if (!Number.isFinite(displayNumber)) {
    throw new Error(`Reading V2 answer ${index + 1} is missing displayNumber.`);
  }

  const answerValue = value.value;
  if (
    typeof answerValue !== 'string' &&
    !(Array.isArray(answerValue) && answerValue.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`Reading V2 answer ${index + 1} has an unsupported value.`);
  }

  return {
    interactionId: requiredString(value.interactionId, `answers[${index}].interactionId`),
    taskGroupId: requiredString(value.taskGroupId, `answers[${index}].taskGroupId`),
    displayNumber,
    value: answerValue,
  };
};

export const getMaterialIdFromRequest = (
  request: Pick<ReadingV2TrustedSubmissionRequest, 'materialId'>,
): string => requiredString(request.materialId, 'materialId');

const normalizeText = (
  value: unknown,
  options: { caseSensitive?: boolean; punctuationSensitive?: boolean },
): string => {
  const joined = Array.isArray(value) ? value.join('|') : String(value ?? '');
  const cased = options.caseSensitive ? joined : joined.toLowerCase();
  const punctuated = options.punctuationSensitive
    ? cased
    : cased.replace(/[^\p{L}\p{N}\s|]/gu, '');
  return punctuated.replace(/\s+/g, ' ').trim();
};

const normalizeAnswerItems = (
  value: unknown,
  options: { caseSensitive?: boolean; punctuationSensitive?: boolean },
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

const answerMatches = (studentAnswer: unknown, interaction: Record<string, any>): boolean => {
  const scoringRule = interaction.scoringRule ?? {};
  const acceptableAnswers = Array.isArray(scoringRule.acceptableAnswers)
    ? scoringRule.acceptableAnswers
    : [];

  if (acceptableAnswers.length === 0) {
    return false;
  }

  if (Array.isArray(studentAnswer) || interaction.responseShape?.kind === 'multi-select') {
    return answerListsMatch(
      normalizeAnswerItems(studentAnswer, scoringRule),
      normalizeAnswerItems(acceptableAnswers, scoringRule),
      scoringRule.orderMatters !== false,
    );
  }

  const normalizedStudent = normalizeText(studentAnswer, scoringRule);
  return acceptableAnswers.some(
    (answer: unknown) => normalizeText(answer, scoringRule) === normalizedStudent,
  );
};

const correctAnswerForInteraction = (interaction: Record<string, any>): unknown => {
  const acceptableAnswers = Array.isArray(interaction.scoringRule?.acceptableAnswers)
    ? interaction.scoringRule.acceptableAnswers
    : [];

  return interaction.scoringRule?.orderMatters === false
    ? [...acceptableAnswers]
    : acceptableAnswers[0] ?? '';
};

const answerMapFromRuntime = (
  answers: readonly ReadingV2TrustedSubmissionAnswer[],
): Record<string, ReadingV2TrustedSubmissionAnswer> =>
  Object.fromEntries(answers.map((answer) => [answer.interactionId, answer]));

const projectedGroups = (projection: Record<string, any>): Record<string, any>[] =>
  Array.isArray(projection.content?.taskGroups) ? projection.content.taskGroups : [];

const findProjectedTaskGroup = (
  projection: Record<string, any>,
  interactionId: string,
): Record<string, any> | undefined =>
  projectedGroups(projection).find((taskGroup) =>
    Array.isArray(taskGroup.interactions) &&
    taskGroup.interactions.some((interaction: Record<string, any>) =>
      interaction.interactionId === interactionId,
    ),
  );

const findProjectedInteraction = (
  projection: Record<string, any>,
  interactionId: string,
): Record<string, any> | undefined => {
  const group = findProjectedTaskGroup(projection, interactionId);
  return Array.isArray(group?.interactions)
    ? group.interactions.find((interaction: Record<string, any>) => interaction.interactionId === interactionId)
    : undefined;
};

const orderedCanonicalInteractions = (snapshot: Record<string, any>): Record<string, any>[] => {
  const interactions = snapshot.document?.interactions;
  if (!isRecord(interactions)) {
    throw new Error('Reading V2 published snapshot is missing canonical interactions.');
  }

  return Object.values(interactions);
};

const truncateContext = (value: string, maxLength = 220): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
};

const stimulusExcerpt = (
  stimulus: Record<string, any>,
  anchorIds: readonly string[],
): string => {
  const content = stimulus.content ?? {};
  const selectedAnchorIds = new Set(anchorIds);

  if (content.kind === 'passage-content' && Array.isArray(content.paragraphs)) {
    const paragraphs = selectedAnchorIds.size > 0
      ? content.paragraphs.filter((paragraph: Record<string, any>) =>
        paragraph.anchorId && selectedAnchorIds.has(paragraph.anchorId),
      )
      : content.paragraphs.slice(0, 2);
    return truncateContext(paragraphs.map((paragraph: Record<string, any>) => paragraph.text).join(' '));
  }

  if (content.kind === 'table-content' && Array.isArray(content.rows)) {
    const cells = content.rows
      .flat()
      .filter((cell: Record<string, any>) =>
        selectedAnchorIds.size === 0 || (cell.anchorId && selectedAnchorIds.has(cell.anchorId)),
      )
      .map((cell: Record<string, any>) => cell.text)
      .filter(Boolean);
    return truncateContext(cells.join(' | '));
  }

  if (content.kind === 'flowchart-content' && Array.isArray(content.steps)) {
    const steps = content.steps
      .filter((step: Record<string, any>) =>
        selectedAnchorIds.size === 0 || (step.anchorId && selectedAnchorIds.has(step.anchorId)),
      )
      .map((step: Record<string, any>) => step.text);
    return truncateContext(steps.join(' -> '));
  }

  if (content.kind === 'diagram-content' && Array.isArray(content.hotspots)) {
    const labels = content.hotspots
      .filter((hotspot: Record<string, any>) =>
        selectedAnchorIds.size === 0 || (hotspot.anchorId && selectedAnchorIds.has(hotspot.anchorId)),
      )
      .map((hotspot: Record<string, any>) => hotspot.label);
    return truncateContext([content.imageAlt, ...labels].filter(Boolean).join(' | '));
  }

  return truncateContext(String(content.alt ?? ''));
};

const stimulusContextForTaskGroup = (
  projection: Record<string, any>,
  taskGroup: Record<string, any>,
): Record<string, unknown>[] => {
  const stimuli = Array.isArray(projection.content?.stimuli) ? projection.content.stimuli : [];
  const anchors = Array.isArray(projection.content?.anchors) ? projection.content.anchors : [];
  const refs = Array.isArray(taskGroup.stimulusRefs) ? taskGroup.stimulusRefs : [];

  return refs.map((stimulusRef: Record<string, any>) => {
    const stimulus = stimuli.find((candidate: Record<string, any>) =>
      candidate.stimulusId === stimulusRef.stimulusId,
    );

    if (!stimulus) {
      throw new Error(`Reading V2 review projection is missing stimulus ${stimulusRef.stimulusId}.`);
    }

    const anchorIds = Array.isArray(stimulusRef.anchorIds) ? stimulusRef.anchorIds : [];
    const anchorLabels = anchors
      .filter((anchor: Record<string, any>) => anchor.stimulusId === stimulusRef.stimulusId)
      .filter((anchor: Record<string, any>) => anchorIds.length === 0 || anchorIds.includes(anchor.anchorId))
      .map((anchor: Record<string, any>) => anchor.label ?? anchor.anchorId);

    return {
      stimulusId: stimulus.stimulusId,
      title: stimulus.title,
      kind: stimulus.kind,
      anchorLabels,
      excerpt: stimulusExcerpt(stimulus, anchorIds),
    };
  });
};

const modeFromSurface = (surface: ReadingV2SubmitSurface | undefined): string =>
  surface ?? 'solo-practice';

const resultContextTypeForMode = (mode: string): string => {
  if (mode === 'homework') return 'homework';
  if (mode === 'live-session') return 'class_session';
  if (mode === 'course-material') return 'course_material';
  return 'self_study';
};

const resultSourceTypeForMode = (mode: string): string => {
  if (mode === 'homework') return 'homework';
  if (mode === 'live-session') return 'class';
  if (mode === 'course-material') return 'course';
  if (mode === 'public-library') return 'library';
  return 'direct_link';
};

const visibilityContextTypeForMode = (mode: string): string => {
  if (mode === 'homework') return 'homework';
  if (mode === 'live-session') return 'class_session';
  if (mode === 'course-material') return 'course_material';
  return 'solo_practice';
};

const visibilitySourceTypeForMode = (mode: string): string => {
  if (mode === 'homework') return 'homework';
  if (mode === 'live-session') return 'session';
  if (mode === 'course-material') return 'course';
  return 'solo_practice';
};

const resultSourceIdForAttempt = (
  mode: string,
  context: NonNullable<ReadingV2TrustedSubmissionRequest['context']>,
  materialId: string,
): string =>
  context.homeworkId ??
  context.sessionCode ??
  context.courseId ??
  materialId;

const buildResultContext = (
  mode: string,
  context: NonNullable<ReadingV2TrustedSubmissionRequest['context']>,
  materialId: string,
  testTitle: string,
): Record<string, unknown> => ({
  type: resultContextTypeForMode(mode),
  source: {
    type: resultSourceTypeForMode(mode),
    id: resultSourceIdForAttempt(mode, context, materialId),
    name: context.sourceName ?? testTitle,
    ...(context.sessionCode !== undefined && { sessionCode: context.sessionCode }),
  },
  ...(context.sessionCode !== undefined && { sessionCode: context.sessionCode }),
  ...(context.classId !== undefined && { classId: context.classId }),
  ...(context.courseId !== undefined && { courseId: context.courseId }),
  ...((context.assignmentId !== undefined || context.homeworkId !== undefined) && {
    assignment: {
      ...(context.homeworkId !== undefined && { homeworkId: context.homeworkId }),
      ...(context.assignmentId !== undefined && { assignmentId: context.assignmentId }),
      attemptNumber: 1,
    },
  }),
  configApplied: {
    timerMinutes: null,
    feedbackTiming: 'after_completion',
    source: 'material_default',
  },
});

const buildVisibilitySnapshot = (
  mode: string,
  context: NonNullable<ReadingV2TrustedSubmissionRequest['context']>,
  materialId: string,
  sourceName: string,
  snapshotOwnerId: string,
  session?: Record<string, any> | null,
): Record<string, unknown> => {
  const contextType = visibilityContextTypeForMode(mode);
  const isSoloPractice = contextType === 'solo_practice';
  const sessionOwner = optionalNullableString(session?.createdByUserId)
    ?? optionalNullableString(session?.createdBy);
  const ownerId = isSoloPractice ? null : (sessionOwner ?? snapshotOwnerId);
  const sourceId = resultSourceIdForAttempt(mode, context, materialId);

  return {
    contextType,
    sourceType: visibilitySourceTypeForMode(mode),
    sourceId,
    sourceNameSnapshot: sourceName,
    visibilityOwnerTeacherId: ownerId,
    ownerResolutionSource: isSoloPractice
      ? 'solo_practice'
      : (sessionOwner ? 'session.createdByUserId' : 'result.teacherId'),
    ownershipResolved: isSoloPractice || Boolean(ownerId),
    unresolvedReason: isSoloPractice || ownerId ? null : 'owner_not_resolved',
    homeworkId: context.homeworkId ?? null,
    sessionCode: context.sessionCode ?? null,
    courseId: context.courseId ?? session?.courseId ?? null,
    classId: context.classId ?? session?.linkedClassId ?? session?.classId ?? null,
    assignmentId: context.assignmentId ?? null,
    currentSourceName: optionalNullableString(session?.title) ?? optionalNullableString(session?.name) ?? sourceName,
  };
};

const getStudentName = (
  auth: ReadingV2SubmitAuthContext,
  profile?: Record<string, any> | null,
): string =>
  optionalNullableString(profile?.displayName)
  ?? optionalNullableString(profile?.name)
  ?? optionalNullableString(profile?.fullName)
  ?? optionalNullableString(auth.name)
  ?? optionalNullableString(auth.email)
  ?? 'Student';

const buildReviewPayload = (
  result: Record<string, any>,
  projection: Record<string, any>,
  materialId: string,
): Record<string, unknown> => ({
  deliveryEngine: READING_V2_ENGINE,
  schemaVersion: READING_V2_SCHEMA_VERSION,
  resultId: result.resultId,
  sourceSnapshotVersionId: result.publishedSnapshotVersion,
  materialId,
  title: projection.content?.title ?? 'Reading V2',
  taskGroups: projectedGroups(projection).map((taskGroup) => ({
    taskGroupId: taskGroup.taskGroupId,
    title: taskGroup.groupTitle,
    officialTaskType: taskGroup.officialTaskType,
    engineeringFamily: taskGroup.engineeringFamily,
    instructionText: Array.isArray(taskGroup.instructionBlocks)
      ? taskGroup.instructionBlocks.map((block: Record<string, any>) => block.text).join('\n')
      : '',
    stimulusContext: stimulusContextForTaskGroup(projection, taskGroup),
    interactions: Array.isArray(taskGroup.interactions)
      ? taskGroup.interactions.map((interaction: Record<string, any>) => {
        const resultInteraction = result.interactions.find(
          (candidate: Record<string, any>) => candidate.interactionId === interaction.interactionId,
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
          studentAnswer: resultInteraction.studentAnswer,
          correctAnswer: resultInteraction.scoredAnswer,
          score: resultInteraction.score,
          maxScore: resultInteraction.maxScore,
          reviewState: resultInteraction.reviewState,
          anchorRef: resultInteraction.anchorRef,
        };
      })
      : [],
  })),
});

const buildStudentIndexRow = (
  result: Record<string, any>,
): Record<string, unknown> => ({
  resultId: result.resultId,
  sessionCode: result.sessionCode,
  testId: result.testId,
  percentage: result.percentage,
  submittedAt: result.submittedAt,
});

const buildSessionIndexRow = (
  result: Record<string, any>,
): Record<string, unknown> => ({
  resultId: result.resultId,
  studentId: result.studentId,
  studentName: result.studentName,
  percentage: result.percentage,
  submittedAt: result.submittedAt,
});

const buildTeacherIndexRow = (
  result: Record<string, any>,
): Record<string, unknown> => ({
  resultId: result.resultId,
  sessionCode: result.sessionCode,
  studentId: result.studentId,
  studentName: result.studentName,
  percentage: result.percentage,
  submittedAt: result.submittedAt,
  isGuest: Boolean(result.isGuest),
});

const buildCourseIndexRow = (
  result: Record<string, any>,
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

const buildClassIndexRow = (
  result: Record<string, any>,
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

export const buildReadingV2TrustedSubmissionPlan = (input: {
  request: ReadingV2TrustedSubmissionRequest;
  auth: ReadingV2SubmitAuthContext;
  records: ReadingV2SubmitLoadedRecords;
  identity: ReadingV2SubmitIdentity;
}): ReadingV2SubmitPlan => {
  const materialId = getMaterialIdFromRequest(input.request);
  const snapshotVersionId = input.request.sourceSnapshotVersionId;
  const snapshot = input.records.snapshot;
  const reviewProjection = input.records.reviewProjection;
  const context = input.request.context ?? {};
  const mode = modeFromSurface(context.surface);
  const studentName = getStudentName(input.auth, input.records.studentProfile);
  const testTitle = optionalString(reviewProjection.content?.title)
    ?? optionalString(input.records.metadata?.title)
    ?? 'Reading V2';

  if (snapshot.materialId !== materialId) {
    throw new Error('Reading V2 submission material binding does not match the published snapshot.');
  }

  if (snapshot.snapshotVersionId !== snapshotVersionId) {
    throw new Error('Reading V2 submission snapshot binding does not match the published snapshot.');
  }

  if (reviewProjection.projectionKind !== 'review') {
    throw new Error('Reading V2 trusted submission requires a review projection.');
  }

  if (reviewProjection.sourceSnapshotVersionId !== snapshotVersionId) {
    throw new Error('Reading V2 review projection binding does not match the submitted snapshot.');
  }

  const runtimeAnswers = answerMapFromRuntime(input.request.answers);
  const attemptContext = {
    mode,
    sessionCode: context.sessionCode,
    homeworkId: context.homeworkId,
    courseId: context.courseId,
    classId: context.classId,
    assignmentId: context.assignmentId,
    sourceName: context.sourceName ?? testTitle,
    materialId,
  };
  const attempt = {
    attemptId: input.identity.attemptId,
    studentId: input.auth.uid,
    sourceSnapshotVersionId: snapshotVersionId,
    context: attemptContext,
    answers: Object.fromEntries(input.request.answers.map((answer) => [
      answer.interactionId,
      {
        taskGroupId: answer.taskGroupId,
        visibleNumber: answer.displayNumber,
        value: answer.value,
      },
    ])),
  };
  const resultInteractions = orderedCanonicalInteractions(snapshot).map((interaction) => {
    const taskGroup = snapshot.document?.taskGroups?.[interaction.taskGroupId];
    if (!taskGroup) {
      throw new Error(`Reading V2 result cannot score missing task group ${interaction.taskGroupId}.`);
    }

    const answer = runtimeAnswers[interaction.interactionId];
    const projectedInteraction = findProjectedInteraction(reviewProjection, interaction.interactionId);
    const maxScore = Number(interaction.scoringRule?.maxScore ?? 0);
    const score = answerMatches(answer?.value, interaction) ? maxScore : 0;

    return {
      interactionId: interaction.interactionId,
      taskGroupId: interaction.taskGroupId,
      displayNumber: Number(projectedInteraction?.displayNumber ?? answer?.displayNumber ?? 0),
      taskFamily: taskGroup.engineeringFamily,
      officialTaskType: taskGroup.officialTaskType,
      studentAnswer: answer?.value ?? '',
      scoredAnswer: correctAnswerForInteraction(interaction),
      score,
      maxScore,
      reviewState: 'released',
      anchorRef: interaction.primaryAnchorId,
    };
  });
  const result = {
    resultId: input.identity.resultId,
    testId: materialId,
    studentId: input.auth.uid,
    ownerId: snapshot.ownerId,
    deliveryEngine: READING_V2_ENGINE,
    publishedSnapshotVersion: snapshotVersionId,
    attemptContext,
    submittedAt: input.identity.submittedAtIso,
    interactions: resultInteractions,
  };
  const reviewPayload = buildReviewPayload(result, reviewProjection, materialId);
  const maxScore = resultInteractions.reduce((total, interaction) => total + interaction.maxScore, 0);
  const totalScore = resultInteractions.reduce((total, interaction) => total + interaction.score, 0);
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const visibility = buildVisibilitySnapshot(
    mode,
    context,
    materialId,
    context.sourceName ?? testTitle,
    snapshot.ownerId,
    input.records.session,
  );
  const savedResult = sanitizeRtdbValue({
    resultId: input.identity.resultId,
    sessionCode: context.sessionCode ?? 'reading-v2',
    testId: materialId,
    studentId: input.auth.uid,
    studentName,
    totalScore,
    maxScore,
    percentage,
    bandScore: Math.round((percentage / 10) * 2) / 2,
    questionResults: resultInteractions.map((interaction) => ({
      questionNumber: interaction.displayNumber,
      questionType: interaction.officialTaskType,
      isCorrect: interaction.score >= interaction.maxScore,
      score: interaction.score,
      maxScore: interaction.maxScore,
      studentAnswer: interaction.studentAnswer,
      correctAnswer: interaction.scoredAnswer,
      feedback: '',
    })),
    correct: resultInteractions.filter((interaction) => interaction.score >= interaction.maxScore).length,
    incorrect: resultInteractions.filter((interaction) => interaction.score === 0).length,
    partialCredit: resultInteractions.filter((interaction) =>
      interaction.score > 0 && interaction.score < interaction.maxScore,
    ).length,
    totalQuestions: resultInteractions.length,
    submittedAt: input.identity.submittedAtMs,
    timeElapsed: 0,
    testDuration: Number(input.records.metadata?.durationMinutes ?? 0),
    createdAt: input.identity.submittedAtMs,
    teacherId: snapshot.ownerId,
    testTitle,
    testType: 'ielts-reading-v2',
    testSkill: 'reading',
    courseId: context.courseId ?? null,
    classId: context.classId ?? input.records.session?.linkedClassId ?? input.records.session?.classId ?? null,
    moduleId: context.moduleId ?? input.records.session?.moduleId ?? null,
    visibility,
    context: buildResultContext(mode, context, materialId, testTitle),
    deliveryEngine: READING_V2_ENGINE,
    readingV2: {
      result,
      reviewPayload,
      regradeArtifacts: [],
    },
  });

  const canonicalResultPath = `test_results/${input.identity.resultId}`;
  const secondaryUpdates: Record<string, unknown> = {
    [storagePaths.attempts(input.identity.attemptId)]: sanitizeRtdbValue({
      ...attempt,
      materialId,
      sessionCode: context.sessionCode ?? null,
    }),
    [storagePaths.results(input.identity.resultId)]: sanitizeRtdbValue({
      ...result,
      materialId,
    }),
    [storagePaths.reviewIndexes(input.identity.resultId)]: sanitizeRtdbValue({
      ...reviewPayload,
      ownerId: result.ownerId,
      taskGroupIds: (reviewPayload.taskGroups as Record<string, any>[]).map((taskGroup) => taskGroup.taskGroupId),
    }),
    [`test_results_by_session/${savedResult.sessionCode}/${input.identity.resultId}`]:
      sanitizeRtdbValue(buildSessionIndexRow(savedResult)),
    [`test_results_by_student/${input.auth.uid}/${input.identity.resultId}`]:
      sanitizeRtdbValue(buildStudentIndexRow(savedResult)),
  };

  if (visibility.contextType === 'solo_practice' && visibility.ownershipResolved) {
    secondaryUpdates[`test_results_solo_practice_by_student/${input.auth.uid}/${input.identity.resultId}`] =
      sanitizeRtdbValue(buildStudentIndexRow(savedResult));
  }

  if (visibility.ownershipResolved && visibility.visibilityOwnerTeacherId && visibility.contextType !== 'solo_practice') {
    secondaryUpdates[`test_results_by_teacher/${visibility.visibilityOwnerTeacherId}/${input.identity.resultId}`] =
      sanitizeRtdbValue(buildTeacherIndexRow(savedResult));
  }

  const canonicalCourseId = typeof visibility.courseId === 'string'
    ? visibility.courseId
    : savedResult.courseId ?? null;
  const canonicalClassId = typeof visibility.classId === 'string'
    ? visibility.classId
    : savedResult.classId ?? null;

  if (visibility.ownershipResolved && visibility.contextType !== 'solo_practice' && canonicalCourseId) {
    secondaryUpdates[`test_results_by_course/${canonicalCourseId}/${input.auth.uid}/${input.identity.resultId}`] =
      sanitizeRtdbValue(buildCourseIndexRow(savedResult));
  }

  if (visibility.ownershipResolved && visibility.contextType !== 'solo_practice' && canonicalClassId) {
    secondaryUpdates[`test_results_by_class/${canonicalClassId}/${input.auth.uid}/${input.identity.resultId}`] =
      sanitizeRtdbValue(buildClassIndexRow(savedResult, canonicalCourseId));
  }

  if (context.sessionCode) {
    secondaryUpdates[`game_sessions/${context.sessionCode}/students/${input.auth.uid}/readingV2`] =
      sanitizeRtdbValue({
        submitted: true,
        submittedAt: input.identity.submittedAtMs,
        resultId: input.identity.resultId,
        attemptId: input.identity.attemptId,
      });

    if (input.records.session?.players?.[input.auth.uid]) {
      secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/submittedAt`] =
        input.identity.submittedAtMs;
      secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/isSubmitted`] = true;
      secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/hasSubmitted`] = true;
      secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/hasCompletedTest`] = true;
      secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/submittedBy`] = 'student';
      secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/latestResultId`] =
        input.identity.resultId;
    }
  }

  return {
    resultId: input.identity.resultId,
    attemptId: input.identity.attemptId,
    savedResult,
    canonicalResultPath,
    secondaryUpdates,
    response: {
      resultId: input.identity.resultId,
      attemptId: input.identity.attemptId,
      totalScore,
      maxScore,
      percentage,
    },
  };
};

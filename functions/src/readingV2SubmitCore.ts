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

export interface ReadingPassageSetTrustedPassageRecord {
  item: Record<string, any>;
  snapshot: Record<string, any>;
  reviewProjection: Record<string, any>;
  metadata?: Record<string, any> | null;
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

const prefixId = (prefix: string, value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? `${prefix}:${value}` : undefined;

const prefixIds = (prefix: string, values: unknown): string[] =>
  Array.isArray(values)
    ? values.map((value) => prefixId(prefix, value)).filter((value): value is string => typeof value === 'string')
    : [];

const prefixAnchorRefs = (prefix: string, value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => prefixAnchorRefs(prefix, entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key === 'anchorId') {
      return [key, prefixId(prefix, entry)];
    }

    if (key === 'anchorIds') {
      return [key, prefixIds(prefix, entry)];
    }

    return [key, prefixAnchorRefs(prefix, entry)];
  }));
};

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

const sortReadingPassageSetItems = (homework: Record<string, any>): Record<string, any>[] =>
  Array.isArray(homework.readingPassageSet?.items)
    ? [...homework.readingPassageSet.items].sort((left, right) => Number(left.order) - Number(right.order))
    : [];

const prefixedCanonicalInteractions = (
  prefix: string,
  snapshot: Record<string, any>,
): Record<string, any> =>
  Object.fromEntries(
    Object.values(snapshot.document?.interactions ?? {}).map((interaction: any) => {
      const prefixed = {
        ...interaction,
        interactionId: requiredString(prefixId(prefix, interaction.interactionId), 'prefixed interactionId'),
        taskGroupId: requiredString(prefixId(prefix, interaction.taskGroupId), 'prefixed taskGroupId'),
        primaryAnchorId: prefixId(prefix, interaction.primaryAnchorId),
      };

      return [prefixed.interactionId, prefixed];
    }),
  );

const prefixedCanonicalTaskGroups = (
  prefix: string,
  snapshot: Record<string, any>,
): Record<string, any> =>
  Object.fromEntries(
    Object.entries(snapshot.document?.taskGroups ?? {}).map(([taskGroupId, taskGroup]: [string, any]) => {
      const prefixedTaskGroupId = requiredString(
        prefixId(prefix, taskGroup.taskGroupId ?? taskGroupId),
        'prefixed taskGroupId',
      );
      return [prefixedTaskGroupId, {
        ...taskGroup,
        taskGroupId: prefixedTaskGroupId,
      }];
    }),
  );

const prefixedReviewContent = (input: {
  prefix: string;
  item: Record<string, any>;
  projection: Record<string, any>;
  visibleNumberOffset: number;
}): Record<string, any> => {
  const content = input.projection.content ?? {};
  const passageSection = {
    order: input.item.order,
    title: input.item.titleSnapshot,
    passageMaterialId: input.item.passageMaterialId,
    snapshotVersionId: input.item.snapshotVersionId,
    sourceOrderDisplay: input.item.sourceOrderDisplay ?? null,
    sourceFullTestTitle: input.item.sourceFullTestTitle ?? null,
  };

  return {
    sections: Array.isArray(content.sections)
      ? content.sections.map((section: Record<string, any>) => ({
        ...section,
        sectionId: requiredString(prefixId(input.prefix, section.sectionId), 'prefixed sectionId'),
        title: `Passage ${input.item.order}: ${input.item.titleSnapshot}`,
        stimulusIds: prefixIds(input.prefix, section.stimulusIds),
        taskGroupIds: prefixIds(input.prefix, section.taskGroupIds),
      }))
      : [],
    stimuli: Array.isArray(content.stimuli)
      ? content.stimuli.map((stimulus: Record<string, any>) => ({
        ...stimulus,
        stimulusId: requiredString(prefixId(input.prefix, stimulus.stimulusId), 'prefixed stimulusId'),
        anchorIds: prefixIds(input.prefix, stimulus.anchorIds),
        content: prefixAnchorRefs(input.prefix, stimulus.content),
      }))
      : [],
    anchors: Array.isArray(content.anchors)
      ? content.anchors.map((anchor: Record<string, any>) => ({
        ...anchor,
        anchorId: requiredString(prefixId(input.prefix, anchor.anchorId), 'prefixed anchorId'),
        stimulusId: requiredString(prefixId(input.prefix, anchor.stimulusId), 'prefixed anchor stimulusId'),
      }))
      : [],
    taskGroups: projectedGroups(input.projection).map((taskGroup) => ({
      ...taskGroup,
      taskGroupId: requiredString(prefixId(input.prefix, taskGroup.taskGroupId), 'prefixed taskGroupId'),
      passageSection,
      instructionBlocks: Array.isArray(taskGroup.instructionBlocks)
        ? taskGroup.instructionBlocks.map((block: Record<string, any>) => ({
          ...block,
          id: prefixId(input.prefix, block.id),
        }))
        : [],
      stimulusRefs: Array.isArray(taskGroup.stimulusRefs)
        ? taskGroup.stimulusRefs.map((ref: Record<string, any>) => ({
          ...ref,
          stimulusId: requiredString(prefixId(input.prefix, ref.stimulusId), 'prefixed stimulus ref'),
          anchorIds: prefixIds(input.prefix, ref.anchorIds),
        }))
        : [],
      interactions: Array.isArray(taskGroup.interactions)
        ? taskGroup.interactions.map((interaction: Record<string, any>) => ({
          ...interaction,
          interactionId: requiredString(prefixId(input.prefix, interaction.interactionId), 'prefixed interactionId'),
          taskGroupId: requiredString(prefixId(input.prefix, interaction.taskGroupId), 'prefixed taskGroupId'),
          displayNumber: input.visibleNumberOffset + Number(interaction.displayNumber ?? 0),
          primaryAnchorId: prefixId(input.prefix, interaction.primaryAnchorId),
          contextAnchorIds: prefixIds(input.prefix, interaction.contextAnchorIds),
        }))
        : [],
    })),
    optionSets: Array.isArray(content.optionSets)
      ? content.optionSets.map((optionSet: Record<string, any>) => ({
        ...optionSet,
        optionSetId: requiredString(prefixId(input.prefix, optionSet.optionSetId), 'prefixed optionSetId'),
        taskGroupId: requiredString(prefixId(input.prefix, optionSet.taskGroupId), 'prefixed optionSet taskGroupId'),
      }))
      : [],
  };
};

const countProjectedInteractions = (projection: Record<string, any>): number =>
  projectedGroups(projection).reduce(
    (sum, taskGroup) => sum + (Array.isArray(taskGroup.interactions) ? taskGroup.interactions.length : 0),
    0,
  );

export const composeReadingPassageSetTrustedRecords = (input: {
  homework: Record<string, any>;
  passageRecords: readonly ReadingPassageSetTrustedPassageRecord[];
  generatedAt?: string;
}): ReadingV2SubmitLoadedRecords => {
  if (
    input.homework.materialType !== 'reading-passage-set' ||
    typeof input.homework.materialId !== 'string' ||
    !input.homework.materialId.startsWith('reading-passage-set:')
  ) {
    throw new Error('Reading Passage set trusted submission requires reading-passage-set homework.');
  }

  const items = sortReadingPassageSetItems(input.homework);
  if (items.length === 0 || items.length !== input.passageRecords.length) {
    throw new Error('Reading Passage set trusted submission requires one passage record per assigned passage.');
  }

  let visibleNumberOffset = 0;
  const canonicalInteractions: Record<string, any> = {};
  const canonicalTaskGroups: Record<string, any> = {};
  const reviewContents: Record<string, any>[] = [];

  items.forEach((item, index) => {
    const passageRecord = input.passageRecords[index];
    if (!passageRecord) {
      throw new Error('Reading Passage set trusted submission is missing a passage record.');
    }

    const prefix = `passage-${item.order}`;
    if (
      passageRecord.snapshot.materialId !== item.passageMaterialId ||
      passageRecord.snapshot.snapshotVersionId !== item.snapshotVersionId ||
      passageRecord.reviewProjection.sourceSnapshotVersionId !== item.snapshotVersionId
    ) {
      throw new Error('Reading Passage set trusted submission record does not match the assigned snapshot.');
    }

    Object.assign(canonicalInteractions, prefixedCanonicalInteractions(prefix, passageRecord.snapshot));
    Object.assign(canonicalTaskGroups, prefixedCanonicalTaskGroups(prefix, passageRecord.snapshot));
    reviewContents.push(prefixedReviewContent({
      prefix,
      item,
      projection: passageRecord.reviewProjection,
      visibleNumberOffset,
    }));
    visibleNumberOffset += countProjectedInteractions(passageRecord.reviewProjection);
  });

  const firstRecord = input.passageRecords[0];
  if (!firstRecord) {
    throw new Error('Reading Passage set trusted submission requires at least one passage record.');
  }

  const snapshotVersionId = `homework-set:${input.homework.id ?? input.homework.materialId.replace(/^reading-passage-set:/, '')}`;
  const title = input.homework.readingPassageSet?.titleSnapshot ?? input.homework.title ?? input.homework.materialTitle ?? 'Reading Passage Set';

  return {
    snapshot: {
      snapshotVersionId,
      materialId: input.homework.materialId,
      ownerId: input.homework.createdBy ?? firstRecord.snapshot.ownerId,
      publishedAt: input.generatedAt ?? firstRecord.snapshot.publishedAt,
      publishedBy: input.homework.createdBy ?? firstRecord.snapshot.publishedBy,
      document: {
        title,
        interactions: canonicalInteractions,
        taskGroups: canonicalTaskGroups,
      },
    },
    reviewProjection: {
      deliveryEngine: READING_V2_ENGINE,
      projectionKind: 'review',
      sourceSnapshotVersionId: snapshotVersionId,
      generatedAt: input.generatedAt ?? firstRecord.reviewProjection.generatedAt,
      content: {
        title,
        sections: reviewContents.flatMap((content) => content.sections),
        stimuli: reviewContents.flatMap((content) => content.stimuli),
        anchors: reviewContents.flatMap((content) => content.anchors),
        taskGroups: reviewContents.flatMap((content) => content.taskGroups),
        optionSets: reviewContents.flatMap((content) => content.optionSets),
      },
    },
    metadata: {
      materialId: input.homework.materialId,
      title,
      materialKind: 'reading-passage-set',
      durationMinutes: input.homework.config?.timerMinutes ?? 0,
    },
  };
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

const materialLabelForKind = (kind: string | undefined): string | undefined => {
  if (kind === 'reading-passage') return 'Reading Passage';
  if (kind === 'reading-passage-set') return 'Reading Passage Set';
  return undefined;
};

const buildSinglePassageSection = (
  metadata: Record<string, any> | null | undefined,
  materialId: string,
  snapshotVersionId: string,
): Record<string, unknown> | null => {
  if (metadata?.materialKind !== 'reading-passage') {
    return null;
  }

  return {
    title: optionalString(metadata.title),
    passageMaterialId: materialId,
    snapshotVersionId,
    sourceOrderDisplay: optionalNullableString(metadata.sourceOrderDisplay ?? metadata.sourceOrderLabelSnapshot),
    sourceFullTestTitle: optionalNullableString(metadata.sourceFullTestTitle),
  };
};

const buildReviewPayload = (
  result: Record<string, any>,
  projection: Record<string, any>,
  materialId: string,
  metadata?: Record<string, any> | null,
): Record<string, unknown> => {
  const materialKind = optionalString(metadata?.materialKind);
  const materialLabel = materialLabelForKind(materialKind);
  const singlePassageSection = buildSinglePassageSection(metadata, materialId, result.publishedSnapshotVersion);

  return {
    deliveryEngine: READING_V2_ENGINE,
    schemaVersion: READING_V2_SCHEMA_VERSION,
    resultId: result.resultId,
    sourceSnapshotVersionId: result.publishedSnapshotVersion,
    materialId,
    ...(materialKind !== undefined && { materialKind }),
    ...(materialLabel !== undefined && { materialLabel }),
    title: projection.content?.title ?? 'Reading V2',
    taskGroups: projectedGroups(projection).map((taskGroup) => ({
      taskGroupId: taskGroup.taskGroupId,
      title: taskGroup.groupTitle,
      passageSection: taskGroup.passageSection ?? singlePassageSection,
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
  };
};

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

  const canonicalInteractions = orderedCanonicalInteractions(snapshot);
  const canonicalInteractionMap = new Map(
    canonicalInteractions.map((interaction) => [interaction.interactionId, interaction]),
  );
  input.request.answers.forEach((answer) => {
    const canonicalInteraction = canonicalInteractionMap.get(answer.interactionId);
    const projectedInteraction = findProjectedInteraction(reviewProjection, answer.interactionId);

    if (!canonicalInteraction || !projectedInteraction) {
      throw new Error('Reading V2 answer is not bound to the assigned snapshot.');
    }

    if (canonicalInteraction.taskGroupId !== answer.taskGroupId) {
      throw new Error('Reading V2 answer task group binding does not match the assigned snapshot.');
    }

    if (Number(projectedInteraction.displayNumber) !== answer.displayNumber) {
      throw new Error('Reading V2 answer display number binding does not match the assigned snapshot.');
    }
  });

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
  const resultInteractions = canonicalInteractions.map((interaction) => {
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
  const reviewPayload = buildReviewPayload(result, reviewProjection, materialId, input.records.metadata);
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

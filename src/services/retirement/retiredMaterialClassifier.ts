import {
  READING_V2_ENGINE_FIELDS,
  isReadingV2Payload,
} from '../../config/readingV2FeatureFlags';

export const RETIREMENT_CLASSIFIER_SCHEMA_VERSION =
  'retired-material-classifier-phase-2-v2';

export type RetirementDecisionState =
  | 'retire-reading-v1'
  | 'retire-quiz'
  | 'retire-drive-backed-listening'
  | 'protect-reading-v2'
  | 'protect-thcs'
  | 'protect-r2-listening'
  | 'protect-supported-listening'
  | 'protect-non-candidate'
  | 'unknown-blocked';

export interface RetirementCandidateContext {
  readonly path: string;
  readonly root: string;
}

export interface RetirementClassification {
  readonly state: RetirementDecisionState;
  readonly reason: string;
  readonly candidateId: string;
  readonly evidence: readonly string[];
  readonly markerEvidence: readonly string[];
  readonly plannedDeletionPaths: readonly string[];
  readonly retainedResultScrubPaths: readonly string[];
  readonly protectedReadingV2Collision: boolean;
}

const DRIVE_URL_PATTERN =
  /(?:drive\.google\.com|docs\.google\.com\/file|drive\.usercontent\.google\.com)/i;

const KNOWN_AUDIO_URL_FIELDS = new Set([
  'audioUrl',
  'streamUrl',
  'originalUrl',
  'audioFileUrl',
  'sourceAudioUrl',
]);

const R2_FIELD_NAMES = new Set([
  'r2Key',
  'r2ObjectKey',
  'objectKey',
  'storageKey',
  'assetKey',
  'assetId',
  'r2Url',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const hasCollectionItems = (value: unknown): boolean =>
  (Array.isArray(value) && value.length > 0)
  || (isRecord(value) && Object.keys(value).length > 0);

const collectionValues = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];

const hasOwn = (value: Record<string, unknown>, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, field);

const hasFields = (value: unknown, fields: readonly string[]): boolean =>
  isRecord(value) && fields.every((field) => hasOwn(value, field));

const isTestsRecord = (context: RetirementCandidateContext): boolean =>
  context.root === 'tests' && /^\/tests\/[^/]+$/.test(context.path);

const pathMatchesRootRecord = (
  context: RetirementCandidateContext,
  root: string,
): boolean =>
  context.root === root
  && context.path.split('/').filter(Boolean).length === root.split('/').length + 1;

export const isReadingV2Material = (value: unknown): boolean => {
  return isReadingV2Payload(value);
};

const hasApprovedLegacyReadingSignature = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  if (normalizeText(value.type) !== 'ielts' || normalizeText(value.skill) !== 'reading') {
    return false;
  }
  if (!hasCollectionItems(value.passages) || !hasCollectionItems(value.questions)) {
    return false;
  }

  const passages = collectionValues(value.passages);
  const questions = collectionValues(value.questions);
  return passages.some((passage) =>
    hasFields(passage, ['id', 'title', 'content', 'questionStart', 'questionEnd']))
    && questions.some((question) =>
      hasFields(question, ['number', 'type', 'question', 'answer', 'passageId']))
    && isRecord(value.metadata)
    && typeof value.metadata.instructions === 'string'
    && isRecord(value.settings)
    && typeof value.settings.allowReview === 'boolean'
    && typeof value.settings.showTimer === 'boolean';
};

export const isReadingV1Material = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean => {
  if (!isTestsRecord(context) || isReadingV2Material(value) || isThcsMaterial(value)) {
    return false;
  }

  return hasApprovedLegacyReadingSignature(value);
};

const isThcsMaterial = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  return [
    value.type,
    value.testType,
    value.curriculum,
    value.program,
    value.contentKind,
  ].some((candidate) => {
    const normalized = normalizeText(candidate);
    return normalized.includes('thcs') || normalized.includes('thpt');
  });
};

const hasQuizReference = (value: Record<string, unknown>): boolean =>
  typeof value.quizId === 'string'
  || normalizeText(value.type) === 'quiz'
  || normalizeText(value.contentType) === 'quiz'
  || normalizeText(value.materialKind) === 'quiz'
  || normalizeText(value.mode) === 'quiz';

export const isQuizMaterial = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  if (context.root === 'quizzes' && /^\/quizzes\/[^/]+$/.test(context.path)) {
    return hasCollectionItems(value.questions)
      || typeof value.title === 'string'
      || typeof value.createdBy === 'string';
  }

  return hasQuizReference(value);
};

const hasR2Evidence = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(hasR2Evidence);
  }
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) => {
    const normalizedChild = normalizeText(child);
    return R2_FIELD_NAMES.has(key)
      || normalizedChild === 'r2'
      || normalizedChild.startsWith('r2://')
      || hasR2Evidence(child);
  });
};

const isR2ListeningMaterial = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const skill = normalizeText(value.skill || value.skillType);
  return skill === 'listening' && hasR2Evidence(value);
};

const isListeningRecord = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  return [
    value.skill,
    value.skillType,
    value.testSkill,
  ].some((candidate) => normalizeText(candidate) === 'listening');
};

const isSupportedListeningContext = (context: RetirementCandidateContext): boolean =>
  [
    'tests',
    'drafts',
    'student_safe_tests',
    'homework_student_safe_tests',
    'session_test_payloads',
  ].includes(context.root);

const isSupportedListeningMaterial = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean => {
  if (!isSupportedListeningContext(context) || !isRecord(value)) {
    return false;
  }
  return isListeningRecord(value) || isListeningRecord(value.testData);
};

const collectDriveAudioPaths = (
  value: unknown,
  path: string,
  output: string[],
): void => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectDriveAudioPaths(child, `${path}/${index}`, output));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    const childPath = `${path}/${key}`;
    if (
      typeof child === 'string'
      && KNOWN_AUDIO_URL_FIELDS.has(key)
      && DRIVE_URL_PATTERN.test(child)
    ) {
      output.push(childPath);
      return;
    }
    collectDriveAudioPaths(child, childPath, output);
  });
};

export const getGoogleDriveAudioFieldPaths = (
  value: unknown,
  basePath = '',
): string[] => {
  const output: string[] = [];
  collectDriveAudioPaths(value, basePath, output);
  return [...new Set(output)].sort();
};

export const hasGoogleDriveAudio = (value: unknown): boolean =>
  getGoogleDriveAudioFieldPaths(value).length > 0;

const isCourseMaterialReference = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean =>
  pathMatchesRootRecord(context, 'course_materials')
  && isRecord(value)
  && typeof value.courseId === 'string'
  && typeof value.moduleId === 'string'
  && typeof value.materialId === 'string';

const isMaterialCatalogIndexContainer = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean =>
  pathMatchesRootRecord(context, 'material_catalog/material_indexes')
  && isRecord(value);

const isNotificationMailboxContainer = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean =>
  pathMatchesRootRecord(context, 'notifications')
  && isRecord(value);

const isSessionTestPayloadWrapper = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean =>
  pathMatchesRootRecord(context, 'session_test_payloads')
  && isRecord(value)
  && isRecord(value.testData)
  && typeof value.testId === 'string';

const isNonCandidateContainerOrReference = (
  value: unknown,
  context: RetirementCandidateContext,
): boolean =>
  isCourseMaterialReference(value, context)
  || isMaterialCatalogIndexContainer(value, context)
  || isNotificationMailboxContainer(value, context)
  || isSessionTestPayloadWrapper(value, context);

const getReadingV2MarkerEvidence = (
  value: unknown,
  basePath: string,
): string[] => {
  if (!isRecord(value)) {
    return [];
  }

  return READING_V2_ENGINE_FIELDS
    .filter((field) => normalizeText(value[field]) === 'reading-v2')
    .map((field) => `${basePath}/${field}=reading-v2`);
};

const makeDecision = (
  state: RetirementDecisionState,
  context: RetirementCandidateContext,
  reason: string,
  details: Partial<RetirementClassification> = {},
): RetirementClassification => ({
  state,
  reason,
  candidateId: context.path,
  evidence: details.evidence ?? [],
  markerEvidence: details.markerEvidence ?? [],
  plannedDeletionPaths: details.plannedDeletionPaths ?? [],
  retainedResultScrubPaths: details.retainedResultScrubPaths ?? [],
  protectedReadingV2Collision: details.protectedReadingV2Collision ?? false,
});

export const classifyRetirementCandidate = (
  value: unknown,
  context: RetirementCandidateContext,
): RetirementClassification => {
  if (!isRecord(value)) {
    return makeDecision('unknown-blocked', context, 'malformed-or-non-object-record', {
      evidence: ['non-object-record'],
    });
  }

  if (isReadingV2Material(value)) {
    return makeDecision('protect-reading-v2', context, 'canonical-reading-v2-marker', {
      markerEvidence: getReadingV2MarkerEvidence(value, context.path),
      protectedReadingV2Collision:
        hasApprovedLegacyReadingSignature(value) || isQuizMaterial(value, context),
    });
  }

  if (isThcsMaterial(value)) {
    return makeDecision('protect-thcs', context, 'thcs-or-thpt-material');
  }

  if (isR2ListeningMaterial(value)) {
    return makeDecision('protect-r2-listening', context, 'r2-listening-evidence');
  }

  if (isQuizMaterial(value, context)) {
    return makeDecision('retire-quiz', context, 'canonical-or-explicit-quiz-reference', {
      plannedDeletionPaths: [context.path],
    });
  }

  if (isReadingV1Material(value, context)) {
    return makeDecision(
      'retire-reading-v1',
      context,
      'approved-legacy-reading-v1-producer-signature',
      {
        evidence: [
          'root=/tests/{testId}',
          'type=IELTS',
          'skill=Reading',
          'passages[].id/title/content/questionStart/questionEnd',
          'questions[].number/type/question/answer/passageId',
          'metadata.instructions',
          'settings.allowReview',
          'settings.showTimer',
        ],
        plannedDeletionPaths: [context.path],
      },
    );
  }

  const driveAudioPaths = getGoogleDriveAudioFieldPaths(value, context.path);
  if (driveAudioPaths.length > 0) {
    return makeDecision('retire-drive-backed-listening', context, 'google-drive-audio-url', {
      evidence: driveAudioPaths,
      plannedDeletionPaths: [context.path],
    });
  }

  if (isSupportedListeningMaterial(value, context)) {
    return makeDecision(
      'protect-supported-listening',
      context,
      'supported-listening-no-google-drive-audio',
    );
  }

  if (isNonCandidateContainerOrReference(value, context)) {
    return makeDecision(
      'protect-non-candidate',
      context,
      'reference-or-container-not-retired-material',
    );
  }

  return makeDecision('unknown-blocked', context, 'no-approved-retirement-signature');
};

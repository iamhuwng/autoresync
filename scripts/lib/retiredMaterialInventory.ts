import {
  READING_V2_ENGINE_FIELDS,
  isReadingV2Payload,
} from '../../src/config/readingV2FeatureFlags';
import {
  RETIREMENT_CLASSIFIER_SCHEMA_VERSION,
  classifyRetirementCandidate,
  isReadingV1Material,
  type RetirementClassification,
  type RetirementDecisionState,
} from '../../src/services/retirement/retiredMaterialClassifier';

export interface ReadOnlyDatabase {
  read(path: string): Promise<unknown>;
}

export const INVENTORY_READ_PATHS = [
  'quizzes',
  'tests',
  'drafts',
  'student_safe_tests',
  'homework_student_safe_tests',
  'homework_student_safe_test_access',
  'course_materials',
  'material_catalog/material_indexes',
  'materials',
  'session_test_payloads',
  'notifications',
  'game_sessions',
  'test_results',
  'test_results_by_student',
  'test_results_by_teacher',
  'test_results_by_session',
  'test_results_by_course',
  'test_results_by_class',
  'test_results_solo_practice_by_student',
  'classes',
  'courses',
  'reading_v2',
] as const;

type InventoryReadPath = (typeof INVENTORY_READ_PATHS)[number];
type UnknownRecord = Readonly<{ path: string; reason: string }>;
type RootClassification = RetirementClassification & Readonly<{ path: string }>;

const DRIVE_HOST_PATTERN =
  /(?:drive\.google\.com|docs\.google\.com\/file|drive\.usercontent\.google\.com)/i;
const ACTIVE_SESSION_STATUSES = new Set(['waiting', 'in-progress', 'active']);
const RESULT_INDEX_PATHS = [
  'test_results_by_student',
  'test_results_by_teacher',
  'test_results_by_session',
  'test_results_by_course',
  'test_results_by_class',
  'test_results_solo_practice_by_student',
] as const;

const RESULT_INDEX_LEAF_DEPTHS: Record<(typeof RESULT_INDEX_PATHS)[number], number> = {
  test_results_by_student: 2,
  test_results_by_teacher: 2,
  test_results_by_session: 2,
  test_results_by_course: 3,
  test_results_by_class: 3,
  test_results_solo_practice_by_student: 2,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const entriesOf = (value: unknown): Array<[string, unknown]> =>
  isRecord(value) ? Object.entries(value) : [];

const hasCollectionItems = (value: unknown): boolean =>
  (Array.isArray(value) && value.length > 0)
  || (isRecord(value) && Object.keys(value).length > 0);

const collectionValues = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];

const hasOwn = (value: Record<string, unknown>, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, field);

const hasFields = (value: unknown, fields: readonly string[]): boolean =>
  isRecord(value) && fields.every((field) => hasOwn(value, field));

const hasExplicitEngineField = (value: unknown): boolean =>
  isRecord(value)
  && READING_V2_ENGINE_FIELDS.some((field) => typeof value[field] === 'string');

const hasNestedField = (value: unknown, field: string): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => hasNestedField(item, field));
  }
  if (!isRecord(value)) {
    return false;
  }
  return hasOwn(value, field)
    || Object.values(value).some((item) => hasNestedField(item, field));
};

const isLegacyReadingProducerShape = (value: unknown): boolean => {
  if (!isRecord(value) || isReadingV2Payload(value)) {
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

const collectDriveUrlPaths = (
  value: unknown,
  path: string,
  output: string[],
): void => {
  if (typeof value === 'string') {
    if (DRIVE_HOST_PATTERN.test(value)) {
      output.push(path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDriveUrlPaths(item, `${path}/${index}`, output));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, item]) =>
      collectDriveUrlPaths(item, `${path}/${key}`, output));
  }
};

const visitRecords = (
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => visitRecords(item, visitor));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  visitor(value);
  Object.values(value).forEach((item) => visitRecords(item, visitor));
};

const summarizeRoot = (value: unknown) => {
  const records = entriesOf(value);
  let malformedTopLevelRecords = 0;

  records.forEach(([, record]) => {
    if (!isRecord(record)) {
      malformedTopLevelRecords += 1;
    }
  });

  return {
    topLevelRecordCount: records.length,
    malformedTopLevelRecords,
  };
};

const countNodesAtDepth = (value: unknown, remainingDepth: number): number => {
  if (remainingDepth === 0) {
    return value === null || value === undefined ? 0 : 1;
  }
  if (!isRecord(value)) {
    return 0;
  }

  return Object.values(value).reduce<number>(
    (count, child) => count + countNodesAtDepth(child, remainingDepth - 1),
    0,
  );
};

const RETIREMENT_STATES: RetirementDecisionState[] = [
  'retire-reading-v1',
  'retire-quiz',
  'retire-drive-backed-listening',
  'protect-reading-v2',
  'protect-thcs',
  'protect-r2-listening',
  'unknown-blocked',
];
const CLASSIFICATION_READ_PATHS: InventoryReadPath[] = [
  'quizzes',
  'tests',
  'drafts',
  'student_safe_tests',
  'homework_student_safe_tests',
  'homework_student_safe_test_access',
  'course_materials',
  'material_catalog/material_indexes',
  'materials',
  'session_test_payloads',
  'notifications',
];

const topLevelRecordContexts = (
  snapshots: Record<InventoryReadPath, unknown>,
): Array<{ path: string; root: string; value: unknown }> =>
  CLASSIFICATION_READ_PATHS.flatMap((root) =>
    entriesOf(snapshots[root]).map(([id, value]) => ({
      path: `/${root}/${id}`,
      root,
      value,
    })));

const emptyCandidateIdsByState = (): Record<RetirementDecisionState, string[]> => {
  const byState = {} as Record<RetirementDecisionState, string[]>;
  RETIREMENT_STATES.forEach((state) => {
    byState[state] = [];
  });
  return byState;
};

const countByReason = (
  decisions: readonly RootClassification[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  decisions.forEach((decision) => {
    if (!decision.state.startsWith('retire-')) {
      return;
    }
    counts[decision.reason] = (counts[decision.reason] ?? 0) + 1;
  });
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) =>
    left.localeCompare(right)));
};

const buildCandidateIdsByState = (
  decisions: readonly RootClassification[],
): Record<RetirementDecisionState, string[]> => {
  const byState = emptyCandidateIdsByState();
  decisions.forEach((decision) => {
    byState[decision.state].push(decision.path);
  });
  RETIREMENT_STATES.forEach((state) => {
    byState[state].sort();
  });
  return byState;
};

export interface RetiredMaterialInventoryOptions {
  readonly projectId: string;
  readonly sourceRevision: string;
  readonly generatedAt: string;
}

export const RETIREMENT_OWNERSHIP = {
  googleDrive: [
    'src/services/googleDrive.js',
    'src/services/googleDrive.d.ts',
    'src/services/googleDriveAudio.ts',
    'src/config/env.config.ts',
    'src/skills/listening/builders/ListeningTestBuilder.tsx',
    'src/skills/listening/components/AudioPlayer.tsx',
    'src/components/ui/DeprecatedAudioBadge.tsx',
  ],
  readingV1: [
    'src/components/test-creation/TestCreationModal.tsx',
    'src/skills/reading/components/ReadingTestPage.tsx',
    'src/skills/reading/components/index.ts',
    'src/components/practice/IELTSPracticeView',
    'src/pages/TestPageRouter.tsx',
    'src/pages/StudentPracticePage.tsx',
  ],
  quiz: [
    'src/components/QuizEditor.jsx',
    'src/pages/StudentQuizPageNew.jsx',
    'src/pages/StudentQuizPage.jsx',
    'src/pages/TeacherQuizPage.jsx',
    'src/services/sessionManager.js',
    'src/services/sessionHelpers.js',
    'src/services/firebaseQueryOptimizer.js',
    'r2-backup-worker/src/homework/assignments.ts',
  ],
  protected: [
    'src/config/readingV2FeatureFlags.ts',
    'src/services/reading-v2/readingV2LaunchIntegration.service.ts',
    'src/services/reading-v2/readingV2RuntimeSubmission.service.ts',
    'src/components/reading-v2/runtime/ReadingV2RuntimeShell',
    'src/components/results/ReadingV2ReviewContentAdapter.tsx',
    'src/services/r2Storage.ts',
    'src/services/listeningTestStorage.ts',
    'src/components/practice/ListeningPracticeView.tsx',
    'src/components/writing-practice/WritingPracticeView',
    'src/components/thcs-student',
  ],
} as const;

export const RETIREMENT_ENTRY_POINTS = {
  teacher: [
    'src/components/test-creation/TestCreationModal.tsx',
    'src/pages/TeacherLobbyPage.jsx',
    'src/pages/AdminMaterialsPage.tsx',
    'src/components/course/MaterialSelectorModal.tsx',
    'src/components/session/CreateSessionModal.tsx',
  ],
  student: [
    'src/pages/StudentLibraryPage.tsx',
    'src/pages/StudentHomeworkDetailPage.tsx',
    'src/pages/StudentCourseDetailPage.tsx',
    'src/pages/StudentPracticePage.tsx',
    'src/pages/StudentWaitingRoomPage.jsx',
    'src/pages/TestPageRouter.tsx',
    'src/pages/StudentTestResultsPage.tsx',
  ],
  dedicatedQuizRoutes: [
    '/student-quiz/:gameSessionId',
    'src/routes/teacherRoutes.tsx: TeacherQuizPage',
  ],
  sharedFallbacks: [
    "src/pages/TestPageRouter.tsx: loadNonThcsSkill('Reading')",
    'src/pages/StudentPracticePage.tsx: inferIeltsSkillFromMaterialId(materialId)',
  ],
} as const;

export const FIREBASE_SCHEMA_INVENTORY = [
  { path: '/quizzes', store: 'rtdb', fields: ['id', 'title', 'questions', 'createdBy'] },
  { path: '/tests', store: 'rtdb', fields: ['id', 'type', 'testType', 'skill', 'passages', 'questions', 'audioSections'] },
  { path: '/drafts', store: 'rtdb', fields: ['id', 'testType', 'skill', 'ownerId', 'audioSections'] },
  { path: '/student_safe_tests', store: 'rtdb', fields: ['id', 'type', 'skill', 'passages', 'questions', 'audioSections'] },
  { path: '/homework_assignments', store: 'firestore', fields: ['createdBy', 'contentType', 'contentId', 'targetType', 'classId', 'studentSafeTestPayloadPath'] },
  { path: '/homework_student_safe_tests', store: 'rtdb', fields: ['teacherId', 'targetType', 'classId', 'testData'] },
  { path: '/homework_student_safe_test_access', store: 'rtdb', fields: ['studentId', 'allowed'] },
  { path: '/course_materials', store: 'rtdb', fields: ['courseId', 'moduleId', 'materialId', 'contentType'] },
  { path: '/material_catalog/material_indexes/**', store: 'rtdb', fields: ['materialId', 'ownerId', 'visibility', 'materialKind', 'testType'] },
  { path: '/materials', store: 'rtdb', fields: ['materialId', 'type', 'testId', 'quizId'] },
  { path: '/session_test_payloads', store: 'rtdb', fields: ['testId', 'testData', 'generatedAt'] },
  { path: '/notifications', store: 'rtdb', fields: ['testId', 'quizId', 'materialId', 'sessionCode', 'link'] },
  { path: '/game_sessions', store: 'rtdb', fields: ['mode', 'testId', 'quizId', 'activeTests', 'activeQuizzes', 'students'] },
  { path: '/test_results', store: 'rtdb', fields: ['resultId', 'testId', 'quizId', 'questionResults', 'formativeFeedback'] },
  { path: '/test_results_by_student', store: 'rtdb', fields: ['resultId', 'submittedAt'] },
  { path: '/test_results_by_teacher', store: 'rtdb', fields: ['resultId', 'submittedAt'] },
  { path: '/test_results_by_session', store: 'rtdb', fields: ['resultId', 'submittedAt'] },
  { path: '/test_results_by_course', store: 'rtdb', fields: ['studentId', 'resultId'] },
  { path: '/test_results_by_class', store: 'rtdb', fields: ['studentId', 'resultId'] },
  { path: '/reading_v2/**', store: 'rtdb', fields: [...READING_V2_ENGINE_FIELDS], protection: 'protected' },
  { path: '/media_assets/**', store: 'rtdb', fields: ['assetId', 'references', 'state'], protection: 'protected' },
] as const;

export async function buildRetiredMaterialInventory(
  database: ReadOnlyDatabase,
  options: RetiredMaterialInventoryOptions,
) {
  const snapshots = {} as Record<InventoryReadPath, unknown>;
  const readFailures: Array<{ path: string; error: string }> = [];

  for (const path of INVENTORY_READ_PATHS) {
    try {
      snapshots[path] = await database.read(path);
    } catch (error) {
      snapshots[path] = null;
      readFailures.push({
        path: `/${path}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const roots = Object.fromEntries(
    INVENTORY_READ_PATHS.map((path) => [path, summarizeRoot(snapshots[path])]),
  );
  const driveUrlFieldPaths: string[] = [];
  INVENTORY_READ_PATHS.forEach((path) =>
    collectDriveUrlPaths(snapshots[path], `/${path}`, driveUrlFieldPaths));

  let explicitReadingV2PayloadCount = 0;
  const markerCounts = new Map<string, number>();
  INVENTORY_READ_PATHS.forEach((path) => {
    visitRecords(snapshots[path], (record) => {
      if (isReadingV2Payload(record)) {
        explicitReadingV2PayloadCount += 1;
      }
      READING_V2_ENGINE_FIELDS.forEach((field) => {
        const normalizedValue = normalizeText(record[field]);
        if (normalizedValue === 'reading-v2') {
          markerCounts.set(field, (markerCounts.get(field) ?? 0) + 1);
        }
      });
    });
  });

  const testEntries = entriesOf(snapshots.tests);
  const testRecords = testEntries.filter((entry): entry is [string, Record<string, unknown>] =>
    isRecord(entry[1]));
  const unknownShapes: UnknownRecord[] = [];
  testEntries.forEach(([id, value]) => {
    if (!isRecord(value)) {
      unknownShapes.push({ path: `/tests/${id}`, reason: 'non-object-record' });
    } else if (
      !value.type
      && !value.testType
      && !value.skill
      && !value.skillType
      && !hasExplicitEngineField(value)
    ) {
      unknownShapes.push({
        path: `/tests/${id}`,
        reason: 'missing-type-skill-and-engine-marker',
      });
    }
  });

  const sessionEntries = entriesOf(snapshots.game_sessions);
  const sessionRecords = sessionEntries
    .map(([, value]) => value)
    .filter(isRecord);
  const resultIndexCounts = Object.fromEntries(
    RESULT_INDEX_PATHS.map((path) => [
      `/${path}`,
      countNodesAtDepth(snapshots[path], RESULT_INDEX_LEAF_DEPTHS[path]),
    ]),
  );
  const classifications: RootClassification[] = topLevelRecordContexts(snapshots)
    .map(({ path, root, value }) => ({
      ...classifyRetirementCandidate(value, { path, root }),
      path,
    }));
  const plannedDeletionPaths = classifications
    .flatMap((decision) => [...decision.plannedDeletionPaths])
    .sort();
  const retainedResultScrubPaths = driveUrlFieldPaths
    .filter((path) => path.startsWith('/test_results/'))
    .sort();
  const markerEvidence = classifications
    .flatMap((decision) => [...decision.markerEvidence])
    .sort();

  return {
    schemaVersion: 'retired-material-inventory-phase-2-v1',
    classifierSchemaVersion: RETIREMENT_CLASSIFIER_SCHEMA_VERSION,
    projectId: options.projectId,
    sourceRevision: options.sourceRevision,
    generatedAt: options.generatedAt,
    scope: 'read-only-schema-ownership-and-preliminary-manifest',
    classificationStatus: 'preliminary-reviewed-manifest-required',
    ownership: RETIREMENT_OWNERSHIP,
    entryPoints: RETIREMENT_ENTRY_POINTS,
    firebaseSchema: FIREBASE_SCHEMA_INVENTORY,
    roots,
    readFailures,
    routingMetadata: {
      tests: {
        totalRecords: testEntries.length,
        missingTestType: testRecords.filter(([, value]) => !value.type && !value.testType).length,
        missingSkill: testRecords.filter(([, value]) => !value.skill && !value.skillType).length,
        missingExplicitEngineMarker: testRecords.filter(([, value]) =>
          !hasExplicitEngineField(value)).length,
      },
      explicitReadingV2PayloadCount,
      readingV2MarkerOccurrences: READING_V2_ENGINE_FIELDS
        .map((field) => ({
          field,
          normalizedValue: 'reading-v2',
          count: markerCounts.get(field) ?? 0,
        }))
        .filter(({ count }) => count > 0),
    },
    legacyReadingSchemaEvidence: {
      status: 'observed-not-approved',
      sourceOwner: 'src/services/testStorage.ts: saveTestToFirebase',
      root: '/tests/{testId}',
      requiredFields: [
        'type=IELTS',
        'skill=Reading',
        'passages[].id',
        'passages[].title',
        'passages[].content',
        'passages[].questionStart',
        'passages[].questionEnd',
        'questions[].number',
        'questions[].type',
        'questions[].question',
        'questions[].answer',
        'questions[].passageId',
        'metadata.instructions',
        'settings.allowReview',
        'settings.showTimer',
      ],
      recordPaths: testRecords
        .filter(([id, value]) => isReadingV1Material(value, {
          path: `/tests/${id}`,
          root: 'tests',
        }))
        .map(([id]) => `/tests/${id}`)
        .sort(),
      warning:
        'Approved Phase 2 positive producer-shape signature only; absent Reading V2 markers are not evidence.',
    },
    driveUrlFieldPaths: [...new Set(driveUrlFieldPaths)].sort(),
    unknownShapes: unknownShapes.sort((left, right) => left.path.localeCompare(right.path)),
    sessions: {
      total: sessionEntries.length,
      active: sessionRecords.filter((value) =>
        ACTIVE_SESSION_STATUSES.has(normalizeText(value.status))).length,
      withQuizId: sessionRecords.filter((value) => Boolean(value.quizId)).length,
      withActiveQuizzes: sessionRecords.filter((value) =>
        hasCollectionItems(value.activeQuizzes)).length,
      withAssignedQuizId: sessionRecords.filter((value) =>
        hasNestedField(value.students, 'assignedQuizId')).length,
    },
    results: {
      records: entriesOf(snapshots.test_results).length,
      indexes: resultIndexCounts,
      preservation: 'protected-no-deletion-planning',
    },
    resultSourceLoadingSurfaces: [
      'src/services/resultFeedbackPayload.service.ts: getTestFromFirebase(result.testId)',
      'src/components/results/ResultDetailModal.tsx: test_results/{resultId}',
      'src/components/results/ResultSlidePanel.tsx: test_results/{resultId}',
      'src/pages/StudentTestResultsPage.tsx: saved result plus source compatibility reads',
      'src/pages/TeacherTestResultsPage.tsx: saved result plus source compatibility reads',
      'src/components/results/ReviewTab.tsx: result.questionResults',
      'src/components/results/SharedSavedResultCore.tsx: result.questionResults',
    ],
    protectedBoundaries: {
      readingV2: [
        '/reading_v2/**',
        'explicit engine/contentEngine/deliveryEngine/runtimeEngine=reading-v2 payloads',
      ],
      features: ['THCS', 'R2 Listening', 'Writing', 'test-mode live sessions'],
      records: [
        'completed academic results and all result indexes',
        'R2 asset registry and object state',
        'classes, courses, and modules',
        'closed game session records',
      ],
    },
    manifest: {
      projectId: options.projectId,
      generatedAt: options.generatedAt,
      sourceRevision: options.sourceRevision,
      classifierSchemaVersion: RETIREMENT_CLASSIFIER_SCHEMA_VERSION,
      candidateCountsByReason: countByReason(classifications),
      candidateIdsByState: buildCandidateIdsByState(classifications),
      markerEvidence,
      plannedDeletionPaths,
      retainedResultScrubPaths,
      driveUrlFieldPaths: [...new Set(driveUrlFieldPaths)].sort(),
      unknownBlockedRecords: classifications
        .filter((decision) => decision.state === 'unknown-blocked')
        .map((decision) => decision.path)
        .sort(),
      activeSessionCount: sessionRecords.filter((value) =>
        ACTIVE_SESSION_STATUSES.has(normalizeText(value.status))).length,
      protectedReadingV2CollisionCount: classifications.filter((decision) =>
        decision.protectedReadingV2Collision).length,
      plannedR2DeleteCount: 0,
    },
  };
}

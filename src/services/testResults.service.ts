/**
 * Test Results Storage Service
 * Handles persistence and retrieval of test results in Firebase
 * 
 * Features:
 * - Save complete test results with marking data
 * - Retrieve results by session, student, or result ID
 * - Query results for analytics
 * - Result history tracking
 */

import { ref, set, get, push, update } from 'firebase/database';
// @ts-ignore
import { database } from './firebase';
import { buildRoute } from '../constants/routes';
import { TestMarkingResult } from './autoMarking.service';
import {
  ReMarkEntry,
  ResultFilters,
  EnhancedTestResultRecord,
  FeedbackGenerationMeta,
  PassageResult,
  ResultVisibilityContextType,
  ResultVisibilitySnapshot,
} from '../types/results.types';
import type { ResultContext } from '../types/solo.types';
import { saveGuestResult } from './guestResultsService';
import type { SectionResult } from '../types/thcs-test.types';
import type { FormativeFeedback } from '../types/thcs-test.types';
import { resolveResultOwnership } from './resultOwnershipResolver';
import {
  clearUnresolvedResultVisibilityReport,
  upsertUnresolvedResultVisibilityReport,
} from './resultVisibilityReporting.service';
import {
  applyTeacherResultReindexPlan,
  buildTeacherResultReindexPlan,
  getCanonicalClassIndexId,
  getCanonicalCourseIndexId,
  isScopedIndexBackfillEligible,
  type ScopedIndexLocation,
  type TeacherIndexReindexPlan,
} from './resultVisibilityReindex.service';
import { classifyTeacherResultVisibility } from './resultVisibility.service';
import { classifySavedResultFeedbackKind } from './feedbackClassification.service';

/**
 * Complete test result record
 */
export interface TestResultRecord {
  resultId: string;
  sessionCode: string;
  testId: string;
  studentId: string;
  studentName: string;
  userId?: string;

  // Marking results
  totalScore: number;
  maxScore: number;
  percentage: number;
  bandScore: number;

  // Question details
  questionResults: Array<{
    questionNumber: number;
    questionType: string;
    isCorrect: boolean;
    score: number;
    maxScore: number;
    studentAnswer: any;
    correctAnswer: any;
    feedback: string;
    // Teacher feedback (PRD-0015: Phase 5)
    teacherFeedback?: string;
  }>;

  // Summary
  correct: number;
  incorrect: number;
  partialCredit: number;
  totalQuestions: number;

  // Metadata
  submittedAt: number;
  timeElapsed: number;
  testDuration: number;
  createdAt: number;
  updatedAt?: number;

  // Teaching context
  teacherId?: string; // Optional for now, will be required
  isGuest?: boolean;  // Optional for now, will be required

  // Re-marking history
  reMarkHistory?: ReMarkEntry[];
  lastReMarkedAt?: number;
  lastReMarkedBy?: string;

  // Test info
  testTitle: string;
  testType: string;
  testSkill: string;

  // Writing/Speaking extension
  writingSubmission?: {
    text: string;
    wordCount: number;
  };
  speakingSubmission?: {
    audioUrl: string;
    duration: number;
  };
  rubricScores?: {
    criterion: string;
    score: number;
    maxScore: number;
    feedback: string;
  }[];
  markingStatus?: 'auto-marked' | 'pending-review' | 'reviewed' | 'graded'; // PRD-0015: Phase 7 & 8, PRD-0030

  // Academic context (PRD-0015: Phase 3)
  courseId?: string | null;
  courseName?: string | null;
  classId?: string | null;
  className?: string | null;
  moduleId?: string | null;
  moduleName?: string | null;

  // Teacher Feedback (PRD-0015: Phase 5)
  overallFeedback?: string;
  feedbackUpdatedAt?: number;
  feedbackUpdatedBy?: string;
  feedbackUpdatedByTeacherId?: string;
  feedbackUpdatedByTeacherName?: string;
  hasFeedback?: boolean;

  // PRD-0016: Result context (class_session, homework, self_study, course_material)
  context?: ResultContext;

  /** PRD-0027: THCS-THPT specific grading data */
  thcsData?: {
    scaledScore: number; // 10-point scale (e.g., 8.3)
    sectionResults: SectionResult[]; // Full SectionResult[] from thcs-test.types.ts — includes intentBreakdown per section
    intentBreakdown: Record<string, { correct: number; total: number }>; // Merged intent breakdown across ALL sections
  };

  /** PRD-0039: IELTS passage breakdown */
  ieltsData?: {
    passageResults: PassageResult[];
  };

  /** PRD-0039: AI formative feedback */
  formativeFeedback?: FormativeFeedback;

  /** PRD-0039: Feedback pipeline status metadata */
  feedbackGenerationMeta?: FeedbackGenerationMeta;

  /** PRD-0041: Canonical teacher visibility snapshot */
  visibility?: ResultVisibilitySnapshot;
}

function inferVisibilityContextType(
  context?: ResultContext,
  hints?: {
    homeworkId?: string | null;
    classId?: string | null;
    courseId?: string | null;
    sessionCode?: string | null;
  }
): ResultVisibilityContextType | undefined {
  if (context?.type === 'homework') return 'homework';
  if (context?.type === 'class_session') return 'class_session';
  if (context?.type === 'course_material') return 'course_material';
  if (context?.type === 'self_study') return 'solo_practice';
  if (hints?.homeworkId) return 'homework';
  if (hints?.classId || hints?.courseId) return 'course_material';
  if (hints?.sessionCode) return 'class_session';
  return undefined;
}

function buildSourceNameSnapshot(result: Partial<TestResultRecord>): string | null {
  return (
    result.visibility?.sourceNameSnapshot
    ?? result.context?.source?.name
    ?? result.className
    ?? result.courseName
    ?? result.testTitle
    ?? null
  );
}

function buildStrongestKnownSourceClue(
  result: Partial<TestResultRecord>,
  fallbackSourceId?: string | null
): string | null {
  const sourceType = result.visibility?.sourceType;
  const sourceId = result.visibility?.sourceId ?? fallbackSourceId ?? null;

  if (!sourceType || !sourceId) {
    return null;
  }

  return `${sourceType}:${sourceId}`;
}

function isPermissionDeniedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /permission denied/i.test(message) || /permission_denied/i.test(message);
}

function sanitizeRtdbValue<T>(value: T): T {
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
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => ([
      key,
      entry === undefined ? null : sanitizeRtdbValue(entry),
    ]));

    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}

function getTeacherIndexOwnerId(result: Partial<TestResultRecord>): string | null {
  if (!result.visibility?.ownershipResolved) {
    return null;
  }
  if (result.visibility.contextType === 'solo_practice') {
    return null;
  }
  return result.visibility.visibilityOwnerTeacherId ?? null;
}

function isSoloPracticeResult(result: Pick<TestResultRecord, 'visibility'>): boolean {
  return Boolean(
    result.visibility
    && result.visibility.ownershipResolved
    && result.visibility.contextType === 'solo_practice'
  );
}

function buildStudentIndexRow(
  result: Pick<TestResultRecord, 'resultId' | 'sessionCode' | 'testId' | 'percentage' | 'submittedAt'>
): Record<string, unknown> {
  return {
    resultId: result.resultId,
    sessionCode: result.sessionCode,
    testId: result.testId,
    percentage: result.percentage,
    submittedAt: result.submittedAt,
  };
}

function buildSoloPracticeStudentIndexRow(
  result: Pick<TestResultRecord, 'resultId' | 'sessionCode' | 'testId' | 'percentage' | 'submittedAt'>
): Record<string, unknown> {
  return buildStudentIndexRow(result);
}

function buildSessionIndexRow(
  result: Pick<TestResultRecord, 'resultId' | 'studentId' | 'studentName' | 'percentage' | 'submittedAt'>
): Record<string, unknown> {
  return {
    resultId: result.resultId,
    studentId: result.studentId,
    studentName: result.studentName,
    percentage: result.percentage,
    submittedAt: result.submittedAt,
  };
}

function buildTeacherIndexRow(
  result: Pick<TestResultRecord, 'resultId' | 'sessionCode' | 'studentId' | 'studentName' | 'percentage' | 'submittedAt' | 'isGuest'>
): Record<string, unknown> {
  return {
    resultId: result.resultId,
    sessionCode: result.sessionCode,
    studentId: result.studentId,
    studentName: result.studentName,
    percentage: result.percentage,
    submittedAt: result.submittedAt,
    isGuest: Boolean(result.isGuest),
  };
}

function buildCourseIndexRow(
  result: Pick<TestResultRecord, 'resultId' | 'studentId' | 'studentName' | 'percentage' | 'bandScore' | 'testTitle' | 'testSkill' | 'submittedAt' | 'moduleId'>
): Record<string, unknown> {
  return {
    resultId: result.resultId,
    studentId: result.studentId,
    studentName: result.studentName,
    percentage: result.percentage,
    bandScore: result.bandScore,
    testTitle: result.testTitle,
    testSkill: result.testSkill,
    submittedAt: result.submittedAt,
    moduleId: result.moduleId ?? null,
  };
}

function buildClassIndexRow(
  result: Pick<TestResultRecord, 'resultId' | 'studentId' | 'studentName' | 'percentage' | 'bandScore' | 'testTitle' | 'testSkill' | 'submittedAt'>,
  courseId: string | null
): Record<string, unknown> {
  return {
    resultId: result.resultId,
    studentId: result.studentId,
    studentName: result.studentName,
    percentage: result.percentage,
    bandScore: result.bandScore,
    testTitle: result.testTitle,
    testSkill: result.testSkill,
    submittedAt: result.submittedAt,
    courseId,
  };
}

function buildResultPersistenceUpdates(
  result: TestResultRecord
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    [`test_results/${result.resultId}`]: result,
    [`test_results_by_session/${result.sessionCode}/${result.resultId}`]: buildSessionIndexRow(result),
    [`test_results_by_student/${result.studentId}/${result.resultId}`]: buildStudentIndexRow(result),
  };

  if (isSoloPracticeResult(result)) {
    updates[`test_results_solo_practice_by_student/${result.studentId}/${result.resultId}`] =
      buildSoloPracticeStudentIndexRow(result);
  }

  const teacherIndexOwnerId = getTeacherIndexOwnerId(result);
  if (teacherIndexOwnerId) {
    updates[`test_results_by_teacher/${teacherIndexOwnerId}/${result.resultId}`] =
      buildTeacherIndexRow(result);
  }

  const canWriteScopedIndexes = isScopedIndexBackfillEligible(result);
  const canonicalCourseId = getCanonicalCourseIndexId(result);
  const canonicalClassId = getCanonicalClassIndexId(result);

  if (canWriteScopedIndexes && canonicalCourseId) {
    updates[`test_results_by_course/${canonicalCourseId}/${result.studentId}/${result.resultId}`] =
      buildCourseIndexRow(result);
  }

  if (canWriteScopedIndexes && canonicalClassId) {
    updates[`test_results_by_class/${canonicalClassId}/${result.studentId}/${result.resultId}`] =
      buildClassIndexRow(result, canonicalCourseId);
  }

  return updates;
}

function applyResultFilters(
  results: TestResultRecord[],
  filters?: ResultFilters
): TestResultRecord[] {
  let filteredResults = results;

  if (!filters) {
    return filteredResults;
  }

  if (filters.sessionCode) {
    filteredResults = filteredResults.filter((result) => result.sessionCode === filters.sessionCode);
  }

  if (filters.classId) {
    filteredResults = filteredResults.filter((result) => result.classId === filters.classId);
  }

  if (filters.dateFrom) {
    filteredResults = filteredResults.filter((result) => result.submittedAt >= filters.dateFrom!);
  }

  if (filters.dateTo) {
    filteredResults = filteredResults.filter((result) => result.submittedAt <= filters.dateTo!);
  }

  if (filters.testType) {
    filteredResults = filteredResults.filter((result) => result.testType === filters.testType);
  }

  if (filters.skill) {
    filteredResults = filteredResults.filter((result) => result.testSkill === filters.skill);
  }

  if (filters.scoreMin !== undefined) {
    filteredResults = filteredResults.filter((result) => result.percentage >= filters.scoreMin!);
  }

  if (filters.scoreMax !== undefined) {
    filteredResults = filteredResults.filter((result) => result.percentage <= filters.scoreMax!);
  }

  if (filters.isGuest !== undefined) {
    filteredResults = filteredResults.filter((result) => !!result.isGuest === filters.isGuest);
  }

  return filteredResults;
}

async function syncUnresolvedVisibilityReportSafely(
  result: TestResultRecord,
  options?: {
    sourceLookupAttempted?: boolean;
    strongestKnownSourceClue?: string | null;
  }
): Promise<void> {
  try {
    await syncUnresolvedVisibilityReport(result, options);
  } catch (error) {
    console.warn('[TestResults] Non-blocking unresolved visibility report sync failed', error);
  }
}

function isStoredResultRecord(value: unknown): value is TestResultRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<TestResultRecord>;
  return (
    typeof record.resultId === 'string'
    && typeof record.studentId === 'string'
    && typeof record.sessionCode === 'string'
  );
}

function buildExistingTeacherIdsByResultId(
  teacherIndexTree: unknown
): Record<string, string[]> {
  if (!teacherIndexTree || typeof teacherIndexTree !== 'object' || Array.isArray(teacherIndexTree)) {
    return {};
  }

  const mapping: Record<string, string[]> = {};

  for (const [teacherId, resultBucket] of Object.entries(teacherIndexTree as Record<string, unknown>)) {
    if (!resultBucket || typeof resultBucket !== 'object' || Array.isArray(resultBucket)) {
      continue;
    }

    for (const resultId of Object.keys(resultBucket as Record<string, unknown>)) {
      if (!mapping[resultId]) {
        mapping[resultId] = [];
      }
      mapping[resultId].push(teacherId);
    }
  }

  return mapping;
}

function buildExistingScopedLocationsByResultId(
  scopedIndexTree: unknown
): Record<string, ScopedIndexLocation[]> {
  if (!scopedIndexTree || typeof scopedIndexTree !== 'object' || Array.isArray(scopedIndexTree)) {
    return {};
  }

  const mapping: Record<string, ScopedIndexLocation[]> = {};

  for (const [scopeId, studentBuckets] of Object.entries(scopedIndexTree as Record<string, unknown>)) {
    if (!studentBuckets || typeof studentBuckets !== 'object' || Array.isArray(studentBuckets)) {
      continue;
    }

    for (const [studentId, resultBucket] of Object.entries(studentBuckets as Record<string, unknown>)) {
      if (!resultBucket || typeof resultBucket !== 'object' || Array.isArray(resultBucket)) {
        continue;
      }

      for (const resultId of Object.keys(resultBucket as Record<string, unknown>)) {
        if (!mapping[resultId]) {
          mapping[resultId] = [];
        }

        mapping[resultId].push({ scopeId, studentId });
      }
    }
  }

  return mapping;
}

function buildExistingStudentIdsByResultId(
  studentIndexTree: unknown
): Record<string, string[]> {
  if (!studentIndexTree || typeof studentIndexTree !== 'object' || Array.isArray(studentIndexTree)) {
    return {};
  }

  const mapping: Record<string, string[]> = {};

  for (const [studentId, resultBucket] of Object.entries(studentIndexTree as Record<string, unknown>)) {
    if (!resultBucket || typeof resultBucket !== 'object' || Array.isArray(resultBucket)) {
      continue;
    }

    for (const resultId of Object.keys(resultBucket as Record<string, unknown>)) {
      if (!mapping[resultId]) {
        mapping[resultId] = [];
      }

      mapping[resultId].push(studentId);
    }
  }

  return mapping;
}

async function syncUnresolvedVisibilityReport(
  result: TestResultRecord,
  options?: {
    sourceLookupAttempted?: boolean;
    strongestKnownSourceClue?: string | null;
  }
): Promise<void> {
  if (result.visibility?.ownershipResolved) {
    await clearUnresolvedResultVisibilityReport(result.resultId);
    return;
  }

  await upsertUnresolvedResultVisibilityReport({
    resultId: result.resultId,
    studentId: result.studentId,
    visibility: result.visibility ?? null,
    sourceLookupAttempted: options?.sourceLookupAttempted ?? Boolean(result.visibility),
    strongestKnownSourceClue:
      options?.strongestKnownSourceClue
      ?? buildStrongestKnownSourceClue(result),
  });
}

async function rebuildSoloPracticeStudentIndexes(
  results: TestResultRecord[]
): Promise<{ rebuilt: number; deleted: number }> {
  const snapshot = await get(ref(database, 'test_results_solo_practice_by_student'));
  const existingStudentIdsByResultId = buildExistingStudentIdsByResultId(
    snapshot.exists() ? snapshot.val() : null
  );
  const updates: Record<string, Record<string, unknown> | null> = {};
  let rebuilt = 0;
  let deleted = 0;

  for (const result of results) {
    const existingStudentIds = existingStudentIdsByResultId[result.resultId] ?? [];
    const canonicalStudentId = isSoloPracticeResult(result) ? result.studentId : null;

    for (const studentId of existingStudentIds) {
      if (studentId === canonicalStudentId) {
        continue;
      }

      updates[`test_results_solo_practice_by_student/${studentId}/${result.resultId}`] = null;
      deleted += 1;
    }

    if (canonicalStudentId && !existingStudentIds.includes(canonicalStudentId)) {
      updates[`test_results_solo_practice_by_student/${canonicalStudentId}/${result.resultId}`] =
        buildSoloPracticeStudentIndexRow(result);
      rebuilt += 1;
    }
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }

  return { rebuilt, deleted };
}

async function resolveVisibilityForResult(
  result: TestResultRecord
) {
  return resolveResultOwnership({
    result,
    teacherId: result.teacherId ?? null,
    contextType: inferVisibilityContextType(result.context, {
      homeworkId: result.context?.assignment?.homeworkId ?? null,
      classId: result.classId ?? null,
      courseId: result.courseId ?? null,
      sessionCode: result.sessionCode ?? null,
    }),
    homeworkId: result.context?.assignment?.homeworkId ?? null,
    sessionCode: result.sessionCode ?? null,
    classId: result.classId ?? null,
    courseId: result.courseId ?? null,
    sourceNameSnapshot: buildSourceNameSnapshot(result),
  });
}

async function ensureResultVisibility(
  result: TestResultRecord,
  options?: { repairUnresolved?: boolean }
): Promise<TestResultRecord> {
  if (result.visibility && (result.visibility.ownershipResolved || !options?.repairUnresolved)) {
    await syncUnresolvedVisibilityReportSafely(result);
    return result;
  }

  const visibilityResult = await resolveVisibilityForResult(result);

  const enrichedResult: TestResultRecord = {
    ...result,
    visibility: visibilityResult.visibility,
  };

  await update(ref(database, `test_results/${result.resultId}`), {
    visibility: visibilityResult.visibility,
  });
  await syncUnresolvedVisibilityReportSafely(enrichedResult, {
    sourceLookupAttempted: visibilityResult.sourceLookupAttempted,
    strongestKnownSourceClue: visibilityResult.strongestKnownSourceClue,
  });

  return enrichedResult;
}

function isCanonicalTeacherOwnedResult(
  result: Pick<TestResultRecord, 'visibility'>,
  teacherId: string
): boolean {
  const visibility = result.visibility;

  return Boolean(
    visibility
    && visibility.ownershipResolved
    && visibility.visibilityOwnerTeacherId === teacherId
    && visibility.contextType !== 'solo_practice'
  );
}

function normalizeSavedResultText(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function shouldTriggerInitialFeedback(result: TestResultRecord): boolean {
  if (result.markingStatus !== 'auto-marked') {
    return false;
  }

  return classifySavedResultFeedbackKind(result) !== null;
}

async function triggerInitialSavedResultFeedback(resultId: string): Promise<void> {
  try {
    const { triggerFormativeFeedbackForSavedResult } = await import('./resultFeedbackGeneration.service');
    triggerFormativeFeedbackForSavedResult(resultId, { triggerSource: 'saveTestResult' });
  } catch (error) {
    console.warn(`[TestResults] Failed to trigger formative feedback for ${resultId}:`, error);
  }
}

/**
 * Save test results to Firebase
 * Stores under test_results/{resultId} and indexes by session and student
 */
export async function saveTestResult(
  sessionCode: string,
  testId: string,
  studentId: string,
  studentName: string,
  markingResult: TestMarkingResult,
  testMetadata: {
    title: string;
    type: string;
    skill: string;
    duration: number;
  },
  timeElapsed: number,
  teacherId?: string,
  isGuest?: boolean,
  submissionContent?: {
    writing?: { text: string; wordCount: number };
    speaking?: { audioUrl: string; duration: number };
  },
  academicContext?: {
    courseId?: string;
    courseName?: string;
    classId?: string;
    className?: string;
    moduleId?: string;
    moduleName?: string;
  },
  context?: ResultContext, // PRD-0016: Result context (class_session, homework, self_study, course_material)
  thcsData?: TestResultRecord['thcsData'], // PRD-0027: THCS grading data
  ieltsData?: TestResultRecord['ieltsData'], // PRD-0039: IELTS passage results
  options?: {
    skipInitialFeedbackTrigger?: boolean;
  }
): Promise<string> {
  try {
    // PRD-0015: Phase 7 - Route guest results to separate storage
    if (isGuest) {
      return await saveGuestResultInternal(
        studentName,
        markingResult,
        testMetadata,
        sessionCode,
        testId,
        studentId,
        timeElapsed,
        teacherId,
        submissionContent,
        academicContext
      );
    }

    // Generate unique result ID
    const resultRef = push(ref(database, 'test_results'));
    const resultId = resultRef.key;

    if (!resultId) {
      throw new Error('Failed to generate result ID');
    }

    // Calculate band score (assuming this function exists in autoMarking.service)
    const { calculateBandScore } = await import('./autoMarking.service');
    const bandScore = calculateBandScore(markingResult.percentage);

    // Prepare result record
    // IMPORTANT: Firebase Realtime Database rejects `undefined` values.
    // Only include optional fields when they have actual values.
    const resultRecord: Partial<TestResultRecord> = {
      resultId,
      sessionCode,
      testId,
      studentId,
      studentName,

      totalScore: markingResult.totalScore,
      maxScore: markingResult.maxScore,
      percentage: markingResult.percentage,
      bandScore,

      questionResults: markingResult.questionResults.map((qr) => ({
        questionNumber: qr.questionNumber,
        questionType: qr.questionType,
        isCorrect: qr.isCorrect,
        score: qr.score,
        maxScore: qr.maxScore,
        studentAnswer: qr.studentAnswer ?? '',
        correctAnswer: qr.correctAnswer ?? '',
        feedback: qr.feedback ?? '',
      })),

      correct: markingResult.summary.correct,
      incorrect: markingResult.summary.incorrect,
      partialCredit: markingResult.summary.partialCredit,
      totalQuestions: markingResult.summary.totalQuestions,

      submittedAt: markingResult.completedAt,
      timeElapsed,
      testDuration: testMetadata.duration,
      createdAt: Date.now(),

      testTitle: testMetadata.title,
      testType: testMetadata.type,
      testSkill: testMetadata.skill,

      // PRD-0015: Phase 7 & 8 - Marking status
      markingStatus: submissionContent?.writing || submissionContent?.speaking ? 'pending-review' : 'auto-marked',

      // Academic context (PRD-0015: Phase 3)
      courseId: academicContext?.courseId || null,
      courseName: academicContext?.courseName || null,
      classId: academicContext?.classId || null,
      className: academicContext?.className || null,
      moduleId: academicContext?.moduleId || null,
      moduleName: academicContext?.moduleName || null,
    };

    // Conditionally add optional fields (Firebase rejects undefined)
    if (teacherId) resultRecord.teacherId = teacherId;
    if (isGuest !== undefined) resultRecord.isGuest = isGuest;
    if (submissionContent?.writing) resultRecord.writingSubmission = submissionContent.writing;
    if (submissionContent?.speaking) resultRecord.speakingSubmission = submissionContent.speaking;
    if (context) resultRecord.context = context;
    if (thcsData) (resultRecord as any).thcsData = thcsData;
    if (ieltsData) resultRecord.ieltsData = ieltsData; // PRD-0039
    resultRecord.feedbackGenerationMeta = {
      kind: classifySavedResultFeedbackKind(resultRecord as TestResultRecord),
      lastAttemptAt: null,
      lastTriggerSource: null,
      lastOutcome: null,
      lastError: null,
    };

    const normalizedResultRecord = sanitizeRtdbValue(resultRecord) as TestResultRecord;
    const visibilityResult = await resolveVisibilityForResult(normalizedResultRecord);
    const persistedResultRecord = sanitizeRtdbValue({
      ...normalizedResultRecord,
      visibility: visibilityResult.visibility,
    }) as TestResultRecord;

    // Persist the canonical row first. The RTDB rules for several secondary indexes
    // validate against root.test_results/{resultId}, so a single multi-path fan-out
    // can fail even though the canonical payload is part of the same update.
    await set(resultRef, persistedResultRecord);

    const persistenceUpdates = sanitizeRtdbValue(
      buildResultPersistenceUpdates(persistedResultRecord)
    ) as Record<string, unknown>;
    await update(ref(database), persistenceUpdates);

    await syncUnresolvedVisibilityReportSafely(persistedResultRecord, {
      sourceLookupAttempted: visibilityResult.sourceLookupAttempted,
      strongestKnownSourceClue: visibilityResult.strongestKnownSourceClue,
    });

    if (!options?.skipInitialFeedbackTrigger && shouldTriggerInitialFeedback(persistedResultRecord)) {
      void triggerInitialSavedResultFeedback(resultId);
    }

    console.log(`💾 Test result saved: ${resultId}`);

    // PRD-0002: Dashboard feed notification (non-guest only)
    if (!isGuest) {
      try {
        const { createNotification } = await import('./notificationService');
        await createNotification({
          userId: studentId,
          type: 'success',
          title: '✅ Test Complete',
          message: `You completed "${testMetadata.title}". Score: ${markingResult.totalScore}/${markingResult.maxScore}`,
          link: buildRoute('RESULT_DETAIL', { resultId }),
          metadata: { resultId, testName: testMetadata.title, score: markingResult.totalScore, maxScore: markingResult.maxScore }
        });
        console.log(`📢 [TestResults] Feed notification sent for student ${studentId} completing test ${resultId}`);
      } catch (notifError) {
        console.warn('⚠️ [TestResults] Failed to send test-complete notification (non-blocking):', notifError);
      }
    }

    return resultId;
  } catch (error) {
    console.error('Error saving test result:', error);
    throw error;
  }
}

/**
 * Get a specific test result by ID
 */
export async function getTestResult(
  resultId: string,
  options?: {
    suppressPermissionDeniedLog?: boolean;
  }
): Promise<TestResultRecord | null> {
  try {
    const resultRef = ref(database, `test_results/${resultId}`);
    const snapshot = await get(resultRef);

    if (snapshot.exists()) {
      return ensureResultVisibility(snapshot.val() as TestResultRecord);
    }

    return null;
  } catch (error) {
    const shouldSuppressPermissionDeniedLog =
      options?.suppressPermissionDeniedLog && isPermissionDeniedError(error);

    if (!shouldSuppressPermissionDeniedLog) {
      console.error('Error getting test result:', error);
    }
    throw error;
  }
}

async function getAccessibleResultsByIds(
  resultIds: string[],
  indexLabel: string
): Promise<TestResultRecord[]> {
  if (resultIds.length === 0) {
    return [];
  }

  const settledResults = await Promise.allSettled(
    resultIds.map((resultId) => getTestResult(resultId, { suppressPermissionDeniedLog: true }))
  );

  const accessibleResults: TestResultRecord[] = [];
  const skippedResultIds: string[] = [];

  settledResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value) {
        accessibleResults.push(result.value);
      }
      return;
    }

    skippedResultIds.push(resultIds[index]);
  });

  if (skippedResultIds.length > 0) {
    console.warn(
      `[TestResults] Skipped ${skippedResultIds.length} inaccessible ${indexLabel} result(s)`,
      skippedResultIds
    );
  }

  return accessibleResults;
}

/**
 * Get all results for a session
 */
export async function getSessionResults(sessionCode: string): Promise<TestResultRecord[]> {
  try {
    const indexRef = ref(database, `test_results_by_session/${sessionCode}`);
    const indexSnapshot = await get(indexRef);

    if (!indexSnapshot.exists()) {
      return [];
    }

    const resultIds = Object.keys(indexSnapshot.val());

    return getAccessibleResultsByIds(resultIds, `session ${sessionCode}`);
  } catch (error) {
    console.error('Error getting session results:', error);
    throw error;
  }
}

/**
 * Get all results for a student
 */
export async function getStudentResults(studentId: string): Promise<TestResultRecord[]> {
  try {
    const indexRef = ref(database, `test_results_by_student/${studentId}`);
    const indexSnapshot = await get(indexRef);

    if (!indexSnapshot.exists()) {
      return [];
    }

    const resultIds = Object.keys(indexSnapshot.val());

    return getAccessibleResultsByIds(resultIds, `student ${studentId}`);
  } catch (error) {
    console.error('Error getting student results:', error);
    throw error;
  }
}

/**
 * Get all results for a teacher with optional filters
 */
export async function getTeacherResults(
  teacherId: string,
  filters?: ResultFilters
): Promise<TestResultRecord[]> {
  try {
    const indexRef = ref(database, `test_results_by_teacher/${teacherId}`);
    const indexSnapshot = await get(indexRef);

    if (!indexSnapshot.exists()) {
      return [];
    }

    const resultIds = Object.keys(indexSnapshot.val());

    let validResults = await getAccessibleResultsByIds(resultIds, `teacher ${teacherId}`);
    validResults = validResults.filter((result) => isCanonicalTeacherOwnedResult(result, teacherId));

    return applyResultFilters(validResults, filters);
  } catch (error) {
    console.error('Error getting teacher results:', error);
    throw error;
  }
}

async function getTeacherVisibleSoloPracticeResults(
  studentId: string,
  filters?: ResultFilters
): Promise<TestResultRecord[]> {
  try {
    const indexRef = ref(database, `test_results_solo_practice_by_student/${studentId}`);
    const indexSnapshot = await get(indexRef);

    if (!indexSnapshot.exists()) {
      return [];
    }

    const resultIds = Object.keys(indexSnapshot.val());
    const visibleResults = await getAccessibleResultsByIds(resultIds, `solo practice ${studentId}`);

    return applyResultFilters(
      visibleResults.filter(
        (result) => result.studentId === studentId && isSoloPracticeResult(result)
      ),
      filters
    );
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      console.warn(
        `[TestResults] Solo-practice index unavailable for student ${studentId}; continuing with teacher-owned rows only`
      );
      return [];
    }

    throw error;
  }
}

/**
 * Get teacher-visible results for a specific student.
 * Merges teacher-owned rows with solo-practice rows that are visible after
 * the outer assignment gate.
 */
export async function getTeacherStudentResults(
  teacherId: string,
  studentId: string,
  filters?: ResultFilters,
  options?: {
    hasAssignmentAccess?: boolean;
  }
): Promise<TestResultRecord[]> {
  if (!options?.hasAssignmentAccess) {
    return [];
  }

  const [teacherResults, soloPracticeResults] = await Promise.all([
    getTeacherResults(teacherId, filters),
    getTeacherVisibleSoloPracticeResults(studentId, filters),
  ]);

  const mergedResults = new Map<string, TestResultRecord>();

  teacherResults
    .filter((result) => result.studentId === studentId)
    .forEach((result) => {
      mergedResults.set(result.resultId, result);
    });

  soloPracticeResults.forEach((result) => {
    const verdict = classifyTeacherResultVisibility({
      result,
      teacherId,
      hasAssignmentAccess: true,
    });

    if (verdict.shouldDisplayInTeacherHistory) {
      mergedResults.set(result.resultId, result);
    }
  });

  return Array.from(mergedResults.values());
}

/**
 * Update a student's score for a specific question (re-marking)
 */
export async function updateResultScore(
  resultId: string,
  questionNumber: number,
  newScore: number,
  reason: string,
  remarkedBy: string
): Promise<void> {
  try {
    const result = await getTestResult(resultId);
    if (!result) throw new Error('Result not found');

    const questionIndex = result.questionResults.findIndex(q => q.questionNumber === questionNumber);
    if (questionIndex === -1) throw new Error('Question not found');

    if (!result.questionResults || !result.questionResults[questionIndex]) {
      throw new Error('Question data structure invalid');
    }

    const oldScore = result.questionResults[questionIndex].score;
    const scoreDiff = newScore - oldScore;

    // Update question specific data
    result.questionResults[questionIndex].score = newScore;
    result.questionResults[questionIndex].isCorrect = newScore > 0; // Simplified assumption

    // Update totals
    result.totalScore += scoreDiff;
    result.percentage = Math.round((result.totalScore / result.maxScore) * 100);

    // Recalculate band score if applicable
    const { calculateBandScore } = await import('./autoMarking.service');
    result.bandScore = calculateBandScore(result.percentage);

    // Update summary counts
    if (oldScore === 0 && newScore > 0) {
      result.correct++;
      result.incorrect--;
    } else if (oldScore > 0 && newScore === 0) {
      result.correct--;
      result.incorrect++;
    }

    // Add entry to re-marking history
    const historyEntry: ReMarkEntry = {
      questionNumber,
      originalScore: oldScore,
      newScore,
      reason,
      remarkedBy,
      remarkedAt: Date.now()
    };

    if (!result.reMarkHistory) {
      result.reMarkHistory = [];
    }
    result.reMarkHistory.push(historyEntry);

    result.lastReMarkedAt = Date.now();
    result.lastReMarkedBy = remarkedBy;
    result.updatedAt = Date.now();

    // Save updated result
    const resultRef = ref(database, `test_results/${resultId}`);
    await set(resultRef, result);

    // Update indexes since score/percentage changed
    // Session index
    const sessionIndexRef = ref(database, `test_results_by_session/${result.sessionCode}/${resultId}`);
    await update(sessionIndexRef, {
      percentage: result.percentage
    });

    // Student index
    const studentIndexRef = ref(database, `test_results_by_student/${result.studentId}/${resultId}`);
    await update(studentIndexRef, {
      percentage: result.percentage
    });

    const teacherIndexOwnerId = getTeacherIndexOwnerId(result);
    if (teacherIndexOwnerId) {
      const teacherIndexRef = ref(database, `test_results_by_teacher/${teacherIndexOwnerId}/${resultId}`);
      await update(teacherIndexRef, {
        percentage: result.percentage
      });
    }

    if (isSoloPracticeResult(result)) {
      const soloPracticeIndexRef = ref(database, `test_results_solo_practice_by_student/${result.studentId}/${resultId}`);
      await update(soloPracticeIndexRef, {
        percentage: result.percentage,
        submittedAt: result.submittedAt,
      });
    }

    const canonicalCourseId = getCanonicalCourseIndexId(result);
    if (canonicalCourseId) {
      const courseIndexRef = ref(database, `test_results_by_course/${canonicalCourseId}/${result.studentId}/${resultId}`);
      await update(courseIndexRef, {
        percentage: result.percentage,
        bandScore: result.bandScore,
      });
    }

    const canonicalClassId = getCanonicalClassIndexId(result);
    if (canonicalClassId) {
      const classIndexRef = ref(database, `test_results_by_class/${canonicalClassId}/${result.studentId}/${resultId}`);
      await update(classIndexRef, {
        percentage: result.percentage,
        bandScore: result.bandScore,
      });
    }

    console.log(`✏️ Result ${resultId} re-marked: Q${questionNumber} ${oldScore} -> ${newScore}`);
  } catch (error) {
    console.error('Error updating result score:', error);
    throw error;
  }
}

/**
 * Get re-marking history for a result
 */
export async function getReMarkHistory(resultId: string): Promise<ReMarkEntry[]> {
  try {
    const result = await getTestResult(resultId);
    if (!result) throw new Error('Result not found');

    return result.reMarkHistory || [];
  } catch (error) {
    console.error('Error getting remark history:', error);
    return []; // Return empty array on error to be safe
  }
}

/**
 * Mark a result as reviewed (PRD-0015: Phase 7 & 8)
 * Updates marking status from 'pending-review' to 'reviewed'
 * Used for Writing/Speaking tests after teacher provides feedback
 */
export async function markAsReviewed(
  resultId: string,
  reviewedBy: string
): Promise<void> {
  try {
    const result = await getTestResult(resultId);
    if (!result) {
      throw new Error('Result not found');
    }

    // Only allow marking as reviewed if currently pending
    if (result.markingStatus !== 'pending-review') {
      throw new Error(`Cannot mark as reviewed: current status is '${result.markingStatus}'`);
    }

    // Update the marking status
    const resultRef = ref(database, `test_results/${resultId}`);
    await update(resultRef, {
      markingStatus: 'reviewed',
      reviewedAt: Date.now(),
      reviewedBy: reviewedBy,
      updatedAt: Date.now(),
    });

    console.log(`✅ Result ${resultId} marked as reviewed by ${reviewedBy}`);

    // PRD-0015: Phase 7 & 8 - Send notification to student
    // Import is added at the top of the file
    try {
      const { sendReviewedNotification } = await import('./notificationService');
      await sendReviewedNotification(
        result.studentId,
        resultId,
        result.testTitle,
        result.testSkill as 'writing' | 'speaking',
        reviewedBy
      );
    } catch (notifError) {
      // Don't fail the whole operation if notification fails
      console.error('Failed to send reviewed notification:', notifError);
    }
  } catch (error) {
    console.error('Error marking result as reviewed:', error);
    throw error;
  }
}

/**
 * Get student's result for a specific session
 * 
 * CRITICAL FIX: Previously used getSessionResults(sessionCode) which reads ALL
 * result IDs from test_results_by_session/{sessionCode}, then fetches each from
 * test_results/{resultId}. Firebase security rules only allow students to read
 * their OWN results (data.child('studentId').val() === auth.uid), so reading
 * other students' results triggers "Permission denied" and breaks the entire query.
 * 
 * Now uses getStudentResults(studentId) which queries test_results_by_student/{studentId}
 * — only the student's own results, no permission conflicts.
 */
export async function getStudentSessionResult(
  studentId: string,
  sessionCode: string
): Promise<TestResultRecord | null> {
  try {
    // Use student index instead of session index to avoid permission errors
    // The student can only read their own results, not other students' results
    const studentResults = await getStudentResults(studentId);

    // Filter all results matching this sessionCode, then return the MOST RECENT.
    // A single session may contain multiple test submissions (teacher runs
    // multiple tests in the same live session). We must always show the latest.
    const matching = studentResults
      .filter(r => r.sessionCode === sessionCode)
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

    return matching[0] || null;
  } catch (error) {
    console.error('Error getting student session result:', error);
    throw error;
  }
}

/**
 * Calculate session statistics from stored results
 */
export async function getSessionStatistics(sessionCode: string): Promise<{
  totalStudents: number;
  averageScore: number;
  averagePercentage: number;
  averageBandScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
  completionRate: number;
}> {
  try {
    const results = await getSessionResults(sessionCode);

    if (results.length === 0) {
      return {
        totalStudents: 0,
        averageScore: 0,
        averagePercentage: 0,
        averageBandScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        completionRate: 0,
      };
    }

    const totalStudents = results.length;
    const totalScore = results.reduce((sum, r) => sum + r.totalScore, 0);
    const totalPercentage = results.reduce((sum, r) => sum + r.percentage, 0);
    const totalBandScore = results.reduce((sum, r) => sum + r.bandScore, 0);
    const passedStudents = results.filter((r) => r.percentage >= 60).length;

    const scores = results.map((r) => r.totalScore);
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    return {
      totalStudents,
      averageScore: totalScore / totalStudents,
      averagePercentage: totalPercentage / totalStudents,
      averageBandScore: totalBandScore / totalStudents,
      highestScore,
      lowestScore,
      passRate: (passedStudents / totalStudents) * 100,
      completionRate: 100, // All stored results are completed
    };
  } catch (error) {
    console.error('Error calculating session statistics:', error);
    throw error;
  }
}

/**
 * Delete a test result (and its indexes)
 */
export async function deleteTestResult(resultId: string): Promise<void> {
  try {
    const result = await getTestResult(resultId);

    if (!result) {
      throw new Error('Result not found');
    }

    // Delete main record
    const resultRef = ref(database, `test_results/${resultId}`);
    await set(resultRef, null);

    // Delete session index
    const sessionIndexRef = ref(database, `test_results_by_session/${result.sessionCode}/${resultId}`);
    await set(sessionIndexRef, null);

    // Delete student index
    const studentIndexRef = ref(database, `test_results_by_student/${result.studentId}/${resultId}`);
    await set(studentIndexRef, null);

    if (isSoloPracticeResult(result)) {
      const soloPracticeIndexRef = ref(database, `test_results_solo_practice_by_student/${result.studentId}/${resultId}`);
      await set(soloPracticeIndexRef, null);
    }

    const teacherIndexOwnerId = getTeacherIndexOwnerId(result);
    if (teacherIndexOwnerId) {
      const teacherIndexRef = ref(database, `test_results_by_teacher/${teacherIndexOwnerId}/${resultId}`);
      await set(teacherIndexRef, null);
    }

    const canonicalCourseId = getCanonicalCourseIndexId(result);
    if (canonicalCourseId) {
      const courseIndexRef = ref(database, `test_results_by_course/${canonicalCourseId}/${result.studentId}/${resultId}`);
      await set(courseIndexRef, null);
    }

    const canonicalClassId = getCanonicalClassIndexId(result);
    if (canonicalClassId) {
      const classIndexRef = ref(database, `test_results_by_class/${canonicalClassId}/${result.studentId}/${resultId}`);
      await set(classIndexRef, null);
    }

    try {
      await clearUnresolvedResultVisibilityReport(resultId);
    } catch (error) {
      console.warn('[TestResults] Non-blocking unresolved visibility report clear failed', error);
    }

    console.log(`🗑️ Test result deleted: ${resultId}`);
  } catch (error) {
    console.error('Error deleting test result:', error);
    throw error;
  }
}

/**
 * Delete all permanent result records for a student in a specific session.
 * Used when a teacher reopens a live submission so the student can submit again
 * without leaving stale result rows behind.
 */
export async function deleteStudentSessionResults(
  studentId: string,
  sessionCode: string
): Promise<number> {
  try {
    const studentResults = await getStudentResults(studentId);
    const matchingResults = studentResults.filter(
      (result) => result.sessionCode === sessionCode
    );

    if (matchingResults.length === 0) {
      return 0;
    }

    await Promise.all(
      matchingResults.map((result) => deleteTestResult(result.resultId))
    );

    console.log(
      `🗑️ Deleted ${matchingResults.length} test result(s) for ${studentId} in session ${sessionCode}`
    );
    return matchingResults.length;
  } catch (error) {
    console.error('Error deleting student session results:', error);
    throw error;
  }
}

/**
 * Check if result exists for student in session
 */
export async function hasStudentSubmitted(
  studentId: string,
  sessionCode: string
): Promise<boolean> {
  try {
    const result = await getStudentSessionResult(studentId, sessionCode);
    return result !== null;
  } catch (error) {
    console.error('Error checking student submission:', error);
    return false;
  }
}

/**
 * Count how many results a student has for a specific test/material
 * PRD-0025: Used by useSoloSubmission for maxAttempts enforcement
 */
export async function getStudentResultCount(
  studentId: string,
  testId: string
): Promise<number> {
  try {
    const indexRef = ref(database, `test_results_by_student/${studentId}`);
    const indexSnapshot = await get(indexRef);

    if (!indexSnapshot.exists()) return 0;

    const entries = indexSnapshot.val();
    let count = 0;
    for (const key of Object.keys(entries)) {
      if (entries[key]?.testId === testId) {
        count++;
      }
    }
    return count;
  } catch (error) {
    console.error('Error counting student results:', error);
    return 0; // Fail open
  }
}

/**
 * Internal helper: Save guest result using guestResultsService
 * PRD-0015: Phase 7 - Guest Results System
 */
async function saveGuestResultInternal(
  guestName: string,
  markingResult: TestMarkingResult,
  testMetadata: {
    title: string;
    type: string;
    skill: string;
    duration: number;
  },
  sessionCode: string,
  testId: string,
  studentId: string,
  timeElapsed: number,
  teacherId?: string,
  submissionContent?: {
    writing?: { text: string; wordCount: number };
    speaking?: { audioUrl: string; duration: number };
  },
  academicContext?: {
    courseId?: string;
    courseName?: string;
    classId?: string;
    className?: string;
    moduleId?: string;
    moduleName?: string;
  }
): Promise<string> {
  try {
    // Calculate band score
    const { calculateBandScore } = await import('./autoMarking.service');
    const bandScore = calculateBandScore(markingResult.percentage);

    // Build enhanced result record for guest
    const guestResult: EnhancedTestResultRecord = {
      resultId: '', // Will be generated by guestResultsService
      sessionCode,
      testId,
      studentId,
      studentName: guestName,

      totalScore: markingResult.totalScore,
      maxScore: markingResult.maxScore,
      percentage: markingResult.percentage,
      bandScore,

      questionResults: markingResult.questionResults.map((qr) => ({
        questionNumber: qr.questionNumber,
        questionType: qr.questionType,
        isCorrect: qr.isCorrect,
        score: qr.score,
        maxScore: qr.maxScore,
        studentAnswer: qr.studentAnswer,
        correctAnswer: qr.correctAnswer,
        feedback: qr.feedback,
      })),

      correct: markingResult.summary.correct,
      incorrect: markingResult.summary.incorrect,
      partialCredit: markingResult.summary.partialCredit,
      totalQuestions: markingResult.summary.totalQuestions,

      submittedAt: markingResult.completedAt,
      timeElapsed,
      testDuration: testMetadata.duration,
      createdAt: Date.now(),

      testTitle: testMetadata.title,
      testType: testMetadata.type as 'quiz' | 'test',
      testSkill: testMetadata.skill as 'reading' | 'listening' | 'writing' | 'speaking',

      teacherId: teacherId || '',
      isGuest: true,
      writingSubmission: submissionContent?.writing,
      speakingSubmission: submissionContent?.speaking,
      markingStatus: submissionContent?.writing || submissionContent?.speaking ? 'pending-review' : 'auto-marked',

      // Academic context
      courseId: academicContext?.courseId || null,
      courseName: academicContext?.courseName || null,
      classId: academicContext?.classId || null,
      className: academicContext?.className || null,
      moduleId: academicContext?.moduleId || null,
      moduleName: academicContext?.moduleName || null
    };

    // Save to guest_results via guestResultsService
    const resultId = await saveGuestResult(guestName, guestResult);

    console.log(`💾 Guest result saved: ${resultId} for ${guestName}`);
    return resultId;
  } catch (error) {
    console.error('Error saving guest result:', error);
    throw error;
  }
}

// ============================================
// PRD-0039: Slide Panel Service Queries
// ============================================

/**
 * PRD-0039 Task 2.4: Get all test attempts for a student on a specific test.
 * Grouping key: studentId + testId (Task 2.5 — NOT sessionCode).
 *
 * Algorithm:
 * - Read test_results_by_student/{studentId}
 * - Fetch each full record from test_results/{resultId}
 * - Keep only records whose testId === testId
 * - Sort by submittedAt DESC
 * - Return the full sorted array
 */
export async function getStudentTestAttempts(
  studentId: string,
  testId: string
): Promise<TestResultRecord[]> {
  try {
    const indexRef = ref(database, `test_results_by_student/${studentId}`);
    const indexSnapshot = await get(indexRef);

    if (!indexSnapshot.exists()) {
      return [];
    }

    const resultIds = Object.keys(indexSnapshot.val());

    const results = await getAccessibleResultsByIds(resultIds, `student ${studentId} attempts`);

    // Filter by testId and sort by submittedAt DESC
    return results
      .filter((r) => r.testId === testId)
      .sort((a, b) => b.submittedAt - a.submittedAt);
  } catch (error) {
    console.error('[TestResults] Error fetching student test attempts:', error);
    throw new Error('Failed to fetch student test attempts');
  }
}

/**
 * PRD-0039 Task 2.6: Get historical scores for trend analysis.
 *
 * Filtering rules (exact from task spec):
 * - If anchorResult.context?.type === 'homework' && anchorResult.testId → match by testId
 * - Else if anchorResult.testType === 'THCS-THPT' → match same testType and same lowercase testSkill
 * - Else if testType includes 'ielts' (case-insensitive) → match same lowercase testType
 * - Else → match same lowercase testType and same lowercase testSkill
 *
 * Sort by submittedAt DESC, return at most `limit` records.
 */
export async function getHistoricalScores(
  studentId: string,
  anchorResult: TestResultRecord,
  limit: number = 5
): Promise<TestResultRecord[]> {
  try {
    const indexRef = ref(database, `test_results_by_student/${studentId}`);
    const indexSnapshot = await get(indexRef);

    if (!indexSnapshot.exists()) {
      return [];
    }

    const resultIds = Object.keys(indexSnapshot.val());

    const validResults = await getAccessibleResultsByIds(resultIds, `student ${studentId} history`);

    // Determine filter function based on anchor result context
    const anchorContext = (anchorResult as any).context;
    const anchorTestType = String(anchorResult.testType || '').toLowerCase();
    const anchorTestSkill = String(anchorResult.testSkill || '').toLowerCase();

    let filtered: TestResultRecord[];

    if (anchorContext?.type === 'homework' && anchorResult.testId) {
      // Homework context: match by testId
      filtered = validResults.filter((r) => r.testId === anchorResult.testId);
    } else if (anchorResult.testType === 'THCS-THPT') {
      // THCS-THPT: match same testType and same lowercase testSkill
      filtered = validResults.filter(
        (r) =>
          String(r.testType || '').toLowerCase() === anchorTestType &&
          String(r.testSkill || '').toLowerCase() === anchorTestSkill
      );
    } else if (anchorTestType.includes('ielts')) {
      // IELTS: match same lowercase testType
      filtered = validResults.filter(
        (r) => String(r.testType || '').toLowerCase() === anchorTestType
      );
    } else {
      // Default: match same lowercase testType and same lowercase testSkill
      filtered = validResults.filter(
        (r) =>
          String(r.testType || '').toLowerCase() === anchorTestType &&
          String(r.testSkill || '').toLowerCase() === anchorTestSkill
      );
    }

    // Sort by submittedAt DESC and limit
    return filtered
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, limit);
  } catch (error) {
    console.error('[TestResults] Error fetching historical scores:', error);
    throw new Error('Failed to fetch historical scores');
  }
}

/**
 * PRD-0039 Task 2.7: Get class test scores for a specific test.
 *
 * Algorithm:
 * - If classId is missing, return []
 * - Read test_results_by_class/{classId}
 * - Flatten all student buckets into result IDs
 * - Fetch full records from test_results/{resultId}
 * - Keep only records with testId === testId
 * - Return the full filtered array
 */
export async function getClassTestScores(
  testId: string,
  classId: string | undefined | null
): Promise<TestResultRecord[]> {
  if (!classId) {
    return [];
  }

  try {
    const classIndexRef = ref(database, `test_results_by_class/${classId}`);
    const classSnapshot = await get(classIndexRef);

    if (!classSnapshot.exists()) {
      return [];
    }

    // Flatten: test_results_by_class/{classId}/{studentId}/{resultId}
    const classData = classSnapshot.val();
    const resultIds: string[] = [];

    for (const studentId of Object.keys(classData)) {
      const studentResults = classData[studentId];
      if (studentResults && typeof studentResults === 'object') {
        resultIds.push(...Object.keys(studentResults));
      }
    }

    if (resultIds.length === 0) {
      return [];
    }

    const results = await getAccessibleResultsByIds(resultIds, `class ${classId}`);

    // Filter by testId
    return results.filter((r) => r.testId === testId);
  } catch (error) {
    console.error('[TestResults] Error fetching class test scores:', error);
    throw new Error('Failed to fetch class test scores');
  }
}

export async function rebuildTeacherResultIndexes(): Promise<TeacherIndexReindexPlan> {
  try {
    const resultsSnapshot = await get(ref(database, 'test_results'));
    if (!resultsSnapshot.exists()) {
      const emptyPlan = buildTeacherResultReindexPlan({ results: [] });
      console.log('[ResultVisibilityReindex] No canonical results found to rebuild teacher indexes');
      return emptyPlan;
    }

    const storedResults = resultsSnapshot.val() as Record<string, unknown>;
    const canonicalResults = Object.values(storedResults).filter(isStoredResultRecord);
    const normalizedResults = await Promise.all(
      canonicalResults.map((result) => ensureResultVisibility(result, { repairUnresolved: true }))
    );

    const teacherIndexSnapshot = await get(ref(database, 'test_results_by_teacher'));
    const courseIndexSnapshot = await get(ref(database, 'test_results_by_course'));
    const classIndexSnapshot = await get(ref(database, 'test_results_by_class'));
    const existingTeacherIdsByResultId = buildExistingTeacherIdsByResultId(
      teacherIndexSnapshot.exists() ? teacherIndexSnapshot.val() : null
    );
    const existingCourseLocationsByResultId = buildExistingScopedLocationsByResultId(
      courseIndexSnapshot.exists() ? courseIndexSnapshot.val() : null
    );
    const existingClassLocationsByResultId = buildExistingScopedLocationsByResultId(
      classIndexSnapshot.exists() ? classIndexSnapshot.val() : null
    );

    const plan = buildTeacherResultReindexPlan({
      results: normalizedResults,
      existingTeacherIdsByResultId,
      existingCourseLocationsByResultId,
      existingClassLocationsByResultId,
    });

    const appliedPlan = await applyTeacherResultReindexPlan(plan);
    const soloPracticeRebuild = await rebuildSoloPracticeStudentIndexes(normalizedResults);
    console.log(
      `[ResultVisibilityReindex] rebuilt=${appliedPlan.rebuiltCount} deleted=${appliedPlan.deletedCount} skipped=${appliedPlan.skippedCount} unresolved=${appliedPlan.unresolvedCount} rebuiltCourse=${appliedPlan.rebuiltCourseCount} deletedCourse=${appliedPlan.deletedCourseCount} rebuiltClass=${appliedPlan.rebuiltClassCount} deletedClass=${appliedPlan.deletedClassCount} rebuiltSolo=${soloPracticeRebuild.rebuilt} deletedSolo=${soloPracticeRebuild.deleted}`
    );

    return appliedPlan;
  } catch (error) {
    console.error('Error rebuilding teacher result indexes:', error);
    throw error;
  }
}

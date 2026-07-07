// @ts-nocheck
/**
 * Test Storage Service
 * Handles saving and retrieving tests from Firebase
 * Uses structure defined in FIREBASE_TEST_STRUCTURE.md
 */

import { ref, set, get, update } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from './firebase';
import { withRestoreGuard } from './restoreGuard';
import type {
  Passage,
  ParsedQuestion,
  ReadingLabeledOption,
  ReadingOptionLabelFormat,
  ReadingSectionReference,
} from '../types/document.types';
import type { MaterialSoloConfig } from '../types/solo.types';
import type { QuestionGroupsField } from '../types/tableCompletion';
import { isReadingV2Payload } from '../config/readingV2FeatureFlags';
import { stripAnswerKeys } from '../utils/answerKeyHelper';
import { canonicalizeReadingQuestion } from '../utils/readingQuestionContract';
import {
  generateReadingV2SessionSafeProjection,
  type ReadingV2DerivedProjection,
} from './reading-v2/readingV2Projection.service';
import { readingV2StoragePaths } from './reading-v2/readingV2StoragePaths.service';
import {
  mergeQuestionsWithCanonicalTableGroups,
  sortTableCompletionQuestionGroups,
  stripTableCompletionReviewOnlyProvenanceFromField,
} from './test-creation/tableCompletionTransforms';
import { buildPersistedTableCompletionDiagnostics } from './test-creation/tableCompletionValidator';
import { createLegacyTestMaterialSummary } from './materialCatalog/legacyTestMaterialSummary.service';
import { buildMaterialSummaryUpdatePayload } from './materialCatalog/materialSummaryPort.service';

/** Link to source material (legacy - Materials feature removed) */
export interface MaterialLink {
  materialId: string;
  materialVersion: number;
  linkedAt: number;
}

export interface TestMetadata {
  title: string;
  type: 'IELTS' | 'TOEFL' | 'Custom' | 'College Entrance' | 'THCS-THPT';
  skill: 'Reading' | 'Listening' | 'Writing' | 'Speaking' | 'Mixed';
  duration: number;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  description?: string;
  tags?: string[];
  targetBand?: string;
  estimatedScore?: string;
}

/** Audio section for Listening tests */
export interface AudioSection {
  number: number;
  name: string;
  audioUrl: string;
  streamUrl?: string;
  assetId?: string;
  versionId?: string;
  startQuestion: number;
  endQuestion: number;
  playLimit?: number;
  waitTimeBefore?: number;
  duration?: number;
}

export type ResourceType = 'text' | 'audio' | 'image';

/** Unified Resource for Editor State */
export interface ContextResource {
  id: string;
  type: ResourceType;
  title: string;
  // Text specific
  content?: string;
  wordCount?: number;
  // Audio specific
  audioUrl?: string;
  // Image specific
  images?: string[];
  // Common
  questionStart?: number;
  questionEnd?: number;
  duration?: number;
}

export interface TestData {
  id: string;
  title: string;
  type: 'IELTS' | 'TOEFL' | 'Custom' | 'College Entrance' | 'THCS-THPT';
  skill: 'Reading' | 'Listening' | 'Writing' | 'Speaking' | 'Mixed';
  duration: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  questionCount: number;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  isPublished: boolean;

  /** Owner's UID - who created/owns this test */
  ownerId: string;

  /** Whether this test is publicly accessible to all teachers */
  isPublic: boolean;

  /** Whether the test is complete (has all answer keys) - incomplete tests are grayed out */
  isComplete: boolean;

  /** Number of questions missing answer keys */
  missingAnswerCount?: number;

  metadata: {
    description: string;
    instructions: string;
    tags: string[];
    targetBand?: string;
    estimatedScore?: string;
  };

  /** Text passages for Reading tests */
  passages: Array<{
    id: string;
    title: string;
    content: string;
    type: 'text' | 'image' | 'both';
    imageUrl?: string;
    wordCount: number;
    questionStart: number;
    questionEnd: number;
    createdAt: number;
  }>;

  /** Audio sections for Listening tests */
  audioSections?: AudioSection[];

  /** Skill type identifier for routing (reading, listening, writing, speaking) */
  skillType?: 'reading' | 'listening' | 'writing' | 'speaking';

  /** Display mode for listening tests (text vs image-based questions) */
  displayMode?: 'text' | 'image';

  /** Question images for listening tests in image mode */
  questionImages?: Array<{
    sectionNumber: number;
    imageUrl: string;
    questionRange?: { start: number; end: number };
  }>;

  questions: Array<{
    number: number;
    type: string;
    question: string;
    questionText?: string;
    options?: string[];
    labeledOptions?: ReadingLabeledOption[];
    optionLabelFormat?: ReadingOptionLabelFormat;
    sectionReferences?: ReadingSectionReference[];
    answer: string | string[] | Record<string, string>;
    passageId: string;
    resourceId?: string; // New unified link
    sectionNumber?: number; // For Listening tests - which audio section
    points: number;
    explanation?: string;
    acceptableAnswers?: string[];
    wordLimit?: number; // Max words allowed for completion-type questions
    sectionInstructionId?: string; // Links question to its section instruction
    groupId?: string;
    blankId?: string;
    anchorId?: string;
    groupTaskType?: 'table-completion';
    tableGroupSchemaVersion?: number;
  }>;

  settings: {
    allowPause: boolean;
    showTimer: boolean;
    shuffleQuestions: boolean;
    showResults: 'immediate' | 'after-submission' | 'never';
    allowReview: boolean;
    passingScore: number;
  };

  statistics: {
    attempts: number;
    averageScore: number;
    averageTime: number;
    completionRate: number;
  };

  /** Link to source material (if created from Material Library) */
  materialLink?: MaterialLink;

  /** PRD-0016: Solo study configuration */
  soloConfig?: MaterialSoloConfig;

  /** Canonical grouped Reading tasks */
  questionGroups?: QuestionGroupsField;

  /** Teacher/operator-only grouped table diagnostics */
  tableCompletionDiagnostics?: unknown[];
}

export interface SessionStudentSafeTestPayload {
  testId: string;
  generatedAt: number;
  testData: TestData;
}

/**
 * Generate unique test ID
 */
export const generateTestId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `test-${timestamp}-${random}`;
};

/**
 * Helper to compile possible acceptable answers from IELTS answer key syntax
 * Computes UI-specific formats like pipe-delimited variants for multi-blanks directly at creation time.
 */
function compileAcceptableAnswers(questionText: string, answer: any): string[] {
  if (!answer || typeof answer !== 'string') return [];

  const variants = new Set<string>();
  const parts = answer.split(/[/|]/).map(p => p.trim());

  for (const part of parts) {
    if (part.includes('(') && part.includes(')')) {
      variants.add(part.replace(/[()]/g, ''));
      variants.add(part.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim());

      const blankCount = (questionText?.match(/_{3,}/g) || []).length;
      if (blankCount > 1) {
        const piped = part.replace(/\([^)]*\)/g, '|').split('|').map(s => s.trim()).filter(Boolean).join('|');
        if (piped.split('|').length === blankCount) {
          variants.add(piped);
        }
      }
    } else {
      variants.add(part);
    }
  }
  return Array.from(variants);
}

/**
 * Save test to Firebase
 */
export const saveTestToFirebase = async (
  metadata: TestMetadata,
  passages: Passage[],
  questions: ParsedQuestion[],
  createdBy: string = 'teacher-default',
  materialLink?: MaterialLink,
  ownerId?: string,
  isPublic: boolean = false,
  questionGroups: QuestionGroupsField = [],
): Promise<{ success: boolean; testId?: string; error?: string }> => {
  try {
    const testId = generateTestId();
    const now = Date.now();
    const sortedQuestionGroups = sortTableCompletionQuestionGroups(
      questionGroups,
      passages.map((passage) => passage.id),
    );
    const tableCompletionDiagnostics = buildPersistedTableCompletionDiagnostics(sortedQuestionGroups);
    const effectiveQuestions = mergeQuestionsWithCanonicalTableGroups(questions, sortedQuestionGroups);

    // Format passages
    const formattedPassages = passages.map((passage, index) => {
      // Find question range for this passage
      const passageQuestions = effectiveQuestions.filter(q => q.passageId === passage.id);
      const questionNumbers = passageQuestions.map(q => q.number || 0).filter(n => n > 0);

      const questionStart = questionNumbers.length > 0 ? Math.min(...questionNumbers) : (index * 13) + 1;
      const questionEnd = questionNumbers.length > 0 ? Math.max(...questionNumbers) : questionStart + 12;

      return {
        id: passage.id,
        title: passage.title || `Passage ${index + 1}`,
        content: passage.content,
        type: passage.type || 'text',
        imageUrl: passage.imageUrl || '',
        wordCount: passage.content.split(/\s+/).length,
        questionStart,
        questionEnd,
        createdAt: now,
      };
    });

    // Format questions
    const formattedQuestions = effectiveQuestions.map((question, index) => {
      const canonicalQuestion = canonicalizeReadingQuestion({
        questionNumber: question.questionNumber || question.number,
        type: question.type,
        questionText: (question as any).questionText || question.question || '',
        question: question.question,
        options: question.labeledOptions || question.options || [],
        labeledOptions: question.labeledOptions,
        optionLabelFormat: question.optionLabelFormat,
        sectionReferences: question.sectionReferences,
        sectionInstructionId: (question as any).sectionInstructionId,
        groupId: (question as any).groupId,
        blankId: (question as any).blankId,
        anchorId: (question as any).anchorId,
        groupTaskType: (question as any).groupTaskType,
        tableGroupSchemaVersion: (question as any).tableGroupSchemaVersion,
      });

      if (canonicalQuestion.issues.length > 0) {
        throw new Error(canonicalQuestion.issues[0]!.message);
      }

      const formatted: any = {
        number: question.number || index + 1,
        type: question.type,
        question: canonicalQuestion.question,
        questionText: canonicalQuestion.questionText,
        answer: question.answer,
        passageId: question.passageId || (passages[0]?.id || 'default'),
        points: question.points || 1,
      };

      // Only include optional fields if they have values (Firebase doesn't allow undefined)
      if (canonicalQuestion.options && canonicalQuestion.options.length > 0) {
        formatted.options = canonicalQuestion.options;
      }
      if (canonicalQuestion.labeledOptions && canonicalQuestion.labeledOptions.length > 0) {
        formatted.labeledOptions = canonicalQuestion.labeledOptions;
      }
      if (canonicalQuestion.optionLabelFormat) {
        formatted.optionLabelFormat = canonicalQuestion.optionLabelFormat;
      }
      if (canonicalQuestion.sectionReferences && canonicalQuestion.sectionReferences.length > 0) {
        formatted.sectionReferences = canonicalQuestion.sectionReferences;
      }
      if ((question as any).explanation) {
        formatted.explanation = (question as any).explanation;
      }

      // Pre-compile acceptable answers variants at storage step matching student UI structures
      const existingVariants = (question as any).acceptableAnswers || [];
      const generatedVariants = compileAcceptableAnswers(canonicalQuestion.questionText, question.answer);
      const combinedVariants = Array.from(new Set([...existingVariants, ...generatedVariants]));

      if (combinedVariants.length > 0) {
        formatted.acceptableAnswers = combinedVariants;
      }

      if (question.wordLimit !== undefined && question.wordLimit > 0) {
        formatted.wordLimit = question.wordLimit;
      }
      if ((question as any).sectionInstructionId) {
        formatted.sectionInstructionId = (question as any).sectionInstructionId;
      }
      if ((question as any).groupId) {
        formatted.groupId = (question as any).groupId;
      }
      if ((question as any).blankId) {
        formatted.blankId = (question as any).blankId;
      }
      if ((question as any).anchorId) {
        formatted.anchorId = (question as any).anchorId;
      }
      if ((question as any).groupTaskType) {
        formatted.groupTaskType = (question as any).groupTaskType;
      }
      if ((question as any).tableGroupSchemaVersion) {
        formatted.tableGroupSchemaVersion = (question as any).tableGroupSchemaVersion;
      }

      return formatted;
    });

    // Diagnostic: Log wordLimit statistics for debugging
    const questionsWithWordLimit = formattedQuestions.filter((q: any) => q.wordLimit);
    if (questionsWithWordLimit.length > 0) {
      console.log(`📏 [TestStorage] ${questionsWithWordLimit.length}/${formattedQuestions.length} questions have wordLimit set`);
    }

    // Check for missing answer keys
    const questionsWithoutAnswers = formattedQuestions.filter(q =>
      !q.answer ||
      (typeof q.answer === 'string' && q.answer.trim() === '') ||
      (Array.isArray(q.answer) && q.answer.length === 0)
    );
    const missingAnswerCount = questionsWithoutAnswers.length;
    const isComplete = missingAnswerCount === 0;

    if (!isComplete) {
      console.log(`⚠️ Test has ${missingAnswerCount}/${formattedQuestions.length} questions without answer keys`);
    }

    // Build test data structure
    const testData: TestData = {
      id: testId,
      title: metadata.title,
      type: metadata.type,
      skill: metadata.skill,
      duration: metadata.duration,
      difficulty: metadata.difficulty || 'Intermediate',
      questionCount: formattedQuestions.length,
      createdAt: now,
      createdBy,
      updatedAt: now,
      isPublished: true,
      ownerId: ownerId || createdBy, // Use ownerId if provided, otherwise fall back to createdBy
      isPublic,
      isComplete,
      // Only include missingAnswerCount if > 0 (Firebase rejects undefined)
      ...(missingAnswerCount > 0 && { missingAnswerCount }),

      metadata: {
        description: metadata.description || '',
        instructions: `You have ${metadata.duration} minutes to complete all ${formattedQuestions.length} questions`,
        tags: metadata.tags || [metadata.type, metadata.skill],
        // Only include optional fields if they have values (Firebase rejects undefined)
        ...(metadata.targetBand && { targetBand: metadata.targetBand }),
        ...(metadata.estimatedScore && { estimatedScore: metadata.estimatedScore }),
      },

      passages: formattedPassages,
      questions: formattedQuestions,
      ...(sortedQuestionGroups.length > 0 ? { questionGroups: sortedQuestionGroups } : {}),
      ...(tableCompletionDiagnostics.length > 0
        ? { tableCompletionDiagnostics }
        : {}),

      settings: {
        allowPause: false,
        showTimer: true,
        shuffleQuestions: false,
        showResults: 'immediate',
        allowReview: true,
        passingScore: 60,
      },

      statistics: {
        attempts: 0,
        averageScore: 0,
        averageTime: 0,
        completionRate: 0,
      },

      // Material link (if created from Material Library)
      ...(materialLink && { materialLink }),
    };

    // Save to Firebase
    const summary = createLegacyTestMaterialSummary(testId, testData);
    await update(ref(database), {
      [`tests/${testId}`]: testData,
      ...buildMaterialSummaryUpdatePayload(summary),
    });
    await writeStudentSafeTestData(testId, testData);

    console.log('✅ Test saved to Firebase:', testId);

    return {
      success: true,
      testId,
    };

  } catch (error) {
    console.error('❌ Error saving test to Firebase:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Provide more specific error messages
    let errorMessage = 'Failed to save test';
    if (error instanceof Error) {
      if (error.message.includes('permission')) {
        errorMessage = 'Permission denied. Please check Firebase database rules.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Get test from Firebase
 */
export const getTestFromFirebase = async (testId: string): Promise<{ success: boolean; data?: TestData; error?: string }> => {
  try {
    const testRef = ref(database, `tests/${testId}`);
    const snapshot = await get(testRef);

    if (snapshot.exists()) {
      return {
        success: true,
        data: snapshot.val() as TestData,
      };
    } else {
      return {
        success: false,
        error: 'Test not found',
      };
    }
  } catch (error) {
    console.error('❌ Error getting test from Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get test',
    };
  }
};

type QuestionContainer = Record<string, any> & {
  questions?: Array<Record<string, any>>;
};

const sanitizeSectionQuestions = <T extends QuestionContainer>(sections: T[]): T[] =>
  sections.map((section) => ({
    ...section,
    questions: Array.isArray(section.questions)
      ? stripAnswerKeys(section.questions)
      : section.questions,
  })) as T[];

/**
 * Create a student-safe test payload for live delivery.
 * This keeps the rendered question state separate from grading data.
 */
export const buildStudentSafeTestData = <T extends Record<string, any>>(testData: T): T => {
  if (isReadingV2Payload(testData)) {
    throw new Error(
      'Reading V2 payloads must use the dedicated Reading V2 publish pipeline before student-safe projection.',
    );
  }

  const studentSafeTestData = { ...testData } as T & {
    questions?: Array<Record<string, any>>;
    sections?: QuestionContainer[];
    questionGroups?: QuestionGroupsField;
    tableCompletionDiagnostics?: unknown[];
  };

  if (Array.isArray(studentSafeTestData.questions)) {
    studentSafeTestData.questions = stripAnswerKeys(studentSafeTestData.questions).map((question) => {
      const { acceptableAnswers, explanation, ...rest } = question;
      void acceptableAnswers;
      void explanation;
      return rest;
    });
  }

  if (Array.isArray(studentSafeTestData.sections)) {
    studentSafeTestData.sections = sanitizeSectionQuestions(studentSafeTestData.sections);
  }

  if (Array.isArray(studentSafeTestData.questionGroups)) {
    studentSafeTestData.questionGroups = stripTableCompletionReviewOnlyProvenanceFromField(
      studentSafeTestData.questionGroups,
    ) as typeof studentSafeTestData.questionGroups;
  }

  delete studentSafeTestData.tableCompletionDiagnostics;

  return studentSafeTestData;
};

const writeStudentSafeTestData = async (
  testId: string,
  testData: TestData,
): Promise<void> => {
  await set(
    ref(database, `student_safe_tests/${testId}`),
    buildStudentSafeTestData(testData),
  );
};

const backfillStudentSafeTestData = withRestoreGuard(
  'StudentSafeTestProjectionBackfill',
  false,
)(async (testId: string, testData: TestData): Promise<boolean> => {
  await writeStudentSafeTestData(testId, testData);
  return true;
});

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    );
  }

  return value;
};

const cacheReadingV2SessionSafeProjection = async (
  sessionCode: string,
  testId: string,
  testData: TestData,
): Promise<{ success: boolean; data?: TestData; error?: string }> => {
  const materialId = String((testData as Record<string, unknown>).materialId || testId);
  const metadataSnapshot = await get(ref(database, readingV2StoragePaths.materialMetadata(materialId)));

  if (!metadataSnapshot.exists()) {
    return {
      success: false,
      error: `Reading V2 material metadata not found for ${materialId}`,
    };
  }

  const metadata = metadataSnapshot.val() as Record<string, any>;
  const snapshotVersionId =
    typeof metadata.publishedSnapshotVersionId === 'string'
      ? metadata.publishedSnapshotVersionId
      : typeof (testData as Record<string, any>).publishedSnapshotVersionId === 'string'
        ? (testData as Record<string, any>).publishedSnapshotVersionId
        : typeof (testData as Record<string, any>).metadata?.publishedSnapshotVersionId === 'string'
          ? (testData as Record<string, any>).metadata.publishedSnapshotVersionId
          : null;

  if (!snapshotVersionId) {
    return {
      success: false,
      error: `Reading V2 material ${materialId} is missing a published snapshot version`,
    };
  }

  const studentSafeSnapshot = await get(
    ref(database, readingV2StoragePaths.studentSafeTests(materialId, snapshotVersionId)),
  );

  if (!studentSafeSnapshot.exists()) {
    return {
      success: false,
      error: `Reading V2 student-safe projection not found for ${materialId}:${snapshotVersionId}`,
    };
  }

  const sessionSafeProjection = generateReadingV2SessionSafeProjection({
    sessionCode,
    studentSafeProjection: studentSafeSnapshot.val() as ReadingV2DerivedProjection,
  });

  await update(ref(database), {
    [readingV2StoragePaths.sessionSafePayloads(sessionCode, snapshotVersionId)]: stripUndefined(sessionSafeProjection),
    [`game_sessions/${sessionCode}/readingV2`]: stripUndefined(metadata),
  });

  return {
    success: true,
    data: sessionSafeProjection as unknown as TestData,
  };
};

/**
 * Read the global student-safe payload for solo/homework delivery.
 */
export const getStudentSafeTestFromFirebase = async (
  testId: string,
): Promise<{ success: boolean; data?: TestData; error?: string }> => {
  try {
    const safeRef = ref(database, `student_safe_tests/${testId}`);
    const snapshot = await get(safeRef);

    if (snapshot.exists()) {
      return {
        success: true,
        data: snapshot.val() as TestData,
      };
    }

    const canonicalResult = await getTestFromFirebase(testId);

    if (canonicalResult.success && canonicalResult.data) {
      console.warn('[SoloTestData] Missing student-safe payload, falling back to canonical test:', testId);
      void backfillStudentSafeTestData(testId, canonicalResult.data).catch((backfillError) => {
        console.warn(
          `⚠️ [TestStorage] Failed to backfill student-safe payload for ${testId}:`,
          backfillError,
        );
      });
      return {
        success: true,
        data: buildStudentSafeTestData(canonicalResult.data),
      };
    }

    return {
      success: false,
      error: canonicalResult.error || 'Student-safe test payload not found',
    };
  } catch (error) {
    console.error('❌ Error getting student-safe test from Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get student-safe test',
    };
  }
};

/**
 * Cache a student-safe test payload for a live session.
 * Students should read this payload instead of loading the grading object directly.
 */
export const cacheSessionStudentSafeTestData = async (
  sessionCode: string,
  testId: string,
): Promise<{ success: boolean; data?: TestData; error?: string }> => {
  try {
    const result = await getTestFromFirebase(testId);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Test not found',
      };
    }

    if (isReadingV2Payload(result.data)) {
      return await cacheReadingV2SessionSafeProjection(sessionCode, testId, result.data);
    }

    const studentSafeTestData = buildStudentSafeTestData(result.data);
    const payload: SessionStudentSafeTestPayload = {
      testId,
      generatedAt: Date.now(),
      testData: studentSafeTestData,
    };

    await set(ref(database, `session_test_payloads/${sessionCode}`), payload);

    return {
      success: true,
      data: studentSafeTestData,
    };
  } catch (error) {
    console.error('❌ Error caching session student-safe test payload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cache session test payload',
    };
  }
};

/**
 * Read the student-safe payload prepared for a live session.
 */
export const getSessionStudentSafeTestData = async (
  sessionCode: string,
  testId: string,
): Promise<{ success: boolean; data?: TestData; error?: string }> => {
  try {
    const payloadRef = ref(database, `session_test_payloads/${sessionCode}`);
    const snapshot = await get(payloadRef);

    if (!snapshot.exists()) {
      return {
        success: false,
        error: 'Session test payload not ready',
      };
    }

    const payload = snapshot.val() as SessionStudentSafeTestPayload;

    if (!payload?.testData || payload.testId !== testId) {
      return {
        success: false,
        error: 'Session test payload is stale',
      };
    }

    return {
      success: true,
      data: payload.testData,
    };
  } catch (error) {
    console.error('❌ Error getting session student-safe test payload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load session test payload',
    };
  }
};

/**
 * Read full question objects for grading only.
 * This is intentionally separate from the student-facing rendered payload.
 */
export const getTestQuestionsFromFirebase = async (
  testId: string,
): Promise<{ success: boolean; data?: TestData['questions']; error?: string }> => {
  try {
    const questionsRef = ref(database, `tests/${testId}/questions`);
    const snapshot = await get(questionsRef);

    if (!snapshot.exists()) {
      return {
        success: false,
        error: 'Test questions not found',
      };
    }

    return {
      success: true,
      data: snapshot.val() as TestData['questions'],
    };
  } catch (error) {
    console.error('❌ Error getting grading questions from Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get grading questions',
    };
  }
};

/**
 * Get all tests from Firebase
 */
export const getAllTestsFromFirebase = async (): Promise<{ success: boolean; data?: TestData[]; error?: string }> => {
  try {
    const testsRef = ref(database, 'tests');
    const snapshot = await get(testsRef);

    if (snapshot.exists()) {
      const testsData = snapshot.val();
      const testsList = Object.values(testsData) as TestData[];
      return {
        success: true,
        data: testsList,
      };
    } else {
      return {
        success: true,
        data: [],
      };
    }
  } catch (error) {
    console.error('❌ Error getting tests from Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tests',
    };
  }
};

export const persistIELTSCanonicalQuestionGroupsToFirebase = async (
  testId: string,
  questionGroups: QuestionGroupsField,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const existingResult = await getTestFromFirebase(testId);
    if (!existingResult.success || !existingResult.data) {
      return {
        success: false,
        error: existingResult.error || 'Test not found',
      };
    }

    const existingTest = existingResult.data;
    if (existingTest.type === 'THCS-THPT') {
      return {
        success: false,
        error: 'THCS grouped-table persistence is not supported by the IELTS canonical storage path.',
      };
    }

    const sortedQuestionGroups = sortTableCompletionQuestionGroups(
      questionGroups,
      existingTest.passages.map((passage) => passage.id),
    );
    const nextQuestions = mergeQuestionsWithCanonicalTableGroups(
      existingTest.questions as ParsedQuestion[],
      sortedQuestionGroups,
    );
    const nextDiagnostics = buildPersistedTableCompletionDiagnostics(sortedQuestionGroups);
    const nextTestData: TestData = {
      ...existingTest,
      questions: nextQuestions as TestData['questions'],
      updatedAt: Date.now(),
      ...(sortedQuestionGroups.length > 0 ? { questionGroups: sortedQuestionGroups } : {}),
      ...(sortedQuestionGroups.length === 0 ? { questionGroups: [] } : {}),
      ...(nextDiagnostics.length > 0 ? { tableCompletionDiagnostics: nextDiagnostics } : {}),
      ...(nextDiagnostics.length === 0 ? { tableCompletionDiagnostics: [] } : {}),
    };

    const previousSummary = createLegacyTestMaterialSummary(testId, existingTest);
    const nextSummary = createLegacyTestMaterialSummary(testId, nextTestData);
    await update(ref(database), {
      [`tests/${testId}`]: nextTestData,
      ...buildMaterialSummaryUpdatePayload(nextSummary, previousSummary),
    });
    await writeStudentSafeTestData(testId, nextTestData);

    return {
      success: true,
    };
  } catch (error) {
    console.error('❌ Error persisting IELTS canonical question groups:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to persist IELTS canonical question groups',
    };
  }
};

/**
 * Update test in Firebase
 */
export const updateTestInFirebase = async (
  testId: string,
  updates: Partial<TestData>
): Promise<{ success: boolean; error?: string }> => {
  try {
    let remainingUpdates: Partial<TestData> = { ...updates };

    if (remainingUpdates.questionGroups !== undefined) {
      const groupedResult = await persistIELTSCanonicalQuestionGroupsToFirebase(
        testId,
        remainingUpdates.questionGroups,
      );

      if (!groupedResult.success) {
        return groupedResult;
      }

      delete remainingUpdates.questionGroups;
      delete remainingUpdates.questions;
      delete remainingUpdates.tableCompletionDiagnostics;

      if (Object.keys(remainingUpdates).length === 0) {
        return { success: true };
      }
    }

    // Add updatedAt timestamp
    const updatedData = {
      ...remainingUpdates,
      updatedAt: Date.now(),
    };

    const currentResult = await getTestFromFirebase(testId);
    if (!currentResult.success || !currentResult.data) {
      return {
        success: false,
        error: currentResult.error ?? 'Test not found',
      };
    }
    const nextTestData = { ...currentResult.data, ...updatedData };
    const previousSummary = createLegacyTestMaterialSummary(
      testId,
      currentResult.data,
    );
    const nextSummary = createLegacyTestMaterialSummary(testId, nextTestData);
    await update(ref(database), {
      [`tests/${testId}`]: nextTestData,
      ...buildMaterialSummaryUpdatePayload(nextSummary, previousSummary),
    });
    await writeStudentSafeTestData(testId, nextTestData);

    console.log('✅ Test updated in Firebase:', testId);

    return {
      success: true,
    };
  } catch (error) {
    console.error('❌ Error updating test in Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update test',
    };
  }
};

/**
 * Delete test from Firebase
 */
export const deleteTestFromFirebase = async (testId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const currentResult = await getTestFromFirebase(testId);
    const summaryUpdates = currentResult.success && currentResult.data
      ? buildMaterialSummaryUpdatePayload(
          createLegacyTestMaterialSummary(testId, {
            ...currentResult.data,
            updatedAt: Date.now(),
          }, 'removed'),
          createLegacyTestMaterialSummary(testId, currentResult.data),
        )
      : {};
    await update(ref(database), {
      [`tests/${testId}`]: null,
      [`student_safe_tests/${testId}`]: null,
      ...summaryUpdates,
    });

    console.log('✅ Test deleted from Firebase:', testId);

    return {
      success: true,
    };
  } catch (error) {
    console.error('❌ Error deleting test from Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete test',
    };
  }
};

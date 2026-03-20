/**
 * Test Storage Service
 * Handles saving and retrieving tests from Firebase
 * Uses structure defined in FIREBASE_TEST_STRUCTURE.md
 */

import { ref, set, get, update } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from './firebase';
import type { Passage, ParsedQuestion } from '../types/document.types';
import type { MaterialSoloConfig } from '../types/solo.types';
import { stripAnswerKeys } from '../utils/answerKeyHelper';

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
    options?: string[];
    answer: string | string[] | Record<string, string>;
    passageId: string;
    resourceId?: string; // New unified link
    sectionNumber?: number; // For Listening tests - which audio section
    points: number;
    explanation?: string;
    acceptableAnswers?: string[];
    wordLimit?: number; // Max words allowed for completion-type questions
    sectionInstructionId?: string; // Links question to its section instruction
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
  isPublic: boolean = false
): Promise<{ success: boolean; testId?: string; error?: string }> => {
  try {
    const testId = generateTestId();
    const now = Date.now();

    // Format passages
    const formattedPassages = passages.map((passage, index) => {
      // Find question range for this passage
      const passageQuestions = questions.filter(q => q.passageId === passage.id);
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
    const formattedQuestions = questions.map((question, index) => {
      const formatted: any = {
        number: question.number || index + 1,
        type: question.type,
        question: question.question,
        answer: question.answer,
        passageId: question.passageId || (passages[0]?.id || 'default'),
        points: question.points || 1,
      };

      // Only include optional fields if they have values (Firebase doesn't allow undefined)
      if (question.options && question.options.length > 0) {
        formatted.options = question.options;
      }
      if ((question as any).explanation) {
        formatted.explanation = (question as any).explanation;
      }

      // Pre-compile acceptable answers variants at storage step matching student UI structures
      const existingVariants = (question as any).acceptableAnswers || [];
      const generatedVariants = compileAcceptableAnswers((question as any).questionText || question.question || '', question.answer);
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
      console.log(`⚠️ Test has ${missingAnswerCount}/${questions.length} questions without answer keys`);
    }

    // Build test data structure
    const testData: TestData = {
      id: testId,
      title: metadata.title,
      type: metadata.type,
      skill: metadata.skill,
      duration: metadata.duration,
      difficulty: metadata.difficulty || 'Intermediate',
      questionCount: questions.length,
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
        instructions: `You have ${metadata.duration} minutes to complete all ${questions.length} questions`,
        tags: metadata.tags || [metadata.type, metadata.skill],
        // Only include optional fields if they have values (Firebase rejects undefined)
        ...(metadata.targetBand && { targetBand: metadata.targetBand }),
        ...(metadata.estimatedScore && { estimatedScore: metadata.estimatedScore }),
      },

      passages: formattedPassages,
      questions: formattedQuestions,

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
    const testRef = ref(database, `tests/${testId}`);
    await set(testRef, testData);
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

/**
 * Create a student-safe test payload for live delivery.
 * This keeps the rendered question state separate from grading data.
 */
export const buildStudentSafeTestData = (testData: TestData): TestData => ({
  ...testData,
  questions: stripAnswerKeys(testData.questions),
});

const writeStudentSafeTestData = async (
  testId: string,
  testData: TestData,
): Promise<void> => {
  await set(
    ref(database, `student_safe_tests/${testId}`),
    buildStudentSafeTestData(testData),
  );
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

    return {
      success: false,
      error: 'Student-safe test payload not found',
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

/**
 * Update test in Firebase
 */
export const updateTestInFirebase = async (
  testId: string,
  updates: Partial<TestData>
): Promise<{ success: boolean; error?: string }> => {
  try {
    const testRef = ref(database, `tests/${testId}`);

    // Add updatedAt timestamp
    const updatedData = {
      ...updates,
      updatedAt: Date.now(),
    };

    await update(testRef, updatedData);

    const result = await getTestFromFirebase(testId);
    if (result.success && result.data) {
      await writeStudentSafeTestData(testId, result.data);
    }

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
    const testRef = ref(database, `tests/${testId}`);
    await set(testRef, null);
    await set(ref(database, `student_safe_tests/${testId}`), null);

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

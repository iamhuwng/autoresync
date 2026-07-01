/**
 * Listening Test Storage Service
 * Handles saving and retrieving LISTENING tests from Firebase
 * 
 * ARCHITECTURE: Option B - Separate files per skill
 * This file is independent of readingTestStorage.ts
 * Each skill has its own storage logic to prevent cross-contamination
 */

import { ref, set, get } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from './firebase';
import r2StorageService, { R2_PUBLIC_URL } from './r2Storage';
import type { ParsedQuestion } from '../types/document.types';
import type {
  ListeningAssetCommitInput,
  ListeningAssetCommitResult,
} from '../features/assessment/listening/storage/listeningAssetCommit';
export {
  createListeningAuthoringWorkflow,
} from '../features/assessment/listening/authoring/listeningAuthoringWorkflow';
export type {
  PublishListeningDraftRequest as PublishListeningDraftInput,
  PublishListeningDraftResult,
  SaveListeningDraftRequest as SaveListeningDraftInput,
  SaveListeningDraftResult,
} from '../features/assessment/listening/authoring/listeningAuthoringWorkflow';
export {
  createInMemoryListeningAuthoringStore,
} from '../features/assessment/listening/storage/listeningAuthoringStore';
export {
  archiveListeningPublishedVersion,
  softDeleteListeningDraft,
} from '../features/assessment/listening/storage/listeningAuthoringDeletionGovernance';
export {
  resolveListeningLegacyAudioReference,
} from '../features/assessment/listening/adapters/listeningLegacyAudioResolver';
export type {
  CreateListeningRevisionDraftInput,
  CreateListeningRevisionDraftResult,
  ListeningAuthoringDocumentV1,
  ListeningAuthoringDraftRecord,
  ListeningAuthoringIssue,
  ListeningPublishedVersionRecord,
} from '../features/assessment/listening/types/listeningAuthoring.types';

// ============================================================
// LISTENING-SPECIFIC TYPES
// ============================================================

export interface ListeningTestMetadata {
  title: string;
  type: 'IELTS' | 'TOEFL' | 'Custom';
  skill: 'Listening'; // Always 'Listening' for this storage
  duration: number;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  description?: string;
  tags?: string[];
  targetBand?: string;
  estimatedScore?: string;
}

export interface AudioSection {
  number: number;
  name: string;
  audioUrl: string;
  streamUrl?: string; // Direct stream URL for audio player
  assetId?: string;
  uploadSessionId?: string;
  tempKey?: string;
  checksum?: string;
  contentType?: string;
  sizeBytes?: number;
  fileName?: string;
  startQuestion: number;
  endQuestion: number;
  playLimit?: number; // How many times can replay (undefined = unlimited)
  waitTimeBefore?: number; // Seconds of wait time before section
}

export interface ListeningAssetCommitter {
  (input: ListeningAssetCommitInput): Promise<ListeningAssetCommitResult>;
}

const hasCanonicalCommitMetadata = (section: AudioSection): boolean =>
  Boolean(
    section.assetId
    && section.uploadSessionId
    && section.tempKey
    && section.checksum
    && section.contentType
    && section.sizeBytes
    && section.fileName
  );

/**
 * Display mode for Listening tests:
 * - 'text': Full-width IELTS-like interface with parsed text questions
 * - 'image': Two-column layout with question images on left, answer inputs on right
 */
export type ListeningDisplayMode = 'text' | 'image';

/**
 * Question image for image mode display
 */
export interface QuestionImage {
  sectionNumber: number;
  imageUrl: string;
  imageCaption?: string;
  questionRange?: { start: number; end: number };
}

/**
 * Audio Controls Configuration
 * Defines what audio controls are visible/enabled for students
 */
export interface AudioControlsConfig {
  showPlayPause: boolean;      // Show play/pause button to student
  showProgressBar: boolean;    // Show time progress bar
  showSeekControl: boolean;    // Can student drag/seek in progress bar?
  showSpeedControl: boolean;   // Show speed buttons (0.5x, 1x, 1.5x, 2x)
  showSkipSection: boolean;    // Allow skipping to next section
  showVolumeControl: boolean;  // Show volume slider (always recommended)
}

/**
 * Audio Controls Presets for quick configuration
 */
export const AUDIO_CONTROLS_PRESETS = {
  /** IELTS Standard: No controls except volume - simulates real exam conditions */
  IELTS_STANDARD: {
    showPlayPause: false,
    showProgressBar: true,
    showSeekControl: false,
    showSpeedControl: false,
    showSkipSection: false,
    showVolumeControl: true,
  } as AudioControlsConfig,

  /** Practice Mode: Full controls for self-paced learning */
  PRACTICE_MODE: {
    showPlayPause: true,
    showProgressBar: true,
    showSeekControl: true,
    showSpeedControl: true,
    showSkipSection: true,
    showVolumeControl: true,
  } as AudioControlsConfig,

  /** Relaxed Mode: Basic controls without speed adjustment */
  RELAXED_MODE: {
    showPlayPause: true,
    showProgressBar: true,
    showSeekControl: false,
    showSpeedControl: false,
    showSkipSection: false,
    showVolumeControl: true,
  } as AudioControlsConfig,
};

export interface ListeningTestData {
  id: string;
  title: string;
  type: 'IELTS' | 'TOEFL' | 'Custom';
  skill: 'Listening';
  duration: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  questionCount: number;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  isPublished: boolean;

  // NEW: Standard fields for Dashboard compatibility
  ownerId: string;
  isPublic: boolean;
  isComplete: boolean;
  missingAnswerCount?: number;

  // NEW: Display mode determines how questions are rendered
  displayMode: ListeningDisplayMode;

  metadata: {
    description: string;
    instructions: string;
    tags: string[];
    targetBand?: string;
    estimatedScore?: string;
    transcript?: string; // Audio transcript for review
  };

  // Listening-specific: Audio sections instead of passages
  audioSections: AudioSection[];

  // NEW: Question images for image mode (optional)
  questionImages?: QuestionImage[];

  questions: Array<{
    number: number;
    type: string;
    question: string;
    options?: string[];
    answer: string | string[] | Record<string, string>;
    sectionNumber: number; // Which audio section this question belongs to
    points: number;
    explanation?: string;
    acceptableAnswers?: string[];
    // NEW: Image URL for individual question (used in image mode)
    imageUrl?: string;
    // NEW: Context for IELTS text format display
    context?: {
      sectionHeading?: string;
      subsectionLabel?: string;
      contextLines?: string[];
      currentLineIndex?: number;
    };
  }>;

  settings: {
    allowPause: boolean;
    showTimer: boolean;
    shuffleQuestions: boolean;
    showResults: 'immediate' | 'after-submission' | 'never';
    allowReview: boolean;
    passingScore: number;
    // Listening-specific settings
    allowReplay: boolean;
    maxReplays?: number; // Per section

    // Audio Controls Configuration (teacher-configurable)
    audioControls?: {
      showPlayPause: boolean;      // Show play/pause button to student
      showProgressBar: boolean;    // Show time progress bar
      showSeekControl: boolean;    // Can student drag/seek in progress bar?
      showSpeedControl: boolean;   // Show speed buttons (0.5x, 1x, 1.5x, 2x)
      showSkipSection: boolean;    // Allow skipping to next section
      showVolumeControl: boolean;  // Show volume slider (always recommended)
    };
  };

  statistics: {
    attempts: number;
    averageScore: number;
    averageTime: number;
    completionRate: number;
  };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate unique test ID for Listening tests
 */
export const generateListeningTestId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `listening-${timestamp}-${random}`;
};

/**
 * Determine which audio section a question belongs to
 */
const getSectionNumber = (
  questionNumber: number,
  audioSections: AudioSection[]
): number => {
  for (const section of audioSections) {
    if (questionNumber >= section.startQuestion && questionNumber <= section.endQuestion) {
      return section.number;
    }
  }
  return 1; // Default to section 1
};

// ============================================================
// SAVE LISTENING TEST
// ============================================================

/**
 * Save Listening test to Firebase
 */
export const saveListeningTestToFirebase = async (
  metadata: ListeningTestMetadata,
  audioSections: AudioSection[],
  questions: ParsedQuestion[],
  createdBy: string = 'teacher-default',
  transcript?: string,
  displayMode: ListeningDisplayMode = 'text',
  questionImages?: QuestionImage[],
  ownerId?: string,
  isPublic: boolean = false,
  audioControlsConfig?: AudioControlsConfig,
  allowReplay: boolean = false,
  maxReplays: number = 1,
  assetCommitter?: ListeningAssetCommitter
): Promise<{ success: boolean; testId?: string; error?: string }> => {
  try {
    const testId = generateListeningTestId();
    const now = Date.now();

    // Validate audio sections
    const missingSections = audioSections.filter(s => !s.audioUrl);
    if (missingSections.length > 0) {
      return {
        success: false,
        error: `Missing audio for section(s): ${missingSections.map(s => s.number).join(', ')}`,
      };
    }

    for (const section of audioSections) {
      const hasCanonicalAsset = hasCanonicalCommitMetadata(section);
      if (hasCanonicalAsset && !assetCommitter) {
        throw new Error(`Section ${section.number} audio requires registry commit adapter before save`);
      }
      if (
        !hasCanonicalAsset
        && (
          r2StorageService.isTempFile(section.audioUrl)
          || (section.streamUrl ? r2StorageService.isTempFile(section.streamUrl) : false)
        )
      ) {
        throw new Error(`Section ${section.number} audio requires registry commit metadata before save`);
      }
    }

    const updatedAudioSections = await Promise.all(
      audioSections.map(async (section) => {
        let updatedSection = { ...section };
        const hasCanonicalAsset = hasCanonicalCommitMetadata(section);

        if (hasCanonicalAsset) {
          if (!assetCommitter) {
            throw new Error(`Section ${section.number} audio requires registry commit adapter before save`);
          }
          const commitResult = await assetCommitter!({
            ownerId: ownerId || createdBy,
            uploadSessionId: section.uploadSessionId!,
            assetId: section.assetId!,
            fileName: section.fileName!,
            declaredMimeType: section.contentType!,
            expectedChecksum: section.checksum!,
            activeAudioFileCount: audioSections.length,
            reference: {
              kind: 'tests',
              id: testId,
              sourcePath: `tests/${testId}/audioSections/${section.number}`,
            },
            now,
            publicBaseUrl: R2_PUBLIC_URL,
          });
          updatedSection.audioUrl = commitResult.audioUrl;
          updatedSection.streamUrl = commitResult.streamUrl;
          updatedSection.assetId = commitResult.assetId;
          return updatedSection;
        }

        if (
          r2StorageService.isTempFile(section.audioUrl)
          || (section.streamUrl ? r2StorageService.isTempFile(section.streamUrl) : false)
        ) {
          throw new Error(`Section ${section.number} audio requires registry commit metadata before save`);
        }
        return updatedSection;
      })
    );

    // Format audio sections (remove upload progress fields)
    // CRITICAL: Firebase doesn't allow undefined values, so only include optional fields if defined
    const formattedSections: AudioSection[] = updatedAudioSections.map(section => {
      const formatted: AudioSection = {
        number: section.number,
        name: section.name,
        audioUrl: section.audioUrl,
        startQuestion: section.startQuestion,
        endQuestion: section.endQuestion,
      };

      // Only include optional fields if they have actual values (Firebase rejects undefined)
      if (section.streamUrl !== undefined) {
        formatted.streamUrl = section.streamUrl;
      }
      if (section.assetId !== undefined) {
        formatted.assetId = section.assetId;
      }
      if (section.playLimit !== undefined) {
        formatted.playLimit = section.playLimit;
      }
      if (section.waitTimeBefore !== undefined) {
        formatted.waitTimeBefore = section.waitTimeBefore;
      }

      return formatted;
    });

    // Format questions with section assignment
    const formattedQuestions = questions.map((question, index) => {
      const questionNumber = question.number || index + 1;
      const formatted: any = {
        number: questionNumber,
        type: question.type,
        question: question.question,
        answer: question.answer,
        sectionNumber: getSectionNumber(questionNumber, formattedSections),
        points: question.points || 1,
      };

      // Only include optional fields if they have values
      if (question.options && question.options.length > 0) {
        formatted.options = question.options;
      }
      if ((question as any).explanation) {
        formatted.explanation = (question as any).explanation;
      }
      if ((question as any).acceptableAnswers) {
        formatted.acceptableAnswers = (question as any).acceptableAnswers;
      }

      return formatted;
    });

    // Check for missing answer keys (Standardization)
    const questionsWithoutAnswers = formattedQuestions.filter(q =>
      !q.answer ||
      (typeof q.answer === 'string' && q.answer.trim() === '') ||
      (Array.isArray(q.answer) && q.answer.length === 0)
    );
    const missingAnswerCount = questionsWithoutAnswers.length;
    const isComplete = missingAnswerCount === 0;

    if (!isComplete) {
      console.log(`Test has ${missingAnswerCount}/${questions.length} questions without answer keys`);
    }

    // Build Listening test data structure
    const testData: ListeningTestData = {
      id: testId,
      title: metadata.title,
      type: metadata.type,
      skill: 'Listening',
      duration: metadata.duration,
      difficulty: metadata.difficulty || 'Intermediate',
      questionCount: questions.length,
      createdAt: now,
      createdBy,
      updatedAt: now,
      isPublished: true, // Legacy field, kept for compatibility

      // Standard Dashboard Fields
      ownerId: ownerId || createdBy,
      isPublic,
      isComplete,
      // Only include missingAnswerCount if > 0 (Firebase rejects undefined)
      ...(missingAnswerCount > 0 && { missingAnswerCount }),

      // Display mode determines UI rendering
      displayMode,

      metadata: {
        description: metadata.description || '',
        instructions: `You have ${metadata.duration} minutes to complete all ${questions.length} questions. The audio will play automatically.`,
        tags: metadata.tags || [metadata.type, 'Listening'],
        // Only include optional fields if they have values (Firebase rejects undefined)
        ...(metadata.targetBand && { targetBand: metadata.targetBand }),
        ...(metadata.estimatedScore && { estimatedScore: metadata.estimatedScore }),
        ...(transcript && { transcript }),
      },

      audioSections: formattedSections,

      // Question images for image mode (only include if provided)
      ...(questionImages && questionImages.length > 0 && { questionImages }),

      questions: formattedQuestions,

      settings: {
        allowPause: audioControlsConfig?.showPlayPause ?? false, // Derived from audioControls
        showTimer: true,
        shuffleQuestions: false, // Never shuffle listening questions
        showResults: 'after-submission',
        allowReview: true,
        passingScore: 60,
        allowReplay, // Use passed parameter
        ...(allowReplay && maxReplays > 0 && { maxReplays }), // Only include if allowReplay is true

        // Use passed audioControls or default to IELTS Standard
        audioControls: audioControlsConfig ?? {
          showPlayPause: false,      // No pause button
          showProgressBar: true,     // Show progress (read-only)
          showSeekControl: false,    // Can't seek/rewind
          showSpeedControl: false,   // No speed control
          showSkipSection: false,    // Can't skip sections
          showVolumeControl: true,   // Always show volume (accessibility)
        },
      },

      statistics: {
        attempts: 0,
        averageScore: 0,
        averageTime: 0,
        completionRate: 0,
      },
    };

    // Save to Firebase under tests/ (same path as reading for now)
    const testRef = ref(database, `tests/${testId}`);
    await set(testRef, testData);

    console.log('Listening test saved to Firebase:', testId);

    return {
      success: true,
      testId,
    };

  } catch (error) {
    console.error('Error saving Listening test to Firebase:', error);

    let errorMessage = 'Failed to save Listening test';
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

// ============================================================
// GET LISTENING TEST
// ============================================================

/**
 * Get Listening test from Firebase
 */
export const getListeningTestFromFirebase = async (
  testId: string
): Promise<{ success: boolean; data?: ListeningTestData; error?: string }> => {
  try {
    const testRef = ref(database, `tests/${testId}`);
    const snapshot = await get(testRef);

    if (snapshot.exists()) {
      const data = snapshot.val() as ListeningTestData;

      // Verify it's a Listening test
      if (data.skill !== 'Listening') {
        return {
          success: false,
          error: `Test ${testId} is not a Listening test (found: ${data.skill})`,
        };
      }

      return {
        success: true,
        data,
      };
    } else {
      return {
        success: false,
        error: 'Listening test not found',
      };
    }
  } catch (error) {
    console.error('Error getting Listening test from Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get Listening test',
    };
  }
};

// ============================================================
// GET ALL LISTENING TESTS
// ============================================================

/**
 * Get all Listening tests from Firebase
 */
export const getAllListeningTestsFromFirebase = async (): Promise<{
  success: boolean;
  data?: ListeningTestData[];
  error?: string;
}> => {
  try {
    const testsRef = ref(database, 'tests');
    const snapshot = await get(testsRef);

    if (snapshot.exists()) {
      const testsData = snapshot.val();
      const allTests = Object.values(testsData) as ListeningTestData[];

      // Filter to only Listening tests
      const listeningTests = allTests.filter(test => test.skill === 'Listening');

      return {
        success: true,
        data: listeningTests,
      };
    } else {
      return {
        success: true,
        data: [],
      };
    }
  } catch (error) {
    console.error('Error getting Listening tests from Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get Listening tests',
    };
  }
};

// ============================================================
// UPDATE LISTENING TEST
// ============================================================

/**
 * Update Listening test in Firebase
 */
export const updateListeningTestInFirebase = async (
  testId: string,
  updates: Partial<ListeningTestData>
): Promise<{ success: boolean; error?: string }> => {
  try {
    // First get existing test to merge
    const existing = await getListeningTestFromFirebase(testId);
    if (!existing.success || !existing.data) {
      return {
        success: false,
        error: existing.error || 'Test not found',
      };
    }

    const testRef = ref(database, `tests/${testId}`);

    const updatedData: ListeningTestData = {
      ...existing.data,
      ...updates,
      updatedAt: Date.now(),
    };

    await set(testRef, updatedData);

    console.log('Listening test updated in Firebase:', testId);

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error updating Listening test in Firebase:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update Listening test',
    };
  }
};

// ============================================================
// DELETE LISTENING TEST
// ============================================================

/**
 * Delete Listening test from Firebase
 */
export const deleteListeningTestFromFirebase = async (
  testId: string
): Promise<{ success: boolean; error?: string }> => {
  void testId;
  return {
    success: false,
    error: 'Published Listening test physical deletion is blocked until the approved Task 6 audited deletion operation exists.',
  };
};

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
import { TestMarkingResult } from './autoMarking.service';
import { ReMarkEntry, ResultFilters, EnhancedTestResultRecord, PassageResult } from '../types/results.types';
import type { ResultContext } from '../types/solo.types';
import { saveGuestResult } from './guestResultsService';
import type { SectionResult } from '../types/thcs-test.types';

/**
 * Complete test result record
 */
export interface TestResultRecord {
  resultId: string;
  sessionCode: string;
  testId: string;
  studentId: string;
  studentName: string;

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
  ieltsData?: TestResultRecord['ieltsData'] // PRD-0039: IELTS passage results
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

    // Save to test_results/{resultId}
    await set(resultRef, resultRecord);

    // Create indexes for efficient querying
    // Index by session
    const sessionIndexRef = ref(database, `test_results_by_session/${sessionCode}/${resultId}`);
    await set(sessionIndexRef, {
      resultId,
      studentId,
      studentName,
      percentage: markingResult.percentage,
      submittedAt: markingResult.completedAt,
    });

    // Index by student
    const studentIndexRef = ref(database, `test_results_by_student/${studentId}/${resultId}`);
    await set(studentIndexRef, {
      resultId,
      sessionCode,
      testId,
      percentage: markingResult.percentage,
      submittedAt: markingResult.completedAt,
    });

    // Index by teacher (if teacherId is present)
    if (teacherId) {
      const teacherIndexRef = ref(database, `test_results_by_teacher/${teacherId}/${resultId}`);
      await set(teacherIndexRef, {
        resultId,
        sessionCode,
        studentId,
        studentName,
        percentage: markingResult.percentage,
        submittedAt: markingResult.completedAt,
        isGuest: !!isGuest
      });
    }

    // Index by course (if courseId is present) - PRD-0015: Phase 3
    if (academicContext?.courseId) {
      const courseIndexRef = ref(database, `test_results_by_course/${academicContext.courseId}/${studentId}/${resultId}`);
      await set(courseIndexRef, {
        resultId,
        studentId,
        studentName,
        percentage: markingResult.percentage,
        bandScore,
        testTitle: testMetadata.title,
        testSkill: testMetadata.skill,
        submittedAt: markingResult.completedAt,
        moduleId: academicContext.moduleId || null
      });
    }

    // Index by class (if classId is present) - PRD-0015: Phase 3
    if (academicContext?.classId) {
      const classIndexRef = ref(database, `test_results_by_class/${academicContext.classId}/${studentId}/${resultId}`);
      await set(classIndexRef, {
        resultId,
        studentId,
        studentName,
        percentage: markingResult.percentage,
        bandScore,
        testTitle: testMetadata.title,
        testSkill: testMetadata.skill,
        submittedAt: markingResult.completedAt,
        courseId: academicContext.courseId || null
      });
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
          link: `/student/results/${resultId}`,
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
export async function getTestResult(resultId: string): Promise<TestResultRecord | null> {
  try {
    const resultRef = ref(database, `test_results/${resultId}`);
    const snapshot = await get(resultRef);

    if (snapshot.exists()) {
      return snapshot.val() as TestResultRecord;
    }

    return null;
  } catch (error) {
    console.error('Error getting test result:', error);
    throw error;
  }
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

    // Fetch all results
    const results = await Promise.all(
      resultIds.map((resultId) => getTestResult(resultId))
    );

    return results.filter((r): r is TestResultRecord => r !== null);
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

    // Fetch all results
    const results = await Promise.all(
      resultIds.map((resultId) => getTestResult(resultId))
    );

    return results.filter((r): r is TestResultRecord => r !== null);
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

    // Fetch all results
    const results = await Promise.all(
      resultIds.map((resultId) => getTestResult(resultId))
    );

    let validResults = results.filter((r): r is TestResultRecord => r !== null);

    // Apply filters if provided
    if (filters) {
      if (filters.sessionCode) {
        validResults = validResults.filter(r => r.sessionCode === filters.sessionCode);
      }

      if (filters.classId) {
        // Assuming sessionCode might contain classId or we need another way to link
        // For now, this filter might need external class data, so skipping straightforward 
        // implementation unless classId is stored on result. 
        // If needed, we can matching against a list of session codes for that class.
        // Doing basic filtering for now.
      }

      if (filters.dateFrom) {
        validResults = validResults.filter(r => r.submittedAt >= filters.dateFrom!);
      }

      if (filters.dateTo) {
        validResults = validResults.filter(r => r.submittedAt <= filters.dateTo!);
      }

      if (filters.testType) {
        validResults = validResults.filter(r => r.testType === filters.testType);
      }

      if (filters.skill) {
        validResults = validResults.filter(r => r.testSkill === filters.skill);
      }

      if (filters.scoreMin !== undefined) {
        validResults = validResults.filter(r => r.percentage >= filters.scoreMin!);
      }

      if (filters.scoreMax !== undefined) {
        validResults = validResults.filter(r => r.percentage <= filters.scoreMax!);
      }

      if (filters.isGuest !== undefined) {
        validResults = validResults.filter(r => !!r.isGuest === filters.isGuest);
      }
    }

    return validResults;
  } catch (error) {
    console.error('Error getting teacher results:', error);
    throw error;
  }
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

    // Teacher index (if exists)
    if (result.teacherId) {
      const teacherIndexRef = ref(database, `test_results_by_teacher/${result.teacherId}/${resultId}`);
      await update(teacherIndexRef, {
        percentage: result.percentage
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

    // Fetch all results in parallel, skip inaccessible ones
    const results = await Promise.all(
      resultIds.map(async (resultId) => {
        try {
          const resultRef = ref(database, `test_results/${resultId}`);
          const snapshot = await get(resultRef);
          return snapshot.exists() ? (snapshot.val() as TestResultRecord) : null;
        } catch {
          return null;
        }
      })
    );

    // Filter by testId and sort by submittedAt DESC
    return results
      .filter((r): r is TestResultRecord => r !== null && r.testId === testId)
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

    // Fetch all results
    const allResults = await Promise.all(
      resultIds.map(async (resultId) => {
        try {
          const resultRef = ref(database, `test_results/${resultId}`);
          const snapshot = await get(resultRef);
          return snapshot.exists() ? (snapshot.val() as TestResultRecord) : null;
        } catch {
          return null;
        }
      })
    );

    const validResults = allResults.filter((r): r is TestResultRecord => r !== null);

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

    // Fetch all results in parallel
    const results = await Promise.all(
      resultIds.map(async (resultId) => {
        try {
          const resultRef = ref(database, `test_results/${resultId}`);
          const snapshot = await get(resultRef);
          return snapshot.exists() ? (snapshot.val() as TestResultRecord) : null;
        } catch {
          return null;
        }
      })
    );

    // Filter by testId
    return results.filter(
      (r): r is TestResultRecord => r !== null && r.testId === testId
    );
  } catch (error) {
    console.error('[TestResults] Error fetching class test scores:', error);
    throw new Error('Failed to fetch class test scores');
  }
}

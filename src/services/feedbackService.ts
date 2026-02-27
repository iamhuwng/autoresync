import { ref, set, get, update, push } from 'firebase/database';
import { database } from '@/services/firebase';

/**
 * Teacher Feedback Service
 * 
 * Handles CRUD operations for teacher feedback on student test results.
 * Supports both per-question feedback and overall result feedback.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

export interface QuestionFeedback {
    questionId: string;
    feedback: string;
    updatedAt: number;
    updatedBy: string; // teacherId
    teacherName?: string;
}

export interface OverallFeedback {
    feedback: string;
    updatedAt: number;
    updatedBy: string; // teacherId
    teacherName?: string;
}

export interface FeedbackHistoryEntry {
    timestamp: number;
    teacherId: string;
    teacherName?: string;
    type: 'question' | 'overall';
    questionId?: string;
    feedback: string;
}

/**
 * Save feedback for a specific question in a test result
 * 
 * @param resultId - The test result ID
 * @param questionId - The question ID
 * @param feedback - The feedback text
 * @param teacherId - The teacher's user ID
 * @param teacherName - Optional teacher display name
 * @returns Promise that resolves when feedback is saved
 */
export async function saveQuestionFeedback(
    resultId: string,
    questionId: string,
    feedback: string,
    teacherId: string,
    teacherName?: string
): Promise<void> {
    if (!resultId || !questionId || !teacherId) {
        throw new Error('Missing required parameters: resultId, questionId, or teacherId');
    }

    const feedbackData: QuestionFeedback = {
        questionId,
        feedback: feedback.trim(),
        updatedAt: Date.now(),
        updatedBy: teacherId,
        ...(teacherName && { teacherName })
    };

    // Save to test_results/{resultId}/questionFeedback/{questionId}
    const feedbackRef = ref(database, `test_results/${resultId}/questionFeedback/${questionId}`);
    await set(feedbackRef, feedbackData);

    // Also save to feedback history
    await saveFeedbackHistory(resultId, {
        timestamp: feedbackData.updatedAt,
        teacherId,
        teacherName,
        type: 'question',
        questionId,
        feedback: feedback.trim()
    });
}

/**
 * Get feedback for a specific question
 * 
 * @param resultId - The test result ID
 * @param questionId - The question ID
 * @returns Promise that resolves to the question feedback or null
 */
export async function getQuestionFeedback(
    resultId: string,
    questionId: string
): Promise<QuestionFeedback | null> {
    if (!resultId || !questionId) {
        return null;
    }

    const feedbackRef = ref(database, `test_results/${resultId}/questionFeedback/${questionId}`);
    const snapshot = await get(feedbackRef);

    return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Get all question feedback for a result
 * 
 * @param resultId - The test result ID
 * @returns Promise that resolves to a map of questionId to feedback
 */
export async function getAllQuestionFeedback(
    resultId: string
): Promise<Record<string, QuestionFeedback>> {
    if (!resultId) {
        return {};
    }

    const feedbackRef = ref(database, `test_results/${resultId}/questionFeedback`);
    const snapshot = await get(feedbackRef);

    return snapshot.exists() ? snapshot.val() : {};
}

/**
 * Save overall feedback for a test result
 * 
 * @param resultId - The test result ID
 * @param feedback - The overall feedback text
 * @param teacherId - The teacher's user ID
 * @param teacherName - Optional teacher display name
 * @returns Promise that resolves when feedback is saved
 */
export async function saveOverallFeedback(
    resultId: string,
    feedback: string,
    teacherId: string,
    teacherName?: string
): Promise<void> {
    if (!resultId || !teacherId) {
        throw new Error('Missing required parameters: resultId or teacherId');
    }

    const feedbackData: OverallFeedback = {
        feedback: feedback.trim(),
        updatedAt: Date.now(),
        updatedBy: teacherId,
        ...(teacherName && { teacherName })
    };

    // Save to test_results/{resultId}/overallFeedback
    const feedbackRef = ref(database, `test_results/${resultId}/overallFeedback`);
    await set(feedbackRef, feedbackData);

    // Update feedbackUpdatedAt and feedbackUpdatedBy at result level
    const resultRef = ref(database, `test_results/${resultId}`);
    await update(resultRef, {
        feedbackUpdatedAt: feedbackData.updatedAt,
        feedbackUpdatedBy: teacherId,
        hasFeedback: true
    });

    // Also save to feedback history
    await saveFeedbackHistory(resultId, {
        timestamp: feedbackData.updatedAt,
        teacherId,
        teacherName,
        type: 'overall',
        feedback: feedback.trim()
    });
}

/**
 * Get overall feedback for a result
 * 
 * @param resultId - The test result ID
 * @returns Promise that resolves to the overall feedback or null
 */
export async function getOverallFeedback(
    resultId: string
): Promise<OverallFeedback | null> {
    if (!resultId) {
        return null;
    }

    const feedbackRef = ref(database, `test_results/${resultId}/overallFeedback`);
    const snapshot = await get(feedbackRef);

    return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Save feedback history entry
 * 
 * @param resultId - The test result ID
 * @param entry - The feedback history entry
 * @returns Promise that resolves when history is saved
 */
async function saveFeedbackHistory(
    resultId: string,
    entry: FeedbackHistoryEntry
): Promise<void> {
    const historyRef = ref(database, `test_results/${resultId}/feedbackHistory`);
    const newEntryRef = push(historyRef);
    await set(newEntryRef, entry);
}

/**
 * Get feedback history for a result
 * 
 * @param resultId - The test result ID
 * @returns Promise that resolves to an array of feedback history entries
 */
export async function getFeedbackHistory(
    resultId: string
): Promise<FeedbackHistoryEntry[]> {
    if (!resultId) {
        return [];
    }

    const historyRef = ref(database, `test_results/${resultId}/feedbackHistory`);
    const snapshot = await get(historyRef);

    if (!snapshot.exists()) {
        return [];
    }

    const historyData = snapshot.val();
    const historyArray: FeedbackHistoryEntry[] = Object.values(historyData);

    // Sort by timestamp descending (newest first)
    return historyArray.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Delete question feedback
 * 
 * @param resultId - The test result ID
 * @param questionId - The question ID
 * @returns Promise that resolves when feedback is deleted
 */
export async function deleteQuestionFeedback(
    resultId: string,
    questionId: string
): Promise<void> {
    if (!resultId || !questionId) {
        throw new Error('Missing required parameters: resultId or questionId');
    }

    const feedbackRef = ref(database, `test_results/${resultId}/questionFeedback/${questionId}`);
    await set(feedbackRef, null);
}

/**
 * Delete overall feedback
 * 
 * @param resultId - The test result ID
 * @returns Promise that resolves when feedback is deleted
 */
export async function deleteOverallFeedback(
    resultId: string
): Promise<void> {
    if (!resultId) {
        throw new Error('Missing required parameter: resultId');
    }

    const feedbackRef = ref(database, `test_results/${resultId}/overallFeedback`);
    await set(feedbackRef, null);

    // Update result-level flags
    const resultRef = ref(database, `test_results/${resultId}`);

    // Check if there's still question feedback
    const questionFeedback = await getAllQuestionFeedback(resultId);
    const hasQuestionFeedback = Object.keys(questionFeedback).length > 0;

    await update(resultRef, {
        hasFeedback: hasQuestionFeedback,
        ...(hasQuestionFeedback ? {} : {
            feedbackUpdatedAt: null,
            feedbackUpdatedBy: null
        })
    });
}

/**
 * Check if a teacher can edit feedback for a result
 * This should verify that the result belongs to a course taught by this teacher
 * 
 * @param resultId - The test result ID
 * @param teacherId - The teacher's user ID
 * @returns Promise that resolves to true if teacher can edit, false otherwise
 */
export async function canTeacherEditFeedback(
    resultId: string,
    teacherId: string
): Promise<boolean> {
    if (!resultId || !teacherId) {
        return false;
    }

    try {
        // Get the test result
        const resultRef = ref(database, `test_results/${resultId}`);
        const resultSnapshot = await get(resultRef);

        if (!resultSnapshot.exists()) {
            return false;
        }

        const result = resultSnapshot.val();
        const courseId = result.courseId;

        // If no courseId, allow any teacher (for backward compatibility)
        if (!courseId) {
            return true;
        }

        // Check if teacher owns or teaches this course
        const courseRef = ref(database, `courses/${courseId}`);
        const courseSnapshot = await get(courseRef);

        if (!courseSnapshot.exists()) {
            return false;
        }

        const course = courseSnapshot.val();
        return course.createdBy === teacherId;
    } catch (error) {
        console.error('Error checking teacher permissions:', error);
        return false;
    }
}

/**
 * Bulk save feedback for multiple questions
 * 
 * @param resultId - The test result ID
 * @param feedbackMap - Map of questionId to feedback text
 * @param teacherId - The teacher's user ID
 * @param teacherName - Optional teacher display name
 * @returns Promise that resolves when all feedback is saved
 */
export async function bulkSaveQuestionFeedback(
    resultId: string,
    feedbackMap: Record<string, string>,
    teacherId: string,
    teacherName?: string
): Promise<void> {
    if (!resultId || !teacherId) {
        throw new Error('Missing required parameters: resultId or teacherId');
    }

    const promises = Object.entries(feedbackMap).map(([questionId, feedback]) => {
        if (feedback && feedback.trim()) {
            return saveQuestionFeedback(resultId, questionId, feedback, teacherId, teacherName);
        }
        return Promise.resolve();
    });

    await Promise.all(promises);
}

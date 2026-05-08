import { ref, set, get, update, push } from 'firebase/database';
import { database } from '@/services/firebase';
import { classifyTeacherResultVisibility } from './resultVisibility.service';

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
    updatedById?: string;
    updatedByName?: string;
    teacherName?: string;
}

export interface OverallFeedback {
    feedback: string;
    updatedAt: number;
    updatedBy: string; // teacherId
    updatedById?: string;
    updatedByName?: string;
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

type CanonicalQuestionResult = {
    questionNumber?: number;
    questionId?: string;
    teacherFeedback?: string | null;
    [key: string]: any;
};

type CanonicalResultRecord = {
    questionResults?: CanonicalQuestionResult[];
    overallFeedback?: string | null;
    feedbackUpdatedAt?: number | null;
    feedbackUpdatedBy?: string | null;
    feedbackUpdatedByTeacherId?: string | null;
    feedbackUpdatedByTeacherName?: string | null;
    hasFeedback?: boolean;
    teacherId?: string | null;
    visibility?: any;
    courseId?: string | null;
};

function normalizeFeedbackKey(value: string | number | null | undefined): string {
    return String(value ?? '').trim();
}

function resolveTeacherIdentity(teacherId: string, teacherName?: string) {
    const updatedByName = teacherName?.trim() || null;

    return {
        updatedById: teacherId,
        updatedByName,
        compatibilityLabel: updatedByName || teacherId,
    };
}

function getTeacherIdentityFromCanonicalResult(result: CanonicalResultRecord | null | undefined) {
    const updatedById = result?.feedbackUpdatedByTeacherId?.trim() || '';
    const updatedByName = result?.feedbackUpdatedByTeacherName?.trim() || '';
    const compatibilityUpdatedBy = result?.feedbackUpdatedBy?.trim() || '';

    return {
        updatedById: updatedById || compatibilityUpdatedBy,
        updatedByName: updatedByName || compatibilityUpdatedBy || undefined,
        compatibilityUpdatedBy: compatibilityUpdatedBy || updatedById || '',
    };
}

function buildQuestionFeedbackResponse(
    questionId: string,
    feedback: string,
    updatedAt: number,
    teacherIdentity: ReturnType<typeof getTeacherIdentityFromCanonicalResult>,
): QuestionFeedback {
    return {
        questionId,
        feedback,
        updatedAt,
        updatedBy: teacherIdentity.compatibilityUpdatedBy,
        updatedById: teacherIdentity.updatedById || undefined,
        updatedByName: teacherIdentity.updatedByName,
        ...(teacherIdentity.updatedByName ? { teacherName: teacherIdentity.updatedByName } : {}),
    };
}

function buildOverallFeedbackResponse(
    feedback: string,
    updatedAt: number,
    teacherIdentity: ReturnType<typeof getTeacherIdentityFromCanonicalResult>,
): OverallFeedback {
    return {
        feedback,
        updatedAt,
        updatedBy: teacherIdentity.compatibilityUpdatedBy,
        updatedById: teacherIdentity.updatedById || undefined,
        updatedByName: teacherIdentity.updatedByName,
        ...(teacherIdentity.updatedByName ? { teacherName: teacherIdentity.updatedByName } : {}),
    };
}

function normalizeStoredQuestionFeedback(value: QuestionFeedback): QuestionFeedback {
    const updatedBy = value.updatedById || value.updatedBy || '';
    const updatedByName = value.updatedByName || value.teacherName || (value.updatedBy && value.updatedBy !== updatedBy ? value.updatedBy : undefined);

    return {
        ...value,
        updatedBy,
        ...(updatedBy ? { updatedById: updatedBy } : {}),
        ...(updatedByName ? { updatedByName } : {}),
        ...(updatedByName ? { teacherName: updatedByName } : {}),
    };
}

function normalizeStoredOverallFeedback(value: OverallFeedback): OverallFeedback {
    const updatedBy = value.updatedById || value.updatedBy || '';
    const updatedByName = value.updatedByName || value.teacherName || (value.updatedBy && value.updatedBy !== updatedBy ? value.updatedBy : undefined);

    return {
        ...value,
        updatedBy,
        ...(updatedBy ? { updatedById: updatedBy } : {}),
        ...(updatedByName ? { updatedByName } : {}),
        ...(updatedByName ? { teacherName: updatedByName } : {}),
    };
}

async function getCanonicalResult(resultId: string): Promise<CanonicalResultRecord | null> {
    const resultRef = ref(database, `test_results/${resultId}`);
    const snapshot = await get(resultRef);
    return snapshot.exists() ? snapshot.val() : null;
}

function findQuestionResultIndex(result: CanonicalResultRecord | null, questionId: string): number {
    const normalizedQuestionId = normalizeFeedbackKey(questionId);

    if (!result?.questionResults?.length || !normalizedQuestionId) {
        return -1;
    }

    return result.questionResults.findIndex((questionResult) => {
        const questionNumberKey = normalizeFeedbackKey(questionResult.questionNumber);
        const questionIdKey = normalizeFeedbackKey(questionResult.questionId);

        return questionNumberKey === normalizedQuestionId || questionIdKey === normalizedQuestionId;
    });
}

function resultHasAnyFeedback(result: CanonicalResultRecord | null): boolean {
    if (!result) {
        return false;
    }

    if (typeof result.overallFeedback === 'string' && result.overallFeedback.trim()) {
        return true;
    }

    return (result.questionResults || []).some((questionResult) => {
        return typeof questionResult.teacherFeedback === 'string' && questionResult.teacherFeedback.trim().length > 0;
    });
}

async function syncCanonicalQuestionFeedback(
    resultId: string,
    questionId: string,
    feedback: string,
    teacherId: string,
    teacherName?: string,
    updatedAt?: number
): Promise<void> {
    try {
        const canonicalResult = await getCanonicalResult(resultId);
        const questionIndex = findQuestionResultIndex(canonicalResult, questionId);
        const teacherIdentity = resolveTeacherIdentity(teacherId, teacherName);

        if (questionIndex === -1) {
            return;
        }

        const resultRef = ref(database, `test_results/${resultId}`);
        await update(resultRef, {
            [`questionResults/${questionIndex}/teacherFeedback`]: feedback,
            feedbackUpdatedAt: updatedAt ?? Date.now(),
            feedbackUpdatedBy: teacherIdentity.compatibilityLabel,
            feedbackUpdatedByTeacherId: teacherIdentity.updatedById,
            feedbackUpdatedByTeacherName: teacherIdentity.updatedByName,
            hasFeedback: true
        });
    } catch (error) {
        console.warn('Failed to sync canonical question feedback:', error);
    }
}

async function syncCanonicalOverallFeedback(
    resultId: string,
    feedback: string,
    teacherId: string,
    teacherName?: string,
    updatedAt?: number
): Promise<void> {
    try {
        const resultRef = ref(database, `test_results/${resultId}`);
        const teacherIdentity = resolveTeacherIdentity(teacherId, teacherName);
        await update(resultRef, {
            overallFeedback: feedback,
            feedbackUpdatedAt: updatedAt ?? Date.now(),
            feedbackUpdatedBy: teacherIdentity.compatibilityLabel,
            feedbackUpdatedByTeacherId: teacherIdentity.updatedById,
            feedbackUpdatedByTeacherName: teacherIdentity.updatedByName,
            hasFeedback: true
        });
    } catch (error) {
        console.warn('Failed to sync canonical overall feedback:', error);
    }
}

async function clearCanonicalQuestionFeedback(resultId: string, questionId: string): Promise<void> {
    try {
        const canonicalResult = await getCanonicalResult(resultId);
        const questionIndex = findQuestionResultIndex(canonicalResult, questionId);

        if (questionIndex === -1) {
            return;
        }

        const nextResult: CanonicalResultRecord = {
            ...canonicalResult,
            questionResults: (canonicalResult?.questionResults || []).map((questionResult, index) => (
                index === questionIndex
                    ? { ...questionResult, teacherFeedback: null }
                    : questionResult
            ))
        };
        const hasFeedback = resultHasAnyFeedback(nextResult);
        const updateData: Record<string, any> = {
            [`questionResults/${questionIndex}/teacherFeedback`]: null,
            hasFeedback
        };

        if (!hasFeedback) {
            updateData.feedbackUpdatedAt = null;
            updateData.feedbackUpdatedBy = null;
            updateData.feedbackUpdatedByTeacherId = null;
            updateData.feedbackUpdatedByTeacherName = null;
        }

        const resultRef = ref(database, `test_results/${resultId}`);
        await update(resultRef, updateData);
    } catch (error) {
        console.warn('Failed to clear canonical question feedback:', error);
    }
}

async function clearCanonicalOverallFeedback(resultId: string): Promise<void> {
    try {
        const canonicalResult = await getCanonicalResult(resultId);
        const nextResult: CanonicalResultRecord = {
            ...canonicalResult,
            overallFeedback: null
        };
        const hasFeedback = resultHasAnyFeedback(nextResult);
        const updateData: Record<string, any> = {
            overallFeedback: null,
            hasFeedback
        };

        if (!hasFeedback) {
            updateData.feedbackUpdatedAt = null;
            updateData.feedbackUpdatedBy = null;
            updateData.feedbackUpdatedByTeacherId = null;
            updateData.feedbackUpdatedByTeacherName = null;
        }

        const resultRef = ref(database, `test_results/${resultId}`);
        await update(resultRef, updateData);
    } catch (error) {
        console.warn('Failed to clear canonical overall feedback:', error);
    }
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

    const normalizedFeedback = feedback.trim();
    const teacherIdentity = resolveTeacherIdentity(teacherId, teacherName);
    const feedbackData: QuestionFeedback = {
        questionId,
        feedback: normalizedFeedback,
        updatedAt: Date.now(),
        updatedBy: teacherIdentity.compatibilityLabel,
        updatedById: teacherIdentity.updatedById,
        ...(teacherIdentity.updatedByName ? { updatedByName: teacherIdentity.updatedByName } : {}),
        ...(teacherIdentity.updatedByName ? { teacherName: teacherIdentity.updatedByName } : {})
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
        feedback: normalizedFeedback
    });

    await syncCanonicalQuestionFeedback(
        resultId,
        questionId,
        normalizedFeedback,
        teacherId,
        teacherName,
        feedbackData.updatedAt
    );
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

    if (snapshot.exists()) {
        return normalizeStoredQuestionFeedback(snapshot.val());
    }

    const canonicalResult = await getCanonicalResult(resultId);
    const questionIndex = findQuestionResultIndex(canonicalResult, questionId);

    if (questionIndex === -1) {
        return null;
    }

    const questionFeedback = canonicalResult?.questionResults?.[questionIndex]?.teacherFeedback;
    if (!questionFeedback) {
        return null;
    }

    return buildQuestionFeedbackResponse(
        questionId,
        questionFeedback,
        canonicalResult?.feedbackUpdatedAt ?? Date.now(),
        getTeacherIdentityFromCanonicalResult(canonicalResult),
    );
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

    if (snapshot.exists()) {
        const storedFeedback = snapshot.val() as Record<string, QuestionFeedback>;
        return Object.fromEntries(
            Object.entries(storedFeedback).map(([questionId, value]) => [questionId, normalizeStoredQuestionFeedback(value)]),
        );
    }

    const canonicalResult = await getCanonicalResult(resultId);
    if (!canonicalResult?.questionResults?.length) {
        return {};
    }

    const fallbackFeedback: Record<string, QuestionFeedback> = {};

    canonicalResult.questionResults.forEach((questionResult) => {
        if (!questionResult.teacherFeedback) {
            return;
        }

        const fallbackQuestionId = normalizeFeedbackKey(questionResult.questionNumber || questionResult.questionId);
        if (!fallbackQuestionId) {
            return;
        }

        fallbackFeedback[fallbackQuestionId] = buildQuestionFeedbackResponse(
            fallbackQuestionId,
            questionResult.teacherFeedback,
            canonicalResult.feedbackUpdatedAt ?? Date.now(),
            getTeacherIdentityFromCanonicalResult(canonicalResult),
        );
    });

    return fallbackFeedback;
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

    const normalizedFeedback = feedback.trim();
    const teacherIdentity = resolveTeacherIdentity(teacherId, teacherName);
    const feedbackData: OverallFeedback = {
        feedback: normalizedFeedback,
        updatedAt: Date.now(),
        updatedBy: teacherIdentity.compatibilityLabel,
        updatedById: teacherIdentity.updatedById,
        ...(teacherIdentity.updatedByName ? { updatedByName: teacherIdentity.updatedByName } : {}),
        ...(teacherIdentity.updatedByName ? { teacherName: teacherIdentity.updatedByName } : {})
    };

    // Save to test_results/{resultId}/overallFeedback
    const feedbackRef = ref(database, `test_results/${resultId}/overallFeedback`);
    await set(feedbackRef, feedbackData);

    // Update feedbackUpdatedAt and feedbackUpdatedBy at result level
    const resultRef = ref(database, `test_results/${resultId}`);
    await update(resultRef, {
        feedbackUpdatedAt: feedbackData.updatedAt,
        feedbackUpdatedBy: teacherIdentity.compatibilityLabel,
        feedbackUpdatedByTeacherId: teacherIdentity.updatedById,
        feedbackUpdatedByTeacherName: teacherIdentity.updatedByName,
        hasFeedback: true
    });

    // Also save to feedback history
    await saveFeedbackHistory(resultId, {
        timestamp: feedbackData.updatedAt,
        teacherId,
        teacherName,
        type: 'overall',
        feedback: normalizedFeedback
    });

    await syncCanonicalOverallFeedback(
        resultId,
        normalizedFeedback,
        teacherId,
        teacherName,
        feedbackData.updatedAt
    );
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

    if (snapshot.exists()) {
        return normalizeStoredOverallFeedback(snapshot.val());
    }

    const canonicalResult = await getCanonicalResult(resultId);
    if (!canonicalResult?.overallFeedback) {
        return null;
    }

    return buildOverallFeedbackResponse(
        canonicalResult.overallFeedback,
        canonicalResult.feedbackUpdatedAt ?? Date.now(),
        getTeacherIdentityFromCanonicalResult(canonicalResult),
    );
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

    await clearCanonicalQuestionFeedback(resultId, questionId);
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
            feedbackUpdatedBy: null,
            feedbackUpdatedByTeacherId: null,
            feedbackUpdatedByTeacherName: null,
        })
    });

    await clearCanonicalOverallFeedback(resultId);
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

        if (result.visibility) {
            return classifyTeacherResultVisibility({
                result,
                teacherId,
                hasAssignmentAccess: true,
            }).shouldAllowTeacherActions;
        }

        if (result.teacherId && result.teacherId === teacherId) {
            return true;
        }

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

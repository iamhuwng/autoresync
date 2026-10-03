import { ref, get, update } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { database } from '@/services/firebase';
import { notifyCommittedEvent } from './notificationProducerClient';
import { verifyHomeworkResultAuthority } from './homeworkResultAuthorityClient';

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
    resultId?: string;
    studentId?: string;
    expectedRevision?: number;
    revision?: number;
    eventId?: string;
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
    overallFeedback?: string | OverallFeedback | null;
    feedbackUpdatedAt?: number | null;
    feedbackUpdatedBy?: string | null;
    feedbackUpdatedByTeacherId?: string | null;
    feedbackUpdatedByTeacherName?: string | null;
    hasFeedback?: boolean;
    teacherId?: string | null;
    visibility?: any;
    courseId?: string | null;
    [key: string]: any;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export interface FeedbackSaveOptions { eventId?: string; expectedRevision?: number }

/** Result actions require the current RTDB source or the protected homework receipt. */
export async function getAuthorizedTeacherResult(resultId: string, teacherId = getAuth().currentUser?.uid) {
    const uid = getAuth().currentUser?.uid;
    if (!ID.test(resultId) || !uid || uid !== teacherId) throw new Error('Result action unauthenticated');
    let result: CanonicalResultRecord | null;
    try { result = await getCanonicalResult(resultId); }
    catch (error) {
        if (!/permission[ _-]?denied/iu.test(String(error))) throw error;
        const verification = await verifyHomeworkResultAuthority(resultId);
        if (verification.status === 'held' || verification.status === 'failed') throw new Error(verification.code);
        result = await getCanonicalResult(resultId);
    }
    if (!result) throw new Error('Result not found');
    if (result.resultId !== resultId || !ID.test(result.studentId)) throw new Error('Result authority mismatch');
    const actor = (await get(ref(database, `users/${uid}`))).val();
    const visibility = result.visibility;
    if (actor?.role !== 'teacher') throw new Error('Result action forbidden');
    if (visibility?.ownershipResolved && visibility.visibilityOwnerTeacherId === uid
        && ['session', 'class'].includes(visibility.sourceType)) {
        const sharedSolo = visibility.contextType === 'solo_practice';
        const source = (await get(ref(database, visibility.sourceType === 'session'
            ? `game_sessions/${result.sessionCode}` : `classes/${visibility.classId}`))).val();
        const sourceOwner = visibility.sourceType === 'session'
            ? (typeof source?.createdByUserId === 'string' ? source.createdByUserId : source?.createdBy) : source?.createdBy;
        const sourceMatches = visibility.sourceType === 'session'
            ? visibility.contextType === 'class_session' && visibility.sourceId === result.sessionCode
                && visibility.sessionCode === result.sessionCode && ID.test(result.testId)
                && [source?.testId, source?.lastTestId].includes(result.testId)
                && (visibility.classId ?? null) === (source?.linkedClassId ?? source?.classId ?? null)
                && (visibility.courseId ?? null) === (source?.courseId ?? null)
                && Boolean(source?.players?.[result.studentId] || source?.students?.[result.studentId])
            : source?.status === 'active' && source.students?.[result.studentId]?.status === 'active'
                && visibility.sourceId === visibility.classId
                && (visibility.courseId ?? null) === (source?.courseId ?? null)
                && (visibility.contextType === 'course_material' || (sharedSolo
                    && result.context?.selectedTeacherId === uid && result.context.classId === visibility.classId));
        if (!source || sourceOwner !== uid || !sourceMatches) throw new Error('Result action forbidden');
        return { result, actor, teacherId: uid };
    }
    const authorityRef = ref(database, `result_notification_authority/${resultId}`);
    let authority: any;
    try { authority = (await get(authorityRef)).val(); }
    catch (error) {
        if (!/permission[ _-]?denied/iu.test(String(error))) throw error;
    }
    if (!authority) {
        const verification = await verifyHomeworkResultAuthority(resultId);
        if (verification.status === 'held' || verification.status === 'failed') throw new Error(verification.code);
        authority = (await get(authorityRef)).val();
    }
    const context = result.context;
    const source = context?.source;
    if (!authority || authority.schemaVersion !== 2 || authority.contextType !== 'homework'
        || authority.resultId !== resultId || authority.studentId !== result.studentId || authority.ownerTeacherId !== uid
        || authority.testId !== result.testId || authority.submittedAt !== result.submittedAt
        || authority.writingSubmittedAt !== result.createdAt || result.submittedAt !== result.createdAt
        || !ID.test(authority.homeworkId) || !ID.test(authority.homeworkSubmissionId)
        || result.testType !== 'homework' || result.testSkill !== 'writing' || result.isGuest !== false
        || result.writingData?.submissionId !== resultId || context?.type !== 'homework' || source?.type !== 'homework'
        || source.id !== authority.homeworkId || source.submissionId !== resultId
        || context.assignment?.homeworkId !== authority.homeworkId
        || [result.sessionCode, result.classId, result.courseId, result.moduleId,
            context.sessionCode, context.classId, context.courseId, source.classId, source.courseId].some(Boolean)) {
        throw new Error('Result authority mismatch');
    }
    if (!visibility?.ownershipResolved) {
        const preservedVisibility = { ...visibility, ownershipResolved: true, visibilityOwnerTeacherId: uid,
            contextType: 'homework', sourceType: 'homework', sourceId: authority.homeworkId,
            homeworkId: authority.homeworkId, ownerResolutionSource: 'homework.createdBy', unresolvedReason: null };
        await update(ref(database, `test_results/${resultId}`), { visibility: preservedVisibility });
        result = { ...result, visibility: preservedVisibility };
    } else if (visibility.visibilityOwnerTeacherId !== uid || visibility.contextType !== 'homework'
        || visibility.sourceType !== 'homework' || visibility.sourceId !== authority.homeworkId
        || visibility.homeworkId !== authority.homeworkId) throw new Error('Result authority mismatch');
    return { result, actor, teacherId: uid };
}

function feedbackRevision(result: CanonicalResultRecord, expectedRevision?: number): number {
    const revision = result.feedbackRevision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0
        || (expectedRevision !== undefined && expectedRevision !== revision)) throw new Error('Feedback revision conflict');
    return revision;
}

export async function getFeedbackRevision(resultId: string): Promise<number> {
    const result = await getCanonicalResult(resultId);
    if (!result) throw new Error('Result not found');
    return feedbackRevision(result);
}

async function saveFeedback(resultId: string, type: 'question' | 'overall', feedback: string,
    teacherId: string, questionId: string | undefined, options: FeedbackSaveOptions): Promise<void> {
    const text = feedback.trim();
    const eventId = options.eventId ?? crypto.randomUUID();
    if (!UUID.test(eventId) || !text || text.length > 5000 || (questionId !== undefined && !ID.test(questionId))) {
        throw new Error('Feedback invalid');
    }
    const { result, actor } = await getAuthorizedTeacherResult(resultId, teacherId);
    const existing = result.feedbackHistory?.[eventId];
    if (existing) {
        if (existing.eventId !== eventId || existing.resultId !== resultId || existing.studentId !== result.studentId
            || existing.teacherId !== teacherId || existing.type !== type || existing.questionId !== questionId
            || existing.feedback !== text || !Number.isSafeInteger(existing.expectedRevision) || existing.expectedRevision < 0
            || existing.revision !== existing.expectedRevision + 1
            || (options.expectedRevision !== undefined && existing.expectedRevision !== options.expectedRevision)) throw new Error('Feedback event conflict');
        notifyFeedbackOccurrence(resultId, eventId);
        return;
    }
    const revision = feedbackRevision(result, options.expectedRevision);
    const questionIndex = questionId === undefined ? -1 : findQuestionResultIndex(result, questionId);
    if (questionId !== undefined && questionIndex < 0) throw new Error('Feedback question not found');
    const occurredAt = Date.now();
    const name = [actor.displayName, actor.name, actor.fullName].find((value) => typeof value === 'string' && value.trim())?.trim().slice(0, 100);
    const question = questionId === undefined ? {} : { questionId };
    const target = { ...question, feedback: text, updatedAt: occurredAt, updatedBy: teacherId,
        updatedById: teacherId, eventId, ...(name ? { updatedByName: name, teacherName: name } : {}) };
    const path = `test_results/${resultId}`;
    const writes: Record<string, unknown> = {
        [`${path}/feedbackHistory/${eventId}`]: { ...question, eventId, resultId, studentId: result.studentId,
            timestamp: occurredAt, teacherId, type, feedback: text, expectedRevision: revision, revision: revision + 1,
            ...(name ? { teacherName: name } : {}) },
        [`${path}/feedbackRevision`]: revision + 1,
        [`${path}/feedbackMutation`]: { type, ...question, ...(questionId === undefined ? {} : { questionIndex: String(questionIndex) }), expectedRevision: revision, revision: revision + 1, eventId },
        [`${path}/feedbackNotificationEventId`]: eventId,
        [`${path}/feedbackUpdatedAt`]: occurredAt,
        [`${path}/feedbackUpdatedBy`]: teacherId,
        [`${path}/feedbackUpdatedByTeacherId`]: teacherId,
        [`${path}/feedbackUpdatedByTeacherName`]: name || null,
        [`${path}/hasFeedback`]: true,
    };
    if (questionId !== undefined) {
        writes[`${path}/questionFeedback/${questionId}`] = target;
        writes[`${path}/questionResults/${questionIndex}/teacherFeedback`] = text;
    } else writes[`${path}/overallFeedback`] = target;
    await update(ref(database), writes);
    notifyFeedbackOccurrence(resultId, eventId);
}

function notifyFeedbackOccurrence(resultId: string, eventId: string): void {
    void notifyCommittedEvent({ eventKind: 'feedback-saved', resultId, eventId });
}

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

    if ((typeof result.overallFeedback === 'string' && result.overallFeedback.trim())
        || (typeof result.overallFeedback === 'object' && result.overallFeedback?.feedback?.trim())) {
        return true;
    }

    return (result.questionResults || []).some((questionResult) => {
        return typeof questionResult.teacherFeedback === 'string' && questionResult.teacherFeedback.trim().length > 0;
    });
}

async function deleteFeedback(resultId: string, questionId?: string, expectedRevision?: number): Promise<void> {
    const { result } = await getAuthorizedTeacherResult(resultId);
    const revision = feedbackRevision(result, expectedRevision);
    if (questionId !== undefined && !ID.test(questionId)) throw new Error('Feedback invalid');
    const index = questionId === undefined ? -1 : findQuestionResultIndex(result, questionId);
    if (questionId !== undefined && index < 0) throw new Error('Feedback question not found');
    const remaining = { ...result, overallFeedback: questionId === undefined ? null : result.overallFeedback,
        questionResults: (result.questionResults || []).map((question, i) => i === index ? { ...question, teacherFeedback: null } : question) };
    const hasFeedback = resultHasAnyFeedback(remaining);
    const path = `test_results/${resultId}`;
    const writes: Record<string, unknown> = {
        [`${path}/feedbackRevision`]: revision + 1,
        [`${path}/feedbackMutation`]: { type: questionId === undefined ? 'delete-overall' : 'delete-question',
            ...(questionId === undefined ? {} : { questionId, questionIndex: String(index) }), expectedRevision: revision, revision: revision + 1 },
        [`${path}/hasFeedback`]: hasFeedback,
    };
    if (questionId === undefined) writes[`${path}/overallFeedback`] = null;
    else {
        writes[`${path}/questionFeedback/${questionId}`] = null;
        writes[`${path}/questionResults/${index}/teacherFeedback`] = null;
    }
    if (!hasFeedback) for (const field of ['feedbackUpdatedAt', 'feedbackUpdatedBy', 'feedbackUpdatedByTeacherId', 'feedbackUpdatedByTeacherName']) {
        writes[`${path}/${field}`] = null;
    }
    await update(ref(database), writes);
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
    _teacherName?: string, options: FeedbackSaveOptions = {}
): Promise<void> {
    if (!resultId || !questionId || !teacherId) {
        throw new Error('Missing required parameters: resultId, questionId, or teacherId');
    }

    await saveFeedback(resultId, 'question', feedback, teacherId, questionId, options);
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
    _teacherName?: string, options: FeedbackSaveOptions = {}
): Promise<void> {
    if (!resultId || !teacherId) {
        throw new Error('Missing required parameters: resultId or teacherId');
    }

    await saveFeedback(resultId, 'overall', feedback, teacherId, undefined, options);
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
        const stored = snapshot.val();
        if (typeof stored !== 'string') return normalizeStoredOverallFeedback(stored);
        const canonicalResult = await getCanonicalResult(resultId);
        return buildOverallFeedbackResponse(stored, canonicalResult?.feedbackUpdatedAt ?? Date.now(),
            getTeacherIdentityFromCanonicalResult(canonicalResult));
    }

    const canonicalResult = await getCanonicalResult(resultId);
    if (!canonicalResult?.overallFeedback) {
        return null;
    }
    if (typeof canonicalResult.overallFeedback !== 'string') {
        return normalizeStoredOverallFeedback(canonicalResult.overallFeedback);
    }

    return buildOverallFeedbackResponse(
        canonicalResult.overallFeedback,
        canonicalResult.feedbackUpdatedAt ?? Date.now(),
        getTeacherIdentityFromCanonicalResult(canonicalResult),
    );
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
    questionId: string,
    options: { expectedRevision?: number } = {},
): Promise<void> {
    if (!resultId || !questionId) {
        throw new Error('Missing required parameters: resultId or questionId');
    }

    await deleteFeedback(resultId, questionId, options.expectedRevision);
}

/**
 * Delete overall feedback
 * 
 * @param resultId - The test result ID
 * @returns Promise that resolves when feedback is deleted
 */
export async function deleteOverallFeedback(
    resultId: string,
    options: { expectedRevision?: number } = {},
): Promise<void> {
    if (!resultId) {
        throw new Error('Missing required parameter: resultId');
    }

    await deleteFeedback(resultId, undefined, options.expectedRevision);
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
        await getAuthorizedTeacherResult(resultId, teacherId);
        return true;
    } catch { return false; }
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

    for (const [questionId, feedback] of Object.entries(feedbackMap)) {
        if (feedback && feedback.trim()) {
            await saveQuestionFeedback(resultId, questionId, feedback, teacherId, teacherName);
        }
    }
}

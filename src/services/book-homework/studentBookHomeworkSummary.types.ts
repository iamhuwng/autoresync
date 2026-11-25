import type {
    BookHomeworkProgressGradingState,
    BookHomeworkProgressScore,
} from './bookHomeworkProgress.types';

export const STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION = 1 as const;

export type StudentBookHomeworkSummaryStatus =
    | 'not_started'
    | 'in_progress'
    | 'completed';

export type StudentBookHomeworkSummaryScore = BookHomeworkProgressScore;

export interface StudentBookHomeworkSummaryActivity {
    readonly activityId: string;
    readonly order: number;
    readonly submitted: boolean;
    readonly submittedAt: number;
    readonly gradingState: BookHomeworkProgressGradingState;
    readonly score?: StudentBookHomeworkSummaryScore;
}

export interface StudentBookHomeworkSummaryRecord {
    readonly schemaVersion: typeof STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION;
    readonly studentId: string;
    readonly homeworkId: string;
    readonly bookId: string | null;
    readonly status: StudentBookHomeworkSummaryStatus;
    readonly isComplete: boolean;
    readonly submittedCount: number;
    readonly requiredCount: number;
    readonly scoredCount: number;
    readonly pendingReviewCount: number;
    readonly latestSubmittedAt: number;
    readonly updatedAt: number;
    readonly activities: readonly StudentBookHomeworkSummaryActivity[];
}

const NUMERIC_OBJECT_KEY = /^\d+$/u;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const nonEmptyString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isValidStatus = (value: unknown): value is StudentBookHomeworkSummaryStatus =>
    value === 'not_started' || value === 'in_progress' || value === 'completed';

const isValidGradingState = (value: unknown): value is BookHomeworkProgressGradingState =>
    value === 'ungraded' || value === 'scored' || value === 'review_required';

const normalizeActivityScore = (
    rawScore: unknown,
): StudentBookHomeworkSummaryScore | undefined | null => {
    if (rawScore === undefined || rawScore === null) {
        return undefined;
    }
    if (!isPlainRecord(rawScore)) {
        return null;
    }
    if (typeof rawScore.earnedScore !== 'number'
        || !Number.isFinite(rawScore.earnedScore)
        || typeof rawScore.maximumScore !== 'number'
        || !Number.isFinite(rawScore.maximumScore)) {
        return null;
    }
    if (rawScore.displayScore !== undefined
        && rawScore.displayScore !== null
        && typeof rawScore.displayScore !== 'string') {
        return null;
    }
    const displayScore = typeof rawScore.displayScore === 'string' && rawScore.displayScore.trim()
        ? rawScore.displayScore.trim()
        : undefined;

    return {
        earnedScore: rawScore.earnedScore,
        maximumScore: rawScore.maximumScore,
        ...(displayScore ? { displayScore } : {}),
    };
};

const normalizeSummaryActivity = (
    rawActivity: unknown,
): StudentBookHomeworkSummaryActivity | null => {
    if (!isPlainRecord(rawActivity)) {
        return null;
    }
    const activityId = nonEmptyString(rawActivity.activityId);
    if (!activityId
        || !isNonNegativeFiniteNumber(rawActivity.order)
        || typeof rawActivity.submitted !== 'boolean'
        || !isValidGradingState(rawActivity.gradingState)) {
        return null;
    }
    const submittedAt = rawActivity.submittedAt === undefined
        ? 0
        : rawActivity.submittedAt;
    if (!isNonNegativeFiniteNumber(submittedAt)) {
        return null;
    }
    const score = normalizeActivityScore(rawActivity.score);
    if (score === null) {
        return null;
    }

    return {
        activityId,
        order: rawActivity.order,
        submitted: rawActivity.submitted,
        submittedAt,
        gradingState: rawActivity.gradingState,
        ...(score ? { score } : {}),
    };
};

const normalizeSummaryActivities = (
    rawActivities: unknown,
): readonly StudentBookHomeworkSummaryActivity[] | null => {
    if (rawActivities === undefined || rawActivities === null) {
        return [];
    }

    if (Array.isArray(rawActivities)) {
        const activities: StudentBookHomeworkSummaryActivity[] = [];
        for (const entry of rawActivities) {
            if (entry === undefined || entry === null) {
                continue;
            }
            const normalized = normalizeSummaryActivity(entry);
            if (!normalized) {
                return null;
            }
            activities.push(normalized);
        }
        return activities;
    }

    if (isPlainRecord(rawActivities)) {
        const entries = Object.entries(rawActivities);
        if (entries.some(([key]) => !NUMERIC_OBJECT_KEY.test(key))) {
            return null;
        }
        entries.sort(([leftKey], [rightKey]) => Number(leftKey) - Number(rightKey));
        const activities: StudentBookHomeworkSummaryActivity[] = [];
        for (const [, entry] of entries) {
            if (entry === undefined || entry === null) {
                continue;
            }
            const normalized = normalizeSummaryActivity(entry);
            if (!normalized) {
                return null;
            }
            activities.push(normalized);
        }
        return activities;
    }

    return null;
};

export function normalizeStudentBookHomeworkSummaryRecord(
    raw: unknown,
    fallbackHomeworkId?: string,
): StudentBookHomeworkSummaryRecord | null {
    if (!isPlainRecord(raw)) {
        return null;
    }
    if (raw.schemaVersion !== STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION) {
        return null;
    }

    const studentId = nonEmptyString(raw.studentId);
    const rawHomeworkId = nonEmptyString(raw.homeworkId);
    const fallbackId = nonEmptyString(fallbackHomeworkId);
    if (rawHomeworkId && fallbackId && rawHomeworkId !== fallbackId) {
        return null;
    }
    const homeworkId = rawHomeworkId ?? fallbackId;
    if (!studentId || !homeworkId) {
        return null;
    }

    if (raw.bookId !== undefined && raw.bookId !== null && typeof raw.bookId !== 'string') {
        return null;
    }
    const bookId = typeof raw.bookId === 'string' && raw.bookId.trim().length > 0
        ? raw.bookId.trim()
        : null;

    if (!isValidStatus(raw.status) || typeof raw.isComplete !== 'boolean') {
        return null;
    }

    if (!isNonNegativeFiniteNumber(raw.submittedCount)
        || !isNonNegativeFiniteNumber(raw.requiredCount)
        || !isNonNegativeFiniteNumber(raw.scoredCount)
        || !isNonNegativeFiniteNumber(raw.pendingReviewCount)) {
        return null;
    }

    const latestSubmittedAt = raw.latestSubmittedAt === undefined ? 0 : raw.latestSubmittedAt;
    const updatedAt = raw.updatedAt === undefined ? 0 : raw.updatedAt;
    if (!isNonNegativeFiniteNumber(latestSubmittedAt) || !isNonNegativeFiniteNumber(updatedAt)) {
        return null;
    }

    const activities = normalizeSummaryActivities(raw.activities);
    if (!activities) {
        return null;
    }

    return {
        schemaVersion: STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION,
        studentId,
        homeworkId,
        bookId,
        status: raw.status,
        isComplete: raw.isComplete,
        submittedCount: raw.submittedCount,
        requiredCount: raw.requiredCount,
        scoredCount: raw.scoredCount,
        pendingReviewCount: raw.pendingReviewCount,
        latestSubmittedAt,
        updatedAt,
        activities,
    };
}

export function normalizeStudentBookHomeworkSummaryMap(
    raw: unknown,
): ReadonlyMap<string, StudentBookHomeworkSummaryRecord> {
    if (!isPlainRecord(raw)) {
        return new Map();
    }

    const summaries = new Map<string, StudentBookHomeworkSummaryRecord>();
    for (const [homeworkKey, value] of Object.entries(raw)) {
        const normalized = normalizeStudentBookHomeworkSummaryRecord(value, homeworkKey);
        if (normalized) {
            summaries.set(normalized.homeworkId, normalized);
        }
    }
    return summaries;
}

import type { StudentHomeworkItem } from '../hooks/useHomeworkSubmission';
import { bookResultGroupKey } from './book-activity/results/bookResult.types';
import { isBookHomeworkCompatibilityProjection } from './book-homework/bookHomeworkCompatibilityProjection.service';
import type { BookHomeworkProgressGradingState } from './book-homework/bookHomeworkProgress.types';
import type { StudentBookHomeworkSummaryActivity } from './book-homework/studentBookHomeworkSummary.types';

export interface AcademicRecordBookResultRow {
    readonly homeworkId: string;
    readonly homeworkTitle: string;
    readonly bookId: string | null;
    readonly activityId: string;
    readonly activityLabel: string;
    readonly order: number;
    readonly gradingState: BookHomeworkProgressGradingState;
    readonly statusLabel: string;
    readonly scoreLabel: string | null;
    readonly submittedAt: number;
    readonly resultHandle: string | null;
}

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const SAFE_RESULT_ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const SAFE_RESULT_GROUP_KEY = /^g_[A-Za-z0-9_-]{4,638}$/u;

const matchesDateRange = (timestampMs: number, dateRange: string, now: number): boolean => {
    if (!dateRange || dateRange === 'all') {
        return true;
    }
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
        return false;
    }
    if (dateRange === '3m' || dateRange === 'quarter') {
        return timestampMs >= now - THREE_MONTHS_MS;
    }
    if (dateRange === 'ytd' || dateRange === 'year') {
        const startOfYear = new Date(new Date(now).getFullYear(), 0, 1).getTime();
        return timestampMs >= startOfYear;
    }
    if (dateRange === 'month' || dateRange === '1m') {
        return timestampMs >= now - 30 * 24 * 60 * 60 * 1000;
    }
    if (dateRange === 'week' || dateRange === '7d') {
        return timestampMs >= now - 7 * 24 * 60 * 60 * 1000;
    }
    return true;
};

const formatActivityStatusLabel = (gradingState: BookHomeworkProgressGradingState): string => {
    if (gradingState === 'scored') return 'Scored';
    if (gradingState === 'review_required') return 'Pending review';
    return 'Submitted';
};

const formatActivityScoreLabel = (activity: StudentBookHomeworkSummaryActivity): string | null => {
    if (!activity.score) return null;
    if (typeof activity.score.displayScore === 'string' && activity.score.displayScore.trim()) {
        return activity.score.displayScore.trim();
    }
    return `${activity.score.earnedScore}/${activity.score.maximumScore}`;
};

const encodeBase64Url = (value: unknown): string => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    if (typeof btoa !== 'function') {
        return '';
    }
    return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const safeResultHandle = (
    bookId: string | null,
    studentId: string,
    activityId: string,
    homeworkId: string,
): string | null => {
    if (!bookId
        || !SAFE_RESULT_ROUTE_ID.test(bookId)
        || !SAFE_RESULT_ROUTE_ID.test(studentId)
        || !SAFE_RESULT_ROUTE_ID.test(homeworkId)) {
        return null;
    }
    try {
        const groupKey = bookResultGroupKey(studentId, activityId);
        if (!SAFE_RESULT_GROUP_KEY.test(groupKey)) {
            return null;
        }
        const encoded = encodeBase64Url([bookId, studentId, groupKey, homeworkId]);
        return encoded ? `br_${encoded}` : null;
    } catch {
        return null;
    }
};

/**
 * Pure, synchronous, Firebase-free selector over shell-owned `StudentHomeworkItem[]`.
 * Reads `item.bookProgressSummary` hydrated once from `student_book_homework_summaries/{studentId}`.
 */
export function deriveAcademicRecordBookResults(input: {
    readonly studentId: string;
    readonly homeworkItems: readonly StudentHomeworkItem[];
    readonly dateRange: string;
    readonly now?: number;
}): readonly AcademicRecordBookResultRow[] {
    const {
        studentId,
        homeworkItems,
        dateRange,
        now = Date.now(),
    } = input;
    const normalizedStudentId = typeof studentId === 'string' ? studentId.trim() : '';
    if (!normalizedStudentId) return [];

    const dedupedByHomeworkId = new Map<string, StudentHomeworkItem>();
    for (const item of homeworkItems) {
        const homeworkCandidate: unknown = item.homework;
        if (!isBookHomeworkCompatibilityProjection(homeworkCandidate)) continue;
        if (!item.bookProgressSummary) continue;
        if (!dedupedByHomeworkId.has(homeworkCandidate.id)) {
            dedupedByHomeworkId.set(homeworkCandidate.id, item);
        }
    }

    const rows: AcademicRecordBookResultRow[] = [];
    for (const item of dedupedByHomeworkId.values()) {
        const { homework, bookProgressSummary: summary } = item;
        if (!summary) continue;

        const bookId = (typeof summary.bookId === 'string' && summary.bookId.trim()
            ? summary.bookId.trim()
            : null)
            ?? (typeof homework.materialId === 'string' && homework.materialId.trim()
                ? homework.materialId.trim()
                : null);
        const homeworkTitle = homework.title || homework.materialTitle || 'Book Homework';

        for (const activity of summary.activities) {
            if (activity.submitted !== true) continue;
            const submittedAt = activity.submittedAt > 0
                ? activity.submittedAt
                : summary.latestSubmittedAt;
            if (!matchesDateRange(submittedAt, dateRange, now)) continue;

            const order = activity.order > 0 ? activity.order : 0;
            const activityLabel = order > 0 ? `Activity ${order}` : 'Book Activity';

            rows.push({
                homeworkId: homework.id,
                homeworkTitle,
                bookId,
                activityId: activity.activityId,
                activityLabel,
                order,
                gradingState: activity.gradingState,
                statusLabel: formatActivityStatusLabel(activity.gradingState),
                scoreLabel: formatActivityScoreLabel(activity),
                submittedAt,
                resultHandle: safeResultHandle(bookId, normalizedStudentId, activity.activityId, homework.id),
            });
        }
    }

    rows.sort((left, right) => (
        right.submittedAt - left.submittedAt
        || left.homeworkId.localeCompare(right.homeworkId)
        || left.order - right.order
        || left.activityId.localeCompare(right.activityId)
    ));

    return rows;
}

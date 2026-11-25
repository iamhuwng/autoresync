import { describe, expect, it } from 'vitest';
import type { StudentHomeworkItem } from '../hooks/useHomeworkSubmission';
import { bookResultGroupKey } from './book-activity/results/bookResult.types';
import { parseBookResultRouteHandle } from './bookResult.browser';
import type { StudentBookHomeworkSummaryRecord } from './book-homework/studentBookHomeworkSummary.types';
import { deriveAcademicRecordBookResults } from './academicRecordBookResults.service';

const makeHomeworkItem = (overrides: {
    id: string;
    title: string;
    isBook: boolean;
    materialId?: string;
    updatedAt?: number;
    bookProgressSummary?: StudentBookHomeworkSummaryRecord | null;
}): StudentHomeworkItem => ({
    homework: {
        schemaVersion: 1,
        id: overrides.id,
        title: overrides.title,
        createdBy: 'teacher-1',
        materialId: overrides.materialId ?? (overrides.isBook ? 'book-material-fallback' : 'quiz-1'),
        materialTitle: overrides.title,
        materialSkill: 'mixed',
        materialType: overrides.isBook ? 'book' : 'quiz',
        createdAt: overrides.updatedAt ?? 1_700_000_000_000,
        updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
        scheduling: { dueDate: 1_700_086_400_000 },
        config: {
            timerMinutes: null,
            maxAttempts: null,
            feedbackTiming: overrides.isBook ? 'never' : 'after_completion',
            lateSubmissionAllowed: false,
        },
        visibility: {
            showTimer: false,
            showAttempts: false,
            showDueDate: true,
            showQuestionCount: false,
            showDuration: false,
        },
        archived: false,
        tags: [],
        target: { type: 'students', studentIds: ['student-1'] },
        ...(overrides.isBook ? {
            assignmentKind: 'book_homework_compatibility' as const,
            bookHomeworkCompatibility: {
                schemaVersion: 1 as const,
                assignmentId: overrides.id,
                sourceSagaRevision: 1,
                sourceFingerprint: 'fp-1',
            },
        } : {
            status: 'active',
        }),
    } as StudentHomeworkItem['homework'],
    latestSubmission: null,
    bestSubmission: null,
    attemptsUsed: overrides.bookProgressSummary?.submittedCount ?? 0,
    attemptsRemaining: null,
    isOverdue: false,
    canSubmit: false,
    canViewFeedback: (overrides.bookProgressSummary?.submittedCount ?? 0) > 0,
    status: 'not_started',
    bookProgressSummary: overrides.bookProgressSummary ?? null,
});

const makeSummary = (
    homeworkId: string,
    activities: StudentBookHomeworkSummaryRecord['activities'],
    overrides: Partial<StudentBookHomeworkSummaryRecord> = {},
): StudentBookHomeworkSummaryRecord => ({
    schemaVersion: 1,
    studentId: 'student-1',
    homeworkId,
    bookId: 'book-authority-1',
    status: 'in_progress',
    isComplete: false,
    submittedCount: activities.filter((entry) => entry.submitted).length,
    requiredCount: activities.length,
    scoredCount: activities.filter((entry) => entry.gradingState === 'scored').length,
    pendingReviewCount: activities.filter((entry) => entry.gradingState === 'review_required').length,
    latestSubmittedAt: Math.max(0, ...activities.map((entry) => entry.submittedAt)),
    updatedAt: 1_700_000_000_000,
    activities,
    ...overrides,
});

describe('deriveAcademicRecordBookResults', () => {
    it('filters by 3m, ytd, and all using activity.submittedAt (never homework.updatedAt) and formats clean labels', () => {
        const now = Date.UTC(2026, 10, 25); // Nov 25, 2026
        const recentSubmittedAt = Date.UTC(2026, 10, 20); // 5d ago -> in 3m, ytd, all
        const ytdOnlySubmittedAt = Date.UTC(2026, 3, 15); // Apr 15, 2026 -> >90d ago, in ytd & all
        const priorYearSubmittedAt = Date.UTC(2025, 5, 10); // Jun 10, 2025 -> only in all

        // Deliberately set misleading homework.updatedAt values to prove homework.updatedAt is ignored:
        // - recent homework has very old homework.updatedAt (2020)
        // - old homework has very recent homework.updatedAt (today)
        const staleHomeworkUpdatedAt = Date.UTC(2020, 0, 1);
        const freshHomeworkUpdatedAt = now;

        const items: StudentHomeworkItem[] = [
            makeHomeworkItem({
                id: 'legacy-1',
                title: 'Legacy Quiz',
                isBook: false,
                updatedAt: freshHomeworkUpdatedAt,
            }),
            makeHomeworkItem({
                id: 'book-missing-summary',
                title: 'No Summary Yet',
                isBook: true,
                updatedAt: freshHomeworkUpdatedAt,
                bookProgressSummary: null,
            }),
            makeHomeworkItem({
                id: 'book-hw-1',
                title: 'Unit 1 Reader',
                isBook: true,
                updatedAt: staleHomeworkUpdatedAt,
                bookProgressSummary: makeSummary('book-hw-1', [
                    {
                        activityId: 'raw-internal-act-1',
                        order: 1,
                        submitted: true,
                        submittedAt: recentSubmittedAt,
                        gradingState: 'scored',
                        score: { earnedScore: 9, maximumScore: 10, displayScore: '9/10' },
                    },
                    {
                        activityId: 'raw-internal-act-2',
                        order: 2,
                        submitted: true,
                        submittedAt: recentSubmittedAt,
                        gradingState: 'review_required',
                    },
                    {
                        activityId: 'raw-internal-act-manual-ungraded',
                        order: 0,
                        submitted: true,
                        submittedAt: ytdOnlySubmittedAt,
                        gradingState: 'ungraded',
                    },
                    {
                        activityId: 'raw-internal-act-unsubmitted',
                        order: 4,
                        submitted: false,
                        submittedAt: 0,
                        gradingState: 'ungraded',
                    },
                ]),
            }),
            // Duplicate homework entry should be deduplicated by homework.id
            makeHomeworkItem({
                id: 'book-hw-1',
                title: 'Duplicate Unit 1 Reader',
                isBook: true,
                updatedAt: freshHomeworkUpdatedAt,
                bookProgressSummary: makeSummary('book-hw-1', []),
            }),
            makeHomeworkItem({
                id: 'book-hw-prior-year',
                title: 'Archive Workbook',
                isBook: true,
                materialId: 'fallback-material-book',
                updatedAt: freshHomeworkUpdatedAt,
                bookProgressSummary: makeSummary(
                    'book-hw-prior-year',
                    [
                        {
                            activityId: 'act-archive-1',
                            order: 3,
                            submitted: true,
                            submittedAt: priorYearSubmittedAt,
                            gradingState: 'scored',
                            score: { earnedScore: 7, maximumScore: 10 },
                        },
                        {
                            activityId: 'act-zero-timestamp',
                            order: 4,
                            submitted: true,
                            submittedAt: 0,
                            gradingState: 'ungraded',
                        },
                    ],
                    {
                        bookId: null,
                        latestSubmittedAt: 0,
                    },
                ),
            }),
        ];

        const rows3m = deriveAcademicRecordBookResults({
            studentId: 'student-1',
            homeworkItems: items,
            dateRange: '3m',
            now,
        });

        expect(rows3m).toHaveLength(2);
        expect(rows3m[0]).toMatchObject({
            homeworkId: 'book-hw-1',
            homeworkTitle: 'Unit 1 Reader',
            bookId: 'book-authority-1',
            activityId: 'raw-internal-act-1',
            activityLabel: 'Activity 1',
            order: 1,
            gradingState: 'scored',
            statusLabel: 'Scored',
            scoreLabel: '9/10',
            submittedAt: recentSubmittedAt,
        });
        expect(rows3m[0]!.activityLabel).not.toContain('raw-internal-act-1');
        expect(parseBookResultRouteHandle(rows3m[0]!.resultHandle)).toEqual({
            bookId: 'book-authority-1',
            studentId: 'student-1',
            groupKey: bookResultGroupKey('student-1', 'raw-internal-act-1'),
            homeworkId: 'book-hw-1',
        });

        expect(rows3m[1]).toMatchObject({
            homeworkId: 'book-hw-1',
            activityId: 'raw-internal-act-2',
            activityLabel: 'Activity 2',
            order: 2,
            gradingState: 'review_required',
            statusLabel: 'Pending review',
            scoreLabel: null,
            submittedAt: recentSubmittedAt,
        });

        const rowsYtd = deriveAcademicRecordBookResults({
            studentId: 'student-1',
            homeworkItems: items,
            dateRange: 'ytd',
            now,
        });
        expect(rowsYtd.map((row) => row.activityId)).toEqual([
            'raw-internal-act-1',
            'raw-internal-act-2',
            'raw-internal-act-manual-ungraded',
        ]);
        expect(rowsYtd[2]).toMatchObject({
            activityId: 'raw-internal-act-manual-ungraded',
            activityLabel: 'Book Activity',
            gradingState: 'ungraded',
            statusLabel: 'Submitted',
            scoreLabel: null,
            submittedAt: ytdOnlySubmittedAt,
        });

        const rowsAll = deriveAcademicRecordBookResults({
            studentId: 'student-1',
            homeworkItems: items,
            dateRange: 'all',
            now,
        });
        expect(rowsAll.map((row) => row.activityId)).toEqual([
            'raw-internal-act-1',
            'raw-internal-act-2',
            'raw-internal-act-manual-ungraded',
            'act-archive-1',
            'act-zero-timestamp',
        ]);
        expect(rowsAll[3]).toMatchObject({
            homeworkId: 'book-hw-prior-year',
            bookId: 'fallback-material-book',
            activityLabel: 'Activity 3',
            scoreLabel: '7/10',
            submittedAt: priorYearSubmittedAt,
        });
        expect(parseBookResultRouteHandle(rowsAll[3]!.resultHandle)).toEqual({
            bookId: 'fallback-material-book',
            studentId: 'student-1',
            groupKey: bookResultGroupKey('student-1', 'act-archive-1'),
            homeworkId: 'book-hw-prior-year',
        });
    });

    it('falls back to summary.latestSubmittedAt when activity.submittedAt is 0, sorts deterministically, and handles empty studentId', () => {
        const now = Date.UTC(2026, 10, 25);
        const fallbackAt = Date.UTC(2026, 10, 10);

        const items: StudentHomeworkItem[] = [
            makeHomeworkItem({
                id: 'book-hw-b',
                title: 'Workbook B',
                isBook: true,
                bookProgressSummary: makeSummary(
                    'book-hw-b',
                    [
                        {
                            activityId: 'act-b',
                            order: 2,
                            submitted: true,
                            submittedAt: 0,
                            gradingState: 'ungraded',
                        },
                        {
                            activityId: 'act-a',
                            order: 2,
                            submitted: true,
                            submittedAt: 0,
                            gradingState: 'ungraded',
                        },
                    ],
                    { latestSubmittedAt: fallbackAt },
                ),
            }),
            makeHomeworkItem({
                id: 'book-hw-a',
                title: 'Workbook A',
                isBook: true,
                bookProgressSummary: makeSummary(
                    'book-hw-a',
                    [
                        {
                            activityId: 'act-1',
                            order: 1,
                            submitted: true,
                            submittedAt: fallbackAt,
                            gradingState: 'scored',
                            score: { earnedScore: 10, maximumScore: 10 },
                        },
                    ],
                    { latestSubmittedAt: fallbackAt },
                ),
            }),
        ];

        expect(deriveAcademicRecordBookResults({
            studentId: '',
            homeworkItems: items,
            dateRange: 'all',
            now,
        })).toEqual([]);

        const sorted = deriveAcademicRecordBookResults({
            studentId: 'student-1',
            homeworkItems: items,
            dateRange: 'quarter',
            now,
        });

        expect(sorted.map((row) => `${row.homeworkId}:${row.activityId}`)).toEqual([
            'book-hw-a:act-1',
            'book-hw-b:act-a',
            'book-hw-b:act-b',
        ]);
        expect(sorted[1]!.submittedAt).toBe(fallbackAt);
    });
});

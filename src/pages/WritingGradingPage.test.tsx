import React, { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingGradingPage from './WritingGradingPage';

const {
    trackActionMock,
    navigateToMock,
    logoutMock,
    storageGetMock,
    storageSetMock,
    storageRemoveMock,
    getWritingSubmissionForGradingMock,
    saveGradingDraftMock,
    publishGradingMock,
    discardPrivateDraftMock,
    acquireWritingGradingLockMock,
    getWritingGradingLockMock,
    releaseWritingGradingLockMock,
    renewWritingGradingLockMock,
    getTeacherQuickCommentPresetsMock,
    addTeacherQuickCommentPresetMock,
    deleteTeacherQuickCommentPresetMock,
    getOrCreateWritingSuggestionCacheMock,
    updateWritingSuggestionReviewStatusMock,
} = vi.hoisted(() => ({
    trackActionMock: vi.fn(),
    navigateToMock: vi.fn(),
    logoutMock: vi.fn(),
    storageGetMock: vi.fn(),
    storageSetMock: vi.fn(),
    storageRemoveMock: vi.fn(),
    getWritingSubmissionForGradingMock: vi.fn(),
    saveGradingDraftMock: vi.fn(),
    publishGradingMock: vi.fn(),
    discardPrivateDraftMock: vi.fn(),
    acquireWritingGradingLockMock: vi.fn(),
    getWritingGradingLockMock: vi.fn(),
    releaseWritingGradingLockMock: vi.fn(),
    renewWritingGradingLockMock: vi.fn(),
    getTeacherQuickCommentPresetsMock: vi.fn(),
    addTeacherQuickCommentPresetMock: vi.fn(),
    deleteTeacherQuickCommentPresetMock: vi.fn(),
    getOrCreateWritingSuggestionCacheMock: vi.fn(),
    updateWritingSuggestionReviewStatusMock: vi.fn(),
}));

vi.mock('./WritingGradingPage.css', () => ({}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

    return {
        ...actual,
        useParams: () => ({ submissionId: 'submission-1' }),
    };
});

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'teacher-1',
            displayName: 'Teacher One',
            email: 'teacher@test.com',
        },
        profile: {
            displayName: 'Teacher One',
        },
        logout: logoutMock,
    }),
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: navigateToMock,
    }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({
        trackAction: trackActionMock,
    }),
}));

vi.mock('../core/platform', () => ({
    storage: {
        get: storageGetMock,
        set: storageSetMock,
        remove: storageRemoveMock,
    },
}));

vi.mock('../components/navigation', () => ({
    TeacherHeader: () => <div>Teacher Header</div>,
}));

vi.mock('../components/ai/AIMaintenanceBanner', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('../services/writingSubmissionService', () => ({
    getWritingSubmissionForGrading: getWritingSubmissionForGradingMock,
    saveGradingDraft: saveGradingDraftMock,
    publishGrading: publishGradingMock,
    discardPrivateDraft: discardPrivateDraftMock,
}));

vi.mock('../services/writingGradingLockService', () => ({
    WRITING_GRADING_LOCK_HEARTBEAT_MS: 10000,
    acquireWritingGradingLock: acquireWritingGradingLockMock,
    getWritingGradingLock: getWritingGradingLockMock,
    releaseWritingGradingLock: releaseWritingGradingLockMock,
    renewWritingGradingLock: renewWritingGradingLockMock,
}));

vi.mock('../services/writingQuickCommentPresetService', () => ({
    DEFAULT_QUICK_COMMENT_PRESETS: [],
    addTeacherQuickCommentPreset: addTeacherQuickCommentPresetMock,
    deleteTeacherQuickCommentPreset: deleteTeacherQuickCommentPresetMock,
    getTeacherQuickCommentPresets: getTeacherQuickCommentPresetsMock,
}));

vi.mock('../services/writingSuggestionService', () => ({
    getOrCreateWritingSuggestionCache: getOrCreateWritingSuggestionCacheMock,
    updateWritingSuggestionReviewStatus: updateWritingSuggestionReviewStatusMock,
}));

vi.mock('../components/writing-grading/EssayEditor', () => {
    const MockEssayEditor = forwardRef((_props: unknown, ref) => {
        useImperativeHandle(ref, () => ({
            undo: vi.fn(),
            redo: vi.fn(),
            canUndo: false,
            canRedo: false,
        }));

        return <div data-testid="essay-editor">Essay Editor</div>;
    });

    return {
        __esModule: true,
        default: MockEssayEditor,
    };
});

vi.mock('../components/writing-grading/CommentSidebar', () => ({
    __esModule: true,
    default: () => <div>Comment Sidebar</div>,
}));

vi.mock('../components/writing-grading/QuickCommentsDialog', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('../components/writing-grading/CorrectionPopup', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('../components/writing-grading/CriteriaScoringPanel', () => ({
    __esModule: true,
    default: () => <div>Criteria Panel</div>,
}));

vi.mock('../components/writing-grading/TabbedFeedbackEditor', () => ({
    __esModule: true,
    default: () => <div>Feedback Editor</div>,
}));

vi.mock('../components/writing-grading/VoidTaskButton', () => ({
    __esModule: true,
    default: () => <button type="button">Void Task</button>,
}));

vi.mock('../components/writing-grading/GradingAuditTrail', () => ({
    __esModule: true,
    default: () => <div>Audit Trail</div>,
}));

vi.mock('../components/writing-grading/WritingSuggestionsReviewModal', () => ({
    __esModule: true,
    default: () => null,
}));

vi.mock('../components/writing-grading/WritingSuggestionsPanel', () => ({
    __esModule: true,
    default: ({
        approvalBlockedReason,
    }: {
        approvalBlockedReason?: string | null;
    }) => <div>{approvalBlockedReason || 'Suggestions Ready'}</div>,
}));

function createTaskState(taskNumber: 1 | 2, overrides: Record<string, unknown> = {}) {
    return {
        taskNumber,
        markedContent: null,
        comments: [],
        isVoided: false,
        criteriaScores: taskNumber === 1
            ? { TA: 6, CC: 6, LR: 6, GRA: 6 }
            : { TR: 7, CC: 7, LR: 7, GRA: 7 },
        taskBand: taskNumber === 1 ? 6 : 7,
        taskSummary: '<p>Task summary</p>',
        perCriteriaFeedback: taskNumber === 1
            ? { TA: '', CC: '', LR: '', GRA: '' }
            : { TR: '', CC: '', LR: '', GRA: '' },
        ...overrides,
    };
}

function createSubmissionForGrading(options: {
    task1?: Record<string, unknown>;
    task2?: Record<string, unknown>;
    pendingCommentDrafts?: Record<string, unknown>;
}) {
    return {
        success: true,
        data: {
            submission: {
                id: 'submission-1',
                studentId: 'student-1',
                studentName: 'Student One',
                context: { type: 'solo-practice' },
                testMeta: {
                    testId: 'test-1',
                    testTitle: 'IELTS Writing',
                    format: 'full-test',
                    duration: 60,
                },
                tasks: [
                    {
                        taskNumber: 1,
                        taskType: 'report',
                        promptText: 'Task 1 prompt',
                        wordMinimum: 150,
                        essayText: 'Task 1 essay',
                        wordCount: 180,
                        activeTimeSeconds: 900,
                    },
                    {
                        taskNumber: 2,
                        taskType: 'essay',
                        promptText: 'Task 2 prompt',
                        wordMinimum: 250,
                        essayText: 'Task 2 essay',
                        wordCount: 260,
                        activeTimeSeconds: 1500,
                    },
                ],
                submittedAt: 100,
                totalElapsedTimeSeconds: 2400,
                pasteAttemptCount: 0,
                markingStatus: 'pending-review',
                publishedGrading: null,
                gradingDraftMeta: null,
                grading: null,
                annotations: [],
                auditTrail: [],
            },
            publishedGrading: null,
            gradingDraft: {
                submissionId: 'submission-1',
                version: 1,
                ownerTeacherId: 'teacher-1',
                ownerTeacherName: 'Teacher One',
                basedOnPublishedVersion: 0,
                createdAt: 100,
                updatedAt: 200,
                overallSummary: '',
                perTask: {
                    1: createTaskState(1, options.task1),
                    2: createTaskState(2, options.task2),
                },
                pendingCommentDrafts: options.pendingCommentDrafts ?? {},
            },
        },
    };
}

async function openEditingMode() {
    render(<WritingGradingPage />);

    await waitFor(() => {
        expect(getWritingSubmissionForGradingMock).toHaveBeenCalled();
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Start Grading' }));

    await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Submit Grading' })).toBeInTheDocument();
    });
}

describe('WritingGradingPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storageGetMock.mockResolvedValue(null);
        storageSetMock.mockResolvedValue(undefined);
        storageRemoveMock.mockResolvedValue(undefined);
        getTeacherQuickCommentPresetsMock.mockResolvedValue([]);
        getOrCreateWritingSuggestionCacheMock.mockResolvedValue({
            success: true,
            data: {
                submissionId: 'submission-1',
                status: 'ready',
                updatedAt: 100,
                perTask: {},
                generatedFromEssayHashByTask: {},
                reviewStateByTask: {},
                runStateByTask: {},
            },
        });
        updateWritingSuggestionReviewStatusMock.mockResolvedValue({
            success: true,
            data: {
                submissionId: 'submission-1',
                status: 'ready',
                updatedAt: 100,
                perTask: {},
                generatedFromEssayHashByTask: {},
                reviewStateByTask: {},
                runStateByTask: {},
            },
        });
        acquireWritingGradingLockMock.mockImplementation(async ({
            submissionId,
            teacherId,
            teacherName,
            sessionId,
        }: {
            submissionId: string;
            teacherId: string;
            teacherName: string;
            sessionId: string;
        }) => ({
            success: true,
            lock: {
                submissionId,
                teacherId,
                teacherName,
                sessionId,
                heartbeatAt: Date.now(),
                expiresAt: Date.now() + 60000,
            },
        }));
        getWritingGradingLockMock.mockResolvedValue(null);
        releaseWritingGradingLockMock.mockResolvedValue(undefined);
        renewWritingGradingLockMock.mockImplementation(async ({
            submissionId,
            teacherId,
            teacherName,
            sessionId,
        }: {
            submissionId: string;
            teacherId: string;
            teacherName: string;
            sessionId: string;
        }) => ({
            success: true,
            lock: {
                submissionId,
                teacherId,
                teacherName,
                sessionId,
                heartbeatAt: Date.now(),
                expiresAt: Date.now() + 60000,
            },
        }));
        saveGradingDraftMock.mockResolvedValue({ success: true, data: { version: 2, basedOnPublishedVersion: 0, updatedAt: 300 } });
        publishGradingMock.mockResolvedValue({ success: true, data: { auditVersion: 1 } });
        discardPrivateDraftMock.mockResolvedValue({ success: true });
    });

    it('treats whitespace-only task summaries as not ready and disables publishing', async () => {
        getWritingSubmissionForGradingMock.mockResolvedValue(createSubmissionForGrading({
            task1: { taskSummary: '<p>&nbsp;</p>' },
        }));

        await openEditingMode();

        expect(screen.getByText('Summary Required').closest('.wgp-readiness-item')?.querySelector('.wgp-readiness-indicator.not-ready')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Submit Grading' })).toBeDisabled();
        expect(screen.getByText('1/2 tasks ready')).toBeInTheDocument();
    });

    it('shows submission readiness separately from the active task card', async () => {
        getWritingSubmissionForGradingMock.mockResolvedValue(createSubmissionForGrading({
            task1: { taskSummary: '<p>Ready summary</p>' },
            task2: { taskSummary: '<p>&nbsp;</p>' },
        }));

        await openEditingMode();

        expect(screen.getByText('Scores Set').closest('.wgp-readiness-item')?.querySelector('.wgp-readiness-indicator.ready')).toBeTruthy();
        expect(screen.getByText('Ready to Submit')).toBeInTheDocument();
        expect(screen.getByText('1/2 tasks ready')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Submit Grading' })).toBeDisabled();
    });

    it('blocks publishing and suggestion approval while a pending comment draft is open', async () => {
        getWritingSubmissionForGradingMock.mockResolvedValue(createSubmissionForGrading({
            pendingCommentDrafts: {
                1: {
                    commentId: 'pending-comment-1',
                    taskNumber: 1,
                    anchorText: 'Task 1',
                    from: 0,
                    to: 4,
                    categoryId: 'cc',
                    html: '<p>Pending draft</p>',
                },
            },
        }));

        await openEditingMode();

        expect(screen.getByText('Comment Draft Clear').closest('.wgp-readiness-item')?.querySelector('.wgp-readiness-indicator.not-ready')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Submit Grading' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Suggestions' }));

        expect(await screen.findByText('Finish or cancel the open comment before approving another suggestion.')).toBeInTheDocument();
    });
});

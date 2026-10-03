import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingPracticeView from './WritingPracticeView';
import { buildWritingProgressStorageKey, writePendingWritingSubmission } from '../../services/writingProgress.service';

const {
    mockNavigate,
    mockCreateSubmission,
    mockReadCommittedWritingSubmission,
    mockNotifyCommittedEvent,
    mockMaterializeSubmissionResult,
    mockSubmitHomework,
    mockGetHomeworkSubmissionById,
    mockCreateTrustedNotification,
    mockPush,
    mockGetStudentClasses,
    mockGetClass,
    mockGetHomeworkById,
    mockGetUserById,
    mockUseActiveTimeTracking,
    mockUseExternalPastePrevention,
    mockSetPasteAttemptCount,
    mockAttachToTextarea,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockCreateSubmission: vi.fn(),
    mockReadCommittedWritingSubmission: vi.fn(),
    mockNotifyCommittedEvent: vi.fn(() => Promise.resolve({ status: 'written' })),
    mockMaterializeSubmissionResult: vi.fn(),
    mockSubmitHomework: vi.fn(),
    mockGetHomeworkSubmissionById: vi.fn(),
    mockCreateTrustedNotification: vi.fn(() => Promise.resolve({ success: true })),
    mockPush: vi.fn(() => ({ key: 'result-1' })),
    mockGetStudentClasses: vi.fn(),
    mockGetClass: vi.fn(),
    mockGetHomeworkById: vi.fn(),
    mockGetUserById: vi.fn(),
    mockUseActiveTimeTracking: vi.fn(),
    mockUseExternalPastePrevention: vi.fn(),
    mockSetPasteAttemptCount: vi.fn(),
    mockAttachToTextarea: vi.fn(() => vi.fn()),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('../modern/ToastNotification', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-1',
            displayName: 'Student One',
            email: 'student@example.com',
        },
    }),
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn((_: unknown, path?: string) => path ?? '__root__'),
    push: mockPush,
}));

vi.mock('../../services/firebase', () => ({
    database: {},
}));

vi.mock('../../services/writingSubmissionService', () => ({
    createSubmission: (...args: unknown[]) => mockCreateSubmission(...args),
    materializeSubmissionResult: (...args: unknown[]) => mockMaterializeSubmissionResult(...args),
    readCommittedWritingSubmission: (...args: unknown[]) => mockReadCommittedWritingSubmission(...args),
}));

vi.mock('../../services/homeworkSubmissionService', () => ({
    submitHomework: (...args: unknown[]) => mockSubmitHomework(...args),
    getSubmissionById: (...args: unknown[]) => mockGetHomeworkSubmissionById(...args),
}));

vi.mock('../../services/notificationProducerClient', () => ({
    createTrustedNotification: (...args: unknown[]) => mockCreateTrustedNotification(...args),
    notifyCommittedEvent: (...args: unknown[]) => mockNotifyCommittedEvent(...args),
}));

vi.mock('../../services/classManager', () => ({
    getStudentClasses: (...args: unknown[]) => mockGetStudentClasses(...args),
    getClass: (...args: unknown[]) => mockGetClass(...args),
}));

vi.mock('../../services/homeworkManager', () => ({
    getHomeworkById: (...args: unknown[]) => mockGetHomeworkById(...args),
}));

vi.mock('../../services/userService', () => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

vi.mock('../../hooks/useActiveTimeTracking', () => ({
    useActiveTimeTracking: (...args: unknown[]) => mockUseActiveTimeTracking(...args),
}));

vi.mock('../../hooks/useExternalPastePrevention', () => ({
    useExternalPastePrevention: (...args: unknown[]) => mockUseExternalPastePrevention(...args),
}));

vi.mock('../writing-student/WritingPromptPanel', () => ({
    default: () => <div data-testid="writing-prompt-panel" />,
}));

vi.mock('../writing-student/WritingEditor', () => ({
    default: ({ value, onChange }: { value: string; onChange: (text: string) => void }) => (
        <textarea
            data-testid="writing-editor"
            value={value}
            onChange={(event) => onChange(event.target.value)}
        />
    ),
}));

vi.mock('./SubmitToTeacherModal', () => ({
    default: ({
        isOpen,
        onSubmit,
    }: {
        isOpen: boolean;
        onSubmit: (data: { teacherId: string | null; note: string }) => void;
    }) => isOpen ? (
        <button type="button" onClick={() => onSubmit({ teacherId: 'teacher-1', note: '' })}>
            confirm-submit
        </button>
    ) : null,
}));

describe('WritingPracticeView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        vi.stubGlobal('alert', vi.fn());
        window.localStorage.clear();

        mockGetStudentClasses.mockResolvedValue([]);
        mockGetClass.mockResolvedValue(null);
        mockGetHomeworkById.mockResolvedValue(null);
        mockGetUserById.mockResolvedValue(null);
        mockCreateSubmission.mockResolvedValue({ success: true });
        mockReadCommittedWritingSubmission.mockImplementation(async (submission: any) => submission);
        mockMaterializeSubmissionResult.mockResolvedValue({ success: true, sharingStatus: 'shared' });
        mockNotifyCommittedEvent.mockResolvedValue({ status: 'written' });
        mockSubmitHomework.mockResolvedValue(undefined);
        mockGetHomeworkSubmissionById.mockImplementation(async (id: string) => {
            const source = mockCreateSubmission.mock.calls.at(-1)?.[0];
            return { id, homeworkId: source?.context.homeworkId, studentId: 'student-1', status: 'in_progress' };
        });
        mockUseExternalPastePrevention.mockReturnValue({
            pasteAttemptCount: 2,
            setPasteAttemptCount: mockSetPasteAttemptCount,
            attachToTextarea: mockAttachToTextarea,
        });
        mockUseActiveTimeTracking.mockReturnValue({
            getActiveTime: vi.fn(() => 120),
            switchTask: vi.fn(),
            onKeystroke: vi.fn(),
        });
    });

    it('keeps solo practice paste prevention enabled and submits the shared paste count', async () => {
        render(
            <WritingPracticeView
                materialId="material-1"
                testData={{
                    id: 'test-1',
                    metadata: {
                        title: 'IELTS Writing',
                        format: 'task1-only',
                        duration: 60,
                    },
                    tasks: [
                        {
                            taskNumber: 1,
                            taskType: 'task-1',
                            promptText: 'Write about the chart',
                            promptImageUrl: null,
                            wordMinimum: 150,
                        },
                    ],
                } as any}
            />,
        );

        expect(mockUseExternalPastePrevention).toHaveBeenLastCalledWith({
            enabled: true,
            initialPasteAttemptCount: 0,
        });

        fireEvent.change(screen.getByTestId('writing-editor'), {
            target: {
                value: 'This is the first essay draft.',
            },
        });

        await waitFor(() => expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-submit' }));

        await waitFor(() => {
            expect(mockCreateSubmission).toHaveBeenCalledTimes(1);
            expect(mockMaterializeSubmissionResult).toHaveBeenCalledTimes(1);
        });

        const submission = mockCreateSubmission.mock.calls[0]?.[0];
        expect(submission).toEqual(expect.objectContaining({
            id: 'result-1',
            studentId: 'student-1',
            pasteAttemptCount: 2,
            context: expect.objectContaining({
                type: 'solo-practice',
            }),
            tasks: expect.arrayContaining([
                expect.objectContaining({
                    essayText: 'This is the first essay draft.',
                }),
            ]),
        }));
        expect(mockMaterializeSubmissionResult).toHaveBeenCalledWith(submission);
        expect(mockCreateSubmission.mock.invocationCallOrder[0]).toBeLessThan(
            mockMaterializeSubmissionResult.mock.invocationCallOrder[0]!,
        );
        expect(mockNotifyCommittedEvent).toHaveBeenNthCalledWith(1, {
            eventKind: 'writing-submitted', submissionId: 'result-1', audience: 'student', occurredAt: submission.submittedAt,
        });
        expect(mockNotifyCommittedEvent).toHaveBeenNthCalledWith(2, {
            eventKind: 'writing-submitted', submissionId: 'result-1', audience: 'teacher', occurredAt: submission.submittedAt,
        });
        expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true });
    });


    it.each(['solo', 'homework', 'homework-committed', 'homework-conflict'])('reuses the frozen %s attempt after an uncertain save and reload', async (mode) => {
        const isHomework = mode !== 'solo';
        const props = { materialId: 'solo-recovery', testData: { id: 'solo-test',
            metadata: { title: 'Writing', format: 'task1-only', duration: 60 },
            tasks: [{ taskNumber: 1, taskType: 'task-1', promptText: 'Write', wordMinimum: 150 }] } as any,
            ...(isHomework ? { homeworkContext: { homeworkId: 'homework-recovery', submissionId: 'attempt-recovery', teacherId: 'teacher-1' } } : {}) };
        mockCreateSubmission.mockResolvedValueOnce({ success: false, error: 'response lost' });
        mockReadCommittedWritingSubmission.mockImplementation(async (submission: any) =>
            mockCreateSubmission.mock.calls.length ? submission : null);
        const first = render(<WritingPracticeView {...props} />);
        await waitFor(() => expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled());
        fireEvent.change(screen.getByTestId('writing-editor'), { target: { value: 'Frozen essay' } });
        await waitFor(() => expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-submit' }));
        await waitFor(() => expect(mockCreateSubmission).toHaveBeenCalledOnce());
        await screen.findByRole('button', { name: 'Retry submission' });
        const pending = mockCreateSubmission.mock.calls[0][0];
        if (mode === 'homework-committed' || mode === 'homework-conflict') {
            mockGetHomeworkSubmissionById.mockResolvedValue({ id: 'attempt-recovery', homeworkId: 'homework-recovery',
                studentId: 'student-1', status: 'graded', resultId: mode === 'homework-committed' ? pending.id : 'foreign-result' });
        }
        first.unmount();
        mockNotifyCommittedEvent.mockImplementation(() => new Promise(() => {}));
        render(<WritingPracticeView {...props} />);
        const retry = await screen.findByRole('button', { name: 'Retry submission' });
        fireEvent.click(retry);
        if (mode === 'homework-conflict') {
            await waitFor(() => expect(mockGetHomeworkSubmissionById).toHaveBeenCalled());
            await waitFor(() => expect(screen.getByRole('button', { name: 'Retry submission' })).toBeEnabled());
            expect(mockNavigate).not.toHaveBeenCalled();
        } else await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(isHomework ? '/student/homework' : '/student/dashboard', { replace: true }));
        if (mode === 'homework-committed' || mode === 'homework-conflict') expect(mockSubmitHomework).not.toHaveBeenCalled();
        expect(mockCreateSubmission).toHaveBeenCalledOnce();
        expect(mockMaterializeSubmissionResult).toHaveBeenCalledWith(pending);
        expect(mockPush).toHaveBeenCalledOnce();
        expect(mockReadCommittedWritingSubmission).toHaveBeenCalledWith(pending);
    });


    it('blocks Homework submission when frozen recovery belongs to another test', async () => {
        const recoveryWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await writePendingWritingSubmission({ materialId: 'blocked-homework', studentId: 'student-1',
            scopeContext: { mode: 'homework', homeworkId: 'homework-blocked', submissionId: 'attempt-blocked' } }, {
            id: 'frozen-result', studentId: 'student-1', context: { type: 'homework', homeworkId: 'homework-blocked',
                homeworkSubmissionId: 'attempt-blocked' }, testMeta: { testId: 'another-test' }, tasks: [],
        } as any);
        render(<WritingPracticeView materialId="blocked-homework"
            homeworkContext={{ homeworkId: 'homework-blocked', submissionId: 'attempt-blocked', teacherId: 'teacher-1' }}
            testData={{ id: 'correct-test', metadata: { title: 'Writing', format: 'task1-only', duration: 60 },
                tasks: [{ taskNumber: 1, taskType: 'task-1', promptText: 'Write', wordMinimum: 150 }] } as any} />);
        await waitFor(() => expect(recoveryWarning).toHaveBeenCalledWith(
            '[WritingPracticeView] Failed to load saved progress:', expect.any(Error)));
        expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockCreateSubmission).not.toHaveBeenCalled();
        recoveryWarning.mockRestore();
    });

    it('keeps a saved solo result while withholding a teacher notice when sharing is held', async () => {
        mockMaterializeSubmissionResult.mockResolvedValue({ success: true, sharingStatus: 'held' });
        render(<WritingPracticeView materialId="held-solo" testData={{ id: 'held-test',
            metadata: { title: 'Writing', format: 'task1-only', duration: 60 },
            tasks: [{ taskNumber: 1, taskType: 'task-1', promptText: 'Write', wordMinimum: 150 }] } as any} />);
        await waitFor(() => expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-submit' }));
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true }));
        expect(mockNotifyCommittedEvent).toHaveBeenCalledOnce();
        expect(mockNotifyCommittedEvent).toHaveBeenCalledWith(expect.objectContaining({ audience: 'student' }));
        expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
    });

    it('honors homework antiCheatConfig when enabling paste prevention', async () => {
        mockGetHomeworkById.mockResolvedValue({
            antiCheatConfig: {
                detectCopyPaste: true,
            },
        });

        render(
            <WritingPracticeView
                materialId="material-2"
                homeworkContext={{
                    homeworkId: 'homework-1',
                    submissionId: 'homework-submission-1',
                    teacherId: 'teacher-1',
                    dueDate: Date.now() + 60_000,
                    lateSubmissionAllowed: true,
                }}
                testData={{
                    id: 'test-homework-1',
                    metadata: {
                        title: 'Homework IELTS Writing',
                        format: 'task1-only',
                        duration: 45,
                    },
                    tasks: [
                        {
                            taskNumber: 1,
                            taskType: 'task-1',
                            promptText: 'Write about the chart',
                            promptImageUrl: null,
                            wordMinimum: 150,
                        },
                    ],
                } as any}
            />,
        );

        await waitFor(() => {
            expect(mockGetHomeworkById).toHaveBeenCalledWith('homework-1');
        });

        await waitFor(() => {
            expect(mockUseExternalPastePrevention).toHaveBeenLastCalledWith({
                enabled: true,
                initialPasteAttemptCount: 0,
            });
        });
    });

    it('delegates homework-mode submission through createSubmission and materializeSubmissionResult with homework context', async () => {
        mockGetHomeworkById.mockResolvedValue({
            antiCheatConfig: {
                detectCopyPaste: false,
            },
        });

        render(
            <WritingPracticeView
                materialId="material-3"
                homeworkContext={{
                    homeworkId: 'homework-2',
                    submissionId: 'homework-submission-2',
                    teacherId: 'teacher-1',
                    dueDate: Date.now() + 60_000,
                    lateSubmissionAllowed: true,
                }}
                testData={{
                    id: 'test-homework-2',
                    metadata: {
                        title: 'Homework IELTS Writing',
                        format: 'full-test',
                        duration: 45,
                    },
                    tasks: [
                        {
                            taskNumber: 1,
                            taskType: 'task-1',
                            promptText: 'Write about the chart',
                            promptImageUrl: null,
                            wordMinimum: 150,
                        },
                    ],
                } as any}
            />,
        );

        fireEvent.change(screen.getByTestId('writing-editor'), {
            target: {
                value: 'Homework essay draft.',
            },
        });

        await waitFor(() => expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-submit' }));

        await waitFor(() => {
            expect(mockCreateSubmission).toHaveBeenCalledTimes(1);
            expect(mockMaterializeSubmissionResult).toHaveBeenCalledTimes(1);
        });

        const submission = mockCreateSubmission.mock.calls[0]?.[0];
        expect(submission).toEqual(expect.objectContaining({
            id: 'result-1',
            studentId: 'student-1',
            pasteAttemptCount: 2,
            context: expect.objectContaining({
                type: 'homework',
                homeworkId: 'homework-2',
                homeworkSubmissionId: 'homework-submission-2',
                assigningTeacherId: 'teacher-1',
            }),
            tasks: expect.arrayContaining([
                expect.objectContaining({
                    essayText: 'Homework essay draft.',
                }),
            ]),
        }));
        expect(mockMaterializeSubmissionResult).toHaveBeenCalledWith(submission);
        expect(mockNotifyCommittedEvent).toHaveBeenCalledWith({ eventKind: 'result-completed', resultId: 'result-1' });
        expect(mockSubmitHomework).toHaveBeenCalledWith(
            'homework-submission-2',
            'result-1',
            undefined,
            undefined,
            undefined,
            undefined,
            expect.any(Number),
        );
        expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/student/homework', { replace: true });
    });

    it('preserves punctuation spacing exactly when submitting homework writing', async () => {
        render(
            <WritingPracticeView
                materialId="material-spacing"
                homeworkContext={{
                    homeworkId: 'homework-spacing',
                    submissionId: 'homework-submission-spacing',
                    teacherId: 'teacher-1',
                    dueDate: Date.now() + 60_000,
                    lateSubmissionAllowed: true,
                }}
                testData={{
                    id: 'test-homework-spacing',
                    metadata: {
                        title: 'Homework IELTS Writing',
                        format: 'task2-only',
                        duration: 45,
                    },
                    tasks: [
                        {
                            taskNumber: 2,
                            taskType: 'task-2',
                            promptText: 'Discuss both views.',
                            promptImageUrl: null,
                            wordMinimum: 250,
                        },
                    ],
                } as any}
            />,
        );

        const essayText = 'The trend rose. It stabilized, then growth continued.';
        fireEvent.change(screen.getByTestId('writing-editor'), {
            target: { value: essayText },
        });

        await waitFor(() => expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-submit' }));

        await waitFor(() => {
            expect(mockCreateSubmission).toHaveBeenCalledTimes(1);
        });

        expect(mockCreateSubmission.mock.calls[0]?.[0].tasks).toEqual([
            expect.objectContaining({
                taskNumber: 2,
                essayText,
            }),
        ]);
    });

    it('uses homework timer overrides and auto-submits when time runs out', async () => {
        vi.useFakeTimers();
        const startedAt = Date.now();

        render(
            <WritingPracticeView
                materialId="material-4"
                homeworkContext={{
                    homeworkId: 'homework-4',
                    submissionId: 'homework-submission-4',
                    teacherId: 'teacher-1',
                    timerMinutes: 1,
                    maxAttempts: 2,
                    startedAt,
                }}
                testData={{
                    id: 'test-homework-4',
                    metadata: {
                        title: 'Timed Homework IELTS Writing',
                        format: 'task1-only',
                        duration: 45,
                    },
                    tasks: [
                        {
                            taskNumber: 1,
                            taskType: 'task-1',
                            promptText: 'Write about the chart',
                            promptImageUrl: null,
                            wordMinimum: 150,
                        },
                    ],
                } as any}
            />,
        );

        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(screen.getByText(/1:00/)).toBeInTheDocument();

        fireEvent.change(screen.getByTestId('writing-editor'), {
            target: {
                value: 'Timed homework essay draft.',
            },
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });

        expect(mockSubmitHomework).toHaveBeenCalledWith(
            'homework-submission-4',
            'result-1',
            undefined,
            undefined,
            undefined,
            undefined,
            expect.any(Number),
        );
        expect(mockCreateSubmission).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/confirm-submit/i)).not.toBeInTheDocument();
    });

    it('restores saved homework paste attempts on auto-resume', async () => {
        const startedAt = Date.now() - 30_000;
        window.localStorage.setItem(
            buildWritingProgressStorageKey({
                materialId: 'material-5',
                studentId: 'student-1',
                scopeContext: {
                    mode: 'homework',
                    homeworkId: 'homework-5',
                    submissionId: 'homework-submission-5',
                },
            }),
            JSON.stringify({
                essays: { 1: 'Recovered homework essay.', 2: '' },
                activeTask: 1,
                startedAt,
                pasteAttemptCount: 5,
            }),
        );

        render(
            <WritingPracticeView
                materialId="material-5"
                homeworkContext={{
                    homeworkId: 'homework-5',
                    submissionId: 'homework-submission-5',
                    teacherId: 'teacher-1',
                    timerMinutes: 30,
                    maxAttempts: 1,
                    startedAt,
                }}
                testData={{
                    id: 'test-homework-5',
                    metadata: {
                        title: 'Single Attempt Homework',
                        format: 'task1-only',
                        duration: 60,
                    },
                    tasks: [
                        {
                            taskNumber: 1,
                            taskType: 'task-1',
                            promptText: 'Write about the chart',
                            promptImageUrl: null,
                            wordMinimum: 150,
                        },
                    ],
                } as any}
            />,
        );

        await waitFor(() => {
            expect(screen.getByTestId('writing-editor')).toHaveValue('Recovered homework essay.');
        });

        expect(mockSetPasteAttemptCount).toHaveBeenCalledWith(5);
        expect(screen.queryByText(/resume practice/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /start new/i })).not.toBeInTheDocument();
    });

    it('blocks homework launches that are missing attempt identity', async () => {
        render(
            <WritingPracticeView
                materialId="material-6"
                homeworkContext={{
                    homeworkId: '',
                    submissionId: '',
                    teacherId: 'teacher-1',
                }}
                testData={{
                    id: 'test-homework-6',
                    metadata: {
                        title: 'Invalid Homework IELTS Writing',
                        format: 'task1-only',
                        duration: 60,
                    },
                    tasks: [
                        {
                            taskNumber: 1,
                            taskType: 'task-1',
                            promptText: 'Write about the chart',
                            promptImageUrl: null,
                            wordMinimum: 150,
                        },
                    ],
                } as any}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText(/homework unavailable/i)).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: /back to homework/i }));
        expect(mockNavigate).toHaveBeenCalledWith('/student/homework');
    });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingPracticeView from './WritingPracticeView';
import { buildWritingProgressStorageKey } from '../../services/writingProgress.service';

const {
    mockNavigate,
    mockCreateSubmission,
    mockMaterializeSubmissionResult,
    mockSubmitHomework,
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
    mockMaterializeSubmissionResult: vi.fn(),
    mockSubmitHomework: vi.fn(),
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
}));

vi.mock('../../services/homeworkSubmissionService', () => ({
    submitHomework: (...args: unknown[]) => mockSubmitHomework(...args),
}));

vi.mock('../../services/notificationProducerClient', () => ({
    createTrustedNotification: (...args: unknown[]) => mockCreateTrustedNotification(...args),
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
        mockMaterializeSubmissionResult.mockResolvedValue({ success: true });
        mockSubmitHomework.mockResolvedValue(undefined);
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
        expect(mockCreateTrustedNotification).toHaveBeenNthCalledWith(1, {
            producerFamily: 'writing',
            authorityRecordId: 'result-1',
            recipientId: 'student-1',
            operationKey: 'writing-submitted:student:result-1',
            type: 'success',
            title: '✍️ Writing Submitted',
            message: 'Your solo practice essay for "IELTS Writing" has been submitted. A teacher will review it soon.',
            link: '/student/academic-record',
        });
        expect(mockCreateTrustedNotification).toHaveBeenNthCalledWith(2, {
            producerFamily: 'writing',
            authorityRecordId: 'result-1',
            recipientId: 'teacher-1',
            operationKey: 'writing-submitted:teacher:result-1',
            type: 'info',
            title: 'New Writing Submission',
            message: 'Student One submitted a solo practice essay for "IELTS Writing".',
            link: '/teacher/grading/writing/result-1',
        });
        expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true });
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
        expect(mockCreateTrustedNotification).toHaveBeenNthCalledWith(1, expect.objectContaining({
            producerFamily: 'writing',
            authorityRecordId: 'result-1',
            recipientId: 'student-1',
            operationKey: 'writing-submitted:student:result-1',
            message: 'Your homework essay for "Homework IELTS Writing" has been submitted. A teacher will review it soon.',
            link: '/student/academic-record',
        }));
        expect(mockSubmitHomework).toHaveBeenCalledWith(
            'homework-submission-2',
            'result-1',
            undefined,
            undefined,
            undefined,
            undefined,
            expect.any(Number),
        );
        expect(mockCreateTrustedNotification).toHaveBeenNthCalledWith(2, expect.objectContaining({
            producerFamily: 'writing',
            authorityRecordId: 'result-1',
            recipientId: 'teacher-1',
            operationKey: 'writing-submitted:teacher:result-1',
            message: 'Student One submitted a homework essay for "Homework IELTS Writing".',
            link: '/teacher/grading/writing/result-1',
        }));
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingPracticeView from './WritingPracticeView';

const {
    mockNavigate,
    mockCreateSubmission,
    mockMaterializeSubmissionResult,
    mockSubmitHomework,
    mockNotifyTeacherWritingSubmitted,
    mockNotifyWritingSubmitted,
    mockPush,
    mockGetStudentClasses,
    mockGetClass,
    mockGetUserById,
    mockUseActiveTimeTracking,
    mockUseExternalPastePrevention,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockCreateSubmission: vi.fn(),
    mockMaterializeSubmissionResult: vi.fn(),
    mockSubmitHomework: vi.fn(),
    mockNotifyTeacherWritingSubmitted: vi.fn(() => Promise.resolve()),
    mockNotifyWritingSubmitted: vi.fn(() => Promise.resolve()),
    mockPush: vi.fn(() => ({ key: 'result-1' })),
    mockGetStudentClasses: vi.fn(),
    mockGetClass: vi.fn(),
    mockGetUserById: vi.fn(),
    mockUseActiveTimeTracking: vi.fn(),
    mockUseExternalPastePrevention: vi.fn(),
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

vi.mock('../../services/notificationService', () => ({
    notifyTeacherWritingSubmitted: (...args: unknown[]) => mockNotifyTeacherWritingSubmitted(...args),
    notifyWritingSubmitted: (...args: unknown[]) => mockNotifyWritingSubmitted(...args),
}));

vi.mock('../../services/classManager', () => ({
    getStudentClasses: (...args: unknown[]) => mockGetStudentClasses(...args),
    getClass: (...args: unknown[]) => mockGetClass(...args),
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
    default: ({ isOpen, onSubmit }: { isOpen: boolean; onSubmit: (data: { teacherId: string | null; note: string }) => void }) =>
        isOpen ? (
            <button type="button" onClick={() => onSubmit({ teacherId: 'teacher-1', note: '' })}>
                confirm-submit
            </button>
        ) : null,
}));

describe('WritingPracticeView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('alert', vi.fn());

        mockGetStudentClasses.mockResolvedValue([]);
        mockGetClass.mockResolvedValue(null);
        mockGetUserById.mockResolvedValue(null);
        mockCreateSubmission.mockResolvedValue({ success: true });
        mockMaterializeSubmissionResult.mockResolvedValue({ success: true });
        mockSubmitHomework.mockResolvedValue(undefined);
        mockUseExternalPastePrevention.mockReturnValue({
            pasteAttemptCount: 2,
        });
        mockUseActiveTimeTracking.mockReturnValue({
            getActiveTime: vi.fn(() => 120),
            switchTask: vi.fn(),
            onKeystroke: vi.fn(),
        });
    });

    it('delegates submit persistence through the canonical writing service', async () => {
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
        expect(mockNotifyWritingSubmitted).toHaveBeenCalledWith(
            'student-1',
            'result-1',
            'IELTS Writing',
            'solo-practice',
        );
        expect(mockNotifyTeacherWritingSubmitted).toHaveBeenCalledWith(
            'teacher-1',
            'result-1',
            'student-1',
            'Student One',
            'IELTS Writing',
            'solo-practice',
        );
        expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard', { replace: true });
    });

    it('delegates homework-mode submission through createSubmission and materializeSubmissionResult with homework context', async () => {
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
            context: expect.objectContaining({
                type: 'homework',
                homeworkId: 'homework-1',
                homeworkSubmissionId: 'homework-submission-1',
                assigningTeacherId: 'teacher-1',
            }),
            tasks: expect.arrayContaining([
                expect.objectContaining({
                    essayText: 'Homework essay draft.',
                }),
            ]),
        }));
        expect(mockMaterializeSubmissionResult).toHaveBeenCalledWith(submission);
        expect(mockNotifyWritingSubmitted).toHaveBeenCalledWith(
            'student-1',
            'result-1',
            'Homework IELTS Writing',
            'homework',
        );
        expect(mockSubmitHomework).toHaveBeenCalledWith(
            'homework-submission-1',
            'result-1',
            undefined,
            undefined,
            undefined,
            undefined,
            expect.any(Number),
        );
        expect(mockNotifyTeacherWritingSubmitted).toHaveBeenCalledWith(
            'teacher-1',
            'result-1',
            'student-1',
            'Student One',
            'Homework IELTS Writing',
            'homework',
        );
        expect(mockNavigate).toHaveBeenCalledWith('/student/homework', { replace: true });
    });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../../types/homework.types';
import type { IELTSWritingTest } from '../../types/ielts-writing.types';

const {
    mockGetWritingImportContext,
    mockImportExternalWritingSubmission,
    mockListWritingImportHomeworkOptions,
} = vi.hoisted(() => ({
    mockGetWritingImportContext: vi.fn(),
    mockImportExternalWritingSubmission: vi.fn(),
    mockListWritingImportHomeworkOptions: vi.fn(),
}));

vi.mock('../../services/writingExternalSubmissionImport.service', () => ({
    getWritingImportContext: (...args: unknown[]) => mockGetWritingImportContext(...args),
    importExternalWritingSubmission: (...args: unknown[]) => mockImportExternalWritingSubmission(...args),
    listWritingImportHomeworkOptions: (...args: unknown[]) => mockListWritingImportHomeworkOptions(...args),
}));

import ImportWritingSubmissionModal from './ImportWritingSubmissionModal';

const NOW = 1_700_000_000_000;

function buildHomework(): HomeworkAssignment {
    return {
        id: 'homework-1',
        createdBy: 'teacher-1',
        createdAt: NOW - 10_000,
        updatedAt: NOW - 5_000,
        materialId: 'writing-test-1',
        materialTitle: 'Imported Writing Test',
        materialType: 'test',
        materialSkill: 'writing',
        target: {
            type: 'students',
            studentIds: ['student-1'],
            studentNames: ['Student One'],
        },
        scheduling: {
            dueDate: NOW + 86_400_000,
        },
        config: {
            timerMinutes: 60,
            maxAttempts: 2,
            feedbackTiming: 'after_completion',
            lateSubmissionAllowed: true,
        },
        visibility: {
            showTimer: true,
            showAttempts: true,
            showDueDate: true,
            showQuestionCount: true,
            showDuration: true,
        },
        status: 'active',
        stats: {
            totalAssigned: 1,
            started: 0,
            submitted: 0,
            lateSubmissions: 0,
        },
    };
}

function buildMaterial(): IELTSWritingTest {
    return {
        id: 'writing-test-1',
        testType: 'IELTS',
        skill: 'Writing',
        metadata: {
            title: 'Imported Writing Test',
            duration: 60,
            format: 'task2-only',
        },
        tasks: [
            {
                taskNumber: 2,
                taskType: 'opinion',
                promptText: 'Discuss this opinion.',
                wordMinimum: 250,
                recommendedTimeMinutes: 40,
                showModelAnswerToStudent: false,
            },
        ],
        createdBy: 'teacher-1',
        ownerId: 'teacher-1',
        isPublic: false,
        createdAt: NOW - 20_000,
        updatedAt: NOW - 10_000,
    };
}

function renderModal(overrides: Partial<ComponentProps<typeof ImportWritingSubmissionModal>> = {}) {
    const props = {
        isOpen: true,
        teacherId: 'teacher-1',
        onClose: vi.fn(),
        onImported: vi.fn(),
        trackAction: vi.fn(),
        ...overrides,
    };

    const view = render(<ImportWritingSubmissionModal {...props} />);
    return { ...view, props };
}

async function chooseHomeworkAndStudent(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('option', { name: 'Homework A' });
    await user.selectOptions(screen.getByLabelText('Homework'), 'homework-1');
    await screen.findByRole('option', { name: 'Student One' });
    await user.selectOptions(screen.getByLabelText('Student'), 'student-1');
}

function getTextareaByLabelText(labelText: string) {
    const label = screen.getByText(labelText).closest('label');
    const textarea = label?.querySelector('textarea');
    if (!textarea) {
        throw new Error(`Missing textarea for ${labelText}`);
    }
    return textarea;
}

describe('ImportWritingSubmissionModal', () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();

        mockListWritingImportHomeworkOptions.mockResolvedValue({
            success: true,
            data: [
                {
                    homeworkId: 'homework-1',
                    title: 'Homework A',
                    materialId: 'writing-test-1',
                    materialTitle: 'Imported Writing Test',
                    dueDate: NOW + 86_400_000,
                    status: 'active',
                },
            ],
        });
        mockGetWritingImportContext.mockResolvedValue({
            success: true,
            data: {
                homework: buildHomework(),
                material: buildMaterial(),
                students: [
                    {
                        studentId: 'student-1',
                        studentName: 'Student One',
                        source: 'homework-target',
                    },
                ],
            },
        });
        mockImportExternalWritingSubmission.mockResolvedValue({
            success: true,
            data: {
                submissionId: 'shared-submission-id',
                homeworkSubmissionId: 'shared-submission-id',
                resultId: 'shared-submission-id',
                isLate: false,
                attemptNumber: 1,
            },
        });
    });

    it('loads homework/student choices and imports with grade-now intent', async () => {
        const user = userEvent.setup();
        const { props } = renderModal();

        await chooseHomeworkAndStudent(user);
        expect(screen.queryByLabelText('Task 1 response')).toBeNull();

        await user.type(getTextareaByLabelText('Task 2 response'), 'Imported essay text from paper.');
        await user.type(getTextareaByLabelText('Source note'), 'Scanned script');
        await user.click(screen.getByRole('button', { name: 'Import and grade now' }));

        await waitFor(() => {
            expect(mockImportExternalWritingSubmission).toHaveBeenCalledWith(
                expect.objectContaining({
                    homeworkId: 'homework-1',
                    studentId: 'student-1',
                    studentName: 'Student One',
                    importerTeacherId: 'teacher-1',
                    sourceNote: 'Scanned script',
                    taskResponses: [
                        {
                            taskNumber: 2,
                            essayText: 'Imported essay text from paper.',
                        },
                    ],
                })
            );
        });

        expect(props.trackAction).toHaveBeenCalledWith('importSubmissionHomeworkSelect', { homeworkId: 'homework-1' });
        expect(props.trackAction).toHaveBeenCalledWith(
            'importSubmissionGradeNow',
            { submissionId: 'shared-submission-id' }
        );
        expect(props.onImported).toHaveBeenCalledWith(
            expect.objectContaining({ submissionId: 'shared-submission-id' }),
            { gradeNow: true }
        );
    });

    it('shows field validation and tracks failed submit', async () => {
        const user = userEvent.setup();
        const { props } = renderModal();

        await screen.findByRole('option', { name: 'Homework A' });
        await user.click(screen.getByRole('button', { name: 'Import' }));

        expect(screen.getByText('Choose a Writing homework.')).toBeTruthy();
        expect(screen.getByText('Choose an assigned student.')).toBeTruthy();
        expect(props.trackAction).toHaveBeenCalledWith(
            'importSubmissionValidationFailure',
            expect.objectContaining({
                fields: expect.arrayContaining(['homeworkId', 'studentId']),
            })
        );
        expect(mockImportExternalWritingSubmission).not.toHaveBeenCalled();
    });

    it('shows duplicate service failure and tracks duplicate block', async () => {
        const user = userEvent.setup();
        const { props } = renderModal();
        mockImportExternalWritingSubmission.mockResolvedValueOnce({
            success: false,
            code: 'duplicate',
            error: 'This student already has submitted work.',
        });

        await chooseHomeworkAndStudent(user);
        await user.type(getTextareaByLabelText('Task 2 response'), 'Imported essay text from paper.');
        await user.click(screen.getByRole('button', { name: 'Import' }));

        await screen.findByRole('alert');
        expect(screen.getByRole('alert').textContent).toContain('This student already has submitted work.');
        expect(props.trackAction).toHaveBeenCalledWith(
            'importSubmissionDuplicateBlock',
            { homeworkId: 'homework-1', studentId: 'student-1' }
        );
        expect(props.onImported).not.toHaveBeenCalled();
    });

    it('requires explicit confirmation before replacing an in-progress attempt', async () => {
        const user = userEvent.setup();
        const { props } = renderModal();
        mockImportExternalWritingSubmission
            .mockResolvedValueOnce({
                success: false,
                code: 'in-progress',
                error: 'This student has an in-progress attempt.',
            })
            .mockResolvedValueOnce({
                success: true,
                data: {
                    submissionId: 'existing-attempt',
                    homeworkSubmissionId: 'existing-attempt',
                    resultId: 'existing-attempt',
                    isLate: false,
                    attemptNumber: 2,
                },
            });

        await chooseHomeworkAndStudent(user);
        await user.type(getTextareaByLabelText('Task 2 response'), 'Imported essay text from paper.');
        await user.click(screen.getByRole('button', { name: 'Import' }));

        const confirmCheckbox = await screen.findByRole('checkbox', {
            name: /Replace the student's in-progress attempt/,
        });
        expect(mockImportExternalWritingSubmission).toHaveBeenLastCalledWith(
            expect.objectContaining({
                confirmInProgressOverwrite: false,
            })
        );

        await user.click(confirmCheckbox);
        await user.click(screen.getByRole('button', { name: 'Import' }));

        await waitFor(() => {
            expect(mockImportExternalWritingSubmission).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    confirmInProgressOverwrite: true,
                })
            );
        });
        expect(props.trackAction).toHaveBeenCalledWith(
            'importSubmissionValidationFailure',
            expect.objectContaining({ code: 'in-progress' })
        );
        expect(props.onImported).toHaveBeenCalledWith(
            expect.objectContaining({ submissionId: 'existing-attempt' }),
            { gradeNow: false }
        );
    });
});

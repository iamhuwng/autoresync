import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import WritingTestEditModal from './WritingTestEditModal';
import type { WritingTestDraft } from '../../types/ielts-writing.types';

const trackActionMock = vi.fn();
const saveWritingDraftMock = vi.fn();
const publishWritingTestMock = vi.fn();

vi.mock('../../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({
        trackAction: trackActionMock,
    }),
}));

vi.mock('../../services/writingTestService', () => ({
    saveWritingDraft: (...args: unknown[]) => saveWritingDraftMock(...args),
    publishWritingTest: (...args: unknown[]) => publishWritingTestMock(...args),
}));

vi.mock('../../services/r2Storage', () => ({
    default: {
        isTempFile: vi.fn(() => false),
        moveToPermanent: vi.fn(),
    },
}));

const baseDraft: WritingTestDraft = {
    id: 'writing-draft-1',
    userId: 'teacher-1',
    testType: 'IELTS',
    skill: 'Writing',
    isPublic: false,
    status: 'published',
    publishedTestId: 'test-1',
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T01:00:00Z'),
    metadata: {
        title: 'Writing Mock 1',
        description: 'Practice set',
        duration: 60,
        format: 'full-test',
        difficulty: 'advanced',
        targetBand: 7,
        tags: ['academic'],
    },
    tasks: [
        {
            taskNumber: 1,
            taskType: 'line-graph',
            promptText: 'Describe the chart.',
            promptImageUrl: 'https://example.com/chart.png',
            wordMinimum: 150,
            recommendedTimeMinutes: 20,
            modelAnswer: 'Task 1 model answer',
            showModelAnswerToStudent: false,
        },
        {
            taskNumber: 2,
            taskType: 'opinion',
            promptText: 'Discuss both views and give your opinion.',
            wordMinimum: 250,
            recommendedTimeMinutes: 40,
            modelAnswer: 'Task 2 model answer',
            showModelAnswerToStudent: false,
        },
    ],
};

function renderModal(props: Partial<Parameters<typeof WritingTestEditModal>[0]> = {}) {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const onPublished = vi.fn();

    render(
        <MantineProvider>
            <WritingTestEditModal
                draft={baseDraft}
                isOpen={true}
                onClose={onClose}
                onSaved={onSaved}
                onPublished={onPublished}
                {...props}
            />
        </MantineProvider>
    );

    return { onClose, onSaved, onPublished };
}

describe('WritingTestEditModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('alert', vi.fn());
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    it('renders the hydrated writing draft in the shared edit shell', async () => {
        const user = userEvent.setup();
        renderModal();

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /questions/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /context & resources/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /publish updates/i })).not.toBeInTheDocument();
        expect(screen.getByText('Writing Mock 1')).toBeInTheDocument();
        expect(await screen.findByDisplayValue('Describe the chart.')).toBeInTheDocument();
        expect(screen.getByText('Discuss both views and give your opinion.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /context & resources/i }));

        expect(await screen.findByRole('heading', { name: /test metadata/i })).toBeInTheDocument();
    });

    it('publishes a published writing test from the primary save action', async () => {
        const user = userEvent.setup();
        const { onClose, onPublished } = renderModal();

        publishWritingTestMock.mockResolvedValue({
            success: true,
            testId: 'test-1',
            draftId: 'writing-draft-1',
        });

        await user.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => {
            expect(publishWritingTestMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'writing-draft-1',
                    userId: 'teacher-1',
                    testType: 'IELTS',
                    skill: 'Writing',
                    isPublic: false,
                })
            );
        });

        expect(saveWritingDraftMock).not.toHaveBeenCalled();
        expect(onPublished).toHaveBeenCalledWith('test-1', 'writing-draft-1');
        expect(onClose).toHaveBeenCalled();
        expect(trackActionMock).toHaveBeenCalledWith(
            'publishTest',
            expect.objectContaining({
                draftId: 'writing-draft-1',
                testId: 'test-1',
                source: 'writing_edit_modal',
            })
        );
    });

    it('saves draft-only changes for an unpublished writing draft', async () => {
        const user = userEvent.setup();
        const { onSaved } = renderModal({
            draft: {
                ...baseDraft,
                status: 'editing',
                publishedTestId: undefined,
            },
        });

        saveWritingDraftMock.mockResolvedValue({
            success: true,
            draftId: 'writing-draft-1',
        });

        await user.click(screen.getByRole('button', { name: /settings/i }));
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: /save draft/i }));

        await waitFor(() => {
            expect(saveWritingDraftMock).toHaveBeenCalledWith(
                'teacher-1',
                expect.objectContaining({
                    id: 'writing-draft-1',
                    isPublic: true,
                    metadata: expect.objectContaining({
                        title: 'Writing Mock 1',
                        format: 'full-test',
                    }),
                    tasks: expect.arrayContaining([
                        expect.objectContaining({ taskNumber: 1 }),
                        expect.objectContaining({ taskNumber: 2 }),
                    ]),
                })
            );
        });

        expect(onSaved).toHaveBeenCalledWith('writing-draft-1');
        expect(trackActionMock).toHaveBeenCalledWith(
            'saveDraft',
            expect.objectContaining({
                draftId: 'writing-draft-1',
                source: 'writing_edit_modal',
            })
        );
        expect(trackActionMock).toHaveBeenCalledWith(
            'toggleVisibility',
            expect.objectContaining({
                draftId: 'writing-draft-1',
                isPublic: true,
                source: 'writing_edit_modal',
            })
        );
    });

    it('publishes an unpublished draft from the secondary action', async () => {
        const user = userEvent.setup();
        const { onClose, onPublished } = renderModal({
            draft: {
                ...baseDraft,
                status: 'editing',
                publishedTestId: undefined,
            },
        });

        publishWritingTestMock.mockResolvedValue({
            success: true,
            testId: 'test-2',
            draftId: 'writing-draft-1',
        });

        await user.click(screen.getByRole('button', { name: /settings/i }));
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: /publish test/i }));

        await waitFor(() => {
            expect(publishWritingTestMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'writing-draft-1',
                    userId: 'teacher-1',
                    testType: 'IELTS',
                    skill: 'Writing',
                    isPublic: true,
                    metadata: expect.objectContaining({
                        title: 'Writing Mock 1',
                    }),
                })
            );
        });

        expect(onPublished).toHaveBeenCalledWith('test-2', 'writing-draft-1');
        expect(onClose).toHaveBeenCalled();
        expect(trackActionMock).toHaveBeenCalledWith(
            'publishTest',
            expect.objectContaining({
                draftId: 'writing-draft-1',
                testId: 'test-2',
                source: 'writing_edit_modal',
            })
        );
    });
});

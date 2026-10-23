import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeworkCreateModal, type BookHomeworkRecoveryState } from './HomeworkCreateModal';
import { createHomework } from '../../services/homeworkManager';
import { createBookHomeworkAssignmentViaWorker } from '../../services/homeworkAssignmentClient';
import type { BookHomeworkPreviewSource } from '../../services/book-homework/bookHomeworkPreview.service';

const mockGetAllTests = vi.fn();
const mockGetClasses = vi.fn();
const mockGetClass = vi.fn();
const mockLoadBookHomeworkPreviewSource = vi.fn();

const bookPreviewSource: BookHomeworkPreviewSource = {
    delivery: {
        schemaVersion: 1,
        projectionKind: 'book-runtime-delivery',
        bindingId: 'binding-book-preview',
        bindingRevision: 1,
        recipientId: 'student-1',
        context: { contextId: 'homework-book-1', kind: 'homework', entitlementBasis: 'assignment' },
        book: {
            bookId: 'book-1',
            bookMode: 'pdf',
            bookRevision: 1,
            manifestVersionId: 'manifest-1',
            publicationId: 'publication-1',
            publicationRevision: 1,
            publicationStatus: 'published',
        },
        scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
        outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' }],
        sourceSet: {
            strategy: 'full_pdf',
            sources: [{
                sourceKey: 'full-pdf',
                sourceVersionId: 'source-1',
                lifecycle: 'verified-usable',
                localPageScope: { kind: 'all', pages: [] },
            }],
        },
        documentRequests: [],
        activities: [{
            placementId: 'placement-1',
            activityId: 'activity-1',
            activityVersion: 1,
            activityVersionId: 'activity-1-v1',
            nodeKey: 'unit-1',
            order: 1,
            titleSnapshot: 'Activity 1',
            contextMode: 'none',
            sourceContext: { available: false, description: 'No source required.', pageGroupKeys: [], sourcePageScopes: [] },
        }],
        actionFlags: { canAutosave: false, canSubmit: true, canReview: false },
        provenance: {
            publicationId: 'publication-1',
            publicationRevision: 1,
            bindingId: 'binding-book-preview',
            bindingRevision: 1,
        },
    },
    studentDocument: {
        sourceVersionId: 'source-1',
        descriptorRevision: 1,
        sha256Hex: 'a'.repeat(64),
    },
    targetPreview: {
        fingerprint: 'preview-fingerprint',
        rows: [{ placementId: 'placement-1', activityId: 'activity-1', nodeKey: 'unit-1', state: 'included' }],
        includedCount: 1,
        excludedCount: 0,
        excludedReasonCounts: {},
    },
    identity: {
        manifestVersionId: 'manifest-1',
        ownerId: 'teacher-1',
        createdByCommandId: 'command-1',
        createdAt: '2026-07-28T00:00:00.000Z',
        bindingRevision: 1,
    },
    bookTitle: 'Book Preview Fixture',
};

const bookPreviewWorkerSource = {
    ...bookPreviewSource,
    classId: 'class-1',
};

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            uid: 'teacher-1',
            email: 'teacher@test.com',
        },
    }),
}));

vi.mock('../../hooks/useHomeworkTags', () => ({
    useHomeworkTags: () => ({
        tags: [],
    }),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../../services/homeworkManager', () => ({
    createHomework: vi.fn(),
}));

vi.mock('../../services/homeworkAssignmentClient', () => ({
    createBookHomeworkAssignmentViaWorker: vi.fn(),
    createBookHomeworkPreviewSource: (...args: any[]) => mockLoadBookHomeworkPreviewSource(...args),
}));

vi.mock('../../services/homeworkTemplateService', () => ({
    createTemplate: vi.fn(),
    getTemplatesByTeacher: vi.fn(async () => []),
}));

vi.mock('../../services/firebaseQueryOptimizer', () => ({
    default: {
        getAllTests: () => mockGetAllTests(),
    },
}));

vi.mock('../../services/classManager', () => ({
    getClasses: (...args: any[]) => mockGetClasses(...args),
    getClass: (...args: any[]) => mockGetClass(...args),
}));

vi.mock('./HomeworkConfigPanel', () => ({
    HomeworkConfigPanel: () => <div>Homework config panel</div>,
}));

vi.mock('./HomeworkTagChips', () => ({
    HomeworkTagChips: () => <div>Homework tag chips</div>,
}));

vi.mock('./StudentGroupSelector', () => ({
    StudentGroupSelector: () => <div>Student group selector</div>,
}));

vi.mock('./AntiCheatConfigSection', () => ({
    AntiCheatConfigSection: () => <div>Anti cheat config</div>,
}));

vi.mock('./TemplateSaveModal', () => ({
    default: () => null,
}));

vi.mock('../thcs-editor/THCSHomeworkAssignDialog', () => ({
    THCSHomeworkAssignDialog: () => null,
}));

vi.mock('../modern/ToastNotification', () => ({
    default: () => null,
    toast: {
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    },
}));

describe('HomeworkCreateModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetClasses.mockResolvedValue([]);
        mockGetClass.mockResolvedValue(null);
        mockGetAllTests.mockResolvedValue([
            {
                id: 'owned-test',
                title: 'Owned Private Test',
                ownerId: 'teacher-1',
                type: 'test',
                skill: 'reading',
                questions: [{ id: 'q1' }],
            },
            {
                id: 'public-test',
                title: 'Shared Public Test',
                ownerId: 'teacher-2',
                createdBy: 'teacher-2',
                isPublic: true,
                type: 'test',
                skill: 'listening',
                questions: [{ id: 'q1' }, { id: 'q2' }],
            },
            {
                id: 'foreign-private',
                title: 'Other Private Test',
                ownerId: 'teacher-3',
                createdBy: 'teacher-3',
                type: 'test',
                skill: 'reading',
                questions: [{ id: 'q1' }],
            },
        ]);
    });

    it('includes public library materials from other teachers in the material list', async () => {
        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        expect(await screen.findByText('Owned Private Test')).toBeInTheDocument();
        expect(await screen.findByText('Shared Public Test')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByText('Other Private Test')).not.toBeInTheDocument();
        });

        expect(screen.getByText('Public Library')).toBeInTheDocument();
    });

    it('uses a direct preselected Teacher Lobby material and normalized Worker writer', async () => {
        const createHomeworkAssignment = vi.fn(async () => 'homework-worker-1');

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedTarget={{
                    type: 'class',
                    classId: 'class-1',
                    className: 'IELTS Class',
                }}
                preselectedMaterial={{
                    id: 'reading-v2-master-1',
                    title: 'Reading V2 Master',
                    type: 'test',
                    skill: 'reading',
                    questionCount: 40,
                }}
                preselectedContentRef={{
                    contentKind: 'ielts_reading',
                    contentId: 'reading-v2-master-1',
                    version: 'composition-version-1',
                    source: 'reading-v2',
                }}
                createHomeworkAssignment={createHomeworkAssignment}
            />
        );

        expect(mockGetAllTests).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.change(screen.getByLabelText(/Due Date/i), {
            target: { value: '2026-06-15T10:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.click(screen.getByRole('button', { name: /Create Homework/i }));

        await waitFor(() => {
            expect(createHomeworkAssignment).toHaveBeenCalledWith(expect.objectContaining({
                materialId: 'reading-v2-master-1',
                materialTitle: 'Reading V2 Master',
                materialType: 'test',
                materialSkill: 'reading',
                contentRef: {
                    contentKind: 'ielts_reading',
                    contentId: 'reading-v2-master-1',
                    version: 'composition-version-1',
                    source: 'reading-v2',
                },
            }));
        });
        expect(createHomework).not.toHaveBeenCalled();
    });

    it('shows Worker rejection details when normalized homework assignment fails', async () => {
        const createHomeworkAssignment = vi.fn(async () => {
            throw new Error('Content is missing a safe delivery projection.');
        });

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedTarget={{
                    type: 'class',
                    classId: 'class-1',
                    className: 'IELTS Class',
                }}
                preselectedMaterial={{
                    id: 'ielts-reading-1',
                    title: 'IELTS Reading',
                    type: 'test',
                    skill: 'reading',
                    questionCount: 40,
                }}
                preselectedContentRef={{
                    contentKind: 'ielts_reading',
                    contentId: 'ielts-reading-1',
                }}
                createHomeworkAssignment={createHomeworkAssignment}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.change(screen.getByLabelText(/Due Date/i), {
            target: { value: '2026-06-15T10:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.click(screen.getByRole('button', { name: /Create Homework/i }));

        expect(await screen.findByText(/Content is missing a safe delivery projection/i)).toBeInTheDocument();
    });

    it('opens a preselected Reading Passage without broad material scans and creates typed homework', async () => {
        vi.mocked(createHomework).mockResolvedValue('homework-1');
        const onSuccess = vi.fn();

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={onSuccess}
                preselectedTarget={{
                    type: 'class',
                    classId: 'class-1',
                    className: 'IELTS Class',
                }}
                preselectedReadingPassage={{
                    materialId: 'passage-1',
                    title: 'Making Time for Science',
                    questionCount: 13,
                    testTypeIds: ['ielts'],
                    sourceOrderDisplay: 'Passage 1',
                    sourceFullTestTitle: 'British Council Practice Test 01',
                    publishedSnapshotVersionId: 'snapshot-1',
                    hasStudentSafeProjection: true,
                    accessible: true,
                    archived: false,
                }}
            />
        );

        expect(mockGetAllTests).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.change(screen.getByLabelText(/Due Date/i), {
            target: { value: '2026-06-15T10:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.click(screen.getByRole('button', { name: /Create Homework/i }));

        await waitFor(() => {
            expect(createHomework).toHaveBeenCalledWith(expect.objectContaining({
                materialId: 'passage-1',
                materialTitle: 'Making Time for Science',
                materialType: 'reading-passage',
                materialSkill: 'reading',
                readingPassageSnapshot: expect.objectContaining({
                    passageMaterialId: 'passage-1',
                    snapshotVersionId: 'snapshot-1',
                    sourceOrderDisplay: 'Passage 1',
                }),
            }));
        });
        expect(onSuccess).toHaveBeenCalled();
    });

    it('normalizes a stale Reading V2 full-test content ref to the selected Reading Passage identity', async () => {
        const createHomeworkAssignment = vi.fn(async () => 'homework-worker-1');

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedTarget={{
                    type: 'class',
                    classId: 'class-1',
                    className: 'IELTS Class',
                }}
                preselectedReadingPassage={{
                    materialId: 'passage-normalized',
                    title: 'Canonical Passage',
                    questionCount: 14,
                    testTypeIds: ['ielts'],
                    publishedSnapshotVersionId: 'snapshot-passage',
                    hasStudentSafeProjection: true,
                    accessible: true,
                    archived: false,
                }}
                preselectedContentRef={{
                    contentKind: 'ielts_reading',
                    contentId: 'passage-normalized',
                    version: 'snapshot-passage',
                    title: 'Canonical Passage',
                    source: 'reading-v2',
                }}
                createHomeworkAssignment={createHomeworkAssignment}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.change(screen.getByLabelText(/Due Date/i), {
            target: { value: '2026-09-20T10:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.click(screen.getByRole('button', { name: /Create Homework/i }));

        await waitFor(() => {
            expect(createHomeworkAssignment).toHaveBeenCalledWith(expect.objectContaining({
                materialId: 'passage-normalized',
                materialType: 'reading-passage',
                contentRef: {
                    contentKind: 'reading_passage',
                    contentId: 'passage-normalized',
                    version: 'snapshot-passage',
                    title: 'Canonical Passage',
                    source: 'reading-v2',
                },
            }));
        });
    });

    it('shows exact denial reason for unpublished preselected Reading Passage homework', async () => {
        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedTarget={{
                    type: 'class',
                    classId: 'class-1',
                    className: 'IELTS Class',
                }}
                preselectedReadingPassage={{
                    materialId: 'passage-unpublished',
                    title: 'Unpublished Passage',
                    questionCount: 13,
                    testTypeIds: ['ielts'],
                    hasStudentSafeProjection: false,
                    accessible: false,
                    archived: false,
                }}
            />
        );

        expect(await screen.findByText(/Reading Passage passage-unpublished requires a published snapshot before assignment\./))
            .toBeInTheDocument();
        expect(createHomework).not.toHaveBeenCalled();
    });

    it('opens Book Homework preview without generic scans or Homework writes', async () => {
        const onClose = vi.fn();
        const onSuccess = vi.fn();
        const onBookHomeworkConfirm = vi.fn();

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={onClose}
                onSuccess={onSuccess}
                preselectedBookHomework={bookPreviewWorkerSource}
                onBookHomeworkConfirm={onBookHomeworkConfirm}
            />
        );

        expect(screen.getByText('Book Preview Fixture')).toBeInTheDocument();
        expect(mockGetAllTests).not.toHaveBeenCalled();
        expect(mockGetClasses).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));

        await waitFor(() => {
            expect(onBookHomeworkConfirm).toHaveBeenCalledWith(expect.objectContaining({
                manifest: expect.objectContaining({ assignmentKind: 'book_activity_bundle' }),
            }));
        });
        expect(createHomework).not.toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalled();
    });

    it('submits the bounded intent through the canonical Worker by default', async () => {
        vi.mocked(createBookHomeworkAssignmentViaWorker).mockResolvedValue({
            status: 'committed',
            assignmentId: 'assignment-1',
            operationId: '00000000-0000-4000-8000-000000000001',
            state: 'committed',
            visibility: 'committed',
            recipientCount: 1,
            committedRecipientCount: 1,
            revision: 1,
        });
        const onSuccess = vi.fn();

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={onSuccess}
                preselectedBookHomework={bookPreviewWorkerSource}
            />
        );

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));

        await waitFor(() => {
            expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledWith(expect.objectContaining({
                selectedRecipientIds: ['student-1'],
                intent: expect.objectContaining({
                    bookId: 'book-1',
                    target: { kind: 'book', bookId: 'book-1', classId: 'class-1' },
                    expectedPublication: {
                        publicationId: 'publication-1',
                        publicationRevision: 1,
                        manifestVersionId: 'manifest-1',
                    },
                }),
            }));
        });
        const command = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[0]?.[0];
        expect(command).not.toHaveProperty('ownerId');
        expect(command).not.toHaveProperty('createdAt');
        expect(command).not.toHaveProperty('manifest');
        expect(command?.intent.expectedStudentDocument).toEqual({
            sourceVersionId: 'source-1',
            descriptorRevision: 1,
            sha256Hex: 'a'.repeat(64),
        });
        expect(JSON.stringify(command)).not.toContain('provider');
        expect(JSON.stringify(command)).not.toContain('objectKey');
        expect(onSuccess).toHaveBeenCalled();
    });

    it('reuses Book Homework command identity after an ambiguous failure', async () => {
        vi.mocked(createBookHomeworkAssignmentViaWorker)
            .mockRejectedValueOnce(new Error('Request outcome is unknown.'))
            .mockResolvedValueOnce({
                status: 'committed',
                assignmentId: 'assignment-1',
                operationId: '00000000-0000-4000-8000-000000000001',
                state: 'committed',
                visibility: 'committed',
                recipientCount: 1,
                committedRecipientCount: 1,
                revision: 1,
            });

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedBookHomework={bookPreviewWorkerSource}
            />
        );

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/Request outcome is unknown\./)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(2));

        const first = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[0]?.[0];
        const retry = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[1]?.[0];
        expect(retry).toMatchObject({
            assignmentId: first?.assignmentId,
            operationId: first?.operationId,
            idempotencyKey: first?.idempotencyKey,
        });
    });

    it('preserves command identity across close, reopen, and network retry', async () => {
        vi.mocked(createBookHomeworkAssignmentViaWorker)
            .mockRejectedValueOnce(new Error('Network request failed.'))
            .mockResolvedValueOnce({
                status: 'committed',
                assignmentId: 'assignment-retried',
                operationId: '00000000-0000-4000-8000-000000000003',
                state: 'committed',
                visibility: 'committed',
                recipientCount: 1,
                committedRecipientCount: 1,
                revision: 1,
            });
        const onClose = vi.fn();
        const props = {
            isOpen: true,
            onClose,
            onSuccess: vi.fn(),
            preselectedBookHomework: bookPreviewWorkerSource,
        };
        const { rerender } = render(<HomeworkCreateModal {...props} />);

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/Network request failed\./)).toBeInTheDocument();
        const first = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[0]?.[0];

        fireEvent.click(screen.getByRole('button', { name: '✕' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        rerender(<HomeworkCreateModal {...props} isOpen={false} />);
        rerender(<HomeworkCreateModal {...props} isOpen={true} />);
        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));

        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(2));
        expect(vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[1]?.[0]).toMatchObject({
            assignmentId: first?.assignmentId,
            operationId: first?.operationId,
            idempotencyKey: first?.idempotencyKey,
        });
    });

    it('retries the exact custom schedule command after an ambiguous close and reopen', async () => {
        vi.mocked(createBookHomeworkAssignmentViaWorker)
            .mockRejectedValueOnce(new Error('Network request failed.'))
            .mockResolvedValueOnce({
                status: 'committed',
                assignmentId: 'assignment-custom-retry',
                operationId: '00000000-0000-4000-8000-000000000005',
                state: 'committed',
                visibility: 'committed',
                recipientCount: 1,
                committedRecipientCount: 1,
                revision: 1,
            });
        const onClose = vi.fn();
        const props = {
            isOpen: true,
            onClose,
            onSuccess: vi.fn(),
            preselectedBookHomework: bookPreviewWorkerSource,
        };
        const { rerender } = render(<HomeworkCreateModal {...props} />);

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.change(screen.getByLabelText('Deadline override for Unit 1'), {
            target: { value: '2026-07-31T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/Network request failed\./)).toBeInTheDocument();
        const firstCommand = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[0]?.[0];

        fireEvent.click(screen.getByRole('button', { name: '✕' }));
        rerender(<HomeworkCreateModal {...props} isOpen={false} />);
        rerender(<HomeworkCreateModal {...props} isOpen={true} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Retry exact assignment' }));

        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(2));
        expect(vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[1]?.[0]).toEqual(firstCommand);
    });

    it('continues exact pending commands and announces success only after notification completion', async () => {
        let finish!: (result: Awaited<ReturnType<typeof createBookHomeworkAssignmentViaWorker>>) => void;
        const progress = { assignmentId: 'bounded-assignment', operationId: '00000000-0000-4000-8000-000000000008',
            recipientCount: 1, committedRecipientCount: 1, revision: 1 };
        vi.mocked(createBookHomeworkAssignmentViaWorker)
            .mockResolvedValueOnce({ ...progress, status: 'fanout_pending', state: 'fanout_pending', visibility: 'hidden' })
            .mockResolvedValueOnce({ ...progress, status: 'committed_notifications_pending', state: 'committed', visibility: 'committed', revision: 2, notifiedRecipientCount: 0 })
            .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const onSuccess = vi.fn();
        render(<HomeworkCreateModal isOpen onClose={vi.fn()} onSuccess={onSuccess} preselectedBookHomework={bookPreviewWorkerSource} />);
        fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-08-01T12:00' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(3));
        expect(onSuccess).not.toHaveBeenCalled();
        const commands = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls.map(([command]) => command);
        expect(commands[1]).toEqual(commands[0]);
        expect(commands[2]).toEqual(commands[0]);
        finish({ ...progress, status: 'committed', state: 'committed', visibility: 'committed', revision: 3, notifiedRecipientCount: 1 });
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    });

    it.each(['pending', 'ambiguous', 'committed_projection_pending'] as const)(
        'keeps %s Book Homework recovery across the parent conditional remount', async (outcome) => {
        if (outcome === 'pending') {
            vi.mocked(createBookHomeworkAssignmentViaWorker).mockImplementationOnce(() => new Promise(() => undefined));
        } else if (outcome === 'ambiguous') {
            vi.mocked(createBookHomeworkAssignmentViaWorker).mockRejectedValueOnce(new Error('Request outcome is unknown.'));
        } else {
            vi.mocked(createBookHomeworkAssignmentViaWorker).mockResolvedValueOnce({
                status: 'committed_projection_pending',
                assignmentId: 'assignment-projection-pending',
                operationId: '00000000-0000-4000-8000-000000000006',
                state: 'committed',
                visibility: 'committed',
                recipientCount: 1,
                committedRecipientCount: 1,
                revision: 1,
            });
            vi.mocked(createBookHomeworkAssignmentViaWorker).mockResolvedValueOnce({
                status: 'committed_projection_pending', assignmentId: 'assignment-projection-pending',
                operationId: '00000000-0000-4000-8000-000000000006', state: 'committed', visibility: 'committed',
                recipientCount: 1, committedRecipientCount: 1, revision: 1,
            });
        }
        vi.mocked(createBookHomeworkAssignmentViaWorker).mockResolvedValueOnce({
            status: 'committed',
            assignmentId: outcome === 'committed_projection_pending'
                ? 'assignment-projection-pending'
                : 'assignment-retried-after-remount',
            operationId: outcome === 'committed_projection_pending'
                ? '00000000-0000-4000-8000-000000000006'
                : '00000000-0000-4000-8000-000000000007',
            state: 'committed',
            visibility: 'committed',
            recipientCount: 1,
            committedRecipientCount: 1,
            revision: 2,
        });
        const onSuccess = vi.fn();
        const ParentConditionalMount = () => {
            const [isOpen, setIsOpen] = useState(true);
            const [recovery, setRecovery] = useState<BookHomeworkRecoveryState | null>(null);
            return <>
                {isOpen && <HomeworkCreateModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    onSuccess={onSuccess}
                    preselectedBookHomework={bookPreviewWorkerSource}
                    bookHomeworkRecovery={recovery}
                    onBookHomeworkRecoveryChange={setRecovery}
                />}
                <button type="button" onClick={() => setIsOpen(false)}>Force unmount Book Homework</button>
                <button type="button" onClick={() => setIsOpen(true)}>Reopen Book Homework</button>
            </>;
        };

        render(<ParentConditionalMount />);
        fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-08-01T12:00' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        if (outcome === 'ambiguous') {
            expect(await screen.findByText(/Request outcome is unknown\./)).toBeInTheDocument();
        } else if (outcome === 'committed_projection_pending') {
            expect((await screen.findAllByText(/committed, delivery sync pending/i)).length).toBeGreaterThan(0);
        } else {
            await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(1));
        }
        expect(onSuccess).not.toHaveBeenCalled();
        const firstCommand = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[0]?.[0];

        fireEvent.click(screen.getByRole('button', { name: 'Force unmount Book Homework' }));
        expect(screen.queryByText('Book Preview Fixture')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Reopen Book Homework' }));
        const retry = await screen.findByRole('button', {
            name: outcome === 'committed_projection_pending'
                ? /Retry delivery synchronization/i
                : /Retry exact assignment/i,
        });
        expect(retry).not.toBeDisabled();
        fireEvent.click(retry);

        const retries = outcome === 'committed_projection_pending' ? 3 : 2;
        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(retries));
        expect(vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[retries - 1]?.[0]).toEqual(firstCommand);
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        },
    );

    it('keeps unresolved command identity after an ambiguous retry returns 4xx', async () => {
        vi.mocked(createBookHomeworkAssignmentViaWorker)
            .mockRejectedValueOnce(new Error('Request outcome is unknown.'))
            .mockRejectedValueOnce(Object.assign(new Error('Command conflict.'), { status: 409 }))
            .mockResolvedValueOnce({
                status: 'committed',
                assignmentId: 'assignment-retried-after-conflict',
                operationId: '00000000-0000-4000-8000-000000000004',
                state: 'committed',
                visibility: 'committed',
                recipientCount: 1,
                committedRecipientCount: 1,
                revision: 1,
            });

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedBookHomework={bookPreviewWorkerSource}
            />
        );

        const setDueDate = (value: string) => fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value },
        });
        setDueDate('2026-08-01T12:00');
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/Request outcome is unknown\./)).toBeInTheDocument();
        const first = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[0]?.[0];

        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/Command conflict\./)).toBeInTheDocument();
        expect(vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[1]?.[0]).toMatchObject({
            assignmentId: first?.assignmentId,
            operationId: first?.operationId,
            idempotencyKey: first?.idempotencyKey,
        });

        setDueDate('2026-08-02T12:00');
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/previous Book Homework assignment outcome is uncertain/i)).toBeInTheDocument();
        expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(2);

        setDueDate('2026-08-01T12:00');
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(3));
        expect(vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[2]?.[0]).toMatchObject({
            assignmentId: first?.assignmentId,
            operationId: first?.operationId,
            idempotencyKey: first?.idempotencyKey,
        });
    });

    it('allocates fresh command identity after a definitive rejection and intent change', async () => {
        vi.mocked(createBookHomeworkAssignmentViaWorker)
            .mockRejectedValueOnce(Object.assign(new Error('Schedule was rejected.'), { status: 422 }))
            .mockResolvedValueOnce({
                status: 'committed',
                assignmentId: 'assignment-2',
                operationId: '00000000-0000-4000-8000-000000000002',
                state: 'committed',
                visibility: 'committed',
                recipientCount: 1,
                committedRecipientCount: 1,
                revision: 1,
            });

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedBookHomework={bookPreviewWorkerSource}
            />
        );

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/Schedule was rejected\./)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-02T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(2));

        const first = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[0]?.[0];
        const second = vi.mocked(createBookHomeworkAssignmentViaWorker).mock.calls[1]?.[0];
        expect(second?.assignmentId).not.toBe(first?.assignmentId);
        expect(second?.operationId).not.toBe(first?.operationId);
        expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
    });

    it('blocks a changed intent after an uncertain command outcome', async () => {
        vi.mocked(createBookHomeworkAssignmentViaWorker).mockRejectedValueOnce(new Error('Request outcome is unknown.'));

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedBookHomework={bookPreviewWorkerSource}
            />
        );

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
        expect(await screen.findByText(/Request outcome is unknown\./)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-02T12:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));

        expect(await screen.findByText(/previous Book Homework assignment outcome is uncertain/i)).toBeInTheDocument();
        expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(1);
    });

    it('ignores duplicate confirm and cancellation while Book assignment is in flight', async () => {
        let rejectSubmit: (reason?: unknown) => void = () => undefined;
        vi.mocked(createBookHomeworkAssignmentViaWorker).mockImplementationOnce(() => new Promise((_, reject) => {
            rejectSubmit = reject;
        }));
        const onClose = vi.fn();
        const { container } = render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={onClose}
                onSuccess={vi.fn()}
                preselectedBookHomework={bookPreviewWorkerSource}
            />
        );

        fireEvent.change(screen.getByLabelText('Due Date'), {
            target: { value: '2026-08-01T12:00' },
        });
        const confirm = screen.getByRole('button', { name: /confirm preview/i });
        fireEvent.click(confirm);
        await waitFor(() => expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('button', { name: '✕' })).toBeDisabled();

        fireEvent.click(confirm);
        fireEvent.click(screen.getByRole('button', { name: '✕' }));
        fireEvent.click(container.querySelector('.homework-create-modal-overlay')!);
        expect(createBookHomeworkAssignmentViaWorker).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();

        rejectSubmit(new Error('Request outcome is unknown.'));
        expect(await screen.findByText(/Request outcome is unknown\./)).toBeInTheDocument();
    });

    it('loads a trusted Book Homework preview for the selected class and active students', async () => {
        mockGetClasses.mockResolvedValue([{ id: 'class-1', name: 'Book Class', studentCount: 2 }]);
        mockGetClass.mockResolvedValue({
            students: {
                'student-1': { id: 'student-1', name: 'Ada', email: 'ada@test.com', status: 'active' },
                'student-removed': { id: 'student-removed', name: 'Removed', status: 'removed' },
            },
        });
        mockLoadBookHomeworkPreviewSource.mockResolvedValue(bookPreviewWorkerSource);

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                bookHomeworkHandoff={{ bookId: 'book-1', unitKey: 'unit-1', bookTitle: 'Book Preview Fixture' }}
            />
        );

        expect(await screen.findByRole('combobox', { name: 'Book Homework class' })).toBeInTheDocument();
        expect(mockGetClasses).toHaveBeenCalledWith('teacher-1');
        fireEvent.change(screen.getByRole('combobox', { name: 'Book Homework class' }), {
            target: { value: 'class-1' },
        });
        const student = await screen.findByRole('checkbox', { name: 'Ada' });
        expect(screen.queryByRole('checkbox', { name: 'Removed' })).not.toBeInTheDocument();
        fireEvent.click(student);
        fireEvent.click(screen.getByRole('button', { name: /Load Preview/i }));

        await waitFor(() => expect(mockLoadBookHomeworkPreviewSource).toHaveBeenCalledWith({
            bookId: 'book-1',
            target: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
            classId: 'class-1',
            selectedRecipientIds: ['student-1'],
            title: 'Book Preview Fixture',
        }));
        expect(await screen.findByText('Book Preview Fixture')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Load Preview/i })).not.toBeInTheDocument();
    });

    it('keeps the latest Book Homework class roster when an older response resolves later', async () => {
        let resolveFirst: (value: unknown) => void = () => undefined;
        let resolveSecond: (value: unknown) => void = () => undefined;
        mockGetClasses.mockResolvedValue([
            { id: 'class-1', name: 'First Class' },
            { id: 'class-2', name: 'Second Class' },
        ]);
        mockGetClass.mockImplementation((classId: string) => new Promise((resolve) => {
            if (classId === 'class-1') resolveFirst = resolve;
            else resolveSecond = resolve;
        }));

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                bookHomeworkHandoff={{ bookId: 'book-1', unitKey: 'unit-1', bookTitle: 'Book Preview Fixture' }}
            />
        );

        const classSelect = await screen.findByRole('combobox', { name: 'Book Homework class' });
        fireEvent.change(classSelect, { target: { value: 'class-1' } });
        await waitFor(() => expect(mockGetClass).toHaveBeenCalledWith('class-1'));
        fireEvent.change(classSelect, { target: { value: 'class-2' } });
        await waitFor(() => expect(mockGetClass).toHaveBeenCalledWith('class-2'));

        resolveSecond({ students: { 'student-2': { id: 'student-2', name: 'Second Student', status: 'active' } } });
        expect(await screen.findByRole('checkbox', { name: 'Second Student' })).toBeInTheDocument();
        resolveFirst({ students: { 'student-1': { id: 'student-1', name: 'First Student', status: 'active' } } });

        await waitFor(() => {
            expect(screen.queryByRole('checkbox', { name: 'First Student' })).not.toBeInTheDocument();
        });
        expect(screen.getByRole('checkbox', { name: 'Second Student' })).toBeInTheDocument();
    });

    it('ignores a Book Homework preview that resolves after recipient intent changes', async () => {
        let resolvePreview: (value: unknown) => void = () => undefined;
        mockGetClasses.mockResolvedValue([{ id: 'class-1', name: 'Book Class' }]);
        mockGetClass.mockResolvedValue({
            students: {
                'student-1': { id: 'student-1', name: 'Ada', status: 'active' },
                'student-2': { id: 'student-2', name: 'Grace', status: 'active' },
            },
        });
        mockLoadBookHomeworkPreviewSource.mockImplementationOnce(() => new Promise((resolve) => {
            resolvePreview = resolve;
        }));

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                bookHomeworkHandoff={{ bookId: 'book-1', unitKey: 'unit-1', bookTitle: 'Book Preview Fixture' }}
            />
        );

        const classSelect = await screen.findByRole('combobox', { name: 'Book Homework class' });
        fireEvent.change(classSelect, { target: { value: 'class-1' } });
        const firstStudent = await screen.findByRole('checkbox', { name: 'Ada' });
        fireEvent.click(firstStudent);
        fireEvent.click(screen.getByRole('button', { name: /Load Preview/i }));
        await waitFor(() => expect(mockLoadBookHomeworkPreviewSource).toHaveBeenCalledTimes(1));

        fireEvent.click(firstStudent);
        resolvePreview(bookPreviewWorkerSource);

        await waitFor(() => {
            expect(screen.queryByText('Book Preview Fixture')).not.toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Load Preview/i })).toBeInTheDocument();
    });

    it('ignores a Book Homework preview that resolves after the modal context changes', async () => {
        let resolvePreview: (value: unknown) => void = () => undefined;
        mockGetClasses.mockResolvedValue([{ id: 'class-1', name: 'Book Class' }]);
        mockGetClass.mockResolvedValue({
            students: { 'student-1': { id: 'student-1', name: 'Ada', status: 'active' } },
        });
        mockLoadBookHomeworkPreviewSource.mockImplementationOnce(() => new Promise((resolve) => {
            resolvePreview = resolve;
        }));

        const { rerender } = render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                bookHomeworkHandoff={{ bookId: 'book-1', unitKey: 'unit-1', bookTitle: 'Book Preview Fixture' }}
            />
        );

        const classSelect = await screen.findByRole('combobox', { name: 'Book Homework class' });
        fireEvent.change(classSelect, { target: { value: 'class-1' } });
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Ada' }));
        fireEvent.click(screen.getByRole('button', { name: /Load Preview/i }));
        await waitFor(() => expect(mockLoadBookHomeworkPreviewSource).toHaveBeenCalledTimes(1));

        rerender(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                bookHomeworkHandoff={{ bookId: 'book-1', unitKey: 'unit-2', bookTitle: 'Book Preview Fixture' }}
            />
        );
        resolvePreview(bookPreviewWorkerSource);

        await waitFor(() => {
            expect(screen.queryByText('Book Preview Fixture')).not.toBeInTheDocument();
        });
    });

    it('shows the full active roster while capping selected Book Homework students at 30', async () => {
        const students = Object.fromEntries(Array.from({ length: 35 }, (_, index) => {
            const number = index + 1;
            return [`student-${number}`, { id: `student-${number}`, name: `Student ${number}`, status: 'active' }];
        }));
        mockGetClasses.mockResolvedValue([{ id: 'class-1', name: 'Book Class' }]);
        mockGetClass.mockResolvedValue({ students });
        mockLoadBookHomeworkPreviewSource.mockResolvedValue(bookPreviewWorkerSource);

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                bookHomeworkHandoff={{ bookId: 'book-1', unitKey: 'unit-1', bookTitle: 'Book Preview Fixture' }}
            />
        );

        const classSelect = await screen.findByRole('combobox', { name: 'Book Homework class' });
        fireEvent.change(classSelect, { target: { value: 'class-1' } });
        const checkboxes = await screen.findAllByRole('checkbox');
        expect(checkboxes).toHaveLength(35);
        checkboxes.slice(0, 30).forEach((checkbox) => fireEvent.click(checkbox));

        const thirtyFirst = checkboxes[30];
        expect(thirtyFirst).toBeDisabled();
        fireEvent.click(thirtyFirst);
        fireEvent.click(screen.getByRole('button', { name: /Load Preview/i }));

        await waitFor(() => expect(mockLoadBookHomeworkPreviewSource).toHaveBeenCalledWith(expect.objectContaining({
            selectedRecipientIds: Array.from({ length: 30 }, (_, index) => `student-${index + 1}`),
        })));
    });

    it('cancels Book Homework handoff before preview without assigning', async () => {
        const onClose = vi.fn();
        mockGetClasses.mockResolvedValue([{ id: 'class-1', name: 'Book Class' }]);

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={onClose}
                onSuccess={vi.fn()}
                bookHomeworkHandoff={{ bookId: 'book-1', unitKey: 'unit-1', bookTitle: 'Book Preview Fixture' }}
            />
        );

        fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalled();
        expect(mockLoadBookHomeworkPreviewSource).not.toHaveBeenCalled();
        expect(createBookHomeworkAssignmentViaWorker).not.toHaveBeenCalled();
    });

    it('creates a Reading Passage set from selected passage summaries', async () => {
        vi.mocked(createHomework).mockResolvedValue('homework-set-1');

        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                preselectedTarget={{
                    type: 'class',
                    classId: 'class-1',
                    className: 'IELTS Class',
                }}
                preselectedReadingPassageSet={{
                    title: 'Selected Reading Passages',
                    passages: [
                        {
                            materialId: 'passage-1',
                            title: 'Passage One',
                            questionCount: 13,
                            testTypeIds: ['ielts'],
                            publishedSnapshotVersionId: 'snapshot-1',
                            hasStudentSafeProjection: true,
                        },
                        {
                            materialId: 'passage-2',
                            title: 'Passage Two',
                            questionCount: 13,
                            testTypeIds: ['ielts'],
                            publishedSnapshotVersionId: 'snapshot-2',
                            hasStudentSafeProjection: true,
                        },
                    ],
                }}
            />
        );

        expect(mockGetAllTests).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.change(screen.getByLabelText(/Due Date/i), {
            target: { value: '2026-06-15T10:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        fireEvent.click(screen.getByRole('button', { name: /Create Homework/i }));

        await waitFor(() => {
            expect(createHomework).toHaveBeenCalledWith(expect.objectContaining({
                materialTitle: 'Selected Reading Passages',
                materialType: 'reading-passage-set',
                readingPassageSet: {
                    titleSnapshot: 'Selected Reading Passages',
                    items: [
                        expect.objectContaining({ order: 1, passageMaterialId: 'passage-1' }),
                        expect.objectContaining({ order: 2, passageMaterialId: 'passage-2' }),
                    ],
                },
            }));
        });
    });
});

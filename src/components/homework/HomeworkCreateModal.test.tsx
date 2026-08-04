import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeworkCreateModal } from './HomeworkCreateModal';
import { createHomework } from '../../services/homeworkManager';
import type { BookHomeworkPreviewSource } from '../../services/book-homework/bookHomeworkPreview.service';

const mockGetAllTests = vi.fn();
const mockGetClasses = vi.fn();
const mockGetClass = vi.fn();

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
    identity: {
        manifestVersionId: 'manifest-1',
        ownerId: 'teacher-1',
        createdByCommandId: 'command-1',
        createdAt: '2026-07-28T00:00:00.000Z',
        bindingRevision: 1,
    },
    bookTitle: 'Book Preview Fixture',
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
                preselectedBookHomework={bookPreviewSource}
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

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeworkDetail } from './useHomeworkDetail';

const {
    collectionMock,
    docMock,
    getDocMock,
    onSnapshotMock,
    queryMock,
    whereMock,
} = vi.hoisted(() => ({
    collectionMock: vi.fn(),
    docMock: vi.fn(),
    getDocMock: vi.fn(),
    onSnapshotMock: vi.fn(),
    queryMock: vi.fn(),
    whereMock: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
    firestore: {},
}));

vi.mock('firebase/firestore', () => ({
    collection: (...args: unknown[]) => collectionMock(...args),
    doc: (...args: unknown[]) => docMock(...args),
    getDoc: (...args: unknown[]) => getDocMock(...args),
    onSnapshot: (...args: unknown[]) => onSnapshotMock(...args),
    query: (...args: unknown[]) => queryMock(...args),
    where: (...args: unknown[]) => whereMock(...args),
}));

const compatibilityProjection = {
    schemaVersion: 1,
    assignmentKind: 'book_homework_compatibility',
    id: 'book-assignment',
    createdBy: 'teacher-1',
    createdAt: 1_000,
    updatedAt: 2_000,
    materialId: 'book-1',
    materialTitle: 'Production Book',
    materialType: 'book',
    materialSkill: 'mixed',
    title: 'Book homework',
    target: {
        type: 'students',
        studentIds: ['student-1'],
    },
    scheduling: {
        dueDate: 3_000,
    },
    config: {
        feedbackTiming: 'never',
        lateSubmissionAllowed: false,
        maxAttempts: null,
        timerMinutes: null,
    },
    visibility: {
        showAttempts: false,
        showDueDate: true,
        showDuration: false,
        showQuestionCount: false,
        showTimer: false,
    },
    archived: false,
    tags: [],
    bookHomeworkCompatibility: {
        assignmentId: 'book-assignment',
        schemaVersion: 1,
        sourceFingerprint: 'fingerprint-1',
        sourceSagaRevision: 1,
    },
};

describe('useHomeworkDetail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        docMock.mockImplementation((...args: unknown[]) => ({ args }));
        collectionMock.mockImplementation((...args: unknown[]) => ({ args }));
        queryMock.mockImplementation((...args: unknown[]) => ({ args }));
        whereMock.mockImplementation((...args: unknown[]) => ({ args }));
        onSnapshotMock.mockReturnValue(vi.fn());
    });

    it('does not subscribe to submissions for an exact production compatibility projection', async () => {
        getDocMock.mockResolvedValue({
            exists: () => true,
            id: compatibilityProjection.id,
            data: () => compatibilityProjection,
        });

        const { result, unmount } = renderHook(() => useHomeworkDetail('book-assignment'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(getDocMock).toHaveBeenCalledTimes(1);
        expect(collectionMock).not.toHaveBeenCalled();
        expect(queryMock).not.toHaveBeenCalled();
        expect(onSnapshotMock).not.toHaveBeenCalled();
        expect(result.current.submissions).toEqual([]);

        unmount();
    });

    it('subscribes to submissions for an ordinary homework assignment', async () => {
        getDocMock.mockResolvedValue({
            exists: () => true,
            id: 'ordinary-homework',
            data: () => ({ title: 'Ordinary homework' }),
        });

        const { unmount } = renderHook(() => useHomeworkDetail('ordinary-homework'));

        await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(1));

        expect(getDocMock).toHaveBeenCalledTimes(1);
        expect(collectionMock).toHaveBeenCalledWith({}, 'homework_submissions');
        expect(whereMock).toHaveBeenCalledWith('homeworkId', '==', 'ordinary-homework');

        unmount();
    });

    it('keeps the ordinary submissions subscription across a same-id refetch', async () => {
        getDocMock.mockResolvedValue({
            exists: () => true,
            id: 'ordinary-homework',
            data: () => ({ title: 'Ordinary homework' }),
        });

        const { result, unmount } = renderHook(() => useHomeworkDetail('ordinary-homework'));

        await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(1));

        await act(async () => {
            await result.current.refetch();
        });

        expect(getDocMock).toHaveBeenCalledTimes(2);
        expect(onSnapshotMock).toHaveBeenCalledTimes(1);

        unmount();
    });

    it('keeps the submissions subscription for a missing ordinary homework id', async () => {
        getDocMock.mockResolvedValue({
            exists: () => false,
        });

        const { result, unmount } = renderHook(() => useHomeworkDetail('missing-homework'));

        await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(1));

        expect(getDocMock).toHaveBeenCalledTimes(1);
        expect(whereMock).toHaveBeenCalledWith('homeworkId', '==', 'missing-homework');
        expect(result.current.error).toBe('Homework not found');

        unmount();
    });
});

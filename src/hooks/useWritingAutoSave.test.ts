import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWritingAutoSave, type WritingAutoSaveStatus } from './useWritingAutoSave';

const { mockSet, mockGet, mockUpdate } = vi.hoisted(() => ({
    mockSet: vi.fn(),
    mockGet: vi.fn(),
    mockUpdate: vi.fn(),
}));

vi.mock('../services/firebase', () => ({ database: {} }));
vi.mock('firebase/database', () => ({
    ref: (_db: unknown, path: string) => path,
    set: (...args: unknown[]) => mockSet(...args),
    get: (...args: unknown[]) => mockGet(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
}));

describe('useWritingAutoSave', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockSet.mockResolvedValue(undefined);
        mockUpdate.mockResolvedValue(undefined);
        mockGet.mockResolvedValue({
            exists: () => true,
            val: () => ({ task2: { text: 'Accepted Task 2 draft' } }),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('restores the saved Task 2 editor before an explicit tab selection has been persisted', async () => {
        const { result } = renderHook(() => useWritingAutoSave('QAWRT2', 'student'));
        await expect(result.current.loadSavedState()).resolves.toMatchObject({
            activeTask: 2,
            task2Text: 'Accepted Task 2 draft',
            activeTimeSeconds: { 1: 0, 2: 0 },
            submitted: false,
            reopened: false,
        });
    });

    it('keeps the returned API object referentially stable across re-renders', () => {
        const { result, rerender } = renderHook(
            ({ session, uid }) => useWritingAutoSave(session, uid),
            { initialProps: { session: 'S1', uid: 'student-1' } },
        );
        const firstRef = result.current;
        rerender({ session: 'S1', uid: 'student-1' });
        expect(result.current).toBe(firstRef);
    });

    it('debounces saves with update(), preserves activeTimeSeconds, and notifies status transitions', async () => {
        const statuses: WritingAutoSaveStatus[] = [];
        const { result } = renderHook(() =>
            useWritingAutoSave('S1', 'student-1', {
                onSaveStatusChange: (status) => statuses.push(status),
            }),
        );

        act(() => {
            result.current.saveTask(1, 'Draft paragraph.');
        });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(statuses).toEqual(['saving']);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });

        expect(mockUpdate).toHaveBeenCalledWith(
            'game_sessions/S1/students/student-1/writing/task1',
            expect.objectContaining({
                text: 'Draft paragraph.',
                lastSavedAt: expect.any(Number),
            }),
        );
        expect(statuses).toEqual(['saving', 'saved']);
    });

    it('waits for an in-flight flush and retries pending text after a transient failure', async () => {
        let rejectFirst!: (err: Error) => void;
        mockUpdate
            .mockImplementationOnce(() => new Promise((_, reject) => {
                rejectFirst = reject;
            }))
            .mockResolvedValueOnce(undefined);

        const statuses: WritingAutoSaveStatus[] = [];
        const { result } = renderHook(() =>
            useWritingAutoSave('S2', 'student-2', {
                onSaveStatusChange: (status) => statuses.push(status),
            }),
        );

        act(() => {
            result.current.saveTask(1, 'Important essay');
        });

        const firstFlush = result.current.flushPendingSave();
        const secondFlush = result.current.flushPendingSave();

        rejectFirst(new Error('offline'));
        await expect(firstFlush).rejects.toThrow('offline');
        await expect(secondFlush).resolves.toBeUndefined();

        expect(mockUpdate).toHaveBeenCalledTimes(2);
        expect(statuses).toContain('error');
        expect(statuses.at(-1)).toBe('saved');
    });

    it('flushes task 1 unsaved text before queuing task 2 text', async () => {
        const { result } = renderHook(() => useWritingAutoSave('S3', 'student-3'));

        act(() => {
            result.current.saveTask(1, 'Task 1 essay');
            result.current.saveTask(2, 'Task 2 essay');
        });

        await act(async () => {
            await result.current.flushPendingSave();
        });

        expect(mockUpdate).toHaveBeenCalledWith(
            'game_sessions/S3/students/student-3/writing/task1',
            expect.objectContaining({ text: 'Task 1 essay' }),
        );
        expect(mockUpdate).toHaveBeenCalledWith(
            'game_sessions/S3/students/student-3/writing/task2',
            expect.objectContaining({ text: 'Task 2 essay' }),
        );
    });

    it('persists active times and ignores writes when identity is empty', async () => {
        const { result: emptyResult } = renderHook(() => useWritingAutoSave('', ''));
        act(() => {
            emptyResult.current.saveTask(1, 'Ignored');
        });
        await emptyResult.current.flushPendingSave();
        await emptyResult.current.saveActiveTimes({ 1: 42 });
        expect(mockUpdate).not.toHaveBeenCalled();

        const { result } = renderHook(() => useWritingAutoSave('S4', 'student-4'));
        await result.current.saveActiveTimes({ 1: 95.4, 2: 0 });
        expect(mockUpdate).toHaveBeenCalledWith(
            'game_sessions/S4/students/student-4/writing',
            { 'task1/activeTimeSeconds': 95 },
        );
    });
});

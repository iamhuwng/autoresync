import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as classManager from '../services/classManager';
import * as sessionManager from '../services/sessionManager';
import * as homeworkSubmissionHooks from './useHomeworkSubmission';
import { useStudentShellData } from './useStudentShellData';

let membershipCallback: ((memberships: Record<string, { joinedAt?: number; status?: string } | true>) => void) | null = null;
let activeSessionsCallback: ((sessions: Record<string, { createdAt?: number; status?: string; mode?: string }>) => void) | null = null;
let sessionCallbacks: Record<string, (session: Record<string, unknown> | null) => void> = {};

vi.mock('./useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-123',
        },
    }),
}));

vi.mock('../services/classManager', () => ({
    getStudentClasses: vi.fn(),
    subscribeToStudentClasses: vi.fn((_: string, callback: (memberships: Record<string, { joinedAt?: number; status?: string } | true>) => void) => {
        membershipCallback = callback;
        return () => {
            membershipCallback = null;
        };
    }),
    subscribeToActiveSessions: vi.fn((_: string, callback: (sessions: Record<string, { createdAt?: number; status?: string; mode?: string }>) => void) => {
        activeSessionsCallback = callback;
        return () => {
            activeSessionsCallback = null;
        };
    }),
}));

vi.mock('../services/sessionManager', () => ({
    subscribeToSession: vi.fn((sessionCode: string, callback: (session: Record<string, unknown> | null) => void) => {
        sessionCallbacks[sessionCode] = callback;
        return () => {
            delete sessionCallbacks[sessionCode];
        };
    }),
}));

vi.mock('./useHomeworkSubmission', () => ({
    useStudentHomeworkList: vi.fn(),
}));

describe('useStudentShellData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        membershipCallback = null;
        activeSessionsCallback = null;
        sessionCallbacks = {};
        vi.mocked(classManager.getStudentClasses)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    id: 'class-1',
                    classCode: 'ABC123',
                    name: 'IELTS Class',
                    status: 'active',
                    createdAt: 1,
                    studentCount: 1,
                    activeAssignments: 0,
                    completedAssignments: 0,
                },
            ]);
    });

    it('refreshes homework when class membership changes after a class refresh', async () => {
        const refreshHomeworkData = vi.fn().mockResolvedValue(undefined);

        vi.mocked(homeworkSubmissionHooks.useStudentHomeworkList).mockReturnValue({
            homeworkItems: [],
            isLoading: false,
            error: null,
            refreshData: refreshHomeworkData,
            notStarted: [],
            inProgress: [],
            completed: [],
            overdue: [],
        });

        const { result } = renderHook(() => useStudentShellData());

        await waitFor(() => {
            expect(result.current.enrolledClasses).toEqual([]);
        });

        await act(async () => {
            await result.current.refreshClasses();
        });

        await waitFor(() => {
            expect(result.current.enrolledClasses).toHaveLength(1);
        });

        await waitFor(() => {
            expect(refreshHomeworkData).toHaveBeenCalledTimes(1);
        });
    });

    it('refreshes classes and homework when the student class projection changes', async () => {
        const refreshHomeworkData = vi.fn().mockResolvedValue(undefined);

        vi.mocked(homeworkSubmissionHooks.useStudentHomeworkList).mockReturnValue({
            homeworkItems: [],
            isLoading: false,
            error: null,
            refreshData: refreshHomeworkData,
            notStarted: [],
            inProgress: [],
            completed: [],
            overdue: [],
        });

        const { result } = renderHook(() => useStudentShellData());

        await waitFor(() => {
            expect(result.current.enrolledClasses).toEqual([]);
            expect(membershipCallback).not.toBeNull();
        });

        await act(async () => {
            membershipCallback?.({});
        });

        await act(async () => {
            membershipCallback?.({
                'class-1': {
                    joinedAt: 1,
                    status: 'pending_approval',
                },
            });
        });

        await waitFor(() => {
            expect(result.current.enrolledClasses).toHaveLength(1);
        });

        await waitFor(() => {
            expect(refreshHomeworkData).toHaveBeenCalledTimes(1);
        });
    });

    it('keeps live sessions in sync when the underlying session status changes', async () => {
        vi.mocked(homeworkSubmissionHooks.useStudentHomeworkList).mockReturnValue({
            homeworkItems: [],
            isLoading: false,
            error: null,
            refreshData: vi.fn().mockResolvedValue(undefined),
            notStarted: [],
            inProgress: [],
            completed: [],
            overdue: [],
        });

        const { result } = renderHook(() => useStudentShellData());

        await act(async () => {
            await result.current.refreshClasses();
        });

        await waitFor(() => {
            expect(result.current.enrolledClasses).toHaveLength(1);
            expect(activeSessionsCallback).not.toBeNull();
        });

        act(() => {
            activeSessionsCallback?.({
                LIVE123: {
                    createdAt: 100,
                    status: 'waiting',
                    mode: 'test',
                },
            });
        });

        act(() => {
            sessionCallbacks.LIVE123?.({
                createdAt: 100,
                status: 'waiting',
                mode: 'test',
                testTitle: 'Live IELTS Reading',
            });
        });

        await waitFor(() => {
            expect(result.current.classLiveSessions).toEqual([
                expect.objectContaining({
                    code: 'LIVE123',
                    status: 'waiting',
                    title: 'Live IELTS Reading',
                }),
            ]);
        });

        act(() => {
            sessionCallbacks.LIVE123?.({
                createdAt: 100,
                status: 'in-progress',
                mode: 'test',
                testTitle: 'Live IELTS Reading',
            });
        });

        await waitFor(() => {
            expect(result.current.classLiveSessions[0]).toEqual(
                expect.objectContaining({
                    code: 'LIVE123',
                    status: 'in-progress',
                }),
            );
        });

        act(() => {
            sessionCallbacks.LIVE123?.({
                createdAt: 100,
                status: 'completed',
                mode: 'test',
                testTitle: 'Live IELTS Reading',
            });
        });

        await waitFor(() => {
            expect(result.current.classLiveSessions).toEqual([]);
        });
    });
});

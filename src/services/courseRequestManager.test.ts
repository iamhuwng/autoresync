import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createCourseRequest,
    getRequestsByTeacher,
    processCourseRequest,
    approveCourseRequest,
    cleanupExpiredRequests
} from './courseRequestManager';
import { get, set, ref, push, query, update } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { notifyCommittedEvent } from './notificationProducerClient';

vi.mock('firebase/database');
vi.mock('./firebase', () => ({ database: {} }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ currentUser: { uid: 't1', getIdToken: vi.fn().mockResolvedValue('teacher-token') } })) }));
vi.mock('./notificationProducerClient', () => ({ notifyCommittedEvent: vi.fn().mockResolvedValue({ status: 'written', delivered: 1 }) }));

describe('courseRequestManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (get as any).mockReset().mockResolvedValue({ exists: () => false, val: () => null });
        (ref as any).mockReturnValue({});
        (push as any).mockReturnValue({ key: 'req_123' });
    });

    describe('createCourseRequest', () => {
        it('should create a new join request with 7-day expiration', async () => {
            (get as any).mockResolvedValue({ exists: () => false }); // No pending

            const result = await createCourseRequest(
                's1', 'Student A', 'c1', 'Course A', 't1', 'join'
            );

            expect(result.success).toBe(true);
            expect(result.requestId).toBe('req_123');
            expect(set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                studentId: 's1',
                type: 'join',
                status: 'pending',
                expiresAt: expect.any(Number)
            }));
        });

        it('should prevent multiple pending requests of same type', async () => {
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => ({ req1: { courseId: 'c1', type: 'join', status: 'pending' } })
            });

            const result = await createCourseRequest(
                's1', 'Student A', 'c1', 'Course A', 't1', 'join'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('already have a pending join request');
        });
    });

    describe('getRequestsByTeacher', () => {
        it('should return sorted requests for a teacher', async () => {
            const mockData = {
                r1: { teacherId: 't1', requestedAt: 1000 },
                r2: { teacherId: 't1', requestedAt: 2000 }
            };
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockData
            });

            const results = await getRequestsByTeacher('t1');
            expect(results).toHaveLength(2);
            expect(results[0].requestedAt).toBe(2000); // Descending
        });
    });

    describe('processCourseRequest', () => {
        it('saves a pending decision before dispatch and does not dispatch a failed save', async () => {
            (get as any).mockResolvedValue({ exists: () => true, val: () => ({
                status: 'pending', type: 'join', expiresAt: Date.now() + 60_000,
            }) });
            vi.mocked(notifyCommittedEvent).mockReturnValueOnce(new Promise(() => {}));
            const result = await processCourseRequest('req1', 'denied', 't1');
            expect(result.success).toBe(true);
            expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                status: 'denied', processedBy: 't1', processedAt: expect.any(Number),
            }));
            expect(notifyCommittedEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventKind: 'course-request-decided', requestId: 'req1', decision: 'denied', occurredAt: expect.any(Number),
            }));
            expect(vi.mocked(update).mock.invocationCallOrder[0]).toBeLessThan(
                vi.mocked(notifyCommittedEvent).mock.invocationCallOrder[0]!,
            );
            vi.mocked(notifyCommittedEvent).mockClear();
            vi.mocked(update).mockRejectedValueOnce(new Error('denied'));
            expect((await processCourseRequest('req1', 'denied', 't1')).success).toBe(false);
            expect(notifyCommittedEvent).not.toHaveBeenCalled();
        });

        it('rejects a stale request or actor mismatch before writing', async () => {
            (get as any).mockResolvedValue({ exists: () => true, val: () => ({
                status: 'denied', type: 'join', expiresAt: Date.now() + 60_000,
            }) });
            expect((await processCourseRequest('req1', 'approved', 't1')).success).toBe(false);
            vi.mocked(getAuth).mockReturnValueOnce({ currentUser: { uid: 'other' } } as any);
            expect((await processCourseRequest('req1', 'approved', 't1')).success).toBe(false);
            expect(update).not.toHaveBeenCalled();
        });
    });

    it('approves only after the notification authority confirms the canonical Course transition', async () => {
        vi.stubEnv('VITE_COURSE_ENROLLMENT_APPROVAL_URL', 'https://course-authority.example/course-enrollment-approval');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'transitioned' })));
        const serverProcessedAt = 1_735_000_000_123;
        (get as any).mockResolvedValue({ val: () => ({
            id: 'req1', type: 'join', status: 'approved', processedBy: 't1', processedAt: serverProcessedAt,
        }) });
        const result = await approveCourseRequest('req1', 't1');
        expect(result.success).toBe(true);
        expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/course-enrollment-approval$/u), expect.objectContaining({
            method: 'POST', body: expect.stringMatching(/"requestId":"req1"/u),
        }));
        await vi.waitFor(() => expect(notifyCommittedEvent).toHaveBeenCalledWith({
            eventKind: 'course-request-decided', requestId: 'req1', decision: 'approved', occurredAt: serverProcessedAt,
        }));
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('recovers a committed approval after an ambiguous response using canonical source time', async () => {
        vi.stubEnv('VITE_COURSE_ENROLLMENT_APPROVAL_URL', 'https://course-authority.example/course-enrollment-approval');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'course_request_unavailable' }, { status: 503 })));
        const serverProcessedAt = 1_735_000_111_456;
        (get as any).mockResolvedValue({ val: () => ({
            id: 'req1', type: 'unenroll', status: 'approved', processedBy: 't1', processedAt: serverProcessedAt,
        }) });
        await expect(approveCourseRequest('req1', 't1')).resolves.toEqual({ success: true });
        await vi.waitFor(() => expect(notifyCommittedEvent).toHaveBeenCalledWith({
            eventKind: 'course-request-decided', requestId: 'req1', decision: 'approved', occurredAt: serverProcessedAt,
        }));
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('keeps confirmed approval success when detached canonical notice source read fails', async () => {
        vi.stubEnv('VITE_COURSE_ENROLLMENT_APPROVAL_URL', 'https://course-authority.example/course-enrollment-approval');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'transitioned' })));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        (get as any).mockRejectedValueOnce(new Error('temporary read failure'));
        await expect(approveCourseRequest('req1', 't1')).resolves.toEqual({ success: true });
        await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
            'course_approval_notification_detached_unknown', { requestId: 'req1' },
        ));
        warn.mockRestore();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('does not use the general notification command host when no Course authority URL is configured', async () => {
        vi.stubEnv('VITE_COURSE_ENROLLMENT_APPROVAL_URL', '');
        const fetchImpl = vi.fn();
        vi.stubGlobal('fetch', fetchImpl);
        const result = await approveCourseRequest('req1', 't1');
        expect(result.success).toBe(false);
        expect(result.error).toContain('course_enrollment_approval_not_configured');
        expect(fetchImpl).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    describe('cleanupExpiredRequests', () => {
        it('should mark old pending requests as expired', async () => {
            const pastTime = Date.now() - 1000;
            const mockData = {
                r_old: { status: 'pending', expiresAt: pastTime }
            };
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockData
            });

            const expiredCount = await cleanupExpiredRequests();
            expect(expiredCount).toBe(1);
            expect(update).toHaveBeenCalledWith(expect.anything(), {
                'r_old/status': 'expired'
            });
        });
    });
});

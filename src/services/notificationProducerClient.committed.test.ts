import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyCommittedEvent } from './notificationProducerClient';

const eventId = '00000000-0000-4000-8000-000000000123';
const foundation = vi.hoisted(() => ({ actor: 'teacher-1', token: vi.fn(), get: vi.fn(), update: vi.fn(), report: vi.fn(), authority: vi.fn(), restore: vi.fn(), writing: vi.fn() }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: foundation.actor, getIdToken: foundation.token } }) }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path?: string) => path || '', get: foundation.get, update: foundation.update }));
vi.mock('./firebase', () => ({ database: {} }));
vi.mock('./restoreGuard', () => ({ isRestoreInProgress: foundation.restore }));
vi.mock('./reportingService', () => ({ reportingService: { reportNotificationFailure: foundation.report } }));
vi.mock('./feedbackService', () => ({ getAuthorizedTeacherResult: foundation.authority }));
vi.mock('./writingNotificationClient', () => ({ notifyWritingCommitted: foundation.writing }));

beforeEach(() => {
    vi.clearAllMocks();
    foundation.actor = 'teacher-1';
    foundation.token.mockResolvedValue('token');
    foundation.update.mockResolvedValue(undefined);
    foundation.get.mockResolvedValue({ val: () => ({ resultId: 'result-1', studentId: 'student-1', submittedAt: 123,
        visibility: { contextType: 'class_session', sourceType: 'session' } }) });
    foundation.restore.mockResolvedValue(false);
    foundation.authority.mockResolvedValue({ result: {
        resultId: 'result-1', studentId: 'student-1', feedbackRevision: 1, markingStatus: 'reviewed',
        reviewNotificationEventId: eventId, reviewedBy: 'teacher-1', reviewedAt: 124,
        feedbackHistory: { [eventId]: { eventId, resultId: 'result-1', studentId: 'student-1', teacherId: 'teacher-1',
            type: 'overall', timestamp: 123, expectedRevision: 0, revision: 1 } },
    } });
    foundation.writing.mockResolvedValue({ status: 'written', delivered: 1, failed: 0, unknown: 0, unattempted: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('feedback and review committed port', () => {

    it('writes one fixed canonical student completion notice; replay excludes read', async () => {
        foundation.actor = 'student-1';
        const event = { eventKind: 'result-completed', resultId: 'result-1' } as const;
        await expect(notifyCommittedEvent(event)).resolves.toMatchObject({ status: 'written', delivered: 1 });
        await expect(notifyCommittedEvent(event)).resolves.toMatchObject({ status: 'written', delivered: 1 });
        const prefix = 'notifications/student-1/ordinary_complete_result-1';
        expect(foundation.update.mock.calls[0]![1]).toEqual({ [`${prefix}/id`]: 'ordinary_complete_result-1',
            [`${prefix}/type`]: 'success', [`${prefix}/title`]: 'Test Complete',
            [`${prefix}/message`]: 'You completed a test. View your result.', [`${prefix}/createdAt`]: 123,
            [`${prefix}/link`]: '/result/result-1', [`${prefix}/metadata`]: { eventKind: 'ordinary-result-completed', resultId: 'result-1' } });
        expect(foundation.update.mock.calls[1]![1]).toEqual(foundation.update.mock.calls[0]![1]);
        expect(foundation.authority).not.toHaveBeenCalled();
    });

    it('holds foreign completion and reports rejected writes without rejecting product caller', async () => {
        foundation.get.mockResolvedValueOnce({ val: () => ({ resultId: 'result-1', studentId: 'student-1', submittedAt: 123,
            visibility: { contextType: 'homework' } }) });
        await expect(notifyCommittedEvent({ eventKind: 'result-completed', resultId: 'result-1' }))
            .resolves.toMatchObject({ status: 'failed', unattempted: 1, code: 'completion_context_unqualified' });
        expect(foundation.update).not.toHaveBeenCalled();
        foundation.actor = 'student-1';
        foundation.update.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
        await expect(notifyCommittedEvent({ eventKind: 'result-completed', resultId: 'result-1' }))
            .resolves.toMatchObject({ status: 'failed', failed: 1 });
        expect(foundation.report).toHaveBeenCalledWith(expect.objectContaining({ action: 'notification_delivery_failed', route: 'rtdb', failed: 1 }));
    });

    it('bounds pending completion source reads and prevents late writes', async () => {
        vi.useFakeTimers();
        let finish!: (value: unknown) => void;
        foundation.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const pending = notifyCommittedEvent({ eventKind: 'result-completed', resultId: 'result-1' });
        await vi.advanceTimersByTimeAsync(15_000);
        await expect(pending).resolves.toMatchObject({ status: 'failed', unattempted: 1, code: 'notification_timeout' });
        finish({ val: () => ({ resultId: 'result-1', studentId: 'student-1', submittedAt: 123 }) });
        await vi.advanceTimersByTimeAsync(0);
        expect(foundation.update).not.toHaveBeenCalled();
    });
    it('writes source-proven feedback to the recipient inbox without resetting read state on replay', async () => {
        const event = { eventKind: 'feedback-saved', resultId: 'result-1', eventId } as const;
        await expect(notifyCommittedEvent(event)).resolves.toMatchObject({ status: 'written', delivered: 1 });
        await expect(notifyCommittedEvent(event)).resolves.toMatchObject({ status: 'written', delivered: 1 });
        expect(foundation.authority).toHaveBeenCalledWith('result-1', 'teacher-1');
        const patch = foundation.update.mock.calls[0]![1];
        const prefix = `notifications/student-1/ordinary_feedback_result-1_${eventId}`;
        expect(patch).toMatchObject({ [`${prefix}/id`]: `ordinary_feedback_result-1_${eventId}`,
            [`${prefix}/createdAt`]: 123, [`${prefix}/link`]: '/result/result-1' });
        expect(patch[`${prefix}/read`]).toBeUndefined();
        expect(foundation.update.mock.calls[1]![1]).toEqual(patch);
    });

    it('rejects an unproven feedback occurrence before inbox writes', async () => {
        foundation.authority.mockResolvedValue({ result: { studentId: 'student-1', feedbackRevision: 1, feedbackHistory: {} } });
        await expect(notifyCommittedEvent({ eventKind: 'feedback-saved', resultId: 'result-1', eventId }))
            .resolves.toMatchObject({ status: 'failed', unattempted: 1, code: 'feedback_occurrence_unproven' });
        expect(foundation.update).not.toHaveBeenCalled();
        expect(foundation.report).toHaveBeenCalledWith(expect.objectContaining({ action: 'saveFeedback', route: 'rtdb', unattempted: 1 }));
    });

    it('bounds a hung authority read and prevents its late completion from writing', async () => {
        vi.useFakeTimers();
        let finish!: (value: unknown) => void;
        foundation.authority.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const pending = notifyCommittedEvent({ eventKind: 'feedback-saved', resultId: 'result-1', eventId });
        await vi.advanceTimersByTimeAsync(15_000);
        await expect(pending).resolves.toMatchObject({ status: 'failed', unattempted: 1, code: 'notification_timeout' });
        finish({ result: {} });
        await vi.advanceTimersByTimeAsync(0);
        expect(foundation.update).not.toHaveBeenCalled();
        expect(foundation.report).toHaveBeenCalledOnce();
    });

    it('coalesces an active feedback occurrence and rejects an actor change', async () => {
        vi.useFakeTimers();
        foundation.update.mockReturnValueOnce(new Promise(() => {}));
        const event = { eventKind: 'feedback-saved', resultId: 'result-1', eventId } as const;
        const pending = notifyCommittedEvent(event);
        expect(notifyCommittedEvent(event)).toBe(pending);
        await vi.advanceTimersByTimeAsync(0);
        foundation.actor = 'teacher-2';
        await expect(notifyCommittedEvent(event)).resolves.toMatchObject({ status: 'failed', unattempted: 1, code: 'notification_actor_changed' });
        await vi.advanceTimersByTimeAsync(15_000);
        await expect(pending).resolves.toMatchObject({ status: 'unknown', unknown: 1 });
        expect(foundation.update).toHaveBeenCalledOnce();
    });

    it('writes the canonical review occurrence through RTDB and preserves read on replay', async () => {
        const network = vi.spyOn(globalThis, 'fetch');
        const event = { eventKind: 'result-reviewed', resultId: 'result-1', eventId } as const;
        await expect(notifyCommittedEvent(event)).resolves.toMatchObject({ status: 'written', delivered: 1 });
        await expect(notifyCommittedEvent(event)).resolves.toMatchObject({ status: 'written', delivered: 1 });
        const patch = foundation.update.mock.calls[0]![1];
        const prefix = `notifications/student-1/ordinary_review_result-1_${eventId}`;
        expect(patch).toEqual({ [`${prefix}/id`]: `ordinary_review_result-1_${eventId}`, [`${prefix}/type`]: 'success',
            [`${prefix}/title`]: 'Test Reviewed', [`${prefix}/message`]: 'Your teacher reviewed your result. View your score.',
            [`${prefix}/createdAt`]: 124, [`${prefix}/link`]: '/result/result-1',
            [`${prefix}/metadata`]: { eventKind: 'ordinary-result-reviewed', resultId: 'result-1', eventId } });
        expect(patch[`${prefix}/read`]).toBeUndefined();
        expect(foundation.update.mock.calls[1]![1]).toEqual(patch);
        expect(network).not.toHaveBeenCalled();
    });

    it.each(['resultId', 'studentId', 'markingStatus', 'reviewNotificationEventId', 'reviewedBy', 'reviewedAt'])('rejects a forged review %s before inbox writes', async field => {
        foundation.authority.mockResolvedValue({ result: { resultId: 'result-1', studentId: 'student-1', markingStatus: 'reviewed',
            reviewNotificationEventId: eventId, reviewedBy: 'teacher-1', reviewedAt: 124, [field]: field === 'reviewedAt' ? 0 : '../forged' } });
        await expect(notifyCommittedEvent({ eventKind: 'result-reviewed', resultId: 'result-1', eventId }))
            .resolves.toMatchObject({ status: 'failed', unattempted: 1, code: 'review_occurrence_unproven' });
        expect(foundation.update).not.toHaveBeenCalled();
    });

    it('bounds and reports a pending review inbox write without retrying', async () => {
        vi.useFakeTimers();
        foundation.update.mockReturnValueOnce(new Promise(() => {}));
        const pending = notifyCommittedEvent({ eventKind: 'result-reviewed', resultId: 'result-1', eventId });
        await vi.advanceTimersByTimeAsync(15_000);
        await expect(pending).resolves.toMatchObject({ status: 'unknown', unknown: 1, code: 'notification_timeout' });
        expect(foundation.update).toHaveBeenCalledOnce();
        expect(foundation.report).toHaveBeenCalledWith(expect.objectContaining({ action: 'markAsReviewed', route: 'rtdb', unknown: 1 }));
    });

    it('reports a rejected review inbox write without rejecting the caller', async () => {
        foundation.update.mockRejectedValueOnce(new Error('permission denied'));
        await expect(notifyCommittedEvent({ eventKind: 'result-reviewed', resultId: 'result-1', eventId }))
            .resolves.toMatchObject({ status: 'failed', failed: 1, code: 'permission denied' });
        expect(foundation.report).toHaveBeenCalledWith(expect.objectContaining({ action: 'markAsReviewed', route: 'rtdb', failed: 1 }));
    });

    it('skips delivery during restore and rejects invalid identity before sending', async () => {
        const network = vi.spyOn(globalThis, 'fetch');
        foundation.restore.mockResolvedValueOnce(true);
        await expect(notifyCommittedEvent({ eventKind: 'result-reviewed', resultId: 'result-1', eventId })).resolves.toMatchObject({ status: 'skipped', code: 'restore_in_progress' });
        await expect(notifyCommittedEvent({ eventKind: 'result-reviewed', resultId: 'result-1', eventId: '../x' })).resolves.toMatchObject({ status: 'failed', unattempted: 1, code: 'notification_event_invalid' });
        expect(network).not.toHaveBeenCalled();
    });
});

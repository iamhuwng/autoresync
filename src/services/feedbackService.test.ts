import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, get, update } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { notifyCommittedEvent } from './notificationProducerClient';
import { verifyHomeworkResultAuthority } from './homeworkResultAuthorityClient';

import {
    saveQuestionFeedback,
    getQuestionFeedback,
    getAllQuestionFeedback,
    saveOverallFeedback,
    getOverallFeedback,
    getFeedbackHistory,
    deleteQuestionFeedback,
    deleteOverallFeedback,
    canTeacherEditFeedback,
    bulkSaveQuestionFeedback,
    type QuestionFeedback,
    type OverallFeedback,
    type FeedbackHistoryEntry
} from './feedbackService';

// Mock Firebase
vi.mock('firebase/database');
vi.mock('firebase/auth', () => ({ getAuth: vi.fn() }));
vi.mock('./notificationProducerClient', () => ({ notifyCommittedEvent: vi.fn() }));
vi.mock('./homeworkResultAuthorityClient', () => ({ verifyHomeworkResultAuthority: vi.fn() }));
vi.mock('@/services/firebase', () => ({
    database: {}
}));

describe('feedbackService', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(get).mockResolvedValue({
            exists: () => false,
            val: () => null
        } as any);
    });



    describe('getQuestionFeedback', () => {
        it('should return question feedback if it exists', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            const mockFeedback: QuestionFeedback = {
                questionId: 'q1',
                feedback: 'Well done!',
                updatedAt: Date.now(),
                updatedBy: 'teacher456',
                teacherName: 'Mr. Smith'
            };

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => mockFeedback
            } as any);

            const result = await getQuestionFeedback('result123', 'q1');

            expect(result).toEqual({
                ...mockFeedback,
                updatedById: 'teacher456',
                updatedByName: 'Mr. Smith',
            });
        });

        it('should return null if feedback does not exist', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getQuestionFeedback('result123', 'q1');

            expect(result).toBeNull();
        });

        it('should return null if parameters are missing', async () => {
            const result1 = await getQuestionFeedback('', 'q1');
            const result2 = await getQuestionFeedback('result123', '');

            expect(result1).toBeNull();
            expect(result2).toBeNull();
        });

        it('should fall back to canonical feedback when legacy data is absent', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockImplementation((_database, path) => ({ path } as any));
            mockGet
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        questionResults: [
                            { questionNumber: 1, teacherFeedback: 'Canonical feedback' }
                        ],
                        feedbackUpdatedAt: 123,
                        feedbackUpdatedBy: 'Ms. Nguyen'
                    })
                } as any);

            const result = await getQuestionFeedback('result123', '1');

            expect(result).toEqual({
                questionId: '1',
                feedback: 'Canonical feedback',
                updatedAt: 123,
                updatedBy: 'Ms. Nguyen',
                updatedById: 'Ms. Nguyen',
                updatedByName: 'Ms. Nguyen',
                teacherName: 'Ms. Nguyen'
            });
        });
    });

    describe('getAllQuestionFeedback', () => {
        it('should return all question feedback for a result', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            const mockFeedbackMap = {
                q1: { questionId: 'q1', feedback: 'Good', updatedAt: Date.now(), updatedBy: 'teacher456' },
                q2: { questionId: 'q2', feedback: 'Excellent', updatedAt: Date.now(), updatedBy: 'teacher456' }
            };

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => mockFeedbackMap
            } as any);

            const result = await getAllQuestionFeedback('result123');

            expect(result).toEqual({
                q1: {
                    ...mockFeedbackMap.q1,
                    updatedById: 'teacher456',
                },
                q2: {
                    ...mockFeedbackMap.q2,
                    updatedById: 'teacher456',
                },
            });
            expect(Object.keys(result)).toHaveLength(2);
        });

        it('should return empty object if no feedback exists', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getAllQuestionFeedback('result123');

            expect(result).toEqual({});
        });
    });



    describe('getOverallFeedback', () => {
        it('keeps older string feedback readable without authority capture', async () => {
            vi.mocked(get).mockResolvedValueOnce({ exists: () => true, val: () => 'Old feedback' } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => ({ feedbackUpdatedAt: 123, feedbackUpdatedByTeacherId: 'teacher456' }) } as any);
            expect(await getOverallFeedback('result123')).toMatchObject({ feedback: 'Old feedback', updatedAt: 123, updatedById: 'teacher456' });
            expect(notifyCommittedEvent).not.toHaveBeenCalled();
        });
        it('should return overall feedback if it exists', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            const mockFeedback: OverallFeedback = {
                feedback: 'Great job overall!',
                updatedAt: Date.now(),
                updatedBy: 'teacher456',
                teacherName: 'Mr. Smith'
            };

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => mockFeedback
            } as any);

            const result = await getOverallFeedback('result123');

            expect(result).toEqual({
                ...mockFeedback,
                updatedById: 'teacher456',
                updatedByName: 'Mr. Smith',
            });
        });

        it('should fall back to canonical overall feedback when legacy data is absent', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockImplementation((_database, path) => ({ path } as any));
            mockGet
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        overallFeedback: 'Canonical overall feedback',
                        feedbackUpdatedAt: 456,
                        feedbackUpdatedBy: 'Mr. Smith'
                    })
                } as any);

            const result = await getOverallFeedback('result123');

            expect(result).toEqual({
                feedback: 'Canonical overall feedback',
                updatedAt: 456,
                updatedBy: 'Mr. Smith',
                updatedById: 'Mr. Smith',
                updatedByName: 'Mr. Smith',
                teacherName: 'Mr. Smith'
            });
        });

        it('should return null if feedback does not exist', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getOverallFeedback('result123');

            expect(result).toBeNull();
        });
    });

    describe('getFeedbackHistory', () => {
        it('should return feedback history sorted by timestamp descending', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            const mockHistory = {
                entry1: { timestamp: 1000, teacherId: 'teacher456', type: 'question', questionId: 'q1', feedback: 'First' },
                entry2: { timestamp: 3000, teacherId: 'teacher456', type: 'overall', feedback: 'Third' },
                entry3: { timestamp: 2000, teacherId: 'teacher456', type: 'question', questionId: 'q2', feedback: 'Second' }
            };

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => mockHistory
            } as any);

            const result = await getFeedbackHistory('result123');

            expect(result).toHaveLength(3);
            expect(result[0].timestamp).toBe(3000); // Newest first
            expect(result[1].timestamp).toBe(2000);
            expect(result[2].timestamp).toBe(1000);
        });

        it('should return empty array if no history exists', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getFeedbackHistory('result123');

            expect(result).toEqual([]);
        });
    });








});

describe('app-owned feedback commits', () => {
    const eventId = '00000000-0000-4000-8000-000000000123';
    let rows: Record<string, any>;
    let result: any;
    beforeEach(() => {
        vi.clearAllMocks();
        result = { resultId: 'result123', studentId: 'student1', testId: 'test1', testType: 'homework', testSkill: 'writing',
            isGuest: false, submittedAt: 123, createdAt: 123, writingData: { submissionId: 'result123' },
            context: { type: 'homework', source: { type: 'homework', id: 'hw1', submissionId: 'result123' }, assignment: { homeworkId: 'hw1' } },
            visibility: { ownershipResolved: true, visibilityOwnerTeacherId: 'teacher456', contextType: 'homework',
                sourceType: 'homework', sourceId: 'hw1', homeworkId: 'hw1' },
            questionResults: [{ questionId: 'q1', questionNumber: 1, score: 3 }, { questionId: 'q2', questionNumber: 2, score: 4 }],
        };
        rows = { 'test_results/result123': result, 'users/teacher456': { role: 'teacher', displayName: 'Verified Teacher' },
            'student_teacher_links/teacher456/student1': false,
            'result_notification_authority/result123': { schemaVersion: 2, resultId: 'result123', studentId: 'student1', ownerTeacherId: 'teacher456',
                contextType: 'homework', homeworkId: 'hw1', homeworkSubmissionId: 'hws1', testId: 'test1', submittedAt: 123,
                writingSubmittedAt: 123, homeworkSubmittedAt: 123, sourceRulesetName: 'projects/test/rulesets/sealed', sourceRulesCutoff: '2026-09-30T00:00:00Z' },
        };
        vi.mocked(getAuth).mockReturnValue({ currentUser: { uid: 'teacher456' } } as any);
        vi.mocked(ref).mockImplementation((_db, path) => (path ?? '__root__') as any);
        vi.mocked(get).mockImplementation(async (path) => ({ exists: () => rows[String(path)] != null, val: () => rows[String(path)] ?? null }) as any);
        vi.mocked(notifyCommittedEvent).mockResolvedValue({ status: 'failed', delivered: 0, failed: 1, unknown: 0, unattempted: 0, code: 'offline' });
        vi.mocked(verifyHomeworkResultAuthority).mockResolvedValue({ status: 'held', code: 'homework_authority_not_qualified' });
        vi.mocked(update).mockImplementation(async (_ref, writes) => {
            for (const [path, value] of Object.entries(writes)) {
                if (!path.startsWith('test_results/result123/')) { rows[path] = value; continue; }
                const parts = path.replace('test_results/result123/', '').split('/');
                let parent = result;
                for (const key of parts.slice(0, -1)) parent = parent[key] ??= {};
                if (value === null) delete parent[parts.at(-1)!]; else parent[parts.at(-1)!] = value;
            }
        });
    });

    it('atomically commits exact feedback, mirror and history; notice failure leaves save successful', async () => {
        await saveQuestionFeedback('result123', 'q1', '  Exact text  ', 'teacher456', 'Caller Name', { eventId, expectedRevision: 0 });
        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith('__root__', expect.objectContaining({
            'test_results/result123/questionResults/0/teacherFeedback': 'Exact text',
            'test_results/result123/questionFeedback/q1': expect.objectContaining({ feedback: 'Exact text', eventId, updatedBy: 'teacher456', updatedByName: 'Verified Teacher' }),
            [`test_results/result123/feedbackHistory/${eventId}`]: expect.objectContaining({ eventId, feedback: 'Exact text', teacherId: 'teacher456', studentId: 'student1', resultId: 'result123', questionId: 'q1', expectedRevision: 0, revision: 1 }),
            'test_results/result123/feedbackMutation': { type: 'question', questionId: 'q1', questionIndex: '0', eventId, expectedRevision: 0, revision: 1 },
        }));
        expect(result.questionResults[0].score).toBe(3);
        expect(notifyCommittedEvent).toHaveBeenCalledWith({ eventKind: 'feedback-saved', resultId: 'result123', eventId });
        await saveQuestionFeedback('result123', 'q1', 'Exact text', 'teacher456', undefined, { eventId });
        expect(update).toHaveBeenCalledTimes(1);
        await expect(saveQuestionFeedback('result123', 'q1', 'Changed', 'teacher456', undefined, { eventId })).rejects.toThrow('event conflict');
        await expect(saveOverallFeedback('result123', 'Stale', 'teacher456', undefined, { expectedRevision: 0 })).rejects.toThrow('revision conflict');
    });

    it('returns after a committed save while notice delivery is still pending', async () => {
        vi.mocked(notifyCommittedEvent).mockReturnValue(new Promise(() => {}));
        await expect(saveOverallFeedback('result123', 'Saved', 'teacher456', undefined, { eventId }))
            .resolves.toBeUndefined();
        expect(update).toHaveBeenCalledOnce();
        expect(notifyCommittedEvent).toHaveBeenCalledWith({ eventKind: 'feedback-saved', resultId: 'result123', eventId });
    });

    it('preserves revisions/history through edit and delete', async () => {
        await saveOverallFeedback('result123', 'First', 'teacher456', undefined, { eventId });
        const later = '00000000-0000-4000-8000-000000000124';
        await saveOverallFeedback('result123', 'Second', 'teacher456', undefined, { eventId: later, expectedRevision: 1 });
        await deleteOverallFeedback('result123');
        expect(result.overallFeedback).toBeUndefined();
        expect(result.feedbackRevision).toBe(3);
        expect(result.feedbackHistory[eventId].feedback).toBe('First');
        expect(result.feedbackHistory[later].feedback).toBe('Second');
        expect(rows[`feedback_notification_intents/${eventId}`]).toBeUndefined();
        expect(Object.keys(vi.mocked(update).mock.calls[2]![1])).not.toContain(`test_results/result123/feedbackHistory/${eventId}`);
    });

    it('deletes question mirror atomically and retains another overall feedback', async () => {
        await saveQuestionFeedback('result123', 'q1', 'Question', 'teacher456');
        await saveOverallFeedback('result123', 'Overall', 'teacher456');
        await deleteQuestionFeedback('result123', 'q1');
        expect(result.questionFeedback.q1).toBeUndefined();
        expect(result.questionResults[0].teacherFeedback).toBeUndefined();
        expect(result.hasFeedback).toBe(true);
        expect(Object.keys(result.feedbackHistory)).toHaveLength(2);
    });

    it('holds absent authority before product writes when verifier is not qualified', async () => {
        delete rows['result_notification_authority/result123'];
        await expect(saveOverallFeedback('result123', 'Text', 'teacher456')).rejects.toThrow('homework_authority_not_qualified');
        expect(verifyHomeworkResultAuthority).toHaveBeenCalledExactlyOnceWith('result123');
        expect(notifyCommittedEvent).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it.each(['actor', 'capture', 'v1', 'solo', 'identity'])('denies unproven %s before writes', async (kind) => {
        if (kind === 'actor') rows['users/teacher456'].role = 'student';
        if (kind === 'v1') rows['result_notification_authority/result123'].schemaVersion = 1;
        if (kind === 'capture') rows['result_notification_authority/result123'].ownerTeacherId = 'other';
        if (kind === 'solo') result.visibility.contextType = 'solo_practice';
        if (kind === 'identity') result.context.source.submissionId = 'other';
        await expect(saveOverallFeedback('result123', 'Text', 'teacher456')).rejects.toThrow();
        expect(await canTeacherEditFeedback('result123', 'teacher456')).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });

    it('rejects a spoofed actor and invalid text/question; serializes bulk revisions', async () => {
        await expect(saveOverallFeedback('result123', 'Text', 'other')).rejects.toThrow('unauthenticated');
        await expect(saveOverallFeedback('result123', ' ', 'teacher456')).rejects.toThrow('invalid');
        await expect(saveQuestionFeedback('result123', 'q9', 'Text', 'teacher456')).rejects.toThrow('not found');
        await bulkSaveQuestionFeedback('result123', { q1: 'First', q2: 'Second', q3: ' ' }, 'teacher456');
        expect(result.feedbackRevision).toBe(2);
    });
});

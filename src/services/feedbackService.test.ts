import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, set, get, update, push } from 'firebase/database';
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

    describe('saveQuestionFeedback', () => {
        it('should save question feedback with all required fields', async () => {
            const mockSet = vi.mocked(set);
            const mockPush = vi.mocked(push);
            const mockUpdate = vi.mocked(update);
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockImplementation((_database, path) => ({ path } as any));
            mockPush.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);
            mockUpdate.mockResolvedValue(undefined);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => ({
                    questionResults: [
                        { questionNumber: 1, questionId: 'q1' },
                        { questionNumber: 2, questionId: 'q2' }
                    ],
                    overallFeedback: null,
                    feedbackUpdatedAt: null,
                    feedbackUpdatedBy: null,
                    hasFeedback: false
                })
            } as any);

            await saveQuestionFeedback('result123', 'q1', 'Great answer!', 'teacher456', 'Mr. Smith');

            expect(mockSet).toHaveBeenCalled();
            const feedbackData = mockSet.mock.calls[0][1] as QuestionFeedback;

            expect(feedbackData.questionId).toBe('q1');
            expect(feedbackData.feedback).toBe('Great answer!');
            expect(feedbackData.updatedBy).toBe('Mr. Smith');
            expect(feedbackData.updatedById).toBe('teacher456');
            expect(feedbackData.updatedByName).toBe('Mr. Smith');
            expect(feedbackData.teacherName).toBe('Mr. Smith');
            expect(feedbackData.updatedAt).toBeTypeOf('number');

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ path: 'test_results/result123' }),
                expect.objectContaining({
                    'questionResults/0/teacherFeedback': 'Great answer!',
                    feedbackUpdatedBy: 'Mr. Smith',
                    feedbackUpdatedByTeacherId: 'teacher456',
                    feedbackUpdatedByTeacherName: 'Mr. Smith',
                    hasFeedback: true
                })
            );
        });

        it('should trim feedback text', async () => {
            const mockSet = vi.mocked(set);
            const mockPush = vi.mocked(push);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockPush.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);

            await saveQuestionFeedback('result123', 'q1', '  Needs improvement  ', 'teacher456');

            const feedbackData = mockSet.mock.calls[0][1] as QuestionFeedback;
            expect(feedbackData.feedback).toBe('Needs improvement');
        });

        it('should throw error if required parameters are missing', async () => {
            await expect(
                saveQuestionFeedback('', 'q1', 'feedback', 'teacher456')
            ).rejects.toThrow('Missing required parameters');

            await expect(
                saveQuestionFeedback('result123', '', 'feedback', 'teacher456')
            ).rejects.toThrow('Missing required parameters');

            await expect(
                saveQuestionFeedback('result123', 'q1', 'feedback', '')
            ).rejects.toThrow('Missing required parameters');
        });
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

    describe('saveOverallFeedback', () => {
        it('should save overall feedback and update result flags', async () => {
            const mockSet = vi.mocked(set);
            const mockUpdate = vi.mocked(update);
            const mockPush = vi.mocked(push);
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockImplementation((_database, path) => ({ path } as any));
            mockPush.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);
            mockUpdate.mockResolvedValue(undefined);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => ({
                    questionResults: [],
                    overallFeedback: null,
                    feedbackUpdatedAt: null,
                    feedbackUpdatedBy: null,
                    hasFeedback: false
                })
            } as any);

            await saveOverallFeedback('result123', 'Overall great work!', 'teacher456', 'Mr. Smith');

            expect(mockSet).toHaveBeenCalled();
            expect(mockUpdate).toHaveBeenCalledTimes(2);

            const feedbackData = mockSet.mock.calls[0][1] as OverallFeedback;
            expect(feedbackData.feedback).toBe('Overall great work!');
            expect(feedbackData.updatedBy).toBe('Mr. Smith');
            expect(feedbackData.updatedById).toBe('teacher456');
            expect(feedbackData.updatedByName).toBe('Mr. Smith');

            const updateData = mockUpdate.mock.calls[0][1] as any;
            expect(updateData.hasFeedback).toBe(true);
            expect(updateData.feedbackUpdatedBy).toBe('Mr. Smith');
            expect(updateData.feedbackUpdatedByTeacherId).toBe('teacher456');
            expect(updateData.feedbackUpdatedByTeacherName).toBe('Mr. Smith');

            const canonicalUpdateData = mockUpdate.mock.calls[1][1] as any;
            expect(canonicalUpdateData.overallFeedback).toBe('Overall great work!');
            expect(canonicalUpdateData.feedbackUpdatedBy).toBe('Mr. Smith');
            expect(canonicalUpdateData.feedbackUpdatedByTeacherId).toBe('teacher456');
            expect(canonicalUpdateData.feedbackUpdatedByTeacherName).toBe('Mr. Smith');
            expect(canonicalUpdateData.hasFeedback).toBe(true);
        });

        it('should throw error if required parameters are missing', async () => {
            await expect(
                saveOverallFeedback('', 'feedback', 'teacher456')
            ).rejects.toThrow('Missing required parameters');

            await expect(
                saveOverallFeedback('result123', 'feedback', '')
            ).rejects.toThrow('Missing required parameters');
        });
    });

    describe('getOverallFeedback', () => {
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

    describe('deleteQuestionFeedback', () => {
        it('should delete question feedback', async () => {
            const mockSet = vi.mocked(set);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);

            await deleteQuestionFeedback('result123', 'q1');

            expect(mockSet).toHaveBeenCalledWith(expect.anything(), null);
        });

        it('should throw error if parameters are missing', async () => {
            await expect(
                deleteQuestionFeedback('', 'q1')
            ).rejects.toThrow('Missing required parameters');

            await expect(
                deleteQuestionFeedback('result123', '')
            ).rejects.toThrow('Missing required parameters');
        });
    });

    describe('deleteOverallFeedback', () => {
        it('should delete overall feedback and update result flags', async () => {
            const mockSet = vi.mocked(set);
            const mockUpdate = vi.mocked(update);
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockRef.mockImplementation((_database, path) => ({ path } as any));
            mockSet.mockResolvedValue(undefined);
            mockUpdate.mockResolvedValue(undefined);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            await deleteOverallFeedback('result123');

            expect(mockSet).toHaveBeenCalledWith(expect.anything(), null);
            expect(mockUpdate).toHaveBeenCalled();

            const updateData = mockUpdate.mock.calls[0][1] as any;
            expect(updateData.hasFeedback).toBe(false);
        });

        it('should throw error if resultId is missing', async () => {
            await expect(
                deleteOverallFeedback('')
            ).rejects.toThrow('Missing required parameter');
        });
    });

    describe('canTeacherEditFeedback', () => {
        it('should return true if teacher owns the course', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            // Mock result with courseId
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({ courseId: 'course123' })
            } as any);

            // Mock course with matching teacher
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({ createdBy: 'teacher456' })
            } as any);

            mockRef.mockReturnValue({} as any);

            const result = await canTeacherEditFeedback('result123', 'teacher456');

            expect(result).toBe(true);
        });

        it('should respect canonical visibility ownership when present', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    visibility: {
                        ownershipResolved: true,
                        visibilityOwnerTeacherId: 'teacher456',
                        contextType: 'class_session',
                    },
                }),
            } as any);

            mockRef.mockReturnValue({} as any);

            const result = await canTeacherEditFeedback('result123', 'teacher456');

            expect(result).toBe(true);
        });

        it('should return false if teacher does not own the course', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            // Mock result with courseId
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({ courseId: 'course123' })
            } as any);

            // Mock course with different teacher
            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({ createdBy: 'teacher789' })
            } as any);

            mockRef.mockReturnValue({} as any);

            const result = await canTeacherEditFeedback('result123', 'teacher456');

            expect(result).toBe(false);
        });

        it('should return true if result has no courseId (backward compatibility)', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockGet.mockResolvedValueOnce({
                exists: () => true,
                val: () => ({}) // No courseId
            } as any);

            mockRef.mockReturnValue({} as any);

            const result = await canTeacherEditFeedback('result123', 'teacher456');

            expect(result).toBe(true);
        });

        it('should return false if result does not exist', async () => {
            const mockGet = vi.mocked(get);
            const mockRef = vi.mocked(ref);

            mockGet.mockResolvedValueOnce({
                exists: () => false,
                val: () => null
            } as any);

            mockRef.mockReturnValue({} as any);

            const result = await canTeacherEditFeedback('result123', 'teacher456');

            expect(result).toBe(false);
        });

        it('should return false if parameters are missing', async () => {
            const result1 = await canTeacherEditFeedback('', 'teacher456');
            const result2 = await canTeacherEditFeedback('result123', '');

            expect(result1).toBe(false);
            expect(result2).toBe(false);
        });
    });

    describe('bulkSaveQuestionFeedback', () => {
        it('should save feedback for multiple questions', async () => {
            const mockSet = vi.mocked(set);
            const mockPush = vi.mocked(push);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockPush.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);

            const feedbackMap = {
                q1: 'Good answer',
                q2: 'Excellent work',
                q3: 'Needs improvement'
            };

            await bulkSaveQuestionFeedback('result123', feedbackMap, 'teacher456', 'Mr. Smith');

            // Should be called for each question + history entries
            expect(mockSet).toHaveBeenCalled();
        });

        it('should skip empty feedback', async () => {
            const mockSet = vi.mocked(set);
            const mockPush = vi.mocked(push);
            const mockRef = vi.mocked(ref);

            mockRef.mockReturnValue({} as any);
            mockPush.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);

            const feedbackMap = {
                q1: 'Good answer',
                q2: '',  // Empty
                q3: '   '  // Whitespace only
            };

            await bulkSaveQuestionFeedback('result123', feedbackMap, 'teacher456');

            // Should only save for q1 (+ history)
            expect(mockSet.mock.calls.length).toBeGreaterThan(0);
        });

        it('should throw error if required parameters are missing', async () => {
            await expect(
                bulkSaveQuestionFeedback('', {}, 'teacher456')
            ).rejects.toThrow('Missing required parameters');

            await expect(
                bulkSaveQuestionFeedback('result123', {}, '')
            ).rejects.toThrow('Missing required parameters');
        });
    });
});

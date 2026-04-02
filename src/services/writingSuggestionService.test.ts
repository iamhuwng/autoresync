import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc, setDoc } from 'firebase/firestore';
import { aiService } from './ai/router.service';
import {
    getOrCreateWritingSuggestionCache,
    inferTask1SuggestionType,
    normalizeSuggestionTaskResult,
    resolveSuggestionAnchor,
    segmentEssayIntoSentences,
} from './writingSuggestionService';
import type { WritingSubmission, WritingSubmissionTask } from '../types/ielts-writing.types';

const { mockGetAIAvailability } = vi.hoisted(() => ({
    mockGetAIAvailability: vi.fn(),
}));

vi.mock('./firebase', () => ({
    firestore: {},
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_: unknown, ...segments: string[]) => segments.join('/')),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
}));

vi.mock('./draftCloudService', () => ({
    deepRemoveUndefined: vi.fn((value: unknown) => value),
}));

vi.mock('./restoreGuard', () => ({
    withRestoreGuard:
        (_serviceName: string, _safeReturn: unknown) =>
            (fn: (...args: any[]) => Promise<any>) =>
                fn,
}));

vi.mock('./ai/router.service', () => ({
    aiService: {
        generateStructuredJson: vi.fn(),
    },
}));

vi.mock('./ai-status.service', () => ({
    getAIAvailability: mockGetAIAvailability,
}));

function createTask(overrides: Partial<WritingSubmissionTask> = {}): WritingSubmissionTask {
    return {
        taskNumber: 1,
        taskType: 'bar-chart',
        promptText: 'Summarise the chart below.',
        wordMinimum: 150,
        essayText: 'The chart show a rise. It increase rapidly.',
        wordCount: 9,
        activeTimeSeconds: 600,
        ...overrides,
    };
}

function createSubmission(tasks: WritingSubmissionTask[]): WritingSubmission {
    return {
        id: 'submission-1',
        studentId: 'student-1',
        studentName: 'Student One',
        context: { type: 'live-session', assigningTeacherId: 'teacher-1', selectedTeacherId: 'teacher-1' },
        testMeta: { testId: 'test-1', testTitle: 'Mock', format: 'full-test', duration: 60 },
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        startedAt: Date.now(),
        markingStatus: 'pending-review',
        totalWordCount: tasks.reduce((sum, task) => sum + task.wordCount, 0),
        activeTimeSeconds: tasks.reduce((sum, task) => sum + task.activeTimeSeconds, 0),
        pasteAttemptCount: 0,
        tasks,
        grading: undefined,
        publishedGrading: undefined,
        gradingDraftMeta: undefined,
        annotations: [],
        auditTrail: [],
    } as WritingSubmission;
}

describe('writingSuggestionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAIAvailability.mockResolvedValue({
            available: true,
            geminiAvailable: true,
            groqAvailable: true,
            totalKeys: 1,
            benchedKeys: 0,
            checkedAt: Date.now(),
        });
    });

    it('segments essay text into sentences and resolves exact anchors', () => {
        const sentences = segmentEssayIntoSentences('The chart show a rise. It increase rapidly.');

        expect(sentences.map((sentence) => sentence.text)).toEqual([
            'The chart show a rise.',
            'It increase rapidly.',
        ]);
        expect(resolveSuggestionAnchor(sentences, 1, 'increase')).toEqual({ from: 26, to: 34 });
        expect(resolveSuggestionAnchor(sentences, 1, 'rapidly')).toEqual({ from: 35, to: 42 });
    });

    it('infers GeneralTraining Task 1 prompts from letter instructions', () => {
        expect(inferTask1SuggestionType(createTask({
            promptText: 'Write a letter to your friend explaining the situation.',
            essayText: 'Dear Anna,\nThank you for your letter.',
        }))).toBe('GeneralTraining');

        expect(inferTask1SuggestionType(createTask())).toBe('Academic');
    });

    it('drops duplicate and overlapping normalized suggestions', () => {
        const result = normalizeSuggestionTaskResult(
            createTask({ essayText: 'The chart show a rise. It increase rapidly.' }),
            {
                tasks: [
                    {
                        taskNumber: 1,
                        grammar: {
                            comments: [
                                {
                                    sentenceIndex: 0,
                                    anchorText: 'show',
                                    title: 'Verb agreement',
                                    reason: 'The singular subject needs the third-person verb form.',
                                    suggestedCommentText: 'Use the singular verb form here.',
                                },
                                {
                                    sentenceIndex: 0,
                                    anchorText: 'show',
                                    title: 'Duplicate',
                                    reason: 'Duplicate issue.',
                                    suggestedCommentText: 'Duplicate issue.',
                                },
                            ],
                            corrections: [
                                {
                                    sentenceIndex: 0,
                                    anchorText: 'show',
                                    title: 'Correct verb',
                                    reason: 'The verb should agree with the subject.',
                                    replacementText: 'shows',
                                },
                            ],
                        },
                        vocabularyExpression: {
                            comments: [],
                            corrections: [
                                {
                                    sentenceIndex: 1,
                                    anchorText: 'increase',
                                    title: 'Verb tense',
                                    reason: 'Use past tense for reported data.',
                                    replacementText: 'increased',
                                },
                            ],
                        },
                    },
                ],
            },
        );

        expect(result.grammar.comments).toHaveLength(1);
        expect(result.grammar.corrections).toHaveLength(0);
        expect(result.vocabularyExpression.corrections).toHaveLength(1);
        expect(result.vocabularyExpression.corrections[0]?.anchorText).toBe('increase');
    });

    it('reuses an existing cache without regenerating suggestions', async () => {
        vi.mocked(getDoc).mockResolvedValue({
            exists: () => true,
            data: () => ({
                submissionId: 'submission-1',
                status: 'ready',
                generatedAt: 100,
                updatedAt: 100,
                perTask: {},
                generatedFromEssayHashByTask: {},
            }),
        } as any);

        const result = await getOrCreateWritingSuggestionCache(createSubmission([createTask()]));

        expect(result.success).toBe(true);
        expect(result.success && result.data.status).toBe('ready');
        expect(aiService.generateStructuredJson).not.toHaveBeenCalled();
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('forces regeneration and persists the ready cache', async () => {
        vi.mocked(getDoc).mockResolvedValue({
            exists: () => false,
            data: () => undefined,
        } as any);
        vi.mocked(aiService.generateStructuredJson).mockResolvedValue({
            success: true,
            data: {
                tasks: [
                    {
                        taskNumber: 1,
                        grammar: {
                            comments: [
                                {
                                    sentenceIndex: 0,
                                    anchorText: 'show',
                                    title: 'Verb agreement',
                                    reason: 'The singular subject needs the third-person verb form.',
                                    suggestedCommentText: 'Use the singular verb form here.',
                                    categoryId: 'gra',
                                },
                            ],
                            corrections: [],
                        },
                        vocabularyExpression: {
                            comments: [],
                            corrections: [],
                        },
                    },
                ],
            },
        });

        const result = await getOrCreateWritingSuggestionCache(createSubmission([createTask()]), { force: true });

        expect(result.success).toBe(true);
        expect(aiService.generateStructuredJson).toHaveBeenCalledTimes(1);
        expect(setDoc).toHaveBeenCalledTimes(2);
        expect(result.success && result.data.status).toBe('ready');
        expect(result.success && result.data.perTask[1]?.grammar.comments[0]?.anchorText).toBe('show');
    });
});

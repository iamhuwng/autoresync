import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc, setDoc } from 'firebase/firestore';
import { aiService } from './ai/router.service';
import {
    getOrCreateWritingSuggestionCache,
    inferTask1SuggestionType,
    normalizeSuggestionTaskResult,
    resolveSuggestionAnchor,
    segmentEssayIntoSentences,
    updateWritingSuggestionReviewStatus,
} from './writingSuggestionService';
import type { WritingSubmission, WritingSubmissionTask, WritingSuggestionCacheDoc } from '../types/ielts-writing.types';

const { mockGetAIAvailability } = vi.hoisted(() => ({
    mockGetAIAvailability: vi.fn(),
}));

vi.mock('./firebase', () => ({
    firestore: {},
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((...segments: string[]) => segments.join('/')),
    doc: vi.fn((...segments: string[]) => segments.join('/')),
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
        generateWritingSuggestionBatch: vi.fn(),
    },
}));

vi.mock('./ai-status.service', () => ({
    getAIAvailability: mockGetAIAvailability,
}));

vi.mock('./ai/writingSuggestionKeyLease.service', () => ({
    acquireGeminiSuggestionKeyLeases: vi.fn().mockResolvedValue([]),
    getUsableGeminiSuggestionKeyCount: vi.fn().mockResolvedValue(0),
    releaseGeminiSuggestionKeyLeases: vi.fn(),
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
        totalElapsedTimeSeconds: tasks.reduce((sum, task) => sum + task.activeTimeSeconds, 0),
        pasteAttemptCount: 0,
        markingStatus: 'pending-review',
        tasks,
        grading: undefined,
        publishedGrading: undefined,
        gradingDraftMeta: undefined,
        annotations: [],
        auditTrail: [],
    } as WritingSubmission;
}

function createEssayHashForTest(essayText: string): string {
    let hash = 5381;
    for (let index = 0; index < essayText.length; index += 1) {
        hash = ((hash << 5) + hash) + essayText.charCodeAt(index);
        hash &= hash;
    }

    return `essay_${(hash >>> 0).toString(36)}`;
}

function createReadyCache(): WritingSuggestionCacheDoc {
    const normalized = normalizeSuggestionTaskResult(createTask(), {
        combined: [
            {
                sentenceIndex: 0,
                anchorText: 'show',
                title: 'Verb agreement',
                reason: 'Use the singular verb form.',
                focus: 'grammar',
                kind: 'correction',
                issueFamily: 'agreement',
                replacementText: 'shows',
                confidence: 92,
            },
        ],
    });
    const suggestion = normalized.taskResult.grammar.corrections[0]!;

    return {
        submissionId: 'submission-1',
        status: 'ready',
        generatedAt: 100,
        updatedAt: 100,
        perTask: {
            1: normalized.taskResult,
        },
        generatedFromEssayHashByTask: { 1: createEssayHashForTest(createTask().essayText) },
        reviewStateByTask: {
            1: {
                [suggestion.reviewKey]: 'pending',
            },
        },
        diagnosticsByTask: {
            1: normalized.diagnosticsByBucket,
        },
        runStateByTask: {
            1: {
                status: 'complete',
                updatedAt: 100,
                acceptedCount: 1,
                lastRunAcceptedCount: 1,
                lastRunHasMorePotential: false,
            },
        },
    };
}

describe('writingSuggestionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAIAvailability.mockResolvedValue({
            available: true,
            geminiAvailable: true,
            groqAvailable: true,
            totalKeys: 4,
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
    });

    it('infers GeneralTraining Task 1 prompts from letter instructions', () => {
        expect(inferTask1SuggestionType(createTask({
            promptText: 'Write a letter to your friend explaining the situation.',
            essayText: 'Dear Anna,\nThank you for your letter.',
        }))).toBe('GeneralTraining');

        expect(inferTask1SuggestionType(createTask())).toBe('Academic');
    });

    it('normalizes legacy raw findings into comment and correction buckets', () => {
        const normalized = normalizeSuggestionTaskResult(createTask(), {
            grammar: [
                {
                    sentenceIndex: 0,
                    anchorText: 'show',
                    title: 'Verb agreement',
                    reason: 'Use the singular verb form.',
                    replacementText: 'shows',
                },
            ],
            'vocabulary-expression': [
                {
                    sentenceIndex: 1,
                    anchorText: 'increase',
                    title: 'Verb choice',
                    reason: 'This is awkward for reported data.',
                },
            ],
        });

        expect(normalized.taskResult.grammar.corrections).toHaveLength(1);
        expect(normalized.taskResult.vocabularyExpression.comments).toHaveLength(1);
        expect(normalized.taskResult.grammar.corrections[0]?.issueFamily).toBe('agreement');
        expect(normalized.taskResult.vocabularyExpression.comments[0]?.issueFamily).toBe('word-choice');
    });

    it('reuses an existing cache for the active task without regenerating', async () => {
        vi.mocked(getDoc).mockResolvedValue({
            exists: () => true,
            data: () => createReadyCache(),
        } as any);

        const result = await getOrCreateWritingSuggestionCache(createSubmission([createTask()]), {
            taskNumber: 1,
        });

        expect(result.success).toBe(true);
        expect(aiService.generateWritingSuggestionBatch).not.toHaveBeenCalled();
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('generates suggestions for only the requested task and stores run state', async () => {
        vi.mocked(getDoc).mockResolvedValue({
            exists: () => false,
            data: () => undefined,
        } as any);
        vi.mocked(aiService.generateWritingSuggestionBatch).mockResolvedValue({
            success: true,
            data: {
                findings: [
                    {
                        sentenceIndex: 0,
                        anchorText: 'show',
                        title: 'Verb agreement',
                        reason: 'Use the singular verb form.',
                        focus: 'grammar',
                        kind: 'correction',
                        issueFamily: 'agreement',
                        replacementText: 'shows',
                        confidence: 91,
                    },
                ],
                hasMorePotential: true,
                provider: 'gemini',
                model: 'gemini-2.5-flash',
                rawPrompt: 'prompt',
                rawResponse: 'response',
                repairedParsedJson: { findings: [], hasMorePotential: true },
                finishReason: 'STOP',
                usageMetadata: null,
                keyLeaseId: null,
            },
        } as any);

        const result = await getOrCreateWritingSuggestionCache(createSubmission([
            createTask({ taskNumber: 1 }),
            createTask({ taskNumber: 2, essayText: 'Task 2 stays untouched.' }),
        ]), {
            taskNumber: 1,
            force: true,
            source: 'force',
            sessionId: 'session-1',
        });

        expect(result.success).toBe(true);
        expect(aiService.generateWritingSuggestionBatch).toHaveBeenCalledTimes(1);
        expect(result.success && result.data.perTask[1]?.grammar.corrections[0]?.anchorText).toBe('show');
        expect(result.success && result.data.perTask[2]).toBeUndefined();
        expect(result.success && result.data.runStateByTask?.[1]?.lastRunHasMorePotential).toBe(true);
    });

    it('updates suggestion review status in the persisted cache', async () => {
        vi.mocked(getDoc).mockResolvedValue({
            exists: () => true,
            data: () => createReadyCache(),
        } as any);

        const cache = createReadyCache();
        const suggestion = cache.perTask[1]!.grammar.corrections[0]!;
        const result = await updateWritingSuggestionReviewStatus('submission-1', 1, suggestion.reviewKey, 'approved');

        expect(result.success).toBe(true);
        expect(result.success && result.data.perTask[1]?.grammar.corrections[0]?.reviewStatus).toBe('approved');
        expect(setDoc).toHaveBeenCalled();
    });
});

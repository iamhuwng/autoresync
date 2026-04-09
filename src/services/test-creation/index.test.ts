import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    convertToText: vi.fn(),
    extractReadingTest: vi.fn(),
    detectFromSectionContext: vi.fn(),
    compareAIvsRules: vi.fn(),
    parseOffline: vi.fn(),
    isOnline: vi.fn(),
    hashDocument: vi.fn(),
    saveCheckpoint: vi.fn(),
    deleteCheckpoint: vi.fn(),
    getCheckpoint: vi.fn(),
    logCorrection: vi.fn(),
    getTypeStats: vi.fn(),
}));

vi.mock('./document-converter.service', () => ({
    documentConverter: {
        convertToText: mocks.convertToText,
    },
    DocumentConverterService: class DocumentConverterService {},
}));

vi.mock('./ai-extractor.service', () => ({
    aiExtractor: {
        extractReadingTest: mocks.extractReadingTest,
    },
    AIExtractorService: class AIExtractorService {},
}));

vi.mock('./type-classifier.service', () => ({
    typeClassifierService: {
        detectFromSectionContext: mocks.detectFromSectionContext,
    },
    TypeClassifierService: class TypeClassifierService {},
}));

vi.mock('./validator.service', () => ({
    validatorService: {
        compareAIvsRules: mocks.compareAIvsRules,
    },
    ValidatorService: class ValidatorService {},
}));

vi.mock('./learning.service', () => ({
    learningService: {
        logCorrection: mocks.logCorrection,
        getTypeStats: mocks.getTypeStats,
    },
    LearningService: class LearningService {},
}));

vi.mock('./offline-parser.service', () => ({
    offlineParserService: {
        parseOffline: mocks.parseOffline,
        isOnline: mocks.isOnline,
        hashDocument: mocks.hashDocument,
        saveCheckpoint: mocks.saveCheckpoint,
        deleteCheckpoint: mocks.deleteCheckpoint,
        getCheckpoint: mocks.getCheckpoint,
    },
    OfflineParserService: class OfflineParserService {},
}));

import { testCreationService } from './index';

function createOfflineParseResult() {
    return {
        id: 'offline-1',
        documentText: 'Reading passage content',
        parsedAt: Date.now(),
        isOfflineParse: true,
        pendingAIComparison: false,
        passages: [
            {
                id: 'passage_1',
                title: 'Engineering a solution to climate change',
                content: 'Paragraph A text. Paragraph B text.',
                order: 1,
            },
        ],
        questions: [
            {
                questionNumber: 30,
                questionText: 'Paragraph B',
                type: 'matching-headings',
                confidence: 91,
                answer: 'vii',
                passageId: 'passage_1',
                classificationDetails: {
                    type: 'matching-headings',
                    confidence: 91,
                    uncertain: false,
                    optionLabelFormat: 'roman',
                    detectionSource: 'instruction',
                    matchedPattern: 'list of headings',
                    wordLimit: null,
                },
            },
            {
                questionNumber: 35,
                questionText: 'removes carbon dioxide as soon as it is produced',
                type: 'matching-information',
                confidence: 88,
                answer: 'C',
                passageId: 'passage_1',
                classificationDetails: {
                    type: 'matching-information',
                    confidence: 88,
                    uncertain: false,
                    optionLabelFormat: 'letter',
                    detectionSource: 'instruction',
                    matchedPattern: 'classify the following',
                    wordLimit: null,
                },
            },
        ],
    };
}

function createValidationResult(aiQuestions: Array<Record<string, unknown>>) {
    return {
        confidence: aiQuestions.length > 0 ? 100 : 0,
        matchedCount: aiQuestions.length,
        discrepancyCount: 0,
        discrepancies: [],
        mergedQuestions: aiQuestions.map((question) => ({
            ...question,
            typeSource: 'ai',
            uncertain: false,
        })),
    };
}

describe('testCreationService.parseText', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.convertToText.mockResolvedValue({
            success: true,
            data: {
                text: 'Reading document text',
            },
        });

        mocks.isOnline.mockReturnValue(true);
        mocks.parseOffline.mockResolvedValue(createOfflineParseResult());
        mocks.compareAIvsRules.mockImplementation((aiQuestions) => createValidationResult(aiQuestions));
    });

    it('falls back to offline parsing when AI extraction returns an error result', async () => {
        mocks.extractReadingTest.mockResolvedValue({
            success: false,
            error: 'Questions+Answers parsing failed',
        });

        const result = await testCreationService.parseText('Pasted IELTS reading content');

        expect(result.success).toBe(true);
        expect(mocks.extractReadingTest).toHaveBeenCalledOnce();
        expect(mocks.parseOffline).toHaveBeenCalledOnce();
        expect(result.metadata.usedOfflineFallback).toBe(true);
        expect(result.metadata.extractionSource).toBe('offline');
        expect(result.passages).toHaveLength(1);
        expect(result.passages?.[0]).toMatchObject({
            id: 'passage_1',
            title: 'Engineering a solution to climate change',
            content: 'Paragraph A text. Paragraph B text.',
            wordCount: 6,
        });
        expect(result.validationResult?.mergedQuestions).toHaveLength(2);
        expect(result.validationResult?.mergedQuestions[0]).toMatchObject({
            questionNumber: 30,
            questionText: 'Paragraph B',
            passageId: 'passage_1',
        });
        expect(mocks.compareAIvsRules).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    questionNumber: 30,
                    questionText: 'Paragraph B',
                    type: 'matching-headings',
                }),
            ]),
            expect.any(Array)
        );
    });

    it('returns offline passages and questions in rules-only mode', async () => {
        const result = await testCreationService.parseText('Pasted IELTS reading content', {
            rulesOnly: true,
        });

        expect(result.success).toBe(true);
        expect(mocks.extractReadingTest).not.toHaveBeenCalled();
        expect(mocks.parseOffline).toHaveBeenCalledOnce();
        expect(result.metadata.usedOfflineFallback).toBe(false);
        expect(result.metadata.extractionSource).toBe('rules');
        expect(result.passages).toHaveLength(1);
        expect(result.validationResult?.mergedQuestions).toHaveLength(2);
        expect(result.validationResult?.mergedQuestions[1]).toMatchObject({
            questionNumber: 35,
            questionText: 'removes carbon dioxide as soon as it is produced',
            passageId: 'passage_1',
        });
    });

    it('fails instead of returning a blank result when no questions are parsed', async () => {
        mocks.extractReadingTest.mockResolvedValue({
            success: false,
            error: 'Questions+Answers parsing failed',
        });
        mocks.parseOffline.mockResolvedValue({
            ...createOfflineParseResult(),
            questions: [],
        });
        mocks.compareAIvsRules.mockImplementation(() => createValidationResult([]));

        const result = await testCreationService.parseText('Pasted IELTS reading content');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Parsing produced no questions');
    });
});

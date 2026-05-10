/**
 * Unit Tests for AI Extractor Service
 * 
 * Tests extraction, checkpoints, and error handling with mocked AI responses.
 * 
 * @module ai-extractor.service.test
 * @date 2026-02-06
 * @see PRD-0020 Task 3.10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIExtractorService } from './ai-extractor.service';

// ═══════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════

// Mock the AI router service
vi.mock('../ai/router.service', () => ({
    aiService: {
        parsePassagesOnly: vi.fn(),
        parseQuestionsAndAnswers: vi.fn(),
        getStatus: vi.fn(() => ({ available: true, name: 'gemini' })),
        testConnection: vi.fn(() => Promise.resolve({ success: true })),
    },
}));

// Import after mocking
import { aiService } from '../ai/router.service';

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════

const mockPassagesResponse = {
    success: true,
    data: {
        passages: [
            {
                id: 'passage_1',
                title: 'The History of Writing',
                content: 'Writing emerged around 3500 BCE in ancient Mesopotamia...',
                wordCount: 450,
                questionStart: 1,
                questionEnd: 13,
            },
        ],
        confidence: 0.95,
    },
};

const mockQuestionsResponse = {
    success: true,
    data: {
        questions: [
            {
                questionNumber: 1,
                questionText: 'Writing first appeared in',
                type: 'sentence-completion',
                options: null,
                answer: 'Mesopotamia',
                passageId: 'passage_1',
                confidence: 0.9,
            },
            {
                questionNumber: 2,
                questionText: 'The earliest form of writing was called',
                type: 'sentence-completion',
                options: null,
                answer: 'cuneiform',
                passageId: 'passage_1',
                confidence: 0.85,
            },
        ],
        answerKey: {
            1: 'Mesopotamia',
            2: 'cuneiform',
        },
        confidence: 0.88,
    },
};

// ═══════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════

describe('AIExtractorService', () => {
    let extractor: AIExtractorService;

    beforeEach(() => {
        vi.clearAllMocks();
        extractor = new AIExtractorService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ═══════════════════════════════════════════════════════════════
    // EXTRACTION TESTS
    // ═══════════════════════════════════════════════════════════════

    describe('extractReadingTest', () => {
        it('should extract passages and questions successfully', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.passages).toHaveLength(1);
                expect(result.data.questions).toHaveLength(2);
                expect(result.data.answerKey[1]).toBe('Mesopotamia');
                expect(result.data.metadata.extractedAt).toBeInstanceOf(Date);
            }
        });

        it('should call progress callback during extraction', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const onProgress = vi.fn();

            await extractor.extractReadingTest('Test document content', { onProgress });

            expect(onProgress).toHaveBeenCalled();
            // Check that specific stages were reported
            const calls = onProgress.mock.calls;
            const stages = calls.map((call) => call[0]);
            expect(stages).toContain('Extracting passages...');
            expect(stages).toContain('Extracting questions...');
            expect(stages).toContain('Extraction complete');
        });

        it('should handle passage extraction failure', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue({
                success: false,
                error: 'AI service unavailable',
            });

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('AI service unavailable');
            }
        });

        it('should handle question extraction failure', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue({
                success: false,
                error: 'Failed to parse questions',
            });

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Failed to parse questions');
            }
        });

        it('should include processing time in metadata', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
            }
        });

        it('should preserve table sectionInstruction but not promote TABLE_HEADERS metadata into options', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue({
                success: true,
                data: {
                    questions: [
                        {
                            questionNumber: 11,
                            questionText: 'Questions 11-13',
                            type: 'table-completion',
                            options: null,
                            labeledOptions: null,
                            answer: '',
                            sectionInstruction:
                                'TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below. Choose NO MORE THAN TWO WORDS.',
                            passageId: 'passage_1',
                            confidence: 0.92,
                        },
                    ],
                    answerKey: {
                        11: 'Aloe vera',
                    },
                    confidence: 0.9,
                },
            } as any);

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.questions).toHaveLength(1);
                const question = result.data.questions[0];
                expect(question.instructions).toContain('TABLE_HEADERS:');
                expect(question.instructions).toContain('Plant Species | Native Region | Medicinal Use');
                expect(question.options).toBeUndefined();
                expect(question.labeledOptions).toBeUndefined();
                expect(question.suggestedAnswer).toBe('Aloe vera');
            }
        });

        it('should keep provided options when TABLE_HEADERS metadata is malformed', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue({
                success: true,
                data: {
                    questions: [
                        {
                            questionNumber: 12,
                            questionText: 'Question 12',
                            type: 'table-completion',
                            options: ['Existing Col 1', 'Existing Col 2'],
                            answer: '',
                            sectionInstruction:
                                'TABLE_HEADERS: legacy-header-without-delimiters Complete the table below.',
                            passageId: 'passage_1',
                            confidence: 0.9,
                        },
                    ],
                    answerKey: {
                        12: 'Rosemary',
                    },
                    confidence: 0.85,
                },
            } as any);

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.questions).toHaveLength(1);
                const question = result.data.questions[0];
                expect(question.instructions).toContain('TABLE_HEADERS: legacy-header-without-delimiters');
                expect(question.options).toEqual(['Existing Col 1', 'Existing Col 2']);
                expect(question.suggestedAnswer).toBe('Rosemary');
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // CHECKPOINT TESTS
    // ═══════════════════════════════════════════════════════════════

    describe('Checkpoint Management', () => {
        it('should create checkpoint during extraction', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content', {
                enableCheckpoints: true,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.metadata.checkpointId).toBeDefined();

                // Verify checkpoint can be retrieved
                const checkpoint = extractor.getCheckpoint(result.data.metadata.checkpointId!);
                expect(checkpoint).toBeDefined();
                expect(checkpoint!.stage).toBe('complete');
            }
        });

        it('should delete checkpoint', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content', {
                enableCheckpoints: true,
            });

            if (result.success && result.data.metadata.checkpointId) {
                const checkpointId = result.data.metadata.checkpointId;

                // Delete checkpoint
                extractor.deleteCheckpoint(checkpointId);

                // Verify it's gone
                expect(extractor.getCheckpoint(checkpointId)).toBeUndefined();
            }
        });

        it('should not create checkpoint when disabled', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content', {
                enableCheckpoints: false,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.metadata.checkpointId).toBeUndefined();
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // STATUS TESTS
    // ═══════════════════════════════════════════════════════════════

    describe('getStatus', () => {
        it('should return service status', () => {
            const status = extractor.getStatus();

            expect(status.available).toBe(true);
            expect(status.provider).toBe('gemini');
        });
    });

    describe('testConnection', () => {
        it('should test AI service connection', async () => {
            const result = await extractor.testConnection();

            expect(result.success).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // EDGE CASES
    // ═══════════════════════════════════════════════════════════════

    describe('Edge Cases', () => {
        it('should handle empty passages array', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue({
                success: true,
                data: {
                    passages: [],
                    confidence: 0.5,
                },
            } as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.passages).toHaveLength(0);
                expect(result.data.metadata.confidence).toBeLessThan(0.9);
            }
        });

        it('should handle empty questions array', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue({
                success: true,
                data: {
                    questions: [],
                    answerKey: {},
                    confidence: 0.5,
                },
            } as any);

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.questions).toHaveLength(0);
            }
        });

        it('should handle passages without word count', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue({
                success: true,
                data: {
                    passages: [
                        {
                            id: 'passage_1',
                            title: 'Test Passage',
                            content: 'One two three four five.',
                            wordCount: null, // Missing word count
                            questionStart: null,
                            questionEnd: null,
                        },
                    ],
                    confidence: 0.9,
                },
            } as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content');

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.passages[0].wordCount).toBe(5); // Calculated
            }
        });

        it('should handle non-existent checkpoint ID', async () => {
            vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
            vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

            const result = await extractor.extractReadingTest('Test document content', {
                resumeFromCheckpoint: 'non_existent_checkpoint',
            });

            // Should proceed with fresh extraction
            expect(result.success).toBe(true);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// TIMEOUT TESTS (Validation only - actual timeout tests are flaky in unit tests)
// ═══════════════════════════════════════════════════════════════

describe('AIExtractorService Timeout Option', () => {
    it('should accept custom timeout option', async () => {
        const extractor = new AIExtractorService();

        vi.mocked(aiService.parsePassagesOnly).mockResolvedValue(mockPassagesResponse as any);
        vi.mocked(aiService.parseQuestionsAndAnswers).mockResolvedValue(mockQuestionsResponse as any);

        // Should not throw with custom timeout
        const result = await extractor.extractReadingTest('Test document content', {
            timeout: 60000, // 1 minute
        });

        expect(result.success).toBe(true);
    });
});


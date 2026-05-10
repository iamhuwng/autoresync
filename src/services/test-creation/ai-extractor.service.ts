/**
 * AI Extractor Service for IELTS Reading Tests
 * 
 * Extracts structured content from IELTS Reading test documents using AI.
 * This service orchestrates the extraction process with:
 * - Multiple provider support (Gemini â†’ Groq fallback)
 * - Checkpoint/resume capability
 * - Progress callbacks for UI updates
 * - Timeout handling
 * 
 * @module ai-extractor.service
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 3
 */

import type { Result } from '../../types/result.types';
import type {
    ReadingLabeledOption,
    ReadingOptionLabelFormat,
    ReadingSectionReference,
} from '../../types/document.types';
import { aiService } from '../ai/router.service';
import { canonicalizeReadingQuestion } from '../../utils/readingQuestionContract';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TYPES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Extracted reading passage
 */
export interface ExtractedPassage {
    id: string;
    title: string;
    content: string;
    wordCount: number;
    questionRange?: {
        start: number;
        end: number;
    };
}

/**
 * Raw extracted question (before type classification)
 */
export interface ExtractedQuestion {
    number: number;
    text: string;
    instructions?: string;
    options?: Array<string | ReadingLabeledOption>;
    labeledOptions?: ReadingLabeledOption[];
    optionLabelFormat?: ReadingOptionLabelFormat;
    sectionReferences?: ReadingSectionReference[];
    suggestedAnswer?: string | string[];
    suggestedType?: string;
    passageId?: string;
    confidence: number;
}

/**
 * Complete extraction result
 */
export interface ExtractionResult {
    passages: ExtractedPassage[];
    questions: ExtractedQuestion[];
    answerKey: Record<number, string | string[]>;
    metadata: {
        extractedAt: Date;
        provider: 'gemini' | 'groq';
        confidence: number;
        processingTimeMs: number;
        checkpointId?: string;
    };
}

/**
 * Extraction checkpoint for resume capability
 */
export interface ExtractionCheckpoint {
    id: string;
    documentHash: string;
    stage: 'passages' | 'questions' | 'answers' | 'complete';
    passages?: ExtractedPassage[];
    questions?: ExtractedQuestion[];
    answerKey?: Record<number, string | string[]>;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
}

/**
 * Progress callback type
 */
export type ExtractionProgressCallback = (
    stage: string,
    progress: number,
    message?: string
) => void;

/**
 * Extraction options
 */
export interface ExtractionOptions {
    /** Progress callback for UI updates */
    onProgress?: ExtractionProgressCallback;
    /** Timeout in milliseconds (default: 120000 = 2 minutes) */
    timeout?: number;
    /** Checkpoint ID to resume from */
    resumeFromCheckpoint?: string;
    /** Whether to save checkpoints */
    enableCheckpoints?: boolean;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONSTANTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes
const CHECKPOINT_EXPIRY_HOURS = 24;
const CHECKPOINT_STORAGE_KEY = 'ielts_extraction_checkpoints';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AI EXTRACTOR SERVICE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * AI Extractor Service
 * 
 * Orchestrates AI extraction of IELTS Reading test content.
 */
class AIExtractorService {
    private checkpointCache: Map<string, ExtractionCheckpoint> = new Map();

    constructor() {
        // Load checkpoints from localStorage on initialization
        this.loadCheckpointsFromStorage();
    }

    /**
     * Extract IELTS Reading test content from document text
     * 
     * @param text - Raw document text
     * @param options - Extraction options
     * @returns Extraction result with passages, questions, and answer key
     */
    async extractReadingTest(
        text: string,
        options: ExtractionOptions = {}
    ): Promise<Result<ExtractionResult>> {
        const {
            onProgress,
            timeout = DEFAULT_TIMEOUT_MS,
            resumeFromCheckpoint,
            enableCheckpoints = true,
        } = options;

        const startTime = Date.now();

        try {
            // Check for existing checkpoint
            if (resumeFromCheckpoint) {
                const checkpoint = this.getCheckpoint(resumeFromCheckpoint);
                if (checkpoint) {
                    onProgress?.('Resuming from checkpoint...', 10, `Stage: ${checkpoint.stage}`);
                    return this.resumeFromCheckpoint(checkpoint, text, options);
                }
            }

            // Create timeout controller
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                // Stage 1: Extract passages
                onProgress?.('Extracting passages...', 20, 'Analyzing document structure');
                const passagesResult = await this.extractPassages(text);

                if (!passagesResult.success) {
                    return passagesResult as Result<ExtractionResult>;
                }

                // Save checkpoint after passages
                let checkpointId: string | undefined;
                if (enableCheckpoints) {
                    checkpointId = this.saveCheckpoint({
                        documentHash: this.hashDocument(text),
                        stage: 'passages',
                        passages: passagesResult.data,
                    });
                }

                onProgress?.('Passages extracted', 40, `Found ${passagesResult.data.length} passages`);

                // Stage 2: Extract questions
                onProgress?.('Extracting questions...', 50, 'Identifying question types');
                const questionsResult = await this.extractQuestions(text);

                if (!questionsResult.success) {
                    return questionsResult as Result<ExtractionResult>;
                }

                // Update checkpoint
                if (enableCheckpoints && checkpointId) {
                    this.updateCheckpoint(checkpointId, {
                        stage: 'questions',
                        questions: questionsResult.data.questions,
                    });
                }

                onProgress?.('Questions extracted', 70, `Found ${questionsResult.data.questions.length} questions`);

                // Stage 3: Extract answer key
                onProgress?.('Extracting answer key...', 80, 'Mapping answers to questions');
                const answerKey = questionsResult.data.answerKey;

                // Update checkpoint to complete
                if (enableCheckpoints && checkpointId) {
                    this.updateCheckpoint(checkpointId, {
                        stage: 'complete',
                        answerKey,
                    });
                }

                const processingTimeMs = Date.now() - startTime;
                onProgress?.('Extraction complete', 100, `Processed in ${(processingTimeMs / 1000).toFixed(1)}s`);

                return {
                    success: true,
                    data: {
                        passages: passagesResult.data,
                        questions: questionsResult.data.questions,
                        answerKey,
                        metadata: {
                            extractedAt: new Date(),
                            provider: 'gemini', // Will be updated based on actual provider used
                            confidence: Math.min(
                                passagesResult.data.length > 0 ? 0.9 : 0.5,
                                questionsResult.data.questions.length > 0 ? 0.9 : 0.5
                            ),
                            processingTimeMs,
                            checkpointId,
                        },
                    },
                };
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return {
                    success: false,
                    error: `Extraction timed out after ${timeout / 1000} seconds. Please try again with a smaller document.`,
                };
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Extraction failed',
            };
        }
    }

    /**
     * Extract passages from document text
     */
    private async extractPassages(text: string): Promise<Result<ExtractedPassage[]>> {
        const result = await aiService.parsePassagesOnly(text);

        if (!result.success) {
            return {
                success: false,
                error: result.error || 'Failed to extract passages',
            };
        }

        // Transform AI passages to our format
        const passages: ExtractedPassage[] = result.data!.passages.map((p, idx) => ({
            id: p.id || `passage_${idx + 1}`,
            title: p.title,
            content: p.content,
            wordCount: p.wordCount || this.countWords(p.content),
            questionRange: p.questionStart && p.questionEnd ? {
                start: p.questionStart,
                end: p.questionEnd,
            } : undefined,
        }));

        return { success: true, data: passages };
    }

    /**
     * Extract questions from document text
     */
    private async extractQuestions(
        text: string
    ): Promise<Result<{ questions: ExtractedQuestion[]; answerKey: Record<number, string | string[]> }>> {
        const result = await aiService.parseQuestionsAndAnswers(text);

        if (!result.success) {
            return {
                success: false,
                error: result.error || 'Failed to extract questions',
            };
        }

        // Transform AI questions to our format
        // IMPORTANT: The AI sets answer: "" for all questions and puts real answers in answerKey.
        // We must merge answerKey values into each question's suggestedAnswer so answers
        // flow through the entire pipeline: ExtractedQuestion â†’ MergedQuestion â†’ Draft â†’ Published Test
        const answerKey = result.data!.answerKey || {};
        const questions: ExtractedQuestion[] = result.data!.questions.map(q => {
            // For table-completion questions: extract TABLE_HEADERS from sectionInstruction
            // and map them into the `options` array. This is the key mapping decision â€”
            // `options` is unused for table-completion (fill-in-the-blank, not multiple-choice)
            // and it's the ONLY field that naturally survives the entire pipeline:
            // ExtractedQuestion â†’ AIQuestionResult â†’ mergedQuestion â†’ draft â†’ published test â†’ student view
            let labeledOptions = q.labeledOptions || undefined;
            let options = Array.isArray(q.options)
                ? q.options
                    .map((option) => {
                        if (typeof option === 'string') {
                            return option.trim();
                        }

                        const label = option.label?.trim() || '';
                        const text = (option.text || '').trim();
                        return { label, text };
                    })
                    .filter((option) => typeof option === 'string'
                        ? Boolean(option)
                        : Boolean(option.label || option.text))
                : labeledOptions?.map((option) => ({
                    label: option.label.trim(),
                    text: option.text.trim(),
                })).filter((option) => option.label || option.text);


            // Merge answer from answerKey into the question.
            // The AI returns answer: "" for each question but puts real answers in answerKey.
            // Try answerKey[questionNumber] first, then fall back to q.answer (which may be non-empty
            // if the AI filled it in despite the prompt instruction).
            const answerFromKey = answerKey[q.questionNumber];
            const resolvedAnswer = (answerFromKey !== undefined && answerFromKey !== null && answerFromKey !== '')
                ? answerFromKey
                : q.answer;

            const canonicalQuestion = canonicalizeReadingQuestion({
                questionNumber: q.questionNumber,
                type: q.type,
                questionText: q.questionText,
                options,
                labeledOptions,
                optionLabelFormat: q.optionLabelFormat,
                sectionReferences: q.sectionReferences || undefined,
            });

            return {
                number: q.questionNumber,
                text: canonicalQuestion.questionText,
                instructions: q.sectionInstruction || undefined,
                options: canonicalQuestion.options,
                labeledOptions: canonicalQuestion.labeledOptions,
                optionLabelFormat: canonicalQuestion.optionLabelFormat,
                sectionReferences: canonicalQuestion.sectionReferences,
                suggestedAnswer: resolvedAnswer,
                suggestedType: q.type || undefined,
                passageId: q.passageId || undefined,
                confidence: q.confidence,
            };
        });

        return {
            success: true,
            data: {
                questions,
                answerKey: result.data!.answerKey,
            },
        };
    }

    /**
     * Resume extraction from checkpoint
     */
    private async resumeFromCheckpoint(
        checkpoint: ExtractionCheckpoint,
        text: string,
        options: ExtractionOptions
    ): Promise<Result<ExtractionResult>> {
        const { onProgress } = options;
        const startTime = Date.now();

        switch (checkpoint.stage) {
            case 'passages':
                // Continue from questions
                onProgress?.('Resuming: Extracting questions...', 50);
                const questionsResult = await this.extractQuestions(text);

                if (!questionsResult.success) {
                    return questionsResult as Result<ExtractionResult>;
                }

                return {
                    success: true,
                    data: {
                        passages: checkpoint.passages!,
                        questions: questionsResult.data.questions,
                        answerKey: questionsResult.data.answerKey,
                        metadata: {
                            extractedAt: new Date(),
                            provider: 'gemini',
                            confidence: 0.85,
                            processingTimeMs: Date.now() - startTime,
                            checkpointId: checkpoint.id,
                        },
                    },
                };

            case 'questions':
                // Continue from answer key - questions already extracted
                onProgress?.('Resuming: Extracting answer key...', 80);
                return {
                    success: true,
                    data: {
                        passages: checkpoint.passages!,
                        questions: checkpoint.questions!,
                        answerKey: checkpoint.answerKey || {},
                        metadata: {
                            extractedAt: new Date(),
                            provider: 'gemini',
                            confidence: 0.85,
                            processingTimeMs: Date.now() - startTime,
                            checkpointId: checkpoint.id,
                        },
                    },
                };

            case 'complete':
                // Already complete, just return
                onProgress?.('Resuming: Already complete', 100);
                return {
                    success: true,
                    data: {
                        passages: checkpoint.passages!,
                        questions: checkpoint.questions!,
                        answerKey: checkpoint.answerKey!,
                        metadata: {
                            extractedAt: new Date(),
                            provider: 'gemini',
                            confidence: 0.9,
                            processingTimeMs: 0,
                            checkpointId: checkpoint.id,
                        },
                    },
                };

            default:
                return {
                    success: false,
                    error: `Unknown checkpoint stage: ${checkpoint.stage}`,
                };
        }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // CHECKPOINT MANAGEMENT
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /**
     * Save extraction checkpoint
     */
    private saveCheckpoint(data: Partial<ExtractionCheckpoint>): string {
        const id = `ckpt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CHECKPOINT_EXPIRY_HOURS * 60 * 60 * 1000);

        const checkpoint: ExtractionCheckpoint = {
            id,
            documentHash: data.documentHash!,
            stage: data.stage || 'passages',
            passages: data.passages,
            questions: data.questions,
            answerKey: data.answerKey,
            createdAt: now,
            updatedAt: now,
            expiresAt,
        };

        this.checkpointCache.set(id, checkpoint);

        // Clean up expired checkpoints
        this.cleanupExpiredCheckpoints();

        // Persist to localStorage
        this.saveCheckpointsToStorage();

        console.log(`ðŸ“Œ [AIExtractor] Checkpoint saved: ${id} (stage: ${checkpoint.stage})`);
        return id;
    }

    /**
     * Update existing checkpoint
     */
    private updateCheckpoint(id: string, data: Partial<ExtractionCheckpoint>): void {
        const existing = this.checkpointCache.get(id);
        if (existing) {
            const updated = {
                ...existing,
                ...data,
                updatedAt: new Date(),
            };
            this.checkpointCache.set(id, updated);
            // Persist to localStorage
            this.saveCheckpointsToStorage();
            console.log(`ðŸ“Œ [AIExtractor] Checkpoint updated: ${id} (stage: ${updated.stage})`);
        }
    }

    /**
     * Get checkpoint by ID
     */
    getCheckpoint(id: string): ExtractionCheckpoint | undefined {
        const checkpoint = this.checkpointCache.get(id);
        if (checkpoint && new Date() < checkpoint.expiresAt) {
            return checkpoint;
        }
        // Remove expired
        if (checkpoint) {
            this.checkpointCache.delete(id);
        }
        return undefined;
    }

    /**
     * Find checkpoint by document hash
     */
    findCheckpointByHash(hash: string): ExtractionCheckpoint | undefined {
        for (const [_id, checkpoint] of this.checkpointCache) {
            if (checkpoint.documentHash === hash && new Date() < checkpoint.expiresAt) {
                return checkpoint;
            }
        }
        return undefined;
    }

    /**
     * Delete checkpoint
     */
    deleteCheckpoint(id: string): void {
        this.checkpointCache.delete(id);
    }

    /**
     * Clean up expired checkpoints
     */
    private cleanupExpiredCheckpoints(): void {
        const now = new Date();
        let deleted = false;
        for (const [id, checkpoint] of this.checkpointCache) {
            if (now >= checkpoint.expiresAt) {
                this.checkpointCache.delete(id);
                deleted = true;
            }
        }
        if (deleted) {
            this.saveCheckpointsToStorage();
        }
    }

    /**
     * Save checkpoints to localStorage for persistence
     */
    private saveCheckpointsToStorage(): void {
        try {
            const entries: Array<[string, ExtractionCheckpoint]> = [];
            for (const [id, checkpoint] of this.checkpointCache) {
                entries.push([id, {
                    ...checkpoint,
                    // Convert dates to ISO strings for JSON serialization
                    createdAt: checkpoint.createdAt instanceof Date ? checkpoint.createdAt : checkpoint.createdAt,
                    updatedAt: checkpoint.updatedAt instanceof Date ? checkpoint.updatedAt : checkpoint.updatedAt,
                    expiresAt: checkpoint.expiresAt instanceof Date ? checkpoint.expiresAt : checkpoint.expiresAt,
                }]);
            }
            localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(entries));
            console.log(`ðŸ’¾ [AIExtractor] Saved ${entries.length} checkpoint(s) to localStorage`);
        } catch (error) {
            console.warn('âš ï¸ [AIExtractor] Failed to save checkpoints to localStorage:', error);
        }
    }

    /**
     * Load checkpoints from localStorage on startup
     */
    private loadCheckpointsFromStorage(): void {
        try {
            const stored = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
            if (!stored) return;

            const entries: Array<[string, ExtractionCheckpoint]> = JSON.parse(stored);
            const now = new Date();
            let loadedCount = 0;

            for (const [id, checkpoint] of entries) {
                // Restore Date objects from ISO strings
                const restored: ExtractionCheckpoint = {
                    ...checkpoint,
                    createdAt: new Date(checkpoint.createdAt),
                    updatedAt: new Date(checkpoint.updatedAt),
                    expiresAt: new Date(checkpoint.expiresAt),
                };

                // Only load non-expired checkpoints
                if (now < restored.expiresAt) {
                    this.checkpointCache.set(id, restored);
                    loadedCount++;
                }
            }

            if (loadedCount > 0) {
                console.log(`ðŸ“¥ [AIExtractor] Loaded ${loadedCount} checkpoint(s) from localStorage`);
            }
        } catch (error) {
            console.warn('âš ï¸ [AIExtractor] Failed to load checkpoints from localStorage:', error);
        }
    }

    /**
     * Get pending checkpoint for resume prompt
     * Returns the most recent incomplete checkpoint
     */
    getPendingCheckpoint(): ExtractionCheckpoint | undefined {
        let latestCheckpoint: ExtractionCheckpoint | undefined;
        let latestTime = 0;

        for (const [, checkpoint] of this.checkpointCache) {
            if (checkpoint.stage !== 'complete' && new Date() < checkpoint.expiresAt) {
                const time = checkpoint.updatedAt.getTime();
                if (time > latestTime) {
                    latestTime = time;
                    latestCheckpoint = checkpoint;
                }
            }
        }

        return latestCheckpoint;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // UTILITY METHODS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /**
     * Generate hash for document content
     */
    private hashDocument(text: string): string {
        // Simple hash for checkpoint matching
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `doc_${Math.abs(hash).toString(36)}`;
    }

    /**
     * Count words in text
     */
    private countWords(text: string): number {
        if (!text || text.trim().length === 0) return 0;
        return text.trim().split(/\s+/).length;
    }

    /**
     * Get service status
     */
    getStatus(): { available: boolean; provider: string } {
        const status = aiService.getStatus();
        return {
            available: status.available,
            provider: status.name,
        };
    }

    /**
     * Test AI service connection
     */
    async testConnection(): Promise<Result> {
        return aiService.testConnection();
    }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXPORTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Singleton instance of AIExtractorService
 */
export const aiExtractor = new AIExtractorService();

/**
 * Re-export class for testing
 */
export { AIExtractorService };

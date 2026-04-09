/**
 * Test Creation Service - Unified Facade
 * 
 * This is the main entry point for the automated IELTS Reading test creation system.
 * It orchestrates document conversion, AI extraction, type classification, validation,
 * and learning from teacher corrections.
 * 
 * @module test-creation
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 9
 */

// ═══════════════════════════════════════════════════════════════
// SERVICE IMPORTS
// ═══════════════════════════════════════════════════════════════

import { documentConverter, DocumentConverterService } from './document-converter.service';
import { aiExtractor, AIExtractorService } from './ai-extractor.service';
import { typeClassifierService, TypeClassifierService } from './type-classifier.service';
import { validatorService, ValidatorService } from './validator.service';
import { learningService, LearningService } from './learning.service';
import { offlineParserService, OfflineParserService } from './offline-parser.service';
import type { LocalParseResult } from './offline-parser.service';

// ═══════════════════════════════════════════════════════════════
// TYPE RE-EXPORTS
// ═══════════════════════════════════════════════════════════════

// Document Converter types
export type { ConversionResult } from './document-converter.service';

// AI Extractor types
export type {
    ExtractedPassage,
    ExtractedQuestion,
    ExtractionResult,
    ExtractionCheckpoint,
    ExtractionOptions,
} from './ai-extractor.service';

// Type Classifier types
export type {
    ClassificationResult,
    WordLimitResult,
} from './type-classifier.service';

// Validator types
export type {
    AIQuestionResult,
    RulesQuestionResult,
    ComparisonResult,
    MergedQuestion,
    Discrepancy,
    UncertainItem,
    CompletenessResult,
    CompletenessIssue,
    AnswerKeyValidation,
} from './validator.service';

// Learning Service types
export type {
    CorrectionLog,
    CorrectionPattern,
    CorrectionInput,
    TypeCorrectionStats,
    CorrectionAnalytics,
} from './learning.service';

// Offline Parser types
export type {
    LocalParseResult,
    ParsedPassage,
    ParsedQuestion,
    OfflineVsAIComparison,
    TypeDifference,
    ParsingCheckpoint,
} from './offline-parser.service';

// Question Schema types
export type { QuestionType, OptionLabelFormat } from '../../types/QuestionSchema';
export { QUESTION_TYPES } from '../../types/QuestionSchema';

// ═══════════════════════════════════════════════════════════════
// UNIFIED SERVICE TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the full parsing flow
 */
export interface ParseOptions {
    /** Progress callback for UI updates */
    onProgress?: (stage: ParseStage, progress: number, message: string) => void;
    /** User ID for checkpoint saving */
    userId?: string;
    /** Skip AI extraction (use rules only) */
    rulesOnly?: boolean;
    /** Timeout in milliseconds for AI extraction */
    aiTimeoutMs?: number;
    /** Enable checkpoint saving */
    enableCheckpoints?: boolean;
}

/**
 * Stages of the parsing process
 */
export type ParseStage =
    | 'converting'      // File → Text
    | 'extracting'      // AI extraction
    | 'classifying'     // Rule-based classification
    | 'validating'      // AI vs Rules comparison
    | 'complete'
    | 'error';

/**
 * Complete parsing result
 */
export interface ParseResult {
    /** Whether parsing was successful */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Extracted document text */
    documentText?: string;
    /** Extracted passages with full content */
    passages?: import('./ai-extractor.service').ExtractedPassage[];
    /** Validation result with merged questions */
    validationResult?: import('./validator.service').ComparisonResult;
    /** Metadata about the parsing process */
    metadata: ParseMetadata;
}

/**
 * Metadata about the parsing process
 */
export interface ParseMetadata {
    /** Total time in milliseconds */
    totalTimeMs: number;
    /** Time per stage in milliseconds */
    stageTimesMs: Record<string, number>;
    /** Source of extraction (AI, rules, or offline) */
    extractionSource: 'ai' | 'rules' | 'offline' | 'hybrid';
    /** Whether AI was used */
    usedAI: boolean;
    /** Whether offline fallback was used */
    usedOfflineFallback: boolean;
    /** Whether resumed from checkpoint */
    resumedFromCheckpoint: boolean;
    /** Checkpoint ID if saved */
    checkpointId?: string;
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED TEST CREATION SERVICE
// ═══════════════════════════════════════════════════════════════

/**
 * TestCreationService - Unified facade for all test creation operations
 * 
 * This service orchestrates the complete flow from document upload to
 * validated, teacher-ready test content.
 */
class TestCreationService {
    // Individual service references
    readonly documentConverter: DocumentConverterService;
    readonly aiExtractor: AIExtractorService;
    readonly typeClassifier: TypeClassifierService;
    readonly validator: ValidatorService;
    readonly learning: LearningService;
    readonly offlineParser: OfflineParserService;

    constructor() {
        this.documentConverter = documentConverter;
        this.aiExtractor = aiExtractor;
        this.typeClassifier = typeClassifierService;
        this.validator = validatorService;
        this.learning = learningService;
        this.offlineParser = offlineParserService;
    }

    // ─────────────────────────────────────────────────────────────
    // MAIN PARSING FLOW
    // ─────────────────────────────────────────────────────────────

    /**
     * Parse a document file through the complete extraction pipeline
     * 
     * @param file - The file to parse (PDF, DOCX, TXT, etc.)
     * @param options - Parsing options
     * @returns Complete parsing result with validation
     */
    async parseDocument(file: File, options: ParseOptions = {}): Promise<ParseResult> {
        const startTime = Date.now();
        const stageTimesMs: Record<string, number> = {};
        const {
            onProgress,
            userId,
            rulesOnly = false,
            aiTimeoutMs = 120000,
            enableCheckpoints = true,
        } = options;

        let documentText = '';
        let checkpointId: string | undefined;
        let usedOfflineFallback = false;
        let offlineParseResult: LocalParseResult | null = null;
        const resumedFromCheckpoint = false;

        try {
            // ─────────────────────────────────────────────────────
            // STAGE 1: Document Conversion
            // ─────────────────────────────────────────────────────
            onProgress?.('converting', 0, 'Converting document...');
            const conversionStart = Date.now();

            const conversionResult = await this.documentConverter.convertToText(file);

            if (!conversionResult.success || !conversionResult.data) {
                return {
                    success: false,
                    error: 'Document conversion failed',
                    metadata: this.createMetadata(startTime, stageTimesMs, 'rules', false, false, false),
                };
            }

            documentText = conversionResult.data.text;
            stageTimesMs['converting'] = Date.now() - conversionStart;
            onProgress?.('converting', 100, 'Document converted');

            // Generate document hash for checkpoints
            let documentHash = '';
            if (enableCheckpoints && userId) {
                documentHash = await this.offlineParser.hashDocument(documentText);
            }

            // ─────────────────────────────────────────────────────
            // STAGE 2: AI Extraction (or Rules-only)
            // ─────────────────────────────────────────────────────
            onProgress?.('extracting', 0, 'Extracting content...');
            const extractionStart = Date.now();

            let aiResult: import('./ai-extractor.service').ExtractionResult | null = null;
            let rulesResult: import('./type-classifier.service').ClassificationResult[] = [];

            const isOnline = this.offlineParser.isOnline();

            if (rulesOnly || !isOnline) {
                // Use rules-only extraction
                if (!isOnline) {
                    usedOfflineFallback = true;
                    onProgress?.('extracting', 10, 'Offline mode: using rule-based parsing...');
                }

                offlineParseResult = await this.offlineParser.parseOffline(documentText, file.name);
                rulesResult = offlineParseResult.questions
                    .filter((q): q is typeof q & { classificationDetails: import('./type-classifier.service').ClassificationResult } =>
                        q.classificationDetails !== undefined
                    )
                    .map(q => q.classificationDetails);

                stageTimesMs['extracting'] = Date.now() - extractionStart;
                onProgress?.('extracting', 100, 'Rule-based extraction complete');
            } else {
                // Use AI extraction with progress callbacks
                try {
                    const extractResult = await this.aiExtractor.extractReadingTest(documentText, {
                        onProgress: (stage: string, percent: number) => {
                            onProgress?.('extracting', percent, stage);
                        },
                        enableCheckpoints: enableCheckpoints,
                        timeout: aiTimeoutMs,
                    });

                    if (!extractResult.success || !extractResult.data) {
                        throw new Error(extractResult.error || 'AI extraction returned no data');
                    }

                    aiResult = extractResult.data;

                    stageTimesMs['extracting'] = Date.now() - extractionStart;
                    onProgress?.('extracting', 100, 'AI extraction complete');
                } catch (aiError) {
                    console.warn('[TestCreation] AI extraction failed, falling back to rules:', aiError);

                    // Fallback to rules
                    offlineParseResult = await this.offlineParser.parseOffline(documentText, file.name);
                    rulesResult = offlineParseResult.questions
                        .filter((q): q is typeof q & { classificationDetails: import('./type-classifier.service').ClassificationResult } =>
                            q.classificationDetails !== undefined
                        )
                        .map(q => q.classificationDetails);
                    usedOfflineFallback = true;

                    stageTimesMs['extracting'] = Date.now() - extractionStart;
                    onProgress?.('extracting', 100, 'Fallback: Rule-based extraction complete');
                }
            }

            // ─────────────────────────────────────────────────────
            // STAGE 3: Type Classification (Rules)
            // ─────────────────────────────────────────────────────
            onProgress?.('classifying', 0, 'Classifying questions...');
            const classificationStart = Date.now();

            // Run rules independently using section instructions from AI extraction
            if (aiResult && aiResult.questions) {
                rulesResult = aiResult.questions.map(q =>
                    this.typeClassifier.detectFromSectionContext(
                        q.instructions || '',
                        q.text,
                        (q.options || [])
                            .map((option) => typeof option === 'string' ? option : option.text)
                            .filter((option): option is string => Boolean(option))
                    )
                );
            }

            stageTimesMs['classifying'] = Date.now() - classificationStart;
            onProgress?.('classifying', 100, 'Classification complete');

            // Save checkpoint after classification
            if (enableCheckpoints && userId && documentHash) {
                checkpointId = await this.offlineParser.saveCheckpoint(
                    userId,
                    documentHash,
                    'classifying',
                    75,
                    { documentText }
                );
            }

            // ─────────────────────────────────────────────────────
            // STAGE 4: Validation (AI vs Rules)
            // ─────────────────────────────────────────────────────
            onProgress?.('validating', 0, 'Validating results...');
            const validationStart = Date.now();

            // Prepare AI questions for validator - use ACTUAL AI-detected type (not rules override)
            // Per PRD FR-15: "System MUST run both AI and rule-based detection and compare results"
            // Per PRD FR-16: "System MUST show side-by-side comparison when AI differs from rules"
            const aiQuestions: import('./validator.service').AIQuestionResult[] = aiResult
                ? aiResult.questions.map((q) => ({
                    questionNumber: q.number,
                    questionText: q.text,
                    type: q.suggestedType || 'multiple-choice',
                    options: q.options || null,
                    labeledOptions: q.labeledOptions || null,
                    answer: q.suggestedAnswer,
                    passageId: q.passageId,
                    confidence: q.confidence,
                    optionLabelFormat: q.optionLabelFormat,
                    sectionReferences: q.sectionReferences || null,
                }))
                : offlineParseResult
                    ? offlineParseResult.questions.map((q) => ({
                        questionNumber: q.questionNumber,
                        questionText: q.questionText,
                        type: q.type,
                        options: q.options || null,
                        labeledOptions: null,
                        answer: q.answer,
                        passageId: q.passageId,
                        confidence: q.confidence,
                        optionLabelFormat: q.classificationDetails?.optionLabelFormat === 'roman'
                            ? 'roman'
                            : q.classificationDetails?.optionLabelFormat === 'number'
                                ? 'number'
                                : 'letter',
                        sectionReferences: null,
                    }))
                : [];

            // Prepare rules questions for validator (independent classification)
            const rulesQuestions: import('./validator.service').RulesQuestionResult[] = rulesResult.map((r, i) => ({
                questionNumber: i + 1,
                type: r.type,
                confidence: r.confidence,
                // Propagate wordLimit from type-classifier's extractWordLimit
                ...(r.wordLimit ? {
                    wordLimit: {
                        max: r.wordLimit.maxWords,
                        includesNumber: r.wordLimit.allowNumber,
                    },
                } : {}),
                optionLabelFormat:
                    r.optionLabelFormat === 'roman'
                        ? 'roman' as const
                        : r.optionLabelFormat === 'number'
                            ? 'number' as const
                            : 'letter' as const,
            }));

            // Run validation
            const validationResult = this.validator.compareAIvsRules(aiQuestions, rulesQuestions);

            stageTimesMs['validating'] = Date.now() - validationStart;
            onProgress?.('validating', 100, 'Validation complete');

            // Clear checkpoint on success
            if (checkpointId && userId && documentHash) {
                await this.offlineParser.deleteCheckpoint(userId, documentHash).catch(() => { });
            }

            // ─────────────────────────────────────────────────────
            // COMPLETE
            // ─────────────────────────────────────────────────────
            onProgress?.('complete', 100, 'Parsing complete!');

            const extractionSource = usedOfflineFallback
                ? 'offline'
                : (aiResult ? (rulesResult.length > 0 ? 'hybrid' : 'ai') : 'rules');

            // Collect passages from AI result or offline parsing
            const extractedPassages = aiResult?.passages || offlineParseResult?.passages.map((passage) => ({
                id: passage.id,
                title: passage.title,
                content: passage.content,
                wordCount: passage.content.trim().split(/\s+/).filter(Boolean).length,
            })) || [];

            if (validationResult.mergedQuestions.length === 0) {
                throw new Error('Parsing produced no questions');
            }

            return {
                success: true,
                documentText,
                passages: extractedPassages,
                validationResult,
                metadata: this.createMetadata(
                    startTime,
                    stageTimesMs,
                    extractionSource,
                    !!aiResult,
                    usedOfflineFallback,
                    resumedFromCheckpoint,
                    checkpointId
                ),
            };

        } catch (error) {
            console.error('[TestCreation] Parsing failed:', error);
            onProgress?.('error', 0, error instanceof Error ? error.message : 'Unknown error');

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                metadata: this.createMetadata(startTime, stageTimesMs, 'rules', false, usedOfflineFallback, resumedFromCheckpoint),
            };
        }
    }

    /**
     * Parse text content directly (for paste functionality)
     */
    async parseText(text: string, options: ParseOptions = {}): Promise<ParseResult> {
        // Create a text file from the content
        const file = new File([text], 'pasted-content.txt', { type: 'text/plain' });
        return this.parseDocument(file, options);
    }

    // ─────────────────────────────────────────────────────────────
    // CHECKPOINT MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    /**
     * Check if there's a resumable checkpoint for a document
     */
    async hasCheckpoint(userId: string, documentHash: string): Promise<boolean> {
        const checkpoint = await this.offlineParser.getCheckpoint(userId, documentHash);
        return checkpoint !== null;
    }

    /**
     * Resume parsing from a checkpoint
     */
    async resumeFromCheckpoint(
        userId: string,
        documentHash: string,
        options: ParseOptions = {}
    ): Promise<ParseResult | null> {
        const checkpoint = await this.offlineParser.getCheckpoint(userId, documentHash);

        if (!checkpoint || !checkpoint.partialResults?.documentText) {
            return null;
        }

        // Continue from where we left off
        const file = new File(
            [checkpoint.partialResults.documentText],
            'resumed-content.txt',
            { type: 'text/plain' }
        );

        return this.parseDocument(file, {
            ...options,
            userId,
        });
    }

    // ─────────────────────────────────────────────────────────────
    // LEARNING & CORRECTIONS
    // ─────────────────────────────────────────────────────────────

    /**
     * Log a teacher correction for learning
     */
    async logCorrection(
        questionText: string,
        originalType: import('../../types/QuestionSchema').QuestionType,
        correctedType: import('../../types/QuestionSchema').QuestionType,
        teacherId: string
    ): Promise<void> {
        await this.learning.logCorrection({
            questionText,
            originalType,
            correctedType,
            source: 'ai',
            teacherId,
        });
    }

    /**
     * Get statistics about corrections for a specific question type
     */
    async getTypeStats(type: import('../../types/QuestionSchema').QuestionType) {
        return this.learning.getTypeStats(type);
    }

    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    private createMetadata(
        startTime: number,
        stageTimesMs: Record<string, number>,
        extractionSource: 'ai' | 'rules' | 'offline' | 'hybrid',
        usedAI: boolean,
        usedOfflineFallback: boolean,
        resumedFromCheckpoint: boolean,
        checkpointId?: string
    ): ParseMetadata {
        return {
            totalTimeMs: Date.now() - startTime,
            stageTimesMs,
            extractionSource,
            usedAI,
            usedOfflineFallback,
            resumedFromCheckpoint,
            checkpointId,
        };
    }

    /**
     * Check if the service is ready (all dependencies available)
     */
    isReady(): boolean {
        return true; // All services are singletons, always available
    }

    /**
     * Check network status
     */
    isOnline(): boolean {
        return this.offlineParser.isOnline();
    }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORTS
// ═══════════════════════════════════════════════════════════════

/**
 * Default TestCreationService instance
 */
export const testCreationService = new TestCreationService();

// ═══════════════════════════════════════════════════════════════
// INDIVIDUAL SERVICE EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
    // Services (singleton instances)
    documentConverter,
    aiExtractor,
    typeClassifierService,
    validatorService,
    learningService,
    offlineParserService,

    // Classes (for testing/extending)
    TestCreationService,
    DocumentConverterService,
    AIExtractorService,
    TypeClassifierService,
    ValidatorService,
    LearningService,
    OfflineParserService,
};

// Default export
export default testCreationService;

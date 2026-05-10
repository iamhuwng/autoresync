/**
 * Test Creation Service - Unified Facade
 *
 * Main entry point for automated IELTS Reading test creation.
 * The public parse contract stays stable for the modal and review flow,
 * while the internal orchestration now runs as explicit staged artifacts.
 */

import { documentConverter, DocumentConverterService } from './document-converter.service';
import {
    aiExtractor,
    AIExtractorService,
    type ExtractedPassage,
    type ExtractionResult,
} from './ai-extractor.service';
import {
    typeClassifierService,
    TypeClassifierService,
    type ClassificationResult,
} from './type-classifier.service';
import {
    validatorService,
    ValidatorService,
    type AIQuestionResult,
    type RulesQuestionResult,
    type ComparisonResult,
} from './validator.service';
import {
    learningService,
    LearningService,
} from './learning.service';
import {
    offlineParserService,
    OfflineParserService,
    type LocalParseResult,
} from './offline-parser.service';
import type {
    ReadingLabeledOption,
    ReadingOptionLabelFormat,
    ReadingSectionReference,
} from '../../types/document.types';
import type {
    QuestionGroupsField,
    TableCompletionDiagnosticsField,
} from '../../types/tableCompletion';
import type { QuestionType } from '../../types/QuestionSchema';
import {
    buildTableCompletionSectionInstruction,
    deriveTableCompletionQuestionsFromGroup,
    sortTableCompletionQuestionGroups,
} from './tableCompletionTransforms';
import {
    createRawSourceArtifact,
    repairFormattedTest,
    verifyFormattedTest,
    type FormattedTestArtifact,
    type RawSourceArtifact,
    type RepairArtifact,
    type VerificationArtifact,
    type VerifiedFormattedTest,
} from './source-fidelity';

export type { ConversionResult } from './document-converter.service';
export type {
    ExtractedPassage,
    ExtractedQuestion,
    ExtractionResult,
    ExtractionCheckpoint,
    ExtractionOptions,
} from './ai-extractor.service';
export type {
    ClassificationResult,
    WordLimitResult,
} from './type-classifier.service';
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
export type {
    CorrectionLog,
    CorrectionPattern,
    CorrectionInput,
    TypeCorrectionStats,
    CorrectionAnalytics,
} from './learning.service';
export type {
    LocalParseResult,
    ParsedPassage,
    ParsedQuestion,
    OfflineVsAIComparison,
    TypeDifference,
    ParsingCheckpoint,
} from './offline-parser.service';
export type { QuestionType, OptionLabelFormat } from '../../types/QuestionSchema';
export { QUESTION_TYPES } from '../../types/QuestionSchema';

export interface ParseOptions {
    onProgress?: (stage: ParseStage, progress: number, message: string) => void;
    userId?: string;
    rulesOnly?: boolean;
    aiTimeoutMs?: number;
    enableCheckpoints?: boolean;
}

export type ParseStage =
    | 'converting'
    | 'extracting'
    | 'classifying'
    | 'validating'
    | 'assembling'
    | 'complete'
    | 'error';

export type ParseArtifactStage =
    | 'normalized-source'
    | 'extraction'
    | 'classification'
    | 'validation'
    | 'review-draft';

export interface ParseMetadata {
    totalTimeMs: number;
    stageTimesMs: Record<string, number>;
    extractionSource: 'ai' | 'rules' | 'offline' | 'hybrid';
    usedAI: boolean;
    usedOfflineFallback: boolean;
    resumedFromCheckpoint: boolean;
    checkpointId?: string;
}

export interface ParseArtifact<TStage extends ParseArtifactStage, TData> {
    stage: TStage;
    createdAt: string;
    durationMs: number;
    data: TData;
}

export interface NormalizedSourceArtifactData {
    fileName: string;
    mimeType: string;
    documentText: string;
    documentHash?: string;
    rawSource: RawSourceArtifact;
}

export interface ExtractionArtifactData {
    extractionSource: 'ai' | 'rules' | 'offline' | 'hybrid';
    usedAI: boolean;
    usedOfflineFallback: boolean;
    aiResult: ExtractionResult | null;
    offlineParseResult: LocalParseResult | null;
    formattedTest: FormattedTestArtifact;
    verification: VerificationArtifact;
    repair: RepairArtifact | null;
    extractedPassages: ExtractedPassage[];
    aiQuestions: AIQuestionResult[];
}

export interface ClassificationArtifactData {
    rulesResults: ClassificationResult[];
    rulesQuestions: RulesQuestionResult[];
}

export interface ValidationArtifactData {
    validationResult: ComparisonResult;
}

export interface ReviewDraftPassage {
    id: string;
    title: string;
    content: string;
    wordCount: number;
    questionRange?: {
        start: number;
        end: number;
    };
}

export interface ReviewDraftQuestion {
    questionNumber: number;
    questionText: string;
    type: QuestionType;
    options?: string[] | null;
    labeledOptions?: ReadingLabeledOption[] | null;
    sectionReferences?: ReadingSectionReference[] | null;
    optionLabelFormat?: ReadingOptionLabelFormat;
    answer?: string | string[];
    passageId?: string;
    sectionInstructionId?: string;
    groupId?: string;
    blankId?: string;
    anchorId?: string;
    groupTaskType?: 'table-completion';
    tableGroupSchemaVersion?: number;
    pendingTableReclassification?: boolean;
    confidence: number;
    uncertain: boolean;
    wordLimit?: {
        min?: number;
        max: number;
        includesNumber?: boolean;
    };
}

export interface ReviewDraftArtifactData {
    passages: ReviewDraftPassage[];
    questions: ReviewDraftQuestion[];
    questionGroups: QuestionGroupsField;
    tableCompletionDiagnostics: TableCompletionDiagnosticsField;
    sectionInstructions: Record<string, string>;
}

export interface ParseJobArtifacts {
    normalizedSource: ParseArtifact<'normalized-source', NormalizedSourceArtifactData>;
    extraction: ParseArtifact<'extraction', ExtractionArtifactData>;
    classification: ParseArtifact<'classification', ClassificationArtifactData>;
    validation: ParseArtifact<'validation', ValidationArtifactData>;
    reviewDraft: ParseArtifact<'review-draft', ReviewDraftArtifactData>;
}

export interface ParseJob {
    id: string;
    strategy: 'reading-staged-v1';
    artifacts: ParseJobArtifacts;
}

export interface ParseResult {
    success: boolean;
    error?: string;
    documentText?: string;
    passages?: ExtractedPassage[];
    validationResult?: ComparisonResult;
    parseJob?: ParseJob;
    metadata: ParseMetadata;
}

interface ExtractionContext {
    sourceArtifact: ParseArtifact<'normalized-source', NormalizedSourceArtifactData>;
    isOnline: boolean;
    rulesOnly: boolean;
    aiTimeoutMs: number;
    enableCheckpoints: boolean;
    onProgress?: (stage: ParseStage, progress: number, message: string) => void;
}

const TABLE_PIPELINE_DIAG_PREFIX = '[Diag][TableCanonicalPipeline]';

const logTablePipelineDiag = (event: string, payload: Record<string, unknown>): void => {
    if (!import.meta.env.DEV) {
        return;
    }

    console.log(`${TABLE_PIPELINE_DIAG_PREFIX} ${event}`, payload);
};

class TestCreationService {
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

        let checkpointId: string | undefined;
        const resumedFromCheckpoint = false;
        let extractionSource: 'ai' | 'rules' | 'offline' | 'hybrid' = 'rules';
        let usedAI = false;
        let usedOfflineFallback = false;

        try {
            onProgress?.('converting', 0, 'Converting document...');
            const conversionStart = Date.now();
            const conversionResult = await this.documentConverter.convertToText(file);

            if (!conversionResult.success || !conversionResult.data) {
                return {
                    success: false,
                    error: 'Document conversion failed',
                    metadata: this.createMetadata(
                        startTime,
                        stageTimesMs,
                        extractionSource,
                        false,
                        false,
                        resumedFromCheckpoint
                    ),
                };
            }

            const documentText = conversionResult.data.text;
            const rawSource = createRawSourceArtifact(documentText);
            let documentHash = '';
            if (enableCheckpoints && userId) {
                documentHash = await this.offlineParser.hashDocument(documentText);
            }

            stageTimesMs.converting = Date.now() - conversionStart;
            onProgress?.('converting', 100, 'Document converted');

            const sourceArtifact = this.createArtifact('normalized-source', stageTimesMs.converting, {
                fileName: file.name,
                mimeType: file.type,
                documentText,
                documentHash: documentHash || undefined,
                rawSource,
            });

            onProgress?.('extracting', 0, 'Extracting content...');
            const extractionArtifact = await this.extractContent({
                sourceArtifact,
                isOnline: this.offlineParser.isOnline(),
                rulesOnly,
                aiTimeoutMs,
                enableCheckpoints,
                onProgress,
            });
            stageTimesMs.extracting = extractionArtifact.durationMs;
            extractionSource = extractionArtifact.data.extractionSource;
            usedAI = extractionArtifact.data.usedAI;
            usedOfflineFallback = extractionArtifact.data.usedOfflineFallback;

            onProgress?.('classifying', 0, 'Classifying questions...');
            const classificationArtifact = this.classifyQuestions(extractionArtifact);
            stageTimesMs.classifying = classificationArtifact.durationMs;
            onProgress?.('classifying', 100, 'Classification complete');

            if (enableCheckpoints && userId && documentHash) {
                checkpointId = await this.offlineParser.saveCheckpoint(
                    userId,
                    documentHash,
                    'classifying',
                    75,
                    {
                        documentText: sourceArtifact.data.documentText,
                        rawSource: sourceArtifact.data.rawSource,
                        formattedTest: extractionArtifact.data.formattedTest,
                        verification: extractionArtifact.data.verification,
                        repair: extractionArtifact.data.repair,
                    }
                );
            }

            onProgress?.('validating', 0, 'Validating results...');
            const validationArtifact = this.validateResults(
                sourceArtifact,
                extractionArtifact,
                classificationArtifact,
            );
            stageTimesMs.validating = validationArtifact.durationMs;
            onProgress?.('validating', 100, 'Validation complete');

            onProgress?.('assembling', 0, 'Assembling review payload...');
            const reviewDraftArtifact = this.buildReviewDraft(extractionArtifact, validationArtifact);
            stageTimesMs.assembling = reviewDraftArtifact.durationMs;
            onProgress?.('assembling', 100, 'Review payload ready');

            if (checkpointId && userId && documentHash) {
                await this.offlineParser.deleteCheckpoint(userId, documentHash).catch(() => {});
            }

            const parseJob = this.createParseJob(
                sourceArtifact,
                extractionArtifact,
                classificationArtifact,
                validationArtifact,
                reviewDraftArtifact
            );

            onProgress?.('complete', 100, 'Parsing complete!');

            return {
                success: true,
                documentText: sourceArtifact.data.documentText,
                passages: reviewDraftArtifact.data.passages,
                validationResult: validationArtifact.data.validationResult,
                parseJob,
                metadata: this.createMetadata(
                    startTime,
                    stageTimesMs,
                    extractionSource,
                    usedAI,
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
                metadata: this.createMetadata(
                    startTime,
                    stageTimesMs,
                    extractionSource,
                    usedAI,
                    usedOfflineFallback,
                    resumedFromCheckpoint,
                    checkpointId
                ),
            };
        }
    }

    async parseText(text: string, options: ParseOptions = {}): Promise<ParseResult> {
        const file = new File([text], 'pasted-content.txt', { type: 'text/plain' });
        return this.parseDocument(file, options);
    }

    async hasCheckpoint(userId: string, documentHash: string): Promise<boolean> {
        const checkpoint = await this.offlineParser.getCheckpoint(userId, documentHash);
        return checkpoint !== null;
    }

    async resumeFromCheckpoint(
        userId: string,
        documentHash: string,
        options: ParseOptions = {}
    ): Promise<ParseResult | null> {
        const checkpoint = await this.offlineParser.getCheckpoint(userId, documentHash);

        if (!checkpoint || !checkpoint.partialResults?.documentText) {
            return null;
        }

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

    async logCorrection(
        questionText: string,
        originalType: QuestionType,
        correctedType: QuestionType,
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

    async getTypeStats(type: QuestionType) {
        return this.learning.getTypeStats(type);
    }

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

    private createArtifact<TStage extends ParseArtifactStage, TData>(
        stage: TStage,
        durationMs: number,
        data: TData
    ): ParseArtifact<TStage, TData> {
        return {
            stage,
            createdAt: new Date().toISOString(),
            durationMs,
            data,
        };
    }

    private createParseJob(
        normalizedSource: ParseArtifact<'normalized-source', NormalizedSourceArtifactData>,
        extraction: ParseArtifact<'extraction', ExtractionArtifactData>,
        classification: ParseArtifact<'classification', ClassificationArtifactData>,
        validation: ParseArtifact<'validation', ValidationArtifactData>,
        reviewDraft: ParseArtifact<'review-draft', ReviewDraftArtifactData>
    ): ParseJob {
        return {
            id: `parse-job-${Date.now()}`,
            strategy: 'reading-staged-v1',
            artifacts: {
                normalizedSource,
                extraction,
                classification,
                validation,
                reviewDraft,
            },
        };
    }

    private async extractContent(
        context: ExtractionContext
    ): Promise<ParseArtifact<'extraction', ExtractionArtifactData>> {
        const start = Date.now();
        const { sourceArtifact, isOnline, rulesOnly, aiTimeoutMs, enableCheckpoints, onProgress } = context;
        const { documentText, fileName, rawSource } = sourceArtifact.data;

        let aiResult: ExtractionResult | null = null;
        let offlineParseResult: LocalParseResult | null = null;
        let extractionSource: 'ai' | 'rules' | 'offline' | 'hybrid' = 'rules';
        let usedAI = false;
        let usedOfflineFallback = false;

        if (rulesOnly || !isOnline) {
            if (!isOnline) {
                usedOfflineFallback = true;
                extractionSource = 'offline';
                onProgress?.('extracting', 10, 'Offline mode: using rule-based parsing...');
            } else {
                extractionSource = 'rules';
            }

            offlineParseResult = await this.offlineParser.parseOffline(documentText, fileName);
            onProgress?.('extracting', 80, 'Rule-based extraction complete');
        } else {
            try {
                const extractResult = await this.aiExtractor.extractReadingTest(documentText, {
                    onProgress: (stage: string, percent: number) => {
                        onProgress?.('extracting', Math.min(percent, 80), stage);
                    },
                    enableCheckpoints,
                    timeout: aiTimeoutMs,
                });

                if (!extractResult.success || !extractResult.data) {
                    throw new Error(
                        extractResult.success
                            ? 'AI extraction returned no data'
                            : extractResult.error || 'AI extraction returned no data',
                    );
                }

                aiResult = extractResult.data;
                usedAI = true;
                extractionSource = 'hybrid';
                onProgress?.('extracting', 80, 'AI extraction complete');
            } catch (aiError) {
                console.warn('[TestCreation] AI extraction failed, falling back to rules:', aiError);
                offlineParseResult = await this.offlineParser.parseOffline(documentText, fileName);
                usedOfflineFallback = true;
                extractionSource = 'offline';
                onProgress?.('extracting', 80, 'Fallback: Rule-based extraction complete');
            }
        }

        onProgress?.('extracting', 90, 'Verifying formatted content against source...');
        const formattedTest = this.buildFormattedTestArtifact(
            rawSource,
            aiResult,
            offlineParseResult,
            extractionSource,
        );
        let verification = verifyFormattedTest(rawSource, formattedTest);
        let repair: RepairArtifact | null = null;
        let finalFormattedTest = formattedTest;

        if (verification.hasBlockingDamage) {
            onProgress?.('extracting', 95, 'Repairing source fidelity gaps...');
            repair = repairFormattedTest(rawSource, formattedTest, verification);
            finalFormattedTest = repair.repairedFormattedTest;
            verification = repair.verification;
        }

        onProgress?.(
            'extracting',
            100,
            verification.hasBlockingDamage
                ? 'Extraction completed with source-fidelity review required'
                : repair
                    ? 'Extraction repaired and verified'
                    : 'Extraction verified',
        );

        logTablePipelineDiag('extraction_artifact_ready', {
            extractionSource,
            usedAI,
            usedOfflineFallback,
            aiPassageCount: aiResult?.passages?.length || 0,
            aiQuestionCount: aiResult?.questions?.length || 0,
            offlineQuestionCount: offlineParseResult?.questions?.length || 0,
            formattedQuestionCount: finalFormattedTest.questions.length,
            verifiedQuestionCount: verification.verifiedTest.questions.length,
            verifiedPassageCount: verification.verifiedTest.passages.length,
            blockingDamageCount: verification.damageRegions.filter(
                (damage) => damage.severity === 'blocking',
            ).length,
            warningDamageCount: verification.damageRegions.filter(
                (damage) => damage.severity === 'warning',
            ).length,
        });

        return this.createArtifact('extraction', Date.now() - start, {
            extractionSource,
            usedAI,
            usedOfflineFallback,
            aiResult,
            offlineParseResult,
            formattedTest: finalFormattedTest,
            verification,
            repair,
            extractedPassages: this.collectExtractedPassages(verification.verifiedTest),
            aiQuestions: this.collectAIQuestions(verification.verifiedTest),
        });
    }

    private classifyQuestions(
        extractionArtifact: ParseArtifact<'extraction', ExtractionArtifactData>
    ): ParseArtifact<'classification', ClassificationArtifactData> {
        const start = Date.now();
        const { aiQuestions } = extractionArtifact.data;
        const rulesResults = aiQuestions.map((question) =>
            this.typeClassifier.detectFromSectionContext(
                question.sectionInstruction || '',
                question.questionText,
                (question.labeledOptions || question.options || [])
                    .map((option) => typeof option === 'string' ? option : option.text)
                    .filter((option): option is string => Boolean(option))
            )
        );

        const rulesQuestions: RulesQuestionResult[] = rulesResults.map((result, index) => ({
            questionNumber: aiQuestions[index]?.questionNumber ?? index + 1,
            type: result.type,
            confidence: result.confidence,
            ...(result.wordLimit ? {
                wordLimit: {
                    max: result.wordLimit.maxWords,
                    includesNumber: result.wordLimit.allowNumber,
                },
            } : {}),
            optionLabelFormat:
                result.optionLabelFormat === 'roman'
                    ? 'roman'
                    : result.optionLabelFormat === 'number'
                        ? 'number'
                        : 'letter',
        }));

        return this.createArtifact('classification', Date.now() - start, {
            rulesResults,
            rulesQuestions,
        });
    }

    private validateResults(
        sourceArtifact: ParseArtifact<'normalized-source', NormalizedSourceArtifactData>,
        extractionArtifact: ParseArtifact<'extraction', ExtractionArtifactData>,
        classificationArtifact: ParseArtifact<'classification', ClassificationArtifactData>
    ): ParseArtifact<'validation', ValidationArtifactData> {
        const start = Date.now();
        const validationResult = this.validator.compareAIvsRules(
            extractionArtifact.data.aiQuestions,
            classificationArtifact.data.rulesQuestions,
            {
                documentText: sourceArtifact.data.documentText,
                verification: extractionArtifact.data.verification,
                rawAnswerKey: sourceArtifact.data.rawSource.answerKeyBlock?.answers || {},
            },
        );

        logTablePipelineDiag('validation_artifact_ready', {
            aiQuestionCount: extractionArtifact.data.aiQuestions.length,
            rulesQuestionCount: classificationArtifact.data.rulesQuestions.length,
            mergedQuestionCount: validationResult.mergedQuestions.length,
            questionGroupCount: validationResult.questionGroups.length,
            diagnosticCount: validationResult.tableCompletionDiagnostics.length,
            blockingDamageCount: validationResult.sourceFidelity?.blockingDamageCount ?? 0,
            missingQuestionNumbers: validationResult.questionRangeContinuity?.missingQuestionNumbers || [],
            extraQuestionNumbers: validationResult.questionRangeContinuity?.extraQuestionNumbers || [],
        });

        return this.createArtifact('validation', Date.now() - start, {
            validationResult,
        });
    }

    private buildReviewDraft(
        extractionArtifact: ParseArtifact<'extraction', ExtractionArtifactData>,
        validationArtifact: ParseArtifact<'validation', ValidationArtifactData>
    ): ParseArtifact<'review-draft', ReviewDraftArtifactData> {
        const start = Date.now();
        const passages = extractionArtifact.data.extractedPassages.map((passage) => ({
            id: passage.id,
            title: passage.title,
            content: passage.content,
            wordCount: passage.wordCount,
            questionRange: passage.questionRange,
        }));
        const sortedQuestionGroups = sortTableCompletionQuestionGroups(
            validationArtifact.data.validationResult.questionGroups,
            passages.map((passage) => passage.id),
        );
        const canonicalTableQuestionNumbers = new Set(
            sortedQuestionGroups.flatMap((group) => group.blanks.map((blank) => blank.questionNumber)),
        );
        const mergedQuestionLookup = new Map(
            validationArtifact.data.validationResult.mergedQuestions.map((question) => [
                question.questionNumber,
                question,
            ]),
        );

        const nonCanonicalQuestions = validationArtifact.data.validationResult.mergedQuestions
            .filter((question) => !canonicalTableQuestionNumbers.has(question.questionNumber))
            .map((question) => ({
            questionNumber: question.questionNumber,
            questionText: question.questionText,
            type: question.type,
            options: question.options || null,
            labeledOptions: question.labeledOptions || null,
            sectionReferences: question.sectionReferences || null,
            optionLabelFormat: question.optionLabelFormat,
            answer: question.answer,
            passageId: question.passageId,
            sectionInstructionId: question.sectionInstructionId,
            groupId: question.groupId,
            blankId: question.blankId,
            anchorId: question.anchorId,
            groupTaskType: question.groupTaskType,
            tableGroupSchemaVersion: question.tableGroupSchemaVersion,
            pendingTableReclassification: question.pendingTableReclassification,
            confidence: question.confidence,
            uncertain: question.uncertain,
            wordLimit: question.wordLimit,
        }));
        const regeneratedCanonicalQuestions = sortedQuestionGroups.flatMap((group) =>
            deriveTableCompletionQuestionsFromGroup(group).map((derivedQuestion) => {
                const existingQuestion = mergedQuestionLookup.get(derivedQuestion.questionNumber);
                const acceptableAnswers = derivedQuestion.acceptableAnswers || [];

                return {
                    questionNumber: derivedQuestion.questionNumber,
                    questionText: derivedQuestion.questionText,
                    type: 'table-completion' as const,
                    options: null,
                    labeledOptions: null,
                    sectionReferences: existingQuestion?.sectionReferences || null,
                    optionLabelFormat: existingQuestion?.optionLabelFormat,
                    answer:
                        acceptableAnswers.length <= 1
                            ? acceptableAnswers[0] || existingQuestion?.answer
                            : acceptableAnswers,
                    passageId: derivedQuestion.passageId,
                    sectionInstructionId: derivedQuestion.sectionInstructionId,
                    groupId: derivedQuestion.groupId,
                    blankId: derivedQuestion.blankId,
                    anchorId: derivedQuestion.anchorId,
                    groupTaskType: derivedQuestion.groupTaskType,
                    tableGroupSchemaVersion: derivedQuestion.tableGroupSchemaVersion,
                    pendingTableReclassification: false,
                    confidence: existingQuestion?.confidence ?? derivedQuestion.confidence,
                    uncertain: existingQuestion?.uncertain ?? false,
                    wordLimit: derivedQuestion.wordLimit
                        ? {
                            max: derivedQuestion.wordLimit,
                            ...(derivedQuestion.includesNumber !== undefined
                                ? { includesNumber: derivedQuestion.includesNumber }
                                : {}),
                        }
                        : existingQuestion?.wordLimit,
                };
            }),
        );
        const questions = [...nonCanonicalQuestions, ...regeneratedCanonicalQuestions].sort(
            (left, right) => left.questionNumber - right.questionNumber,
        );
        const sectionInstructions = validationArtifact.data.validationResult.mergedQuestions.reduce<Record<string, string>>((acc, question) => {
            if (
                question.sectionInstructionId &&
                question.sectionInstruction?.trim() &&
                !acc[question.sectionInstructionId]
            ) {
                acc[question.sectionInstructionId] = question.sectionInstruction.trim();
            }

            return acc;
        }, {});

        sortedQuestionGroups.forEach((group) => {
            const sectionInstruction = buildTableCompletionSectionInstruction(group).trim();
            if (sectionInstruction) {
                sectionInstructions[group.groupId] = sectionInstruction;
            }
        });

        if (questions.length === 0) {
            logTablePipelineDiag('review_draft_empty', {
                extractedPassageCount: extractionArtifact.data.extractedPassages.length,
                extractedQuestionCount: extractionArtifact.data.aiQuestions.length,
                mergedQuestionCount: validationArtifact.data.validationResult.mergedQuestions.length,
                questionGroupCount: sortedQuestionGroups.length,
                canonicalTableQuestionCount: canonicalTableQuestionNumbers.size,
            });
            throw new Error('Parsing produced no questions');
        }

        logTablePipelineDiag('review_draft_assembled', {
            passageCount: passages.length,
            questionCount: questions.length,
            questionGroupCount: sortedQuestionGroups.length,
            diagnosticCount:
                validationArtifact.data.validationResult.tableCompletionDiagnostics.length,
            pendingTableReclassificationCount: questions.filter(
                (question) => question.pendingTableReclassification,
            ).length,
        });

        return this.createArtifact('review-draft', Date.now() - start, {
            passages,
            questions,
            questionGroups: sortedQuestionGroups,
            tableCompletionDiagnostics:
                validationArtifact.data.validationResult.tableCompletionDiagnostics,
            sectionInstructions,
        });
    }

    private buildFormattedTestArtifact(
        rawSource: RawSourceArtifact,
        aiResult: ExtractionResult | null,
        offlineParseResult: LocalParseResult | null,
        extractionSource: ExtractionArtifactData['extractionSource'],
    ): FormattedTestArtifact {
        if (aiResult) {
            return {
                passages: aiResult.passages.map((passage, index) => ({
                    id: passage.id,
                    title: passage.title,
                    content: passage.content,
                    order: index + 1,
                    questionRange: passage.questionRange,
                    sourceAnchors: [],
                })),
                questions: aiResult.questions.map((question) => ({
                    id: `question-${question.number}`,
                    questionNumber: question.number,
                    questionText: question.text,
                    instructions: question.instructions,
                    options: question.options || null,
                    labeledOptions: question.labeledOptions || null,
                    optionLabelFormat: question.optionLabelFormat,
                    sectionReferences: question.sectionReferences || null,
                    answer: question.suggestedAnswer,
                    passageId: question.passageId,
                    suggestedType: question.suggestedType,
                    confidence: question.confidence,
                    sourceAnchors: [],
                })),
                answerKey:
                    Object.keys(aiResult.answerKey || {}).length > 0
                        ? {
                            id: 'answer-key',
                            answers: aiResult.answerKey,
                            sourceAnchors: [],
                        }
                        : null,
                metadata: {
                    source: extractionSource,
                    repaired: false,
                },
            };
        }

        return {
            passages: (offlineParseResult?.passages || []).map((passage, index) => ({
                id: passage.id,
                title: passage.title,
                content: passage.content,
                order: passage.order || index + 1,
                questionRange: passage.questionRange,
                sourceAnchors: passage.sourceAnchor ? [passage.sourceAnchor] : [],
            })),
            questions: (offlineParseResult?.questions || []).map((question) => ({
                id: `question-${question.questionNumber}`,
                questionNumber: question.questionNumber,
                questionText: question.questionText,
                instructions: question.sectionInstruction,
                options: question.options || null,
                labeledOptions: null,
                optionLabelFormat: question.classificationDetails?.optionLabelFormat === 'roman'
                    ? 'roman'
                    : question.classificationDetails?.optionLabelFormat === 'number'
                        ? 'number'
                        : 'letter',
                sectionReferences: null,
                answer: question.answer,
                passageId: question.passageId,
                suggestedType: question.type,
                confidence: question.confidence,
                sourceAnchors: question.sourceAnchors || [],
            })),
            answerKey: rawSource.answerKeyBlock
                ? {
                    id: 'answer-key',
                    answers: rawSource.answerKeyBlock.answers,
                    sourceAnchors: [rawSource.answerKeyBlock.anchor],
                }
                : null,
            metadata: {
                source: extractionSource,
                repaired: false,
            },
        };
    }

    private collectAIQuestions(
        verifiedTest: VerifiedFormattedTest,
    ): AIQuestionResult[] {
        return verifiedTest.questions.map((question) => ({
            questionNumber: question.questionNumber,
            questionText: question.questionText,
            type: question.suggestedType || 'multiple-choice',
            options: question.options || null,
            labeledOptions: question.labeledOptions || null,
            answer: question.answer,
            passageId: question.passageId,
            sectionInstruction: question.instructions,
            confidence: question.confidence,
            optionLabelFormat: question.optionLabelFormat,
            sectionReferences: question.sectionReferences || null,
        }));
    }

    private collectExtractedPassages(
        verifiedTest: VerifiedFormattedTest,
    ): ExtractedPassage[] {
        return verifiedTest.passages.map((passage) => ({
            id: passage.id,
            title: passage.title,
            content: passage.content,
            wordCount: passage.content.trim().split(/\s+/).filter(Boolean).length,
            questionRange: passage.questionRange,
        }));
    }

    isReady(): boolean {
        return true;
    }

    isOnline(): boolean {
        return this.offlineParser.isOnline();
    }
}

export const testCreationService = new TestCreationService();

export {
    documentConverter,
    aiExtractor,
    typeClassifierService,
    validatorService,
    learningService,
    offlineParserService,
    TestCreationService,
    DocumentConverterService,
    AIExtractorService,
    TypeClassifierService,
    ValidatorService,
    LearningService,
    OfflineParserService,
};

export default testCreationService;

/**
 * Validation Service for IELTS Reading Tests
 * 
 * Compares AI-based extraction with rule-based classification to:
 * - Detect discrepancies between AI and rules
 * - Generate confidence scores
 * - Flag uncertain items for teacher review
 * - Validate completeness of extracted tests
 * 
 * @module validator.service
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 5
 */

import type { QuestionType } from '../../types/QuestionSchema';
import type {
    ReadingLabeledOption,
    ReadingOptionLabelFormat,
    ReadingSectionReference,
} from '../../types/document.types';
import { canonicalizeReadingQuestion } from '../../utils/readingQuestionContract';
import type {
    QuestionGroupsField,
    TableCompletionDiagnosticsField,
} from '../../types/tableCompletion';
import {
    canonicalizeTableCompletionGroup,
    type TableCompletionSourceQuestion,
} from './tableCompletionCanonicalizer';
import { deriveTableCompletionQuestionsFromGroup } from './tableCompletionTransforms';
import {
    buildTableCompletionDiagnostic,
    validateTableCompletionCanonicalization,
    type TableCompletionIssue,
} from './tableCompletionValidator';
import type {
    DamageRegion,
    VerificationArtifact,
} from './source-fidelity';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Result from AI extraction for a single question
 */
export interface AIQuestionResult {
    questionNumber: number;
    questionText: string;
    type: QuestionType | string;
    options?: Array<string | ReadingLabeledOption> | null;
    labeledOptions?: ReadingLabeledOption[] | null;
    answer?: string | string[];
    passageId?: string;
    confidence: number;
    optionLabelFormat?: ReadingOptionLabelFormat;
    sectionReferences?: ReadingSectionReference[] | null;
    sectionInstruction?: string;
}

/**
 * Result from rule-based classification for a single question
 */
export interface RulesQuestionResult {
    questionNumber: number;
    type: QuestionType;
    confidence: number;
    wordLimit?: {
        min?: number;
        max: number;
        includesNumber?: boolean;
    };
    optionLabelFormat?: ReadingOptionLabelFormat;
    reuseLettersAllowed?: boolean;
}

/**
 * Discrepancy between AI and Rules results
 */
export interface Discrepancy {
    questionNumber: number;
    field: 'type' | 'options' | 'answer' | 'passageId';
    aiValue: unknown;
    rulesValue: unknown;
    severity: 'low' | 'medium' | 'high';
    recommendation: 'use_ai' | 'use_rules' | 'manual_review';
}

/**
 * Result of comparing AI and Rules
 */
export interface ComparisonResult {
    /** Overall comparison confidence (0-100) */
    confidence: number;
    /** Number of questions that matched */
    matchedCount: number;
    /** Number of questions with discrepancies */
    discrepancyCount: number;
    /** List of all discrepancies */
    discrepancies: Discrepancy[];
    /** Merged result (weighted combination) */
    mergedQuestions: MergedQuestion[];
    /** Canonical grouped table payloads derived during validation */
    questionGroups: QuestionGroupsField;
    /** Grouped table issues adapted directly from the canonical validator contract */
    tableCompletionIssues: TableCompletionIssue[];
    /** Grouped table diagnostics for canonical and unresolved runs */
    tableCompletionDiagnostics: TableCompletionDiagnosticsField;
    /** Raw-source fidelity status produced by verification */
    sourceFidelity: SourceFidelityResult;
    /** Continuity checks between raw numbered questions and merged output */
    questionRangeContinuity: QuestionRangeContinuityResult;
    /** Answer-key coverage consistency derived from raw source */
    answerCoverageConsistency: AnswerCoverageConsistencyResult;
}

export interface CompareAIvsRulesContext {
    documentText?: string;
    verification?: VerificationArtifact;
    rawAnswerKey?: Record<number, string | string[]>;
}

export interface SourceFidelityResult {
    pass: boolean;
    blockingDamageCount: number;
    warningDamageCount: number;
    damageRegions: DamageRegion[];
}

export interface QuestionRangeContinuityResult {
    complete: boolean;
    rawQuestionNumbers: number[];
    mergedQuestionNumbers: number[];
    missingQuestionNumbers: number[];
    extraQuestionNumbers: number[];
}

export interface AnswerCoverageConsistencyResult {
    hasRawAnswerKey: boolean;
    answeredCount: number;
    missingQuestionNumbers: number[];
    mismatchedQuestionNumbers: number[];
    nonBlocking: boolean;
}

/**
 * Merged question combining AI and Rules results
 */
export interface MergedQuestion {
    questionNumber: number;
    questionText: string;
    type: QuestionType;
    options?: string[] | null;
    labeledOptions?: ReadingLabeledOption[] | null;
    sectionReferences?: ReadingSectionReference[] | null;
    answer?: string | string[];
    passageId?: string;
    sectionInstruction?: string;
    sectionInstructionId?: string;
    /** Weighted confidence (rules 50%, AI 50%) */
    confidence: number;
    /** Source of the type decision */
    typeSource: 'ai' | 'rules' | 'consensus';
    /** Metadata from rules classifier */
    wordLimit?: {
        min?: number;
        max: number;
        includesNumber?: boolean;
    };
    optionLabelFormat?: ReadingOptionLabelFormat;
    reuseLettersAllowed?: boolean;
    /** Flagged for teacher review */
    uncertain: boolean;
    /** Reason for uncertainty */
    uncertainReason?: string;
    groupId?: string;
    blankId?: string;
    anchorId?: string;
    groupTaskType?: 'table-completion';
    tableGroupSchemaVersion?: number;
    pendingTableReclassification?: boolean;
}

/**
 * Validation result for answer key
 */
export interface AnswerKeyValidation {
    valid: boolean;
    errors: AnswerKeyError[];
    warnings: AnswerKeyWarning[];
    coverage: {
        total: number;
        answered: number;
        missing: number[];
    };
}

export interface AnswerKeyError {
    questionNumber: number;
    error: string;
    expected?: string;
    received?: string;
}

export interface AnswerKeyWarning {
    questionNumber: number;
    warning: string;
    suggestion?: string;
}

/**
 * Incomplete test detection result
 */
export interface CompletenessResult {
    complete: boolean;
    score: number; // 0-100
    issues: CompletenessIssue[];
}

export interface CompletenessIssue {
    type: 'missing_passage' | 'missing_answer' | 'missing_options' | 'diagram_needs_image' | 'ambiguous_answer';
    questionNumber?: number;
    passageId?: string;
    severity: 'error' | 'warning';
    message: string;
    resolution?: string;
}

/**
 * Uncertain item for sidebar display
 */
export interface UncertainItem {
    id: string;
    questionNumber: number;
    type: 'type_mismatch' | 'low_confidence' | 'missing_answer' | 'ambiguous_answer' | 'diagram_question';
    message: string;
    severity: 'low' | 'medium' | 'high';
    aiSuggestion?: string;
    rulesSuggestion?: string;
    resolved: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Discrepancy threshold - below this confidence, flag for review */
const UNCERTAINTY_THRESHOLD = 90;

/** Weights for combined confidence scoring
 * Both AI and rules run independently per PRD FR-15.
 * Teacher decides which to trust (FR-17). Equal weighting for balanced comparison.
 */
const RULES_WEIGHT = 0.5;
const AI_WEIGHT = 0.5;

/** Valid answer formats for different question types */
const VALID_ANSWER_PATTERNS: Record<string, RegExp> = {
    'true-false-not-given': /^(TRUE|FALSE|NOT GIVEN)$/i,
    'yes-no-not-given': /^(YES|NO|NOT GIVEN)$/i,
    'multiple-choice': /^[A-Z]$/i,
    'multiple-select': /^[A-Z](,\s*[A-Z])*$/i,
    'matching-headings': /^(i{1,3}|iv|v|vi{1,3}|ix|x|xi{1,3})$/i,
    'matching-information': /^[A-Z]$/i,
    'matching-features': /^[A-Z]$/i,
    'matching-sentence-endings': /^[A-Z]$/i,
};

/** Types that require options */
const TYPES_REQUIRING_OPTIONS: QuestionType[] = [
    'multiple-choice',
    'multiple-select',
    'matching-headings',
    'matching-information',
    'matching-features',
    'matching-sentence-endings',
    'summary-completion-list',
];

/** Types that require images */
const TYPES_REQUIRING_IMAGES: QuestionType[] = [
    'diagram-labeling',
    'flowchart-completion',
    'table-completion',
];

const normalizeSourceText = (value: string): string => value.replace(/\r\n?/g, '\n');

const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractQuestionRangeSourceExcerpt = (
    documentText: string | undefined,
    startQuestionNumber: number,
    endQuestionNumber: number,
): string | undefined => {
    if (!documentText?.trim()) {
        return undefined;
    }

    const normalized = normalizeSourceText(documentText);
    const rangePattern = new RegExp(
        `\\bquestions?\\s+${escapeRegExp(String(startQuestionNumber))}` +
        `\\s*(?:-|–|—|to)\\s*${escapeRegExp(String(endQuestionNumber))}\\b`,
        'i',
    );
    const rangeMatch = rangePattern.exec(normalized);

    if (!rangeMatch || rangeMatch.index === undefined) {
        return undefined;
    }

    const excerptStart = rangeMatch.index;
    const afterRangeIndex = excerptStart + rangeMatch[0].length;
    const trailingExcerpt = normalized.slice(afterRangeIndex);
    const nextBoundaryOffsetCandidates = [
        trailingExcerpt.search(/\n\s*questions?\s+\d+\s*(?:-|–|—|to)\s*\d+\b/i),
        trailingExcerpt.search(/\n\s*(?:answer\s*key|answers?)\b/i),
        trailingExcerpt.search(/\n\s*(?:reading\s+passage|passage)\s+\d+\b/i),
    ].filter((offset) => offset >= 0);

    const excerptEnd =
        nextBoundaryOffsetCandidates.length > 0
            ? afterRangeIndex + Math.min(...nextBoundaryOffsetCandidates)
            : normalized.length;

    return normalized.slice(excerptStart, excerptEnd).trim() || undefined;
};

interface SourceQuestionRangeSection {
    start: number;
    end: number;
}

const QUESTION_RANGE_PATTERN =
    /\bquestions?\s+(\d+)\s*(?:-|–|—|to)\s*(\d+)\b/gi;

const extractQuestionRangeSections = (
    documentText: string | undefined,
): SourceQuestionRangeSection[] => {
    if (!documentText?.trim()) {
        return [];
    }

    const normalized = normalizeSourceText(documentText);
    const sections: SourceQuestionRangeSection[] = [];
    let match: RegExpExecArray | null;

    while ((match = QUESTION_RANGE_PATTERN.exec(normalized)) !== null) {
        const start = Number.parseInt(match[1] || '', 10);
        const end = Number.parseInt(match[2] || '', 10);

        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
            continue;
        }

        const previousSection = sections[sections.length - 1];
        if (previousSection?.start === start && previousSection.end === end) {
            continue;
        }

        sections.push({ start, end });
    }

    return sections.sort((left, right) =>
        left.start !== right.start ? left.start - right.start : left.end - right.end,
    );
};

const findQuestionRangeSection = (
    sections: SourceQuestionRangeSection[],
    questionNumber: number,
): SourceQuestionRangeSection | undefined =>
    sections.find((section) => questionNumber >= section.start && questionNumber <= section.end);

const pickPreferredTableSectionInstruction = (
    currentInstruction: string,
    nextInstruction: string,
): string => {
    const current = currentInstruction.trim();
    const next = nextInstruction.trim();

    if (!current) {
        return next;
    }

    if (!next) {
        return current;
    }

    const currentHasHeaders = /table_headers:/i.test(current);
    const nextHasHeaders = /table_headers:/i.test(next);

    if (currentHasHeaders !== nextHasHeaders) {
        return nextHasHeaders ? next : current;
    }

    return next.length > current.length ? next : current;
};

const normalizeAnswerValue = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) {
        return value.map((item) => item.trim()).filter(Boolean);
    }

    if (typeof value !== 'string') {
        return [];
    }

    return [value.trim()].filter(Boolean);
};

const answersMatch = (
    left: string | string[] | undefined,
    right: string | string[] | undefined,
): boolean => {
    const normalizedLeft = normalizeAnswerValue(left);
    const normalizedRight = normalizeAnswerValue(right);

    if (normalizedLeft.length !== normalizedRight.length) {
        return false;
    }

    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

// ═══════════════════════════════════════════════════════════════
// VALIDATOR SERVICE
// ═══════════════════════════════════════════════════════════════

/**
 * Validation Service
 * 
 * Compares AI and rule-based results, validates completeness,
 * and generates uncertain items list for teacher review.
 */
class ValidatorService {

    // ─────────────────────────────────────────────────────────────
    // AI vs RULES COMPARISON
    // ─────────────────────────────────────────────────────────────

    /**
     * Compare AI extraction results with rule-based classification
     * 
     * @param aiResults - Questions extracted by AI
     * @param rulesResults - Questions classified by rules
     * @returns Comparison result with discrepancies and merged questions
     */
    compareAIvsRules(
        aiResults: AIQuestionResult[],
        rulesResults: RulesQuestionResult[],
        context: CompareAIvsRulesContext = {},
    ): ComparisonResult {
        const discrepancies: Discrepancy[] = [];
        const mergedQuestions: MergedQuestion[] = [];
        let matchedCount = 0;

        // Create lookup for rules results
        const rulesMap = new Map<number, RulesQuestionResult>();
        for (const r of rulesResults) {
            rulesMap.set(r.questionNumber, r);
        }

        // Compare each AI result with corresponding rules result
        for (const aiQ of aiResults) {
            const rulesQ = rulesMap.get(aiQ.questionNumber);

            if (!rulesQ) {
                // No rules result - use AI only
                mergedQuestions.push(this.createMergedQuestion(aiQ, null));
                continue;
            }

            // Compare types
            const aiType = this.normalizeType(aiQ.type);
            const rulesType = rulesQ.type;
            const typesMatch = aiType === rulesType;

            if (!typesMatch) {
                discrepancies.push({
                    questionNumber: aiQ.questionNumber,
                    field: 'type',
                    aiValue: aiType,
                    rulesValue: rulesType,
                    severity: this.getTypeMismatchSeverity(aiType, rulesType),
                    recommendation: this.getTypeRecommendation(aiQ.confidence, rulesQ.confidence),
                });
            } else {
                matchedCount++;
            }

            // Create merged question
            mergedQuestions.push(this.createMergedQuestion(aiQ, rulesQ, typesMatch));
        }

        // Calculate overall confidence
        const totalQuestions = aiResults.length;
        const confidence = totalQuestions > 0
            ? Math.round((matchedCount / totalQuestions) * 100)
            : 0;
        const {
            questionGroups,
            tableCompletionIssues,
            tableCompletionDiagnostics,
            mergedQuestions: mergedQuestionsWithGroups,
        } =
            this.buildCanonicalTableCompletionArtifacts(
                mergedQuestions,
                context.documentText,
            );
        const sourceFidelity = this.buildSourceFidelityResult(context.verification);
        const questionRangeContinuity = this.buildQuestionRangeContinuity(
            context.verification?.rawQuestionNumbers || aiResults.map((question) => question.questionNumber),
            mergedQuestionsWithGroups,
        );
        const answerCoverageConsistency = this.buildAnswerCoverageConsistency(
            context.rawAnswerKey,
            mergedQuestionsWithGroups,
        );

        return {
            confidence,
            matchedCount,
            discrepancyCount: discrepancies.length,
            discrepancies,
            mergedQuestions: mergedQuestionsWithGroups,
            questionGroups,
            tableCompletionIssues,
            tableCompletionDiagnostics,
            sourceFidelity,
            questionRangeContinuity,
            answerCoverageConsistency,
        };
    }

    private buildSourceFidelityResult(
        verification?: VerificationArtifact,
    ): SourceFidelityResult {
        if (!verification) {
            return {
                pass: true,
                blockingDamageCount: 0,
                warningDamageCount: 0,
                damageRegions: [],
            };
        }

        return {
            pass: verification.sourceFidelityPass,
            blockingDamageCount: verification.damageRegions.filter(
                (damage) => damage.severity === 'blocking',
            ).length,
            warningDamageCount: verification.damageRegions.filter(
                (damage) => damage.severity === 'warning',
            ).length,
            damageRegions: verification.damageRegions,
        };
    }

    private buildQuestionRangeContinuity(
        rawQuestionNumbers: number[],
        mergedQuestions: MergedQuestion[],
    ): QuestionRangeContinuityResult {
        const mergedQuestionNumbers = mergedQuestions.map((question) => question.questionNumber);
        const mergedQuestionSet = new Set(mergedQuestionNumbers);
        const rawQuestionSet = new Set(rawQuestionNumbers);
        const missingQuestionNumbers = rawQuestionNumbers.filter(
            (questionNumber) => !mergedQuestionSet.has(questionNumber),
        );
        const extraQuestionNumbers = mergedQuestionNumbers.filter(
            (questionNumber) => !rawQuestionSet.has(questionNumber),
        );

        return {
            complete: missingQuestionNumbers.length === 0 && extraQuestionNumbers.length === 0,
            rawQuestionNumbers,
            mergedQuestionNumbers,
            missingQuestionNumbers,
            extraQuestionNumbers,
        };
    }

    private buildAnswerCoverageConsistency(
        rawAnswerKey: Record<number, string | string[]> | undefined,
        mergedQuestions: MergedQuestion[],
    ): AnswerCoverageConsistencyResult {
        const normalizedRawAnswerKey = rawAnswerKey || {};
        const rawAnswerQuestionNumbers = Object.keys(normalizedRawAnswerKey)
            .map((questionNumber) => Number.parseInt(questionNumber, 10))
            .filter((questionNumber) => Number.isFinite(questionNumber))
            .sort((left, right) => left - right);
        const mergedQuestionMap = new Map(
            mergedQuestions.map((question) => [question.questionNumber, question]),
        );
        const answeredCount = mergedQuestions.filter((question) => question.answer !== undefined).length;

        if (rawAnswerQuestionNumbers.length === 0) {
            return {
                hasRawAnswerKey: false,
                answeredCount,
                missingQuestionNumbers: [],
                mismatchedQuestionNumbers: [],
                nonBlocking: true,
            };
        }

        const missingQuestionNumbers: number[] = [];
        const mismatchedQuestionNumbers: number[] = [];

        rawAnswerQuestionNumbers.forEach((questionNumber) => {
            const mergedQuestion = mergedQuestionMap.get(questionNumber);
            if (!mergedQuestion || mergedQuestion.answer === undefined) {
                missingQuestionNumbers.push(questionNumber);
                return;
            }

            if (!answersMatch(mergedQuestion.answer, normalizedRawAnswerKey[questionNumber])) {
                mismatchedQuestionNumbers.push(questionNumber);
            }
        });

        return {
            hasRawAnswerKey: true,
            answeredCount,
            missingQuestionNumbers,
            mismatchedQuestionNumbers,
            nonBlocking: false,
        };
    }

    /**
     * Create a merged question from AI and rules results
     */
    private createMergedQuestion(
        aiQ: AIQuestionResult,
        rulesQ: RulesQuestionResult | null,
        typesMatch: boolean = true
    ): MergedQuestion {
        // Calculate weighted confidence
        const aiConf = aiQ.confidence;
        const rulesConf = rulesQ?.confidence ?? 0;
        const weightedConfidence = rulesQ
            ? Math.round(rulesConf * RULES_WEIGHT + aiConf * AI_WEIGHT)
            : aiConf;

        // Determine type source and final type
        let typeSource: 'ai' | 'rules' | 'consensus';
        let finalType: QuestionType;

        if (!rulesQ) {
            typeSource = 'ai';
            finalType = this.normalizeType(aiQ.type);
        } else if (typesMatch) {
            typeSource = 'consensus';
            finalType = rulesQ.type;
        } else {
            // Discrepancy - prefer rules (higher weight)
            typeSource = rulesConf >= aiConf ? 'rules' : 'ai';
            finalType = typeSource === 'rules'
                ? rulesQ.type
                : this.normalizeType(aiQ.type);
        }

        const aiOptionTexts = (aiQ.labeledOptions || aiQ.options || [])
            .map(option => typeof option === 'string' ? option : option.text)
            .filter((option): option is string => Boolean(option));

        // Determine uncertainty
        let uncertain = weightedConfidence < UNCERTAINTY_THRESHOLD || !typesMatch;
        let uncertainReason: string | undefined;

        if (!typesMatch) {
            uncertainReason = `Type mismatch: AI=${this.normalizeType(aiQ.type)}, Rules=${rulesQ?.type}`;
        } else if (weightedConfidence < UNCERTAINTY_THRESHOLD) {
            uncertainReason = `Low confidence: ${weightedConfidence}%`;
        }

        // Post-processing: auto-correct obvious type misclassifications based on options
        const correctedType = this.correctTypeFromOptions(finalType, aiOptionTexts, aiQ.questionText);
        if (correctedType !== finalType) {
            finalType = correctedType;
            typeSource = 'rules'; // Options-based correction is deterministic
            // If corrected, it's no longer uncertain for type
            if (uncertainReason?.startsWith('Type mismatch')) {
                uncertainReason = undefined;
            }
        }

        const canonicalQuestion = canonicalizeReadingQuestion({
            questionNumber: aiQ.questionNumber,
            type: finalType,
            questionText: aiQ.questionText,
            options: aiQ.options || [],
            labeledOptions: aiQ.labeledOptions,
            optionLabelFormat: aiQ.optionLabelFormat || rulesQ?.optionLabelFormat,
            sectionReferences: aiQ.sectionReferences || undefined,
        });

        if (canonicalQuestion.issues.length > 0) {
            uncertain = true;
            uncertainReason = uncertainReason
                ? `${uncertainReason}; ${canonicalQuestion.issues[0]!.message}`
                : canonicalQuestion.issues[0]!.message;
        }

        return {
            questionNumber: aiQ.questionNumber,
            questionText: canonicalQuestion.questionText,
            type: finalType,
            options: canonicalQuestion.options,
            labeledOptions: canonicalQuestion.labeledOptions,
            sectionReferences: canonicalQuestion.sectionReferences,
            answer: aiQ.answer,
            passageId: aiQ.passageId,
            sectionInstruction: aiQ.sectionInstruction,
            confidence: weightedConfidence,
            typeSource,
            wordLimit: rulesQ?.wordLimit,
            optionLabelFormat: canonicalQuestion.optionLabelFormat || rulesQ?.optionLabelFormat,
            reuseLettersAllowed: rulesQ?.reuseLettersAllowed,
            uncertain,
            uncertainReason,
        };
    }

    /**
     * Correct type based on options content (post-processing safety net)
     * Catches obvious misclassifications where options clearly indicate a specific type
     * 
     * This method provides a deterministic override when AI classification is wrong but
     * the options/question format make the correct type obvious.
     */
    private correctTypeFromOptions(
        currentType: QuestionType,
        options: (string | null)[],
        questionText: string
    ): QuestionType {
        const validOptions = (options || []).filter((o): o is string => typeof o === 'string');
        const normalizedOpts = validOptions.map(o => o.toLowerCase().replace(/[^a-z]/g, ''));
        const lowerText = questionText.toLowerCase();
        const trimmedText = questionText.trim();

        // ─────────────────────────────────────────────────────────────
        // PRIORITY 1: TRUE/FALSE/NOT GIVEN detection
        // ─────────────────────────────────────────────────────────────
        if (
            normalizedOpts.length === 3 &&
            normalizedOpts.includes('true') &&
            normalizedOpts.includes('false') &&
            normalizedOpts.includes('notgiven')
        ) {
            if (currentType !== 'true-false-not-given') {
                return 'true-false-not-given';
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PRIORITY 2: YES/NO/NOT GIVEN detection
        // ─────────────────────────────────────────────────────────────
        if (
            normalizedOpts.length === 3 &&
            normalizedOpts.includes('yes') &&
            normalizedOpts.includes('no') &&
            normalizedOpts.includes('notgiven')
        ) {
            if (currentType !== 'yes-no-not-given') {
                return 'yes-no-not-given';
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PRIORITY 3: Short-answer misclassified as sentence-completion
        // Q&A format questions (What/Who/Where/How/Why/When/Which + ?) should be short-answer
        // This catches the Q6-8 pattern from debug data
        // ─────────────────────────────────────────────────────────────
        if (currentType === 'sentence-completion') {
            const isQAFormat = /^(what|who|where|when|which|how|why)\b/i.test(trimmedText);
            const hasBlank = /_{3,}|\.{4,}|\(\s*\d+\s*\)/.test(trimmedText);
            const hasQuestionMark = trimmedText.includes('?');

            // Strong signal: WH-word + question mark + no blanks = short-answer
            if (isQAFormat && !hasBlank && (hasQuestionMark || validOptions.length === 0)) {
                return 'short-answer';
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PRIORITY 4: Matching-sentence-endings detection
        // Catches Q31-35 pattern: sentence fragments with shared ending options
        // ─────────────────────────────────────────────────────────────
        if (
            (currentType === 'sentence-completion' || currentType === 'multiple-choice') &&
            validOptions.length >= 5
        ) {
            // Check if options are sentence fragments (long text, not single letters/words)
            const avgOptionLength = validOptions.reduce((sum, opt) => sum + opt.length, 0) / validOptions.length;
            const optionsAreSentenceFragments = avgOptionLength > 15 &&
                validOptions.some(opt => opt.split(/\s+/).length >= 3);

            // Check for explicit instruction keywords
            const hasEndingKeyword = lowerText.includes('ending') ||
                lowerText.includes('complete the sentence') ||
                lowerText.includes('complete each sentence');

            if (optionsAreSentenceFragments || hasEndingKeyword) {
                return 'matching-sentence-endings';
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PRIORITY 5: Matching-headings detection (roman numerals)
        // ─────────────────────────────────────────────────────────────
        if (
            currentType === 'multiple-choice' &&
            validOptions.length > 5 &&
            validOptions.some(opt => /^[ivx]+\./i.test(opt.trim()))
        ) {
            if (lowerText.includes('heading') || lowerText.includes('paragraph')) {
                return 'matching-headings';
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PRIORITY 6: Option count heuristics
        // ─────────────────────────────────────────────────────────────
        if (currentType === 'multiple-choice' && validOptions.length > 6) {
            // Many options (7+) usually indicates matching type, not MC
            if (validOptions.some(opt => /^[ivx]+\./i.test(opt.trim()))) {
                return 'matching-headings';
            }
            // Check for entity lists (matching-features)
            if (lowerText.includes('list of') &&
                (lowerText.includes('people') || lowerText.includes('researcher') ||
                    lowerText.includes('scientist') || lowerText.includes('author'))) {
                return 'matching-features';
            }
        }

        return currentType;
    }

    /**
     * Normalize type string to QuestionType
     */
    private normalizeType(type: string | QuestionType): QuestionType {
        // Handle common AI variations
        const typeMap: Record<string, QuestionType> = {
            'matching': 'matching-information',
            'match': 'matching-information',
            'tfng': 'true-false-not-given',
            'ynng': 'yes-no-not-given',
            'mcq': 'multiple-choice',
            'fill-in-the-blank': 'sentence-completion',
            'gap-fill': 'sentence-completion',
            'summary': 'summary-completion-text',
            'note': 'note-completion',
            'table': 'table-completion',
            'flowchart': 'flowchart-completion',
            'diagram': 'diagram-labeling',
        };

        const normalized = type.toLowerCase().trim();
        return typeMap[normalized] || (normalized as QuestionType);
    }

    /**
     * Get severity of type mismatch
     */
    private getTypeMismatchSeverity(
        aiType: QuestionType,
        rulesType: QuestionType
    ): 'low' | 'medium' | 'high' {
        // TFNG vs YNNG confusion = medium (common mistake, special case)
        // Check this FIRST before category check
        if (
            (aiType === 'true-false-not-given' && rulesType === 'yes-no-not-given') ||
            (aiType === 'yes-no-not-given' && rulesType === 'true-false-not-given')
        ) {
            return 'medium';
        }

        // Same category = low severity
        if (this.getTypeCategory(aiType) === this.getTypeCategory(rulesType)) {
            return 'low';
        }

        // Different category = high severity
        return 'high';
    }

    /**
     * Get category for a question type
     */
    private getTypeCategory(type: QuestionType): string {
        if (type.includes('completion') || type === 'diagram-labeling') return 'completion';
        if (type.includes('matching')) return 'matching';
        if (type.includes('true-false') || type.includes('yes-no')) return 'judgment';
        if (type.includes('choice') || type.includes('select')) return 'choice';
        return 'other';
    }

    /**
     * Get recommendation for which source to use
     */
    private getTypeRecommendation(
        aiConfidence: number,
        rulesConfidence: number
    ): 'use_ai' | 'use_rules' | 'manual_review' {
        const diff = Math.abs(aiConfidence - rulesConfidence);

        // Large difference = use higher confidence
        if (diff > 20) {
            return rulesConfidence > aiConfidence ? 'use_rules' : 'use_ai';
        }

        // Small difference = manual review
        return 'manual_review';
    }

    // ─────────────────────────────────────────────────────────────
    // ANSWER KEY VALIDATION
    // ─────────────────────────────────────────────────────────────

    /**
     * Validate answer key against questions
     * 
     * @param questions - Merged questions with types
     * @param answerKey - Answer key mapping (questionNumber → answer)
     * @returns Validation result with errors and warnings
     */
    private buildCanonicalTableCompletionArtifacts(
        mergedQuestions: MergedQuestion[],
        sourceDocumentText?: string,
    ): {
        mergedQuestions: MergedQuestion[];
        questionGroups: QuestionGroupsField;
        tableCompletionIssues: TableCompletionIssue[];
        tableCompletionDiagnostics: TableCompletionDiagnosticsField;
    } {
        const nonTableQuestions = mergedQuestions.filter(
            (question) => question.type !== 'table-completion',
        );
        const groupedTableRuns = this.groupTableCompletionRuns(
            mergedQuestions,
            sourceDocumentText,
        );
        const questionGroups: QuestionGroupsField = [];
        const tableCompletionIssues: TableCompletionIssue[] = [];
        const tableCompletionDiagnostics: TableCompletionDiagnosticsField = [];
        const derivedTableQuestions: MergedQuestion[] = [];

        groupedTableRuns.forEach((run, runIndex) => {
            const passageSlug = (run.passageId || 'unassigned').replace(/[^a-zA-Z0-9]+/g, '-');
            const startQuestionNumber =
                run.sourceRange?.start || run.questions[0]?.questionNumber || runIndex + 1;
            const endQuestionNumber =
                run.sourceRange?.end ||
                run.questions[run.questions.length - 1]?.questionNumber ||
                startQuestionNumber;
            const groupId = `table-group-${passageSlug}-${startQuestionNumber}-${endQuestionNumber}`;
            const rawExcerpt = extractQuestionRangeSourceExcerpt(
                sourceDocumentText,
                startQuestionNumber,
                endQuestionNumber,
            );
            const canonicalization = canonicalizeTableCompletionGroup({
                groupId,
                passageId: run.passageId || 'unassigned',
                questions: run.questions.map(
                    (question): TableCompletionSourceQuestion => ({
                        questionNumber: question.questionNumber,
                        questionText: question.questionText,
                        answer: question.answer,
                        acceptableAnswers: Array.isArray(question.answer) ? question.answer : undefined,
                        sectionInstruction: question.sectionInstruction,
                        options: question.labeledOptions || question.options || [],
                    }),
                ),
                rawExcerpt,
                sourceWorkflow: 'in-app-parse',
            });

            const runIssues = validateTableCompletionCanonicalization(canonicalization);
            tableCompletionIssues.push(...runIssues);
            tableCompletionDiagnostics.push(
                buildTableCompletionDiagnostic(canonicalization, runIssues),
            );

            if (!canonicalization.group) {
                derivedTableQuestions.push(
                    ...run.questions.map((question) => ({
                        ...question,
                        sectionInstructionId: groupId,
                        sectionInstruction: question.sectionInstruction || run.sectionInstruction,
                        uncertain: true,
                        uncertainReason:
                            'Canonical table structure could not be resolved. ' +
                            'Re-run parse or reclassify away from table-completion.',
                        pendingTableReclassification: true,
                    })),
                );
                return;
            }

            const group = canonicalization.group;
            questionGroups.push(group);
            const derivedQuestions = deriveTableCompletionQuestionsFromGroup(group);
            const existingQuestionsByNumber = new Map(
                run.questions.map((question) => [question.questionNumber, question]),
            );

            derivedQuestions.forEach((derivedQuestion) => {
                const existingQuestion = existingQuestionsByNumber.get(derivedQuestion.questionNumber);
                if (!existingQuestion) {
                    return;
                }

                derivedTableQuestions.push({
                    ...existingQuestion,
                    questionText: derivedQuestion.questionText || existingQuestion.questionText,
                    sectionInstructionId: derivedQuestion.sectionInstructionId,
                    sectionInstruction: existingQuestion.sectionInstruction || run.sectionInstruction,
                    groupId: derivedQuestion.groupId,
                    blankId: derivedQuestion.blankId,
                    anchorId: derivedQuestion.anchorId,
                    groupTaskType: 'table-completion',
                    tableGroupSchemaVersion: derivedQuestion.tableGroupSchemaVersion,
                    pendingTableReclassification: false,
                });
            });
        });

        return {
            mergedQuestions: [...nonTableQuestions, ...derivedTableQuestions].sort(
                (left, right) => left.questionNumber - right.questionNumber,
            ),
            questionGroups,
            tableCompletionIssues,
            tableCompletionDiagnostics,
        };
    }

    private groupTableCompletionRuns(
        mergedQuestions: MergedQuestion[],
        sourceDocumentText?: string,
    ): Array<{
        passageId?: string;
        sectionInstruction: string;
        questions: MergedQuestion[];
        sourceRange?: SourceQuestionRangeSection;
    }> {
        const sortedTableQuestions = mergedQuestions
            .filter((question) => question.type === 'table-completion')
            .slice()
            .sort((left, right) => left.questionNumber - right.questionNumber);
        const sourceRangeSections = extractQuestionRangeSections(sourceDocumentText);
        const runs: Array<{
            passageId?: string;
            sectionInstruction: string;
            questions: MergedQuestion[];
            sourceRange?: SourceQuestionRangeSection;
        }> = [];

        sortedTableQuestions.forEach((question) => {
            const currentSectionInstruction = (question.sectionInstruction || '').trim();
            const currentSourceRange = findQuestionRangeSection(
                sourceRangeSections,
                question.questionNumber,
            );
            const previousRun = runs[runs.length - 1];
            const previousQuestion =
                previousRun?.questions[previousRun.questions.length - 1];
            const sharesSourceRange =
                previousRun?.sourceRange &&
                currentSourceRange &&
                previousRun.sourceRange.start === currentSourceRange.start &&
                previousRun.sourceRange.end === currentSourceRange.end;
            const sharesInstruction =
                previousRun?.sectionInstruction === currentSectionInstruction;

            if (
                previousRun &&
                previousRun.passageId === question.passageId &&
                previousQuestion &&
                previousQuestion.questionNumber + 1 === question.questionNumber &&
                (sharesSourceRange || sharesInstruction)
            ) {
                previousRun.questions.push(question);
                previousRun.sectionInstruction = pickPreferredTableSectionInstruction(
                    previousRun.sectionInstruction,
                    currentSectionInstruction,
                );
                return;
            }

            runs.push({
                passageId: question.passageId,
                sectionInstruction: currentSectionInstruction,
                questions: [question],
                sourceRange: currentSourceRange,
            });
        });

        return runs;
    }

    validateAnswerKey(
        questions: MergedQuestion[],
        answerKey: Record<number | string, string | string[]>
    ): AnswerKeyValidation {
        const errors: AnswerKeyError[] = [];
        const warnings: AnswerKeyWarning[] = [];
        const missing: number[] = [];

        for (const q of questions) {
            const answer = answerKey[q.questionNumber];

            // Check if answer exists
            if (answer === undefined || answer === null || answer === '') {
                missing.push(q.questionNumber);
                continue;
            }

            // Validate answer format based on question type
            const validation = this.validateAnswerFormat(q.type, answer, q.questionNumber);
            if (validation.error) {
                errors.push(validation.error);
            }
            if (validation.warning) {
                warnings.push(validation.warning);
            }
        }

        const total = questions.length;
        const answered = total - missing.length;

        return {
            valid: errors.length === 0 && missing.length === 0,
            errors,
            warnings,
            coverage: {
                total,
                answered,
                missing,
            },
        };
    }

    /**
     * Validate individual answer format
     */
    private validateAnswerFormat(
        type: QuestionType,
        answer: string | string[],
        questionNumber: number
    ): { error?: AnswerKeyError; warning?: AnswerKeyWarning } {
        const answerStr = Array.isArray(answer) ? answer.join(',') : answer;

        // Check for ambiguous answers (e.g., "A/B" or "TRUE/FALSE")
        if (answerStr.includes('/')) {
            return {
                warning: {
                    questionNumber,
                    warning: 'Ambiguous answer format detected',
                    suggestion: `Consider splitting "${answerStr}" into separate accepted answers`,
                },
            };
        }

        // Check against expected pattern
        const pattern = VALID_ANSWER_PATTERNS[type];
        if (pattern && !pattern.test(answerStr)) {
            // Only error for strict types (TFNG, YNNG, MCQ)
            if (['true-false-not-given', 'yes-no-not-given', 'multiple-choice'].includes(type)) {
                return {
                    error: {
                        questionNumber,
                        error: `Invalid answer format for ${type}`,
                        expected: this.getExpectedFormat(type),
                        received: answerStr,
                    },
                };
            }
        }

        return {};
    }

    /**
     * Get expected answer format description
     */
    private getExpectedFormat(type: QuestionType): string {
        switch (type) {
            case 'true-false-not-given':
                return 'TRUE, FALSE, or NOT GIVEN';
            case 'yes-no-not-given':
                return 'YES, NO, or NOT GIVEN';
            case 'multiple-choice':
                return 'Single letter A-Z';
            case 'multiple-select':
                return 'Multiple letters (e.g., "A,C" or "B,D")';
            case 'matching-headings':
                return 'Roman numeral (i-x)';
            default:
                return 'Text answer';
        }
    }

    // ─────────────────────────────────────────────────────────────
    // COMPLETENESS DETECTION
    // ─────────────────────────────────────────────────────────────

    /**
     * Detect incomplete tests
     * 
     * @param questions - Merged questions
     * @param passages - Extracted passages
     * @param answerKey - Answer key
     * @returns Completeness result with issues
     */
    detectIncomplete(
        questions: MergedQuestion[],
        passages: { id: string; title: string; content: string }[],
        answerKey: Record<number | string, string | string[]>
    ): CompletenessResult {
        const issues: CompletenessIssue[] = [];

        // Check for missing passages
        if (passages.length === 0) {
            issues.push({
                type: 'missing_passage',
                severity: 'error',
                message: 'No passages found in the document',
                resolution: 'Add reading passages or check document format',
            });
        }

        // Check each question
        for (const q of questions) {
            // Check for missing answers
            const answer = answerKey[q.questionNumber];
            if (!answer || answer === '') {
                issues.push({
                    type: 'missing_answer',
                    questionNumber: q.questionNumber,
                    severity: 'error',
                    message: `Question ${q.questionNumber} has no answer`,
                    resolution: 'Add the correct answer to the answer key',
                });
            }

            // Check for missing options (for types that require them)
            if (TYPES_REQUIRING_OPTIONS.includes(q.type)) {
                if (!q.options || q.options.length === 0) {
                    issues.push({
                        type: 'missing_options',
                        questionNumber: q.questionNumber,
                        severity: 'warning',
                        message: `Question ${q.questionNumber} (${q.type}) has no options`,
                        resolution: 'Add answer options (A, B, C, D)',
                    });
                }
            }

            // Check for diagram questions needing images
            if (TYPES_REQUIRING_IMAGES.includes(q.type)) {
                issues.push({
                    type: 'diagram_needs_image',
                    questionNumber: q.questionNumber,
                    severity: 'warning',
                    message: `Question ${q.questionNumber} (${q.type}) may require an image`,
                    resolution: 'Upload a diagram/flowchart/table image if needed',
                });
            }

            // Check for ambiguous answers
            const answerStr = Array.isArray(answer) ? answer.join('/') : answer?.toString() || '';
            if (answerStr.includes('/')) {
                issues.push({
                    type: 'ambiguous_answer',
                    questionNumber: q.questionNumber,
                    severity: 'warning',
                    message: `Question ${q.questionNumber} has ambiguous answer: "${answerStr}"`,
                    resolution: 'Clarify which answer(s) are acceptable',
                });
            }
        }

        // Calculate completeness score
        const errorCount = issues.filter(i => i.severity === 'error').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;
        const totalPenalty = errorCount * 20 + warningCount * 5;
        const score = Math.max(0, 100 - totalPenalty);

        return {
            complete: errorCount === 0,
            score,
            issues,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // UNCERTAIN ITEMS GENERATION
    // ─────────────────────────────────────────────────────────────

    /**
     * Generate list of uncertain items for sidebar display
     * 
     * @param comparisonResult - Result from AI vs Rules comparison
     * @param completenessResult - Result from completeness check
     * @returns List of uncertain items
     */
    generateUncertainItems(
        comparisonResult: ComparisonResult,
        completenessResult: CompletenessResult
    ): UncertainItem[] {
        const items: UncertainItem[] = [];

        // Add type mismatches
        for (const disc of comparisonResult.discrepancies) {
            if (disc.field === 'type') {
                items.push({
                    id: `type-${disc.questionNumber}`,
                    questionNumber: disc.questionNumber,
                    type: 'type_mismatch',
                    message: `Type conflict: AI says "${disc.aiValue}", Rules say "${disc.rulesValue}"`,
                    severity: disc.severity,
                    aiSuggestion: disc.aiValue as string,
                    rulesSuggestion: disc.rulesValue as string,
                    resolved: false,
                });
            }
        }

        // Add low confidence questions
        for (const q of comparisonResult.mergedQuestions) {
            if (q.confidence < UNCERTAINTY_THRESHOLD && !items.some(i => i.questionNumber === q.questionNumber)) {
                items.push({
                    id: `confidence-${q.questionNumber}`,
                    questionNumber: q.questionNumber,
                    type: 'low_confidence',
                    message: `Low confidence (${q.confidence}%) for question ${q.questionNumber}`,
                    severity: q.confidence < 70 ? 'high' : 'medium',
                    resolved: false,
                });
            }
        }

        // Add completeness issues
        for (const issue of completenessResult.issues) {
            if (issue.questionNumber) {
                items.push({
                    id: `${issue.type}-${issue.questionNumber}`,
                    questionNumber: issue.questionNumber,
                    type: issue.type === 'diagram_needs_image' ? 'diagram_question' :
                        issue.type === 'ambiguous_answer' ? 'ambiguous_answer' : 'missing_answer',
                    message: issue.message,
                    severity: issue.severity === 'error' ? 'high' : 'medium',
                    resolved: false,
                });
            }
        }

        // Sort by severity (high first) then by question number
        const severityOrder = { high: 0, medium: 1, low: 2 };
        items.sort((a, b) => {
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0) return severityDiff;
            return a.questionNumber - b.questionNumber;
        });

        return items;
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * Quick check if validation passed (no errors)
     */
    isValid(
        comparisonResult: ComparisonResult,
        completenessResult: CompletenessResult
    ): boolean {
        const hasBlockingTableIssues = (comparisonResult.tableCompletionIssues || []).some(
            (issue) => issue.severity === 'blocking',
        );
        const sourceFidelityPass = comparisonResult.sourceFidelity?.pass ?? true;
        const questionRangeComplete = comparisonResult.questionRangeContinuity?.complete ?? true;

        return (
            comparisonResult.discrepancyCount === 0 &&
            completenessResult.complete &&
            sourceFidelityPass &&
            questionRangeComplete &&
            !hasBlockingTableIssues
        );
    }

    /**
     * Get overall validation score (0-100)
     */
    getOverallScore(
        comparisonResult: ComparisonResult,
        completenessResult: CompletenessResult
    ): number {
        // Weight: comparison 60%, completeness 40%
        return Math.round(
            comparisonResult.confidence * 0.6 +
            completenessResult.score * 0.4
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

/**
 * Singleton instance of ValidatorService
 */
export const validatorService = new ValidatorService();

/**
 * Re-export class for testing
 */
export { ValidatorService };

/**
 * Constants for testing
 */
export const VALIDATION_CONSTANTS = {
    UNCERTAINTY_THRESHOLD,
    RULES_WEIGHT,
    AI_WEIGHT,
    TYPES_REQUIRING_OPTIONS,
    TYPES_REQUIRING_IMAGES,
};

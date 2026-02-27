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
    options?: string[] | null;
    answer?: string | string[];
    passageId?: string;
    confidence: number;
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
    optionLabelFormat?: 'letter' | 'roman' | 'number';
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
}

/**
 * Merged question combining AI and Rules results
 */
export interface MergedQuestion {
    questionNumber: number;
    questionText: string;
    type: QuestionType;
    options?: string[] | null;
    answer?: string | string[];
    passageId?: string;
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
    optionLabelFormat?: 'letter' | 'roman' | 'number';
    reuseLettersAllowed?: boolean;
    /** Flagged for teacher review */
    uncertain: boolean;
    /** Reason for uncertainty */
    uncertainReason?: string;
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
        rulesResults: RulesQuestionResult[]
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

        return {
            confidence,
            matchedCount,
            discrepancyCount: discrepancies.length,
            discrepancies,
            mergedQuestions,
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

        // Determine uncertainty
        const uncertain = weightedConfidence < UNCERTAINTY_THRESHOLD || !typesMatch;
        let uncertainReason: string | undefined;

        if (!typesMatch) {
            uncertainReason = `Type mismatch: AI=${this.normalizeType(aiQ.type)}, Rules=${rulesQ?.type}`;
        } else if (weightedConfidence < UNCERTAINTY_THRESHOLD) {
            uncertainReason = `Low confidence: ${weightedConfidence}%`;
        }

        // Post-processing: auto-correct obvious type misclassifications based on options
        const correctedType = this.correctTypeFromOptions(finalType, aiQ.options || [], aiQ.questionText);
        if (correctedType !== finalType) {
            finalType = correctedType;
            typeSource = 'rules'; // Options-based correction is deterministic
            // If corrected, it's no longer uncertain for type
            if (uncertainReason?.startsWith('Type mismatch')) {
                uncertainReason = undefined;
            }
        }

        return {
            questionNumber: aiQ.questionNumber,
            questionText: aiQ.questionText,
            type: finalType,
            options: aiQ.options,
            answer: aiQ.answer,
            passageId: aiQ.passageId,
            confidence: weightedConfidence,
            typeSource,
            wordLimit: rulesQ?.wordLimit,
            optionLabelFormat: rulesQ?.optionLabelFormat,
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
        return (
            comparisonResult.discrepancyCount === 0 &&
            completenessResult.complete
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

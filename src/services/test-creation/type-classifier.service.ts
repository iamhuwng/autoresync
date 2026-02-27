/**
 * Type Classifier Service
 * 
 * Rule-based question type detection for IELTS Reading tests.
 * Uses priority-ordered regex patterns and option analysis to classify
 * questions into the 16 IELTS question types.
 * 
 * @module type-classifier.service
 * @version 1.0.0
 * @see documentation/migration/ielts-types-migration-reference.md
 * @see documentation/migration/question-type-detector-migration-reference.md
 */

import {
    QuestionType,
    OptionLabelFormat,
    QUESTION_TYPES
} from '../../types/QuestionSchema';

// ═══════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

/**
 * Classification result with confidence scoring
 */
export interface ClassificationResult {
    /** Detected question type */
    type: QuestionType;
    /** Confidence score (0-100) */
    confidence: number;
    /** Whether teacher review is recommended */
    uncertain: boolean;
    /** Detected option label format */
    optionLabelFormat: OptionLabelFormat;
    /** Source of detection (instruction, options, pattern) */
    detectionSource: 'instruction' | 'options' | 'pattern' | 'fallback';
    /** Matched pattern description (for debugging) */
    matchedPattern?: string;
    /** Extracted word limit from instructions (if any) */
    wordLimit?: WordLimitResult | null;
}

/**
 * Word limit detection result
 */
export interface WordLimitResult {
    /** Maximum number of words allowed */
    maxWords: number;
    /** Whether numbers count as words */
    numbersCountAsWords: boolean;
    /** Whether numbers are explicitly allowed */
    allowNumber: boolean;
    /** Original instruction text */
    instruction: string;
}

/**
 * Detection pattern with priority and optional validation
 */
interface DetectionPattern {
    type: QuestionType;
    patterns: RegExp[];
    optionCheck?: (options: string[]) => boolean;
    priority: number; // Higher = check first
    description: string;
}

// ═══════════════════════════════════════════════════════════════
// TASK TYPE PATTERNS (Migrated from ielts.types.ts - Task 4.2)
// ═══════════════════════════════════════════════════════════════

/**
 * Detection patterns ordered by priority (higher = check first)
 * 
 * ESSENCE-BASED DESIGN (from IELTS research):
 * - P12: Matching Headings (main idea → paragraphs), Sentence Endings (endings list)
 * - P11: Matching Features (statements → named entities, NOT paragraphs)
 * - P10: TFNG (facts), YNNG (opinions), Short Answer (Q&A format)
 * - P9 : Matching Info (details → paragraphs), Diagram/Flowchart/Table/Notes
 * - P8 : Summary (text vs list), Sentence Completion
 * - P7 : Multiple Select (choose TWO or more)
 * - P5 : Multiple Choice (single answer, default)
 */
const DETECTION_PATTERNS: DetectionPattern[] = [
    // ─────────────────────────────────────────────────────────────
    // Priority 12 - Highly Specific Types
    // ─────────────────────────────────────────────────────────────
    {
        type: 'matching-headings',
        priority: 12,
        description: 'Match MAIN IDEA of paragraphs to headings (i-x)',
        patterns: [
            /list\s+of\s+headings/i,                              // "List of Headings"
            /choose\s+(the\s+)?(correct|appropriate)\s+heading/i, // "Choose the correct heading"
            /heading\s+for\s+(each\s+)?(paragraph|section)/i,     // "heading for each paragraph"
            /match.*paragraph.*heading/i,                          // "match paragraph to heading"
            /which\s+heading\s+(best|summarizes)/i,               // "which heading best"
            /correct\s+heading.*paragraphs?\s+[A-Z]/i,            // "correct heading for paragraph A"
        ],
    },
    {
        type: 'matching-sentence-endings',
        priority: 12,
        description: 'Complete sentence beginnings with correct endings (A-F)',
        patterns: [
            /complete.*sentence.*with.*ending/i,           // "complete the sentence with the ending"
            /complete\s+each\s+sentence.*ending/i,         // "complete each sentence with ending"
            /sentence.*correct\s+ending/i,                 // "sentence with correct ending"
            /list\s+of\s+endings/i,                        // "List of Endings"
            /correct\s+ending.*[A-F]/i,                    // "correct ending A-F"
            /match.*sentence.*ending/i,                    // "match sentence to ending"
        ],
    },

    // ─────────────────────────────────────────────────────────────
    // Priority 11 - Matching Features (statements → named entities)
    // ESSENCE: Match statements to a LIST OF ENTITIES (not paragraphs!)
    // Entities can be: people, countries, theories, time periods, types, etc.
    // ─────────────────────────────────────────────────────────────
    {
        type: 'matching-features',
        priority: 11,
        description: 'Match statements to named entities (people, places, theories, etc.)',
        patterns: [
            // Core pattern: "list of [ENTITIES]" - exclude headings, words, phrases, options
            // These exclusions are for summary-completion-list and matching-headings
            /list\s+of\s+(?!headings|words|phrases|options|endings)\w+/i,

            // Instruction patterns
            /match\s+(each\s+)?statement.*with/i,          // "match each statement with"
            /statements?.*and\s+(the\s+)?list\s+of/i,      // "statements and the list of"
            /match.*with\s+the\s+correct\s+(?!ending)\w+/i, // "match with the correct scientist" (not endings)

            // Entity-focused patterns (who said/did what)
            /which\s+(person|explorer|author|scientist|researcher|writer|theorist)/i,
            /attributed\s+to/i,                             // "attributed to which person"
            /according\s+to\s+which/i,                      // "according to which researcher"
        ],
    },

    // ─────────────────────────────────────────────────────────────
    // Priority 10 - True/False/Yes/No, Short Answer
    // ESSENCE: TFNG = facts/information, YNNG = claims/views/opinions
    // ─────────────────────────────────────────────────────────────
    {
        type: 'true-false-not-given',
        priority: 10,
        description: 'Match statements to FACTS in the text',
        patterns: [
            // Core distinction: "information" (facts), "given in the passage"
            /agree\s+with\s+the\s+information/i,           // "agree with the INFORMATION given"
            /TRUE\s+if\s+the\s+statement\s+agrees/i,       // "TRUE if the statement agrees"
            /TRUE.*FALSE.*NOT\s*GIVEN/i,                   // Contains all three options
            /true\s*[,/]\s*false\s*[,/]\s*not\s*given/i,   // "True, False, Not Given"
            /information\s+given\s+in/i,                   // "information given in the passage"
        ],
    },
    {
        type: 'yes-no-not-given',
        priority: 10,
        description: 'Match statements to WRITER\'S VIEWS/CLAIMS (opinions)',
        patterns: [
            // Core distinction: "claims", "views", "opinions" (not facts)
            /agree\s+with\s+the\s+claims/i,                // "agree with the CLAIMS of the writer"
            /agree\s+with\s+the\s+views/i,                 // "agree with the VIEWS"
            /claims\s+agree\s+with/i,                      // "claims agree with the writer"
            /views\s+agree\s+with/i,                       // "views agree with"
            /claims\s+of\s+the\s+writer/i,                 // "claims of the writer"
            /opinions?\s+agree\s+with/i,                   // "opinions agree with the writer"
            /YES\s+if\s+the\s+statement\s+agrees/i,        // "YES if the statement agrees"
            /YES.*NO.*NOT\s*GIVEN/i,                       // Contains all three options
            /yes\s*[,/]\s*no\s*[,/]\s*not\s*given/i,       // "Yes, No, Not Given"
            /what\s+the\s+writer\s+(thinks|believes)/i,    // "what the writer thinks"
            /opinions?\s+of\s+the\s+(writer|author)/i,     // "opinion of the writer"
        ],
    },
    {
        type: 'short-answer',
        priority: 10,
        description: 'Answer direct questions with words from passage',
        patterns: [
            // ESSENCE: Question-answer format (not gap-fill)
            /answer\s+the\s+(following\s+)?questions?/i,   // "Answer the questions below"
            // Note: Removed 'which' from question starters - conflicts with multiple-select "which TWO/THREE"
            /^(what|when|where|who|how|why)\s+/im,         // Direct question starters (no 'which')
            /what\s+(is|are|was|were|did|does)/i,          // "What is/was..."
            /according\s+to\s+the\s+(passage|text)/i,      // "According to the passage, what..."
            /name\s+(the|two|three)/i,                     // "Name the..." (factual recall)
        ],
    },

    // ─────────────────────────────────────────────────────────────
    // Priority 9 - Matching Information & Structured Completion
    // ESSENCE: Matching Info = locate DETAILS in paragraphs
    // ─────────────────────────────────────────────────────────────
    {
        type: 'matching-information',
        priority: 9,
        description: 'Locate SPECIFIC DETAILS in paragraphs/sections',
        patterns: [
            // Core pattern: "which paragraph/section contains..."
            /which\s+(paragraph|section)\s+contains/i,     // "Which paragraph contains"
            /which\s+(paragraph|section).*(mention|describe|explain|refer)/i,
            /contains?\s+the\s+following\s+information/i,  // "contains the following information"
            /in\s+which\s+(paragraph|section)/i,           // "in which paragraph"
            /locate.*information/i,                         // "locate the information"
            /find.*in\s+which\s+paragraph/i,               // "find in which paragraph"
        ],
    },
    {
        type: 'diagram-labeling',
        priority: 9,
        description: 'Label parts of visual/spatial diagram',
        patterns: [
            /label\s+(the\s+)?(diagram|map|plan|picture|illustration)/i,
            /look\s+at\s+the\s+diagram/i,
            /diagram\s+(below|shows|illustrates)/i,
            /parts?\s+of\s+the\s+(diagram|machine|device)/i,
        ],
    },
    {
        type: 'flowchart-completion',
        priority: 9,
        description: 'Complete process/sequence flowchart',
        patterns: [
            /complete\s+(the\s+)?flow[-\s]?chart/i,        // "complete the flow-chart"
            /flow[-\s]?chart\s+(below|shows)/i,             // "flowchart below"
            /process\s+(diagram|chart)/i,                   // "process diagram"
            /stages?\s+of\s+(the\s+)?process/i,            // "stages of the process"
        ],
    },
    {
        type: 'table-completion',
        priority: 9,
        description: 'Complete table cells with passage words',
        patterns: [
            /complete\s+(the\s+)?table/i,                  // "complete the table"
            /table\s+(below|shows)/i,                       // "table below"
            /fill\s+(in\s+)?(the\s+)?table/i,              // "fill in the table"
        ],
    },
    {
        type: 'note-completion',
        priority: 9,
        description: 'Complete bullet points/outline/form',
        patterns: [
            /complete\s+(the\s+)?notes?\s+below/i,         // "complete the notes below"
            /complete\s+(the\s+)?form/i,                   // "complete the form"
            /notes?\s+on/i,                                 // "Notes on..."
            // Note: "one word and/or a number" moved to word-limit detection, not type detection
        ],
    },

    // ─────────────────────────────────────────────────────────────
    // Priority 9 - Summary Completion (List vs Text)
    // ESSENCE: List = word bank (A-H), Text = words from passage
    // ─────────────────────────────────────────────────────────────
    {
        type: 'summary-completion-list',
        priority: 9,
        description: 'Complete summary from PROVIDED WORD BANK (A-H)',
        patterns: [
            // Core distinction: word bank / list / box
            /using\s+(the\s+)?list\s+of\s+(words|phrases|options)/i, // "using the list of words/phrases"
            /from\s+(the\s+)?box\s+(below|provided)/i,          // "from the box below"
            /choose\s+from\s+(the\s+)?(box|list)/i,            // "choose from the box"
            /list\s+of\s+(words|phrases)\s*(A[-–]?[A-Z])?/i,   // "list of words/phrases" (optional A-H)
            // Note: Removed 'write the correct letter' - too generic, appears in many instruction types
            /options?\s+[A-Z][-–][A-Z]/i,                       // "options A-H"
        ],
    },

    // ─────────────────────────────────────────────────────────────
    // Priority 8 - Text-based Completion
    // ─────────────────────────────────────────────────────────────
    {
        type: 'summary-completion-text',
        priority: 8,
        description: 'Complete summary using WORDS FROM THE PASSAGE',
        patterns: [
            /complete\s+(the\s+)?summary/i,                    // "complete the summary"
            /summary\s+(below|of)/i,                           // "summary below"
            /words?\s+from\s+(the\s+)?(passage|text|reading)/i, // "words from the passage"
            /no\s+more\s+than\s+(one|two|three)\s+words?/i,    // Word limit indicator
        ],
    },
    {
        type: 'sentence-completion',
        priority: 8,
        description: 'Fill gaps in standalone sentences',
        patterns: [
            /complete\s+(the\s+)?(following\s+)?sentences?/i,  // "complete the sentences"
            /finish\s+(the\s+)?sentences?/i,                   // "finish the sentences"
            /_{3,}/,                                            // Three+ underscores = blank
            /\.{4,}/,                                           // Four+ dots = blank
            /\(\s*\d+\s*\)/,                                   // (1), (2) numbered gaps in sentence
        ],
    },

    // ─────────────────────────────────────────────────────────────
    // Priority 7 - Multiple Select (choose TWO or more)
    // ESSENCE: "Choose TWO/THREE letters" not "Choose the correct letter"
    // ─────────────────────────────────────────────────────────────
    {
        type: 'multiple-select',
        priority: 7,
        description: 'Select TWO OR MORE correct answers',
        patterns: [
            /choose\s+(two|three|four|2|3|4)\s+\w*/i,           // "Choose TWO letters/answers/correct"
            /which\s+(two|three|2|3)\s+/i,                       // "Which TWO of the following"
            /select\s+(two|three|all)/i,                         // "Select all/two/three"
            /all\s+that\s+apply/i,                               // "all that apply"
            /write\s+(two|three|2|3)\s+letters/i,                // "Write TWO letters"
        ],
    },

    // ─────────────────────────────────────────────────────────────
    // Priority 5 - Multiple Choice (single answer - default)
    // ESSENCE: "Choose the correct letter A, B, C or D" (singular)
    // ─────────────────────────────────────────────────────────────
    {
        type: 'multiple-choice',
        priority: 5,
        description: 'Select ONE correct answer from A-D',
        patterns: [
            /choose\s+the\s+correct\s+letter/i,                // "choose the correct letter"
            /choose\s+(the\s+)?(best|correct)\s+answer/i,      // "choose the best answer"
            /which\s+of\s+the\s+following/i,                   // "which of the following"
            /circle\s+the\s+correct/i,                          // "circle the correct answer"
            /[A-D]\s+is\s+(the\s+)?(correct|best)/i,           // "A is the correct answer"
            /choose\s+(the\s+)?correct\s+(letter|answer|option)/i,
            /circle\s+(the\s+)?correct/i,
            /[A-D]\)\s+\w+/, // A) Option format
            /[A-D]\.\s+\w+/, // A. Option format
        ],
    },
];

// ═══════════════════════════════════════════════════════════════
// WORD LIMIT PATTERNS (Task 4.3)
// ═══════════════════════════════════════════════════════════════

/**
 * Patterns for detecting word limits in instructions
 */
interface WordLimitPattern {
    pattern: RegExp;
    maxWords: number; // -1 indicates dynamic extraction needed
    allowNumber?: boolean;
}

const WORD_LIMIT_PATTERNS: WordLimitPattern[] = [
    // Put 'and/or a number' patterns FIRST (more specific)
    { pattern: /one\s+word\s+and\/or\s+a\s+number/i, maxWords: 1, allowNumber: true },
    { pattern: /two\s+words?\s+and\/or\s+a\s+number/i, maxWords: 2, allowNumber: true },
    { pattern: /three\s+words?\s+and\/or\s+a\s+number/i, maxWords: 3, allowNumber: true },
    { pattern: /no\s+more\s+than\s+(\d+)\s+words?\s+and\/or\s+a\s+number/i, maxWords: -1, allowNumber: true },
    // General patterns (less specific)
    { pattern: /no\s+more\s+than\s+one\s+word/i, maxWords: 1 },
    { pattern: /one\s+word\s+only/i, maxWords: 1 },
    { pattern: /no\s+more\s+than\s+two\s+words?/i, maxWords: 2 },
    { pattern: /no\s+more\s+than\s+three\s+words?/i, maxWords: 3 },
    { pattern: /no\s+more\s+than\s+(\d+)\s+words?/i, maxWords: -1 }, // Dynamic
];

// ═══════════════════════════════════════════════════════════════
// OPTION CHECK HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if options array contains TRUE/FALSE/NOT GIVEN
 */
function hasTrueFalseNotGivenOptions(options: string[]): boolean {
    if (!options || options.length !== 3) return false;

    const normalized = options.map(o =>
        o.toLowerCase().replace(/[^a-z]/g, '')
    );

    return (
        normalized.includes('true') &&
        normalized.includes('false') &&
        normalized.includes('notgiven')
    );
}

/**
 * Check if options array contains YES/NO/NOT GIVEN
 */
function hasYesNoNotGivenOptions(options: string[]): boolean {
    if (!options || options.length !== 3) return false;

    const normalized = options.map(o =>
        o.toLowerCase().replace(/[^a-z]/g, '')
    );

    return (
        normalized.includes('yes') &&
        normalized.includes('no') &&
        normalized.includes('notgiven')
    );
}

/**
 * Check if options contain Roman numerals (i., ii., iii., etc.)
 */
function hasRomanNumerals(options: string[]): boolean {
    if (!options || options.length === 0) return false;

    return options.some(opt => {
        const trimmed = opt.trim().toLowerCase();
        return /^[ivx]+\./i.test(trimmed);
    });
}

// ═══════════════════════════════════════════════════════════════
// TYPE CLASSIFIER SERVICE CLASS
// ═══════════════════════════════════════════════════════════════

/**
 * Type Classifier Service
 * 
 * Provides rule-based question type detection for IELTS Reading tests.
 * Uses priority-ordered patterns and option analysis to achieve high accuracy.
 * 
 * @example
 * ```typescript
 * const classifier = new TypeClassifierService();
 * const result = classifier.classifyQuestion(
 *   "Do the following statements agree with the claims of the writer?",
 *   ["TRUE", "FALSE", "NOT GIVEN"]
 * );
 * // { type: 'true-false-not-given', confidence: 95, uncertain: false, ... }
 * ```
 */
export class TypeClassifierService {
    /** Patterns sorted by priority (descending) */
    private sortedPatterns: DetectionPattern[];

    constructor() {
        // Pre-sort patterns by priority (highest first)
        this.sortedPatterns = [...DETECTION_PATTERNS].sort(
            (a, b) => b.priority - a.priority
        );
    }

    // ─────────────────────────────────────────────────────────────
    // MAIN CLASSIFICATION METHOD (Task 4.4)
    // ─────────────────────────────────────────────────────────────

    /**
     * Classify a question based on its text and options
     * 
     * @param text - The question text or instruction
     * @param options - Answer options (if any)
     * @returns Classification result with type, confidence, and metadata
     */
    classifyQuestion(text: string, options: string[] = []): ClassificationResult {
        // Normalize input
        const normalizedOptions = options.map(o => o.trim());

        // Extract word limit from the text (instruction) proactively
        const wordLimit = this.extractWordLimit(text);

        // Try pattern-based detection (priority order)
        for (const pattern of this.sortedPatterns) {
            for (const regex of pattern.patterns) {
                if (regex.test(text)) {
                    // If pattern has option check, validate it
                    if (pattern.optionCheck) {
                        if (!pattern.optionCheck(normalizedOptions)) {
                            continue; // Options don't match, try next pattern
                        }
                    }

                    return {
                        type: pattern.type,
                        confidence: this.calculateConfidence(pattern.priority),
                        uncertain: false,
                        optionLabelFormat: this.detectOptionLabelFormat(normalizedOptions),
                        detectionSource: 'pattern',
                        matchedPattern: pattern.description,
                        wordLimit,
                    };
                }
            }
        }

        // Options-based fallback
        if (hasTrueFalseNotGivenOptions(normalizedOptions)) {
            return {
                type: 'true-false-not-given',
                confidence: 85,
                uncertain: false,
                optionLabelFormat: 'letter',
                detectionSource: 'options',
                matchedPattern: 'TFNG options detected',
                wordLimit,
            };
        }

        if (hasYesNoNotGivenOptions(normalizedOptions)) {
            return {
                type: 'yes-no-not-given',
                confidence: 85,
                uncertain: false,
                optionLabelFormat: 'letter',
                detectionSource: 'options',
                matchedPattern: 'YNNG options detected',
                wordLimit,
            };
        }

        // Check for blank indicators (completion fallback)
        if (/_{3,}/.test(text) || /\.{4,}/.test(text)) {
            return {
                type: 'sentence-completion',
                confidence: 70,
                uncertain: true,
                optionLabelFormat: 'letter',
                detectionSource: 'pattern',
                matchedPattern: 'Blank indicators detected',
                wordLimit,
            };
        }

        // Has options but no specific pattern → multiple-choice fallback
        if (normalizedOptions.length > 0) {
            return {
                type: 'multiple-choice',
                confidence: 50,
                uncertain: true,
                optionLabelFormat: this.detectOptionLabelFormat(normalizedOptions),
                detectionSource: 'fallback',
                matchedPattern: 'Default with options',
                wordLimit,
            };
        }

        // Ultimate fallback - flag as uncertain
        return {
            type: 'multiple-choice',
            confidence: 30,
            uncertain: true,
            optionLabelFormat: 'letter',
            detectionSource: 'fallback',
            matchedPattern: 'No pattern matched',
            wordLimit,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // PRIORITY-BASED PATTERN MATCHING (Task 4.5)
    // ─────────────────────────────────────────────────────────────

    /**
     * Calculate confidence based on pattern priority
     * Higher priority patterns get higher confidence
     */
    private calculateConfidence(priority: number): number {
        // Map priority (5-12) to confidence (75-100)
        // Priority 12 → 100%
        // Priority 5 → 75%
        const minConfidence = 75;
        const maxConfidence = 100;
        const minPriority = 5;
        const maxPriority = 12;

        const range = maxConfidence - minConfidence;
        const priorityRange = maxPriority - minPriority;
        const normalized = (priority - minPriority) / priorityRange;

        return Math.round(minConfidence + range * normalized);
    }

    // ─────────────────────────────────────────────────────────────
    // CONTEXT-AWARE DETECTION (Task 4.6)
    // ─────────────────────────────────────────────────────────────

    /**
     * Detect question type from section context (instruction + question)
     * More accurate than single text detection
     * 
     * @param instruction - Section instruction text
     * @param questionText - Individual question text
     * @param options - Answer options (if any)
     */
    detectFromSectionContext(
        instruction: string,
        questionText: string,
        options: string[] = []
    ): ClassificationResult {
        // 1. Try instruction-based detection first (highest accuracy)
        const instructionResult = this.classifyQuestion(instruction, options);
        // Preserve wordLimit from instruction even if we override the type below
        const wordLimit = instructionResult.wordLimit;

        if (instructionResult.confidence >= 90) {
            return instructionResult;
        }

        // 2. Enhanced edge case handling (specific patterns)
        const combinedText = `${instruction} ${questionText}`.toLowerCase();

        // sentence + ending → matching-sentence-endings (95%)
        if (
            combinedText.includes('sentence') &&
            combinedText.includes('ending') &&
            !combinedText.includes('not given')
        ) {
            return {
                type: 'matching-sentence-endings',
                confidence: 95,
                uncertain: false,
                optionLabelFormat: this.detectOptionLabelFormat(options),
                detectionSource: 'instruction',
                matchedPattern: 'sentence + ending context',
                wordLimit,
            };
        }

        // complete + ending + A-Z range → matching-sentence-endings (95%)
        if (
            combinedText.includes('complete') &&
            combinedText.includes('ending') &&
            /A[-–][A-Z]/.test(instruction)
        ) {
            return {
                type: 'matching-sentence-endings',
                confidence: 95,
                uncertain: false,
                optionLabelFormat: this.detectOptionLabelFormat(options),
                detectionSource: 'instruction',
                matchedPattern: 'complete + ending + A-Z range',
                wordLimit,
            };
        }

        // list of (people|researcher|scientist|feature) & NOT ending → matching-features (95%)
        if (
            /list\s+of\s+(people|researchers?|scientists?|features?)/i.test(combinedText) &&
            !combinedText.includes('ending')
        ) {
            return {
                type: 'matching-features',
                confidence: 95,
                uncertain: false,
                optionLabelFormat: this.detectOptionLabelFormat(options),
                detectionSource: 'instruction',
                matchedPattern: 'list of people/features context',
                wordLimit,
            };
        }

        // 3. Fallback to question text detection (lower confidence)
        if (questionText && instructionResult.confidence < 70) {
            const questionResult = this.classifyQuestion(questionText, options);

            if (questionResult.confidence > instructionResult.confidence) {
                return {
                    ...questionResult,
                    wordLimit: wordLimit || questionResult.wordLimit, // Prefer instruction-level wordLimit
                    confidence: Math.min(questionResult.confidence, 70), // Cap at 70%
                };
            }
        }

        return instructionResult;
    }

    // ─────────────────────────────────────────────────────────────
    // REUSE LETTERS DETECTION (Task 4.7)
    // ─────────────────────────────────────────────────────────────

    /**
     * Detect if answers can be reused from instruction text
     * Common in matching questions: "NB: You may use any letter more than once"
     * 
     * @param instruction - Section instruction text
     */
    detectReuseLetters(instruction: string): boolean {
        const reusePatterns = [
            /NB[:\s]+you\s+may\s+use\s+any\s+letter\s+more\s+than\s+once/i,
            /you\s+may\s+use\s+any\s+letter\s+more\s+than\s+once/i,
            /letters?\s+may\s+be\s+used\s+more\s+than\s+once/i,
            /some\s+letters?\s+may\s+not\s+be\s+used/i,
            /not\s+all\s+letters?\s+will\s+be\s+used/i,
        ];

        return reusePatterns.some(pattern => pattern.test(instruction));
    }

    // ─────────────────────────────────────────────────────────────
    // WORD LIMIT EXTRACTION (Task 4.8)
    // ─────────────────────────────────────────────────────────────

    /**
     * Extract word limit constraints from instruction text
     * 
     * @param instruction - Section instruction text
     */
    extractWordLimit(instruction: string): WordLimitResult | null {
        for (const { pattern, maxWords, allowNumber } of WORD_LIMIT_PATTERNS) {
            const match = pattern.exec(instruction);
            if (match) {
                // Handle dynamic extraction (maxWords = -1)
                const extractedMaxWords = maxWords === -1
                    ? parseInt(match[1] ?? '0', 10)
                    : maxWords;

                return {
                    maxWords: extractedMaxWords,
                    numbersCountAsWords: !allowNumber,
                    allowNumber: allowNumber ?? false,
                    instruction: match[0],
                };
            }
        }

        return null;
    }

    // ─────────────────────────────────────────────────────────────
    // CONFIDENCE SCORING (Task 4.9)
    // ─────────────────────────────────────────────────────────────

    /**
     * Calculate weighted confidence score based on multiple signals
     * 
     * @param patternConfidence - Confidence from pattern matching
     * @param hasOptions - Whether question has options
     * @param hasWordLimit - Whether word limit was detected
     * @param hasBlank - Whether text contains blank indicators
     */
    calculateWeightedConfidence(
        patternConfidence: number,
        hasOptions: boolean,
        hasWordLimit: boolean,
        hasBlank: boolean
    ): number {
        let score = patternConfidence;

        // Boost confidence if multiple signals align
        if (hasOptions) score += 5;
        if (hasWordLimit) score += 5;
        if (hasBlank) score += 5;

        // Cap at 100
        return Math.min(score, 100);
    }

    // ─────────────────────────────────────────────────────────────
    // OPTION LABEL FORMAT DETECTION
    // ─────────────────────────────────────────────────────────────

    /**
     * Detect whether options use letter (A, B, C) or roman numeral (i, ii, iii) format
     */
    detectOptionLabelFormat(options: string[]): OptionLabelFormat {
        if (!options || options.length === 0) {
            return 'letter'; // Default
        }

        let romanCount = 0;
        let letterCount = 0;

        for (const opt of options) {
            const trimmed = opt.trim();

            // Check for roman numeral prefix (i., ii., iii., iv., v., vi., vii., viii., ix., x.)
            if (/^[ivx]+[.)]\s*/i.test(trimmed)) {
                romanCount++;
            }
            // Check for letter prefix (A., B., C., A), B), etc.)
            else if (/^[A-Z][.)]\s*/i.test(trimmed)) {
                letterCount++;
            }
        }

        return romanCount > letterCount ? 'roman' : 'letter';
    }

    // ─────────────────────────────────────────────────────────────
    // BATCH CLASSIFICATION
    // ─────────────────────────────────────────────────────────────

    /**
     * Classify multiple questions in a section
     * Uses section instruction for context
     * 
     * @param instruction - Section instruction text
     * @param questions - Array of question texts
     * @param optionsPerQuestion - Options for each question (optional)
     */
    classifySection(
        instruction: string,
        questions: string[],
        optionsPerQuestion: string[][] = []
    ): ClassificationResult[] {
        return questions.map((question, index) => {
            const options = optionsPerQuestion[index] ?? [];
            return this.detectFromSectionContext(instruction, question, options);
        });
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * Check if a question type is valid
     */
    isValidQuestionType(type: string): type is QuestionType {
        return QUESTION_TYPES.includes(type as QuestionType);
    }

    /**
     * Get all supported question types
     */
    getSupportedTypes(): readonly QuestionType[] {
        return QUESTION_TYPES;
    }

    /**
     * Get detection patterns (for debugging/testing)
     */
    getPatterns(): DetectionPattern[] {
        return [...this.sortedPatterns];
    }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Default TypeClassifierService instance
 */
export const typeClassifierService = new TypeClassifierService();

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
    hasTrueFalseNotGivenOptions,
    hasYesNoNotGivenOptions,
    hasRomanNumerals,
    DETECTION_PATTERNS,
    WORD_LIMIT_PATTERNS,
};

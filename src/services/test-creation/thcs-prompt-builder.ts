/**
 * THCS Adaptive Prompt Builder — FR-4/5/6/7/9
 *
 * Three sections:
 *   1. Fragment Registry — 16 repair fragments + 8 compromise templates
 *   2. Prompt Builders — buildRepairPrompt(), buildCompromisePrompt()
 *   3. Response Parsers — parseAIRepairResponse(), parseCompromiseResponse()
 *
 * Plus: fragment version hashing and RepairAuditEntry logging.
 * Zero external dependencies — pure data + string assembly + parsing.
 */

import type { IssueCode } from './thcs-text-validator';

// ── Types ─────────────────────────────────────────────────────

export interface RepairFragment {
    issueCode: IssueCode;
    priority: number;       // 1=highest (structure) → 5=lowest (format)
    instruction: string;
    example: string;
    constraint: string;
}

export type CompromiseRoute =
    | 'matching' | 'true-false' | 'translation' | 'matching-headings'
    | 'gap-fill-open' | 'word-ordering' | 'picture-description-mcq'
    | 'picture-description-open'
    // Alternate routes (FR-11 Task 5.2)
    | 'matching-alt' | 'true-false-alt' | 'gap-fill-alt'
    | 'translation-alt' | 'word-ordering-alt';

export interface CompromiseTemplate {
    sourceType: CompromiseRoute;
    targetType: string;
    instruction: string;
    example: string;
    constraint: string;
    preserveFields: string[];
}

export interface ReasoningEntry {
    issueCode: string;
    action: string;
    reasoning: string;
    confidence: 'high' | 'medium' | 'low';
    originalRef: string;
}

export interface ParsedRepairResponse {
    fixedText: string;
    reasoningLog: ReasoningEntry[];
}

export interface ParsedCompromiseResponse {
    convertedText: string;
    reasoning: {
        originalType: string;
        convertedType: string;
        preserved: string;
        lost: string;
        confidence: string;
        teacherNotes: string;
    };
}

export interface RepairAuditEntry {
    timestamp: number;
    model: string;
    temperature: number;
    fragmentHash: string;
    issueCodes: IssueCode[];
    resultConfidence: number;
    reasoningLog: ReasoningEntry[];
    hadUncertain: boolean;
}

// ── Fragment Registry (FR-4) ──────────────────────────────────

export const REPAIR_FRAGMENTS: Record<IssueCode, RepairFragment> = {
    // P1 — Structure
    MERGED_QUESTIONS: { issueCode: 'MERGED_QUESTIONS', priority: 1, instruction: 'Split merged questions onto separate lines. Each question MUST start on its own line with "Question N." prefix.', example: 'BEFORE: Question 1. What? A. a B. b Question 2. Why? A. x B. y\nAFTER:\nQuestion 1. What?\nA. a\nB. b\n\nQuestion 2. Why?\nA. x\nB. y', constraint: 'Do NOT change question text — only add line breaks.' },
    MISSING_Q_PREFIX: { issueCode: 'MISSING_Q_PREFIX', priority: 1, instruction: 'Add "Question N." prefix to lines that have content followed by A./B./C./D. options but missing the prefix.', example: 'BEFORE: He ______ to school.\nA. go\nAFTER: Question 5. He ______ to school.\nA. go', constraint: 'Infer the correct question number from surrounding context. Do NOT duplicate existing numbered questions.' },
    OPTIONS_INLINE: { issueCode: 'OPTIONS_INLINE', priority: 1, instruction: 'Move options to separate lines. Each option (A./B./C./D.) must be on its own line.', example: 'BEFORE: Question 1. Text A. go B. goes C. going D. gone\nAFTER: Question 1. Text\nA. go\nB. goes\nC. going\nD. gone', constraint: 'Keep option text exactly as-is.' },
    AMBIGUOUS_SECTION_SPLIT: { issueCode: 'AMBIGUOUS_SECTION_SPLIT', priority: 1, instruction: 'Split sections that contain both MCQ options and fill-in blanks into two separate sections with appropriate headers.', example: 'BEFORE: I. MIXED\nQuestion 1. ______ (go) → fill-in\nQuestion 2. A. x B. y → MCQ\nAFTER:\nI. VERB FORM [TYPE: verb-form]\nQuestion 1. ______ (go)\n\nII. MULTIPLE CHOICE [TYPE: mcq-grammar]\nQuestion 2.\nA. x\nB. y', constraint: 'Preserve original question numbering. Add appropriate [TYPE:] tags.' },

    // P2 — Answers
    COMPRESSED_ANSWER_KEY: { issueCode: 'COMPRESSED_ANSWER_KEY', priority: 2, instruction: 'Expand compressed answer keys (e.g., "1-5: BACDC") into one answer per line.', example: 'BEFORE: 1-5: BACDC\nAFTER:\n1. B\n2. A\n3. C\n4. D\n5. C', constraint: 'Count carefully — each letter maps to one question number sequentially.' },
    MISSING_ANSWER_KEY: { issueCode: 'MISSING_ANSWER_KEY', priority: 2, instruction: 'Add an ANSWER KEY section at the end. Infer answers from context if possible, marking each with [AI-INFERRED].', example: 'AFTER:\nANSWER KEY\n1. B [AI-INFERRED]\n2. C [AI-INFERRED]', constraint: 'If you cannot confidently infer an answer, write "1. ? [AI-INFERRED]".' },

    // P3 — Metadata/Type
    MISSING_TYPE_TAG: { issueCode: 'MISSING_TYPE_TAG', priority: 3, instruction: 'Add [TYPE: xxx] tag to section headers based on content analysis. Use the standard 20 THCS type slugs.', example: 'BEFORE: I. PHONETICS\nAFTER: I. PHONETICS [TYPE: pronunciation]', constraint: 'Only add tags to sections that do not already have one. Use content patterns (underlined=pronunciation, blanks=verb-form, etc.) to determine type.' },
    TYPE_CONTENT_MISMATCH: { issueCode: 'TYPE_CONTENT_MISMATCH', priority: 3, instruction: 'Fix the [TYPE:] tag to match actual content patterns. If tagged verb-form but has MCQ, change to mcq-grammar.', example: 'BEFORE: I. FILL IN [TYPE: verb-form]\nQuestion 1.\nA. go\nAFTER: I. FILL IN [TYPE: mcq-grammar]\nQuestion 1.\nA. go', constraint: 'Change the tag, NOT the content.' },
    MISSING_PASSAGE_BLOCK: { issueCode: 'MISSING_PASSAGE_BLOCK', priority: 3, instruction: 'Add PASSAGE: delimiter before a reading passage that is missing it. Look for long text blocks before questions.', example: 'BEFORE: III. READING [TYPE: reading-comprehension]\nSolar energy is...\n\nAFTER: III. READING [TYPE: reading-comprehension]\nRead the passage.\n\nPASSAGE:\nSolar energy is...', constraint: 'Do NOT fabricate passage text. Find and wrap existing text.' },

    // P4 — Data
    PASSAGE_NO_PARAGRAPHS: { issueCode: 'PASSAGE_NO_PARAGRAPHS', priority: 3, instruction: 'Add paragraph breaks in long PASSAGE: blocks. Look for sentence boundaries or topic shifts.', example: 'BEFORE: PASSAGE:\nLong text all in one block no breaks...\nAFTER: PASSAGE:\nFirst paragraph...\n\nSecond paragraph...', constraint: 'Do NOT change any words. Only add blank lines between logical paragraphs.' },
    NUMBERING_GAP: { issueCode: 'NUMBERING_GAP', priority: 4, instruction: 'Investigate numbering gaps. Missing questions may be merged into another line or lost between pages.', example: 'Gap Q5→Q7 might mean Q6 is merged: "Question 5. Text Question 6. Text"', constraint: 'Do NOT invent new questions. Only split merged ones if found.' },
    SECTION_NO_QUESTIONS: { issueCode: 'SECTION_NO_QUESTIONS', priority: 4, instruction: 'Section header exists but no questions follow. Check if questions are present but missing prefixes.', example: 'BEFORE: I. GRAMMAR\nHe goes to school.\nA. go\nAFTER: I. GRAMMAR\nQuestion 1. He goes to school.\nA. go', constraint: 'Only add prefixes if content looks like questions. Do NOT add questions to truly empty sections.' },

    // P5 — Format
    BLANK_FORMAT_WRONG: { issueCode: 'BLANK_FORMAT_WRONG', priority: 5, instruction: 'Replace short underscores (___, ..) with standard 6-underscore blanks (______).', example: 'BEFORE: He ___ to school.\nAFTER: He ______ to school.', constraint: 'Only replace blanks in question text, not in passage content.' },
    MISSING_BRACKETS: { issueCode: 'MISSING_BRACKETS', priority: 5, instruction: 'Add missing verb/word brackets in verb-form or word-form questions.', example: 'BEFORE: Question 1. He ______ go to school.\nAFTER: Question 1. He ______ (go) to school.', constraint: 'Only add brackets if the answer key suggests a verb/word transformation. Otherwise leave as-is.' },
    MISSING_ARROW: { issueCode: 'MISSING_ARROW', priority: 5, instruction: 'Add => separator in sentence rewrite questions between original and given start.', example: 'BEFORE: Question 1. He is tall.\nHe is not...\nAFTER: Question 1. He is tall.\n=> He is not...', constraint: 'The => goes on a new line before the given start words.' },
    WORD_BANK_NOT_TAGGED: { issueCode: 'WORD_BANK_NOT_TAGGED', priority: 5, instruction: 'Tag detected word lists with [WORD BANK: word1 / word2 / ...] format.', example: 'BEFORE: pollution, resources, protect, harmful\nAFTER: [WORD BANK: pollution / resources / protect / harmful]', constraint: 'Only tag actual word banks (lists near cloze passages). Do NOT tag option lists.' },
    MISSING_MARKERS: { issueCode: 'MISSING_MARKERS', priority: 5, instruction: 'Add missing formatting markers (bold, underline, braces) for pronunciation-type or word-form-type questions.', example: 'BEFORE: He go to school every day.\nAFTER: He ______ (go) to school every day.', constraint: 'Only add markers where the answer key or context clearly indicates a transformation exercise.' },
};

// ── Compromise Templates (FR-10) ──────────────────────────────

export const COMPROMISE_TEMPLATES: Record<CompromiseRoute, CompromiseTemplate> = {
    'matching': {
        sourceType: 'matching', targetType: 'mcq-vocabulary',
        instruction: 'Convert matching pairs into MCQ format. Each item in column A becomes a question; column B items become options.',
        example: 'BEFORE: Match A-B: 1.Happy-A.Sad 2.Big-B.Large\nAFTER:\nQuestion 1. The word "Happy" is closest in meaning to:\nA. Sad\nB. Large\nC. Small\nD. Angry',
        constraint: 'Generate plausible distractors if fewer than 4 options. Mark any AI-generated options with [AI-GENERATED].',
        preserveFields: ['questionNumber', 'originalPairs'],
    },
    'true-false': {
        sourceType: 'true-false', targetType: 'reading-comprehension',
        instruction: 'Convert True/False/Not Given into MCQ. Each statement becomes a question with A. True B. False C. Not Given D. Not stated.',
        example: 'BEFORE: 1. The sky is blue. TRUE/FALSE\nAFTER:\nQuestion 1. According to the passage, the sky is blue.\nA. True\nB. False\nC. Not Given\nD. Not stated in the passage',
        constraint: 'Preserve the original statement verbatim. Always use 4 options.',
        preserveFields: ['passage', 'statements'],
    },
    'translation': {
        sourceType: 'translation', targetType: 'sentence-rewrite',
        instruction: 'Convert translation exercises into sentence rewrite format.',
        example: 'BEFORE: Dịch: Tôi thích đọc sách.\nAFTER:\nQuestion 1. Tôi thích đọc sách.\n=> I like ...',
        constraint: 'Keep original Vietnamese sentence. Use => separator.',
        preserveFields: ['originalSentence', 'questionNumber'],
    },
    'matching-headings': {
        sourceType: 'matching-headings', targetType: 'reading-comprehension',
        instruction: 'Convert heading-matching into MCQ. Each paragraph → "What is the main idea?" with heading options.',
        example: 'BEFORE: Match paragraph 1 with heading\nAFTER:\nQuestion 1. What is the main idea of paragraph 1?\nA. Heading 1\nB. Heading 2\nC. Heading 3\nD. Heading 4',
        constraint: 'Keep passage text intact. Use headings as MCQ options.',
        preserveFields: ['passage', 'headings'],
    },
    'gap-fill-open': {
        sourceType: 'gap-fill-open', targetType: 'verb-form',
        instruction: 'Convert open gap-fill into verb-form or word-form. Use the answer key to infer bracket content.',
        example: 'BEFORE: He ______ to school. (answer: goes)\nAFTER:\nQuestion 1. He ______ (go) to school.',
        constraint: 'If answer key exists, use it to infer the base form. Otherwise mark [AI-INFERRED].',
        preserveFields: ['questionText', 'answerKey'],
    },
    'word-ordering': {
        sourceType: 'word-ordering', targetType: 'sentence-arrangement',
        instruction: 'Convert word ordering into sentence arrangement format.',
        example: 'BEFORE: Arrange: school / to / I / go\nAFTER:\nQuestion 1. school / to / I / go',
        constraint: 'Keep the word list separator (/ or ,) consistent.',
        preserveFields: ['words', 'questionNumber'],
    },
    'picture-description-mcq': {
        sourceType: 'picture-description-mcq', targetType: 'mcq-sign-notice',
        instruction: 'Convert picture-based MCQ to sign/notice interpretation. Add [Figure: description] tag.',
        example: 'BEFORE: Look at the picture. What does it mean?\nAFTER:\nQuestion 1. [Figure: A road sign showing speed limit 60]\nA. You must drive at 60 km/h\nB. You must not exceed 60 km/h',
        constraint: 'Describe the picture content in [Figure:] tag. Keep MCQ options unchanged.',
        preserveFields: ['options', 'questionNumber'],
    },
    'picture-description-open': {
        sourceType: 'picture-description-open', targetType: 'skip',
        instruction: 'This type cannot be converted. Skip with explanation.',
        example: 'SKIP: Picture description (open-ended) cannot be auto-graded.',
        constraint: 'Always skip. Provide teacher warning.',
        preserveFields: [],
    },
    // ── Alternate Routes (FR-11 Task 5.2) ──
    'matching-alt': {
        sourceType: 'matching-alt', targetType: 'verb-form',
        instruction: 'Convert this matching exercise into fill-in-the-blank questions. Each matched pair becomes one question where the student fills in the matching item.',
        example: 'Original: 1. library - A. a place to borrow books\nConverted: 1. A ______ is a place to borrow books. (library)',
        constraint: 'Preserve ALL original content items. Do not invent new vocabulary.',
        preserveFields: ['questionNumber', 'correctAnswer'],
    },
    'true-false-alt': {
        sourceType: 'true-false-alt', targetType: 'closest-meaning',
        instruction: 'Convert each True/False statement into an MCQ question asking which paraphrase is closest in meaning to the original. Create 4 options (A-D) where one matches the original meaning.',
        example: 'Original: 1. The sun rises in the west. (F)\nConverted: 1. Which sentence has the closest meaning?\nA. The sun rises in the east. B. The sun sets in the west. C. The sun rises in the west. D. The moon rises in the west.',
        constraint: 'The correct answer MUST be the option that reflects the TRUE version of the statement.',
        preserveFields: ['questionNumber'],
    },
    'gap-fill-alt': {
        sourceType: 'gap-fill-alt', targetType: 'mcq-grammar',
        instruction: 'Convert this open-ended gap-fill exercise into MCQ format. For each blank, generate 4 options (A-D) where one is the correct answer.',
        example: 'Original: She ______ (go) to school every day.\nConverted: She ______ to school every day.\nA. go  B. goes  C. going  D. gone',
        constraint: 'The correct option must be the original expected answer. Distractors must be grammatically plausible.',
        preserveFields: ['questionNumber', 'correctAnswer', 'questionText'],
    },
    'translation-alt': {
        sourceType: 'translation-alt', targetType: 'sentence-rewrite',
        instruction: 'Convert this translation exercise into sentence-rewrite format. Use the target language sentence as the question and ask students to rewrite using given words.',
        example: 'Original: Translate: She goes to school every day.\nConverted: Rewrite the sentence: She goes to school every day. (using: attend)',
        constraint: 'If the original has no clear target sentence to rewrite from, this conversion is NOT possible — return FAIL.',
        preserveFields: ['questionNumber'],
    },
    'word-ordering-alt': {
        sourceType: 'word-ordering-alt', targetType: 'sentence-arrangement',
        instruction: 'Re-tag this word-ordering exercise as sentence-arrangement. The content format is often identical — just change the type tag.',
        example: 'No content change needed — this is a re-classification.',
        constraint: 'Preserve all original content exactly. Only the type tag changes.',
        preserveFields: ['questionNumber', 'options', 'correctAnswer', 'questionText'],
    },
};

// ── Prompt Builders ───────────────────────────────────────────

/**
 * Build a repair prompt from detected issues (FR-5).
 * Selects only relevant fragments, sorts by priority, injects both texts.
 */
export function buildRepairPrompt(
    issueCodes: IssueCode[],
    originalInput: string,
    processedText: string,
): string {
    // Select & sort fragments
    const fragments = issueCodes
        .filter(code => code in REPAIR_FRAGMENTS)
        .map(code => REPAIR_FRAGMENTS[code])
        .sort((a, b) => a.priority - b.priority);

    if (fragments.length === 0) return '';

    // Assemble numbered issue instructions
    const issueBlock = fragments.map((f, i) => [
        `${i + 1}. [${f.issueCode}] ${f.instruction}`,
        `   Example: ${f.example}`,
        `   Constraint: ${f.constraint}`,
    ].join('\n')).join('\n\n');

    return `You are repairing a Vietnamese THCS English test document. Fix ONLY the issues listed below.

=== ORIGINAL TEXT (from teacher) ===
${originalInput}

=== PROCESSED TEXT (current state) ===
${processedText}

=== ISSUES TO FIX (${fragments.length} issues, ordered by priority) ===
${issueBlock}

=== OUTPUT FORMAT ===
--- FIXED TEXT ---
[Your corrected version of the PROCESSED TEXT with all issues fixed]

--- REASONING LOG ---
[For each fix, write:]
ISSUE: [issue code]
ACTION: [what you changed]
REASONING: [why, referencing original vs processed]
CONFIDENCE: [high/medium/low]
ORIGINAL_REF: [quote from original input]

RULES:
- PRESERVE all markers: **bold**, __underline__, {{braces}}, [TYPE:], [WORD BANK:]
- PRESERVE all Vietnamese diacritics
- Fix ONLY the listed issues — do NOT make other changes
- Output plain text only (no JSON, no markdown code blocks)`;
}

/**
 * Build a compromise prompt for type conversion (FR-6).
 */
export function buildCompromisePrompt(
    sourceType: CompromiseRoute,
    sectionText: string,
    originalInput: string,
): string {
    const template = COMPROMISE_TEMPLATES[sourceType];
    if (!template) return '';

    if (template.targetType === 'skip') {
        return ''; // Skip types have no prompt — handled by caller
    }

    return `Convert this ${sourceType} section into ${template.targetType} format for a Vietnamese THCS English test.

=== ORIGINAL INPUT (teacher version) ===
${originalInput}

=== SECTION TO CONVERT ===
${sectionText}

=== CONVERSION RULES ===
${template.instruction}

=== EXAMPLE ===
${template.example}

=== CONSTRAINTS ===
${template.constraint}
Fields to preserve: ${template.preserveFields.join(', ')}

=== OUTPUT FORMAT ===
[COMPROMISED: ${sourceType} → ${template.targetType}]
[Converted section text here]

--- REASONING ---
ORIGINAL_TYPE: ${sourceType}
CONVERTED_TYPE: ${template.targetType}
PRESERVED: [what was kept]
LOST: [what was adapted/dropped]
CONFIDENCE: [high/medium/low]
TEACHER_NOTES: [suggestions for teacher review]

RULES:
- Output plain text only
- PRESERVE all Vietnamese diacritics
- Tag output with [COMPROMISED: ${sourceType} → ${template.targetType}]`;
}

// ── Response Parsers ──────────────────────────────────────────

/** Delimiter patterns for splitting repair responses (tried in order). */
const FIXED_TEXT_DELIMITERS = [
    /---\s*FIXED\s*TEXT\s*---/i,
    /===\s*FIXED\s*TEXT\s*===/i,
    /###\s*FIXED\s*TEXT/i,
    /^FIXED\s*TEXT\s*:/im,
];

const REASONING_DELIMITERS = [
    /---\s*REASONING\s*LOG\s*---/i,
    /===\s*REASONING\s*LOG\s*===/i,
    /###\s*REASONING\s*LOG/i,
    /^REASONING\s*LOG\s*:/im,
];

/**
 * Parse AI repair response into fixed text + reasoning log (FR-7).
 * Handles 4 delimiter patterns. If none found, entire response = fixedText.
 */
export function parseAIRepairResponse(rawResponse: string): ParsedRepairResponse {
    const response = rawResponse.trim();

    // Try to find the fixed text / reasoning split
    let fixedText = response;
    let reasoningBlock = '';

    for (let di = 0; di < FIXED_TEXT_DELIMITERS.length; di++) {
        const fixedDelim = FIXED_TEXT_DELIMITERS[di];
        const reasonDelim = REASONING_DELIMITERS[di];

        const fixedMatch = response.match(fixedDelim);
        const reasonMatch = response.match(reasonDelim);

        if (fixedMatch && reasonMatch && fixedMatch.index !== undefined && reasonMatch.index !== undefined) {
            const fixedStart = fixedMatch.index + fixedMatch[0].length;
            const reasonStart = reasonMatch.index + reasonMatch[0].length;

            fixedText = response.slice(fixedStart, reasonMatch.index).trim();
            reasoningBlock = response.slice(reasonStart).trim();
            break;
        }
    }

    // Parse reasoning entries
    const reasoningLog = parseReasoningEntries(reasoningBlock);

    return { fixedText, reasoningLog };
}

/** Parse reasoning block into structured entries. */
function parseReasoningEntries(block: string): ReasoningEntry[] {
    if (!block.trim()) return [];

    const entries: ReasoningEntry[] = [];
    const chunks = block.split(/(?=^ISSUE:\s)/im);

    for (const chunk of chunks) {
        if (!chunk.trim()) continue;

        const entry: ReasoningEntry = {
            issueCode: extractField(chunk, 'ISSUE') || 'UNKNOWN',
            action: extractField(chunk, 'ACTION') || '',
            reasoning: extractField(chunk, 'REASONING') || '',
            confidence: normalizeConfidence(extractField(chunk, 'CONFIDENCE')),
            originalRef: extractField(chunk, 'ORIGINAL_REF') || '',
        };

        entries.push(entry);
    }

    return entries;
}

/** Extract a named field value from text (e.g., "ISSUE: MERGED_QUESTIONS"). */
function extractField(text: string, fieldName: string): string | null {
    const re = new RegExp(`^${fieldName}:\\s*(.+)`, 'im');
    const m = text.match(re);
    return m ? m[1].trim() : null;
}

/** Normalize confidence string to valid enum. */
function normalizeConfidence(val: string | null): 'high' | 'medium' | 'low' {
    if (!val) return 'low';
    const lower = val.toLowerCase().trim();
    if (lower === 'high') return 'high';
    if (lower === 'medium' || lower === 'med') return 'medium';
    return 'low';
}

/**
 * Parse AI compromise response (FR-7).
 */
export function parseCompromiseResponse(rawResponse: string): ParsedCompromiseResponse {
    const response = rawResponse.trim();

    // Try to find reasoning split
    let convertedText = response;
    let reasoningBlock = '';

    const reasonSplitters = [
        /---\s*REASONING\s*---/i,
        /===\s*REASONING\s*===/i,
        /###\s*REASONING/i,
        /^REASONING\s*:/im,
    ];

    for (const pattern of reasonSplitters) {
        const m = response.match(pattern);
        if (m && m.index !== undefined) {
            convertedText = response.slice(0, m.index).trim();
            reasoningBlock = response.slice(m.index + m[0].length).trim();
            break;
        }
    }

    return {
        convertedText,
        reasoning: {
            originalType: extractField(reasoningBlock, 'ORIGINAL_TYPE') || '',
            convertedType: extractField(reasoningBlock, 'CONVERTED_TYPE') || '',
            preserved: extractField(reasoningBlock, 'PRESERVED') || '',
            lost: extractField(reasoningBlock, 'LOST') || '',
            confidence: extractField(reasoningBlock, 'CONFIDENCE') || '',
            teacherNotes: extractField(reasoningBlock, 'TEACHER_NOTES') || '',
        },
    };
}

// ── Fragment Hashing (FR-9) ───────────────────────────────────

/** Simple djb2 hash — deterministic, fast, no crypto dependency. */
function djb2(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash >>> 0; // Ensure unsigned
}

/** Compute a deterministic hash of the fragment instructions used. */
export function computeFragmentHash(issueCodes: IssueCode[]): string {
    const sorted = [...issueCodes].sort();
    const payload = sorted
        .map(code => `${code}:${REPAIR_FRAGMENTS[code]?.instruction || ''}`)
        .join('|');
    return djb2(payload).toString(16).padStart(8, '0');
}

// ── Audit Entry Factory ───────────────────────────────────────

/** Create a RepairAuditEntry for logging. */
export function createAuditEntry(
    model: string,
    temperature: number,
    issueCodes: IssueCode[],
    resultConfidence: number,
    reasoningLog: ReasoningEntry[],
): RepairAuditEntry {
    return {
        timestamp: Date.now(),
        model,
        temperature,
        fragmentHash: computeFragmentHash(issueCodes),
        issueCodes,
        resultConfidence,
        reasoningLog,
        hadUncertain: reasoningLog.some(entry => entry.confidence === 'low'),
    };
}

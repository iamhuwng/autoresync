/**
 * THCS Text Validator — FR-3 (Code Validation Module)
 *
 * Pure deterministic text scanner — NO AI calls.
 * Receives restructured text from Pass 1, runs 16 regex-based checks,
 * detects unsupported types, computes weighted confidence, and returns
 * a ValidationReport that determines the pipeline's next step.
 *
 * Pipeline role: "Traffic Controller"
 *   formatConfidence >= 80 + 0 issues → skip repair, proceed to regex engine
 *   formatConfidence >= 50            → Pass 2 Repair with detected issue codes
 *   formatConfidence < 50             → External API Retry
 *   unsupportedTypes.length > 0       → Compromise routing
 */

// ── Types ─────────────────────────────────────────────────────

export type IssueCode =
    | 'MERGED_QUESTIONS' | 'MISSING_Q_PREFIX' | 'OPTIONS_INLINE'
    | 'COMPRESSED_ANSWER_KEY' | 'MISSING_ANSWER_KEY' | 'MISSING_TYPE_TAG'
    | 'TYPE_CONTENT_MISMATCH' | 'MISSING_PASSAGE_BLOCK' | 'PASSAGE_NO_PARAGRAPHS'
    | 'SECTION_NO_QUESTIONS' | 'AMBIGUOUS_SECTION_SPLIT' | 'NUMBERING_GAP'
    | 'BLANK_FORMAT_WRONG' | 'MISSING_BRACKETS' | 'MISSING_ARROW'
    | 'WORD_BANK_NOT_TAGGED' | 'MISSING_MARKERS';

export type IssueSeverity = 'critical' | 'major' | 'minor';

export type UnsupportedType =
    | 'matching' | 'true-false' | 'translation' | 'matching-headings'
    | 'gap-fill-open' | 'word-ordering' | 'picture-description'
    | 'listening' | 'speaking' | 'essay' | 'composition';

export interface ValidationIssue {
    code: IssueCode;
    severity: IssueSeverity;
    sectionIndex: number;        // -1 for global
    lineRange: [number, number];
    sectionText: string;         // snippet (max 200 chars)
    message: string;
}

export interface ValidationStats {
    sectionCount: number;
    questionCount: number;
    answerCount: number;
    typeTagCount: number;
}

export interface UnsupportedTypeEntry {
    type: UnsupportedType;
    sectionIndex: number;
    canCompromise: boolean;
}

export interface ValidationReport {
    formatConfidence: number;
    issues: ValidationIssue[];
    unsupportedTypes: UnsupportedTypeEntry[];
    stats: ValidationStats;
    originalInput: string;
    processedText: string;
    aiConfidence: number;
    confidenceDisagreement: boolean;
}

// ── Section boundary detection ────────────────────────────────

interface SectionBoundary {
    headerLine: number;     // 0-based line index
    headerText: string;
    typeTag: string | null; // extracted [TYPE: xxx] or null
    startLine: number;      // first content line after header
    endLine: number;        // last line before next section (exclusive)
}

/** Regex matching section headers: Roman numerals or Part/Section/Exercise labels. */
const SECTION_HEADER_RE = /^(?:(?:I{1,3}|IV|V|VI{0,3}|IX|X{0,3})\.?\s+|(?:Part|Section|Exercise|Phần)\s+\w+[\.:]\s*)/i;

/** Extract [TYPE: xxx] tag from a line. */
function extractTypeTag(line: string): string | null {
    const m = line.match(/\[TYPE:\s*([^\]]+)\]/i);
    return m ? m[1].trim().toLowerCase() : null;
}

/** Detect section boundaries in the text. */
export function detectSectionBoundaries(lines: string[]): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const isHeader = SECTION_HEADER_RE.test(line) || extractTypeTag(line) !== null;
        if (isHeader) {
            // Close previous section
            if (boundaries.length > 0) {
                boundaries[boundaries.length - 1].endLine = i;
            }
            boundaries.push({
                headerLine: i,
                headerText: line,
                typeTag: extractTypeTag(line),
                startLine: i + 1,
                endLine: lines.length, // will be updated by next section
            });
        }
    }

    return boundaries;
}

// ── Issue Detectors ───────────────────────────────────────────

const QUESTION_RE = /^(?:Question|Câu|Q)\s*(\d+)\s*[.:]/i;
const OPTION_RE = /^[A-D]\.\s/;
const ANSWER_KEY_RE = /^(?:ANSWER KEY|ĐÁP ÁN|KEY|Đáp án)/i;
const ANSWER_LINE_RE = /^\s*(\d+)\s*[.:]\s*[A-Da-d]\b/;
const COMPRESSED_KEY_RE = /\d+\s*[-–]\s*\d+\s*[:：]\s*[A-Da-d]{2,}/i;

function snippet(text: string, maxLen = 200): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function createIssue(
    code: IssueCode, severity: IssueSeverity, sectionIndex: number,
    lineRange: [number, number], sectionText: string, message: string,
): ValidationIssue {
    return { code, severity, sectionIndex, lineRange, sectionText: snippet(sectionText), message };
}

// ── 1. MERGED_QUESTIONS (critical) ────────────────────────────
export function detectMergedQuestions(lines: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Two "Question N." patterns on same line
        const matches = line.match(/(?:Question|Câu)\s*\d+\s*[.:]/gi);
        if (matches && matches.length >= 2) {
            issues.push(createIssue('MERGED_QUESTIONS', 'critical', -1, [i, i], line,
                `Line ${i + 1}: Multiple questions detected on same line`));
        }
    }
    return issues;
}

// ── 2. MISSING_Q_PREFIX (major) ───────────────────────────────
export function detectMissingQPrefix(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        let hasOptions = false;
        let lastNonOptionLine = -1;

        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (OPTION_RE.test(line)) {
                hasOptions = true;
            } else if (hasOptions) {
                // We just exited an option block — check if the previous question line had a prefix
                hasOptions = false;
            }
            // Line has content + next lines have A./B./C./D. but this line has no Question prefix
            if (!QUESTION_RE.test(line) && !OPTION_RE.test(line) && !ANSWER_KEY_RE.test(line)) {
                const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
                if (OPTION_RE.test(nextLine) && !SECTION_HEADER_RE.test(line)) {
                    issues.push(createIssue('MISSING_Q_PREFIX', 'major', si, [i, i], line,
                        `Line ${i + 1}: Content followed by options but missing "Question N." prefix`));
                }
            }
        }
    }
    return issues;
}

// ── 3. OPTIONS_INLINE (major) ─────────────────────────────────
export function detectOptionsInline(lines: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (QUESTION_RE.test(line) && /\bA\.\s+\S/.test(line) && /\bB\.\s+\S/.test(line)) {
            issues.push(createIssue('OPTIONS_INLINE', 'major', -1, [i, i], line,
                `Line ${i + 1}: Question and options found on same line`));
        }
    }
    return issues;
}

// ── 4. NUMBERING_GAP (minor) ──────────────────────────────────
export function detectNumberingGap(lines: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const questionNumbers: { num: number; line: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(QUESTION_RE);
        if (m) questionNumbers.push({ num: parseInt(m[1], 10), line: i });
    }

    for (let i = 1; i < questionNumbers.length; i++) {
        const prev = questionNumbers[i - 1];
        const curr = questionNumbers[i];
        if (curr.num !== prev.num + 1 && curr.num > prev.num) {
            issues.push(createIssue('NUMBERING_GAP', 'minor', -1,
                [prev.line, curr.line], `Q${prev.num} → Q${curr.num}`,
                `Numbering gap: Question ${prev.num} to ${curr.num}`));
        }
    }
    return issues;
}

// ── 5. SECTION_NO_QUESTIONS (major) ───────────────────────────
export function detectSectionNoQuestions(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        if (ANSWER_KEY_RE.test(sec.headerText)) continue; // answer key sections don't have questions
        let hasQuestion = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            if (QUESTION_RE.test(lines[i])) { hasQuestion = true; break; }
        }
        if (!hasQuestion) {
            issues.push(createIssue('SECTION_NO_QUESTIONS', 'major', si,
                [sec.headerLine, sec.headerLine], sec.headerText,
                `Section "${snippet(sec.headerText, 60)}" has no questions`));
        }
    }
    return issues;
}

// ── 6. AMBIGUOUS_SECTION_SPLIT (major) ────────────────────────
export function detectAmbiguousSectionSplit(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        let hasMCQ = false;
        let hasFillIn = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            const line = lines[i].trim();
            if (OPTION_RE.test(line)) hasMCQ = true;
            if (/______/.test(line) && !OPTION_RE.test(line)) hasFillIn = true;
        }
        if (hasMCQ && hasFillIn) {
            issues.push(createIssue('AMBIGUOUS_SECTION_SPLIT', 'major', si,
                [sec.headerLine, sec.endLine - 1], sec.headerText,
                `Section "${snippet(sec.headerText, 60)}" mixes MCQ and fill-in patterns`));
        }
    }
    return issues;
}

// ── 7. MISSING_TYPE_TAG (major) ───────────────────────────────
export function detectMissingTypeTag(sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        if (ANSWER_KEY_RE.test(sec.headerText)) continue;
        if (!sec.typeTag) {
            issues.push(createIssue('MISSING_TYPE_TAG', 'major', si,
                [sec.headerLine, sec.headerLine], sec.headerText,
                `Section header missing [TYPE: xxx] tag`));
        }
    }
    return issues;
}

// ── 8. TYPE_CONTENT_MISMATCH (major) ──────────────────────────
export function detectTypeContentMismatch(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        if (!sec.typeTag) continue;

        let hasMCQ = false;
        let hasBlanks = false;
        let hasArrow = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            const line = lines[i].trim();
            if (OPTION_RE.test(line)) hasMCQ = true;
            if (/______/.test(line)) hasBlanks = true;
            if (/=>/.test(line)) hasArrow = true;
        }

        const tag = sec.typeTag;
        // Verb-form/word-form should NOT have MCQ options
        if ((tag === 'verb-form' || tag === 'word-form') && hasMCQ && !hasBlanks) {
            issues.push(createIssue('TYPE_CONTENT_MISMATCH', 'major', si,
                [sec.headerLine, sec.endLine - 1], sec.headerText,
                `[TYPE: ${tag}] but content has MCQ options (expected fill-in)`));
        }
        // Sentence-rewrite should have => arrows
        if ((tag === 'sentence-rewrite' || tag === 'sentence-rewrite-keyword') && !hasArrow && hasMCQ) {
            issues.push(createIssue('TYPE_CONTENT_MISMATCH', 'major', si,
                [sec.headerLine, sec.endLine - 1], sec.headerText,
                `[TYPE: ${tag}] but content has MCQ options (expected => rewrites)`));
        }
    }
    return issues;
}

// ── 9. MISSING_PASSAGE_BLOCK (major) ──────────────────────────
export function detectMissingPassageBlock(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const readingTypes = ['reading-comprehension', 'reading-announcement', 'reading-cloze-mcq', 'reading-cloze-wordbank'];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        if (!sec.typeTag || !readingTypes.includes(sec.typeTag)) continue;
        let hasPassage = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            if (/^PASSAGE:/i.test(lines[i].trim())) { hasPassage = true; break; }
        }
        if (!hasPassage) {
            issues.push(createIssue('MISSING_PASSAGE_BLOCK', 'major', si,
                [sec.headerLine, sec.headerLine], sec.headerText,
                `Reading section missing PASSAGE: delimiter`));
        }
    }
    return issues;
}

// ── 10. PASSAGE_NO_PARAGRAPHS (minor) ─────────────────────────
export function detectPassageNoParagraphs(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        let inPassage = false;
        let passageText = '';
        let passageStart = -1;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            if (/^PASSAGE:/i.test(lines[i].trim())) {
                inPassage = true;
                passageStart = i;
                continue;
            }
            if (inPassage) {
                if (QUESTION_RE.test(lines[i])) break; // passage ended
                passageText += lines[i] + '\n';
            }
        }
        if (passageText.length > 200 && !passageText.includes('\n\n')) {
            issues.push(createIssue('PASSAGE_NO_PARAGRAPHS', 'minor', si,
                [passageStart, passageStart + 5], snippet(passageText),
                `Passage > 200 chars with no paragraph breaks`));
        }
    }
    return issues;
}

// ── 11. BLANK_FORMAT_WRONG (minor) ────────────────────────────
export function detectBlankFormatWrong(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            const line = lines[i];
            // Has short underscores (1-5) or dots as blanks
            if (/(?:_{1,5}(?!_)|\.{3,})/.test(line) && QUESTION_RE.test(line)) {
                issues.push(createIssue('BLANK_FORMAT_WRONG', 'minor', si, [i, i], line,
                    `Line ${i + 1}: Blanks should use 6+ underscores (______)`));
                break; // one per section
            }
        }
    }
    return issues;
}

// ── 12. MISSING_BRACKETS (minor) ──────────────────────────────
export function detectMissingBrackets(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const bracketTypes = ['verb-form', 'word-form'];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        if (!sec.typeTag || !bracketTypes.includes(sec.typeTag)) continue;
        let hasBracket = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            if (/\([^)]+\)/.test(lines[i]) && QUESTION_RE.test(lines[i])) {
                hasBracket = true;
                break;
            }
        }
        if (!hasBracket) {
            issues.push(createIssue('MISSING_BRACKETS', 'minor', si,
                [sec.headerLine, sec.headerLine], sec.headerText,
                `${sec.typeTag} section missing (verb)/(WORD) brackets in questions`));
        }
    }
    return issues;
}

// ── 13. MISSING_ARROW (minor) ─────────────────────────────────
export function detectMissingArrow(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const rewriteTypes = ['sentence-rewrite', 'sentence-rewrite-keyword'];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        if (!sec.typeTag || !rewriteTypes.includes(sec.typeTag)) continue;
        let hasArrow = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            if (/=>/.test(lines[i])) { hasArrow = true; break; }
        }
        if (!hasArrow) {
            issues.push(createIssue('MISSING_ARROW', 'minor', si,
                [sec.headerLine, sec.headerLine], sec.headerText,
                `Sentence rewrite section missing => separator`));
        }
    }
    return issues;
}

// ── 14. WORD_BANK_NOT_TAGGED (minor) ──────────────────────────
export function detectWordBankNotTagged(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        let hasClozePattern = false;
        let hasWordList = false;
        let hasWordBankTag = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            const line = lines[i];
            if (/\(\d+\)\s*_{3,}/.test(line)) hasClozePattern = true;
            if (/\[WORD BANK:/i.test(line)) hasWordBankTag = true;
            // Heuristic: line with 3+ words separated by /  or , that looks like a word list
            if (/\w+\s*[\/,]\s*\w+\s*[\/,]\s*\w+/.test(line) && !QUESTION_RE.test(line) && !OPTION_RE.test(line)) {
                hasWordList = true;
            }
        }
        if (hasClozePattern && hasWordList && !hasWordBankTag) {
            issues.push(createIssue('WORD_BANK_NOT_TAGGED', 'minor', si,
                [sec.headerLine, sec.headerLine], sec.headerText,
                `Section has cloze pattern + word list but no [WORD BANK:] tag`));
        }
    }
    return issues;
}

// ── 15. COMPRESSED_ANSWER_KEY (critical) ──────────────────────
export function detectCompressedAnswerKey(lines: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (COMPRESSED_KEY_RE.test(lines[i])) {
            issues.push(createIssue('COMPRESSED_ANSWER_KEY', 'critical', -1, [i, i], lines[i],
                `Line ${i + 1}: Compressed answer key "1-5: BACDC" needs expansion`));
        }
    }
    return issues;
}

// ── 16. MISSING_ANSWER_KEY (critical) ─────────────────────────
export function detectMissingAnswerKey(lines: string[]): ValidationIssue[] {
    let hasAnswerKeyHeader = false;
    let hasAnswerLines = false;
    for (let i = 0; i < lines.length; i++) {
        if (ANSWER_KEY_RE.test(lines[i].trim())) hasAnswerKeyHeader = true;
        if (ANSWER_LINE_RE.test(lines[i].trim())) hasAnswerLines = true;
    }
    if (!hasAnswerKeyHeader && !hasAnswerLines) {
        return [createIssue('MISSING_ANSWER_KEY', 'critical', -1,
            [0, lines.length - 1], '',
            `No answer key section or answer lines detected`)];
    }
    return [];
}

// ── Unsupported Type Detection ────────────────────────────────

const UNSUPPORTED_CONFIG: Record<UnsupportedType, { patterns: RegExp[]; canCompromise: boolean }> = {
    'matching': { patterns: [/\bmatch\b/i, /\bnối\b/i, /column\s*[AB]/i], canCompromise: true },
    'true-false': { patterns: [/\btrue\s*[\\/,]\s*false/i, /\bTRUE\b.*\bFALSE\b.*\bNOT GIVEN\b/i], canCompromise: true },
    'translation': { patterns: [/\btranslat/i, /\bdịch\b/i], canCompromise: true },
    'matching-headings': { patterns: [/match.*heading/i, /heading.*match/i], canCompromise: true },
    'gap-fill-open': { patterns: [], canCompromise: true }, // detected by content, not header
    'word-ordering': { patterns: [/\border\b.*\bword/i, /\bsắp xếp\b/i, /put.*words.*order/i], canCompromise: true },
    'picture-description': { patterns: [/\bpicture\b/i, /\blook at\b/i, /\bdescribe\b/i], canCompromise: true },
    'listening': { patterns: [/\blisten/i, /\bnghe\b/i], canCompromise: false },
    'speaking': { patterns: [/\bspeak/i, /\bnói\b/i], canCompromise: false },
    'essay': { patterns: [/\bessay\b/i, /\bwrite\s+an?\s+essay/i], canCompromise: false },
    'composition': { patterns: [/\bcomposition\b/i, /\bwrite\s+about\b/i, /\bviết\s+về\b/i], canCompromise: false },
};

export function detectUnsupportedTypes(lines: string[], sections: SectionBoundary[]): UnsupportedTypeEntry[] {
    const results: UnsupportedTypeEntry[] = [];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const headerAndContent = lines.slice(sec.headerLine, Math.min(sec.headerLine + 5, sec.endLine)).join(' ');

        for (const [type, config] of Object.entries(UNSUPPORTED_CONFIG) as [UnsupportedType, typeof UNSUPPORTED_CONFIG[UnsupportedType]][]) {
            for (const pattern of config.patterns) {
                if (pattern.test(headerAndContent)) {
                    results.push({ type, sectionIndex: si, canCompromise: config.canCompromise });
                    break;
                }
            }
        }
    }
    return results;
}

// ── Stats Computation ─────────────────────────────────────────

export function computeStats(lines: string[], sections: SectionBoundary[]): ValidationStats {
    let questionCount = 0;
    let answerCount = 0;
    let typeTagCount = 0;

    for (const line of lines) {
        if (QUESTION_RE.test(line)) questionCount++;
        if (ANSWER_LINE_RE.test(line.trim())) answerCount++;
    }

    for (const sec of sections) {
        if (sec.typeTag) typeTagCount++;
    }

    return {
        sectionCount: sections.length,
        questionCount,
        answerCount,
        typeTagCount,
    };
}

// ── Confidence Scorer ─────────────────────────────────────────

export function computeFormatConfidence(issues: ValidationIssue[], stats: ValidationStats): number {
    let score = 100;

    let criticalDeducted = 0;
    let majorDeducted = 0;
    let minorDeducted = 0;

    for (const issue of issues) {
        switch (issue.severity) {
            case 'critical':
                if (criticalDeducted < 60) { score -= 20; criticalDeducted += 20; }
                break;
            case 'major':
                if (majorDeducted < 40) { score -= 10; majorDeducted += 10; }
                break;
            case 'minor':
                if (minorDeducted < 15) { score -= 3; minorDeducted += 3; }
                break;
        }
    }

    // Bonus: all sections have type tags
    if (stats.sectionCount > 0 && stats.typeTagCount === stats.sectionCount) {
        score += 5;
    }
    // Bonus: answer coverage > 90%
    if (stats.questionCount > 0 && stats.answerCount / stats.questionCount > 0.9) {
        score += 5;
    }

    return Math.max(0, Math.min(100, score));
}

// ── 17. MISSING_MARKERS (major) ──────────────────────────────
export function detectMissingMarkers(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const markerTypes = ['pronunciation', 'word-stress', 'error-identification'];
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        if (!sec.typeTag || !markerTypes.includes(sec.typeTag)) continue;
        let hasMarker = false;
        for (let i = sec.startLine; i < sec.endLine && i < lines.length; i++) {
            if (/\{\{[^}]+\}\}/.test(lines[i])) { hasMarker = true; break; }
        }
        if (!hasMarker) {
            issues.push(createIssue('MISSING_MARKERS', 'major', si,
                [sec.headerLine, sec.headerLine], sec.headerText,
                `${sec.typeTag} section missing {{}} markers for target words`));
        }
    }
    return issues;
}

// ── Shared Validation Runner ──────────────────────────────────

/** Run all 17 detectors on the given lines/sections. */
function runValidationChecks(lines: string[], sections: SectionBoundary[]): ValidationIssue[] {
    return [
        ...detectMergedQuestions(lines),
        ...detectMissingQPrefix(lines, sections),
        ...detectOptionsInline(lines),
        ...detectNumberingGap(lines),
        ...detectSectionNoQuestions(lines, sections),
        ...detectAmbiguousSectionSplit(lines, sections),
        ...detectMissingTypeTag(sections),
        ...detectTypeContentMismatch(lines, sections),
        ...detectMissingPassageBlock(lines, sections),
        ...detectPassageNoParagraphs(lines, sections),
        ...detectBlankFormatWrong(lines, sections),
        ...detectMissingBrackets(lines, sections),
        ...detectMissingArrow(lines, sections),
        ...detectWordBankNotTagged(lines, sections),
        ...detectCompressedAnswerKey(lines),
        ...detectMissingAnswerKey(lines),
        ...detectMissingMarkers(lines, sections),
    ];
}

// ── Main Entry Points ─────────────────────────────────────────

/**
 * Validate the original text (before AI processing).
 * Used for parallel assessment (FR-3).
 * Pure function — no AI calls, deterministic, < 50ms.
 */
export function validateOriginalText(
    originalText: string,
): ValidationReport {
    const lines = originalText.split('\n');
    const sections = detectSectionBoundaries(lines);
    const issues = runValidationChecks(lines, sections);
    const unsupportedTypes = detectUnsupportedTypes(lines, sections);
    const stats = computeStats(lines, sections);
    const formatConfidence = computeFormatConfidence(issues, stats);

    return {
        formatConfidence,
        issues,
        unsupportedTypes,
        stats,
        originalInput: originalText,
        processedText: originalText,
        aiConfidence: 0,
        confidenceDisagreement: false,
    };
}

/**
 * Validate restructured text from Pass 1.
 * Pure function — no AI calls, deterministic, < 50ms.
 */
export function validateRestructuredText(
    processedText: string,
    originalInput: string,
    aiConfidence: number,
): ValidationReport {
    const lines = processedText.split('\n');
    const sections = detectSectionBoundaries(lines);
    const issues = runValidationChecks(lines, sections);
    const unsupportedTypes = detectUnsupportedTypes(lines, sections);
    const stats = computeStats(lines, sections);
    const formatConfidence = computeFormatConfidence(issues, stats);
    const confidenceDisagreement = Math.abs(aiConfidence - formatConfidence) > 25;

    return {
        formatConfidence,
        issues,
        unsupportedTypes,
        stats,
        originalInput,
        processedText,
        aiConfidence,
        confidenceDisagreement,
    };
}

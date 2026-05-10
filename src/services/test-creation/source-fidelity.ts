import type {
    ReadingLabeledOption,
    ReadingOptionLabelFormat,
    ReadingSectionReference,
} from '../../types/document.types';

export interface SourceLine {
    lineNumber: number;
    startOffset: number;
    endOffset: number;
    text: string;
    isBlank: boolean;
}

export interface SourceParagraph {
    paragraphNumber: number;
    startOffset: number;
    endOffset: number;
    lineStart: number;
    lineEnd: number;
    text: string;
}

export interface SourceAnchor {
    startOffset: number;
    endOffset: number;
    lineStart: number;
    lineEnd: number;
    excerpt: string;
}

export interface QuestionRange {
    start: number;
    end: number;
}

export interface RawSourcePassageBlock {
    rawPassageId: string;
    order: number;
    headerText: string;
    title: string;
    content: string;
    titleAnchor?: SourceAnchor;
    bodyAnchor: SourceAnchor;
    questionRange?: QuestionRange;
}

export interface RawSourceQuestionBlock {
    rawQuestionId: string;
    questionNumber: number;
    questionText: string;
    rawText: string;
    blockAnchor: SourceAnchor;
    questionAnchor: SourceAnchor;
    instructionText?: string;
    instructionAnchor?: SourceAnchor;
    options: string[];
    sharedOptions: string[];
    optionAnchors: SourceAnchor[];
    sectionRange?: QuestionRange;
}

export interface RawSourceAnswerKeyBlock {
    anchor: SourceAnchor;
    answers: Record<number, string | string[]>;
}

export interface RawSourceArtifact {
    rawText: string;
    normalizedText: string;
    hash: string;
    lines: SourceLine[];
    lineStarts: number[];
    paragraphs: SourceParagraph[];
    passageBlocks: RawSourcePassageBlock[];
    questionBlocks: RawSourceQuestionBlock[];
    answerKeyBlock: RawSourceAnswerKeyBlock | null;
}

export interface FormattedPassageBlock {
    id: string;
    title: string;
    content: string;
    order: number;
    questionRange?: QuestionRange;
    sourceAnchors: SourceAnchor[];
}

export interface FormattedQuestionBlock {
    id: string;
    questionNumber: number;
    questionText: string;
    instructions?: string;
    options?: Array<string | ReadingLabeledOption> | null;
    labeledOptions?: ReadingLabeledOption[] | null;
    optionLabelFormat?: ReadingOptionLabelFormat;
    sectionReferences?: ReadingSectionReference[] | null;
    answer?: string | string[];
    passageId?: string;
    suggestedType?: string;
    confidence: number;
    sourceAnchors: SourceAnchor[];
}

export interface FormattedAnswerKeyBlock {
    id: string;
    answers: Record<number, string | string[]>;
    sourceAnchors: SourceAnchor[];
}

export interface FormattedTestArtifact {
    passages: FormattedPassageBlock[];
    questions: FormattedQuestionBlock[];
    answerKey: FormattedAnswerKeyBlock | null;
    metadata: {
        source: 'ai' | 'rules' | 'offline' | 'hybrid';
        repaired: boolean;
    };
}

export type DamageRegionKind = 'passage' | 'question' | 'answer-key' | 'global';
export type DamageSeverity = 'blocking' | 'warning';
export type DamageIssueCode =
    | 'missing-passage'
    | 'extra-passage'
    | 'passage-text-loss'
    | 'passage-title-loss'
    | 'missing-question'
    | 'extra-question'
    | 'question-text-loss'
    | 'instruction-loss'
    | 'option-loss'
    | 'missing-answer-key'
    | 'answer-key-loss'
    | 'unverified-answer-key-discarded'
    | 'question-numbering-drift'
    | 'ordering-drift'
    | 'coverage-gap';

export interface DamageRegion {
    id: string;
    kind: DamageRegionKind;
    severity: DamageSeverity;
    issueCode: DamageIssueCode;
    message: string;
    relatedBlockId?: string;
    rawPassageId?: string;
    rawQuestionId?: string;
    questionNumber?: number;
    questionRange?: QuestionRange;
    passageOrder?: number;
    rawAnchor?: SourceAnchor;
    rawSlice?: string;
    formattedSlice?: string;
}

export interface VerifiedFormattedTest {
    passages: FormattedPassageBlock[];
    questions: FormattedQuestionBlock[];
    answerKey: Record<number, string | string[]>;
}

export interface VerificationArtifact {
    sourceFidelityPass: boolean;
    hasBlockingDamage: boolean;
    rawQuestionNumbers: number[];
    formattedQuestionNumbers: number[];
    rawPassageIds: string[];
    formattedPassageIds: string[];
    verifiedTest: VerifiedFormattedTest;
    damageRegions: DamageRegion[];
}

export interface RepairRegion {
    id: string;
    kind: DamageRegionKind;
    rawSlice: string;
    previousFormattedSlice: string;
    findings: string[];
    stableBoundaries: {
        before?: string;
        after?: string;
    };
    linkedMetadata: {
        rawPassageId?: string;
        rawQuestionId?: string;
        questionNumber?: number;
        questionRange?: QuestionRange;
        passageOrder?: number;
    };
}

export interface BlastRadiusRepairRequest {
    regions: RepairRegion[];
}

export interface RepairArtifact {
    attempted: boolean;
    request: BlastRadiusRepairRequest;
    repairedFormattedTest: FormattedTestArtifact;
    verification: VerificationArtifact;
}

interface RawQuestionSection {
    startLine: number;
    endLine: number;
    range?: QuestionRange;
    instructionText?: string;
    instructionAnchor?: SourceAnchor;
    sharedOptions: string[];
}

interface TextCoverageResult {
    pass: boolean;
    formattedCoverage: number;
    rawCoverage: number;
}

const PASSAGE_HEADER_PATTERN =
    /^\s*(?:READING\s+)?PASSAGE\s+([A-Z0-9]+)(?:\s*[:\-–—]\s*(.+))?\s*$/i;
const QUESTION_RANGE_HEADER_PATTERN =
    /^\s*Questions?\s+(\d+)\s*(?:-|–|—|to)\s*(\d+)\b.*$/i;
const QUESTION_START_PATTERN =
    /^\s*(?:[-*]\s*)?(?:\*\*|__)?(?:Question\s+)?(\d+)\s*[.)](?:\*\*|__)?\s*(.*)$/i;
const OPTION_LINE_PATTERN =
    /^\s*(?:\*\*|__)?([A-Z]|\d+|(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i))(?:\*\*|__)?\s*[.)]\s+(.+)$/i;
const ANSWER_KEY_HEADER_PATTERN =
    /^(?:[=\-*#\s]*(?:[ivxlcdm]+\.?\s*|\d+\.?\s*)?)?(?:answer\s*key|answers?)[:\s=\-*]*/i;
const ANSWER_KEY_LINE_PATTERN = /^\s*(?:question\s*)?(\d+)[.):\-\s]+(.+?)\s*$/i;
const ANSWER_KEY_INLINE_PATTERN =
    /(?:question\s*)?(\d+)[:.)\-\s]+([A-Z])/gi;
const INSTRUCTION_HINT_PATTERN =
    /\b(complete|choose|write|do the following|list of|answer the|which paragraph|which section|true|false|not given|yes|no)\b/i;
const TABLE_HEADERS_PREFIX_PATTERN = /^\s*table_headers\s*:\s*/i;
const HTML_TABLE_ROW_PATTERN = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
const HTML_TABLE_CELL_PATTERN = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
const HTML_TABLE_QUESTION_NUMBER_PATTERN = /<strong>\s*(\d+)\s*<\/strong>/i;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_BREAK_TAG_PATTERN = /<br\s*\/?>/gi;

interface InlineTableQuestionCandidate {
    questionNumber: number;
    questionText: string;
    rawText: string;
}

const normalizeNewlines = (value: string): string => value.replace(/\r\n?/g, '\n');

const createSimpleHash = (value: string): string => {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
};

const clampLineIndex = (lines: SourceLine[], value: number): number => {
    if (lines.length === 0) return 0;
    return Math.min(Math.max(value, 0), lines.length - 1);
};

const createAnchorFromLineRange = (
    normalizedText: string,
    lines: SourceLine[],
    startLine: number,
    endLine: number,
): SourceAnchor => {
    const safeStartLine = clampLineIndex(lines, startLine);
    const safeEndLine = clampLineIndex(lines, Math.max(endLine, safeStartLine));
    const startOffset = lines[safeStartLine]?.startOffset ?? 0;
    const endOffset = lines[safeEndLine]?.endOffset ?? startOffset;

    return {
        startOffset,
        endOffset,
        lineStart: safeStartLine + 1,
        lineEnd: safeEndLine + 1,
        excerpt: normalizedText.slice(startOffset, endOffset),
    };
};

const buildLines = (normalizedText: string): { lines: SourceLine[]; lineStarts: number[] } => {
    const parts = normalizedText.split('\n');
    const lines: SourceLine[] = [];
    const lineStarts: number[] = [];
    let cursor = 0;

    parts.forEach((part, index) => {
        const startOffset = cursor;
        const endOffset = startOffset + part.length;

        lineStarts.push(startOffset);
        lines.push({
            lineNumber: index + 1,
            startOffset,
            endOffset,
            text: part,
            isBlank: part.trim().length === 0,
        });

        cursor = endOffset + 1;
    });

    return { lines, lineStarts };
};

const buildParagraphs = (normalizedText: string, lines: SourceLine[]): SourceParagraph[] => {
    const paragraphs: SourceParagraph[] = [];
    let startLine: number | null = null;

    const flush = (endLine: number): void => {
        if (startLine === null) return;

        const anchor = createAnchorFromLineRange(normalizedText, lines, startLine, endLine);
        const text = anchor.excerpt.trim();
        if (!text) {
            startLine = null;
            return;
        }

        paragraphs.push({
            paragraphNumber: paragraphs.length + 1,
            startOffset: anchor.startOffset,
            endOffset: anchor.endOffset,
            lineStart: anchor.lineStart,
            lineEnd: anchor.lineEnd,
            text,
        });

        startLine = null;
    };

    lines.forEach((line, index) => {
        if (!line.isBlank && startLine === null) {
            startLine = index;
            return;
        }

        if (line.isBlank && startLine !== null) {
            flush(index - 1);
        }
    });

    if (startLine !== null) {
        flush(lines.length - 1);
    }

    return paragraphs;
};

const findAnswerKeyStartLine = (lines: SourceLine[]): number | null => {
    for (let index = 0; index < lines.length; index += 1) {
        if (ANSWER_KEY_HEADER_PATTERN.test(lines[index]?.text.trim() || '')) {
            return index;
        }
    }

    return null;
};

const parseAnswerKeyBlock = (
    normalizedText: string,
    lines: SourceLine[],
    startLine: number | null,
): RawSourceAnswerKeyBlock | null => {
    if (startLine === null) {
        return null;
    }

    const answers: Record<number, string | string[]> = {};

    for (let index = startLine + 1; index < lines.length; index += 1) {
        const line = lines[index]?.text.trim() || '';
        if (!line) continue;

        const lineMatch = line.match(ANSWER_KEY_LINE_PATTERN);
        if (lineMatch?.[1] && lineMatch[2]) {
            answers[Number.parseInt(lineMatch[1], 10)] = lineMatch[2].trim();
            continue;
        }

        ANSWER_KEY_INLINE_PATTERN.lastIndex = 0;
        let inlineMatch: RegExpExecArray | null;
        while ((inlineMatch = ANSWER_KEY_INLINE_PATTERN.exec(line)) !== null) {
            const questionNumber = Number.parseInt(inlineMatch[1] || '', 10);
            const answer = inlineMatch[2]?.toUpperCase();

            if (Number.isFinite(questionNumber) && answer) {
                answers[questionNumber] = answer;
            }
        }
    }

    const anchor = createAnchorFromLineRange(normalizedText, lines, startLine, lines.length - 1);

    return {
        anchor,
        answers,
    };
};

const decodeHtmlEntities = (value: string): string =>
    value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, '\'');

const htmlToPlainText = (value: string): string =>
    decodeHtmlEntities(value)
        .replace(HTML_BREAK_TAG_PATTERN, ' ')
        .replace(HTML_TAG_PATTERN, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const buildInlineTableQuestionText = (
    questionNumber: number,
    headerCells: string[],
    rowCells: string[],
    blankCellIndex: number,
    rowText: string,
): string => {
    const blankHeader = (headerCells[blankCellIndex] || '').trim();
    const companionText = rowCells
        .filter((_, cellIndex) => cellIndex !== blankCellIndex)
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(' | ');

    if (blankHeader && companionText) {
        return `${blankHeader}: ${companionText}`.trim();
    }

    const withoutQuestionNumber = rowText
        .replace(new RegExp(`^${questionNumber}\\s*[.)\\-:]*\\s*`), '')
        .trim();

    return withoutQuestionNumber || rowText;
};

const extractInlineTableQuestionCandidates = (
    value: string,
): InlineTableQuestionCandidate[] => {
    if (!/<table\b/i.test(value) && !/<tr\b/i.test(value)) {
        return [];
    }

    const rows = value.match(HTML_TABLE_ROW_PATTERN) || [];
    if (rows.length === 0) {
        return [];
    }

    const candidates: InlineTableQuestionCandidate[] = [];
    let headerCells: string[] = [];

    rows.forEach((rowHtml) => {
        const cellMatches = [...rowHtml.matchAll(HTML_TABLE_CELL_PATTERN)];
        const cellHtml = cellMatches.map((match) => match[1] || '');
        const cellTexts = cellHtml.map((cell) => htmlToPlainText(cell));
        const questionNumberMatch = rowHtml.match(HTML_TABLE_QUESTION_NUMBER_PATTERN);

        if (questionNumberMatch?.[1]) {
            const questionNumber = Number.parseInt(questionNumberMatch[1], 10);
            const blankCellIndex = cellHtml.findIndex((cell) =>
                HTML_TABLE_QUESTION_NUMBER_PATTERN.test(cell),
            );
            const rowText = htmlToPlainText(rowHtml);

            candidates.push({
                questionNumber,
                questionText: buildInlineTableQuestionText(
                    questionNumber,
                    headerCells,
                    cellTexts,
                    blankCellIndex >= 0 ? blankCellIndex : 0,
                    rowText,
                ),
                rawText: rowText,
            });

            return;
        }

        if (cellTexts.length >= 2) {
            headerCells = cellTexts;
        }
    });

    return candidates;
};

const isQuestionStartLine = (value: string): boolean =>
    QUESTION_START_PATTERN.test(value.trim()) ||
    extractInlineTableQuestionCandidates(value).length > 0;

const toOptionText = (option: string | ReadingLabeledOption): string => {
    if (typeof option === 'string') {
        return option.trim();
    }

    return (option.text || '').trim();
};

const getFormattedQuestionOptions = (question: FormattedQuestionBlock): string[] => {
    const directOptions = Array.isArray(question.options)
        ? question.options.map(toOptionText).filter(Boolean)
        : [];
    if (directOptions.length > 0) {
        return directOptions;
    }

    return Array.isArray(question.labeledOptions)
        ? question.labeledOptions.map((option) => option.text.trim()).filter(Boolean)
        : [];
};

const normalizeComparableValue = (value: string, mode: 'text' | 'instruction'): string => {
    const normalized = normalizeNewlines(value)
        .replace(/\u00A0/g, ' ')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, '\'')
        .replace(/[–—]/g, '-')
        .replace(/\|/g, ' ')
        .replace(/[()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    if (mode !== 'instruction') {
        return normalized;
    }

    return normalized.replace(TABLE_HEADERS_PREFIX_PATTERN, '').trim();
};

const tokenizeComparableValue = (
    value: string,
    mode: 'text' | 'instruction',
): string[] =>
    normalizeComparableValue(value, mode).match(/[a-z0-9]+|_{2,}|\.{2,}/g) || [];

const calculateOrderedCoverage = (needle: string[], haystack: string[]): number => {
    if (needle.length === 0) {
        return 1;
    }

    let needleIndex = 0;
    let matches = 0;

    haystack.forEach((token) => {
        if (needleIndex >= needle.length) {
            return;
        }

        if (token === needle[needleIndex]) {
            matches += 1;
            needleIndex += 1;
        }
    });

    return matches / needle.length;
};

const compareTextCoverage = (
    formatted: string,
    raw: string,
    mode: 'strict-question' | 'normalized-question' | 'instruction' | 'passage' | 'title',
): TextCoverageResult => {
    const tokenMode = mode === 'instruction' ? 'instruction' : 'text';
    const formattedTokens = tokenizeComparableValue(formatted, tokenMode);
    const rawTokens = tokenizeComparableValue(raw, tokenMode);
    const formattedCoverage = calculateOrderedCoverage(formattedTokens, rawTokens);
    const rawCoverage = calculateOrderedCoverage(rawTokens, formattedTokens);

    switch (mode) {
        case 'passage':
            return {
                pass: formattedCoverage >= 0.95 && rawCoverage >= 0.8,
                formattedCoverage,
                rawCoverage,
            };
        case 'instruction':
            return {
                pass: formattedCoverage >= 0.8 && rawCoverage >= 0.45,
                formattedCoverage,
                rawCoverage,
            };
        case 'normalized-question':
            return {
                pass: formattedCoverage >= 0.85 && rawCoverage >= 0.55,
                formattedCoverage,
                rawCoverage,
            };
        case 'title':
            return {
                pass: formattedCoverage >= 0.8,
                formattedCoverage,
                rawCoverage,
            };
        case 'strict-question':
        default:
            return {
                pass: formattedCoverage >= 0.95 && rawCoverage >= 0.75,
                formattedCoverage,
                rawCoverage,
            };
    }
};

const buildRawQuestionSections = (
    normalizedText: string,
    lines: SourceLine[],
    answerKeyStartLine: number | null,
): RawQuestionSection[] => {
    const boundaryLine = answerKeyStartLine ?? lines.length;
    const headerIndices = lines
        .map((line, index) => ({
            index,
            match: line.text.match(QUESTION_RANGE_HEADER_PATTERN),
        }))
        .filter((entry) => entry.index < boundaryLine && entry.match);

    if (headerIndices.length === 0) {
        const firstQuestionLine = lines.findIndex((line, index) =>
            index < boundaryLine && isQuestionStartLine(line.text),
        );

        if (firstQuestionLine < 0) {
            return [];
        }

        return [{
            startLine: firstQuestionLine,
            endLine: boundaryLine - 1,
            sharedOptions: [],
        }];
    }

    return headerIndices.map((header, headerIndex) => {
        const nextHeaderLine = headerIndices[headerIndex + 1]?.index ?? boundaryLine;
        const rangeMatch = header.match;
        const section: RawQuestionSection = {
            startLine: header.index,
            endLine: nextHeaderLine - 1,
            range: rangeMatch?.[1] && rangeMatch[2]
                ? {
                    start: Number.parseInt(rangeMatch[1], 10),
                    end: Number.parseInt(rangeMatch[2], 10),
                }
                : undefined,
            sharedOptions: [],
        };

        let firstQuestionLine: number | null = null;
        const instructionLines: number[] = [];

        for (let index = header.index + 1; index < nextHeaderLine; index += 1) {
            const lineText = lines[index]?.text || '';
            if (isQuestionStartLine(lineText)) {
                firstQuestionLine = index;
                break;
            }

            const trimmed = lineText.trim();
            if (!trimmed) {
                continue;
            }

            const optionMatch = trimmed.match(OPTION_LINE_PATTERN);
            if (optionMatch?.[2]) {
                section.sharedOptions.push(optionMatch[2].trim());
            } else {
                instructionLines.push(index);
            }
        }

        if (instructionLines.length > 0) {
            const anchor = createAnchorFromLineRange(
                normalizedText,
                lines,
                instructionLines[0] || header.index + 1,
                instructionLines[instructionLines.length - 1] || header.index + 1,
            );
            const instructionText = anchor.excerpt.trim();
            const isLikelyInstruction =
                instructionText.length <= 500 || INSTRUCTION_HINT_PATTERN.test(instructionText);

            if (isLikelyInstruction) {
                section.instructionText = instructionText;
                section.instructionAnchor = anchor;
            }
        }

        if (firstQuestionLine !== null) {
            section.startLine = firstQuestionLine;
        }

        return section;
    });
};

const buildRawQuestionBlocks = (
    normalizedText: string,
    lines: SourceLine[],
    sections: RawQuestionSection[],
): RawSourceQuestionBlock[] => {
    const blocks: RawSourceQuestionBlock[] = [];

    sections.forEach((section) => {
        let currentQuestionNumber: number | null = null;
        let currentStartLine: number | null = null;
        let questionTextLines: string[] = [];
        let options: string[] = [];
        let optionAnchors: SourceAnchor[] = [];
        let currentOptionIndex: number | null = null;

        const flush = (endLine: number): void => {
            if (currentQuestionNumber === null || currentStartLine === null) {
                return;
            }

            const blockAnchor = createAnchorFromLineRange(
                normalizedText,
                lines,
                currentStartLine,
                endLine,
            );
            const questionAnchor = createAnchorFromLineRange(
                normalizedText,
                lines,
                currentStartLine,
                currentStartLine,
            );
            const questionText = questionTextLines.join(' ').replace(/\s+/g, ' ').trim();

            blocks.push({
                rawQuestionId: `raw-question-${currentQuestionNumber}`,
                questionNumber: currentQuestionNumber,
                questionText,
                rawText: blockAnchor.excerpt.trim(),
                blockAnchor,
                questionAnchor,
                instructionText: section.instructionText,
                instructionAnchor: section.instructionAnchor,
                options,
                sharedOptions: section.sharedOptions,
                optionAnchors,
                sectionRange: section.range,
            });

            currentQuestionNumber = null;
            currentStartLine = null;
            questionTextLines = [];
            options = [];
            optionAnchors = [];
            currentOptionIndex = null;
        };

        for (let index = section.startLine; index <= section.endLine; index += 1) {
            const lineText = lines[index]?.text || '';
            const trimmed = lineText.trim();

            if (!trimmed) {
                continue;
            }

            const inlineTableQuestions = extractInlineTableQuestionCandidates(lineText);
            if (inlineTableQuestions.length > 0) {
                if (currentQuestionNumber !== null && currentStartLine !== null) {
                    flush(index - 1);
                }

                const tableLineAnchor = createAnchorFromLineRange(normalizedText, lines, index, index);

                inlineTableQuestions.forEach((candidate) => {
                    blocks.push({
                        rawQuestionId: `raw-question-${candidate.questionNumber}`,
                        questionNumber: candidate.questionNumber,
                        questionText: candidate.questionText,
                        rawText: candidate.rawText,
                        blockAnchor: tableLineAnchor,
                        questionAnchor: tableLineAnchor,
                        instructionText: section.instructionText,
                        instructionAnchor: section.instructionAnchor,
                        options: [],
                        sharedOptions: [],
                        optionAnchors: [],
                        sectionRange: section.range,
                    });
                });

                currentQuestionNumber = null;
                currentStartLine = null;
                questionTextLines = [];
                options = [];
                optionAnchors = [];
                currentOptionIndex = null;
                continue;
            }

            const questionMatch = trimmed.match(QUESTION_START_PATTERN);
            if (questionMatch?.[1]) {
                if (currentQuestionNumber !== null && currentStartLine !== null) {
                    flush(index - 1);
                }

                currentQuestionNumber = Number.parseInt(questionMatch[1], 10);
                currentStartLine = index;
                currentOptionIndex = null;

                const firstQuestionText = (questionMatch[2] || '').trim();
                questionTextLines = firstQuestionText ? [firstQuestionText] : [];
                continue;
            }

            if (currentQuestionNumber === null || currentStartLine === null) {
                continue;
            }

            const optionMatch = trimmed.match(OPTION_LINE_PATTERN);
            if (optionMatch?.[2]) {
                options.push(optionMatch[2].trim());
                optionAnchors.push(
                    createAnchorFromLineRange(normalizedText, lines, index, index),
                );
                currentOptionIndex = options.length - 1;
                continue;
            }

            if (currentOptionIndex !== null && options[currentOptionIndex]) {
                options[currentOptionIndex] = `${options[currentOptionIndex]} ${trimmed}`.trim();
                continue;
            }

            questionTextLines.push(trimmed);
        }

        flush(section.endLine);
    });

    return blocks;
};

const extractPassageQuestionRange = (
    sections: RawQuestionSection[],
    startLine: number,
    endLine: number,
): QuestionRange | undefined => {
    const sectionRanges = sections
        .filter((section) => section.range && section.startLine >= startLine && section.startLine <= endLine)
        .map((section) => section.range as QuestionRange);

    if (sectionRanges.length === 0) {
        return undefined;
    }

    return {
        start: Math.min(...sectionRanges.map((range) => range.start)),
        end: Math.max(...sectionRanges.map((range) => range.end)),
    };
};

const extractRawPassageBlocks = (
    normalizedText: string,
    lines: SourceLine[],
    questionSections: RawQuestionSection[],
    answerKeyStartLine: number | null,
): RawSourcePassageBlock[] => {
    const passageHeaderIndices = lines
        .map((line, index) => ({
            index,
            match: line.text.match(PASSAGE_HEADER_PATTERN),
        }))
        .filter((entry) => entry.match);
    const boundaryLine = answerKeyStartLine ?? lines.length;

    if (passageHeaderIndices.length === 0) {
        const firstQuestionRangeHeaderLine = lines.findIndex((line) =>
            QUESTION_RANGE_HEADER_PATTERN.test(line.text.trim()),
        );
        const firstQuestionLine = Math.min(
            questionSections[0]?.startLine ?? boundaryLine,
            firstQuestionRangeHeaderLine >= 0 ? firstQuestionRangeHeaderLine : boundaryLine,
        );
        const passageEndLine = Math.max(firstQuestionLine - 1, 0);
        const anchor = createAnchorFromLineRange(normalizedText, lines, 0, passageEndLine);
        const content = anchor.excerpt.trim();

        if (!content) {
            return [];
        }

        return [{
            rawPassageId: 'raw-passage-1',
            order: 1,
            headerText: 'Reading Passage',
            title: 'Reading Passage',
            content,
            bodyAnchor: anchor,
            questionRange: extractPassageQuestionRange(questionSections, 0, passageEndLine),
        }];
    }

    return passageHeaderIndices.map((entry, index) => {
        const nextPassageLine = passageHeaderIndices[index + 1]?.index ?? boundaryLine;
        const nextQuestionSectionLine = questionSections.find((section) =>
            section.startLine > entry.index && section.startLine < nextPassageLine,
        )?.startLine;
        const nextQuestionHeaderLine = lines.findIndex((line, lineIndex) =>
            lineIndex > entry.index &&
            lineIndex < nextPassageLine &&
            QUESTION_RANGE_HEADER_PATTERN.test(line.text.trim()),
        );
        const nextQuestionLine = Math.min(
            nextQuestionSectionLine ?? nextPassageLine,
            nextQuestionHeaderLine >= 0 ? nextQuestionHeaderLine : nextPassageLine,
        );
        const passageEndLine = Math.max(nextQuestionLine - 1, entry.index);
        const bodyStartLine = entry.index + 1;
        const headerMatch = entry.match;
        const headerTitle = (headerMatch?.[2] || '').trim();

        let title = headerTitle;
        let titleAnchor: SourceAnchor | undefined;
        let effectiveBodyStartLine = bodyStartLine;

        if (!title) {
            const candidateTitleLine = lines[bodyStartLine];
            const candidateTitleText = candidateTitleLine?.text.trim() || '';
            if (
                candidateTitleText &&
                !QUESTION_RANGE_HEADER_PATTERN.test(candidateTitleText) &&
                !isQuestionStartLine(candidateTitleText) &&
                candidateTitleText.length <= 160
            ) {
                title = candidateTitleText;
                titleAnchor = createAnchorFromLineRange(
                    normalizedText,
                    lines,
                    bodyStartLine,
                    bodyStartLine,
                );
                effectiveBodyStartLine = bodyStartLine + 1;
            }
        }

        const bodyAnchor = createAnchorFromLineRange(
            normalizedText,
            lines,
            Math.min(effectiveBodyStartLine, passageEndLine),
            passageEndLine,
        );

        return {
            rawPassageId: `raw-passage-${index + 1}`,
            order: index + 1,
            headerText: lines[entry.index]?.text.trim() || '',
            title: title || `Reading Passage ${index + 1}`,
            content: bodyAnchor.excerpt.trim(),
            titleAnchor,
            bodyAnchor,
            questionRange: extractPassageQuestionRange(
                questionSections,
                entry.index,
                nextPassageLine - 1,
            ),
        };
    }).filter((block) => block.content.length > 0);
};

export const createRawSourceArtifact = (rawText: string): RawSourceArtifact => {
    const normalizedText = normalizeNewlines(rawText);
    const { lines, lineStarts } = buildLines(normalizedText);
    const paragraphs = buildParagraphs(normalizedText, lines);
    const answerKeyStartLine = findAnswerKeyStartLine(lines);
    const answerKeyBlock = parseAnswerKeyBlock(normalizedText, lines, answerKeyStartLine);
    const questionSections = buildRawQuestionSections(normalizedText, lines, answerKeyStartLine);
    const questionBlocks = buildRawQuestionBlocks(normalizedText, lines, questionSections);
    const passageBlocks = extractRawPassageBlocks(
        normalizedText,
        lines,
        questionSections,
        answerKeyStartLine,
    );

    return {
        rawText,
        normalizedText,
        hash: createSimpleHash(rawText),
        lines,
        lineStarts,
        paragraphs,
        passageBlocks,
        questionBlocks,
        answerKeyBlock,
    };
};

const findMatchingRawPassage = (
    formatted: FormattedPassageBlock,
    rawPassages: RawSourcePassageBlock[],
    usedPassageIds: Set<string>,
): RawSourcePassageBlock | undefined => {
    const byRange = formatted.questionRange
        ? rawPassages.find((candidate) =>
            !usedPassageIds.has(candidate.rawPassageId) &&
            candidate.questionRange?.start === formatted.questionRange?.start &&
            candidate.questionRange?.end === formatted.questionRange?.end,
        )
        : undefined;

    if (byRange) {
        return byRange;
    }

    const byOrder = rawPassages.find((candidate) =>
        !usedPassageIds.has(candidate.rawPassageId) && candidate.order === formatted.order,
    );

    if (byOrder) {
        return byOrder;
    }

    return rawPassages.find((candidate) => !usedPassageIds.has(candidate.rawPassageId));
};

const inferFallbackQuestionType = (question: RawSourceQuestionBlock): string => {
    if (question.options.length > 0 || question.sharedOptions.length > 0) {
        return 'multiple-choice';
    }

    return 'sentence-completion';
};

const inferQuestionPassageId = (
    question: RawSourceQuestionBlock,
    rawSource: RawSourceArtifact,
): string | undefined => {
    return rawSource.passageBlocks.find((passage) =>
        passage.questionRange &&
        question.questionNumber >= passage.questionRange.start &&
        question.questionNumber <= passage.questionRange.end,
    )?.rawPassageId.replace('raw-', '');
};

const createRepairedQuestionFromRaw = (
    rawSource: RawSourceArtifact,
    rawQuestion: RawSourceQuestionBlock,
    existingQuestion?: FormattedQuestionBlock,
): FormattedQuestionBlock => {
    const repairedOptions =
        rawQuestion.options.length > 0
            ? rawQuestion.options
            : rawQuestion.sharedOptions.length > 0
                ? rawQuestion.sharedOptions
                : existingQuestion?.options || null;

    return {
        id: existingQuestion?.id || `question-${rawQuestion.questionNumber}`,
        questionNumber: rawQuestion.questionNumber,
        questionText: rawQuestion.questionText || existingQuestion?.questionText || '',
        instructions:
            rawQuestion.instructionText || existingQuestion?.instructions?.trim() || undefined,
        options: repairedOptions,
        labeledOptions:
            Array.isArray(repairedOptions) && repairedOptions.length > 0
                ? undefined
                : existingQuestion?.labeledOptions,
        optionLabelFormat: existingQuestion?.optionLabelFormat,
        sectionReferences: existingQuestion?.sectionReferences || null,
        answer:
            rawSource.answerKeyBlock
                ? rawSource.answerKeyBlock.answers[rawQuestion.questionNumber] ||
                    existingQuestion?.answer
                : undefined,
        passageId:
            existingQuestion?.passageId ||
            inferQuestionPassageId(rawQuestion, rawSource),
        suggestedType: existingQuestion?.suggestedType || inferFallbackQuestionType(rawQuestion),
        confidence: existingQuestion?.confidence ?? 40,
        sourceAnchors: [
            rawQuestion.blockAnchor,
            ...(rawQuestion.instructionAnchor ? [rawQuestion.instructionAnchor] : []),
        ],
    };
};

const createRepairedPassageFromRaw = (
    rawPassage: RawSourcePassageBlock,
    existingPassage?: FormattedPassageBlock,
): FormattedPassageBlock => ({
    id: existingPassage?.id || rawPassage.rawPassageId.replace('raw-', ''),
    title: rawPassage.title || existingPassage?.title || `Reading Passage ${rawPassage.order}`,
    content: rawPassage.content,
    order: rawPassage.order,
    questionRange: rawPassage.questionRange || existingPassage?.questionRange,
    sourceAnchors: [
        ...(rawPassage.titleAnchor ? [rawPassage.titleAnchor] : []),
        rawPassage.bodyAnchor,
    ],
});

const normalizeAnswerValue = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) {
        return value.map((item) => item.trim()).filter(Boolean);
    }

    if (typeof value !== 'string') {
        return [];
    }

    return [value.trim()].filter(Boolean);
};

const areAnswersEquivalent = (
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

const createDamageRegion = (
    partial: Omit<DamageRegion, 'id'>,
    counter: number,
): DamageRegion => ({
    id: `${partial.kind}-${partial.issueCode}-${counter}`,
    ...partial,
});

export const verifyFormattedTest = (
    rawSource: RawSourceArtifact,
    formattedTest: FormattedTestArtifact,
): VerificationArtifact => {
    const damageRegions: DamageRegion[] = [];
    const verifiedPassages: FormattedPassageBlock[] = [];
    const verifiedQuestions: FormattedQuestionBlock[] = [];
    const rawQuestionByNumber = new Map(
        rawSource.questionBlocks.map((question) => [question.questionNumber, question]),
    );
    const formattedQuestionByNumber = new Map(
        formattedTest.questions.map((question) => [question.questionNumber, question]),
    );
    const rawQuestionNumbers = rawSource.questionBlocks.map((question) => question.questionNumber);
    const formattedQuestionNumbers = formattedTest.questions.map((question) => question.questionNumber);
    const rawPassageIds = rawSource.passageBlocks.map((passage) => passage.rawPassageId);
    const formattedPassageIds = formattedTest.passages.map((passage) => passage.id);
    const usedPassageIds = new Set<string>();
    const matchedFormattedPassages = new Set<FormattedPassageBlock>();
    let damageCounter = 0;

    rawSource.passageBlocks.forEach((rawPassage) => {
        const matchingFormattedPassage = formattedTest.passages.find((passage) =>
            passage.order === rawPassage.order ||
            (
                passage.questionRange?.start === rawPassage.questionRange?.start &&
                passage.questionRange?.end === rawPassage.questionRange?.end
            ),
        );

        if (!matchingFormattedPassage) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'passage',
                severity: 'blocking',
                issueCode: 'missing-passage',
                message: `Formatted output omitted passage ${rawPassage.order}.`,
                rawPassageId: rawPassage.rawPassageId,
                passageOrder: rawPassage.order,
                rawAnchor: rawPassage.bodyAnchor,
                rawSlice: rawPassage.content,
            }, damageCounter));
            return;
        }

        usedPassageIds.add(rawPassage.rawPassageId);
        matchedFormattedPassages.add(matchingFormattedPassage);
        const passageTextCoverage = compareTextCoverage(
            matchingFormattedPassage.content,
            rawPassage.content,
            'passage',
        );
        const titleCoverage = rawPassage.title
            ? compareTextCoverage(matchingFormattedPassage.title, rawPassage.title, 'title')
            : { pass: true, formattedCoverage: 1, rawCoverage: 1 };

        if (!passageTextCoverage.pass) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'passage',
                severity: 'blocking',
                issueCode: 'passage-text-loss',
                message:
                    `Formatted passage ${matchingFormattedPassage.id} does not cover the raw passage text ` +
                    `(formatted=${passageTextCoverage.formattedCoverage.toFixed(2)}, raw=${passageTextCoverage.rawCoverage.toFixed(2)}).`,
                relatedBlockId: matchingFormattedPassage.id,
                rawPassageId: rawPassage.rawPassageId,
                passageOrder: rawPassage.order,
                rawAnchor: rawPassage.bodyAnchor,
                rawSlice: rawPassage.content,
                formattedSlice: matchingFormattedPassage.content,
            }, damageCounter));
            return;
        }

        if (!titleCoverage.pass) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'passage',
                severity: 'blocking',
                issueCode: 'passage-title-loss',
                message: `Formatted passage ${matchingFormattedPassage.id} drifted from the raw title.`,
                relatedBlockId: matchingFormattedPassage.id,
                rawPassageId: rawPassage.rawPassageId,
                passageOrder: rawPassage.order,
                rawAnchor: rawPassage.titleAnchor,
                rawSlice: rawPassage.title,
                formattedSlice: matchingFormattedPassage.title,
            }, damageCounter));
            return;
        }

        verifiedPassages.push(createRepairedPassageFromRaw(rawPassage, matchingFormattedPassage));
    });

    formattedTest.passages.forEach((formattedPassage) => {
        const matchingRawPassage = findMatchingRawPassage(
            formattedPassage,
            rawSource.passageBlocks,
            usedPassageIds,
        );

        if (!matchedFormattedPassages.has(formattedPassage) && !matchingRawPassage) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'passage',
                severity: 'blocking',
                issueCode: 'extra-passage',
                message: `Formatted output introduced an unverified passage (${formattedPassage.id}).`,
                relatedBlockId: formattedPassage.id,
                formattedSlice: formattedPassage.content,
            }, damageCounter));
        }
    });

    rawSource.questionBlocks.forEach((rawQuestion) => {
        const formattedQuestion = formattedQuestionByNumber.get(rawQuestion.questionNumber);

        if (!formattedQuestion) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'question',
                severity: 'blocking',
                issueCode: 'missing-question',
                message: `Formatted output omitted question ${rawQuestion.questionNumber}.`,
                rawQuestionId: rawQuestion.rawQuestionId,
                questionNumber: rawQuestion.questionNumber,
                questionRange: rawQuestion.sectionRange,
                rawAnchor: rawQuestion.blockAnchor,
                rawSlice: rawQuestion.rawText,
            }, damageCounter));
            return;
        }

        const textMode = /table|summary|note|flowchart|diagram/i.test(
            formattedQuestion.suggestedType || '',
        )
            ? 'normalized-question'
            : 'strict-question';
        const questionCoverage = compareTextCoverage(
            formattedQuestion.questionText,
            rawQuestion.questionText || rawQuestion.rawText,
            textMode,
        );

        if (!questionCoverage.pass) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'question',
                severity: 'blocking',
                issueCode: 'question-text-loss',
                message:
                    `Formatted question ${rawQuestion.questionNumber} drifted from the raw source ` +
                    `(formatted=${questionCoverage.formattedCoverage.toFixed(2)}, raw=${questionCoverage.rawCoverage.toFixed(2)}).`,
                relatedBlockId: formattedQuestion.id,
                rawQuestionId: rawQuestion.rawQuestionId,
                questionNumber: rawQuestion.questionNumber,
                questionRange: rawQuestion.sectionRange,
                rawAnchor: rawQuestion.blockAnchor,
                rawSlice: rawQuestion.rawText,
                formattedSlice: formattedQuestion.questionText,
            }, damageCounter));
            return;
        }

        if (rawQuestion.instructionText && !formattedQuestion.instructions?.trim()) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'question',
                severity: 'blocking',
                issueCode: 'instruction-loss',
                message: `Question ${rawQuestion.questionNumber} lost its section instruction.`,
                relatedBlockId: formattedQuestion.id,
                rawQuestionId: rawQuestion.rawQuestionId,
                questionNumber: rawQuestion.questionNumber,
                questionRange: rawQuestion.sectionRange,
                rawAnchor: rawQuestion.instructionAnchor,
                rawSlice: rawQuestion.instructionText,
                formattedSlice: '',
            }, damageCounter));
            return;
        }

        if (rawQuestion.instructionText && formattedQuestion.instructions?.trim()) {
            const instructionCoverage = compareTextCoverage(
                formattedQuestion.instructions,
                rawQuestion.instructionText,
                'instruction',
            );
            if (!instructionCoverage.pass) {
                damageCounter += 1;
                damageRegions.push(createDamageRegion({
                    kind: 'question',
                    severity: 'blocking',
                    issueCode: 'instruction-loss',
                    message: `Question ${rawQuestion.questionNumber} instruction drifted from source.`,
                    relatedBlockId: formattedQuestion.id,
                    rawQuestionId: rawQuestion.rawQuestionId,
                    questionNumber: rawQuestion.questionNumber,
                    questionRange: rawQuestion.sectionRange,
                    rawAnchor: rawQuestion.instructionAnchor,
                    rawSlice: rawQuestion.instructionText,
                    formattedSlice: formattedQuestion.instructions,
                }, damageCounter));
                return;
            }
        }

        const rawOptions = rawQuestion.options.length > 0 ? rawQuestion.options : rawQuestion.sharedOptions;
        const formattedOptions = getFormattedQuestionOptions(formattedQuestion);

        if (rawOptions.length > 0 && formattedOptions.length === 0) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'question',
                severity: 'blocking',
                issueCode: 'option-loss',
                message: `Question ${rawQuestion.questionNumber} lost its option list.`,
                relatedBlockId: formattedQuestion.id,
                rawQuestionId: rawQuestion.rawQuestionId,
                questionNumber: rawQuestion.questionNumber,
                questionRange: rawQuestion.sectionRange,
                rawAnchor: rawQuestion.optionAnchors[0],
                rawSlice: rawOptions.join('\n'),
                formattedSlice: '',
            }, damageCounter));
            return;
        }

        if (rawOptions.length > 0 && formattedOptions.length > 0) {
            if (rawOptions.length !== formattedOptions.length) {
                damageCounter += 1;
                damageRegions.push(createDamageRegion({
                    kind: 'question',
                    severity: 'blocking',
                    issueCode: 'option-loss',
                    message:
                        `Question ${rawQuestion.questionNumber} changed option count ` +
                        `(${formattedOptions.length} vs ${rawOptions.length}).`,
                    relatedBlockId: formattedQuestion.id,
                    rawQuestionId: rawQuestion.rawQuestionId,
                    questionNumber: rawQuestion.questionNumber,
                    questionRange: rawQuestion.sectionRange,
                    rawAnchor: rawQuestion.optionAnchors[0],
                    rawSlice: rawOptions.join('\n'),
                    formattedSlice: formattedOptions.join('\n'),
                }, damageCounter));
                return;
            }

            const optionCoveragePass = formattedOptions.every((option, optionIndex) =>
                compareTextCoverage(option, rawOptions[optionIndex] || '', 'normalized-question').pass,
            );

            if (!optionCoveragePass) {
                damageCounter += 1;
                damageRegions.push(createDamageRegion({
                    kind: 'question',
                    severity: 'blocking',
                    issueCode: 'option-loss',
                    message: `Question ${rawQuestion.questionNumber} option text drifted from source.`,
                    relatedBlockId: formattedQuestion.id,
                    rawQuestionId: rawQuestion.rawQuestionId,
                    questionNumber: rawQuestion.questionNumber,
                    questionRange: rawQuestion.sectionRange,
                    rawAnchor: rawQuestion.optionAnchors[0],
                    rawSlice: rawOptions.join('\n'),
                    formattedSlice: formattedOptions.join('\n'),
                }, damageCounter));
                return;
            }
        }

        verifiedQuestions.push(createRepairedQuestionFromRaw(rawSource, rawQuestion, formattedQuestion));
    });

    formattedTest.questions.forEach((formattedQuestion) => {
        if (!rawQuestionByNumber.has(formattedQuestion.questionNumber)) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'question',
                severity: 'blocking',
                issueCode: 'extra-question',
                message: `Formatted output introduced question ${formattedQuestion.questionNumber} with no raw-source backing.`,
                relatedBlockId: formattedQuestion.id,
                questionNumber: formattedQuestion.questionNumber,
                formattedSlice: formattedQuestion.questionText,
            }, damageCounter));
        }
    });

    const questionNumbersOutOfSync = rawQuestionNumbers.length !== formattedQuestionNumbers.length ||
        rawQuestionNumbers.some((questionNumber, index) => questionNumber !== formattedQuestionNumbers[index]);

    if (questionNumbersOutOfSync) {
        damageCounter += 1;
        damageRegions.push(createDamageRegion({
            kind: 'global',
            severity: 'blocking',
            issueCode: 'question-numbering-drift',
            message:
                `Formatted question numbering drifted from raw source. Raw=[${rawQuestionNumbers.join(', ')}] ` +
                `Formatted=[${formattedQuestionNumbers.join(', ')}].`,
            formattedSlice: formattedQuestionNumbers.join(', '),
            rawSlice: rawQuestionNumbers.join(', '),
        }, damageCounter));
    }

    let verifiedAnswerKey: Record<number, string | string[]> = {};
    const rawAnswerKey = rawSource.answerKeyBlock?.answers || {};
    const formattedAnswerKey = formattedTest.answerKey?.answers || {};

    if (rawSource.answerKeyBlock) {
        const rawAnswerEntries = Object.entries(rawAnswerKey);
        const missingAnswers = rawAnswerEntries.filter(([questionNumber, answer]) => {
            const formattedAnswer = formattedAnswerKey[Number.parseInt(questionNumber, 10)];
            return !areAnswersEquivalent(formattedAnswer, answer);
        });

        if (missingAnswers.length > 0) {
            damageCounter += 1;
            damageRegions.push(createDamageRegion({
                kind: 'answer-key',
                severity: 'blocking',
                issueCode: 'answer-key-loss',
                message: `Formatted answer key drifted from the raw answer key.`,
                relatedBlockId: formattedTest.answerKey?.id,
                rawAnchor: rawSource.answerKeyBlock.anchor,
                rawSlice: rawSource.answerKeyBlock.anchor.excerpt.trim(),
                formattedSlice: JSON.stringify(formattedAnswerKey),
            }, damageCounter));
        } else {
            verifiedAnswerKey = rawAnswerKey;
        }
    } else if (Object.keys(formattedAnswerKey).length > 0) {
        damageCounter += 1;
        damageRegions.push(createDamageRegion({
            kind: 'answer-key',
            severity: 'warning',
            issueCode: 'unverified-answer-key-discarded',
            message: 'AI answer key could not be verified against the raw source and was discarded.',
            relatedBlockId: formattedTest.answerKey?.id,
            formattedSlice: JSON.stringify(formattedAnswerKey),
        }, damageCounter));
    }

    const hasBlockingDamage = damageRegions.some((damage) => damage.severity === 'blocking');

    return {
        sourceFidelityPass: !hasBlockingDamage,
        hasBlockingDamage,
        rawQuestionNumbers,
        formattedQuestionNumbers,
        rawPassageIds,
        formattedPassageIds,
        verifiedTest: {
            passages: verifiedPassages.sort((left, right) => left.order - right.order),
            questions: verifiedQuestions.sort(
                (left, right) => left.questionNumber - right.questionNumber,
            ),
            answerKey: verifiedAnswerKey,
        },
        damageRegions,
    };
};

const findParagraphIndexByAnchor = (
    paragraphs: SourceParagraph[],
    anchor: SourceAnchor | undefined,
): { startIndex: number; endIndex: number } => {
    if (!anchor) {
        return { startIndex: -1, endIndex: -1 };
    }

    const overlappingIndices = paragraphs
        .map((paragraph, index) => ({ paragraph, index }))
        .filter(({ paragraph }) =>
            paragraph.endOffset >= anchor.startOffset &&
            paragraph.startOffset <= anchor.endOffset,
        )
        .map(({ index }) => index);

    if (overlappingIndices.length === 0) {
        return { startIndex: -1, endIndex: -1 };
    }

    return {
        startIndex: overlappingIndices[0] || 0,
        endIndex: overlappingIndices[overlappingIndices.length - 1] || 0,
    };
};

export const createBlastRadiusRepairRequest = (
    rawSource: RawSourceArtifact,
    formattedTest: FormattedTestArtifact,
    verification: VerificationArtifact,
): BlastRadiusRepairRequest => {
    const regions: RepairRegion[] = [];
    const groupedDamage = verification.damageRegions
        .filter((damage) => damage.severity === 'blocking' || damage.issueCode === 'unverified-answer-key-discarded');
    const answerKeyDamage = groupedDamage.filter((damage) => damage.kind === 'answer-key');
    const nonAnswerKeyDamage = groupedDamage.filter((damage) => damage.kind !== 'answer-key');

    nonAnswerKeyDamage.forEach((damage) => {
        if (damage.kind === 'passage' && damage.rawPassageId) {
            const rawPassage = rawSource.passageBlocks.find((passage) => passage.rawPassageId === damage.rawPassageId);
            const formattedPassage = formattedTest.passages.find((passage) => passage.id === damage.relatedBlockId);
            const paragraphSpan = findParagraphIndexByAnchor(rawSource.paragraphs, rawPassage?.bodyAnchor);
            const before =
                paragraphSpan.startIndex > 0
                    ? rawSource.paragraphs[paragraphSpan.startIndex - 1]?.text
                    : undefined;
            const after =
                paragraphSpan.endIndex >= 0 &&
                paragraphSpan.endIndex < rawSource.paragraphs.length - 1
                    ? rawSource.paragraphs[paragraphSpan.endIndex + 1]?.text
                    : undefined;

            regions.push({
                id: damage.id,
                kind: damage.kind,
                rawSlice: rawPassage?.content || damage.rawSlice || '',
                previousFormattedSlice:
                    formattedPassage
                        ? `${formattedPassage.title}\n\n${formattedPassage.content}`
                        : damage.formattedSlice || '',
                findings: [damage.message],
                stableBoundaries: {
                    before,
                    after,
                },
                linkedMetadata: {
                    rawPassageId: damage.rawPassageId,
                    questionRange: rawPassage?.questionRange,
                    passageOrder: rawPassage?.order || damage.passageOrder,
                },
            });
            return;
        }

        if (damage.kind === 'question' && damage.questionNumber !== undefined) {
            const rawQuestion = rawSource.questionBlocks.find(
                (question) => question.questionNumber === damage.questionNumber,
            );
            const formattedQuestion = formattedTest.questions.find(
                (question) => question.questionNumber === damage.questionNumber,
            );
            const rawQuestionIndex = rawSource.questionBlocks.findIndex(
                (question) => question.questionNumber === damage.questionNumber,
            );
            const before =
                rawQuestionIndex > 0
                    ? rawSource.questionBlocks[rawQuestionIndex - 1]?.rawText
                    : undefined;
            const after =
                rawQuestionIndex >= 0 && rawQuestionIndex < rawSource.questionBlocks.length - 1
                    ? rawSource.questionBlocks[rawQuestionIndex + 1]?.rawText
                    : undefined;

            regions.push({
                id: damage.id,
                kind: damage.kind,
                rawSlice: rawQuestion?.rawText || damage.rawSlice || '',
                previousFormattedSlice: formattedQuestion
                    ? [
                        formattedQuestion.instructions || '',
                        formattedQuestion.questionText,
                        ...getFormattedQuestionOptions(formattedQuestion),
                    ].filter(Boolean).join('\n')
                    : damage.formattedSlice || '',
                findings: [damage.message],
                stableBoundaries: {
                    before,
                    after,
                },
                linkedMetadata: {
                    rawQuestionId: rawQuestion?.rawQuestionId || damage.rawQuestionId,
                    questionNumber: damage.questionNumber,
                    questionRange: rawQuestion?.sectionRange || damage.questionRange,
                },
            });
            return;
        }

        regions.push({
            id: damage.id,
            kind: damage.kind,
            rawSlice: damage.rawSlice || '',
            previousFormattedSlice: damage.formattedSlice || '',
            findings: [damage.message],
            stableBoundaries: {},
            linkedMetadata: {
                questionNumber: damage.questionNumber,
                questionRange: damage.questionRange,
                passageOrder: damage.passageOrder,
            },
        });
    });

    if (answerKeyDamage.length > 0) {
        regions.push({
            id: 'answer-key-blast-radius',
            kind: 'answer-key',
            rawSlice: rawSource.answerKeyBlock?.anchor.excerpt.trim() || '',
            previousFormattedSlice: JSON.stringify(formattedTest.answerKey?.answers || {}),
            findings: answerKeyDamage.map((damage) => damage.message),
            stableBoundaries: {},
            linkedMetadata: {},
        });
    }

    return { regions };
};

export const repairFormattedTest = (
    rawSource: RawSourceArtifact,
    formattedTest: FormattedTestArtifact,
    verification: VerificationArtifact,
): RepairArtifact => {
    const request = createBlastRadiusRepairRequest(rawSource, formattedTest, verification);
    const repairedPassages = [...formattedTest.passages];
    const repairedQuestions = [...formattedTest.questions];
    const rawQuestionNumbers = new Set(rawSource.questionBlocks.map((question) => question.questionNumber));

    verification.damageRegions.forEach((damage) => {
        if (damage.kind === 'passage' && damage.rawPassageId) {
            const rawPassage = rawSource.passageBlocks.find((passage) => passage.rawPassageId === damage.rawPassageId);
            if (!rawPassage) {
                return;
            }

            const existingIndex = repairedPassages.findIndex((passage) =>
                passage.id === damage.relatedBlockId || passage.order === rawPassage.order,
            );
            const repairedPassage = createRepairedPassageFromRaw(
                rawPassage,
                existingIndex >= 0 ? repairedPassages[existingIndex] : undefined,
            );

            if (existingIndex >= 0) {
                repairedPassages.splice(existingIndex, 1, repairedPassage);
            } else {
                repairedPassages.push(repairedPassage);
            }
        }

        if (damage.kind === 'question' && damage.questionNumber !== undefined) {
            const rawQuestion = rawSource.questionBlocks.find(
                (question) => question.questionNumber === damage.questionNumber,
            );
            if (!rawQuestion) {
                return;
            }

            const existingIndex = repairedQuestions.findIndex(
                (question) => question.questionNumber === damage.questionNumber,
            );
            const repairedQuestion = createRepairedQuestionFromRaw(
                rawSource,
                rawQuestion,
                existingIndex >= 0 ? repairedQuestions[existingIndex] : undefined,
            );

            if (existingIndex >= 0) {
                repairedQuestions.splice(existingIndex, 1, repairedQuestion);
            } else {
                repairedQuestions.push(repairedQuestion);
            }
        }
    });

    const cleanedQuestions = repairedQuestions.filter((question) =>
        rawQuestionNumbers.has(question.questionNumber),
    );
    const cleanedPassages = repairedPassages
        .filter((passage) =>
            rawSource.passageBlocks.some((rawPassage) => rawPassage.order === passage.order),
        )
        .sort((left, right) => left.order - right.order);

    const repairedFormattedTest: FormattedTestArtifact = {
        passages: cleanedPassages,
        questions: cleanedQuestions.sort(
            (left, right) => left.questionNumber - right.questionNumber,
        ),
        answerKey: rawSource.answerKeyBlock
            ? {
                id: formattedTest.answerKey?.id || 'answer-key',
                answers: rawSource.answerKeyBlock.answers,
                sourceAnchors: [rawSource.answerKeyBlock.anchor],
            }
            : null,
        metadata: {
            ...formattedTest.metadata,
            repaired: true,
        },
    };

    return {
        attempted: true,
        request,
        repairedFormattedTest,
        verification: verifyFormattedTest(rawSource, repairedFormattedTest),
    };
};

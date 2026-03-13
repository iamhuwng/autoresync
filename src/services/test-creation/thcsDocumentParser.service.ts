/**
 * THCS Document Parser Service
 *
 * Parallel Pipeline Architecture (PRD-0031):
 *   External AI (Step 0) → Gate Check → Pre-Clean
 *   → Parallel: [AI Pass 1 (Janitor)] + [Code Validator]
 *   → Decision Tree → (Crossfix?) → Compromise → Regex Engine (Grunt)
 */

import type { THCSQuestionType } from '../../types/thcs-test.types';
import { classifyQuestionTypes, reclassifyByContent } from './thcs-type-classifier';
import type { ReclassificationEvent } from './thcs-type-classifier';
export { convertParsedToThcsDraft } from './thcs-draft-converter';

// -- Pipeline Module Imports --
import { executePass1 } from './thcs-pass1-restructure';
import { validateRestructuredText, validateOriginalText, detectSectionBoundaries } from './thcs-text-validator';
import type { ValidationReport } from './thcs-text-validator';
import { executeCrossfixLoop } from './thcs-pass2-repair';
import type { AICallFn } from './thcs-pass2-repair';
import { executeCompromiseStep } from './thcs-compromise-step';
import type { CompromiseResult } from './thcs-compromise-step';
import { executeAnswerInference } from './thcs-answer-inference';
import { createRetrySession } from './thcs-retry-manager';
import type { RetryStep } from './thcs-retry-manager';
import type { RepairAuditEntry } from './thcs-prompt-builder';


// -- Types --

export interface ParseProgress {
    stage: 'extracting' | 'parsing' | 'classifying' | 'ai-polish' | 'done';
    percent: number;
    message: string;
}

export interface ParseWarning {
    type: 'missing-answer' | 'skipped-content' | 'ambiguous-type' | 'no-sections' | 'images-detected' | 'multi-variant'
    | 'confidence-mismatch' | 'skipped-section' | 'compromised-section';
    message: string;
    line?: number;
}

export interface AmbiguousItem {
    id: string;
    sectionIndex: number;
    instructionText: string;
    currentType: THCSQuestionType;
    confidence: number;
}

export interface ParsedSection {
    name: string;
    instructionText: string;
    startLine: number;
    endLine: number;
    questions: ParsedQuestion[];
    detectedType: THCSQuestionType;
    typeConfidence: number;
    passageText?: string;
}

export interface ParsedQuestion {
    questionNumber: number;
    text: string;
    type: THCSQuestionType;
    options?: string[];
    correctAnswer?: string;
    blankCount?: number;
}

export interface ParsedMetadata {
    title?: string;
    gradeLevel?: number;
    duration?: number;
    examType?: string;
}

export interface PipelineDebug {
    pass1Confidence: number;
    codeConfidence: number;
    issuesFound: string[];
    auditLog: RepairAuditEntry[];
    compromisedSections: CompromiseResult['compromisedSections'];
    skippedSections: CompromiseResult['skippedSections'];
    hasInferredAnswers: boolean;
    inferredAnswerCount: number;
    pipeline: string;
    provider: string;
    parseDurationMs: number;
}

export interface ParsedTest {
    metadata: ParsedMetadata;
    sections: ParsedSection[];
    answerKey: Record<number, string>;
    warnings: ParseWarning[];
    overallConfidence: number;
    _pipelineDebug?: PipelineDebug;
}

export type Result<T> = { success: true; data: T } | { success: false; error: string };

// -- Regex Patterns (PRD §4.12.3) --

const PATTERNS = {
    // Section: "I. MULTIPLE CHOICE", "Part A:", "SECTION II.", "Phần 3."
    // Must have a recognized prefix OR a Roman numeral followed by substantial text (>3 chars, not just a single letter)
    // BUG FIX: Single-letter C, D, L, M were over-matching option lines (e.g. "C. economically").
    // Now only I, V, X are valid single-letter Roman numerals; C/D/L/M require 2+ chars.
    sectionHeader: /^(?:(?:SECTION|Part|Phần|Ph[aầ]n)\s*(?:[IVXLCDM]+|\d+)[.:\s]*(.+)|(?:[IVXLCDM]{2,}|[IVX])[.:\s]+(.{4,}))/im,
    // Standalone [TYPE: xxx] line from AI restructured output (acts as section boundary)
    typeTagLine: /^\[TYPE:\s*([a-z][a-z0-9-]*)\s*\]$/i,
    // [TYPE: xxx] at end of an instruction line, e.g. "Choose the best option... [TYPE: mcq-grammar]"
    typeTagInline: /\[TYPE:\s*([a-z][a-z0-9-]*)\s*\]\s*$/i,
    // AI format marker: "=== 2. SECTION HEADERS ===", "=== 5. QUESTIONS FORMAT ===", "=== 7. ANSWER KEY ==="
    aiSectionMarker: /^===\s*\d+\.\s*SECTION\s*HEADERS?\s*===$/i,
    aiAnswerKeyMarker: /^===\s*\d+\.\s*ANSWER\s*KEY\s*===$/i,
    aiQuestionsMarker: /^===\s*\d+\.\s*QUESTIONS\s*FORMAT\s*===$/i,
    aiMetadataMarker: /^===\s*\d+\.\s*METADATA\s*===$/i,
    // Passage delimiter: "PASSAGE:" on its own line or "PASSAGE: Some text here"
    passageMarker: /^PASSAGE:\s*(.*)$/i,
    // Question: "Question 1.", "Câu 1.", "Câu1:", with REQUIRED prefix OR bare number with substantial text
    // Bare "1. B" will NOT match — must have "Question" prefix OR text length >= 3 after number
    // BUG FIX: Changed (.+) to (.*) so "Question 1." with no trailing text (cloze questions) still matches.
    question: /^(?:(?:C[aâ]u\s*|Question\s*|Q\.?\s*)(?:s?\s*)?(\d+)[.):\s]*(.*)|([0-9]+)[.):\s]+(.{3,}))/i,
    // Option: "A. text", "A) text", "A: text"
    // CASE-SENSITIVE — lowercase a.-e. are sub-items in sentence-arrangement, NOT options
    optionLine: /^([A-H])[.):\s]+(.+)/,
    // Answer key header: many Vietnamese variants
    // Allow optional leading decorators: "=== 4. ", "V. ", "VI.", Roman numerals, etc.
    answerKeyHeader: /^(?:[=\-*#\s]*(?:[IVXLCDM]+\.?\s*|\d+\.?\s*)?)?(?:ANSWER\s*KEY|ĐÁP\s*ÁN|KEY|KEYS|BẢNG\s*ĐÁP\s*ÁN|MÃ\s*Đ[ÊỀ].*ĐÁP\s*ÁN)[:\s=\-*]*/i,
    // Answer entries: "1:B", "1.B", "1-B", "Câu 1: Đáp án: A"
    answerKeyLine: /(?:C[aâ]u\s*)?(\d+)[:.)\-\s]+(?:Đ[áa]p\s*[áa]n[:\s]*)?([A-H])/gi,
    // Space-separated answer: "1. B" (number + dot/colon + space + single letter)
    answerKeySpaced: /^\s*(\d+)[.):\s]+([A-H])\s*$/i,
    fillBlank: /_{2,}|\.{3,}/g,
    pointAllocation: /\((\d+(?:\.\d+)?)\s*(?:point|đi[eể]m|di[eể]m|pts?|marks?)\)/i,
    // Duration: "60 minutes", "60 MINUTES", "45 phút"
    duration: /(\d+)\s*(?:minutes?|phút|mins?)/i,
    // Grade: "Grade 9", "Lớp 10", "Khối 9", "10TH GRADE", "LỚP 9"
    gradeLevel: /(?:(?:Grade|L[oớ]p|Kh[oố]i)\s*(\d{1,2})|(\d{1,2})(?:TH|ST|ND|RD)?\s*GRADE)/i,
};

// -- Layer 1: Regex Structural Parser --
// (used by parseThcsTextRegex fallback — kept after upload pipeline removal)

function inferSectionTypeFromHeader(headerText: string): THCSQuestionType | null {
    const normalized = headerText.trim().toLowerCase();

    if (!normalized) return null;
    if (/underlined\s+part.*needs\s+correcting|needs\s+correcting|error.*identification|tìm.*lỗi|sửa.*lỗi/i.test(normalized)) {
        return 'error-identification';
    }
    if (/best\s+rewrites?\s+the\s+sentence\s+given|closest\s+meaning|gần.*nghĩa/i.test(normalized)) {
        return 'closest-meaning';
    }
    if (/change\s+adjective\s+clauses?\s+to\s+phrases?|join\s+these\s+pairs\s+of\s+sentences|relative\s+pronouns?\s+or\s+adverbs?|rewrite|viết.*lại/i.test(normalized)) {
        return 'sentence-rewrite';
    }
    if (/choose\s+the\s+best\s+answer|grammar|ngữ\s+pháp/i.test(normalized)) {
        return 'mcq-grammar';
    }

    return null;
}

function shouldAcceptBareQuestionNumber(section: ParsedSection, text: string): boolean {
    const normalized = text.trim();

    if (!normalized || normalized.length < 3) return false;
    if (/^[A-H]$/i.test(normalized)) return false;
    if (/^\d{4}\b/.test(normalized)) return false;
    if (section.detectedType === 'sentence-rewrite' || section.detectedType === 'sentence-rewrite-keyword') {
        return false;
    }

    return true;
}

function detectSections(lines: string[]): ParsedSection[] {
    const sections: ParsedSection[] = [];
    let currentSection: Partial<ParsedSection> | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();

        // Skip empty lines
        if (!line) continue;

        // Skip AI metadata markers (=== 1. METADATA ===) and questions format markers
        if (PATTERNS.aiMetadataMarker.test(line) || PATTERNS.aiQuestionsMarker.test(line)) continue;

        // ── Answer key boundary detection ──
        // Recognize traditional headers, [TYPE: answer-key], AND === N. ANSWER KEY === markers
        const isAnswerKeyBoundary = PATTERNS.answerKeyHeader.test(line) ||
            /^(?:VI\.|V\.|IV\.)?\s*(?:ANSWER\s*KEY|ĐÁP\s*ÁN)/i.test(line) ||
            /\[TYPE:\s*answer-?key\s*\]/i.test(line) ||
            PATTERNS.aiAnswerKeyMarker.test(line);
        if (isAnswerKeyBoundary) {
            // Close current section before answer key starts
            if (currentSection && currentSection.startLine !== undefined) {
                currentSection.endLine = i - 1;
                sections.push(currentSection as ParsedSection);
                currentSection = null;
            }
            break; // Stop section detection — everything after this is answer key
        }

        // ── Section boundary detection (3 strategies) ──
        // Strategy 1: Traditional section header ("I. MULTIPLE CHOICE", "Part A:", etc.)
        const sectionMatch = line.match(PATTERNS.sectionHeader);

        // Strategy 2: Standalone [TYPE: xxx] on its own line
        const typeTagMatch = !sectionMatch ? line.match(PATTERNS.typeTagLine) : null;
        const isMetadataTag = typeTagMatch && typeTagMatch[1]!.toLowerCase() === 'metadata';

        // Strategy 3: AI format marker "=== 2. SECTION HEADERS ==="
        // When found, look ahead for the next non-empty line which is the instruction + [TYPE: xxx]
        let aiMarkerMatch = false;
        let aiLookaheadLine: string | null = null;
        let aiLookaheadIdx = -1;
        if (PATTERNS.aiSectionMarker.test(line)) {
            // Find next non-empty, non-marker line
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j]?.trim() || '';
                if (!nextLine) continue;
                // Skip if it's another marker line
                if (/^===/.test(nextLine)) break;
                aiLookaheadLine = nextLine;
                aiLookaheadIdx = j;
                break;
            }
            if (aiLookaheadLine) {
                aiMarkerMatch = true;
            }
        }

        // Strategy 4: Inline [TYPE: xxx] at end of an instruction line (no other match)
        const inlineTypeMatch = (!sectionMatch && !typeTagMatch && !aiMarkerMatch)
            ? line.match(PATTERNS.typeTagInline)
            : null;

        // ── Sub-part merge check for inline [TYPE: xxx] ──
        // If an inline type tag's instruction text is essentially the same as the
        // current section's (differing only by a sub-part label like "(b)", "(c)", "(d)"),
        // extend the current section instead of creating a new one.
        // This prevents "Choose the best option... (b) [TYPE: mcq-grammar]" from
        // fragmenting into separate 1-question sections.
        if (inlineTypeMatch && currentSection && currentSection.startLine !== undefined) {
            const newInstruction = line.replace(PATTERNS.typeTagInline, '').trim();
            // Strip sub-part labels: "(a)", "(b)", "(c)" etc. at the end, and normalize
            const stripSubPart = (s: string) => s.replace(/\s*\([a-z]\)\s*$/i, '').trim().toLowerCase();
            const currentBase = stripSubPart(currentSection.instructionText || '');
            const newBase = stripSubPart(newInstruction);
            if (currentBase && newBase && currentBase === newBase) {
                // Same instruction, different sub-part — extend current section, don't split
                currentSection.endLine = lines.length - 1;
                continue;
            }
        }

        if (sectionMatch || (typeTagMatch && !isMetadataTag) || aiMarkerMatch || inlineTypeMatch) {
            if (currentSection && currentSection.startLine !== undefined) {
                currentSection.endLine = i - 1;
                sections.push(currentSection as ParsedSection);
            }

            let sectionName: string;
            let detectedType: string = 'mcq-grammar';
            let typeConfidence = 60;
            let effectiveStartLine = i;
            let instructionText = '';

            if (aiMarkerMatch && aiLookaheadLine) {
                // AI marker: extract type from the look-ahead instruction line
                const inlineTag = aiLookaheadLine.match(PATTERNS.typeTagInline);
                if (inlineTag) {
                    const typeName = inlineTag[1]!;
                    sectionName = typeName;
                    detectedType = typeName;
                    typeConfidence = 99;
                    // Strip the [TYPE: xxx] from the instruction text
                    instructionText = aiLookaheadLine.replace(PATTERNS.typeTagInline, '').trim();
                } else {
                    sectionName = aiLookaheadLine.slice(0, 40);
                    instructionText = aiLookaheadLine;
                }
                // Skip ahead past the look-ahead line
                effectiveStartLine = aiLookaheadIdx;
                i = aiLookaheadIdx; // Loop will increment to next line
            } else if (inlineTypeMatch) {
                // Inline [TYPE: xxx] at end of line
                const typeName = inlineTypeMatch[1]!;
                sectionName = typeName;
                detectedType = typeName;
                typeConfidence = 99;
                instructionText = line.replace(PATTERNS.typeTagInline, '').trim();
            } else if (typeTagMatch) {
                // Standalone [TYPE: xxx] — use the type name as both section name and detected type
                const typeName = typeTagMatch[1]!;
                sectionName = typeName;
                detectedType = typeName;
                typeConfidence = 99; // High confidence from explicit tag
            } else {
                sectionName = (sectionMatch![1] || sectionMatch![2] || '').trim() || `Section ${sections.length + 1}`;
                const inferredType = inferSectionTypeFromHeader(sectionName);
                if (inferredType) {
                    detectedType = inferredType;
                    typeConfidence = 86;
                    instructionText = sectionName;
                }
            }

            currentSection = {
                name: sectionName,
                instructionText,
                startLine: effectiveStartLine,
                endLine: lines.length - 1,
                questions: [],
                detectedType: detectedType as any,
                typeConfidence,
            };
        }
    }

    // Close last section
    if (currentSection && currentSection.startLine !== undefined) {
        currentSection.endLine = lines.length - 1;
        sections.push(currentSection as ParsedSection);
    }

    // Edge case EC13: No sections found → create "General"
    if (sections.length === 0) {
        sections.push({
            name: 'General',
            instructionText: '',
            startLine: 0,
            endLine: lines.length - 1,
            questions: [],
            detectedType: 'mcq-grammar',
            typeConfidence: 50,
        });
    }

    return sections;
}

function parseQuestions(lines: string[], sections: ParsedSection[]): void {
    for (const section of sections) {
        let currentQ: Partial<ParsedQuestion> | null = null;
        let instructionLines: string[] = [];
        let foundFirstQuestion = false;
        // ── Passage extraction (PRD-0032 §FR1) ──
        let passageLines: string[] = [];
        let inPassage = false;
        let passageStarted = false;

        for (let i = section.startLine + 1; i <= section.endLine; i++) {
            const rawLine = lines[i] || '';
            const line = rawLine.trim();

            // ── Blank line handling ──
            // Inside a passage, blank lines create paragraph breaks — preserve them
            if (!line) {
                if (inPassage) { passageLines.push(''); }
                continue;
            }

            if (PATTERNS.answerKeyHeader.test(line) ||
                /^(?:VI\.|V\.|IV\.)?\s*(?:ANSWER\s*KEY|ĐÁP\s*ÁN)/i.test(line) ||
                /\[TYPE:\s*answer-?key\s*\]/i.test(line) ||
                PATTERNS.aiAnswerKeyMarker.test(line)) break;

            // Skip AI format markers — they're structural, not content
            if (PATTERNS.aiSectionMarker.test(line) || PATTERNS.aiQuestionsMarker.test(line) || PATTERNS.aiMetadataMarker.test(line)) continue;

            // ── PASSAGE: detection (before first question) ──
            if (!foundFirstQuestion) {
                const passageMatch = line.match(PATTERNS.passageMarker);
                if (passageMatch) {
                    inPassage = true;
                    passageStarted = true;
                    // If there's inline text after "PASSAGE:", include it
                    const inlineText = (passageMatch[1] || '').trim();
                    if (inlineText) passageLines.push(inlineText);
                    continue;
                }
            }

            // ── Collecting passage lines ──
            if (inPassage) {
                const questionMatch = line.match(PATTERNS.question);
                const optionMatch = line.match(PATTERNS.optionLine);

                // False-positive filter: inside a passage, reject matches that are
                // actually time/numeric patterns (e.g. "9:00 a.m.", "5:30 p.m.")
                // not real questions. A bare-number match where the "text" starts
                // with digits (like "00 a.m.") is a time, not a question.
                let isRealQuestion = false;
                if (questionMatch) {
                    const hasPrefix = !!questionMatch[1]; // "Question N" / "Câu N" form
                    const bareText = (questionMatch[2] || questionMatch[4] || '').trim();
                    if (hasPrefix) {
                        // Prefixed questions (Question 1, Câu 1) are always real
                        isRealQuestion = true;
                    } else {
                        // Bare number match (e.g. "9:00") — reject if text starts with
                        // digits (time pattern) or is a time-like format
                        isRealQuestion = !/^\d/.test(bareText);
                    }
                }
                const isRealOption = optionMatch && /^[A-H][.):\s]/.test(line);

                if (isRealQuestion || isRealOption) {
                    // End of passage — fall through to question processing
                    inPassage = false;
                } else {
                    passageLines.push(line);
                    continue;
                }
            }

            const questionMatch = line.match(PATTERNS.question);
            const optionMatch = line.match(PATTERNS.optionLine);

            if (questionMatch && !foundFirstQuestion) {
                foundFirstQuestion = true;
                section.instructionText = instructionLines.join(' ').trim();
            }

            if (!foundFirstQuestion) { instructionLines.push(line); continue; }

            if (questionMatch) {
                const qNum = questionMatch[1] || questionMatch[3];
                const qText = questionMatch[2] || questionMatch[4] || '';
                if (qNum) {
                    const isBareNumberQuestion = !questionMatch[1] && !!questionMatch[3];
                    const cleanText = qText.trim();
                    // Skip false positive: bare "1. B" where B is an option letter not question text
                    if (cleanText.length <= 2 && /^[A-H]$/i.test(cleanText)) continue;
                    if (isBareNumberQuestion && !shouldAcceptBareQuestionNumber(section, cleanText)) continue;
                    if (currentQ && (currentQ.text || (currentQ.options && currentQ.options.length > 0))) {
                        section.questions.push(currentQ as ParsedQuestion);
                    }
                    currentQ = {
                        questionNumber: parseInt(qNum, 10),
                        text: cleanText,
                        type: 'mcq-grammar',
                        options: [],
                    };
                }
            } else if (optionMatch && currentQ) {
                if (!currentQ.options) currentQ.options = [];
                currentQ.options.push(optionMatch[2]!.trim());
            } else if (currentQ && (!currentQ.options || currentQ.options.length === 0)) {
                if (line.length > 2 && !/^[-=_~*]{3,}$/.test(line)) currentQ.text += ' ' + line;
            }
        }

        // Push last question — accept questions with options even if text is empty (cloze format)
        if (currentQ && (currentQ.text || (currentQ.options && currentQ.options.length > 0))) {
            section.questions.push(currentQ as ParsedQuestion);
        }
        if (!section.instructionText && instructionLines.length > 0)
            section.instructionText = instructionLines.join(' ').trim();

        // ── Assign extracted passage text ──
        if (passageStarted && passageLines.length > 0) {
            // Trim leading/trailing blank lines but preserve internal paragraph breaks
            while (passageLines.length > 0 && passageLines[0] === '') passageLines.shift();
            while (passageLines.length > 0 && passageLines[passageLines.length - 1] === '') passageLines.pop();
            section.passageText = passageLines.join('\n');
        }
    }
}

function extractMetadata(lines: string[]): ParsedMetadata {
    const metadata: ParsedMetadata = {};
    const headerLines = lines.slice(0, 30).join('\n');

    const gradeMatch = headerLines.match(PATTERNS.gradeLevel);
    if (gradeMatch) {
        const gradeNum = gradeMatch[1] || gradeMatch[2];
        if (gradeNum) metadata.gradeLevel = parseInt(gradeNum, 10);
    }

    const durationMatch = headerLines.match(PATTERNS.duration);
    if (durationMatch) metadata.duration = parseInt(durationMatch[1]!, 10);

    const titlePrefixMatch = headerLines.match(/^TITLE:\s*(.+)/im);
    if (titlePrefixMatch) {
        metadata.title = titlePrefixMatch[1]!.trim();
    } else {
        for (const line of lines.slice(0, 10)) {
            const trimmed = line?.trim();
            if (!trimmed || trimmed.length <= 5) continue;
            if (/^(?:TITLE|GRADE|DURATION|EXAM|TIME|SCHOOL|SUBJECT|TEST\s*CODE):/i.test(trimmed)) continue;
            if (PATTERNS.gradeLevel.test(trimmed) && trimmed.length < 20) continue;
            if (PATTERNS.duration.test(trimmed) && trimmed.length < 25) continue;
            if (PATTERNS.sectionHeader.test(trimmed)) continue;
            metadata.title = trimmed;
            break;
        }
    }

    if (/giữa\s*kì|mid[- ]?term|giữa.*học.*kì/i.test(headerLines)) metadata.examType = 'giữa kì';
    else if (/cuối\s*kì|final|end[- ]?of|cuối.*học.*kì/i.test(headerLines)) metadata.examType = 'cuối kì';
    else if (/thi\s*vào\s*10|entrance|tuyển\s*sinh/i.test(headerLines)) metadata.examType = 'thi vào 10';
    else if (/ôn\s*tập|review|practice/i.test(headerLines)) metadata.examType = 'ôn tập';
    else if (/kiểm tra|test|quiz|exam/i.test(headerLines)) metadata.examType = 'giữa kì';

    const examTypePrefixMatch = headerLines.match(/^EXAM\s*TYPE:\s*(.+)/im);
    if (examTypePrefixMatch) metadata.examType = examTypePrefixMatch[1]!.trim();

    return metadata;
}

function extractAnswerKey(lines: string[]): Record<number, string> {
    const answers: Record<number, string> = {};
    let inAnswerSection = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i]?.trim() || '';

        // Detect answer key section start — multiple strategies
        if (PATTERNS.answerKeyHeader.test(trimmed)) {
            inAnswerSection = true;
            continue;
        }
        // Also detect if a section header contains "ANSWER KEY" or "ĐÁP ÁN"
        if (/^(?:VI\.|V\.|IV\.)?\s*(?:ANSWER\s*KEY|ĐÁP\s*ÁN)/i.test(trimmed) || (/ANSWER\s*KEY|ĐÁP\s*ÁN/i.test(trimmed) && PATTERNS.sectionHeader.test(trimmed))) {
            inAnswerSection = true;
            continue;
        }
        // Also detect AI-restructured [TYPE: answer-key] tag (standalone or inline)
        if (/\[TYPE:\s*answer-?key\s*\]/i.test(trimmed)) {
            inAnswerSection = true;
            continue;
        }
        // Also detect === N. ANSWER KEY === AI format marker
        if (PATTERNS.aiAnswerKeyMarker.test(trimmed)) {
            inAnswerSection = true;
            continue;
        }

        if (!inAnswerSection) continue;
        if (!trimmed || /^[-=_~*]{3,}$/.test(trimmed)) continue;

        // Strategy 1: Compact "1.D 2.A 3.C" or "1-D, 2-A" or "1:B"
        const compactPattern = /(\d+)[.):\-]\s*([A-H])/gi;
        let match;
        while ((match = compactPattern.exec(trimmed)) !== null) {
            const qNum = parseInt(match[1]!, 10);
            const answer = match[2]!.toUpperCase();
            answers[qNum] = answer;
        }

        // Strategy 2: Spaced "1. B" (one answer per line)
        const spacedMatch = trimmed.match(PATTERNS.answerKeySpaced);
        if (spacedMatch) {
            const qNum = parseInt(spacedMatch[1]!, 10);
            const answer = spacedMatch[2]!.toUpperCase();
            answers[qNum] = answer;
            continue;
        }

        // Strategy 3: Inline pairs "1  B  21  C" (table-extracted, 4+ columns)
        // Matches sequences of number-letter pairs separated by whitespace
        const inlinePairs = trimmed.match(/(\d+)\s+([A-H])(?:\s|$)/gi);
        if (inlinePairs && inlinePairs.length >= 2) {
            for (const pair of inlinePairs) {
                const pairMatch = pair.trim().match(/(\d+)\s+([A-H])/i);
                if (pairMatch) {
                    const qNum = parseInt(pairMatch[1]!, 10);
                    const answer = pairMatch[2]!.toUpperCase();
                    if (!answers[qNum]) answers[qNum] = answer;
                }
            }
            continue;
        }

        // Strategy 4: Free-text answers for rewrite/open-response sections
        const freeTextMatch = trimmed.match(/^\s*(\d+)[.):\-]\s*(.+?)\s*$/);
        if (freeTextMatch) {
            const qNum = parseInt(freeTextMatch[1]!, 10);
            const answer = freeTextMatch[2]!.trim();
            if (answer && !/^[A-H]$/i.test(answer)) {
                answers[qNum] = answer;
            }
        }
    }

    return answers;
}

/**
 * Pre-clean the raw text before sending to AI.
 * Removes citation markers, markdown artifacts, and normalizes whitespace.
 */
function preCleanText(rawText: string): string {
    return rawText
        .replace(/\[cite_start\]/gi, '')
        .replace(/\[cite:\s*[\d,\s]*\]/gi, '')
        // NOTE: **bold** and *italic* markers are intentionally preserved (AC-2)
        // They carry semantic meaning for the pipeline (passage formatting, phonemes)
        .replace(/^#+\s*/gm, '')              // strip markdown headers
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * Parses raw pasted text into structured THCS test format.
 *
 * New Pipeline (Brain-Janitor-Grunt):
 *   1. Pre-clean ? 2. Pass 1 (restructure + confidence)
 *   3. Code Validation ? 4. Branch (compromise/repair/external retry)
 *   5. Regex Engine ? 6. Type Classification ? 7. Diagnostics
 *
 * @param rawText - The raw text pasted by the user
 * @param onProgress - Optional progress callback for UI
 * @returns Parsed test result with sections, questions, answer key
 */
/**
 * Gate Check (FR-1): Verify pasted text came from Step 0.
 * Must satisfy at least ONE of Group A AND at least ONE of Group B.
 *
 * Group A (metadata markers): TITLE: | GRADE: | EXAM TYPE:
 * Group B (structural markers): section header (Roman numeral/Part) | [TYPE: xxx] tag
 */
function isStep0Output(text: string): boolean {
    // Group A: at least one metadata marker
    const hasGroupA =
        /^TITLE:/m.test(text) ||
        /^GRADE:/m.test(text) ||
        /^EXAM\s+TYPE:/m.test(text);

    // Group B: at least one structural marker
    const hasGroupB =
        /^(?:I{1,3}|IV|V|VI{0,3}|IX|X{0,3})\.\s+/im.test(text) ||
        /^(?:Part|Section|Exercise)\s+/im.test(text) ||
        /\[TYPE:\s*[a-z][a-z0-9-]*\s*\]/i.test(text);

    return hasGroupA && hasGroupB;
}

export async function parseThcsText(
    rawText: string,
    onProgress?: (progress: ParseProgress) => void
): Promise<Result<ParsedTest>> {
    try {
        const warnings: ParseWarning[] = [];
        const parseStart = Date.now();
        let usedProvider = 'pipeline-v2';
        let reclassifications: ReclassificationEvent[] = [];

        // ── FR-1: Gate Check ──
        if (!isStep0Output(rawText)) {
            return {
                success: false,
                error: "This text doesn't appear to be Step 0 output. Please use the Copy Prompt button in the test creation wizard to get the extraction prompt, paste it into Gemini or ChatGPT along with your test images, then paste the AI's output here.",
            };
        }

        // --- Stage 1: Pre-clean -------------------------------------
        onProgress?.({ stage: 'extracting', percent: 5, message: 'Cleaning text...' });
        const cleaned = preCleanText(rawText);

        if (cleaned.trim().length < 50) {
            return { success: false, error: 'Text too short to parse. Please paste the full test content.' };
        }

        // --- Stage 2: Parallel Assessment (FR-3) ─────────────────────
        onProgress?.({ stage: 'ai-polish', percent: 20, message: 'Analyzing text (AI + Code in parallel)...' });

        // Create the AI callback for internal Pass 1 (Groq → Gemini fallback)
        const callInternalAI = async (systemMessage: string, prompt: string): Promise<string | null> => {
            const groqResult = await callGroqDirectPlainText(prompt, systemMessage);
            if (groqResult) return groqResult;
            // Groq failed — fall back to Gemini
            console.warn('[Pass1] All Groq keys failed — falling back to Gemini');
            return callGeminiDirectPlainText(prompt, systemMessage);
        };

        // Build the AI callback for crossfix loop (Groq → Gemini, typed as AICallFn)
        const repairCallAI: AICallFn = async (system, prompt, step) => {
            if (step.provider === 'gemini') {
                return callGeminiDirectPlainText(prompt, system, step.model);
            }
            return callGroqDirectPlainText(prompt, system, step.model, step.temperature);
        };

        // Run AI restructuring and code validation in parallel
        const [aiResult, codeReport] = await Promise.all([
            executePass1(cleaned, createRetrySession(), callInternalAI).catch((err) => {
                console.warn('[parseThcsText] Pass 1 AI call failed:', err);
                return null; // AI failure is handled by decision tree
            }),
            Promise.resolve(validateOriginalText(cleaned)),
        ]);

        // Also validate the AI-restructured text (if AI succeeded)
        const validationReport: ValidationReport = aiResult
            ? validateRestructuredText(aiResult.restructuredText, rawText, aiResult.confidence)
            : codeReport;
        console.log(`[parseThcsText] Parallel done: AI=${aiResult ? `confidence=${aiResult.confidence}` : 'FAILED'}, Code=formatConfidence=${codeReport.formatConfidence}`);

        // ── FR-4: Decision Tree ──
        type NextStep = 'engine' | 'crossfix';
        let textForEngine: string;
        let decision: NextStep;

        if (aiResult === null) {
            // AI call failed entirely
            if (codeReport.formatConfidence >= 70) {
                decision = 'engine';
                textForEngine = cleaned;
            } else {
                decision = 'crossfix';
                textForEngine = cleaned;
            }
        } else {
            const A = aiResult.confidence;
            const C = codeReport.formatConfidence;
            const gap = Math.abs(A - C);
            const isEqual = gap <= 10;

            if (!isEqual && A > C) {
                decision = 'engine';
                textForEngine = aiResult.restructuredText;
            } else if (!isEqual && C > A) {
                decision = 'crossfix';
                textForEngine = aiResult.restructuredText;
            } else if (isEqual && A > 70 && C > 70) {
                decision = 'engine';
                textForEngine = aiResult.restructuredText;
            } else {
                decision = 'crossfix';
                textForEngine = aiResult?.restructuredText ?? cleaned;
            }
        }

        console.log(`[parseThcsText] Decision tree: decision=${decision}, AI=${aiResult?.confidence ?? 'FAILED'}, Code=${codeReport.formatConfidence}`);

        // --- Stage 4: Apply Decision ── crossfix? → compromise → engine ---
        let bestText = textForEngine;
        let allAuditEntries: RepairAuditEntry[] = [];
        let compromiseResult: CompromiseResult | null = null;
        let confidenceWarning: string | null = null;

        // 4a: Optional crossfix loop (if decision tree chose 'crossfix')
        if (decision === 'crossfix') {
            onProgress?.({ stage: 'ai-polish', percent: 40, message: 'Crossfix loop — repairing issues...' });

            const crossfixResult = await executeCrossfixLoop(
                bestText,
                cleaned,
                aiResult?.confidence ?? 0,
                repairCallAI,
            );

            bestText = crossfixResult.bestText;
            allAuditEntries.push(...crossfixResult.auditLog);
            confidenceWarning = crossfixResult.confidenceWarning;
            console.log(`[parseThcsText] Crossfix done: rounds=${crossfixResult.roundsExecuted}, wasRepaired=${crossfixResult.wasRepaired}, confidence=${crossfixResult.finalReport.formatConfidence}`);
        }

        // 4b: Compromise unsupported types (BOTH paths — compromise handles types that crossfix doesn't)
        if (validationReport.unsupportedTypes.length > 0) {
            onProgress?.({ stage: 'parsing', percent: 45, message: 'Converting unsupported sections...' });
            const compCallAI = async (system: string, prompt: string, _step: RetryStep): Promise<string | null> => {
                return callGroqDirectPlainText(prompt, system);
            };

            // Build per-section text slices so the AI only gets the relevant section,
            // not the entire document (prevents token waste and cross-section mutations).
            const textLines = bestText.split('\n');
            const boundaries = detectSectionBoundaries(textLines);
            const sectionTexts = new Map<number, string>();
            validationReport.unsupportedTypes.forEach(entry => {
                const boundary = boundaries[entry.sectionIndex];
                if (boundary) {
                    const sectionLines = textLines.slice(boundary.headerLine, boundary.endLine);
                    sectionTexts.set(entry.sectionIndex, sectionLines.join('\n'));
                }
            });

            compromiseResult = await executeCompromiseStep(
                validationReport.unsupportedTypes, bestText, rawText, createRetrySession(), compCallAI, sectionTexts,
            );

            // Merge converted sections back into bestText
            if (compromiseResult.compromisedSections.length > 0) {
                const mergedLines = [...textLines];
                // Process in reverse index order so line offsets don't shift mid-merge.
                const sortedSections = [...compromiseResult.compromisedSections]
                    .sort((a, b) => b.sectionIndex - a.sectionIndex);
                for (const cs of sortedSections) {
                    const boundary = boundaries[cs.sectionIndex];
                    if (boundary && cs.convertedText.trim()) {
                        const replacementLines = cs.convertedText.split('\n');
                        mergedLines.splice(
                            boundary.headerLine,
                            boundary.endLine - boundary.headerLine,
                            ...replacementLines,
                        );
                    }
                }
                bestText = mergedLines.join('\n');
            }
        }

        // --- Stage 5: Regex Engine Parse ----------------------------
        console.log(`[parseThcsText] Stage 5: Regex engine, bestText length=${bestText.length}`);
        console.log(`[parseThcsText] Stage 5: bestText first 800 chars:\n${bestText.substring(0, 800)}`);
        // Quick diagnostic: test regex patterns against first few lines
        const diagLines = bestText.split('\n').slice(0, 30);
        const diagSectionHits = diagLines.filter(l => PATTERNS.sectionHeader.test(l.trim())).length;
        const diagQuestionHits = diagLines.filter(l => PATTERNS.question.test(l.trim())).length;
        console.log(`[parseThcsText] Stage 5 DIAG: first 30 lines → ${diagSectionHits} section headers, ${diagQuestionHits} question matches`);
        onProgress?.({ stage: 'parsing', percent: 65, message: 'Parsing content...' });
        const parsedResult = await parseThcsTextRegex(bestText, undefined, true);
        console.log(`[parseThcsText] Stage 5: Regex result success=${parsedResult.success}, questions=${parsedResult.success ? parsedResult.data?.sections?.reduce((s: number, sec: any) => s + sec.questions.length, 0) : 'N/A'}`);
        if (!parsedResult.success) {
            console.error('[parseThcsText] Regex parsing failed:', parsedResult.error);
            const baseError = parsedResult.error || 'Regex parsing failed on processed text.';
            const warningContext = warnings.length > 0 ? ` (Note: ${(warnings[0] as ParseWarning).message})` : '';
            return { success: false, error: baseError + warningContext };
        }
        if (!parsedResult.data) {
            return { success: false, error: 'Regex parsing succeeded but returned no data.' };
        }
        const parsedTest = parsedResult.data;

        // --- Stage 6: Type Classification ---------------------------
        console.log(`[parseThcsText] Stage 6: Classifying ${parsedTest.sections.length} sections`);
        onProgress?.({ stage: 'classifying', percent: 80, message: 'Classifying question types...' });
        classifyQuestionTypes(parsedTest.sections);
        reclassifications = reclassifyByContent(parsedTest.sections);

        // Apply answer key to questions (safety net)
        for (const section of parsedTest.sections) {
            for (const q of section.questions) {
                if (parsedTest.answerKey[q.questionNumber] && !q.correctAnswer) {
                    q.correctAnswer = parsedTest.answerKey[q.questionNumber];
                }
            }
        }

        // Validate: check question count
        const totalQuestions = parsedTest.sections.reduce((sum, s) => sum + s.questions.length, 0);
        const answeredCount = Object.keys(parsedTest.answerKey).length;

        if (totalQuestions === 0) {
            return { success: false, error: 'Pipeline extracted 0 questions. Please check the text format.' };
        }

        // --- Stage 5.5: Answer Inference (if no answer key found) ----
        let inferredAnswerCount = 0;
        if (answeredCount === 0) {
            onProgress?.({ stage: 'ai-polish', percent: 88, message: 'No answer key found — inferring answers with AI...' });
            console.log('[parseThcsText] Stage 5.5: No answer key found — running AI answer inference');

            // Use Gemini Flash for English comprehension (better than Groq for solving questions)
            const inferCallAI = async (systemMessage: string, prompt: string): Promise<string | null> => {
                const geminiResult = await callGeminiDirectPlainText(prompt, systemMessage, 'gemini-2.5-flash');
                if (geminiResult) return geminiResult;
                // Gemini failed — fall back to Groq
                console.warn('[AnswerInference] Gemini failed — falling back to Groq');
                return callGroqDirectPlainText(prompt, systemMessage);
            };

            const inferResult = await executeAnswerInference(parsedTest.sections, inferCallAI);
            inferredAnswerCount = inferResult.totalInferred;

            // Merge inferred answers into answer key and questions
            for (const inferred of inferResult.answers) {
                if (!parsedTest.answerKey[inferred.questionNumber]) {
                    parsedTest.answerKey[inferred.questionNumber] = inferred.answer;
                }
                // Also set correctAnswer on the question object
                for (const section of parsedTest.sections) {
                    for (const q of section.questions) {
                        if (q.questionNumber === inferred.questionNumber && !q.correctAnswer) {
                            q.correctAnswer = inferred.answer;
                        }
                    }
                }
            }

            if (inferredAnswerCount > 0) {
                warnings.push({
                    type: 'missing-answer',
                    message: `No answer key found in the original text. AI inferred ${inferredAnswerCount}/${inferResult.totalAttempted} answers — please verify these in the editor.`,
                });
            } else {
                warnings.push({ type: 'missing-answer', message: 'No answer key found and AI could not infer answers. You can add answers manually in the editor.' });
            }
        } else if (answeredCount < totalQuestions) {
            warnings.push({ type: 'missing-answer', message: `${totalQuestions - answeredCount} question(s) are missing answer keys. Review in editor.` });
        }

        // --- Stage 7: Diagnostics -----------------------------------
        // Add pipeline-specific warnings
        if (confidenceWarning) {
            warnings.push({ type: 'confidence-mismatch', message: confidenceWarning });
        }
        if (compromiseResult) {
            for (const skip of compromiseResult.skippedSections) {
                warnings.push({ type: 'skipped-section', message: skip.reason });
            }
            for (const comp of compromiseResult.compromisedSections) {
                warnings.push({ type: 'compromised-section', message: `[COMPROMISED: ${comp.originalType} ? ${comp.convertedType}] Section ${comp.sectionIndex + 1}` });
            }
        }

        parsedTest.warnings = warnings;

        // Attach pipeline debug data for review panel
        parsedTest._pipelineDebug = {
            pass1Confidence: aiResult?.confidence ?? 0,
            codeConfidence: validationReport.formatConfidence,
            issuesFound: validationReport.issues.map(i => i.code),
            auditLog: allAuditEntries,
            compromisedSections: compromiseResult?.compromisedSections || [],
            skippedSections: compromiseResult?.skippedSections || [],
            hasInferredAnswers: inferredAnswerCount > 0 || (aiResult?.hasInferredAnswers ?? false),
            inferredAnswerCount,
            pipeline: 'v2-brain-janitor-grunt',
            provider: usedProvider,
            parseDurationMs: Date.now() - parseStart,
        };

        // Console debug
        const debugSections = parsedTest.sections.map(s => ({
            name: s.name, detectedType: s.detectedType, questionCount: s.questions.length,
        }));
        console.log('[PARSER DEBUG] Pipeline V2 Results:', JSON.stringify(debugSections, null, 2));
        console.log(`[PARSER DEBUG] Total: ${totalQuestions} questions, ${answeredCount} answers, confidence: ${validationReport.formatConfidence}%`);

        if (typeof window !== 'undefined') {
            (window as any).__PARSE_DEBUG = {
                timestamp: new Date().toISOString(),
                ...parsedTest._pipelineDebug,
                inputLength: rawText.length,
                cleanedLength: cleaned.length,
                metadata: parsedTest.metadata,
                sections: debugSections,
                totalQuestions,
                answeredCount,
                overallConfidence: parsedTest.overallConfidence,
                warnings: parsedTest.warnings,
                reclassifications,
            };
        }

        onProgress?.({ stage: 'done', percent: 100, message: `Done! ${totalQuestions} questions, ${answeredCount} answers.` });
        return { success: true, data: parsedTest };
    } catch (error) {
        console.error('[parseThcsText] ❌ PIPELINE ERROR:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Text parsing failed',
        };
    }
}

// -- Plain-Text AI Helpers (for Pipeline V2) --

/**
 * Call Groq and return PLAIN TEXT response (no JSON parsing).
 * Used by Pass 1, Pass 2, and Compromise steps.
 */
async function callGroqDirectPlainText(
    prompt: string,
    systemMessage = 'You are a text restructuring assistant for Vietnamese English tests.',
    model = 'llama-3.3-70b-versatile',
    temperature = 0.1,
): Promise<string | null> {
    try {
        const { default: Groq } = await import('groq-sdk');
        const { getEnv } = await import('../../config/env.config');
        const { getDecryptedKeys } = await import('../api-keys.service');
        const { benchKey, filterBenchedKeys } = await import('../key-cooldown.service');

        // Load Firestore (admin-managed) keys FIRST — they're more likely to be fresh
        const allKeys: string[] = [];
        try {
            const firestoreKeys = await getDecryptedKeys('groq');
            for (const k of firestoreKeys) { if (k && !allKeys.includes(k)) allKeys.push(k); }
        } catch (_) { /* ignore */ }
        // Then fallback to .env keys
        const env = getEnv();
        const legacyKey = env.VITE_GROQ_API_KEY;
        if (legacyKey && legacyKey.trim().length > 0 && !legacyKey.includes('your_') && !allKeys.includes(legacyKey)) allKeys.push(legacyKey);

        if (allKeys.length === 0) return null;

        // Filter out keys currently cooling down from previous 429s
        const keys = filterBenchedKeys(allKeys, 'groq');
        if (keys.length === 0) {
            console.warn(`[callGroqDirectPlainText] All ${allKeys.length} key(s) are benched — skipping Groq`);
            return null;
        }
        console.log(`[callGroqDirectPlainText] Trying ${keys.length}/${allKeys.length} available key(s)...`);

        for (let i = 0; i < keys.length; i++) {
            try {
                // maxRetries: 0 — disable SDK internal retries on 429. We handle key rotation ourselves.
                const client = new Groq({ apiKey: keys[i], dangerouslyAllowBrowser: true, maxRetries: 0 });
                const completion = await client.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: systemMessage },
                        { role: 'user', content: prompt },
                    ],
                    temperature,
                    max_tokens: 8192,
                });
                const text = completion.choices[0]?.message?.content;
                if (text && text.trim().length > 10) {
                    console.log(`[callGroqDirectPlainText] ✅ Key ${i + 1} succeeded (${text.length} chars)`);
                    return text;
                }
                console.warn(`[callGroqDirectPlainText] Key ${i + 1} returned empty/short response (${text?.length ?? 0} chars)`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('429') || msg.includes('rate limit')) {
                    benchKey(keys[i]!, 'groq', msg);
                    continue;
                }
                console.warn(`[callGroqDirectPlainText] Key ${i + 1} failed:`, msg);
                continue;
            }
        }
        console.warn(`[callGroqDirectPlainText] ❌ All ${keys.length} keys exhausted — returning null`);
        return null;
    } catch (err) {
        console.warn('[callGroqDirectPlainText] Failed:', err);
        return null;
    }
}

/**
 * Call Gemini and return PLAIN TEXT response (no JSON parsing).
 * Used by Pass 2 repair and External Retry.
 */
async function callGeminiDirectPlainText(
    prompt: string,
    systemMessage = 'You are a text restructuring assistant for Vietnamese English tests.',
    model = 'gemini-2.5-flash',
): Promise<string | null> {
    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const { getEnv } = await import('../../config/env.config');
        const { getDecryptedKeys } = await import('../api-keys.service');

        const { benchKey, filterBenchedKeys } = await import('../key-cooldown.service');

        // Load Firestore (admin-managed) keys FIRST — they're more likely to be fresh
        const allKeys: string[] = [];
        try {
            const firestoreKeys = await getDecryptedKeys('gemini');
            for (const k of firestoreKeys) { if (k && !allKeys.includes(k)) allKeys.push(k); }
        } catch (_) { /* ignore */ }
        // Then fallback to .env keys
        const env = getEnv();
        for (let i = 1; i <= 5; i++) {
            const key = (env as any)[`VITE_GEMINI_API_KEY_${i}`] as string | undefined;
            if (key && key.trim().length > 0 && !key.includes('your_') && !allKeys.includes(key)) allKeys.push(key);
        }

        if (allKeys.length === 0) return null;

        // Filter out keys currently cooling down from previous 429s
        const keys = filterBenchedKeys(allKeys, 'gemini');
        if (keys.length === 0) {
            console.warn(`[callGeminiDirectPlainText] All ${allKeys.length} key(s) are benched — skipping Gemini`);
            return null;
        }

        console.log(`[callGeminiDirectPlainText] Trying ${keys.length}/${allKeys.length} available key(s) with model=${model}...`);

        for (let i = 0; i < keys.length; i++) {
            try {
                const genAI = new GoogleGenerativeAI(keys[i]!);
                const genModel = genAI.getGenerativeModel({ model, systemInstruction: systemMessage });
                const result = await genModel.generateContent(prompt);
                const text = result.response.text();
                if (text && text.trim().length > 10) {
                    console.log(`[callGeminiDirectPlainText] ✅ Key ${i + 1} succeeded (${text.length} chars)`);
                    return text;
                }
                console.warn(`[callGeminiDirectPlainText] Key ${i + 1} returned empty/short response (${text?.length ?? 0} chars)`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('403') || msg.includes('BLOCKED')) {
                    console.warn(`[callGeminiDirectPlainText] Key ${i + 1} blocked (403)`);
                    continue;
                }
                if (msg.includes('429') || msg.includes('quota')) {
                    benchKey(keys[i]!, 'gemini', msg);
                    continue;
                }
                if (msg.includes('404')) {
                    console.warn(`[callGeminiDirectPlainText] Key ${i + 1} model not found (404)`);
                    continue;
                }
                console.warn(`[callGeminiDirectPlainText] Key ${i + 1} failed:`, msg);
                continue;
            }
        }
        console.warn(`[callGeminiDirectPlainText] ❌ All ${keys.length} keys exhausted — returning null`);
        return null;
    } catch (err) {
        console.warn('[callGeminiDirectPlainText] Failed:', err);
        return null;
    }
}

/**
 * FALLBACK: Original regex-based parser.
 * Used when AI is unavailable or fails.
 */
async function parseThcsTextRegex(
    rawText: string,
    onProgress?: (progress: ParseProgress) => void,
    alreadyCleaned = false
): Promise<Result<ParsedTest>> {
    try {
        const warnings: ParseWarning[] = [];
        warnings.push({ type: 'skipped-content', message: 'Using fallback regex parser. Results may be less accurate.' });

        // Pre-clean (skip if caller already cleaned the text)
        const cleaned = alreadyCleaned ? rawText : rawText
            .replace(/\[cite_start\]/gi, '')
            .replace(/\[cite:\s*[\d,\s]*\]/gi, '')
            .replace(/^#+\s*/gm, '')
            // NOTE: **bold** and *italic* markers intentionally preserved (AC-2)
            .replace(/---+/g, '')
            .replace(/^\s*\|[^|]*\|[^|]*\|.*$/gm, '')
            .replace(/:---/g, '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n');

        const lines = cleaned.split('\n');

        const metadata = extractMetadata(lines);
        const sections = detectSections(lines);
        parseQuestions(lines, sections);

        const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
        if (totalQuestions === 0) {
            return { success: false, error: 'No questions could be parsed from the text.' };
        }

        // NOTE: Type classification is intentionally NOT done here.
        // classifyQuestionTypes() is called exclusively in Stage 6 of the main
        // parseThcsText() orchestrator, after all text processing is complete.
        // Calling it here a second time would overwrite Phase-0 [TYPE: xxx] tag
        // assignments (confidence 99) with lower-confidence regex inferences.

        // Extract answer key
        const answerKey = extractAnswerKey(lines);

        // Apply answers
        for (const section of sections) {
            for (const q of section.questions) {
                if (answerKey[q.questionNumber] && !q.correctAnswer) {
                    q.correctAnswer = answerKey[q.questionNumber];
                }
            }
        }

        const answeredCount = Object.keys(answerKey).length;
        if (answeredCount === 0) {
            warnings.push({ type: 'missing-answer', message: 'No answer key found.' });
        }

        onProgress?.({ stage: 'done', percent: 100, message: `Regex fallback: ${totalQuestions} questions.` });

        return {
            success: true,
            data: {
                metadata,
                sections,
                answerKey,
                warnings,
                overallConfidence: Math.round(
                    sections.reduce((sum, s) => sum + s.typeConfidence, 0) / Math.max(sections.length, 1)
                ),
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Regex parsing failed',
        };
    }
}

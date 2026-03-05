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
import { executePass2Repair } from './thcs-pass2-repair';
import type { Pass2Result } from './thcs-pass2-repair';
import { executeCompromiseStep } from './thcs-compromise-step';
import type { CompromiseResult } from './thcs-compromise-step';
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
    // Question: "Question 1.", "Câu 1.", "Câu1:", with REQUIRED prefix OR bare number with substantial text
    // Bare "1. B" will NOT match — must have "Question" prefix OR text length >= 3 after number
    // BUG FIX: Changed (.+) to (.*) so "Question 1." with no trailing text (cloze questions) still matches.
    question: /^(?:(?:C[aâ]u\s*|Question\s*|Q\.?\s*)(?:s?\s*)?(\d+)[.):\s]*(.*)|([0-9]+)[.):\s]+(.{3,}))/i,
    // Option: "A. text", "A) text", "A: text"
    optionLine: /^([A-H])[.):\s]+(.+)/i,
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

function detectSections(lines: string[]): ParsedSection[] {
    const sections: ParsedSection[] = [];
    let currentSection: Partial<ParsedSection> | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();

        // Skip answer key section  don't treat it as a regular section
        if (PATTERNS.answerKeyHeader.test(line) || /^(?:VI\.|V\.|IV\.)?\s*(?:ANSWER\s*KEY|ĐÁP\s*ÁN)/i.test(line)) {
            // Close current section before answer key starts
            if (currentSection && currentSection.startLine !== undefined) {
                currentSection.endLine = i - 1;
                sections.push(currentSection as ParsedSection);
                currentSection = null;
            }
            break; // Stop section detection  everything after this is answer key
        }

        const sectionMatch = line.match(PATTERNS.sectionHeader);

        if (sectionMatch) {
            if (currentSection && currentSection.startLine !== undefined) {
                currentSection.endLine = i - 1;
                sections.push(currentSection as ParsedSection);
            }
            const sectionName = (sectionMatch[1] || sectionMatch[3] || '').trim() || `Section ${sections.length + 1}`;
            currentSection = {
                name: sectionName,
                instructionText: '',
                startLine: i,
                endLine: lines.length - 1,
                questions: [],
                detectedType: 'mcq-grammar',
                typeConfidence: 60,
            };
        }
    }

    // Close last section
    if (currentSection && currentSection.startLine !== undefined) {
        currentSection.endLine = lines.length - 1;
        sections.push(currentSection as ParsedSection);
    }

    // Edge case EC13: No sections found ? create "General"
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

        for (let i = section.startLine + 1; i <= section.endLine; i++) {
            const line = lines[i]?.trim() || '';
            if (!line) continue;

            if (PATTERNS.answerKeyHeader.test(line) || /^(?:VI\.|V\.|IV\.)?\s*(?:ANSWER\s*KEY|ĐÁP\s*ÁN)/i.test(line)) break;

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
                    const cleanText = qText.trim();
                    // Skip false positive: bare "1. B" where B is an option letter not question text
                    if (cleanText.length <= 2 && /^[A-H]$/i.test(cleanText)) continue;
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

        // Detect answer key section start  multiple strategies
        if (PATTERNS.answerKeyHeader.test(trimmed)) {
            inAnswerSection = true;
            continue;
        }
        // Also detect if a section header contains "ANSWER KEY" or "ĐÁP ÁN"
        if (/^(?:VI\.|V\.|IV\.)?\s*(?:ANSWER\s*KEY|ĐÁP\s*ÁN)/i.test(trimmed) || (/ANSWER\s*KEY|ĐÁP\s*ÁN/i.test(trimmed) && PATTERNS.sectionHeader.test(trimmed))) {
            inAnswerSection = true;
            continue;
        }

        if (!inAnswerSection) continue;

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
            onProgress?.({ stage: 'parsing', percent: 35, message: 'Cross-fixing formatting issues...' });
            // TODO: Task 4.0 — implement executeCrossfixLoop and call it here
            // const crossfixResult = await executeCrossfixLoop(
            //     bestText, cleaned, aiResult?.confidence ?? 0, crossfixCallAI,
            // );
            // bestText = crossfixResult.bestText;
            // allAuditEntries.push(...crossfixResult.auditLog);
            // confidenceWarning = crossfixResult.confidenceWarning;

            // Interim: use the old repair as a bridge until crossfix loop is implemented
            const repairCallAI = async (system: string, prompt: string, step: RetryStep): Promise<string | null> => {
                if (step.provider === 'gemini') {
                    return callGeminiDirectPlainText(prompt, system, step.model);
                }
                return callGroqDirectPlainText(prompt, system, step.model, step.temperature);
            };
            if (validationReport.issues.length > 0) {
                const pass2: Pass2Result = await executePass2Repair(
                    validationReport, aiResult?.confidence ?? 0, createRetrySession(), repairCallAI,
                    bestText,
                );
                bestText = pass2.repairedText;
                allAuditEntries.push(...pass2.auditLog);
                confidenceWarning = pass2.confidenceWarning;
            }
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

        if (answeredCount === 0) {
            warnings.push({ type: 'missing-answer', message: 'No answer key found. You can add answers manually in the editor.' });
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
            hasInferredAnswers: aiResult?.hasInferredAnswers ?? false,
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

/**
 * THCS Document Parser Service (Phase 3, Task 10.1 + 10.2)
 *
 * Parses .docx/.pdf/.txt test documents into structured THCSTest format.
 * Three-layer approach:
 *   Layer 1: Regex structural parser (sections, questions)
 *   Layer 2: Instruction-to-type classifier
 *   Layer 3: AI polish for ambiguous items (optional)
 */

import type { THCSQuestionType } from '../../types/thcs-test.types';
import { classifyQuestionTypes } from './thcs-type-classifier';
import { extractJSON } from './ai-json-repair';
export { convertParsedToThcsDraft } from './thcs-draft-converter';

// ── Types ──

export interface ParseProgress {
    stage: 'extracting' | 'parsing' | 'classifying' | 'ai-polish' | 'done';
    percent: number;
    message: string;
}

export interface ParseWarning {
    type: 'missing-answer' | 'skipped-content' | 'ambiguous-type' | 'no-sections' | 'images-detected' | 'multi-variant';
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

export interface ParsedTest {
    metadata: ParsedMetadata;
    sections: ParsedSection[];
    answerKey: Record<number, string>;
    warnings: ParseWarning[];
    overallConfidence: number;
}

export type Result<T> = { success: true; data: T } | { success: false; error: string };

// ── Regex Patterns (PRD §4.12.3) ──

const PATTERNS = {
    // Section: "I. MULTIPLE CHOICE", "Part A:", "SECTION II.", "Phần 3."
    // Must have a recognized prefix OR a Roman numeral followed by substantial text (>3 chars, not just a single letter)
    sectionHeader: /^(?:(?:SECTION|Part|Phần)\s*(?:[IVXLCDM]+|\d+)[.:\s]*(.+)|([IVXLCDM]+)[.:\s]+(.{4,}))/im,
    // Question: "Question 1.", "Câu 1.", "Câu1:", with REQUIRED prefix OR bare number with substantial text
    // Bare "1. B" will NOT match — must have "Question" prefix OR text length >= 3 after number
    question: /^(?:(?:Câu\s*|Question\s*|Q\.?\s*)(?:số\s*)?(\d+)[.):\s]+(.+)|(\d+)[.):\s]+(.{3,}))/i,
    // Option: "A. text", "A) text", "A: text"
    optionLine: /^([A-H])[.):\s]+(.+)/i,
    // Answer key header: many Vietnamese variants
    answerKeyHeader: /^(?:ANSWER\s*KEY|ĐÁP\s*ÁN|KEY|KEYS|BẢNG\s*ĐÁP\s*ÁN|MÃ\s*ĐỀ.*ĐÁP\s*ÁN)[:\s]*/i,
    // Answer entries: "1:B", "1.B", "1-B", "Câu 1: Đáp án: A"
    answerKeyLine: /(?:Câu\s*)?(\d+)[:.)\-\s]+(?:Đáp\s*án[:\s]*)?([A-H])/gi,
    // Space-separated answer: "1. B" (number + dot/colon + space + single letter)
    answerKeySpaced: /^\s*(\d+)[.):\s]+([A-H])\s*$/i,
    fillBlank: /_{2,}|\.{3,}/g,
    pointAllocation: /\((\d+(?:\.\d+)?)\s*(?:point|điểm|pts?|marks?)\)/i,
    // Duration: "60 minutes", "60 MINUTES", "45 phút"
    duration: /(\d+)\s*(?:minutes?|phút|mins?)/i,
    // Grade: "Grade 9", "Lớp 10", "Khối 9", "10TH GRADE", "LỚP 9"
    gradeLevel: /(?:(?:Grade|Lớp|Khối)\s*(\d{1,2})|(\d{1,2})(?:TH|ST|ND|RD)?\s*GRADE)/i,
};

// ── Layer 1: Regex Structural Parser ──

function detectSections(lines: string[]): ParsedSection[] {
    const sections: ParsedSection[] = [];
    let currentSection: Partial<ParsedSection> | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();

        // Skip answer key section — don't treat it as a regular section
        if (PATTERNS.answerKeyHeader.test(line) || /ANSWER\s*KEY|ĐÁP\s*ÁN/i.test(line)) {
            // Close current section before answer key starts
            if (currentSection && currentSection.startLine !== undefined) {
                currentSection.endLine = i - 1;
                sections.push(currentSection as ParsedSection);
                currentSection = null;
            }
            break; // Stop section detection — everything after this is answer key
        }

        const sectionMatch = line.match(PATTERNS.sectionHeader);

        if (sectionMatch) {
            if (currentSection && currentSection.startLine !== undefined) {
                currentSection.endLine = i - 1;
                sections.push(currentSection as ParsedSection);
            }
            // New regex has 3 groups: [1]=prefix-style text, [2]=Roman numeral, [3]=Roman-style text
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

        // Extract instruction text (lines between section header and first question)
        let instructionLines: string[] = [];
        let foundFirstQuestion = false;

        for (let i = section.startLine + 1; i <= section.endLine; i++) {
            const line = lines[i]?.trim() || '';
            if (!line) continue;

            // Stop parsing questions if we hit the answer key section
            if (PATTERNS.answerKeyHeader.test(line) || /ANSWER\s*KEY|ĐÁP\s*ÁN/i.test(line)) {
                break;
            }

            const questionMatch = line.match(PATTERNS.question);
            const optionMatch = line.match(PATTERNS.optionLine);

            if (questionMatch && !foundFirstQuestion) {
                foundFirstQuestion = true;
                section.instructionText = instructionLines.join(' ').trim();
            }

            if (!foundFirstQuestion) {
                instructionLines.push(line);
                continue;
            }

            if (questionMatch) {
                // Extract number and text from either capture group pattern
                const qNum = questionMatch[1] || questionMatch[3];
                const qText = questionMatch[2] || questionMatch[4];
                if (qNum && qText) {
                    // Double-check: skip if text is just a single answer letter (e.g., "B", "C")
                    const cleanText = qText.trim();
                    if (cleanText.length <= 2 && /^[A-H]$/i.test(cleanText)) {
                        // This is an answer key line, not a question — skip
                        continue;
                    }
                    // Flush previous question
                    if (currentQ && currentQ.text) {
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
                // Continuation of question text (but skip noise lines)
                if (line.length > 2 && !/^[-=_~*]{3,}$/.test(line)) {
                    currentQ.text += ' ' + line;
                }
            }
        }

        // Flush last question
        if (currentQ && currentQ.text) {
            section.questions.push(currentQ as ParsedQuestion);
        }

        // If no instruction text was extracted, use the first line after header
        if (!section.instructionText && instructionLines.length > 0) {
            section.instructionText = instructionLines.join(' ').trim();
        }
    }
}

function extractMetadata(lines: string[]): ParsedMetadata {
    const metadata: ParsedMetadata = {};
    // Check first 30 lines for metadata (some tests have long headers)
    const headerLines = lines.slice(0, 30).join('\n');

    // Grade: "Grade 9", "Lớp 10", "10TH GRADE"
    const gradeMatch = headerLines.match(PATTERNS.gradeLevel);
    if (gradeMatch) {
        // Group 1 = "Grade 9" style, Group 2 = "10TH GRADE" style
        const gradeNum = gradeMatch[1] || gradeMatch[2];
        if (gradeNum) metadata.gradeLevel = parseInt(gradeNum, 10);
    }

    // Duration
    const durationMatch = headerLines.match(PATTERNS.duration);
    if (durationMatch) metadata.duration = parseInt(durationMatch[1]!, 10);

    // Title: check for explicit TITLE: prefix first, then first meaningful line
    const titlePrefixMatch = headerLines.match(/^TITLE:\s*(.+)/im);
    if (titlePrefixMatch) {
        metadata.title = titlePrefixMatch[1]!.trim();
    } else {
        // Look for the most title-like line in first 10 lines
        for (const line of lines.slice(0, 10)) {
            const trimmed = line?.trim();
            if (!trimmed || trimmed.length <= 5) continue;
            // Skip lines that are pure metadata
            if (/^(?:TITLE|GRADE|DURATION|EXAM|TIME|SCHOOL|SUBJECT|TEST\s*CODE):/i.test(trimmed)) continue;
            if (PATTERNS.gradeLevel.test(trimmed) && trimmed.length < 20) continue;
            if (PATTERNS.duration.test(trimmed) && trimmed.length < 25) continue;
            // Skip section headers
            if (PATTERNS.sectionHeader.test(trimmed)) continue;
            metadata.title = trimmed;
            break;
        }
    }

    // Exam type detection — expanded patterns
    if (/giữa\s*kì|mid[- ]?term|giữa.*học.*kì/i.test(headerLines)) metadata.examType = 'giữa kì';
    else if (/cuối\s*kì|final|end[- ]?of|cuối.*học.*kì/i.test(headerLines)) metadata.examType = 'cuối kì';
    else if (/thi\s*vào\s*10|entrance|tuyển\s*sinh/i.test(headerLines)) metadata.examType = 'thi vào 10';
    else if (/ôn\s*tập|review|practice/i.test(headerLines)) metadata.examType = 'ôn tập';
    else if (/kiểm tra|test|quiz|exam/i.test(headerLines)) metadata.examType = 'giữa kì';

    // Exam type from explicit prefix
    const examTypePrefixMatch = headerLines.match(/^EXAM\s*TYPE:\s*(.+)/im);
    if (examTypePrefixMatch) metadata.examType = examTypePrefixMatch[1]!.trim();

    return metadata;
}

// ── Task 10.5: Answer Key Extraction ──

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
        if (/ANSWER\s*KEY|ĐÁP\s*ÁN/i.test(trimmed) && PATTERNS.sectionHeader.test(trimmed)) {
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

// ── Main Parser Function ──

export async function parseThcsDocument(
    file: File,
    onProgress?: (progress: ParseProgress) => void
): Promise<Result<ParsedTest>> {
    try {
        const warnings: ParseWarning[] = [];

        // Stage 1: Extract text
        onProgress?.({ stage: 'extracting', percent: 10, message: 'Extracting text...' });

        let text: string;
        if (file.name.endsWith('.txt')) {
            text = await file.text();
        } else {
            try {
                const { extractTextFromFile } = await import('../file-extractor/file.extractor');
                const extractResult = await extractTextFromFile(file);
                if (!extractResult.success) {
                    return { success: false, error: 'Failed to extract text from document.' };
                }
                text = extractResult.data;
            } catch {
                return { success: false, error: 'Failed to extract text from document. Only .txt is supported without the file extractor library.' };
            }
        }

        const lines = text.split('\n');

        // Stage 2: Parse structure
        onProgress?.({ stage: 'parsing', percent: 30, message: 'Detecting sections...' });

        const metadata = extractMetadata(lines);
        const sections = detectSections(lines);

        // EC13: Warning if no section headers found
        if (sections.length === 1 && sections[0]!.name === 'General') {
            warnings.push({ type: 'no-sections', message: 'No section headers detected. All questions grouped under "General".' });
        }

        parseQuestions(lines, sections);

        // Stage 3: Classify types
        onProgress?.({ stage: 'classifying', percent: 60, message: 'Classifying question types...' });

        const ambiguous = classifyQuestionTypes(sections);

        // Stage 3b: AI Polish for ambiguous items (Task 10.4)
        if (ambiguous.length > 0) {
            onProgress?.({ stage: 'ai-polish', percent: 75, message: `AI verifying ${ambiguous.length} ambiguous classification(s)...` });

            try {
                const { aiService } = await import('../ai/router.service');
                const validTypes: THCSQuestionType[] = [
                    'pronunciation', 'word-stress', 'mcq-grammar', 'mcq-vocabulary',
                    'mcq-sign-notice', 'dialogue-response', 'reading-cloze-mcq',
                    'reading-comprehension', 'reading-announcement', 'sentence-arrangement',
                    'closest-meaning', 'error-identification', 'synonym-mcq', 'antonym-mcq',
                    'verb-form', 'word-form', 'sentence-rewrite', 'sentence-rewrite-keyword',
                    'reading-cloze-wordbank',
                ];

                const prompt = `Classify these Vietnamese THCS-THPT test instructions into question types.
Valid types: ${validTypes.join(', ')}

Items to classify:
${JSON.stringify(ambiguous.map(a => ({
                    id: a.id,
                    instructionText: a.instructionText,
                    currentType: a.currentType,
                    confidence: a.confidence,
                })))}

Return JSON only: { "classifications": [{ "id": "...", "type": "...", "confidence": 0-100 }] }`;

                // Use parseChunk with a classification-focused chunk
                const classifyChunk = {
                    id: 'thcs-classify',
                    text: prompt,
                    type: 'combined' as const,
                    number: 0,
                    wordCount: prompt.split(/\s+/).length,
                    startIndex: 0,
                    endIndex: prompt.length,
                    isLast: true,
                    metadata: { source: 'thcs-classifier', chunkIndex: 0, totalChunks: 1 },
                };
                const aiResult = await aiService.parseChunk(classifyChunk as any);

                if (aiResult.success && aiResult.data) {
                    const raw = aiResult.data as any;
                    const classifications = raw.classifications;
                    if (classifications && Array.isArray(classifications)) {
                        for (const cls of classifications) {
                            const item = ambiguous.find(a => a.id === cls.id);
                            if (item && cls.confidence > item.confidence && validTypes.includes(cls.type)) {
                                const section = sections[item.sectionIndex];
                                if (section) {
                                    section.detectedType = cls.type;
                                    section.typeConfidence = cls.confidence;
                                    for (const q of section.questions) {
                                        q.type = cls.type;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (aiErr) {
                console.warn('[parseThcsDocument] AI polish failed, using regex results:', aiErr);
                warnings.push({
                    type: 'skipped-content',
                    message: 'AI verification unavailable — please review flagged items manually.',
                });
            }
        }

        // Extract answer key
        const answerKey = extractAnswerKey(lines);

        // Apply answer key to questions
        for (const section of sections) {
            for (const q of section.questions) {
                if (answerKey[q.questionNumber]) {
                    q.correctAnswer = answerKey[q.questionNumber];
                }
            }
        }

        // EC14: Image detection warning
        if (/\[image\]|!\[/i.test(text)) {
            warnings.push({ type: 'images-detected', message: 'Images detected but not imported.' });
        }

        // EC17: Multi-variant detection
        if (/mã\s*đề/i.test(text)) {
            warnings.push({ type: 'multi-variant', message: 'Multiple test variants detected. Only the first variant was parsed.' });
        }

        // Calculate overall confidence
        const totalSections = sections.length;
        const avgConfidence = totalSections > 0
            ? sections.reduce((sum, s) => sum + s.typeConfidence, 0) / totalSections
            : 0;

        // Stage 4: Done
        onProgress?.({ stage: 'done', percent: 100, message: 'Parsing complete!' });

        return {
            success: true,
            data: {
                metadata,
                sections,
                answerKey,
                warnings,
                overallConfidence: Math.round(avgConfidence),
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Document parsing failed',
        };
    }
}

// ── Parse from Raw Text (Paste Text feature) ──
// PRD §4.12.3: Three-Layer Architecture
//   Layer 1: Regex structural parser (instant, no API)
//   Layer 2: Instruction-to-type classifier (local, no API)
//   Layer 3: AI polish for ambiguous items (1 API call, only if needed)

// THCS_AI_PROMPT is lazy-loaded inside parseThcsText (paste-text path only)

// extractJSON is imported from ./ai-json-repair (shared with groq.provider.ts)

/**
 * Validate and normalize the AI-parsed result into our ParsedTest format.
 * Provides defensive defaults for missing fields.
 */
function validateAIResult(raw: any): ParsedTest {
    const metadata: ParsedMetadata = {
        title: raw.metadata?.title || '',
        gradeLevel: raw.metadata?.gradeLevel || 0,
        duration: raw.metadata?.duration || 0,
        examType: raw.metadata?.examType || '',
    };

    // Type normalization map — AI sometimes returns types that don't match THCSQuestionType exactly
    const TYPE_FIX_MAP: Record<string, THCSQuestionType> = {
        'sentence-transformation': 'closest-meaning',  // AI invents this, should be closest-meaning
        'grammar': 'mcq-grammar',
        'vocabulary': 'mcq-vocabulary',
        'fill-in': 'mcq-grammar',
        'cloze': 'reading-cloze-mcq',
        'comprehension': 'reading-comprehension',
    };
    const normalizeType = (t: string): THCSQuestionType => {
        return (TYPE_FIX_MAP[t] || t) as THCSQuestionType;
    };

    const sections: ParsedSection[] = (raw.sections || []).map((s: any, i: number) => {
        let sectionType = normalizeType(s.detectedType || 'mcq-grammar');

        const allQuestions = (s.questions || []).map((q: any) => ({
            questionNumber: q.questionNumber || 0,
            text: q.text || q.questionText || '',
            type: sectionType,
            options: Array.isArray(q.options) ? q.options : [],
            correctAnswer: q.correctAnswer || '',
            blankCount: ((q.text || '').match(/_{2,}/g) || []).length,
        }));

        const realQuestions = allQuestions.filter((q: any) => q.questionNumber > 0);

        // ── Smart reclassification: sentence-rewrite with MCQ options → closest-meaning ──
        // Vietnamese exams have two forms of "sentence transformation":
        //   D2 (closest-meaning) = MCQ: pick A/B/C/D sentence closest in meaning
        //   E1 (sentence-rewrite) = Writing: rewrite with given start (no options)
        // AI often classifies both as 'sentence-rewrite'. Detect and fix by checking
        // if ALL questions have 4 non-empty options and single-letter A-D correct answers.
        if (
            (sectionType === 'sentence-rewrite' || sectionType === 'sentence-rewrite-keyword') &&
            realQuestions.length > 0 &&
            realQuestions.every((q: any) => {
                const opts = q.options || [];
                const nonEmptyOpts = opts.filter((o: string) => o && o.trim().length > 0);
                const hasValidAnswer = /^[A-Da-d]$/.test(q.correctAnswer || '');
                return nonEmptyOpts.length === 4 && hasValidAnswer;
            })
        ) {
            console.log(`[Parser] Auto-reclassified section "${s.name}" from ${sectionType} → closest-meaning (MCQ sentence transformation detected)`);
            sectionType = 'closest-meaning';
            // Update all question types too
            realQuestions.forEach((q: any) => { q.type = 'closest-meaning'; });
        }

        // Extract passage text from questionNumber 0 entries (AI stores passages this way)
        const passageEntry = allQuestions.find((q: any) => q.questionNumber === 0);

        return {
            name: s.name || `Section ${i + 1}`,
            instructionText: s.instructionText || '',
            startLine: 0,
            endLine: 0,
            detectedType: sectionType,
            typeConfidence: s.typeConfidence || 70,
            questions: realQuestions,
            ...(passageEntry ? { passageText: passageEntry.text.replace(/^PASSAGE:\s*/i, '') } : {}),
        };
    });

    // Normalize answer key — AI may return string keys
    const answerKey: Record<number, string> = {};
    if (raw.answerKey && typeof raw.answerKey === 'object') {
        for (const [key, value] of Object.entries(raw.answerKey)) {
            const qNum = parseInt(key, 10);
            if (!isNaN(qNum) && typeof value === 'string') {
                answerKey[qNum] = value.toUpperCase();
            }
        }
    }

    return {
        metadata,
        sections,
        answerKey,
        warnings: [],
        overallConfidence: raw.overallConfidence || 80,
    };
}

/**
 * Pre-clean the raw text before sending to AI.
 * Removes citation markers, markdown artifacts, and normalizes whitespace.
 */
function preCleanText(rawText: string): string {
    return rawText
        .replace(/\[cite_start\]/gi, '')
        .replace(/\[cite:\s*[\d,\s]*\]/gi, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')       // strip bold markers
        .replace(/\*(.*?)\*/g, '$1')           // strip italic markers
        .replace(/^#+\s*/gm, '')              // strip markdown headers
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * Parses raw pasted text into structured THCS test format.
 *
 * AI-First Pipeline (mirrors IELTS approach):
 *   1. Pre-clean → Send to AI (Groq/Gemini) for structured extraction
 *   2. Validate + normalize AI response
 *   3. Apply answer key to questions
 *   4. Fallback to regex parser if AI fails
 *
 * @param rawText - The raw text pasted by the user
 * @param onProgress - Optional progress callback for UI
 * @returns Parsed test result with sections, questions, answer key
 */
export async function parseThcsText(
    rawText: string,
    onProgress?: (progress: ParseProgress) => void
): Promise<Result<ParsedTest>> {
    try {
        const warnings: ParseWarning[] = [];

        // ─── Stage 1: Pre-clean ─────────────────────────────────────
        onProgress?.({ stage: 'extracting', percent: 5, message: 'Cleaning text...' });
        const cleaned = preCleanText(rawText);

        if (cleaned.trim().length < 50) {
            return { success: false, error: 'Text too short to parse. Please paste the full test content.' };
        }

        // ─── Stage 2: AI Extraction ─────────────────────────────────
        onProgress?.({ stage: 'parsing', percent: 15, message: 'Sending to AI for extraction...' });

        let parsedTest: ParsedTest | null = null;

        try {
            // Lazy-load the prompt (only needed for paste-text path, not file-upload)
            const { default: THCS_AI_PROMPT } = await import('./thcs-ai-extraction-prompt.txt?raw');
            // Build the prompt: system prompt + user text
            const fullPrompt = THCS_AI_PROMPT + '\n\n"""\n' + cleaned + '\n"""';


            // Use the router's parseChunk — which tries Gemini first, then Groq
            // But we need a custom prompt, so we'll call the providers directly
            const groqResult = await attemptAIParse(fullPrompt, 'groq');

            if (groqResult) {
                parsedTest = groqResult;
                onProgress?.({ stage: 'parsing', percent: 60, message: '✅ AI extraction succeeded!' });
            } else {
                // Try Gemini as fallback
                const geminiResult = await attemptAIParse(fullPrompt, 'gemini');
                if (geminiResult) {
                    parsedTest = geminiResult;
                    onProgress?.({ stage: 'parsing', percent: 60, message: '✅ AI extraction succeeded (Gemini)!' });
                }
            }
        } catch (aiErr) {
            console.warn('[parseThcsText] AI extraction failed:', aiErr);
            warnings.push({
                type: 'skipped-content',
                message: 'AI extraction failed — falling back to regex parser.',
            });
        }

        // ─── Stage 3: Fallback to Regex (if AI failed) ──────────────
        if (!parsedTest) {
            console.warn('[parseThcsText] AI failed — using regex fallback');
            onProgress?.({ stage: 'parsing', percent: 40, message: 'AI unavailable, using regex parser...' });

            return parseThcsTextRegex(cleaned, onProgress, true);
        }

        // ─── Stage 3b: Section Reconciliation (Q# overlap matching) ───
        // Run the regex parser to get structural info (answer key, line ranges).
        // Match AI sections to regex sections by question-number set overlap, NOT by name.
        // This prevents silent question drops when AI renames sections (e.g.
        // AI: "PHONETICS" vs regex: "Part A: PHONETICS").
        try {
            const regexResult = await parseThcsTextRegex(cleaned, undefined, true);
            if (regexResult.success && regexResult.data) {
                const regexSections = regexResult.data.sections;

                // Build a Q#-set for each regex section
                const regexQSets = regexSections.map(rs => ({
                    section: rs,
                    qNums: new Set(rs.questions.map(q => q.questionNumber)),
                }));

                // For each AI section, find the best-matching regex section by overlap
                for (const aiSection of parsedTest.sections) {
                    const aiQNums = new Set(aiSection.questions.map(q => q.questionNumber));
                    if (aiQNums.size === 0) continue;

                    let bestMatch: typeof regexQSets[0] | null = null;
                    let bestOverlap = 0;

                    for (const rqs of regexQSets) {
                        if (rqs.qNums.size === 0) continue;
                        // Count intersection
                        let intersection = 0;
                        for (const n of aiQNums) {
                            if (rqs.qNums.has(n)) intersection++;
                        }
                        // Overlap relative to the smaller set (covers partial-section AI groupings)
                        const smaller = Math.min(aiQNums.size, rqs.qNums.size);
                        const ratio = intersection / smaller;
                        if (ratio > bestOverlap) {
                            bestOverlap = ratio;
                            bestMatch = rqs;
                        }
                    }

                    // AC#4: ≥80% threshold check
                    if (bestMatch && bestOverlap >= 0.8) {
                        // Fill in missing correctAnswers from regex answer key
                        const regexAnswerKey = regexResult.data.answerKey;
                        for (const q of aiSection.questions) {
                            if (!q.correctAnswer && regexAnswerKey[q.questionNumber]) {
                                q.correctAnswer = regexAnswerKey[q.questionNumber];
                            }
                        }
                    }
                }
            }
        } catch (reconcileErr) {
            // Non-fatal — AI result is still usable without reconciliation
            console.warn('[parseThcsText] Reconciliation failed, using AI result as-is:', reconcileErr);
        }

        // ─── Stage 4: Post-Processing ───────────────────────────────
        onProgress?.({ stage: 'classifying', percent: 70, message: 'Validating and applying answer key...' });

        // Apply answer key to questions
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
            return { success: false, error: 'AI extracted 0 questions. Please check the text format.' };
        }

        if (answeredCount === 0) {
            warnings.push({
                type: 'missing-answer',
                message: 'No answer key found. You can add answers manually in the editor.',
            });
        } else if (answeredCount < totalQuestions) {
            const missing = totalQuestions - answeredCount;
            warnings.push({
                type: 'missing-answer',
                message: `${missing} question(s) are missing answer keys. Review in editor.`,
            });
        }

        parsedTest.warnings = warnings;

        // ─── Stage 5: Diagnostics ───────────────────────────────────
        const debugSections = parsedTest.sections.map(s => ({
            name: s.name,
            detectedType: s.detectedType,
            typeConfidence: s.typeConfidence,
            questionCount: s.questions.length,
            questionNumbers: s.questions.map(q => q.questionNumber),
        }));

        console.log('[PARSER DEBUG] AI-First Pipeline Results:');
        console.log('[PARSER DEBUG] Sections:', JSON.stringify(debugSections, null, 2));
        console.log(`[PARSER DEBUG] Total: ${totalQuestions} questions, ${answeredCount} answers, ${parsedTest.sections.length} sections`);

        if (typeof window !== 'undefined') {
            (window as any).__PARSE_DEBUG = {
                timestamp: new Date().toISOString(),
                pipeline: 'AI-first',
                inputLength: rawText.length,
                cleanedLength: cleaned.length,
                metadata: parsedTest.metadata,
                sections: debugSections,
                totalQuestions,
                answeredCount,
                overallConfidence: parsedTest.overallConfidence,
                warnings: parsedTest.warnings,
            };
        }

        onProgress?.({ stage: 'done', percent: 100, message: `Done! ${totalQuestions} questions, ${answeredCount} answers.` });

        return { success: true, data: parsedTest };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Text parsing failed',
        };
    }
}

/**
 * Attempt AI parsing with a specific provider.
 * Returns ParsedTest or null if failed.
 */
async function attemptAIParse(prompt: string, provider: 'groq' | 'gemini'): Promise<ParsedTest | null> {
    try {
        if (provider === 'groq') {
            return await callGroqDirect(prompt);
        } else {
            return await callGeminiDirect(prompt);
        }
    } catch (err) {
        console.warn(`[parseThcsText] ${provider} attempt failed:`, err);
        return null;
    }
}

/**
 * Direct Groq API call with custom THCS prompt.
 */
async function callGroqDirect(prompt: string): Promise<ParsedTest | null> {
    try {
        const { default: Groq } = await import('groq-sdk');
        const { getEnv } = await import('../../config/env.config');
        const { getDecryptedKeys } = await import('../api-keys.service');

        // Gather all available Groq keys
        const keys: string[] = [];
        const env = getEnv();
        const legacyKey = env.VITE_GROQ_API_KEY;
        if (legacyKey && legacyKey.trim().length > 0 && !legacyKey.includes('your_')) {
            keys.push(legacyKey);
        }
        try {
            const firestoreKeys = await getDecryptedKeys('groq');
            for (const k of firestoreKeys) {
                if (k && !keys.includes(k)) keys.push(k);
            }
        } catch (_) { /* ignore */ }

        if (keys.length === 0) {
            console.warn('[callGroqDirect] No Groq API keys');
            return null;
        }

        // Try each key
        for (let i = 0; i < keys.length; i++) {
            try {
                const client = new Groq({ apiKey: keys[i], dangerouslyAllowBrowser: true });
                console.log(`📤 [THCS AI Parse] Groq key ${i + 1}/${keys.length}`);

                const completion = await client.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'You are an expert Vietnamese THCS-THPT English test parser. Return only valid JSON, no markdown fencing.' },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.1,
                    max_tokens: 8192,
                });

                const text = completion.choices[0]?.message?.content;
                if (!text) continue;

                const parsed = extractJSON(text);
                const result = validateAIResult(parsed);

                const totalQ = result.sections.reduce((sum, s) => sum + s.questions.length, 0);
                console.log(`✅ [THCS AI Parse] Groq succeeded: ${totalQ} questions, ${Object.keys(result.answerKey).length} answers`);

                return result;
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                if (errMsg.includes('429') || errMsg.includes('rate limit')) {
                    console.warn(`⚠️ [THCS AI Parse] Groq key ${i + 1} rate limited, trying next...`);
                    continue;
                }
                console.warn(`⚠️ [THCS AI Parse] Groq key ${i + 1} failed:`, errMsg);
                continue;
            }
        }

        return null;
    } catch (err) {
        console.warn('[callGroqDirect] Failed:', err);
        return null;
    }
}

/**
 * Direct Gemini API call with custom THCS prompt.
 */
async function callGeminiDirect(prompt: string): Promise<ParsedTest | null> {
    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const { getEnv } = await import('../../config/env.config');
        const { getDecryptedKeys } = await import('../api-keys.service');

        const keys: string[] = [];
        const env = getEnv();

        // Gather Gemini API keys
        for (let i = 1; i <= 5; i++) {
            const key = (env as any)[`VITE_GEMINI_API_KEY_${i}`] as string | undefined;
            if (key && key.trim().length > 0 && !key.includes('your_') && !keys.includes(key)) {
                keys.push(key);
            }
        }
        try {
            const firestoreKeys = await getDecryptedKeys('gemini');
            for (const k of firestoreKeys) {
                if (k && !keys.includes(k)) keys.push(k);
            }
        } catch (_) { /* ignore */ }

        if (keys.length === 0) {
            console.warn('[callGeminiDirect] No Gemini API keys');
            return null;
        }

        for (let i = 0; i < keys.length; i++) {
            try {
                const genAI = new GoogleGenerativeAI(keys[i]!);
                const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                console.log(`📤 [THCS AI Parse] Gemini key ${i + 1}/${keys.length}`);

                const result = await model.generateContent(prompt);
                const text = result.response.text();
                if (!text) continue;

                const parsed = extractJSON(text);
                const validResult = validateAIResult(parsed);

                const totalQ = validResult.sections.reduce((sum, s) => sum + s.questions.length, 0);
                console.log(`✅ [THCS AI Parse] Gemini succeeded: ${totalQ} questions`);

                return validResult;
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                if (errMsg.includes('403') || errMsg.includes('BLOCKED')) {
                    console.warn(`⚠️ [THCS AI Parse] Gemini key ${i + 1} blocked, trying next...`);
                    continue;
                }
                console.warn(`⚠️ [THCS AI Parse] Gemini key ${i + 1} failed:`, errMsg);
                continue;
            }
        }

        return null;
    } catch (err) {
        console.warn('[callGeminiDirect] Failed:', err);
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
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
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

        // Classify types
        classifyQuestionTypes(sections);

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



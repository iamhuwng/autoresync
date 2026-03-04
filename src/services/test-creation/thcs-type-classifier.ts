/**
 * THCS Type Classifier — Instruction-to-Type Classification (Layer 2)
 *
 * Extracted from thcsDocumentParser.service.ts for testability and clarity.
 *
 * Three-phase classification:
 *   Phase 0: Explicit [TYPE: xxx] tags from AI
 *   Phase 1: Instruction text regex matching
 *   Phase 2: Content-based reclassification
 */

import type { THCSQuestionType } from '../../types/thcs-test.types';
import type { ParsedSection, AmbiguousItem } from './thcsDocumentParser.service';

// ── Reclassification Event (for diagnostic logging) ──

export interface ReclassificationEvent {
    sectionName: string;
    from: string;
    to: string;
    reason: string;
    questionNumbers: number[];
}

// ── Instruction-to-Type Classifier (Layer 2) ──

export const INSTRUCTION_TYPE_MAP: Array<{ pattern: RegExp; type: THCSQuestionType; confidence: number }> = [
    // ── Highest confidence: specific instruction keywords (95+) ──
    // word-stress MUST outrank pronunciation — instruction "stress pattern" is the differentiator
    { pattern: /stress|trọng âm|nhấn|position.*primary.*stress/i, type: 'word-stress', confidence: 97 },
    { pattern: /pronunciation|phát âm|underlined.*part.*(?:pronounced|differs)/i, type: 'pronunciation', confidence: 95 },
    { pattern: /error.*(?:correction|identification)|(?:tìm|sửa).*lỗi|underlined.*part.*(?:needs|that).*correction/i, type: 'error-identification', confidence: 92 },
    { pattern: /opposite.*meaning|trái.*nghĩa|OPPOSITE.*meaning/i, type: 'antonym-mcq', confidence: 92 },
    // ── closest-meaning MUST outrank synonym — "closest in meaning to the original sentence" is the differentiator
    // These patterns check for sentence-level paraphrase indicators first.
    { pattern: /closest.*meaning.*(?:to|of).*(?:the|each|original).*sentence|sentence.*closest.*meaning|câu.*gần.*nghĩa/i, type: 'closest-meaning', confidence: 93 },
    { pattern: /sentence.*transformation|paraphras/i, type: 'closest-meaning', confidence: 90 },
    // Word-level synonym/antonym (no "sentence" indicator)
    { pattern: /synonym|closest.*meaning|CLOSEST.*meaning|gần.*nghĩa/i, type: 'synonym-mcq', confidence: 90 },
    // ── Sentence arrangement / from cues MUST outrank generic grammar (88-89) ──
    // "Put sentences in correct order", "sentence made from given cues"
    { pattern: /put.*(?:sentence|word).*(?:in|into).*(?:correct|right).*order|correct.*order|sắp.*xếp.*(?:câu|từ)/i, type: 'sentence-arrangement', confidence: 88 },
    { pattern: /sentence.*(?:made|formed|built).*(?:from|given|following).*cue|(?:from|given).*cue/i, type: 'sentence-arrangement', confidence: 88 },
    { pattern: /arrange|sắp.*xếp|correct.*arrangement|meaningful.*paragraph/i, type: 'sentence-arrangement', confidence: 88 },
    // ── Specific form patterns MUST outrank generic grammar/vocabulary (88-89) ──
    { pattern: /verb\s*form|chia.*động|correct.*form.*verb|form.*of.*verb/i, type: 'verb-form', confidence: 89 },
    { pattern: /word\s*form|dạng.*từ|correct.*form.*word|form.*of.*word.*(?:capital|CAPITAL)/i, type: 'word-form', confidence: 89 },
    // ── Medium confidence (80-87) ──
    { pattern: /grammar|ngữ pháp|tense|thì|correct.*answer.*(?:complete|following)/i, type: 'mcq-grammar', confidence: 85 },
    { pattern: /vocabulary|từ vựng/i, type: 'mcq-vocabulary', confidence: 85 },
    { pattern: /communication|giao tiếp|dialogue|exchange|suitable.*response/i, type: 'dialogue-response', confidence: 85 },
    // keyword MUST outrank generic rewrite — "using the word" is the differentiator
    { pattern: /keyword|từ.*khóa|using.*(?:given\s*)?word/i, type: 'sentence-rewrite-keyword', confidence: 83 },
    { pattern: /rewrite|viết.*lại/i, type: 'sentence-rewrite', confidence: 80 },
    // reading-comprehension: "Read the passage and choose" or "passage + answer/question"
    { pattern: /read\b.*(?:the|following)?\s*(?:passage|text).*(?:answer|choose|question)|reading.*(?:passage|comprehension)|đọc.*hiểu|passage.*(?:mark|answer|question)/i, type: 'reading-comprehension', confidence: 80 },
    { pattern: /announcement|thông báo|advertisement|notice|sign/i, type: 'reading-announcement', confidence: 80 },
    { pattern: /word.*(?:in|from).*(?:box|bank)|(?:box|bank).*(?:to|and).*fill/i, type: 'reading-cloze-wordbank', confidence: 83 },
    // ── Lower confidence (70-79) ──
    { pattern: /cloze|fill.*blank|điền.*trống|numbered.*blank/i, type: 'reading-cloze-mcq', confidence: 75 },
    { pattern: /reference|tham.*chiếu|pronoun|word.*refers.*to/i, type: 'word-reference', confidence: 75 },
    { pattern: /sign|notice|biển.*báo/i, type: 'mcq-sign-notice', confidence: 75 },
];

// ── Valid types for [TYPE: xxx] tag extraction ──
const VALID_TYPE_TAGS: Set<string> = new Set([
    'pronunciation', 'word-stress', 'mcq-grammar', 'mcq-vocabulary',
    'mcq-sign-notice', 'dialogue-response', 'reading-cloze-mcq',
    'reading-comprehension', 'reading-announcement', 'sentence-arrangement',
    'closest-meaning', 'error-identification', 'synonym-mcq', 'antonym-mcq',
    'word-reference', 'verb-form', 'word-form', 'reading-cloze-wordbank',
    'sentence-rewrite', 'sentence-rewrite-keyword',
]);

/**
 * Extract explicit [TYPE: xxx] tag from instruction text.
 * The v2 prompt outputs these tags to remove classification ambiguity.
 * Returns the type string if valid, otherwise null.
 */
export function extractExplicitTypeTag(instruction: string): THCSQuestionType | null {
    const match = instruction.match(/\[TYPE:\s*([a-z][a-z0-9-]*)\s*\]/i);
    if (match) {
        const tag = match[1]!.toLowerCase().trim();
        if (VALID_TYPE_TAGS.has(tag)) return tag as THCSQuestionType;
    }
    return null;
}

export function classifyQuestionTypes(sections: ParsedSection[]): AmbiguousItem[] {
    const ambiguous: AmbiguousItem[] = [];

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i]!;

        // ── Phase 0: Explicit [TYPE: xxx] tag — highest authority (confidence 99) ──
        // The v2 prompt adds [TYPE: reading-cloze-mcq] etc. to every sub-section.
        // If present and valid, skip all regex classification.
        const instructionOnly = (section.instructionText || '').trim();
        const explicitType = extractExplicitTypeTag(instructionOnly);
        if (explicitType) {
            section.detectedType = explicitType;
            section.typeConfidence = 99;
            for (const q of section.questions) {
                q.type = explicitType;
            }
            continue; // No ambiguity — skip regex classification entirely
        }

        // ── Instruction-first classification strategy ──
        // Specific instruction keywords ("stress", "verb form", "using the word")
        // MUST win over generic section name keywords ("GRAMMAR", "PRONUNCIATION").
        // Strategy: classify instructionText alone first. If confident (≥80),
        // use that result. Otherwise, fall back to combined text.
        const combinedText = [section.instructionText, section.name].filter(Boolean).join(' ');

        if (!combinedText.trim()) {
            section.detectedType = 'mcq-grammar';
            section.typeConfidence = 60;
            ambiguous.push({
                id: `section-${i}`,
                sectionIndex: i,
                instructionText: section.name,
                currentType: 'mcq-grammar',
                confidence: 60,
            });
            continue;
        }

        // Phase 1: Try instruction text ONLY (avoids section name pollution)
        let bestMatch: { type: THCSQuestionType; confidence: number } | null = null;
        if (instructionOnly) {
            for (const mapping of INSTRUCTION_TYPE_MAP) {
                if (mapping.pattern.test(instructionOnly)) {
                    if (!bestMatch || mapping.confidence > bestMatch.confidence) {
                        bestMatch = { type: mapping.type, confidence: mapping.confidence };
                    }
                }
            }
        }

        // Phase 2: If instruction-only didn't produce a confident match, try combined
        if (!bestMatch || bestMatch.confidence < 80) {
            for (const mapping of INSTRUCTION_TYPE_MAP) {
                if (mapping.pattern.test(combinedText)) {
                    if (!bestMatch || mapping.confidence > bestMatch.confidence) {
                        bestMatch = { type: mapping.type, confidence: mapping.confidence };
                    }
                }
            }
        }

        if (bestMatch) {
            section.detectedType = bestMatch.type;
            section.typeConfidence = bestMatch.confidence;

            // Update question types in the section
            for (const q of section.questions) {
                q.type = bestMatch.type;
            }

            if (bestMatch.confidence < 75) {
                ambiguous.push({
                    id: `section-${i}`,
                    sectionIndex: i,
                    instructionText: combinedText,
                    currentType: bestMatch.type,
                    confidence: bestMatch.confidence,
                });
            }
        } else {
            section.detectedType = 'mcq-grammar';
            section.typeConfidence = 60;
            ambiguous.push({
                id: `section-${i}`,
                sectionIndex: i,
                instructionText: combinedText,
                currentType: 'mcq-grammar',
                confidence: 60,
            });
        }
    }

    return ambiguous;
}

/**
 * Content-based reclassification — Phase 3 of type detection.
 * Runs AFTER instruction-based classification to correct misclassified sections
 * by analyzing actual question content and option patterns.
 *
 * This handles cases where the instruction text is generic (e.g. "Choose the best answer")
 * but the content reveals the true question type.
 */
export function reclassifyByContent(sections: ParsedSection[]): ReclassificationEvent[] {
    const events: ReclassificationEvent[] = [];

    for (const section of sections) {
        // Only reclassify low-confidence or generic mcq-grammar results
        if (section.typeConfidence >= 90) continue;

        const questions = section.questions;
        if (questions.length === 0) continue;

        const qNums = questions.map(q => q.questionNumber);

        // ── Pattern 1: Ordering options (sentence-arrangement) ──
        // Options contain letter-dash patterns like "a-b-c-d-e", "b-a-c-e-d"
        const hasOrderingOptions = questions.some(q => {
            const opts = q.options || [];
            return opts.some((opt: string) => /^[a-e](?:-[a-e]){2,}$/i.test(opt.trim()));
        });
        if (hasOrderingOptions && section.detectedType !== 'sentence-arrangement') {
            const from = section.detectedType;
            console.log(`[reclassifyByContent] "${section.name}" → sentence-arrangement (ordering options detected)`);
            section.detectedType = 'sentence-arrangement';
            section.typeConfidence = 88;
            for (const q of questions) q.type = 'sentence-arrangement';
            events.push({ sectionName: section.name, from, to: 'sentence-arrangement', reason: 'ordering options detected', questionNumbers: qNums });
            continue;
        }

        // ── Pattern 2: Word cues / sentence from cues (sentence-arrangement) ──
        // Question text contains "word / word / word" pattern (cue-based sentence building)
        const hasCuePattern = questions.some(q => {
            const text = q.text || '';
            // Typical cue format: "How / far / it / your house / the airport?"
            // At least 3 segments separated by " / "
            const segments = text.split(/\s*\/\s*/);
            return segments.length >= 3 && text.length < 200;
        });
        if (hasCuePattern && section.detectedType === 'mcq-grammar') {
            const from = section.detectedType;
            console.log(`[reclassifyByContent] "${section.name}" → sentence-arrangement (cue pattern detected)`);
            section.detectedType = 'sentence-arrangement';
            section.typeConfidence = 85;
            for (const q of questions) q.type = 'sentence-arrangement';
            events.push({ sectionName: section.name, from, to: 'sentence-arrangement', reason: 'cue pattern detected', questionNumbers: qNums });
            continue;
        }

        // ── Pattern 3: Reading comprehension (passage + MCQ about passage) ──
        // Section has passage text AND questions with options that ask about the passage
        if (section.passageText && section.passageText.length > 100 && section.detectedType === 'mcq-grammar') {
            // Check if questions reference the passage content (comprehension indicators)
            const hasComprehensionIndicators = questions.some(q => {
                const text = (q.text || '').toLowerCase();
                return /\b(?:according to|what|when|where|which|who|why|how|the (?:passage|text|author|writer))\b/i.test(text);
            });
            if (hasComprehensionIndicators) {
                const from = section.detectedType;
                console.log(`[reclassifyByContent] "${section.name}" → reading-comprehension (passage + comprehension questions)`);
                section.detectedType = 'reading-comprehension';
                section.typeConfidence = 82;
                for (const q of questions) q.type = 'reading-comprehension';
                events.push({ sectionName: section.name, from, to: 'reading-comprehension', reason: 'passage + comprehension questions', questionNumbers: qNums });
                continue;
            }
        }

        // ── Pattern 4: Closest-meaning reclassification ──
        // If classified as synonym-mcq but options are full sentences (not single words),
        // this is actually closest-meaning (sentence paraphrase)
        if (section.detectedType === 'synonym-mcq') {
            const hasFullSentenceOptions = questions.every(q => {
                const opts = q.options || [];
                // Full sentences typically have 5+ words and end with punctuation
                return opts.filter((o: string) => o.trim().length > 0).every(
                    (o: string) => o.split(/\s+/).length >= 5 || /[.!?]$/.test(o.trim())
                );
            });
            if (hasFullSentenceOptions) {
                const from = section.detectedType;
                console.log(`[reclassifyByContent] "${section.name}" → closest-meaning (full sentence options)`);
                section.detectedType = 'closest-meaning';
                section.typeConfidence = 88;
                for (const q of questions) q.type = 'closest-meaning';
                events.push({ sectionName: section.name, from, to: 'closest-meaning', reason: 'full sentence options', questionNumbers: qNums });
                continue;
            }
        }

        // ── Pattern 5: sentence-rewrite + 4 MCQ options + A-D answer → closest-meaning ──
        // Vietnamese D2: AI misclassifies MCQ sentence-transformation as 'sentence-rewrite'.
        // All questions having 4 non-empty options + single A-D answer is the tell.
        if (
            (section.detectedType === 'sentence-rewrite' || section.detectedType === 'sentence-rewrite-keyword') &&
            questions.length > 0 &&
            questions.every(q => {
                const opts = q.options || [];
                const hasOpts = opts.filter((o: string) => o && o.trim().length > 0).length === 4;
                const hasValidAnswer = /^[A-Da-d]$/.test(q.correctAnswer || '');
                return hasOpts && hasValidAnswer;
            })
        ) {
            const from = section.detectedType;
            console.log(`[reclassifyByContent] Pattern 5: "${section.name}" ${section.detectedType} → closest-meaning (MCQ sentence transformation)`);
            section.detectedType = 'closest-meaning';
            section.typeConfidence = 88;
            for (const q of questions) q.type = 'closest-meaning';
            events.push({ sectionName: section.name, from, to: 'closest-meaning', reason: 'MCQ sentence transformation', questionNumbers: qNums });
            continue;
        }

        // ── Pattern 6: reading-cloze-mcq + word-bank instruction → reading-cloze-wordbank ──
        // AI sometimes classifies word-bank fill-in sections as reading-cloze-mcq and
        // hallucinates A/B/C/D options. Word-bank markers in instruction/passage are the tell.
        if (section.detectedType === 'reading-cloze-mcq') {
            const hasWordBankMarker =
                /word(?:s)?\s+(?:in|from)\s+(?:the\s+)?(?:box|bank)|fill\s+in.*\bbox\b|\bword\s+bank\b|\[word\s*bank\s*[:\uff1a]/i
                    .test(section.instructionText || '') ||
                /\[word\s*bank\s*[:\uff1a]/i.test((section as any).passageText || '');

            if (hasWordBankMarker) {
                const from = section.detectedType;
                console.log(`[reclassifyByContent] Pattern 6: "${section.name}" reading-cloze-mcq → reading-cloze-wordbank (word bank detected)`);
                section.detectedType = 'reading-cloze-wordbank';
                section.typeConfidence = 85;
                for (const q of questions) {
                    q.type = 'reading-cloze-wordbank';
                    // Strip hallucinated MCQ options — word bank = fill-in, not A/B/C/D
                    q.options = ['', '', '', ''] as [string, string, string, string];
                }
                events.push({ sectionName: section.name, from, to: 'reading-cloze-wordbank', reason: 'word bank detected', questionNumbers: qNums });
                continue;
            }
        }
    }

    return events;
}

/**
 * THCS Engine Enhancements — FR-14/16/17/18/19
 *
 * Post-processing steps that run on the output of thcs-draft-converter.
 * Operates on draft sections AFTER conversion, BEFORE returning to caller.
 *
 * Pipeline role: "The Grunt's finishing touches"
 *   1. consumeAITags — extract [AI-INFERRED], [UNCERTAIN], [COMPROMISED]
 *   2. applyPointAllocation — (N điểm) → per-section points
 *   3. replaceInstructions — type slug → template lookup (deterministic)
 *   4. sortSectionsByCurriculum — Vietnamese exam convention
 *   5. stripDisplayTags — final cleanup of pipeline-internal markers
 *   6. validateParsedOutput — quality checks → warnings[]
 */

import { ALL_INSTRUCTION_TEMPLATES } from '../../types/thcs-test.types';
import type { THCSQuestionType, THCSSection, THCSQuestion } from '../../types/thcs-test.types';

// ── Types ─────────────────────────────────────────────────────

export interface PostParseWarning {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    sectionIndex?: number;
    questionNumber?: number;
}

export interface AITagStats {
    inferredCount: number;
    uncertainCount: number;
    compromisedSections: { sectionIndex: number; originalType: string; convertedType: string }[];
}

export interface EnhancementResult {
    sections: THCSSection[];
    warnings: PostParseWarning[];
    tagStats: AITagStats;
}

// ── 1. AI Tag Consumption (FR-14) ─────────────────────────────

const AI_INFERRED_RE = /\[AI-INFERRED\]/gi;
const UNCERTAIN_RE = /\[UNCERTAIN\]/gi;
const COMPROMISED_RE = /\[COMPROMISED:\s*([^\]→]+)\s*→\s*([^\]]+)\]/gi;

/**
 * Scan all text fields for AI pipeline tags, extract metadata, strip tags.
 */
export function consumeAITags(sections: THCSSection[]): AITagStats {
    const stats: AITagStats = {
        inferredCount: 0,
        uncertainCount: 0,
        compromisedSections: [],
    };

    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si]!;

        // Check section-level fields (name, instructionText)
        if (COMPROMISED_RE.test(sec.name)) {
            const m = sec.name.match(COMPROMISED_RE);
            if (m) {
                // Reset lastIndex for global regex
                COMPROMISED_RE.lastIndex = 0;
                const match = COMPROMISED_RE.exec(sec.name);
                if (match) {
                    stats.compromisedSections.push({
                        sectionIndex: si,
                        originalType: match[1]!.trim(),
                        convertedType: match[2]!.trim(),
                    });
                }
                COMPROMISED_RE.lastIndex = 0;
            }
            sec.name = sec.name.replace(COMPROMISED_RE, '').trim();
            COMPROMISED_RE.lastIndex = 0;
        }

        // Check passage content
        if (sec.passage?.content) {
            if (UNCERTAIN_RE.test(sec.passage.content)) {
                stats.uncertainCount += (sec.passage.content.match(UNCERTAIN_RE) || []).length;
                sec.passage.content = sec.passage.content.replace(UNCERTAIN_RE, '').trim();
            }
            UNCERTAIN_RE.lastIndex = 0;
        }

        // Check questions
        for (const q of sec.questions) {
            // Check questionText
            if (q.questionText) {
                if (AI_INFERRED_RE.test(q.questionText)) {
                    stats.inferredCount += (q.questionText.match(AI_INFERRED_RE) || []).length;
                    q.questionText = q.questionText.replace(AI_INFERRED_RE, '').trim();
                }
                AI_INFERRED_RE.lastIndex = 0;

                if (UNCERTAIN_RE.test(q.questionText)) {
                    stats.uncertainCount += (q.questionText.match(UNCERTAIN_RE) || []).length;
                    q.questionText = q.questionText.replace(UNCERTAIN_RE, '').trim();
                }
                UNCERTAIN_RE.lastIndex = 0;
            }

            // Check correctAnswer
            if (typeof q.correctAnswer === 'string') {
                if (AI_INFERRED_RE.test(q.correctAnswer)) {
                    stats.inferredCount++;
                    (q as any).answerSource = 'ai-inferred';
                    q.correctAnswer = q.correctAnswer.replace(AI_INFERRED_RE, '').trim() as THCSQuestion['correctAnswer'];
                }
                AI_INFERRED_RE.lastIndex = 0;
            }

            // Check options
            if (q.options) {
                q.options = q.options.map(opt => {
                    let cleaned = opt;
                    if (AI_INFERRED_RE.test(cleaned)) {
                        stats.inferredCount++;
                        cleaned = cleaned.replace(AI_INFERRED_RE, '').trim();
                    }
                    AI_INFERRED_RE.lastIndex = 0;
                    return cleaned;
                }) as [string, string, string, string];
            }
        }
    }

    return stats;
}

// ── 2. Point Allocation (FR-18) ───────────────────────────────

const POINT_REGEX = /\((\d+(?:\.\d+)?)\s*điểm\)/i;

/**
 * Extract point value from section name: "(2 điểm)" → 2
 */
export function extractPointAllocation(sectionName: string): number | null {
    const m = sectionName.match(POINT_REGEX);
    return m ? parseFloat(m[1]!) : null;
}

/**
 * Apply explicit point allocation from section names.
 * Fallback: 10 / totalQuestions for equal distribution.
 */
export function applyPointAllocation(sections: THCSSection[], totalQuestions: number): void {
    for (const sec of sections) {
        const points = extractPointAllocation(sec.name);
        if (points !== null) {
            sec.totalPoints = points;
            sec.pointMode = 'auto';
            // Per-question = sectionPoints / questionCount
            if (sec.questions.length > 0) {
                const perQ = points / sec.questions.length;
                sec.questions.forEach(q => { q.points = perQ; });
            }
        } else if (totalQuestions > 0) {
            // Default fallback: equal distribution across all questions
            const perQ = 10 / totalQuestions;
            sec.questions.forEach(q => { q.points = perQ; });
            sec.totalPoints = perQ * sec.questions.length;
        }
    }
}

// ── 3. Instruction Replacement (FR-17) ────────────────────────

/**
 * Replace instruction text with template based on question type.
 * Only replaces if teacher has NOT customized (isCustomInstruction === false).
 */
export function replaceInstructions(sections: THCSSection[]): void {
    for (const sec of sections) {
        if (sec.isCustomInstruction) continue;

        // Determine section type from first question or defaultQuestionType
        const sectionType = (sec as any).defaultQuestionType as THCSQuestionType | undefined
            || sec.questions[0]?.type;

        if (!sectionType) continue;

        const template = ALL_INSTRUCTION_TEMPLATES[sectionType];
        if (template) {
            sec.instructionText = template;
        }
    }
}

// ── 4. Curriculum Ordering (FR-16) ────────────────────────────

/** Standard Vietnamese THCS exam section order. */
export const CURRICULUM_ORDER: Record<string, number> = {
    'pronunciation': 1,
    'word-stress': 2,
    'mcq-grammar': 3,
    'mcq-vocabulary': 3,
    'mcq-sign-notice': 3,
    'dialogue-response': 3,
    'error-identification': 3,
    'synonym-mcq': 3,
    'antonym-mcq': 3,
    'closest-meaning': 3,
    'verb-form': 4,
    'word-form': 4,
    'reading-cloze-wordbank': 4,
    'reading-announcement': 5,
    'reading-comprehension': 5,
    'reading-cloze-mcq': 5,
    'word-reference': 5,
    'sentence-arrangement': 6,
    'sentence-rewrite': 6,
    'sentence-rewrite-keyword': 6,
};

/**
 * Sort sections by Vietnamese curriculum convention.
 * Stable sort: unknown types preserve original relative order.
 */
export function sortSectionsByCurriculum(sections: THCSSection[]): THCSSection[] {
    const FALLBACK_ORDER = 99;

    return [...sections].sort((a, b) => {
        const typeA = (a as any).defaultQuestionType || a.questions[0]?.type || '';
        const typeB = (b as any).defaultQuestionType || b.questions[0]?.type || '';
        const orderA = CURRICULUM_ORDER[typeA] ?? FALLBACK_ORDER;
        const orderB = CURRICULUM_ORDER[typeB] ?? FALLBACK_ORDER;

        if (orderA !== orderB) return orderA - orderB;
        // Same priority → preserve original order
        return a.order - b.order;
    });
}

// ── 5. Display Tag Stripping (FR-14, FR-17) ───────────────────

/** Patterns for pipeline-internal tags that must not leak to UI. */
const PIPELINE_TAGS = [
    /\[TYPE:\s*[^\]]*\]/gi,
    /\[STATS:\s*[^\]]*\]/gi,
    /\[AI-INFERRED\]/gi,
    /\[UNCERTAIN\]/gi,
    /\[AI-GENERATED\]/gi,
    /\[COMPROMISED:\s*[^\]]*\]/gi,
    /\[WORD BANK:\s*[^\]]*\]/gi,
    /\[MANUAL-REVIEW\]/gi,
    /\[CONFIDENCE:\s*\d+\]/gi,
    /\(\d+(?:\.\d+)?\s*điểm\)/gi,
];

function stripTags(text: string): string {
    let cleaned = text;
    for (const pattern of PIPELINE_TAGS) {
        cleaned = cleaned.replace(pattern, '');
        pattern.lastIndex = 0;
    }
    return cleaned.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Strip all pipeline-internal tags from display text fields.
 */
export function stripDisplayTags(sections: THCSSection[]): void {
    for (const sec of sections) {
        sec.name = stripTags(sec.name);
        sec.instructionText = stripTags(sec.instructionText);

        if (sec.passage?.content) {
            sec.passage.content = stripTags(sec.passage.content);
        }
        if (sec.passage?.title) {
            sec.passage.title = stripTags(sec.passage.title);
        }

        for (const q of sec.questions) {
            q.questionText = stripTags(q.questionText);
            q.options = q.options.map(opt => stripTags(opt)) as [string, string, string, string];
            if (q.underlinedParts) { q.underlinedParts = stripTags(q.underlinedParts); }
            if (q.originalSentence) { q.originalSentence = stripTags(q.originalSentence); }
            if (q.sentenceStarter) { q.sentenceStarter = stripTags(q.sentenceStarter); }
            if (q.sentenceTemplate) { q.sentenceTemplate = stripTags(q.sentenceTemplate); }
        }
    }
}

// ── 6. Post-Parse Validation (FR-19) ──────────────────────────

/**
 * Validate parsed output, returning warnings (not errors — pipeline should not crash).
 */
export function validateParsedOutput(sections: THCSSection[]): PostParseWarning[] {
    const warnings: PostParseWarning[] = [];

    const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

    // ZERO_QUESTIONS
    if (totalQuestions === 0) {
        warnings.push({ severity: 'error', code: 'ZERO_QUESTIONS', message: 'No questions found in any section' });
    }

    // Per-section checks
    for (let si = 0; si < sections.length; si++) {
        const sec = sections[si]!;
        const type = (sec as any).defaultQuestionType as string || '';

        // NUMBERING_GAP
        for (let qi = 1; qi < sec.questions.length; qi++) {
            const prev = sec.questions[qi - 1]!.questionNumber;
            const curr = sec.questions[qi]!.questionNumber;
            if (curr !== prev + 1 && curr > prev) {
                warnings.push({
                    severity: 'warning', code: 'NUMBERING_GAP',
                    message: `Gap in question numbering: Q${prev} → Q${curr}`,
                    sectionIndex: si, questionNumber: curr,
                });
            }
        }

        // MISSING_ANSWER per question
        for (const q of sec.questions) {
            const answerStr = q.correctAnswer as string;
            const hasAnswer = answerStr && answerStr.trim() !== '' && answerStr !== '?';
            const isAIInferred = (q as any).answerSource === 'ai-inferred';
            const isWriting = type.startsWith('sentence-');
            if (!hasAnswer && !isAIInferred && !isWriting) {
                warnings.push({
                    severity: 'warning', code: 'MISSING_ANSWER',
                    message: `Question ${q.questionNumber} has no answer`,
                    sectionIndex: si, questionNumber: q.questionNumber,
                });
            }
        }

        // READING_NO_PASSAGE
        const isReading = type.startsWith('reading-');
        if (isReading && (!sec.passage?.content || sec.passage.content.trim() === '')) {
            warnings.push({
                severity: 'warning', code: 'READING_NO_PASSAGE',
                message: `Reading section "${sec.name}" has empty passage`,
                sectionIndex: si,
            });
        }

        // CLOZE_NO_BLANKS
        if (type === 'reading-cloze-wordbank') {
            const hasBlankMapping = sec.questions.some(q => q.blankMapping && Object.keys(q.blankMapping).length > 0);
            if (!hasBlankMapping) {
                warnings.push({
                    severity: 'warning', code: 'CLOZE_NO_BLANKS',
                    message: `Cloze section "${sec.name}" has no blank mappings`,
                    sectionIndex: si,
                });
            }
        }

        // WRITING_NO_ARROW
        const isWriting = type === 'sentence-rewrite' || type === 'sentence-rewrite-keyword';
        if (isWriting) {
            for (const q of sec.questions) {
                if (!q.originalSentence && !q.sentenceStarter) {
                    warnings.push({
                        severity: 'warning', code: 'WRITING_NO_ARROW',
                        message: `Writing Q${q.questionNumber} missing originalSentence/sentenceStarter`,
                        sectionIndex: si, questionNumber: q.questionNumber,
                    });
                }
            }
        }
    }

    return warnings;
}

// ── Orchestrator ──────────────────────────────────────────────

/**
 * Run all engine enhancements in correct order.
 * Called after thcs-draft-converter produces the initial draft.
 */
export function runEngineEnhancements(
    sections: THCSSection[],
    totalQuestions: number,
): EnhancementResult {
    // 1. Extract AI tags first (before any text modification)
    const tagStats = consumeAITags(sections);

    // 2. Apply point allocation from (N điểm) markers
    applyPointAllocation(sections, totalQuestions);

    // 3. Replace instructions with templates (after type finalization)
    replaceInstructions(sections);

    // 4. Sort by curriculum order
    const sortedSections = sortSectionsByCurriculum(sections);

    // 5. Update order indices after sort
    sortedSections.forEach((sec, i) => { sec.order = i; });

    // 6. Strip all pipeline-internal tags from display text
    stripDisplayTags(sortedSections);

    // 7. Validate output
    const warnings = validateParsedOutput(sortedSections);

    return { sections: sortedSections, warnings, tagStats };
}

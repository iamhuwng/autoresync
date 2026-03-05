/**
 * THCS Answer Inference — Stage 5.5
 *
 * Dedicated AI step that runs ONLY when the regex engine found 0 answers.
 * Sends just the questions + options (no passage text) to Gemini Flash,
 * asks it to solve the English MCQs, and returns an answer key.
 *
 * Design rationale:
 *   - Extracted from Pass 1 (where it was task 7) because answer inference
 *     requires a completely different cognitive skill (solving English questions)
 *     vs text restructuring.
 *   - Triggered by deterministic code check (answeredCount === 0), not by
 *     AI prompt compliance.
 *   - Uses Gemini Flash for better English comprehension than Groq Llama.
 */

import type { ParsedSection } from './thcsDocumentParser.service';

// ── Types ─────────────────────────────────────────────────────

export interface InferredAnswer {
    questionNumber: number;
    answer: string;
    confidence: 'high' | 'medium' | 'low';
}

export interface AnswerInferenceResult {
    answers: InferredAnswer[];
    totalAttempted: number;
    totalInferred: number;
}

// ── Prompt ────────────────────────────────────────────────────

const SYSTEM_MESSAGE = 'You are an expert English teacher grading a Vietnamese THCS (junior high school) English test. Answer each multiple-choice question accurately.';

function buildInferencePrompt(sections: ParsedSection[]): string {
    const lines: string[] = [];
    lines.push('Below are multiple-choice questions from a Vietnamese THCS English test.');
    lines.push('For each question, identify the CORRECT answer (A, B, C, or D).');
    lines.push('');
    lines.push('Output format — one line per question, nothing else:');
    lines.push('  <number>. <letter> [<confidence>]');
    lines.push('  confidence = HIGH | MEDIUM | LOW');
    lines.push('');
    lines.push('Example output:');
    lines.push('  1. B [HIGH]');
    lines.push('  2. A [MEDIUM]');
    lines.push('  3. C [HIGH]');
    lines.push('');
    lines.push('RULES:');
    lines.push('- Only answer questions that have A/B/C/D options');
    lines.push('- If you cannot determine the answer, output: <number>. ? [LOW]');
    lines.push('- Do NOT add explanations or commentary — only the answer lines');
    lines.push('');
    lines.push('--- QUESTIONS ---');
    lines.push('');

    let questionCount = 0;
    for (const section of sections) {
        // Include section context for reading comprehension / cloze
        if (section.passageText) {
            lines.push(`[Context: ${section.name}]`);
            // Include at most 500 chars of passage to keep prompt small
            const passagePreview = section.passageText.length > 500
                ? section.passageText.substring(0, 500) + '...'
                : section.passageText;
            lines.push(passagePreview);
            lines.push('');
        }

        for (const q of section.questions) {
            // Only attempt MCQ questions (those with options)
            if (!q.options || q.options.length < 2) continue;

            questionCount++;
            lines.push(`Question ${q.questionNumber}. ${q.text}`);
            for (const opt of q.options) {
                lines.push(`  ${opt}`);
            }
            lines.push('');
        }
    }

    if (questionCount === 0) {
        return ''; // No MCQ questions to infer
    }

    return lines.join('\n');
}

// ── Response Parser ───────────────────────────────────────────

function parseInferenceResponse(response: string): InferredAnswer[] {
    const answers: InferredAnswer[] = [];
    const lines = response.trim().split('\n');

    // Match lines like: "1. B [HIGH]" or "12. A [MEDIUM]" or "3. C"
    const answerLineRE = /^\s*(\d+)\.\s*([A-Da-d?])\s*(?:\[(\w+)\])?\s*$/;

    for (const line of lines) {
        const match = line.match(answerLineRE);
        if (!match) continue;

        const qNum = parseInt(match[1]!, 10);
        const letter = match[2]!.toUpperCase();
        const confStr = (match[3] || 'MEDIUM').toUpperCase();

        // Skip '?' answers (AI couldn't determine)
        if (letter === '?') continue;

        // Validate letter is A-D
        if (!['A', 'B', 'C', 'D'].includes(letter)) continue;

        const confidence: InferredAnswer['confidence'] =
            confStr === 'HIGH' ? 'high' :
                confStr === 'LOW' ? 'low' : 'medium';

        answers.push({ questionNumber: qNum, answer: letter, confidence });
    }

    return answers;
}

// ── Main Orchestrator ─────────────────────────────────────────

/**
 * Infer answers for MCQ questions when no answer key was found.
 *
 * @param sections  Parsed sections with questions (from regex engine)
 * @param callAI    AI callback — receives (systemMessage, prompt) → text or null
 * @returns InferredAnswer[] merged into result; empty if AI fails
 */
export async function executeAnswerInference(
    sections: ParsedSection[],
    callAI: (systemMessage: string, prompt: string) => Promise<string | null>,
): Promise<AnswerInferenceResult> {
    const emptyResult: AnswerInferenceResult = {
        answers: [],
        totalAttempted: 0,
        totalInferred: 0,
    };

    // Build prompt from MCQ questions
    const prompt = buildInferencePrompt(sections);
    if (!prompt) {
        console.log('[AnswerInference] No MCQ questions found — skipping');
        return emptyResult;
    }

    // Count how many MCQ questions we're attempting
    const totalMCQ = sections.reduce((sum, s) =>
        sum + s.questions.filter(q => q.options && q.options.length >= 2).length, 0);

    console.log(`[AnswerInference] Attempting to infer answers for ${totalMCQ} MCQ questions...`);

    try {
        const response = await callAI(SYSTEM_MESSAGE, prompt);
        if (!response || response.trim().length < 5) {
            console.warn('[AnswerInference] AI returned empty response — no answers inferred');
            return { ...emptyResult, totalAttempted: totalMCQ };
        }

        const answers = parseInferenceResponse(response);
        console.log(`[AnswerInference] ✅ Inferred ${answers.length}/${totalMCQ} answers`);

        return {
            answers,
            totalAttempted: totalMCQ,
            totalInferred: answers.length,
        };
    } catch (err) {
        console.warn('[AnswerInference] AI call failed:', err);
        return { ...emptyResult, totalAttempted: totalMCQ };
    }
}

/**
 * THCS Question Shuffling — Mã Đề (Phase 3, Task 6.1)
 *
 * Deterministic shuffle using seeded RNG (seedrandom).
 * Same student always sees the same order for the same test.
 * Different students see different orders.
 *
 * IMPORTANT: Student answers are stored by original question ID,
 * so grading uses the original answer key regardless of shuffle.
 */

import seedrandom from 'seedrandom';
import type { THCSTest, THCSSection, THCSQuestion } from '../types/thcs-test.types';

// ── Fisher-Yates Shuffle ──
// Standard in-place shuffle using a seeded RNG
export function fisherYatesShuffle<T>(array: T[], rng: () => number): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = result[i];
        result[i] = result[j]!;
        result[j] = temp!;
    }
    return result;
}

// ── Remap Answer Key ──
// Maps the correct answer letter to its new position after option shuffle.
// E.g., if answer was 'A' and option A moved to position C, returns 'C'.
export function remapAnswerKey(
    originalAnswer: string,
    originalOptions: string[],
    shuffledOptions: string[]
): string {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const answerIdx = letters.indexOf(originalAnswer.toUpperCase());
    if (answerIdx < 0 || answerIdx >= originalOptions.length) return originalAnswer;

    const answerContent = originalOptions[answerIdx] ?? '';
    const newIdx = shuffledOptions.indexOf(answerContent);
    if (newIdx < 0) return originalAnswer;

    return letters[newIdx] || originalAnswer;
}

// ── Shuffle Test ──
// Main function: creates a shuffled copy of the test for a specific student.
// Deterministic: same student + same test = same shuffle result.
export function shuffleTest(test: THCSTest, studentUid: string): THCSTest {
    const rng = seedrandom(studentUid + test.id);

    const shuffledSections = (test.sections || []).map((section: THCSSection) => {
        // Edge case (PRD §9 EC7): If section has 0-1 questions, skip shuffle
        if (!section.questions || section.questions.length <= 1) {
            return section;
        }

        // Only shuffle if section.shuffle === true
        if (!section.shuffle) {
            return section;
        }

        // Shuffle question order
        const shuffledQuestions = fisherYatesShuffle(section.questions, rng);

        // If shuffleOptions === true, also shuffle MCQ options within each question
        const processedQuestions = shuffledQuestions.map((q: THCSQuestion) => {
            if (!section.shuffleOptions) return q;

            // Only shuffle options for MCQ-type questions that have options
            if (!q.options || q.options.length <= 1) return q;
            const isMCQ = q.type?.startsWith('mcq') ||
                (q.options && q.options.length >= 2 && q.correctAnswer && q.correctAnswer.length === 1);

            if (!isMCQ) return q;

            const originalOptions = [...q.options];
            const shuffledOptions = fisherYatesShuffle(q.options, rng);

            // Remap correctAnswer to new position
            const newAnswer = q.correctAnswer
                ? remapAnswerKey(q.correctAnswer, originalOptions, shuffledOptions)
                : q.correctAnswer;

            return {
                ...q,
                options: shuffledOptions as [string, string, string, string],
                correctAnswer: newAnswer as 'A' | 'B' | 'C' | 'D',
            };
        });

        return {
            ...section,
            questions: processedQuestions,
        };
    });

    return {
        ...test,
        sections: shuffledSections,
    };
}

export default shuffleTest;

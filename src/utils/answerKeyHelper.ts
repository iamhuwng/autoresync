/**
 * Answer Key Obfuscation Helper — PRD-0036 Task 9
 *
 * FR-53: This is CLIENT-SIDE obfuscation only.
 * The answer keys are still fetched and processed on the client.
 * This prevents casual inspection of page source / React DevTools
 * but does NOT prevent a determined student from intercepting the
 * grading request. True server-side grading requires Cloud Functions
 * on the Blaze plan (deferred to future PRD).
 */

/**
 * Extract answer keys from a question array into a separate map.
 * The returned map is keyed by question ID; the value is the correct answer
 * in whatever form the question stores it (string, string[], etc.).
 */
export function extractAnswerKeys(
    questions: Array<Record<string, any>>
): Record<string, string | string[]> {
    const keys: Record<string, string | string[]> = {};

    for (const q of questions) {
        const id = q.id || q.questionId || q._id;
        if (!id) continue;

        // Support multiple field names used across the codebase
        const answer = q.correctAns ?? q.correctAnswer ?? q.answer;
        if (answer !== undefined && answer !== null) {
            keys[id] = answer;
        }
    }

    return keys;
}

/**
 * Strip answer keys from question objects so they are not visible
 * in React DevTools or page source inspection.
 *
 * Returns a new array — the originals are NOT mutated.
 */
export function stripAnswerKeys<T extends Record<string, any>>(
    questions: T[]
): T[] {
    return questions.map((q) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { correctAns, correctAnswer, answer, ...rest } = q;
        return rest as T;
    });
}

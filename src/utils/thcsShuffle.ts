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
import {
    splitReadingOptionLabel,
    type ReadingOptionDisplayValue,
} from './readingOptionDisplay';

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

/**
 * PRD-0036 Task 10.4: Convenience wrapper — deterministic shuffle with a
 * string seed. Consumers don't need to import seedrandom directly.
 */
export function shuffleArray<T>(array: T[], seed: string): T[] {
    const rng = seedrandom(seed);
    return fisherYatesShuffle(array, rng);
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

// ── IELTS-specific shuffle (PRD-0036 Task 10.5) ──

export interface IELTSShuffleOptions {
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    preserveCanonicalLabels?: boolean;
}

type IELTSOptionLike = ReadingOptionDisplayValue;

interface IELTSQuestionLike {
    id?: string | number;
    number?: string | number;
    type?: string;
    passageId?: string | null;
    summaryGroupId?: string | null;
    options?: IELTSOptionLike[];
    labeledOptions?: IELTSOptionLike[];
    sectionReferences?: Array<{ label?: string; title?: string; paragraph?: string }>;
    answer?: unknown;
}

const IELTS_NO_PASSAGE_ID = '__no_passage__';

const CANONICAL_LETTER_LABEL_PATTERN = /^\s*(?:\([A-Ha-h]\)|[A-Ha-h])(?:[.)]|\s+)\s*\S/;
const CANONICAL_ROMAN_LABEL_PATTERN = /^\s*(?:\((?:xiii|xii|xi|x|ix|viii|vii|vi|iv|iii|ii|i)\)|(?:xiii|xii|xi|x|ix|viii|vii|vi|iv|iii|ii|i))(?:[.)]|\s+)\s*\S/i;
const CANONICAL_NUMBER_LABEL_PATTERN = /^\s*(?:\(\d+\)|\d+)(?:[.)]|\s+)\s*\S/;

function hasCanonicalOptionLabel(option: IELTSOptionLike): boolean {
    if (typeof option !== 'string') {
        return Boolean(option.label?.trim());
    }

    const trimmed = option.trim();
    return CANONICAL_LETTER_LABEL_PATTERN.test(trimmed)
        || CANONICAL_ROMAN_LABEL_PATTERN.test(trimmed)
        || CANONICAL_NUMBER_LABEL_PATTERN.test(trimmed);
}

function hasCanonicalLabeledOptions(options?: IELTSOptionLike[]): boolean {
    return Boolean(options?.length && options.every(hasCanonicalOptionLabel));
}

function optionToComparableText(option: IELTSOptionLike): string {
    const split = splitReadingOptionLabel(option);
    return split.text || split.label || '';
}

function buildIELTSGroupKey(question: IELTSQuestionLike): string {
    return `${question.type ?? ''}::${question.summaryGroupId ?? ''}`;
}

function getIELTSQuestionGroups(questions: IELTSQuestionLike[]): IELTSQuestionLike[][] {
    if (!questions.length) return [];

    const groups: IELTSQuestionLike[][] = [];
    let currentGroup: IELTSQuestionLike[] = [questions[0]!];
    let currentPassageId = questions[0]?.passageId ?? IELTS_NO_PASSAGE_ID;
    let currentGroupKey = buildIELTSGroupKey(questions[0]!);

    for (let i = 1; i < questions.length; i++) {
        const question = questions[i];
        if (!question) continue;

        const passageId = question.passageId ?? IELTS_NO_PASSAGE_ID;
        const groupKey = buildIELTSGroupKey(question);

        if (passageId === currentPassageId && groupKey === currentGroupKey) {
            currentGroup.push(question);
            continue;
        }

        groups.push(currentGroup);
        currentGroup = [question];
        currentPassageId = passageId;
        currentGroupKey = groupKey;
    }

    groups.push(currentGroup);
    return groups;
}

function shuffleIELTSQuestionOrder(
    questions: IELTSQuestionLike[],
    studentUid: string,
    testId: string,
): IELTSQuestionLike[] {
    const groups = getIELTSQuestionGroups(questions);
    if (groups.length <= 1) return [...questions];

    const passageIds = groups.reduce<string[]>((result, group) => {
        const passageId = group[0]?.passageId ?? IELTS_NO_PASSAGE_ID;
        if (!result.includes(passageId)) {
            result.push(passageId);
        }
        return result;
    }, []);

    return passageIds.flatMap((passageId) => {
        const passageGroups = groups.filter(
            (group) => (group[0]?.passageId ?? IELTS_NO_PASSAGE_ID) === passageId,
        );

        if (passageGroups.length <= 1) {
            return passageGroups.flat();
        }

        return shuffleArray(
            passageGroups,
            `${studentUid}_${testId}_passage_${passageId}_groups`,
        ).flat();
    });
}

/**
 * Deterministic shuffle for IELTS-style tests (used by StudentTestPage).
 *
 * To keep IELTS task rendering coherent, question shuffling preserves
 * contiguous task blocks within each passage and only reorders those blocks.
 *
 * - `shuffleQuestions`: reorder task blocks within each passage
 * - `shuffleOptions`: for each MCQ question with `options[]`, shuffle the
 *   options and remap the `answer` field using remapAnswerKey.
 *
 * Seeds are derived from `studentUid + testId` so the same student always
 * sees the same order.
 */
export function shuffleIELTSTest(
    questions: any[],
    studentUid: string,
    testId: string,
    options: IELTSShuffleOptions
): any[] {
    if (!questions || questions.length === 0) return questions;

    let result = [...questions];

    // 1. Shuffle question order while preserving IELTS task-group coherence
    if (options.shuffleQuestions) {
        result = shuffleIELTSQuestionOrder(result, studentUid, testId);
    }

    // 2. Shuffle MCQ options per question
    if (options.shuffleOptions) {
        result = result.map(q => {
            if (
                options.preserveCanonicalLabels !== false
                && (
                    (Array.isArray(q.sectionReferences) && q.sectionReferences.length > 0)
                    || q.type === 'matching-information'
                    || hasCanonicalLabeledOptions(q.labeledOptions)
                    || (Array.isArray(q.labeledOptions) && q.labeledOptions.length > 0)
                    || hasCanonicalLabeledOptions(q.options)
                )
            ) {
                return q;
            }

            // Only shuffle if the question has MCQ-style options
            if (!q.options || !Array.isArray(q.options) || q.options.length <= 1) return q;

            const originalOptions = q.options.map(optionToComparableText);
            const shuffledOptions = shuffleArray<string>(
                q.options.map(optionToComparableText),
                `${studentUid}_${testId}_opt_${q.number ?? q.id ?? 'unknown'}`
            );

            // Remap the answer key to the new option positions
            const newAnswer = (typeof q.answer === 'string' && q.answer.length === 1)
                ? remapAnswerKey(q.answer, originalOptions, shuffledOptions)
                : q.answer;

            const nextQuestion = { ...q, options: shuffledOptions } as Record<string, any>;
            if ('answer' in q && newAnswer !== undefined) {
                nextQuestion.answer = newAnswer;
            }
            return nextQuestion;
        });
    }

    return result;
}

/**
 * Applies the deterministic IELTS presentation transform used on student pages.
 * The grading flow replays this against answer-bearing questions so shuffled
 * option letters still align with what the student actually saw.
 */
export function getIELTSQuestionsForStudent(
    questions: any[],
    studentUid: string | null | undefined,
    testId: string,
    options?: Partial<IELTSShuffleOptions> | null,
): any[] {
    if (!questions || questions.length === 0) {
        return questions ?? [];
    }

    const normalizedOptions: IELTSShuffleOptions = {
        shuffleQuestions: Boolean(options?.shuffleQuestions),
        shuffleOptions: Boolean(options?.shuffleOptions),
        preserveCanonicalLabels: options?.preserveCanonicalLabels !== false,
    };

    if (!studentUid || (!normalizedOptions.shuffleQuestions && !normalizedOptions.shuffleOptions)) {
        return [...questions];
    }

    return shuffleIELTSTest(questions, studentUid, testId, normalizedOptions);
}

/**
 * THCS-THPT Auto-Marking Service (Phase 2 Extended)
 * Auto-grading for all THCS-THPT question types: MCQ, Fill-in, Cloze, Writing
 *
 * 📌 Phase 3 forward reference (PRD §4.3.6 v1.4):
 * This function accepts sections and studentAnswers as INPUT PARAMETERS — it does NOT
 * hardcode any RTDB paths internally. In Phase 3, homework answers will be stored at
 * homework_submissions/{homeworkId}/{studentId}/ (NOT under game_sessions/).
 * Because the grading function is path-agnostic, it can be reused for both session
 * and homework grading without refactoring.
 */

import type {
    THCSSection,
    THCSGradingResult,
    SectionResult,
    QuestionResult,
    THCSQuestionType,
    BlankAnswer,
    BlankResult,
    WritingGradingResult,
    THCSGradingStatus,
} from '../types/thcs-test.types';
import { INSTRUCTION_TEMPLATES } from '../types/thcs-test.types';
import type { TestMarkingResult } from './autoMarking.service';

// ═══════════════════════════════════════════════════════════════
// Task 5.1: normalizeAnswer
// ═══════════════════════════════════════════════════════════════

/** Common English contractions map */
const CONTRACTIONS: Record<string, string> = {
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "won't": "will not", "wouldn't": "would not", "shouldn't": "should not",
    "couldn't": "could not", "can't": "cannot", "mustn't": "must not",
    "needn't": "need not", "shan't": "shall not",
    "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is",
    "it's": "it is", "we're": "we are", "they're": "they are",
    "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "i will", "you'll": "you will", "he'll": "he will", "she'll": "she will",
    "we'll": "we will", "they'll": "they will",
    "i'd": "i would", "you'd": "you would", "he'd": "he would", "she'd": "she would",
    "we'd": "we would", "they'd": "they would",
    "there's": "there is", "there're": "there are",
    "that's": "that is", "who's": "who is", "what's": "what is",
    "let's": "let us",
};

/**
 * Normalize an answer for comparison.
 * trim + lowercase + strip trailing punctuation + collapse spaces + handle contractions
 */
export function normalizeAnswer(answer: string): string {
    let s = answer.trim().toLowerCase();
    // Strip trailing punctuation
    s = s.replace(/[.,!?;:]+$/, '');
    // Collapse multiple spaces
    s = s.replace(/\s+/g, ' ');
    // Strip diacritics from ASCII-range characters (Vietnamese input on English words)
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
    // Expand contractions for comparison
    // Check if the entire answer is a contraction
    if (CONTRACTIONS[s]) {
        s = CONTRACTIONS[s]!;
    }
    return s;
}

// ═══════════════════════════════════════════════════════════════
// Task 5.2: gradeFillInQuestion
// ═══════════════════════════════════════════════════════════════

/**
 * Grade a fill-in question by comparing student answers to accepted answers per blank.
 */
export function gradeFillInQuestion(
    studentAnswers: string[],
    blankAnswers: BlankAnswer[],
    pointsPerBlank: number
): { pointsEarned: number; blankResults: BlankResult[] } {
    const blankResults: BlankResult[] = [];
    let pointsEarned = 0;

    for (let i = 0; i < blankAnswers.length; i++) {
        const studentAnswer = studentAnswers[i] || '';
        const blank = blankAnswers[i]!;
        const normalizedStudent = normalizeAnswer(studentAnswer);

        // Empty string → incorrect
        let isCorrect = false;
        if (normalizedStudent !== '') {
            isCorrect = blank.acceptedAnswers.some(
                accepted => normalizeAnswer(accepted) === normalizedStudent
            );
        }

        const earned = isCorrect ? pointsPerBlank : 0;
        pointsEarned += earned;

        blankResults.push({
            isCorrect,
            studentAnswer,
            correctAnswer: blank.acceptedAnswers[0] || '',
            pointsEarned: earned,
        });
    }

    return { pointsEarned, blankResults };
}

// ═══════════════════════════════════════════════════════════════
// Task 5.3: gradeClozeQuestion
// ═══════════════════════════════════════════════════════════════

/**
 * Grade a cloze (word bank) question by exact match (case-insensitive).
 */
export function gradeClozeQuestion(
    studentAnswers: string[],
    blankMapping: Record<number, string>,
    pointsPerBlank: number
): { pointsEarned: number; blankResults: BlankResult[] } {
    const blankResults: BlankResult[] = [];
    let pointsEarned = 0;

    const blankNumbers = Object.keys(blankMapping).map(Number).sort((a, b) => a - b);

    for (const blankNum of blankNumbers) {
        const correctWord = blankMapping[blankNum]!;
        const studentAnswer = studentAnswers[blankNum] || '';
        const isCorrect = normalizeAnswer(studentAnswer) === normalizeAnswer(correctWord);
        const earned = isCorrect ? pointsPerBlank : 0;
        pointsEarned += earned;

        blankResults.push({
            isCorrect,
            studentAnswer,
            correctAnswer: correctWord,
            pointsEarned: earned,
        });
    }

    return { pointsEarned, blankResults };
}

// ═══════════════════════════════════════════════════════════════
// Task 5.4 + 5.5: markThcsTest (extended for all question types)
// ═══════════════════════════════════════════════════════════════

/**
 * Grade a THCS-THPT test (all question types)
 *
 * @param testId - The test ID
 * @param studentId - The student ID
 * @param sections - Test sections with questions and correct answers
 * @param studentAnswers - Student's answers keyed by questionNumber (string | string[])
 * @returns THCSGradingResult with section breakdowns and grading status
 */
export function markThcsTest(
    testId: string,
    studentId: string,
    sections: THCSSection[],
    studentAnswers: Record<string, string | string[]>
): THCSGradingResult {
    let totalPointsEarned = 0;
    let totalMaxPoints = 0;
    let hasWritingQuestions = false;
    const sectionResults: SectionResult[] = [];
    const questionResults: Record<number, QuestionResult> = {};

    for (const section of sections) {
        let sectionPointsEarned = 0;
        let sectionPointsMax = 0;
        let sectionCorrectCount = 0;
        const intentBreakdown: Record<string, { correct: number; total: number }> = {};

        for (const question of section.questions) {
            // Calculate points for this question
            let questionMaxPoints: number;
            if (section.pointMode === 'manual' && question.points !== undefined) {
                questionMaxPoints = question.points;
            } else {
                // Auto mode: equally distributed
                questionMaxPoints = section.questions.length > 0
                    ? section.totalPoints / section.questions.length
                    : 0;
            }

            const qNum = String(question.questionNumber);
            const rawAnswer = studentAnswers[qNum];
            const isMCQ = question.type in INSTRUCTION_TEMPLATES;

            let qResult: QuestionResult;

            if (isMCQ) {
                // ─── MCQ grading (existing logic) ────────────────────
                const studentAnswer = typeof rawAnswer === 'string' ? rawAnswer : '';
                const isCorrect = studentAnswer === question.correctAnswer;
                const pointsEarned = isCorrect ? questionMaxPoints : 0;

                qResult = {
                    questionNumber: question.questionNumber,
                    isCorrect,
                    studentAnswer,
                    correctAnswer: question.correctAnswer,
                    pointsEarned,
                    pointsMax: questionMaxPoints,
                };
            } else if (question.type === 'verb-form' || question.type === 'word-form') {
                // ─── Fill-in grading ──────────────────────────────────
                const studentBlanks = Array.isArray(rawAnswer) ? rawAnswer : [];
                const blankAnswers = question.blankAnswers || [];
                const blankCount = blankAnswers.length || 1;
                const pointsPerBlank = questionMaxPoints / blankCount;

                const { pointsEarned, blankResults } = gradeFillInQuestion(
                    studentBlanks, blankAnswers, pointsPerBlank
                );
                const allCorrect = blankResults.every(r => r.isCorrect);

                qResult = {
                    questionNumber: question.questionNumber,
                    isCorrect: allCorrect,
                    studentAnswer: studentBlanks,
                    correctAnswer: blankAnswers.map(b => b.acceptedAnswers[0] || ''),
                    pointsEarned,
                    pointsMax: questionMaxPoints,
                    blankResults,
                };
            } else if (question.type === 'reading-cloze-wordbank') {
                // ─── Cloze grading ───────────────────────────────────
                const studentBlanks = Array.isArray(rawAnswer) ? rawAnswer : [];
                const blankMapping = question.blankMapping || {};
                const blankCount = Object.keys(blankMapping).length || 1;
                const pointsPerBlank = questionMaxPoints / blankCount;

                const { pointsEarned, blankResults } = gradeClozeQuestion(
                    studentBlanks, blankMapping, pointsPerBlank
                );
                const allCorrect = blankResults.every(r => r.isCorrect);

                qResult = {
                    questionNumber: question.questionNumber,
                    isCorrect: allCorrect,
                    studentAnswer: studentBlanks,
                    correctAnswer: Object.values(blankMapping),
                    pointsEarned,
                    pointsMax: questionMaxPoints,
                    blankResults,
                };
            } else if (question.type === 'sentence-rewrite' || question.type === 'sentence-rewrite-keyword') {
                // ─── Writing: mark as pending ────────────────────────
                hasWritingQuestions = true;
                const studentAnswer = typeof rawAnswer === 'string' ? rawAnswer : '';

                const writingResult: WritingGradingResult = {
                    studentAnswer,
                    modelAnswers: question.modelAnswers || [],
                    gradingTier: 'pending',
                };

                qResult = {
                    questionNumber: question.questionNumber,
                    isCorrect: false, // Temporary until graded
                    studentAnswer,
                    correctAnswer: undefined, // Model answers in writingResult
                    pointsEarned: 0, // 0 until graded
                    pointsMax: questionMaxPoints,
                    writingResult,
                };
            } else {
                // Unknown type — skip with 0 points
                qResult = {
                    questionNumber: question.questionNumber,
                    isCorrect: false,
                    studentAnswer: typeof rawAnswer === 'string' ? rawAnswer : '',
                    correctAnswer: question.correctAnswer,
                    pointsEarned: 0,
                    pointsMax: questionMaxPoints,
                };
            }

            questionResults[question.questionNumber] = qResult;

            // Accumulate section totals
            sectionPointsEarned += qResult.pointsEarned;
            sectionPointsMax += qResult.pointsMax;
            if (qResult.isCorrect) sectionCorrectCount++;

            // Build intent/type breakdown
            const questionType = question.type;
            if (!intentBreakdown[questionType]) {
                intentBreakdown[questionType] = { correct: 0, total: 0 };
            }
            intentBreakdown[questionType]!.total++;
            if (qResult.isCorrect) {
                intentBreakdown[questionType]!.correct++;
            }
        }

        // Build SectionResult
        const sectionResult: SectionResult = {
            sectionId: section.id,
            sectionName: section.name,
            pointsEarned: sectionPointsEarned,
            pointsMax: sectionPointsMax,
            correctCount: sectionCorrectCount,
            totalCount: section.questions.length,
            percentage: section.questions.length > 0
                ? (sectionCorrectCount / section.questions.length) * 100
                : 0,
            intentBreakdown: intentBreakdown as Record<THCSQuestionType, { correct: number; total: number }>,
        };

        sectionResults.push(sectionResult);
        totalPointsEarned += sectionPointsEarned;
        totalMaxPoints += sectionPointsMax;
    }

    // Compute scaled score (10-point scale)
    const scaledScore = totalMaxPoints > 0
        ? Math.round((totalPointsEarned / totalMaxPoints) * 10 * 10) / 10
        : 0;

    // Task 5.5: Grading status state machine
    const gradingStatus: THCSGradingStatus = hasWritingQuestions ? 'auto-graded' : 'fully-graded';

    return {
        testId,
        studentId,
        totalPoints: totalPointsEarned,
        maxPoints: totalMaxPoints,
        scaledScore,
        sectionResults,
        questionResults,
        gradedAt: Date.now(),
        gradingStatus,
    };
}

// ═══════════════════════════════════════════════════════════════
// Helper: mergeIntentBreakdowns
// ═══════════════════════════════════════════════════════════════

/**
 * Merge intent breakdowns from all sections into one aggregated record
 */
function mergeIntentBreakdowns(
    sectionResults: SectionResult[]
): Record<string, { correct: number; total: number }> {
    const merged: Record<string, { correct: number; total: number }> = {};

    for (const section of sectionResults) {
        for (const [intent, breakdown] of Object.entries(section.intentBreakdown)) {
            if (!merged[intent]) {
                merged[intent] = { correct: 0, total: 0 };
            }
            merged[intent]!.correct += breakdown.correct;
            merged[intent]!.total += breakdown.total;
        }
    }

    return merged;
}

// ═══════════════════════════════════════════════════════════════
// Task 5.6: thcsResultToTestMarkingResult (extended)
// ═══════════════════════════════════════════════════════════════

/**
 * Map question type to TestMarkingResult questionType field
 */
function mapQuestionType(qType: THCSQuestionType): string {
    if (qType === 'verb-form' || qType === 'word-form') return 'fill-in';
    if (qType === 'sentence-rewrite' || qType === 'sentence-rewrite-keyword') return 'writing';
    if (qType === 'reading-cloze-wordbank') return 'cloze';
    return 'multiple-choice';
}

/**
 * Adapt THCSGradingResult to existing TestMarkingResult format
 * AND return a separate thcsData object for saveTestResult
 *
 * @param gradingResult - The THCS grading result
 * @param testMetadata - Basic test metadata (title, duration)
 * @param sections - Test sections (for mapping question types)
 * @returns Object containing markingResult (for existing pipeline) and thcsData (THCS-specific extension)
 */
export function thcsResultToTestMarkingResult(
    gradingResult: THCSGradingResult,
    _testMetadata: { title: string; duration: number },
    sections?: THCSSection[]
): {
    markingResult: TestMarkingResult;
    thcsData: {
        scaledScore: number;
        sectionResults: SectionResult[];
        intentBreakdown: Record<string, { correct: number; total: number }>;
        gradingStatus: THCSGradingStatus;
        pendingWritingCount: number;
    };
} {
    // Build a map of questionNumber → question type
    const questionTypeMap: Record<number, THCSQuestionType> = {};
    if (sections) {
        for (const s of sections) {
            for (const q of s.questions) {
                questionTypeMap[q.questionNumber] = q.type;
            }
        }
    }

    const percentage = gradingResult.maxPoints > 0
        ? Math.round((gradingResult.totalPoints / gradingResult.maxPoints) * 100)
        : 0;

    let pendingWritingCount = 0;

    const markingResult: TestMarkingResult = {
        totalScore: gradingResult.totalPoints,
        maxScore: gradingResult.maxPoints,
        percentage,
        completedAt: gradingResult.gradedAt,
        questionResults: Object.values(gradingResult.questionResults).map(qr => {
            const qType = questionTypeMap[qr.questionNumber] || 'mcq-grammar';

            // Determine correctAnswer display
            let correctAnswerDisplay: string;
            if (qType === 'sentence-rewrite' || qType === 'sentence-rewrite-keyword') {
                correctAnswerDisplay = 'See model answers';
                if (qr.writingResult?.gradingTier === 'pending') pendingWritingCount++;
            } else if (Array.isArray(qr.correctAnswer)) {
                correctAnswerDisplay = JSON.stringify(qr.correctAnswer);
            } else {
                correctAnswerDisplay = typeof qr.correctAnswer === 'string' ? qr.correctAnswer : 'N/A';
            }

            return {
                questionId: `q${qr.questionNumber}`,
                questionNumber: qr.questionNumber,
                questionType: mapQuestionType(qType) as any,
                isCorrect: qr.isCorrect,
                score: qr.pointsEarned,
                maxScore: qr.pointsMax,
                studentAnswer: typeof qr.studentAnswer === 'string'
                    ? qr.studentAnswer
                    : JSON.stringify(qr.studentAnswer),
                correctAnswer: correctAnswerDisplay,
                feedback: '',
            };
        }),
        summary: {
            correct: Object.values(gradingResult.questionResults).filter(q => q.isCorrect).length,
            incorrect: Object.values(gradingResult.questionResults).filter(q => !q.isCorrect).length,
            partialCredit: 0,
            totalQuestions: Object.keys(gradingResult.questionResults).length,
        },
    };

    const thcsData = {
        scaledScore: gradingResult.scaledScore,
        sectionResults: gradingResult.sectionResults,
        intentBreakdown: mergeIntentBreakdowns(gradingResult.sectionResults),
        gradingStatus: gradingResult.gradingStatus,
        pendingWritingCount,
    };

    return { markingResult, thcsData };
}

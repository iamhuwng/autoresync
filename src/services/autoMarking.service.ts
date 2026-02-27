/**
 * Auto-Marking Service
 * Automated scoring and feedback generation for IELTS-style tests
 * 
 * Features:
 * - Scoring for all question types
 * - Partial credit support
 * - Detailed feedback generation
 * - Answer normalization
 * - Score aggregation
 */

/**
 * Question types supported (all 16 IELTS task types)
 */
export type QuestionType =
  | 'multiple-choice'
  | 'multiple-select'
  | 'sentence-completion'
  | 'summary-completion-text'
  | 'summary-completion-list'
  | 'note-completion'
  | 'table-completion'
  | 'flowchart-completion'
  | 'diagram-labeling'
  | 'true-false-not-given'
  | 'yes-no-not-given'
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'matching-sentence-endings'
  | 'short-answer'
  | 'completion'  // Legacy fallback
  | 'matching';   // Legacy fallback

/**
 * Question interface
 */
export interface Question {
  id?: string;
  number?: number;
  type: QuestionType;
  question: string;
  answer: string | string[];
  options?: string[];
  wordBank?: string[];
  labels?: Array<{ id: string; sentence: string; answer: string }>;
  acceptableAnswers?: string[];
  points?: number;
}

/**
 * Student answer interface
 */
export interface StudentAnswer {
  questionId: string;
  questionNumber: number;
  answer: string | string[] | Record<string, string>;
  timeSpent?: number;
  timestamp?: number;
}

/**
 * Marking result for a single question
 */
export interface QuestionMarkingResult {
  questionId: string;
  questionNumber: number;
  questionType: QuestionType;
  studentAnswer: string | string[] | Record<string, string>;
  correctAnswer: string | string[];
  isCorrect: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  partialCredit?: boolean;
}

/**
 * Complete test marking result
 */
export interface TestMarkingResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  questionResults: QuestionMarkingResult[];
  summary: {
    correct: number;
    incorrect: number;
    partialCredit: number;
    totalQuestions: number;
  };
  completedAt: number;
}

/**
 * Normalize answer for comparison
 * - Trims whitespace
 * - Converts to lowercase
 * - Translates common punctuation to spaces to avoid mismatch
 */
function normalizeAnswer(answer: string): string {
  if (typeof answer !== 'string') return '';
  let normalized = answer.toLowerCase().replace(/[\][{}()<>,;!?]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  normalized = normalized.replace(/\.$/, ''); // trailing period removal
  return normalized;
}

/**
 * Check if two answers match
 * Handles case-insensitive, whitespace-tolerant, and verbose user formats
 */
function answersMatch(correctAnswer: string, studentAnswer: string | undefined): boolean {
  if (!studentAnswer) return false;

  const studentNorm = normalizeAnswer(studentAnswer);
  const correctNorm = normalizeAnswer(correctAnswer);

  if (correctNorm === studentNorm) return true;

  // Key extraction: if expected is just a short key (letters/roman numerals like "iv", "B")
  if (correctNorm.length <= 5 && /^[a-z]+$/.test(correctNorm)) {
    if (
      studentNorm.startsWith(correctNorm + ' ') ||
      studentNorm.startsWith(correctNorm + '.') ||
      studentNorm.startsWith(correctNorm + '-')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Helper to check student answer against specific required answer AND any acceptableAnswers from DB
 */
function isAnswerCorrect(question: Question, targetAnswer: string | string[], studentAnswer: string | undefined): boolean {
  if (!studentAnswer) return false;

  const possibleAnswers = [
    ...(Array.isArray(targetAnswer) ? targetAnswer : [String(targetAnswer)]),
    ...(question.acceptableAnswers || [])
  ];

  // Standard matching
  if (possibleAnswers.some(ans => answersMatch(String(ans), studentAnswer))) {
    return true;
  }

  // Option prefix resolution: for MCQ/matching where student picks "C the negative effect..."
  // but the correct answer is just "C", or vice versa.
  if (question.options && question.options.length > 0) {
    const studentPrefix = extractOptionPrefix(studentAnswer, question.options);
    if (studentPrefix) {
      // Compare the extracted prefix against each possible answer (also prefix-resolved)
      for (const ans of possibleAnswers) {
        const ansPrefix = extractOptionPrefix(String(ans), question.options);
        if (ansPrefix && normalizeAnswer(ansPrefix) === normalizeAnswer(studentPrefix)) {
          return true;
        }
        // Also check if the raw correct answer IS the prefix
        if (answersMatch(String(ans), studentPrefix)) {
          return true;
        }
      }
    }

    // Reverse: correct answer is the full text, student submitted just the prefix
    const studentNorm = normalizeAnswer(studentAnswer);
    for (const ans of possibleAnswers) {
      const ansPrefix = extractOptionPrefix(String(ans), question.options);
      if (ansPrefix && normalizeAnswer(ansPrefix) === studentNorm) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract the label prefix (A, B, C, i, ii, iii, etc.) from an answer string
 * by matching it against the available options list.
 * 
 * Examples:
 *   "C the negative effect..." with options ["A ...", "B ...", "C ..."] → "C"
 *   "the development of cities in Japan" with options ["i. The search...", "iii. The development of cities in Japan"] → "iii"
 */
function extractOptionPrefix(answer: string, options: string[]): string | null {
  if (!answer || !options || options.length === 0) return null;

  const answerNorm = normalizeAnswer(answer);

  // Check if the answer starts with a known label pattern (A-Z or roman numerals)
  const labelMatch = answer.trim().match(/^([A-Za-z]|[ivxIVX]+)\b[.\s\-–]?\s*/);
  if (labelMatch && labelMatch[1]) {
    const label = labelMatch[1].toLowerCase();
    // Verify this label maps to an actual option
    const hasOption = options.some(opt => {
      const optLabel = opt.trim().match(/^([A-Za-z]|[ivxIVX]+)\b[.\s\-–]?\s*/);
      return optLabel && optLabel[1] && optLabel[1].toLowerCase() === label;
    });
    if (hasOption) return labelMatch[1];
  }

  // Check if the answer text matches the body of an option (after stripping label)
  for (const opt of options) {
    const optMatch = opt.trim().match(/^([A-Za-z]|[ivxIVX]+)\b[.\s\-–]?\s*(.*)/);
    if (optMatch && optMatch[1] && optMatch[2]) {
      const optLabel = optMatch[1];
      const optBody = normalizeAnswer(optMatch[2]);
      if (optBody && answerNorm === optBody) {
        return optLabel; // Student typed the body text → resolve to label
      }
    }
  }

  return null;
}

/**
 * Score a multiple-choice question
 */
function scoreMultipleChoice(
  question: Question,
  studentAnswer: string
): QuestionMarkingResult {
  const correctAnswer = question.answer as string;
  const isCorrect = isAnswerCorrect(question, correctAnswer, studentAnswer);
  const maxScore = question.points || 10;

  return {
    questionId: question.id || `q${question.number}`,
    questionNumber: question.number || 0,
    questionType: 'multiple-choice',
    studentAnswer,
    correctAnswer,
    isCorrect,
    score: isCorrect ? maxScore : 0,
    maxScore,
    feedback: isCorrect
      ? 'Correct! Well done.'
      : `Incorrect. The correct answer is: ${correctAnswer}`,
  };
}

/**
 * Score a multiple-select question
 * Supports partial credit
 */
function scoreMultipleSelect(
  question: Question,
  studentAnswer: string[] | string
): QuestionMarkingResult {
  const correctAnswers = question.answer as string[];
  const maxScore = question.points || 10;

  let normalizedStudentAnswer = studentAnswer;
  if (typeof normalizedStudentAnswer === 'string') {
    normalizedStudentAnswer = [normalizedStudentAnswer];
  }

  if (!Array.isArray(normalizedStudentAnswer) || !Array.isArray(correctAnswers)) {
    return {
      questionId: question.id || `q${question.number}`,
      questionNumber: question.number || 0,
      questionType: 'multiple-select',
      studentAnswer: normalizedStudentAnswer as string[],
      correctAnswer: correctAnswers,
      isCorrect: false,
      score: 0,
      maxScore,
      feedback: 'Invalid answer format.',
    };
  }

  // Count correct and incorrect selections
  let correctSelections = 0;
  let incorrectSelections = 0;

  normalizedStudentAnswer.forEach((ans) => {
    if (correctAnswers.some((correct) => answersMatch(correct, ans))) {
      correctSelections++;
    } else {
      incorrectSelections++;
    }
  });

  const totalCorrectAnswers = correctAnswers.length;
  const partialCredit = (correctSelections / totalCorrectAnswers) * maxScore;
  const penalty = (incorrectSelections / totalCorrectAnswers) * maxScore * 0.5;
  const score = Math.max(0, partialCredit - penalty);

  const isCorrect = score === maxScore;

  return {
    questionId: question.id || `q${question.number}`,
    questionNumber: question.number || 0,
    questionType: 'multiple-select',
    studentAnswer,
    correctAnswer: correctAnswers,
    isCorrect,
    score: Number(score.toFixed(2)),
    maxScore,
    feedback: isCorrect
      ? 'Correct! All answers are right.'
      : score > 0
        ? `Partial credit: ${correctSelections}/${totalCorrectAnswers} correct selections.`
        : `Incorrect. Correct answers: ${correctAnswers.join(', ')}`,
    partialCredit: score > 0 && score < maxScore,
  };
}

/**
 * Score a completion question
 * Handles both word bank and typed answers
 */
function scoreCompletion(
  question: Question,
  studentAnswer: string
): QuestionMarkingResult {
  const maxScore = question.points || 10;

  const isCorrect = isAnswerCorrect(question, question.answer, studentAnswer);

  const correctAnswerDisplay = Array.isArray(question.answer)
    ? question.answer.join(' / ')
    : question.answer;

  return {
    questionId: question.id || `q${question.number}`,
    questionNumber: question.number || 0,
    questionType: 'completion',
    studentAnswer,
    correctAnswer: correctAnswerDisplay,
    isCorrect,
    score: isCorrect ? maxScore : 0,
    maxScore,
    feedback: isCorrect
      ? 'Correct!'
      : `Incorrect. Correct answer: ${correctAnswerDisplay}`,
  };
}

/**
 * Score a matching question
 */
function scoreMatching(
  question: Question,
  studentAnswer: Record<string, string> | string[] | string
): QuestionMarkingResult {
  const maxScore = question.points || 10;
  const correctAnswer = question.answer;

  // Handle single string format (each question tested individually in AuthenticAnswerInput)
  if (typeof studentAnswer === 'string') {
    const isCorrect = isAnswerCorrect(question, correctAnswer, studentAnswer);

    return {
      questionId: question.id || `q${question.number}`,
      questionNumber: question.number || 0,
      questionType: question.type,
      studentAnswer,
      correctAnswer: correctAnswer,
      isCorrect,
      score: isCorrect ? maxScore : 0,
      maxScore,
      feedback: isCorrect ? 'Correct!' : 'Incorrect.',
    };
  }

  // Handle array format (legacy)
  if (Array.isArray(studentAnswer) && Array.isArray(correctAnswer)) {
    const allCorrect = studentAnswer.every((ans, idx) => {
      const correct = correctAnswer[idx];
      return correct ? answersMatch(correct, ans) : false;
    });

    return {
      questionId: question.id || `q${question.number}`,
      questionNumber: question.number || 0,
      questionType: 'matching',
      studentAnswer,
      correctAnswer,
      isCorrect: allCorrect,
      score: allCorrect ? maxScore : 0,
      maxScore,
      feedback: allCorrect
        ? 'All matches are correct!'
        : 'Some matches are incorrect.',
    };
  }

  // Handle object format
  if (typeof studentAnswer === 'object' && !Array.isArray(studentAnswer)) {
    const correctAnswerStr = JSON.stringify(correctAnswer);
    const studentAnswerStr = JSON.stringify(studentAnswer);
    const isCorrect = correctAnswerStr === studentAnswerStr;

    return {
      questionId: question.id || `q${question.number}`,
      questionNumber: question.number || 0,
      questionType: 'matching',
      studentAnswer,
      correctAnswer,
      isCorrect,
      score: isCorrect ? maxScore : 0,
      maxScore,
      feedback: isCorrect ? 'All matches are correct!' : 'Some matches are incorrect.',
    };
  }

  return {
    questionId: question.id || `q${question.number}`,
    questionNumber: question.number || 0,
    questionType: 'matching',
    studentAnswer,
    correctAnswer,
    isCorrect: false,
    score: 0,
    maxScore,
    feedback: 'Invalid answer format.',
  };
}

/**
 * Score a diagram-labeling question
 * Supports partial credit per label
 */
function scoreDiagramLabeling(
  question: Question,
  studentAnswer: Record<string, string> | string
): QuestionMarkingResult {
  const maxScore = question.points || 10;
  const labels = question.labels || [];

  // Single string fallback for 1-to-1 question representations
  if (typeof studentAnswer === 'string') {
    let targetAnswer = question.answer;
    let isCorrect = isAnswerCorrect(question, targetAnswer, studentAnswer);

    // If no match on targetAnswer, check diagram specific labels
    if (!isCorrect && labels.length > 0) {
      isCorrect = labels.some(l => answersMatch(l.answer, studentAnswer));
    }

    return {
      questionId: question.id || `q${question.number}`,
      questionNumber: question.number || 0,
      questionType: question.type,
      studentAnswer,
      correctAnswer: targetAnswer || labels.map((l) => l.answer).join(', '),
      isCorrect,
      score: isCorrect ? maxScore : 0,
      maxScore,
      feedback: isCorrect ? 'Correct!' : 'Incorrect.',
    };
  }

  if (typeof studentAnswer !== 'object' || Array.isArray(studentAnswer)) {
    return {
      questionId: question.id || `q${question.number}`,
      questionNumber: question.number || 0,
      questionType: 'diagram-labeling',
      studentAnswer,
      correctAnswer: labels.map((l) => l.answer),
      isCorrect: false,
      score: 0,
      maxScore,
      feedback: 'Invalid answer format.',
    };
  }

  if (labels.length === 0) {
    return {
      questionId: question.id || `q${question.number}`,
      questionNumber: question.number || 0,
      questionType: 'diagram-labeling',
      studentAnswer,
      correctAnswer: [],
      isCorrect: false,
      score: 0,
      maxScore,
      feedback: 'No labels defined for this question.',
    };
  }

  let correctLabels = 0;
  labels.forEach((label) => {
    const studentLabelAnswer = studentAnswer[label.id];
    if (studentLabelAnswer && answersMatch(label.answer, studentLabelAnswer)) {
      correctLabels++;
    }
  });

  const score = (correctLabels / labels.length) * maxScore;
  const isCorrect = correctLabels === labels.length;

  return {
    questionId: question.id || `q${question.number}`,
    questionNumber: question.number || 0,
    questionType: 'diagram-labeling',
    studentAnswer,
    correctAnswer: labels.map((l) => l.answer),
    isCorrect,
    score: Number(score.toFixed(2)),
    maxScore,
    feedback: isCorrect
      ? 'All labels are correct!'
      : `${correctLabels}/${labels.length} labels correct.`,
    partialCredit: score > 0 && score < maxScore,
  };
}

/**
 * Score a True/False/Not Given question
 */
function scoreTrueFalseNotGiven(
  question: Question,
  studentAnswer: string
): QuestionMarkingResult {
  const correctAnswer = question.answer as string;
  const isCorrect = isAnswerCorrect(question, correctAnswer, studentAnswer);
  const maxScore = question.points || 10;

  return {
    questionId: question.id || `q${question.number}`,
    questionNumber: question.number || 0,
    questionType: 'true-false-not-given',
    studentAnswer,
    correctAnswer,
    isCorrect,
    score: isCorrect ? maxScore : 0,
    maxScore,
    feedback: isCorrect
      ? 'Correct!'
      : `Incorrect. The correct answer is: ${correctAnswer}`,
  };
}

/**
 * Score a Yes/No/Not Given question
 */
function scoreYesNoNotGiven(
  question: Question,
  studentAnswer: string
): QuestionMarkingResult {
  const correctAnswer = question.answer as string;
  const isCorrect = isAnswerCorrect(question, correctAnswer, studentAnswer);
  const maxScore = question.points || 10;

  return {
    questionId: question.id || `q${question.number}`,
    questionNumber: question.number || 0,
    questionType: 'yes-no-not-given',
    studentAnswer,
    correctAnswer,
    isCorrect,
    score: isCorrect ? maxScore : 0,
    maxScore,
    feedback: isCorrect
      ? 'Correct!'
      : `Incorrect. The correct answer is: ${correctAnswer}`,
  };
}

/**
 * Score a single question
 */
export function scoreQuestion(
  question: Question,
  studentAnswer: string | string[] | Record<string, string>
): QuestionMarkingResult {
  switch (question.type) {
    case 'multiple-choice':
      return scoreMultipleChoice(question, studentAnswer as string);

    case 'multiple-select':
      return scoreMultipleSelect(question, studentAnswer as string[]);

    // All completion types (text-based answers)
    case 'completion':
    case 'sentence-completion':
    case 'summary-completion-text':
    case 'summary-completion-list':
    case 'note-completion':
    case 'table-completion':
    case 'flowchart-completion':
    case 'short-answer':
      return scoreCompletion(question, studentAnswer as string);

    // All matching types
    case 'matching':
    case 'matching-headings':
    case 'matching-information':
    case 'matching-features':
    case 'matching-sentence-endings':
      return scoreMatching(question, studentAnswer as Record<string, string> | string[]);

    case 'diagram-labeling':
      return scoreDiagramLabeling(question, studentAnswer as Record<string, string>);

    case 'true-false-not-given':
      return scoreTrueFalseNotGiven(question, studentAnswer as string);

    case 'yes-no-not-given':
      return scoreYesNoNotGiven(question, studentAnswer as string);

    default:
      // Default scoring for unknown types
      const maxScore = question.points || 10;
      return {
        questionId: question.id || `q${question.number}`,
        questionNumber: question.number || 0,
        questionType: question.type,
        studentAnswer,
        correctAnswer: question.answer,
        isCorrect: false,
        score: 0,
        maxScore,
        feedback: 'Unknown question type.',
      };
  }
}

/**
 * Mark an entire test
 */
export function markTest(
  questions: Question[],
  studentAnswers: Record<number, StudentAnswer>
): TestMarkingResult {
  const questionResults: QuestionMarkingResult[] = [];
  let totalScore = 0;
  let maxScore = 0;
  let correct = 0;
  let incorrect = 0;
  let partialCredit = 0;

  // Score each question
  questions.forEach((question, index) => {
    const questionNumber = question.number || index + 1;
    const studentAnswer = studentAnswers[questionNumber];

    if (studentAnswer) {
      const result = scoreQuestion(question, studentAnswer.answer);
      questionResults.push(result);

      totalScore += result.score;
      maxScore += result.maxScore;

      if (result.isCorrect) {
        correct++;
      } else if (result.partialCredit) {
        partialCredit++;
      } else {
        incorrect++;
      }
    } else {
      // No answer submitted
      const questionMaxScore = question.points || 10;
      questionResults.push({
        questionId: question.id || `q${questionNumber}`,
        questionNumber,
        questionType: question.type,
        studentAnswer: '',
        correctAnswer: question.answer,
        isCorrect: false,
        score: 0,
        maxScore: questionMaxScore,
        feedback: 'No answer submitted.',
      });

      maxScore += questionMaxScore;
      incorrect++;
    }
  });

  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  return {
    totalScore: Number(totalScore.toFixed(2)),
    maxScore,
    percentage: Number(percentage.toFixed(2)),
    questionResults,
    summary: {
      correct,
      incorrect,
      partialCredit,
      totalQuestions: questions.length,
    },
    completedAt: Date.now(),
  };
}

/**
 * Calculate band score (IELTS style)
 * Uses official IELTS Reading scoring table based on correct answer count
 * 
 * @deprecated Use calculateIELTSReadingBandScore from scoring.config.ts for accurate IELTS scoring
 * @param percentage - Percentage score (0-100)
 * @returns Band score (0.5-9.0)
 */
export function calculateBandScore(percentage: number): number {
  // For backward compatibility - convert percentage to approximate correct answers
  // Assumes 40 questions (standard IELTS Reading)
  const correctCount = Math.round((percentage / 100) * 40);

  // Use official IELTS Reading table
  if (correctCount >= 40) return 9.0;
  if (correctCount >= 39) return 8.5;
  if (correctCount >= 37) return 8.0;
  if (correctCount >= 36) return 7.5;
  if (correctCount >= 34) return 7.0;
  if (correctCount >= 32) return 6.5;
  if (correctCount >= 30) return 6.0;
  if (correctCount >= 27) return 5.5;
  if (correctCount >= 23) return 5.0;
  if (correctCount >= 19) return 4.5;
  if (correctCount >= 15) return 4.0;
  if (correctCount >= 12) return 3.5;
  if (correctCount >= 9) return 3.0;
  if (correctCount >= 6) return 2.5;
  if (correctCount >= 4) return 2.0;
  if (correctCount >= 2) return 1.5;
  if (correctCount >= 1) return 1.0;
  return 0.5;
}

/**
 * Generate performance feedback based on percentage
 */
export function generatePerformanceFeedback(percentage: number): string {
  if (percentage >= 90) return 'Excellent! Outstanding performance.';
  if (percentage >= 80) return 'Very good! Strong understanding demonstrated.';
  if (percentage >= 70) return 'Good work! Solid performance overall.';
  if (percentage >= 60) return 'Fair performance. Room for improvement.';
  if (percentage >= 50) return 'You passed, but consider reviewing the material.';
  return 'Needs improvement. Please review the topics covered.';
}

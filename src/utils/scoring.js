import { answersMatch, normalizeAnswerArray } from './answerNormalization';

/**
 * Calculate score for a student's answer
 *
 * Supports:
 * - Single-answer questions (multiple-choice): 10 points if correct, 0 if wrong
 * - Multiple-select questions: Partial credit based on correct selections
 * - Matching questions: Partial credit based on correct matches
 *
 * @param {Object} question - The question object with answer key
 * @param {string|string[]|Object} studentAnswer - The student's answer
 * @returns {number} The score (0-10 points, or custom points value)
 */
export const calculateScore = (question, studentAnswer) => {
  if (!question || studentAnswer === null || studentAnswer === undefined) {
    return 0;
  }

  const questionType = question.type || 'multiple-choice';

  // Handle matching questions with partial credit
  if (questionType === 'matching') {
    if (typeof studentAnswer !== 'object' || Array.isArray(studentAnswer)) {
      return 0;
    }

    if (!question.answers || typeof question.answers !== 'object') {
      return 0;
    }

    const totalItems = Object.keys(question.answers).length;
    if (totalItems === 0) {
      return 0;
    }

    // Count correct matches
    let correctMatches = 0;
    for (const [item, correctOption] of Object.entries(question.answers)) {
      if (studentAnswer[item] === correctOption) {
        correctMatches++;
      }
    }

    // Partial credit: (correct matches / total items) × points
    const maxPoints = question.points || 10;
    const score = (correctMatches / totalItems) * maxPoints;

    return Number(score.toFixed(2)); // Round to 2 decimal places
  }

  // Handle multiple-select questions with partial credit
  if (questionType === 'multiple-select') {
    if (!Array.isArray(studentAnswer) || !Array.isArray(question.answer)) {
      return 0;
    }

    // Normalize both arrays for comparison
    const normalizedStudentAnswers = normalizeAnswerArray(studentAnswer);
    const normalizedCorrectAnswers = normalizeAnswerArray(question.answer);

    // Count correct selections
    let correctSelections = 0;
    let incorrectSelections = 0;

    // Check each student selection
    for (const ans of normalizedStudentAnswers) {
      if (normalizedCorrectAnswers.includes(ans)) {
        correctSelections++;
      } else {
        incorrectSelections++;
      }
    }

    // Check for missing correct answers
    const totalCorrectAnswers = normalizedCorrectAnswers.length;

    // Partial credit formula:
    // - Award points for correct selections
    // - Deduct points for incorrect selections
    // - Formula: (correct / total correct) * 10 - (incorrect / total options) * 5
    // - Minimum score is 0

    if (correctSelections === 0) {
      return 0;
    }

    const partialCredit = (correctSelections / totalCorrectAnswers) * 10;
    const penalty = (incorrectSelections / question.options.length) * 5;
    const score = Math.max(0, partialCredit - penalty);

    return Number(score.toFixed(2)); // Round to 2 decimal places
  }

  // Handle completion questions (both word bank and typed)
  if (questionType === 'completion') {
    if (Array.isArray(question.answer)) {
      // If there are multiple acceptable answers, check if student's answer is one of them
      return question.answer.some(ans => answersMatch(ans, studentAnswer)) ? 10 : 0;
    } else {
      // Single correct answer
      return answersMatch(question.answer, studentAnswer) ? 10 : 0;
    }
  }

  if (questionType === 'diagram-labeling') {
    if (typeof studentAnswer !== 'object' || Array.isArray(studentAnswer)) {
      return 0;
    }

    if (!question.labels || !Array.isArray(question.labels)) {
      return 0;
    }

    const totalLabels = question.labels.length;
    if (totalLabels === 0) {
      return 0;
    }

    let correctLabels = 0;
    for (const label of question.labels) {
      if (answersMatch(label.answer, studentAnswer[label.id])) {
        correctLabels++;
      }
    }

    const maxPoints = question.points || 10;
    const score = (correctLabels / totalLabels) * maxPoints;

    return Number(score.toFixed(2));
  }

  // Handle True/False/Not Given questions (single answer)
  if (questionType === 'true-false-not-given') {
    return answersMatch(question.answer, studentAnswer) ? 10 : 0;
  }

  // Handle Yes/No/Not Given questions (single answer)
  if (questionType === 'yes-no-not-given') {
    return answersMatch(question.answer, studentAnswer) ? 10 : 0;
  }

  // Handle single-answer questions (multiple-choice, etc.)
  // Uses normalized answer matching for case-insensitive, whitespace-tolerant comparison
  if (answersMatch(question.answer, studentAnswer)) {
    return 10;
  }

  return 0;
};

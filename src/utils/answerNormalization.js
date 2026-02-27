/**
 * Answer Normalization Utilities
 *
 * Provides functions to normalize student answers for consistent comparison.
 * This helps prevent students from being penalized for minor formatting differences
 * like capitalization, extra spaces, or punctuation.
 */

/**
 * Normalizes an answer string for comparison
 *
 * @param {string} answer - The answer to normalize
 * @returns {string} The normalized answer
 *
 * Normalization steps:
 * 1. Convert to lowercase for case-insensitive comparison
 * 2. Trim leading and trailing whitespace
 * 3. Collapse multiple consecutive spaces into a single space
 * 4. Remove common punctuation that doesn't affect meaning (periods, commas)
 */
export const normalizeAnswer = (answer) => {
  if (typeof answer !== 'string') {
    return '';
  }

  return answer
    .toLowerCase()                    // Case-insensitive
    .trim()                           // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ')            // Collapse multiple spaces to single space
    .replace(/[.,!?;:]+$/g, '')      // Remove trailing punctuation
    .trim();                          // Final trim after punctuation removal
};

/**
 * Compares two answers for equality after normalization
 *
 * @param {string} answer1 - First answer to compare
 * @param {string} answer2 - Second answer to compare
 * @returns {boolean} True if answers match after normalization
 */
export const answersMatch = (answer1, answer2) => {
  return normalizeAnswer(answer1) === normalizeAnswer(answer2);
};

/**
 * Normalizes an array of answers
 *
 * @param {string[]} answers - Array of answers to normalize
 * @returns {string[]} Array of normalized answers
 */
export const normalizeAnswerArray = (answers) => {
  if (!Array.isArray(answers)) {
    return [];
  }

  return answers.map(answer => normalizeAnswer(answer));
};

/**
 * Checks if a student answer is in a list of correct answers
 *
 * @param {string} studentAnswer - The student's answer
 * @param {string[]} correctAnswers - Array of acceptable correct answers
 * @returns {boolean} True if student answer matches any correct answer
 */
export const isAnswerInList = (studentAnswer, correctAnswers) => {
  if (!Array.isArray(correctAnswers)) {
    return false;
  }

  const normalizedStudentAnswer = normalizeAnswer(studentAnswer);
  const normalizedCorrectAnswers = normalizeAnswerArray(correctAnswers);

  return normalizedCorrectAnswers.includes(normalizedStudentAnswer);
};

/**
 * Removes accents/diacritics from characters (optional enhancement)
 * Useful for international languages
 *
 * @param {string} str - String with potential accents
 * @returns {string} String with accents removed
 */
export const removeAccents = (str) => {
  if (typeof str !== 'string') {
    return '';
  }

  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

/**
 * Normalizes answer with accent removal (optional strict normalization)
 *
 * @param {string} answer - The answer to normalize
 * @returns {string} The normalized answer with accents removed
 */
export const normalizeAnswerStrict = (answer) => {
  return removeAccents(normalizeAnswer(answer));
};

/**
 * Answer Aggregation Utility
 *
 * Provides functions to aggregate student answers for display on teacher screen.
 * Instead of showing individual student answers, shows counts per choice.
 */

/**
 * Aggregates multiple-choice answers
 * @param {Object} players - Players object from game session
 * @param {number} questionIndex - Current question index
 * @param {Array} options - Question options (e.g., ["A", "B", "C", "D"])
 * @returns {Object} - Object with counts per option (e.g., {A: 5, B: 3, C: 2, D: 1})
 */
export function aggregateMultipleChoice(players, questionIndex, options) {
  if (!players || !options) {
    return {};
  }

  // Initialize counts for all options
  const counts = {};
  options.forEach(option => {
    counts[option] = 0;
  });

  // Count answers
  Object.values(players).forEach(player => {
    const playerAnswer = player.answers?.[questionIndex];
    if (playerAnswer && playerAnswer.answer) {
      const answer = playerAnswer.answer;
      if (counts.hasOwnProperty(answer)) {
        counts[answer]++;
      }
    }
  });

  return counts;
}

/**
 * Aggregates multiple-select answers
 * @param {Object} players - Players object from game session
 * @param {number} questionIndex - Current question index
 * @param {Array} options - Question options
 * @returns {Object} - Object with counts per option
 */
export function aggregateMultipleSelect(players, questionIndex, options) {
  if (!players || !options) {
    return {};
  }

  // Initialize counts for all options
  const counts = {};
  options.forEach(option => {
    counts[option] = 0;
  });

  // Count answers (each option can be selected by multiple students)
  Object.values(players).forEach(player => {
    const playerAnswer = player.answers?.[questionIndex];
    if (playerAnswer && Array.isArray(playerAnswer.answer)) {
      playerAnswer.answer.forEach(selectedOption => {
        if (counts.hasOwnProperty(selectedOption)) {
          counts[selectedOption]++;
        }
      });
    }
  });

  return counts;
}

/**
 * Aggregates completion answers (word bank or typed)
 * Returns unique answers with their counts
 * @param {Object} players - Players object from game session
 * @param {number} questionIndex - Current question index
 * @returns {Array} - Array of {answer: string, count: number, isCorrect: boolean}
 */
export function aggregateCompletion(players, questionIndex) {
  if (!players) {
    return [];
  }

  const answerMap = new Map();

  // Collect all answers with correctness info
  Object.values(players).forEach(player => {
    const playerAnswer = player.answers?.[questionIndex];
    if (playerAnswer && playerAnswer.answer) {
      const answer = playerAnswer.answer;
      const isCorrect = playerAnswer.isCorrect || false;

      if (answerMap.has(answer)) {
        const existing = answerMap.get(answer);
        existing.count++;
        // If any student got it correct with this answer, mark as correct
        existing.isCorrect = existing.isCorrect || isCorrect;
      } else {
        answerMap.set(answer, {
          answer,
          count: 1,
          isCorrect
        });
      }
    }
  });

  // Convert to array and sort by count (descending)
  return Array.from(answerMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * Aggregates matching answers
 * @param {Object} players - Players object from game session
 * @param {number} questionIndex - Current question index
 * @returns {Array} - Array of unique answers with counts
 */
export function aggregateMatching(players, questionIndex) {
  if (!players) {
    return [];
  }

  const answerMap = new Map();

  Object.values(players).forEach(player => {
    const playerAnswer = player.answers?.[questionIndex];
    if (playerAnswer && playerAnswer.answer) {
      const answer = JSON.stringify(playerAnswer.answer); // Convert object/array to string for comparison
      const isCorrect = playerAnswer.isCorrect || false;
      const score = playerAnswer.score || 0;

      if (answerMap.has(answer)) {
        const existing = answerMap.get(answer);
        existing.count++;
      } else {
        answerMap.set(answer, {
          answer: playerAnswer.answer, // Store original answer object
          answerDisplay: answer,
          count: 1,
          isCorrect,
          score
        });
      }
    }
  });

  return Array.from(answerMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * Aggregates diagram-labeling answers
 * Shows per-label statistics: how many students got each label correct
 * @param {Object} players - Players object from game session
 * @param {number} questionIndex - Current question index
 * @param {Array} labels - Array of label objects from question
 * @returns {Array} - Array of label stats {labelId, sentence, correctCount, incorrectCount, totalSubmissions}
 */
export function aggregateDiagramLabeling(players, questionIndex, labels) {
  if (!players || !labels) {
    return [];
  }

  // Initialize stats for each label
  const labelStats = labels.map(label => ({
    labelId: label.id,
    sentence: label.sentence,
    correctAnswer: label.answer,
    correctCount: 0,
    incorrectCount: 0,
    totalSubmissions: 0
  }));

  // Count correct/incorrect for each label
  Object.values(players).forEach(player => {
    const playerAnswer = player.answers?.[questionIndex];
    if (playerAnswer && playerAnswer.answer) {
      // playerAnswer.answer should be an object: {labelId: studentAnswer, ...}
      const answers = playerAnswer.answer;

      labelStats.forEach(stat => {
        if (answers[stat.labelId] !== undefined && answers[stat.labelId] !== null && answers[stat.labelId] !== '') {
          stat.totalSubmissions++;

          // Check if the answer is correct (normalize for comparison)
          const studentAnswer = String(answers[stat.labelId]).trim().toLowerCase();
          const correctAnswer = String(stat.correctAnswer).trim().toLowerCase();

          if (studentAnswer === correctAnswer) {
            stat.correctCount++;
          } else {
            stat.incorrectCount++;
          }
        }
      });
    }
  });

  return labelStats;
}

/**
 * Get total number of students who have submitted answers
 * @param {Object} players - Players object from game session
 * @param {number} questionIndex - Current question index
 * @returns {number} - Count of students who submitted
 */
export function getTotalSubmissions(players, questionIndex) {
  if (!players) {
    return 0;
  }

  let count = 0;
  Object.values(players).forEach(player => {
    const playerAnswer = player.answers?.[questionIndex];
    if (playerAnswer && playerAnswer.answer !== undefined && playerAnswer.answer !== null) {
      count++;
    }
  });

  return count;
}

/**
 * Get list of students who haven't submitted yet
 * @param {Object} players - Players object from game session
 * @param {number} questionIndex - Current question index
 * @returns {Array} - Array of player names who haven't submitted
 */
export function getPendingStudents(players, questionIndex) {
  if (!players) {
    return [];
  }

  const pending = [];
  Object.entries(players).forEach(([playerId, player]) => {
    const playerAnswer = player.answers?.[questionIndex];
    if (!playerAnswer || playerAnswer.answer === undefined || playerAnswer.answer === null) {
      pending.push(player.name);
    }
  });

  return pending;
}

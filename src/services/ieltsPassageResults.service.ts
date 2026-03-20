/**
 * IELTS Passage Results Service (PRD-0039 Tasks 1.4–1.8)
 *
 * Derives per-passage performance data from an IELTS test's grading questions
 * and the student's questionResults. This produces PassageResult[]
 * for the ieltsData field on EnhancedTestResultRecord.
 *
 * Grouping priority (Task 1.5):
 *   1. question.passageId
 *   2. question.sectionId
 *   3. parent section object (if test structure groups questions)
 *   4. If none → return []
 *
 * Legacy-data fallback (Task 1.6): Do NOT invent sequential passage buckets.
 * If no grouping metadata exists, return [].
 */

import type { PassageResult } from '../types/results.types';

/** Minimal shape of a grading question — only the fields we need for grouping */
interface GradingQuestion {
  questionNumber: number;
  /** First preference grouping key */
  passageId?: string;
  /** Second preference grouping key */
  sectionId?: string;
  /** Optional passage/section name for display */
  passageName?: string;
  sectionName?: string;
}

/** Minimal shape of a question result — only the fields we need for scoring */
interface QuestionResultLike {
  questionNumber: number;
  isCorrect: boolean;
}

/**
 * Derives PassageResult[] from grading questions and student question results.
 *
 * @param gradingQuestions The test's questions with passageId/sectionId metadata
 * @param questionResults The student's question-level results
 * @returns PassageResult[] with per-passage breakdown, or [] if no grouping metadata
 */
export function deriveIeltsPassageResults(
  gradingQuestions: GradingQuestion[],
  questionResults: QuestionResultLike[]
): PassageResult[] {
  if (!gradingQuestions?.length || !questionResults?.length) {
    return [];
  }

  // Determine grouping key — Task 1.5
  // First preference: passageId
  const hasPassageIds = gradingQuestions.some((q) => q.passageId);
  // Second preference: sectionId
  const hasSectionIds = gradingQuestions.some((q) => q.sectionId);

  if (!hasPassageIds && !hasSectionIds) {
    // Task 1.6: No grouping metadata → return []
    return [];
  }

  const groupKey: 'passageId' | 'sectionId' = hasPassageIds
    ? 'passageId'
    : 'sectionId';

  // Group questions by the chosen key
  const groups = new Map<
    string,
    { name: string | undefined; questions: GradingQuestion[] }
  >();

  for (const q of gradingQuestions) {
    const key = q[groupKey];
    if (!key) continue; // Skip questions without the grouping key

    if (!groups.has(key)) {
      // Task 1.7: passageName selection order
      const name =
        groupKey === 'passageId'
          ? q.passageName || q.sectionName
          : q.sectionName || q.passageName;
      groups.set(key, { name, questions: [] });
    }
    groups.get(key)!.questions.push(q);
  }

  if (groups.size === 0) {
    return [];
  }

  // Build a lookup map from questionNumber → isCorrect
  const resultMap = new Map<number, boolean>();
  for (const qr of questionResults) {
    resultMap.set(qr.questionNumber, qr.isCorrect);
  }

  // Build PassageResult[] — one per group
  let passageIndex = 0;

  const results: PassageResult[] = [];
  for (const [, group] of groups) {
    passageIndex++;

    // Sort question numbers ascending for range calculation — Task 1.8
    const questionNumbers = group.questions
      .map((q) => q.questionNumber)
      .sort((a, b) => a - b);

    const minQ = questionNumbers[0];
    const maxQ = questionNumbers[questionNumbers.length - 1];

    let correct = 0;
    let total = 0;

    for (const qNum of questionNumbers) {
      total++;
      if (resultMap.get(qNum) === true) {
        correct++;
      }
    }

    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Task 1.7: passageName fallback
    const passageName = group.name || `Passage ${passageIndex}`;

    results.push({
      passageName,
      questionRange: [minQ, maxQ],
      correct,
      total,
      percentage,
    });
  }

  return results;
}

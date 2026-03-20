/**
 * Tests for IELTS Passage Results Service (PRD-0039 Task 1.9)
 *
 * Covers:
 * - Grouping by passageId
 * - Grouping by sectionId
 * - Returning [] when no grouping metadata exists
 * - Correct questionRange
 * - Correct percentage calculation
 */

import { describe, it, expect } from 'vitest';
import { deriveIeltsPassageResults } from './ieltsPassageResults.service';

describe('deriveIeltsPassageResults', () => {
  // ─── Grouping by passageId ───────────────────────────────────────

  it('groups questions by passageId when available', () => {
    const gradingQuestions = [
      { questionNumber: 1, passageId: 'p1', passageName: 'The Great Barrier Reef' },
      { questionNumber: 2, passageId: 'p1', passageName: 'The Great Barrier Reef' },
      { questionNumber: 3, passageId: 'p1', passageName: 'The Great Barrier Reef' },
      { questionNumber: 4, passageId: 'p2', passageName: 'Climate Change' },
      { questionNumber: 5, passageId: 'p2', passageName: 'Climate Change' },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: true },
      { questionNumber: 2, isCorrect: false },
      { questionNumber: 3, isCorrect: true },
      { questionNumber: 4, isCorrect: false },
      { questionNumber: 5, isCorrect: false },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      passageName: 'The Great Barrier Reef',
      questionRange: [1, 3],
      correct: 2,
      total: 3,
      percentage: 67,
    });
    expect(result[1]).toEqual({
      passageName: 'Climate Change',
      questionRange: [4, 5],
      correct: 0,
      total: 2,
      percentage: 0,
    });
  });

  // ─── Grouping by sectionId ───────────────────────────────────────

  it('groups questions by sectionId when passageId is absent', () => {
    const gradingQuestions = [
      { questionNumber: 1, sectionId: 's1', sectionName: 'Section A' },
      { questionNumber: 2, sectionId: 's1', sectionName: 'Section A' },
      { questionNumber: 3, sectionId: 's2', sectionName: 'Section B' },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: true },
      { questionNumber: 2, isCorrect: true },
      { questionNumber: 3, isCorrect: false },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);

    expect(result).toHaveLength(2);
    expect(result[0].passageName).toBe('Section A');
    expect(result[0].correct).toBe(2);
    expect(result[0].total).toBe(2);
    expect(result[1].passageName).toBe('Section B');
    expect(result[1].correct).toBe(0);
  });

  // ─── Returns [] when no grouping metadata ────────────────────────

  it('returns empty array when no passageId or sectionId exists', () => {
    const gradingQuestions = [
      { questionNumber: 1 },
      { questionNumber: 2 },
      { questionNumber: 3 },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: true },
      { questionNumber: 2, isCorrect: false },
      { questionNumber: 3, isCorrect: true },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);
    expect(result).toEqual([]);
  });

  it('returns empty array when gradingQuestions is empty', () => {
    const result = deriveIeltsPassageResults([], [{ questionNumber: 1, isCorrect: true }]);
    expect(result).toEqual([]);
  });

  it('returns empty array when questionResults is empty', () => {
    const result = deriveIeltsPassageResults(
      [{ questionNumber: 1, passageId: 'p1' }],
      []
    );
    expect(result).toEqual([]);
  });

  // ─── Correct questionRange ────────────────────────────────────────

  it('computes questionRange as [min, max] of questionNumbers in group', () => {
    const gradingQuestions = [
      { questionNumber: 5, passageId: 'p1' },
      { questionNumber: 3, passageId: 'p1' },
      { questionNumber: 8, passageId: 'p1' },
      { questionNumber: 10, passageId: 'p2' },
      { questionNumber: 12, passageId: 'p2' },
    ];
    const questionResults = [
      { questionNumber: 3, isCorrect: true },
      { questionNumber: 5, isCorrect: true },
      { questionNumber: 8, isCorrect: false },
      { questionNumber: 10, isCorrect: true },
      { questionNumber: 12, isCorrect: true },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);

    expect(result[0].questionRange).toEqual([3, 8]);
    expect(result[1].questionRange).toEqual([10, 12]);
  });

  // ─── Correct percentage calculation ───────────────────────────────

  it('calculates percentage correctly', () => {
    const gradingQuestions = [
      { questionNumber: 1, passageId: 'p1' },
      { questionNumber: 2, passageId: 'p1' },
      { questionNumber: 3, passageId: 'p1' },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: true },
      { questionNumber: 2, isCorrect: true },
      { questionNumber: 3, isCorrect: false },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);

    // 2/3 = 66.666... → rounded to 67
    expect(result[0].percentage).toBe(67);
  });

  it('calculates 100% when all correct', () => {
    const gradingQuestions = [
      { questionNumber: 1, passageId: 'p1' },
      { questionNumber: 2, passageId: 'p1' },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: true },
      { questionNumber: 2, isCorrect: true },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);
    expect(result[0].percentage).toBe(100);
  });

  it('calculates 0% when all incorrect', () => {
    const gradingQuestions = [
      { questionNumber: 1, passageId: 'p1' },
      { questionNumber: 2, passageId: 'p1' },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: false },
      { questionNumber: 2, isCorrect: false },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);
    expect(result[0].percentage).toBe(0);
  });

  // ─── passageName fallback ─────────────────────────────────────────

  it('uses "Passage {index}" as fallback when no name is provided', () => {
    const gradingQuestions = [
      { questionNumber: 1, passageId: 'p1' },
      { questionNumber: 2, passageId: 'p2' },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: true },
      { questionNumber: 2, isCorrect: false },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);

    expect(result[0].passageName).toBe('Passage 1');
    expect(result[1].passageName).toBe('Passage 2');
  });

  // ─── passageId takes priority over sectionId ──────────────────────

  it('prefers passageId over sectionId when both exist', () => {
    const gradingQuestions = [
      { questionNumber: 1, passageId: 'p1', sectionId: 's1', passageName: 'By PassageId' },
      { questionNumber: 2, passageId: 'p1', sectionId: 's2', passageName: 'By PassageId' },
      { questionNumber: 3, passageId: 'p2', sectionId: 's1', passageName: 'Other Passage' },
    ];
    const questionResults = [
      { questionNumber: 1, isCorrect: true },
      { questionNumber: 2, isCorrect: true },
      { questionNumber: 3, isCorrect: false },
    ];

    const result = deriveIeltsPassageResults(gradingQuestions, questionResults);

    // Should group by passageId, not sectionId
    expect(result).toHaveLength(2);
    expect(result[0].passageName).toBe('By PassageId');
    expect(result[0].total).toBe(2);
    expect(result[1].passageName).toBe('Other Passage');
    expect(result[1].total).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import {
  aggregateMultipleChoice,
  aggregateMultipleSelect,
  aggregateCompletion,
  aggregateMatching,
  getTotalSubmissions,
  getPendingStudents
} from './answerAggregation';

describe('answerAggregation', () => {
  describe('aggregateMultipleChoice', () => {
    it('should aggregate MCQ answers correctly', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'A', isCorrect: true }] },
        p2: { name: 'Bob', answers: [{ answer: 'B', isCorrect: false }] },
        p3: { name: 'Charlie', answers: [{ answer: 'A', isCorrect: true }] },
        p4: { name: 'Dave', answers: [{ answer: 'C', isCorrect: false }] },
        p5: { name: 'Eve', answers: [{ answer: 'A', isCorrect: true }] }
      };
      const options = ['A', 'B', 'C', 'D'];
      const result = aggregateMultipleChoice(players, 0, options);

      expect(result).toEqual({ A: 3, B: 1, C: 1, D: 0 });
    });

    it('should handle players with no answers', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'A', isCorrect: true }] },
        p2: { name: 'Bob', answers: [] },
        p3: { name: 'Charlie' }
      };
      const options = ['A', 'B', 'C', 'D'];
      const result = aggregateMultipleChoice(players, 0, options);

      expect(result).toEqual({ A: 1, B: 0, C: 0, D: 0 });
    });

    it('should initialize all options to 0', () => {
      const players = {};
      const options = ['A', 'B', 'C', 'D'];
      const result = aggregateMultipleChoice(players, 0, options);

      expect(result).toEqual({ A: 0, B: 0, C: 0, D: 0 });
    });

    it('should handle null/undefined inputs', () => {
      expect(aggregateMultipleChoice(null, 0, ['A', 'B'])).toEqual({});
      expect(aggregateMultipleChoice({}, 0, null)).toEqual({});
    });
  });

  describe('aggregateMultipleSelect', () => {
    it('should aggregate multiple-select answers correctly', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: ['A', 'B'], isCorrect: true }] },
        p2: { name: 'Bob', answers: [{ answer: ['B', 'C'], isCorrect: false }] },
        p3: { name: 'Charlie', answers: [{ answer: ['A', 'C'], isCorrect: false }] }
      };
      const options = ['A', 'B', 'C', 'D'];
      const result = aggregateMultipleSelect(players, 0, options);

      expect(result).toEqual({ A: 2, B: 2, C: 2, D: 0 });
    });

    it('should handle single selections in multiple-select', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: ['A'], isCorrect: false }] },
        p2: { name: 'Bob', answers: [{ answer: ['A'], isCorrect: false }] }
      };
      const options = ['A', 'B', 'C'];
      const result = aggregateMultipleSelect(players, 0, options);

      expect(result).toEqual({ A: 2, B: 0, C: 0 });
    });

    it('should handle empty arrays', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: [], isCorrect: false }] }
      };
      const options = ['A', 'B', 'C'];
      const result = aggregateMultipleSelect(players, 0, options);

      expect(result).toEqual({ A: 0, B: 0, C: 0 });
    });
  });

  describe('aggregateCompletion', () => {
    it('should aggregate completion answers with counts', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'Tokyo', isCorrect: true }] },
        p2: { name: 'Bob', answers: [{ answer: 'Kyoto', isCorrect: false }] },
        p3: { name: 'Charlie', answers: [{ answer: 'Tokyo', isCorrect: true }] },
        p4: { name: 'Dave', answers: [{ answer: 'Osaka', isCorrect: false }] },
        p5: { name: 'Eve', answers: [{ answer: 'Tokyo', isCorrect: true }] }
      };
      const result = aggregateCompletion(players, 0);

      expect(result).toEqual([
        { answer: 'Tokyo', count: 3, isCorrect: true },
        { answer: 'Kyoto', count: 1, isCorrect: false },
        { answer: 'Osaka', count: 1, isCorrect: false }
      ]);
    });

    it('should sort by count descending', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'A', isCorrect: false }] },
        p2: { name: 'Bob', answers: [{ answer: 'B', isCorrect: true }] },
        p3: { name: 'Charlie', answers: [{ answer: 'B', isCorrect: true }] },
        p4: { name: 'Dave', answers: [{ answer: 'B', isCorrect: true }] }
      };
      const result = aggregateCompletion(players, 0);

      expect(result[0].answer).toBe('B');
      expect(result[0].count).toBe(3);
      expect(result[1].answer).toBe('A');
      expect(result[1].count).toBe(1);
    });

    it('should mark answer as correct if any student got it correct', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'Paris', isCorrect: true }] },
        p2: { name: 'Bob', answers: [{ answer: 'Paris', isCorrect: false }] } // Different scoring, same answer
      };
      const result = aggregateCompletion(players, 0);

      expect(result[0].isCorrect).toBe(true);
    });

    it('should return empty array for no players', () => {
      const result = aggregateCompletion({}, 0);
      expect(result).toEqual([]);
    });
  });

  describe('aggregateMatching', () => {
    it('should aggregate matching answers', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: { item1: 'match1', item2: 'match2' }, isCorrect: true, score: 10 }] },
        p2: { name: 'Bob', answers: [{ answer: { item1: 'match1', item2: 'match2' }, isCorrect: true, score: 10 }] },
        p3: { name: 'Charlie', answers: [{ answer: { item1: 'match2', item2: 'match1' }, isCorrect: false, score: 5 }] }
      };
      const result = aggregateMatching(players, 0);

      expect(result.length).toBe(2);
      expect(result[0].count).toBe(2);
      expect(result[1].count).toBe(1);
    });

    it('should handle array-based matching answers', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: ['A', 'B', 'C'], isCorrect: true, score: 10 }] },
        p2: { name: 'Bob', answers: [{ answer: ['A', 'B', 'C'], isCorrect: true, score: 10 }] },
        p3: { name: 'Charlie', answers: [{ answer: ['A', 'C', 'B'], isCorrect: false, score: 7 }] }
      };
      const result = aggregateMatching(players, 0);

      expect(result.length).toBe(2);
      expect(result[0].count).toBe(2);
    });
  });

  describe('getTotalSubmissions', () => {
    it('should count total submissions correctly', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'A', isCorrect: true }] },
        p2: { name: 'Bob', answers: [{ answer: 'B', isCorrect: false }] },
        p3: { name: 'Charlie', answers: [] },
        p4: { name: 'Dave' }
      };
      const result = getTotalSubmissions(players, 0);

      expect(result).toBe(2);
    });

    it('should handle null answers', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: null }] },
        p2: { name: 'Bob', answers: [{ answer: 'B' }] }
      };
      const result = getTotalSubmissions(players, 0);

      expect(result).toBe(1);
    });

    it('should return 0 for no players', () => {
      expect(getTotalSubmissions({}, 0)).toBe(0);
      expect(getTotalSubmissions(null, 0)).toBe(0);
    });
  });

  describe('getPendingStudents', () => {
    it('should return list of students who have not submitted', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'A', isCorrect: true }] },
        p2: { name: 'Bob', answers: [] },
        p3: { name: 'Charlie' },
        p4: { name: 'Dave', answers: [{ answer: 'D', isCorrect: false }] }
      };
      const result = getPendingStudents(players, 0);

      expect(result).toEqual(['Bob', 'Charlie']);
    });

    it('should return all students if none have submitted', () => {
      const players = {
        p1: { name: 'Alice' },
        p2: { name: 'Bob' },
        p3: { name: 'Charlie' }
      };
      const result = getPendingStudents(players, 0);

      expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should return empty array if all have submitted', () => {
      const players = {
        p1: { name: 'Alice', answers: [{ answer: 'A' }] },
        p2: { name: 'Bob', answers: [{ answer: 'B' }] }
      };
      const result = getPendingStudents(players, 0);

      expect(result).toEqual([]);
    });

    it('should handle null players', () => {
      expect(getPendingStudents(null, 0)).toEqual([]);
    });
  });
});

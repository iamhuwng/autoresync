import { calculateScore } from './scoring';

describe('calculateScore', () => {
  it('should return 10 for a correct answer', () => {
    const question = { answer: 'A' };
    const studentAnswer = 'A';
    expect(calculateScore(question, studentAnswer)).toBe(10);
  });

  it('should return 0 for an incorrect answer', () => {
    const question = { answer: 'A' };
    const studentAnswer = 'B';
    expect(calculateScore(question, studentAnswer)).toBe(0);
  });

  it('should return 0 if the question or answer is missing', () => {
    expect(calculateScore(null, 'A')).toBe(0);
    expect(calculateScore({ answer: 'A' }, null)).toBe(0);
    expect(calculateScore({ answer: 'A' }, undefined)).toBe(0);
  });

  // Test normalized answer matching
  describe('normalized answer matching', () => {
    it('should score correctly with case-insensitive answers', () => {
      const question = { answer: 'Paris' };
      expect(calculateScore(question, 'PARIS')).toBe(10);
      expect(calculateScore(question, 'paris')).toBe(10);
      expect(calculateScore(question, 'PaRiS')).toBe(10);
    });

    it('should score correctly with whitespace variations', () => {
      const question = { answer: 'Paris' };
      expect(calculateScore(question, '  Paris  ')).toBe(10);
      expect(calculateScore(question, '\tParis\n')).toBe(10);
      expect(calculateScore(question, 'Paris   ')).toBe(10);
    });

    it('should score correctly with trailing punctuation', () => {
      const question = { answer: 'Paris' };
      expect(calculateScore(question, 'Paris.')).toBe(10);
      expect(calculateScore(question, 'Paris!')).toBe(10);
      expect(calculateScore(question, 'Paris?')).toBe(10);
    });

    it('should score correctly with multiple normalizations combined', () => {
      const question = { answer: 'Paris' };
      expect(calculateScore(question, '  PARIS!  ')).toBe(10);
      expect(calculateScore(question, '\t paris.  ')).toBe(10);
    });

    it('should handle multi-word answers', () => {
      const question = { answer: 'New York City' };
      expect(calculateScore(question, 'NEW YORK CITY')).toBe(10);
      expect(calculateScore(question, '  new   york   city  ')).toBe(10);
      expect(calculateScore(question, 'new york city.')).toBe(10);
    });

    it('should still reject incorrect answers after normalization', () => {
      const question = { answer: 'Paris' };
      expect(calculateScore(question, 'London')).toBe(0);
      expect(calculateScore(question, 'LONDON')).toBe(0);
      expect(calculateScore(question, '  Berlin  ')).toBe(0);
    });

    it('should handle empty strings correctly', () => {
      const question = { answer: '' };
      expect(calculateScore(question, '')).toBe(10);
      expect(calculateScore(question, '   ')).toBe(10); // Whitespace normalizes to empty
      expect(calculateScore(question, 'something')).toBe(0);
    });
  });

  describe('multiple-select questions with partial credit', () => {
    it('should return 10 for all correct answers', () => {
      const question = {
        type: 'multiple-select',
        options: ['Python', 'HTML', 'JavaScript', 'CSS'],
        answer: ['Python', 'JavaScript'],
      };
      const studentAnswer = ['Python', 'JavaScript'];
      expect(calculateScore(question, studentAnswer)).toBe(10);
    });

    it('should return partial credit for some correct answers', () => {
      const question = {
        type: 'multiple-select',
        options: ['Python', 'HTML', 'JavaScript', 'CSS'],
        answer: ['Python', 'JavaScript'],
      };
      const studentAnswer = ['Python']; // 1 out of 2 correct
      // (1/2) * 10 = 5 points
      expect(calculateScore(question, studentAnswer)).toBe(5);
    });

    it('should deduct points for incorrect selections', () => {
      const question = {
        type: 'multiple-select',
        options: ['Python', 'HTML', 'JavaScript', 'CSS'],
        answer: ['Python', 'JavaScript'],
      };
      const studentAnswer = ['Python', 'HTML']; // 1 correct, 1 incorrect
      // (1/2) * 10 - (1/4) * 5 = 5 - 1.25 = 3.75
      expect(calculateScore(question, studentAnswer)).toBe(3.75);
    });

    it('should return 0 for all incorrect answers', () => {
      const question = {
        type: 'multiple-select',
        options: ['Python', 'HTML', 'JavaScript', 'CSS'],
        answer: ['Python', 'JavaScript'],
      };
      const studentAnswer = ['HTML', 'CSS'];
      expect(calculateScore(question, studentAnswer)).toBe(0);
    });

    it('should return 0 for empty student answer', () => {
      const question = {
        type: 'multiple-select',
        options: ['Python', 'HTML', 'JavaScript', 'CSS'],
        answer: ['Python', 'JavaScript'],
      };
      const studentAnswer = [];
      expect(calculateScore(question, studentAnswer)).toBe(0);
    });

    it('should handle normalized answers in multiple-select', () => {
      const question = {
        type: 'multiple-select',
        options: ['Python', 'HTML', 'JavaScript', 'CSS'],
        answer: ['Python', 'JavaScript'],
      };
      const studentAnswer = ['  PYTHON  ', 'javascript']; // Case/whitespace variations
      expect(calculateScore(question, studentAnswer)).toBe(10);
    });

    it('should return 0 when student answer is not an array', () => {
      const question = {
        type: 'multiple-select',
        options: ['Python', 'HTML', 'JavaScript', 'CSS'],
        answer: ['Python', 'JavaScript'],
      };
      const studentAnswer = 'Python';
      expect(calculateScore(question, studentAnswer)).toBe(0);
    });

    it('should handle complex partial credit scenarios', () => {
      const question = {
        type: 'multiple-select',
        options: ['A', 'B', 'C', 'D', 'E'],
        answer: ['A', 'B', 'C'], // 3 correct answers
      };
      const studentAnswer = ['A', 'B', 'D']; // 2 correct, 1 incorrect
      // (2/3) * 10 - (1/5) * 5 = 6.67 - 1 = 5.67
      expect(calculateScore(question, studentAnswer)).toBe(5.67);
    });

    it('should not give negative scores', () => {
      const question = {
        type: 'multiple-select',
        options: ['A', 'B', 'C', 'D'],
        answer: ['A', 'B'],
      };
      const studentAnswer = ['A', 'C', 'D']; // 1 correct, 2 incorrect
      // (1/2) * 10 - (2/4) * 5 = 5 - 2.5 = 2.5 (positive, so keep it)
      const score = calculateScore(question, studentAnswer);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBe(2.5);
    });
  });

  describe('matching questions with partial credit', () => {
    const question = {
      type: 'matching',
      points: 10,
      answers: {
        'item-1': 'opt-b',
        'item-2': 'opt-c',
        'item-3': 'opt-a'
      }
    };

    it('should return 10 for all correct matches', () => {
      const studentAnswer = {
        'item-1': 'opt-b',
        'item-2': 'opt-c',
        'item-3': 'opt-a'
      };
      expect(calculateScore(question, studentAnswer)).toBe(10);
    });

    it('should return partial credit for some correct matches', () => {
      const studentAnswer = {
        'item-1': 'opt-b',
        'item-2': 'opt-a',
        'item-3': 'opt-c'
      }; // 1 correct match out of 3
      // (1/3) * 10 = 3.33
      expect(calculateScore(question, studentAnswer)).toBe(3.33);
    });

    it('should return 0 for all incorrect matches', () => {
      const studentAnswer = {
        'item-1': 'opt-a',
        'item-2': 'opt-b',
        'item-3': 'opt-c'
      };
      expect(calculateScore(question, studentAnswer)).toBe(0);
    });

    it('should return 0 for empty student answer', () => {
      const studentAnswer = {};
      expect(calculateScore(question, studentAnswer)).toBe(0);
    });

    it('should handle non-object student answers gracefully', () => {
      expect(calculateScore(question, [])).toBe(0);
      expect(calculateScore(question, 'string')).toBe(0);
      expect(calculateScore(question, null)).toBe(0);
    });

    it('should handle questions with no answers', () => {
      const questionWithNoAnswers = { ...question, answers: {} };
      const studentAnswer = { 'item-1': 'opt-b' };
      expect(calculateScore(questionWithNoAnswers, studentAnswer)).toBe(0);
    });
  });

  describe('completion questions', () => {
    it('should score a correct word bank answer', () => {
      const question = { type: 'completion', answer: 'Paris' };
      expect(calculateScore(question, 'Paris')).toBe(10);
    });

    it('should score an incorrect word bank answer', () => {
      const question = { type: 'completion', answer: 'Paris' };
      expect(calculateScore(question, 'London')).toBe(0);
    });

    it('should score a correct typed answer (case-insensitive)', () => {
      const question = { type: 'completion', answer: 'Madrid' };
      expect(calculateScore(question, 'madrid')).toBe(10);
    });

    it('should score a correct typed answer with whitespace', () => {
      const question = { type: 'completion', answer: 'Madrid' };
      expect(calculateScore(question, '  Madrid  ')).toBe(10);
    });

    it('should score a correct typed answer from a list of possible answers', () => {
      const question = { type: 'completion', answer: ['Madrid', 'madrid'] };
      expect(calculateScore(question, 'Madrid')).toBe(10);
      expect(calculateScore(question, 'madrid')).toBe(10);
    });

    it('should score an incorrect typed answer', () => {
      const question = { type: 'completion', answer: 'Madrid' };
      expect(calculateScore(question, 'Barcelona')).toBe(0);
    });
  });

  describe('diagram-labeling questions with partial credit', () => {
    const question = {
      type: 'diagram-labeling',
      points: 10,
      labels: [
        { id: 'label-1', answer: 'Mitochondria' },
        { id: 'label-2', answer: 'Nucleus' },
      ]
    };

    it('should return 10 for all correct labels', () => {
      const studentAnswer = {
        'label-1': 'Mitochondria',
        'label-2': 'Nucleus'
      };
      expect(calculateScore(question, studentAnswer)).toBe(10);
    });

    it('should return partial credit for some correct labels', () => {
      const studentAnswer = {
        'label-1': 'Mitochondria',
        'label-2': 'Ribosome'
      }; // 1 correct label out of 2
      // (1/2) * 10 = 5
      expect(calculateScore(question, studentAnswer)).toBe(5);
    });

    it('should return 0 for all incorrect labels', () => {
      const studentAnswer = {
        'label-1': 'Ribosome',
        'label-2': 'Chloroplast'
      };
      expect(calculateScore(question, studentAnswer)).toBe(0);
    });

    it('should return 0 for empty student answer', () => {
      const studentAnswer = {};
      expect(calculateScore(question, studentAnswer)).toBe(0);
    });

    it('should handle non-object student answers gracefully', () => {
      expect(calculateScore(question, [])).toBe(0);
      expect(calculateScore(question, 'string')).toBe(0);
      expect(calculateScore(question, null)).toBe(0);
    });

    it('should handle questions with no labels', () => {
      const questionWithNoLabels = { ...question, labels: [] };
      const studentAnswer = { 'label-1': 'Mitochondria' };
      expect(calculateScore(questionWithNoLabels, studentAnswer)).toBe(0);
    });
  });
});

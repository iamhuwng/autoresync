import { describe, it, expect } from 'vitest';
import { validateAIResponse, normalizeQuestionType, normalizeAnswer } from './response.validator';
import type { AIParseResult } from './ai.service';

describe('Response Validator', () => {
  describe('validateAIResponse', () => {
    it('should validate correct AI response', () => {
      const validResponse: AIParseResult = {
        passages: [
          {
            id: 'p1',
            title: 'Test Passage',
            content: 'Test content',
            type: 'text',
            questionStart: 1,
            questionEnd: 5,
            wordCount: 100,
          },
        ],
        questions: [
          {
            questionNumber: 1,
            questionText: 'What is the answer?',
            type: 'multiple-choice',
            options: ['A', 'B', 'C', 'D'],
            answer: 'A',
            confidence: 95,
          },
        ],
        answerKey: {
          '1': 'A',
        },
        confidence: 90,
      };

      const result = validateAIResponse(validResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validResponse);
      }
    });

    it('should reject invalid passage type', () => {
      const invalidResponse = {
        passages: [
          {
            id: 'p1',
            title: 'Test',
            content: 'Content',
            type: 'invalid-type',
            questionStart: 1,
            questionEnd: 5,
            wordCount: 100,
          },
        ],
        questions: [],
        answerKey: {},
        confidence: 90,
      };

      const result = validateAIResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('passages.0.type');
      }
    });

    it('should reject invalid question type', () => {
      const invalidResponse = {
        passages: [],
        questions: [
          {
            questionNumber: 1,
            questionText: 'Test?',
            type: 'invalid-type',
            answer: 'A',
            confidence: 90,
          },
        ],
        answerKey: {},
        confidence: 90,
      };

      const result = validateAIResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('questions.0.type');
      }
    });

    it('should reject missing required fields', () => {
      const invalidResponse = {
        passages: [],
        questions: [
          {
            questionNumber: 1,
            type: 'multiple-choice',
            confidence: 90,
          },
        ],
        answerKey: {},
        confidence: 90,
      };

      const result = validateAIResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('questionText');
      }
    });

    it('should accept optional fields', () => {
      const validResponse: AIParseResult = {
        passages: [],
        questions: [
          {
            questionNumber: 1,
            questionText: 'Test?',
            type: 'completion',
            answer: 'test',
            confidence: 85,
            passageId: 'p1',
            context: {
              sectionHeading: 'Section 1',
              subsectionLabel: 'Part A',
              contextLines: ['Line 1', 'Line 2'],
              currentLineIndex: 0,
            },
          },
        ],
        answerKey: {},
        confidence: 85,
      };

      const result = validateAIResponse(validResponse);

      expect(result.success).toBe(true);
    });

    it('should validate answer key with string values', () => {
      const validResponse: AIParseResult = {
        passages: [],
        questions: [],
        answerKey: {
          '1': 'A',
          '2': 'B',
          '3': 'C',
        },
        confidence: 90,
      };

      const result = validateAIResponse(validResponse);

      expect(result.success).toBe(true);
    });

    it('should validate answer key with array values', () => {
      const validResponse: AIParseResult = {
        passages: [],
        questions: [],
        answerKey: {
          '1': ['A', 'B'],
          '2': ['C'],
        },
        confidence: 90,
      };

      const result = validateAIResponse(validResponse);

      expect(result.success).toBe(true);
    });

    it('should reject confidence outside range', () => {
      const invalidResponse = {
        passages: [],
        questions: [],
        answerKey: {},
        confidence: 150,
      };

      const result = validateAIResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('confidence');
      }
    });

    it('should reject negative question numbers', () => {
      const invalidResponse = {
        passages: [],
        questions: [
          {
            questionNumber: -1,
            questionText: 'Test?',
            type: 'completion',
            answer: 'test',
            confidence: 90,
          },
        ],
        answerKey: {},
        confidence: 90,
      };

      const result = validateAIResponse(invalidResponse);

      expect(result.success).toBe(false);
    });

    it('should accept all valid question types', () => {
      const questionTypes = [
        // Completion types (7)
        'sentence-completion',
        'summary-completion-text',
        'summary-completion-list',
        'note-completion',
        'table-completion',
        'flowchart-completion',
        'diagram-labeling',
        // True/False types (2)
        'true-false-not-given',
        'yes-no-not-given',
        // Matching types (4)
        'matching-headings',
        'matching-information',
        'matching-features',
        'matching-sentence-endings',
        // Choice types (2)
        'multiple-choice',
        'multiple-select',
        // Other (1)
        'short-answer',
        // Legacy types (still accepted for backward compatibility)
        'completion',
        'matching',
      ];

      questionTypes.forEach(type => {
        const response: AIParseResult = {
          passages: [],
          questions: [
            {
              questionNumber: 1,
              questionText: 'Test?',
              type: type as any,
              answer: 'test',
              confidence: 90,
            },
          ],
          answerKey: {},
          confidence: 90,
        };

        const result = validateAIResponse(response);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('normalizeQuestionType', () => {
    it('should normalize true-false to true-false-not-given', () => {
      expect(normalizeQuestionType('true-false')).toBe('true-false-not-given');
    });

    it('should normalize yes-no to yes-no-not-given', () => {
      expect(normalizeQuestionType('yes-no')).toBe('yes-no-not-given');
    });

    it('should normalize fill-in-blank variations to sentence-completion', () => {
      expect(normalizeQuestionType('fill-in-blank')).toBe('sentence-completion');
      expect(normalizeQuestionType('fill-blank')).toBe('sentence-completion');
      expect(normalizeQuestionType('completion')).toBe('sentence-completion');
      expect(normalizeQuestionType('gap-fill')).toBe('sentence-completion');
    });

    it('should normalize match variations to specific matching types', () => {
      expect(normalizeQuestionType('match')).toBe('matching-information');
      expect(normalizeQuestionType('matching')).toBe('matching-information');
      expect(normalizeQuestionType('matching-heading')).toBe('matching-headings');
      expect(normalizeQuestionType('matching-feature')).toBe('matching-features');
    });

    it('should normalize diagram variations', () => {
      expect(normalizeQuestionType('diagram')).toBe('diagram-labeling');
      expect(normalizeQuestionType('labeling')).toBe('diagram-labeling');
    });

    it('should handle case insensitivity', () => {
      expect(normalizeQuestionType('TRUE-FALSE')).toBe('true-false-not-given');
      expect(normalizeQuestionType('Match')).toBe('matching-information');
      expect(normalizeQuestionType('MCQ')).toBe('multiple-choice');
    });

    it('should return original type if no mapping exists', () => {
      expect(normalizeQuestionType('multiple-choice')).toBe('multiple-choice');
      expect(normalizeQuestionType('custom-type')).toBe('custom-type');
    });
  });

  describe('normalizeAnswer', () => {
    describe('True/False/Not Given', () => {
      it('should normalize lowercase true', () => {
        expect(normalizeAnswer('true', 'true-false-not-given')).toBe('True');
      });

      it('should normalize uppercase TRUE', () => {
        expect(normalizeAnswer('TRUE', 'true-false-not-given')).toBe('True');
      });

      it('should normalize t to True', () => {
        expect(normalizeAnswer('t', 'true-false-not-given')).toBe('True');
      });

      it('should normalize false variations', () => {
        expect(normalizeAnswer('false', 'true-false-not-given')).toBe('False');
        expect(normalizeAnswer('FALSE', 'true-false-not-given')).toBe('False');
        expect(normalizeAnswer('f', 'true-false-not-given')).toBe('False');
      });

      it('should normalize not given variations', () => {
        expect(normalizeAnswer('not given', 'true-false-not-given')).toBe('Not Given');
        expect(normalizeAnswer('NOT GIVEN', 'true-false-not-given')).toBe('Not Given');
        expect(normalizeAnswer('ng', 'true-false-not-given')).toBe('Not Given');
      });

      it('should not modify already correct answers', () => {
        expect(normalizeAnswer('True', 'true-false-not-given')).toBe('True');
        expect(normalizeAnswer('False', 'true-false-not-given')).toBe('False');
        expect(normalizeAnswer('Not Given', 'true-false-not-given')).toBe('Not Given');
      });
    });

    describe('Yes/No/Not Given', () => {
      it('should normalize yes variations', () => {
        expect(normalizeAnswer('yes', 'yes-no-not-given')).toBe('Yes');
        expect(normalizeAnswer('YES', 'yes-no-not-given')).toBe('Yes');
        expect(normalizeAnswer('y', 'yes-no-not-given')).toBe('Yes');
      });

      it('should normalize no variations', () => {
        expect(normalizeAnswer('no', 'yes-no-not-given')).toBe('No');
        expect(normalizeAnswer('NO', 'yes-no-not-given')).toBe('No');
        expect(normalizeAnswer('n', 'yes-no-not-given')).toBe('No');
      });

      it('should normalize not given variations', () => {
        expect(normalizeAnswer('not given', 'yes-no-not-given')).toBe('Not Given');
        expect(normalizeAnswer('ng', 'yes-no-not-given')).toBe('Not Given');
      });
    });

    describe('Other Question Types', () => {
      it('should not modify answers for multiple-choice', () => {
        expect(normalizeAnswer('A', 'multiple-choice')).toBe('A');
        expect(normalizeAnswer('D', 'multiple-choice')).toBe('D');
      });

      it('should not modify answers for completion', () => {
        expect(normalizeAnswer('rivers', 'completion')).toBe('rivers');
        expect(normalizeAnswer('test', 'completion')).toBe('test');
      });

      it('should handle array answers', () => {
        const arrayAnswer = ['A', 'B', 'C'];
        expect(normalizeAnswer(arrayAnswer, 'multiple-select')).toEqual(arrayAnswer);
      });

      it('should not modify array answers for True/False questions', () => {
        const arrayAnswer = ['true', 'false'];
        expect(normalizeAnswer(arrayAnswer, 'true-false-not-given')).toEqual(arrayAnswer);
      });
    });
  });
});

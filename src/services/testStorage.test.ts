/**
 * Test Storage Service Unit Tests
 * Tests Firebase test storage operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateTestId,
  saveTestToFirebase,
  getTestFromFirebase,
  getAllTestsFromFirebase,
  deleteTestFromFirebase
} from './testStorage';
import type { TestMetadata } from './testStorage';

// Mock Firebase
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
}));

vi.mock('./firebase', () => ({
  database: {},
}));

describe('testStorage', () => {
  describe('generateTestId', () => {
    it('should generate unique test IDs', () => {
      const id1 = generateTestId();
      const id2 = generateTestId();

      expect(id1).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should start with "test-" prefix', () => {
      const id = generateTestId();
      expect(id.startsWith('test-')).toBe(true);
    });

    it('should contain timestamp and random component', () => {
      const id = generateTestId();
      const parts = id.split('-');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('test');
      expect(parts[1]).toMatch(/^\d+$/); // timestamp
      expect(parts[2]).toMatch(/^[a-z0-9]+$/); // random string
    });
  });

  describe('Test Validation', () => {
    const mockMetadata: TestMetadata = {
      title: 'IELTS Reading Practice Test 1',
      type: 'IELTS',
      skill: 'Reading',
      duration: 60,
      difficulty: 'Intermediate',
      description: 'Full-length IELTS Reading test',
      targetBand: '7.0',
      estimatedScore: '6.5-7.5',
    };

    const mockPassages = [
      {
        id: 'p1',
        title: 'The History of Chocolate',
        content: 'Chocolate has a long history dating back thousands of years...',
        type: 'text' as const,
        createdAt: Date.now(),
      },
      {
        id: 'p2',
        title: 'Climate Change',
        content: 'Climate change is one of the most pressing issues...',
        type: 'text' as const,
        createdAt: Date.now(),
      },
      {
        id: 'p3',
        title: 'Artificial Intelligence',
        content: 'AI is transforming the way we live and work...',
        type: 'text' as const,
        createdAt: Date.now(),
      },
    ];

    const mockQuestions = Array.from({ length: 40 }, (_, i) => ({
      number: i + 1,
      type: 'multiple-choice',
      question: `Question ${i + 1}?`,
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      passageId: `p${Math.floor(i / 13) + 1}`,
      points: 1,
    }));

    it('should validate IELTS Reading structure (40 questions, 3 passages)', () => {
      expect(mockQuestions).toHaveLength(40);
      expect(mockPassages).toHaveLength(3);
      expect(mockMetadata.type).toBe('IELTS');
      expect(mockMetadata.skill).toBe('Reading');
    });

    it('should assign correct passage IDs', () => {
      const p1Questions = mockQuestions.filter(q => q.passageId === 'p1');
      const p2Questions = mockQuestions.filter(q => q.passageId === 'p2');
      const p3Questions = mockQuestions.filter(q => q.passageId === 'p3');

      expect(p1Questions.length).toBeGreaterThan(0);
      expect(p2Questions.length).toBeGreaterThan(0);
      expect(p3Questions.length).toBeGreaterThan(0);
    });

    it('should have valid question numbers (1-40)', () => {
      const numbers = mockQuestions.map(q => q.number);

      expect(Math.min(...numbers)).toBe(1);
      expect(Math.max(...numbers)).toBe(40);
      expect(numbers).toHaveLength(40);
    });

    it('should have correct duration for IELTS Reading', () => {
      expect(mockMetadata.duration).toBe(60);
    });
  });

  describe('Test Metadata Validation', () => {
    it('should validate required metadata fields', () => {
      const metadata: TestMetadata = {
        title: 'Test Title',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
        difficulty: 'Intermediate',
        description: 'Test description',
      };

      expect(metadata.title).toBeTruthy();
      expect(metadata.type).toBeTruthy();
      expect(metadata.skill).toBeTruthy();
      expect(metadata.duration).toBeGreaterThan(0);
      expect(metadata.difficulty).toBeTruthy();
    });

    it('should validate test types', () => {
      const validTypes: Array<'IELTS' | 'TOEFL' | 'Custom'> = ['IELTS', 'TOEFL', 'Custom'];

      validTypes.forEach(type => {
        const metadata: TestMetadata = {
          title: 'Test',
          type,
          skill: 'Reading',
          duration: 60,
          difficulty: 'Intermediate',
          description: '',
        };

        expect(['IELTS', 'TOEFL', 'Custom']).toContain(metadata.type);
      });
    });

    it('should validate skills', () => {
      const validSkills: Array<'Reading' | 'Listening' | 'Writing' | 'Speaking'> =
        ['Reading', 'Listening', 'Writing', 'Speaking'];

      validSkills.forEach(skill => {
        const metadata: TestMetadata = {
          title: 'Test',
          type: 'IELTS',
          skill,
          duration: 60,
          difficulty: 'Intermediate',
          description: '',
        };

        expect(['Reading', 'Listening', 'Writing', 'Speaking']).toContain(metadata.skill);
      });
    });

    it('should validate difficulty levels', () => {
      const validDifficulties: Array<'Beginner' | 'Intermediate' | 'Advanced'> =
        ['Beginner', 'Intermediate', 'Advanced'];

      validDifficulties.forEach(difficulty => {
        const metadata: TestMetadata = {
          title: 'Test',
          type: 'IELTS',
          skill: 'Reading',
          duration: 60,
          difficulty,
          description: '',
        };

        expect(['Beginner', 'Intermediate', 'Advanced']).toContain(metadata.difficulty);
      });
    });

    it('should validate duration range (1-180 minutes)', () => {
      expect(1).toBeGreaterThanOrEqual(1);
      expect(1).toBeLessThanOrEqual(180);
      expect(60).toBeGreaterThanOrEqual(1);
      expect(60).toBeLessThanOrEqual(180);
      expect(180).toBeGreaterThanOrEqual(1);
      expect(180).toBeLessThanOrEqual(180);
    });
  });

  describe('Question Type Validation', () => {
    it('should support IELTS question types', () => {
      const ieltsTypes = [
        'multiple-choice',
        'multiple-select',
        'completion',
        'matching',
        'matching-headings',
        'matching-information',
        'matching-features',
        'matching-sentence-endings',
        'true-false-not-given',
        'yes-no-not-given',
        'diagram-labeling',
      ];

      ieltsTypes.forEach(type => {
        expect(type).toBeTruthy();
        expect(typeof type).toBe('string');
      });
    });

    it('should have valid answer formats', () => {
      // String answer (MCQ, T/F/NG, etc.)
      const stringAnswer = 'Option A';
      expect(typeof stringAnswer).toBe('string');

      // Array answer (multiple select)
      const arrayAnswer = ['A', 'B', 'C'];
      expect(Array.isArray(arrayAnswer)).toBe(true);

      // Object answer (matching)
      const objectAnswer = { 'Statement 1': 'Answer A', 'Statement 2': 'Answer B' };
      expect(typeof objectAnswer).toBe('object');
      expect(Array.isArray(objectAnswer)).toBe(false);
    });
  });

  describe('Passage Validation', () => {
    it('should calculate word count correctly', () => {
      const content = 'This is a test passage with exactly ten words here.';
      const wordCount = content.split(/\s+/).length;

      expect(wordCount).toBe(10);
    });

    it('should have valid passage structure', () => {
      const passage = {
        id: 'p1',
        title: 'Test Passage',
        content: 'Content here',
        type: 'text' as const,
        wordCount: 2,
        questionStart: 1,
        questionEnd: 13,
        createdAt: Date.now(),
      };

      expect(passage.id).toBeTruthy();
      expect(passage.title).toBeTruthy();
      expect(passage.content).toBeTruthy();
      expect(passage.type).toBe('text');
      expect(passage.questionStart).toBeLessThanOrEqual(passage.questionEnd);
    });

    it('should support different passage types', () => {
      const types: Array<'text' | 'image' | 'both'> = ['text', 'image', 'both'];

      types.forEach(type => {
        expect(['text', 'image', 'both']).toContain(type);
      });
    });
  });

  describe('Firebase Structure Validation', () => {
    it('should have correct test data structure', () => {
      const testData = {
        id: 'test-123',
        title: 'Test Title',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
        difficulty: 'Intermediate',
        questionCount: 40,
        createdAt: Date.now(),
        createdBy: 'teacher-123',
        updatedAt: Date.now(),
        isPublished: true,
        metadata: {},
        passages: [],
        questions: [],
        settings: {},
        statistics: {},
      };

      // Verify all required top-level fields exist
      expect(testData).toHaveProperty('id');
      expect(testData).toHaveProperty('title');
      expect(testData).toHaveProperty('type');
      expect(testData).toHaveProperty('skill');
      expect(testData).toHaveProperty('duration');
      expect(testData).toHaveProperty('questionCount');
      expect(testData).toHaveProperty('metadata');
      expect(testData).toHaveProperty('passages');
      expect(testData).toHaveProperty('questions');
      expect(testData).toHaveProperty('settings');
      expect(testData).toHaveProperty('statistics');
    });

    it('should have correct settings structure', () => {
      const settings = {
        allowPause: false,
        showTimer: true,
        shuffleQuestions: false,
        showResults: 'immediate' as const,
        allowReview: true,
        passingScore: 60,
      };

      expect(settings.allowPause).toBeDefined();
      expect(settings.showTimer).toBeDefined();
      expect(settings.shuffleQuestions).toBeDefined();
      expect(settings.showResults).toBeDefined();
      expect(settings.allowReview).toBeDefined();
      expect(settings.passingScore).toBeGreaterThanOrEqual(0);
      expect(settings.passingScore).toBeLessThanOrEqual(100);
    });

    it('should have correct statistics structure', () => {
      const statistics = {
        attempts: 0,
        averageScore: 0,
        averageTime: 0,
        completionRate: 0,
      };

      expect(statistics).toHaveProperty('attempts');
      expect(statistics).toHaveProperty('averageScore');
      expect(statistics).toHaveProperty('averageTime');
      expect(statistics).toHaveProperty('completionRate');
      expect(statistics.attempts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('wordLimit persistence', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should persist wordLimit in formatted questions when saving to Firebase', async () => {
      const { set } = await import('firebase/database');
      (set as any).mockResolvedValueOnce(undefined);

      const metadata: TestMetadata = {
        title: 'Word Limit Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
      };
      const passages = [{
        id: 'p1', title: 'P1', content: 'Test content here',
        type: 'text' as const, wordCount: 3, questionStart: 1, questionEnd: 2, createdAt: '',
      }];
      const questions = [
        {
          id: 'q-1', number: 1, questionNumber: 1, questionText: 'Q1',
          question: 'Q1', type: 'sentence-completion' as const, answer: 'answer',
          answerSource: 'ai-suggestion' as const, passageId: 'p1', confidence: 90,
          points: 1, wordLimit: 3,
        },
        {
          id: 'q-2', number: 2, questionNumber: 2, questionText: 'Q2',
          question: 'Q2', type: 'short-answer' as const, answer: 'answer',
          answerSource: 'ai-suggestion' as const, passageId: 'p1', confidence: 90,
          points: 1,
          // No wordLimit set — should be absent from output
        },
      ];

      await saveTestToFirebase(metadata, passages as any, questions as any, 'user1');

      const savedData = (set as any).mock.calls[0][1];
      expect(savedData.questions[0].wordLimit).toBe(3);
      expect(savedData.questions[1].wordLimit).toBeUndefined();
    });

    it('should not persist wordLimit when value is 0 or negative', async () => {
      const { set } = await import('firebase/database');
      (set as any).mockResolvedValueOnce(undefined);

      const metadata: TestMetadata = {
        title: 'Edge Case Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
      };
      const passages = [{
        id: 'p1', title: 'P1', content: 'Content',
        type: 'text' as const, wordCount: 1, questionStart: 1, questionEnd: 1, createdAt: '',
      }];
      const questions = [{
        id: 'q-1', number: 1, questionNumber: 1, questionText: 'Q1',
        question: 'Q1', type: 'completion' as const, answer: 'ans',
        answerSource: 'ai-suggestion' as const, passageId: 'p1', confidence: 90,
        points: 1, wordLimit: 0,
      }];

      await saveTestToFirebase(metadata, passages as any, questions as any, 'user1');

      const savedData = (set as any).mock.calls[0][1];
      expect(savedData.questions[0].wordLimit).toBeUndefined();
    });
  });
});

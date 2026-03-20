import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloTestData } from './useSoloTestData';
import { getStudentSafeTestFromFirebase } from '../../services/testStorage';

vi.mock('../../services/testStorage', () => ({
  getStudentSafeTestFromFirebase: vi.fn(),
}));

const mockStudentSafeTestData = {
  id: 'test-1',
  title: 'Practice Test',
  type: 'IELTS',
  skill: 'Reading',
  duration: 60,
  difficulty: 'Intermediate',
  questionCount: 1,
  createdAt: 1,
  createdBy: 'teacher-1',
  updatedAt: 1,
  isPublished: true,
  ownerId: 'teacher-1',
  isPublic: false,
  isComplete: true,
  metadata: {
    description: '',
    instructions: '',
    tags: [],
  },
  passages: [
    {
      id: 'passage-1',
      title: 'Passage 1',
      content: 'Hello world',
      type: 'text',
      wordCount: 2,
      questionStart: 1,
      questionEnd: 1,
      createdAt: 1,
    },
  ],
  questions: [
    {
      number: 1,
      type: 'multiple-choice',
      question: 'Q1',
      options: ['A', 'B'],
      passageId: 'passage-1',
      points: 1,
    },
  ],
  settings: {
    allowPause: false,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'immediate',
    allowReview: true,
    passingScore: 60,
  },
  statistics: {
    attempts: 0,
    averageScore: 0,
    averageTime: 0,
    completionRate: 0,
  },
} as any;

describe('useSoloTestData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStudentSafeTestFromFirebase).mockResolvedValue({
      success: true,
      data: mockStudentSafeTestData,
    });
  });

  it('loads the student-safe solo payload without hydrating grading refs', async () => {
    const { result } = renderHook(() =>
      useSoloTestData({ materialId: 'test-1' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.testData).not.toBeNull();
    });

    expect(getStudentSafeTestFromFirebase).toHaveBeenCalledWith('test-1');
    expect(result.current.testData?.questions[0]).not.toHaveProperty('answer');
    expect(result.current.questionsWithAnswersRef.current).toBeNull();
    expect(result.current.answerKeysRef.current).toBeNull();
    expect(result.current.activePassageId).toBe('passage-1');
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestData } from './useTestData';
import { getSessionStudentSafeTestData } from '../../services/testStorage';

const mockOnValue = vi.fn();

vi.mock('firebase/database', () => ({
  ref: vi.fn((_: unknown, path: string) => path),
  onValue: (...args: any[]) => mockOnValue(...args),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('../../services/testStorage', () => ({
  getSessionStudentSafeTestData: vi.fn(),
}));

vi.mock('../../services/sessionService', () => ({
  sessionService: {
    getPlayerId: vi.fn(() => 'student-1'),
    getPlayerName: vi.fn(() => 'Student One'),
    getSessionCode: vi.fn(() => 'SESSION123'),
  },
}));

const mockStudentSafeTestData = {
  id: 'test-1',
  title: 'Reading Test',
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

describe('useTestData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnValue.mockImplementation((_: string, callback: (snapshot: any) => void) => {
      callback({
        exists: () => true,
        val: () => ({
          testId: 'test-1',
        }),
      });

      return vi.fn();
    });

    vi.mocked(getSessionStudentSafeTestData).mockResolvedValue({
      success: true,
      data: mockStudentSafeTestData,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads the student-safe session payload without hydrating grading refs', async () => {
    const { result } = renderHook(() =>
      useTestData({ sessionCode: 'SESSION123' }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.testData).not.toBeNull();
    });

    expect(getSessionStudentSafeTestData).toHaveBeenCalledWith('SESSION123', 'test-1');
    expect(result.current.testData?.questions[0]).not.toHaveProperty('answer');
    expect(result.current.questionsWithAnswersRef.current).toBeNull();
    expect(result.current.answerKeysRef.current).toBeNull();
    expect(result.current.activePassageId).toBe('passage-1');
  });
});

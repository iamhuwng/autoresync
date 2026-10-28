import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloTestData } from './useSoloTestData';
import { getStudentSafeTestFromFirebase } from '../../services/testStorage';
import { readSoloProgress } from '../../services/soloProgress.service';
vi.mock('../../services/soloProgress.service', () => ({ readSoloProgress: vi.fn() }));

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
    vi.mocked(readSoloProgress).mockResolvedValue({ progress: null, matchedKey: null });
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

  it('uses the authorized immutable homework document again on reload without reading the current source', async () => {
    const initialTestData = { ...mockStudentSafeTestData, skill: 'Listening', versionId: 'assigned-version',
      audioSections: [{ number: 1, assetId: 'assigned-asset' }] };
    for (let reload = 0; reload < 2; reload++) {
      const { result, unmount } = renderHook(() => useSoloTestData({ materialId: 'test-1', initialTestData }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.testData).toBe(initialTestData);
      expect(result.current.questionsWithAnswersRef.current).toBeNull();
      unmount();
    }
    expect(getStudentSafeTestFromFirebase).not.toHaveBeenCalled();
  });

  it('resumes the saved Listening text version and uses the current version for a fresh attempt', async () => {
    const current = { ...mockStudentSafeTestData, skill: 'Listening', versionId: 'new-version' } as any;
    const saved = { ...current, versionId: 'old-version', questions: [{ number: 1, question: 'Original prompt' }] };
    vi.mocked(readSoloProgress).mockResolvedValue({ progress: { materialId: 'test-1', studentId: 'student-1', listeningDocument: saved } as any, matchedKey: 'progress' });
    const { result, rerender } = renderHook(({ resume }) => useSoloTestData({ materialId: 'test-1', initialTestData: current,
      studentId: 'student-1', resumeListeningProgress: resume }), { initialProps: { resume: true } });
    await waitFor(() => expect(result.current.testData?.versionId).toBe('old-version'));
    rerender({ resume: false });
    await waitFor(() => expect(result.current.testData?.versionId).toBe('new-version'));
  });

  it('ignores an older mutable read that finishes after pinned homework content arrives', async () => {
    let finishOld!: (value: any) => void;
    const pending = new Promise<any>(resolve => { finishOld = resolve; });
    vi.mocked(getStudentSafeTestFromFirebase).mockReturnValueOnce(pending);
    const pinned = { ...mockStudentSafeTestData, title: 'Assigned content' };
    const { result, rerender } = renderHook(({ initialTestData }: { initialTestData?: any }) =>
      useSoloTestData({ materialId: 'test-1', initialTestData }), { initialProps: { initialTestData: undefined } });
    rerender({ initialTestData: pinned });
    await waitFor(() => expect(result.current.testData).toBe(pinned));
    await act(async () => {
      finishOld({ success: true, data: { ...mockStudentSafeTestData, title: 'Current replacement' } });
      await pending;
    });
    expect(result.current.testData).toBe(pinned);
    expect(getStudentSafeTestFromFirebase).toHaveBeenCalledTimes(1);
  });
});

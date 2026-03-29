import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoSubmitDisconnectedStudents } from './autoSubmitDisconnected';

const { saveTestResultMock } = vi.hoisted(() => ({
  saveTestResultMock: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_database: any, path: string) => ({ path })),
  update: vi.fn(),
}));

vi.mock('../../services/testResults.service', () => ({
  saveTestResult: (...args: any[]) => saveTestResultMock(...args),
}));

describe('autoSubmitDisconnectedStudents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveTestResultMock.mockResolvedValue('result-zero-1');
  });

  it('persists a zero-answer fallback result instead of skipping the student', async () => {
    const results = await autoSubmitDisconnectedStudents(
      'SESSION-1',
      'TEST-1',
      [
        {
          studentId: 'student-1',
          name: 'Student One',
          answers: {},
          lastActivity: 0,
        },
      ],
      {
        title: 'Reading Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 30,
        questionCount: 19,
      },
      'teacher-1',
      1000,
    );

    expect(saveTestResultMock).toHaveBeenCalledWith(
      'SESSION-1',
      'TEST-1',
      'student-1',
      'Student One',
      expect.objectContaining({
        totalScore: 0,
        maxScore: 19,
        percentage: 0,
        summary: expect.objectContaining({
          totalQuestions: 19,
        }),
      }),
      expect.objectContaining({
        title: 'Reading Test',
      }),
      expect.any(Number),
      'teacher-1',
      false,
      undefined,
      undefined,
      expect.objectContaining({
        sessionCode: 'SESSION-1',
      }),
      undefined,
      undefined,
      {
        skipInitialFeedbackTrigger: true,
      }
    );
    expect(results).toEqual([
      expect.objectContaining({
        success: true,
        studentId: 'student-1',
        submittedCount: 0,
      }),
    ]);
  });
});

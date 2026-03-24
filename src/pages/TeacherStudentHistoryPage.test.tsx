import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherStudentHistoryPage from './TeacherStudentHistoryPage';

const { getStudentResultsMock, trackActionMock } = vi.hoisted(() => ({
  getStudentResultsMock: vi.fn(),
  trackActionMock: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    currentUser: { uid: 'teacher-1' },
  }),
}));

vi.mock('../services/testResults.service', () => ({
  getStudentResults: getStudentResultsMock,
}));

vi.mock('../hooks/useOwnershipCheck', () => ({
  useStudentDataAccessCheck: () => ({
    allowed: true,
    loading: false,
    denialReason: undefined,
  }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: trackActionMock,
  }),
}));

vi.mock('../components/modern', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardBody: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('../components/results/ProgressLineChart', () => ({
  ProgressLineChart: () => <div>Progress Chart</div>,
}));

vi.mock('../components/results/SkillRadarChart', () => ({
  SkillRadarChart: () => <div>Skill Radar</div>,
}));

vi.mock('../components/results/BandScoreProgress', () => ({
  BandScoreProgress: () => <div>Band Progress</div>,
}));

vi.mock('../components/results/ResultFilters', () => ({
  ResultFilters: () => <div>Filters</div>,
}));

describe('TeacherStudentHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getStudentResultsMock.mockResolvedValue([
      {
        resultId: 'result-1',
        sessionCode: 'session-1',
        testId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student One',
        totalScore: 18,
        maxScore: 20,
        percentage: 90,
        bandScore: 8,
        questionResults: [],
        correct: 18,
        incorrect: 2,
        partialCredit: 0,
        totalQuestions: 20,
        submittedAt: 1_700_000_000_000,
        timeElapsed: 900_000,
        testDuration: 3_600,
        createdAt: 1_700_000_000_000,
        testTitle: 'Reading Test',
        testType: 'test',
        testSkill: 'reading',
      },
    ]);
  });

  it('opens permanent result detail when a teacher clicks View', async () => {
    render(
      <MemoryRouter initialEntries={['/teacher/student/student-1/history']}>
        <Routes>
          <Route path="/teacher/student/:studentId/history" element={<TeacherStudentHistoryPage />} />
          <Route path="/result/:resultId" element={<div>Result Detail Route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Student One's History");

    fireEvent.click(screen.getByRole('button', { name: /view/i }));

    await screen.findByText('Result Detail Route');

    await waitFor(() => {
      expect(trackActionMock).toHaveBeenCalledWith('viewResults', {
        source: 'teacher_student_history',
        resultId: 'result-1',
        studentId: 'student-1',
        sessionCode: 'session-1',
      });
    });
  });
});

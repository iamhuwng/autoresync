import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPracticePage from './StudentPracticePage';

const {
  getMock,
  ieltsPracticeViewPropsMock,
  refMock,
  resolvePracticeSettingsMock,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  ieltsPracticeViewPropsMock: vi.fn(),
  refMock: vi.fn(),
  resolvePracticeSettingsMock: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  getDatabase: vi.fn(() => ({})),
  onValue: vi.fn(),
  ref: (...args: unknown[]) => refMock(...args),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('../services/practiceSettingsResolver', () => ({
  resolvePracticeSettings: (...args: unknown[]) => resolvePracticeSettingsMock(...args),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'student-1', email: 'student@test.com' },
    profile: { fullName: 'Test Student', role: 'student' },
  }),
}));

vi.mock('../components/test/TestErrorBoundary', () => ({
  TestErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/practice/IELTSPracticeView', () => ({
  IELTSPracticeView: (props: unknown) => {
    ieltsPracticeViewPropsMock(props);
    return <div data-testid="ielts-practice-view" />;
  },
}));

vi.mock('../components/practice/THCSPracticeView', () => ({
  THCSPracticeView: () => <div data-testid="thcs-practice-view" />,
}));

vi.mock('../components/writing-practice/WritingPracticeView', () => ({
  default: () => <div data-testid="writing-practice-view" />,
}));

describe('StudentPracticePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    refMock.mockImplementation((_database: unknown, path: string) => ({ path }));
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path.endsWith('/testType')) {
          return 'IELTS';
        }

        if (target.path.endsWith('/skill')) {
          return 'Reading';
        }

        return null;
      },
      exists: () => false,
    }));
    resolvePracticeSettingsMock.mockResolvedValue(null);
  });

  it('preserves homework timer and attempt settings from the launch state', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/student/practice/material-1',
            state: {
              isHomework: true,
              homeworkId: 'hw-1',
              submissionId: 'submission-1',
              timerMinutes: 60,
              maxAttempts: 1,
            },
          },
        ]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ielts-practice-view')).toBeInTheDocument();
    });

    expect(ieltsPracticeViewPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'material-1',
      resolvedSettings: expect.objectContaining({
        timerMinutes: 60,
        maxAttempts: 1,
      }),
      practiceContext: expect.objectContaining({
        type: 'homework',
        homeworkId: 'hw-1',
        submissionId: 'submission-1',
      }),
    }));
  });
});

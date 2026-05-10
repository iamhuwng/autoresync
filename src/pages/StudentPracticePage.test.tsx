import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPracticePage from './StudentPracticePage';
import { READING_V2_PROJECTION_FIXTURES } from '../services/reading-v2/fixtures/readingV2ProjectionFixtures';

const {
  getMock,
  ieltsPracticeViewPropsMock,
  listeningPracticeViewPropsMock,
  writingPracticeViewPropsMock,
  trackActionMock,
  refMock,
  resolvePracticeSettingsMock,
  getHomeworkByIdMock,
  getEffectiveHomeworkDueDateMock,
  getSubmissionByIdMock,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  ieltsPracticeViewPropsMock: vi.fn(),
  listeningPracticeViewPropsMock: vi.fn(),
  writingPracticeViewPropsMock: vi.fn(),
  trackActionMock: vi.fn(),
  refMock: vi.fn(),
  resolvePracticeSettingsMock: vi.fn(),
  getHomeworkByIdMock: vi.fn(),
  getEffectiveHomeworkDueDateMock: vi.fn(),
  getSubmissionByIdMock: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (...args: unknown[]) => refMock(...args),
}));

vi.mock('../services/firebase', () => ({
  database: {},
  auth: { currentUser: null },
}));

vi.mock('../services/practiceSettingsResolver', () => ({
  resolvePracticeSettings: (...args: unknown[]) => resolvePracticeSettingsMock(...args),
}));

vi.mock('../services/reading-v2/readingV2LaunchIntegration.service', async () => {
  const actual = await vi.importActual<typeof import('../services/reading-v2/readingV2LaunchIntegration.service')>(
    '../services/reading-v2/readingV2LaunchIntegration.service',
  );

  return {
    ...actual,
    resolveReadingV2LaunchDecision: (input: Parameters<typeof actual.resolveReadingV2LaunchDecision>[0]) =>
      actual.resolveReadingV2LaunchDecision({
        ...input,
        rolloutMode: 'public',
      }),
  };
});

vi.mock('../services/homeworkManager', () => ({
  getHomeworkById: (...args: unknown[]) => getHomeworkByIdMock(...args),
  getEffectiveHomeworkDueDate: (...args: unknown[]) => getEffectiveHomeworkDueDateMock(...args),
}));

vi.mock('../services/homeworkSubmissionService', () => ({
  getSubmissionById: (...args: unknown[]) => getSubmissionByIdMock(...args),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'student-1' },
  }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: trackActionMock }),
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

vi.mock('../components/reading-v2/runtime/ReadingV2RuntimeShell', () => ({
  ReadingV2RuntimeShell: () => <div data-testid="reading-v2-runtime" />,
}));

vi.mock('../components/practice/ListeningPracticeView', () => ({
  default: (props: unknown) => {
    listeningPracticeViewPropsMock(props);
    return <div data-testid="listening-practice-view" />;
  },
}));

vi.mock('../components/writing-practice/WritingPracticeView', () => ({
  default: (props: unknown) => {
    writingPracticeViewPropsMock(props);
    return <div data-testid="writing-practice-view" />;
  },
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
    getHomeworkByIdMock.mockResolvedValue(null);
    getEffectiveHomeworkDueDateMock.mockReturnValue(0);
    getSubmissionByIdMock.mockResolvedValue(null);
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

  it('rehydrates writing homework context from canonical homework and submission records', async () => {
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path.endsWith('/testType')) {
          return 'IELTS';
        }

        if (target.path.endsWith('/skill')) {
          return 'Writing';
        }

        if (target.path === 'tests/material-writing-1') {
          return {
            id: 'material-writing-1',
            testType: 'IELTS',
            skill: 'Writing',
            metadata: {
              title: 'Writing Test',
              format: 'task1-only',
              duration: 60,
            },
            tasks: [],
          };
        }

        return null;
      },
      exists: () => target.path === 'tests/material-writing-1',
    }));
    getSubmissionByIdMock.mockResolvedValue({
      id: 'submission-1',
      studentId: 'student-1',
      homeworkId: 'hw-1',
      teacherId: 'teacher-from-submission',
      startedAt: 555,
      status: 'in_progress',
    });
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-1',
      createdBy: 'teacher-from-homework',
      config: {
        timerMinutes: 45,
        maxAttempts: 1,
        lateSubmissionAllowed: true,
      },
    });
    getEffectiveHomeworkDueDateMock.mockReturnValue(999);

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/student/practice/material-writing-1',
            state: {
              isHomework: true,
              homeworkId: 'hw-1',
              submissionId: 'submission-1',
              teacherId: 'stale-teacher',
              dueDate: 1,
              lateSubmissionAllowed: false,
              timerMinutes: 99,
              maxAttempts: 5,
              startedAt: 123,
              resumeFrom: {
                essays: { 1: 'Recovered essay', 2: '' },
              },
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
      expect(screen.getByTestId('writing-practice-view')).toBeInTheDocument();
    });

    expect(writingPracticeViewPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'material-writing-1',
      practiceContext: expect.objectContaining({
        mode: 'homework',
        homeworkId: 'hw-1',
        submissionId: 'submission-1',
      }),
      homeworkContext: expect.objectContaining({
        homeworkId: 'hw-1',
        submissionId: 'submission-1',
        teacherId: 'teacher-from-submission',
        dueDate: 999,
        lateSubmissionAllowed: true,
        timerMinutes: 45,
        maxAttempts: 1,
        startedAt: 555,
        previousEssay: { 1: 'Recovered essay', 2: '' },
      }),
    }));
  });

  it('routes listening-like IELTS materials to ListeningPracticeView even when skill metadata is missing', async () => {
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path.endsWith('/testType')) {
          return 'IELTS';
        }

        if (target.path.endsWith('/skill')) {
          return null;
        }

        if (target.path === 'tests/listening-material-1') {
          return {
            id: 'listening-material-1',
            testType: 'IELTS',
            skill: null,
          };
        }

        return null;
      },
      exists: () => target.path === 'tests/listening-material-1',
    }));

    render(
      <MemoryRouter initialEntries={['/student/practice/listening-material-1']}>
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('listening-practice-view')).toBeInTheDocument();
    });

    expect(listeningPracticeViewPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'listening-material-1',
      practiceContext: expect.objectContaining({
        type: 'self_study',
      }),
    }));
    expect(ieltsPracticeViewPropsMock).not.toHaveBeenCalled();
  });

  it('keeps legacy IELTS Reading V1 launches on the V1 interface without probing Reading V2 storage', async () => {
    getMock.mockImplementation(async (target: { path: string }) => {
      if (target.path.startsWith('reading_v2/')) {
        throw new Error(`Unexpected Reading V2 read for legacy launch: ${target.path}`);
      }

      return {
        val: () => {
          if (target.path === 'tests/legacy-reading-1') {
            return {
              id: 'legacy-reading-1',
              testType: 'IELTS',
              skill: 'Reading',
              skillType: 'reading',
            };
          }

          return null;
        },
        exists: () => target.path === 'tests/legacy-reading-1',
      };
    });

    render(
      <MemoryRouter initialEntries={['/student/practice/legacy-reading-1']}>
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ielts-practice-view')).toBeInTheDocument();
    });

    expect(refMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('reading_v2/'),
    );
    expect(ieltsPracticeViewPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'legacy-reading-1',
      practiceContext: expect.objectContaining({
        type: 'self_study',
      }),
    }));
  });

  it('routes explicitly marked Reading V2 materials to the Reading V2 runtime', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;

    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2') {
          return {
            id: 'material-v2',
            materialId: 'material-v2',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2:${snapshotVersionId}`) {
          return projection;
        }

        return null;
      },
      exists: () => [
        'tests/material-v2',
        `reading_v2/projections/student_safe_tests/material-v2:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter initialEntries={['/student/practice/material-v2']}>
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reading-v2-runtime')).toBeInTheDocument();
    });

    expect(ieltsPracticeViewPropsMock).not.toHaveBeenCalled();
    expect(refMock).not.toHaveBeenCalledWith({}, 'reading_v2/material_metadata/material-v2');
    expect(refMock).toHaveBeenCalledWith(
      {},
      `reading_v2/projections/student_safe_tests/material-v2:${snapshotVersionId}`,
    );
  });
});

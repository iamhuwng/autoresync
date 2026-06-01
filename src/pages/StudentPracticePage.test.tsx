import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  submitReadingV2RuntimeAttemptMock,
  readingV2RuntimePropsMock,
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
  submitReadingV2RuntimeAttemptMock: vi.fn(),
  readingV2RuntimePropsMock: vi.fn(),
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

vi.mock('../services/reading-v2/readingV2RuntimeSubmission.service', () => ({
  isReadingV2RuntimeSubmissionConfigured: () => true,
  submitReadingV2RuntimeAttempt: (...args: unknown[]) => submitReadingV2RuntimeAttemptMock(...args),
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
  ReadingV2RuntimeShell: (props: any) => {
    readingV2RuntimePropsMock(props);
    return (
      <div>
        <div data-testid="reading-v2-runtime" />
        {props.onSubmit ? (
          <button
            type="button"
            onClick={() => props.onSubmit({
              materialId: props.projection?.materialId,
              projectionId: props.projection?.projectionId,
              sourceSnapshotVersionId: props.projection?.sourceSnapshotVersionId,
              answers: {},
            })}
          >
            Submit Reading V2
          </button>
        ) : null}
      </div>
    );
  },
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
    submitReadingV2RuntimeAttemptMock.mockResolvedValue({ resultId: 'result-1', attemptId: 'attempt-1' });
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

  it('launches single Reading Passage homework from the assigned snapshot projection', async () => {
    const user = userEvent.setup();
    const projection = {
      ...READING_V2_PROJECTION_FIXTURES.studentSafe,
      materialId: 'passage-a',
      sourceSnapshotVersionId: 'snapshot-a',
      content: {
        ...READING_V2_PROJECTION_FIXTURES.studentSafe.content,
        title: 'Passage A',
        materialId: 'passage-a',
      },
    };
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-reading-passage',
      materialId: 'passage-a',
      materialType: 'reading-passage',
      materialTitle: 'Passage A',
      materialSkill: 'reading',
      config: { timerMinutes: 20, maxAttempts: 1 },
      readingPassageSnapshot: {
        passageMaterialId: 'passage-a',
        snapshotVersionId: 'snapshot-a',
        titleSnapshot: 'Passage A',
        questionCount: 10,
        testTypeIds: ['ielts'],
      },
    });
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => (
        target.path === 'reading_v2/projections/student_safe_tests/passage-a:snapshot-a'
          ? projection
          : null
      ),
      exists: () => target.path === 'reading_v2/projections/student_safe_tests/passage-a:snapshot-a',
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/passage-a',
          state: {
            isHomework: true,
            homeworkId: 'hw-reading-passage',
            submissionId: 'submission-1',
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reading-v2-runtime')).toBeInTheDocument();
    });

    expect(refMock).toHaveBeenCalledWith(
      {},
      'reading_v2/projections/student_safe_tests/passage-a:snapshot-a',
    );
    expect(readingV2RuntimePropsMock).toHaveBeenCalledWith(expect.objectContaining({
      projection: expect.objectContaining({
        materialId: 'passage-a',
        sourceSnapshotVersionId: 'snapshot-a',
      }),
    }));
    expect(trackActionMock).toHaveBeenCalledWith(
      'teacher_materials_reading_passage_homework_launched',
      expect.objectContaining({
        homeworkId: 'hw-reading-passage',
        materialId: 'passage-a',
        materialType: 'reading-passage',
        passageCount: 1,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Submit Reading V2' }));

    await waitFor(() => {
      expect(trackActionMock).toHaveBeenCalledWith(
        'teacher_materials_reading_passage_homework_submitted',
        expect.objectContaining({
          materialId: 'passage-a',
          resultId: 'result-1',
          attemptId: 'attempt-1',
          materialType: 'reading-passage',
        }),
      );
    });
    expect(ieltsPracticeViewPropsMock).not.toHaveBeenCalled();
  });

  it('launches Reading Passage set homework as one ordered Reading V2 runtime projection', async () => {
    const firstProjection = {
      ...READING_V2_PROJECTION_FIXTURES.studentSafe,
      materialId: 'passage-a',
      sourceSnapshotVersionId: 'snapshot-a',
      content: {
        ...READING_V2_PROJECTION_FIXTURES.studentSafe.content,
        title: 'Passage A',
        materialId: 'passage-a',
      },
    };
    const secondProjection = {
      ...READING_V2_PROJECTION_FIXTURES.studentSafe,
      materialId: 'passage-b',
      sourceSnapshotVersionId: 'snapshot-b',
      content: {
        ...READING_V2_PROJECTION_FIXTURES.studentSafe.content,
        title: 'Passage B',
        materialId: 'passage-b',
      },
    };
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-reading-set',
      materialId: 'reading-passage-set:hw-reading-set',
      materialType: 'reading-passage-set',
      materialTitle: 'Selected Reading Passages',
      materialSkill: 'reading',
      config: { timerMinutes: 40, maxAttempts: 1 },
      readingPassageSet: {
        titleSnapshot: 'Selected Reading Passages',
        items: [
          {
            order: 1,
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCount: 10,
            testTypeIds: ['ielts'],
          },
          {
            order: 2,
            passageMaterialId: 'passage-b',
            snapshotVersionId: 'snapshot-b',
            titleSnapshot: 'Passage B',
            questionCount: 10,
            testTypeIds: ['ielts'],
          },
        ],
      },
    });
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'reading_v2/projections/student_safe_tests/passage-a:snapshot-a') {
          return firstProjection;
        }

        if (target.path === 'reading_v2/projections/student_safe_tests/passage-b:snapshot-b') {
          return secondProjection;
        }

        return null;
      },
      exists: () => [
        'reading_v2/projections/student_safe_tests/passage-a:snapshot-a',
        'reading_v2/projections/student_safe_tests/passage-b:snapshot-b',
      ].includes(target.path),
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/reading-passage-set:hw-reading-set',
          state: {
            isHomework: true,
            homeworkId: 'hw-reading-set',
            submissionId: 'submission-1',
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reading-v2-runtime')).toBeInTheDocument();
    });

    const projection = readingV2RuntimePropsMock.mock.calls.at(-1)?.[0]?.projection;
    const interactionIds = projection.content.taskGroups.flatMap((group: { interactions: { interactionId: string }[] }) =>
      group.interactions.map((interaction) => interaction.interactionId),
    );

    expect(projection).toEqual(expect.objectContaining({
      projectionId: 'homework-set:hw-reading-set',
      materialId: 'reading-passage-set:hw-reading-set',
    }));
    expect(projection.content.title).toBe('Selected Reading Passages');
    expect(projection.content.sections[0].title).toContain('Passage 1: Passage A');
    expect(projection.content.sections.at(-1).title).toContain('Passage 2: Passage B');
    expect(interactionIds).toHaveLength(new Set(interactionIds).size);
  });
});

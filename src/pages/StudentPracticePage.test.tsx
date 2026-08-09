import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPracticePage from './StudentPracticePage';
import { READING_V2_PROJECTION_FIXTURES } from '../services/reading-v2/fixtures/readingV2ProjectionFixtures';
import { navigationService } from '../services/navigation.service';

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
  submitHomeworkMock,
  submitReadingV2RuntimeAttemptMock,
  isReadingV2RuntimeSubmissionConfiguredMock,
  readingV2RuntimePropsMock,
  useTestIntegrityMock,
  useAntiCopyPasteMock,
  useFullscreenModeMock,
  flushIntegrityEventsMock,
  getIntegrityReportMock,
  addIntegrityEventMock,
  resolveBookPlacementLaunchMock,
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
  submitHomeworkMock: vi.fn(),
  submitReadingV2RuntimeAttemptMock: vi.fn(),
  isReadingV2RuntimeSubmissionConfiguredMock: vi.fn(),
  readingV2RuntimePropsMock: vi.fn(),
  useTestIntegrityMock: vi.fn(),
  useAntiCopyPasteMock: vi.fn(),
  useFullscreenModeMock: vi.fn(),
  flushIntegrityEventsMock: vi.fn(),
  getIntegrityReportMock: vi.fn(),
  addIntegrityEventMock: vi.fn(),
  resolveBookPlacementLaunchMock: vi.fn(),
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

vi.mock('../services/book-delivery/bookPlacementLaunch.browser', async () => {
  const actual = await vi.importActual<typeof import('../services/book-delivery/bookPlacementLaunch.browser')>(
    '../services/book-delivery/bookPlacementLaunch.browser',
  );
  return {
    ...actual,
    resolveBookPlacementLaunch: (...args: unknown[]) => resolveBookPlacementLaunchMock(...args),
  };
});

vi.mock('../components/book-runtime/BookPlacementRuntimeHost', () => ({
  BookPlacementRuntimeHost: (props: {
    projection: unknown;
    onAction?: (action: string, metadata?: Record<string, unknown>) => void;
    onReturn?: () => void;
  }) => (
    <div data-testid="book-placement-runtime-host">
      Book runtime: {String((props.projection as { bindingId?: unknown }).bindingId)}
      {props.onReturn ? (
        <button
          type="button"
          onClick={() => {
            props.onAction?.('bookRuntimeReturn', { surface: 'course', outcome: 'returned' });
            props.onReturn?.();
          }}
        >
          Return
        </button>
      ) : null}
    </div>
  ),
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
  HomeworkSubmissionError: class HomeworkSubmissionError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.name = 'HomeworkSubmissionError';
      this.code = code;
    }
  },
  getSubmissionById: (...args: unknown[]) => getSubmissionByIdMock(...args),
  submitHomework: (...args: unknown[]) => submitHomeworkMock(...args),
}));

vi.mock('../services/reading-v2/readingV2RuntimeSubmission.service', () => ({
  isReadingV2RuntimeSubmissionConfigured: (...args: unknown[]) => isReadingV2RuntimeSubmissionConfiguredMock(...args),
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

vi.mock('../hooks/test/useTestIntegrity', () => ({
  useTestIntegrity: (...args: unknown[]) => useTestIntegrityMock(...args),
}));

vi.mock('../hooks/test/useAntiCopyPaste', () => ({
  useAntiCopyPaste: (...args: unknown[]) => useAntiCopyPasteMock(...args),
}));

vi.mock('../hooks/test/useFullscreenMode', () => ({
  useFullscreenMode: (...args: unknown[]) => useFullscreenModeMock(...args),
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
        {props.onExit ? (
          <button type="button" onClick={props.onExit}>
            Exit Reading V2
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

const RouteStateProbe = ({
  label,
  testId,
}: {
  label: string;
  testId: string;
}) => {
  const location = useLocation();
  return (
    <div>
      <span>{label}</span>
      <pre data-testid={testId}>{JSON.stringify(location.state ?? null)}</pre>
    </div>
  );
};

const mockReadingV2Launch = (input: {
  materialId: string;
  title?: string;
  durationMinutes?: number | null;
}) => {
  const fixture = READING_V2_PROJECTION_FIXTURES.studentSafe;
  const snapshotVersionId = fixture.sourceSnapshotVersionId;
  const materialTitle = input.title ?? 'Reading V2 Submit Test';
  const projection = {
    ...fixture,
    materialId: input.materialId,
    content: {
      ...fixture.content,
      title: materialTitle,
      materialId: input.materialId,
    },
  };

  getMock.mockImplementation(async (target: { path: string }) => ({
    val: () => {
      if (target.path === `tests/${input.materialId}`) {
        return {
          id: input.materialId,
          materialId: input.materialId,
          deliveryEngine: 'reading-v2',
          runtimeEngine: 'reading-v2',
          testType: 'IELTS',
          skill: 'Reading',
          skillType: 'reading-v2',
          durationMinutes: input.durationMinutes ?? 40,
          publishedSnapshotVersionId: snapshotVersionId,
        };
      }

      if (target.path === `reading_v2/projections/student_safe_tests/${input.materialId}:${snapshotVersionId}`) {
        return projection;
      }

      return null;
    },
    exists: () => [
      `tests/${input.materialId}`,
      `reading_v2/projections/student_safe_tests/${input.materialId}:${snapshotVersionId}`,
    ].includes(target.path),
  }));

  return projection;
};

describe('StudentPracticePage', () => {
  beforeEach(() => {
    navigationService.reset();
    vi.clearAllMocks();

    refMock.mockImplementation((_database: unknown, path: string) => ({ path }));
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path.endsWith('/testType')) {
          return 'IELTS';
        }

        if (target.path.endsWith('/skill')) {
          return 'Listening';
        }

        return null;
      },
      exists: () => false,
    }));
    resolvePracticeSettingsMock.mockResolvedValue(null);
    getHomeworkByIdMock.mockResolvedValue(null);
    getEffectiveHomeworkDueDateMock.mockReturnValue(0);
    getSubmissionByIdMock.mockResolvedValue(null);
    submitHomeworkMock.mockResolvedValue(undefined);
    isReadingV2RuntimeSubmissionConfiguredMock.mockReturnValue(true);
    submitReadingV2RuntimeAttemptMock.mockResolvedValue({
      resultId: 'result-1',
      attemptId: 'attempt-1',
      totalScore: 13,
      maxScore: 13,
      percentage: 100,
    });
    flushIntegrityEventsMock.mockResolvedValue(undefined);
    getIntegrityReportMock.mockReturnValue({
      violationCount: 1,
      totalEvents: 1,
      tabSwitchCount: 0,
      totalTimeAwayMs: 0,
      copyAttempts: 1,
      pasteAttempts: 0,
      rightClickAttempts: 0,
      fullscreenExitCount: 0,
      keyboardShortcutAttempts: 0,
      forceSubmitted: false,
      forceSubmittedBy: null,
      riskLevel: 'low',
      events: [],
    });
    useTestIntegrityMock.mockReturnValue({
      addEvent: addIntegrityEventMock,
      shouldAutoSubmit: false,
      flushEvents: flushIntegrityEventsMock,
      getIntegrityReport: getIntegrityReportMock,
    });
  });

  it('dispatches an explicit Book query before any legacy Firebase/test loading', async () => {
    const user = userEvent.setup();
    resolveBookPlacementLaunchMock.mockResolvedValue({
      status: 'resolved',
      projection: {
        bindingId: 'binding-1',
        bindingRevision: 1,
        recipientId: 'student-1',
        context: { kind: 'course', contextId: 'course-material-1' },
      },
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/student/practice/legacy-path?bookSurface=course&courseMaterialId=course-material-1&bindingId=binding-1',
        ]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('book-placement-runtime-host')).toHaveTextContent('binding-1');
    await user.click(screen.getByRole('button', { name: 'Return' }));
    expect(trackActionMock).toHaveBeenCalledWith('bookRuntimeReturn', expect.objectContaining({
      surface: 'course',
      outcome: 'returned',
    }));
    expect(resolveBookPlacementLaunchMock).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'student-1',
      launch: expect.objectContaining({
        kind: 'course',
        courseMaterialId: 'course-material-1',
        bindingId: 'binding-1',
      }),
    }));
    expect(getMock).not.toHaveBeenCalled();
    expect(refMock).not.toHaveBeenCalled();
  });

  it('dispatches the exact Class Book identity before any legacy Firebase/test loading', async () => {
    resolveBookPlacementLaunchMock.mockResolvedValue({
      status: 'resolved',
      projection: {
        bindingId: 'binding-1',
        bindingRevision: 1,
        recipientId: 'student-1',
        context: { kind: 'class', contextId: 'class-context-1' },
      },
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/student/practice/book-1?bookSurface=class&classId=class-1&copyId=copy-1&classPlacementId=placement-1&classCourseMaterialId=material-1&bindingId=binding-1',
        ]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('book-placement-runtime-host')).toHaveTextContent('binding-1');
    expect(resolveBookPlacementLaunchMock).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'student-1',
      launch: {
        kind: 'class',
        surface: 'class',
        explicit: true,
        classId: 'class-1',
        copyId: 'copy-1',
        classPlacementId: 'placement-1',
        classCourseMaterialId: 'material-1',
        bindingId: 'binding-1',
      },
    }));
    expect(getMock).not.toHaveBeenCalled();
    expect(refMock).not.toHaveBeenCalled();
  });

  it('tracks Return from an invalid explicit Book launch', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/student/practice/book-1?bookSurface=unknown']}>
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid');
    await user.click(screen.getByRole('button', { name: 'Return' }));
    expect(trackActionMock).toHaveBeenCalledWith('bookRuntimeReturn', {
      surface: 'unknown',
      reason: 'unsupported-surface',
      destination: 'courses',
      outcome: 'returned',
    });
  });

  it('preserves homework timer and attempt settings from the launch state', async () => {
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-1') {
          return {
            id: 'material-1',
            testType: 'IELTS',
            skill: 'Listening',
          };
        }

        if (target.path.endsWith('/testType')) {
          return 'IELTS';
        }

        if (target.path.endsWith('/skill')) {
          return 'Listening';
        }

        return null;
      },
      exists: () => target.path === 'tests/material-1',
    }));

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
      expect(screen.getByTestId('listening-practice-view')).toBeInTheDocument();
    });

    expect(listeningPracticeViewPropsMock).toHaveBeenCalledWith(expect.objectContaining({
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

  it('launches Worker-created THCS homework from the legacy tests path without a student-safe projection', async () => {
    const materialId = 'thcs-worker-1';
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === `tests/${materialId}`) {
          return {
            id: materialId,
            testType: 'THCS-THPT',
            skill: 'Reading',
            metadata: { title: 'THCS Test' },
          };
        }

        if (target.path === `student_safe_tests/${materialId}`) {
          return null;
        }

        if (target.path.endsWith('/testType')) {
          return 'THCS-THPT';
        }

        if (target.path.endsWith('/skill')) {
          return 'Reading';
        }

        return null;
      },
      exists: () => target.path === `tests/${materialId}`,
    }));
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-worker-1',
      createdBy: 'teacher-1',
      materialId,
      materialTitle: 'THCS Test',
      materialType: 'thcs-test',
      materialSkill: 'reading',
      contentRef: {
        contentKind: 'thcs_test',
        contentId: materialId,
        title: 'THCS Test',
      },
      config: {
        timerMinutes: 30,
        maxAttempts: 1,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: false,
      },
    });
    getSubmissionByIdMock.mockResolvedValue({
      id: 'submission-worker-1',
      studentId: 'student-1',
      homeworkId: 'hw-worker-1',
      teacherId: 'teacher-1',
      startedAt: 123,
      status: 'in_progress',
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/student/practice/${materialId}`,
            state: {
              isHomework: true,
              homeworkId: 'hw-worker-1',
              submissionId: 'submission-worker-1',
              timerMinutes: 30,
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
      expect(screen.getByTestId('thcs-practice-view')).toBeInTheDocument();
    });

    expect(getHomeworkByIdMock).toHaveBeenCalledWith('hw-worker-1');
    expect(refMock).toHaveBeenCalledWith({}, `tests/${materialId}`);
    expect(refMock).not.toHaveBeenCalledWith({}, `student_safe_tests/${materialId}`);
  });

  it.each([
    ['IELTS Listening', 'ielts-listening-worker-1', 'IELTS', 'Listening', 'ielts_listening', 'test', 'listening-practice-view', null],
    ['IELTS Writing', 'ielts-writing-worker-1', 'IELTS', 'Writing', 'ielts_writing', 'test', 'writing-practice-view', 'homework_student_safe_tests/hw-worker-1'],
    ['legacy IELTS Writing', 'ielts-writing-legacy-1', 'IELTS', 'Writing', 'ielts_writing', 'test', 'writing-practice-view', null],
  ])('launches Worker-created %s homework through compatibility fields', async (
    title,
    materialId,
    testType,
    skill,
    contentKind,
    materialType,
    expectedTestId,
    studentSafeTestPayloadPath,
  ) => {
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (studentSafeTestPayloadPath && target.path === studentSafeTestPayloadPath) {
          return {
            id: materialId,
            testType,
            skill,
            metadata: { title },
            tasks: [],
          };
        }

        if (target.path === `student_safe_tests/${materialId}`) {
          return {
            id: materialId,
            testType,
            skill,
            metadata: { title },
            tasks: skill === 'Writing' ? [] : undefined,
          };
        }

        if (target.path.endsWith('/testType')) {
          return testType;
        }

        if (target.path.endsWith('/skill')) {
          return skill;
        }

        return null;
      },
      exists: () => target.path === `student_safe_tests/${materialId}` || target.path === studentSafeTestPayloadPath,
    }));
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-worker-1',
      createdBy: 'teacher-1',
      materialId,
      materialTitle: title,
      materialType,
      materialSkill: String(skill).toLowerCase(),
      contentRef: {
        contentKind,
        contentId: materialId,
        title,
      },
      ...(studentSafeTestPayloadPath ? { studentSafeTestPayloadPath } : {}),
      config: {
        timerMinutes: 30,
        maxAttempts: 1,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: false,
      },
    });
    getSubmissionByIdMock.mockResolvedValue({
      id: 'submission-worker-1',
      studentId: 'student-1',
      homeworkId: 'hw-worker-1',
      teacherId: 'teacher-1',
      startedAt: 123,
      status: 'in_progress',
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/student/practice/${materialId}`,
            state: {
              isHomework: true,
              homeworkId: 'hw-worker-1',
              submissionId: 'submission-worker-1',
              timerMinutes: 30,
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
      expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
    });

    expect(getHomeworkByIdMock).toHaveBeenCalledWith('hw-worker-1');
    expect(refMock).toHaveBeenCalledWith({}, studentSafeTestPayloadPath || `student_safe_tests/${materialId}`);
  });

  it('fails closed for Worker-created IELTS Reading homework without a Reading V2 projection', async () => {
    const materialId = 'ielts-reading-worker-1';

    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === `student_safe_tests/${materialId}`) {
          return {
            id: materialId,
            testType: 'IELTS',
            skill: 'Reading',
            metadata: { title: 'IELTS Reading' },
          };
        }

        if (target.path.endsWith('/testType')) {
          return 'IELTS';
        }

        if (target.path.endsWith('/skill')) {
          return 'Reading';
        }

        return null;
      },
      exists: () => target.path === `student_safe_tests/${materialId}`,
    }));
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-worker-1',
      createdBy: 'teacher-1',
      materialId,
      materialTitle: 'IELTS Reading',
      materialType: 'test',
      materialSkill: 'reading',
      contentRef: {
        contentKind: 'ielts_reading',
        contentId: materialId,
        title: 'IELTS Reading',
      },
      config: {
        timerMinutes: 30,
        maxAttempts: 1,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: false,
      },
    });
    getSubmissionByIdMock.mockResolvedValue({
      id: 'submission-worker-1',
      studentId: 'student-1',
      homeworkId: 'hw-worker-1',
      teacherId: 'teacher-1',
      startedAt: 123,
      status: 'in_progress',
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/student/practice/${materialId}`,
            state: {
              isHomework: true,
              homeworkId: 'hw-worker-1',
              submissionId: 'submission-worker-1',
              timerMinutes: 30,
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

    expect(await screen.findAllByText('Material no longer available')).toHaveLength(2);
    expect(screen.queryByTestId('ielts-practice-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('listening-practice-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('writing-practice-view')).not.toBeInTheDocument();
    expect(ieltsPracticeViewPropsMock).not.toHaveBeenCalled();
  });

  it('launches private Worker-created IELTS Writing homework from its homework-scoped safe projection', async () => {
    const materialId = 'ielts-writing-private-1';
    const studentSafeTestPayloadPath = 'homework_student_safe_tests/hw-private-writing';
    getMock.mockImplementation(async (target: { path: string }) => {
      if (target.path === `tests/${materialId}`) {
        throw new Error('Permission denied');
      }

      if (target.path === `student_safe_tests/${materialId}`) {
        throw new Error('Global student_safe_tests must not be used for private Writing homework');
      }

      if (target.path === studentSafeTestPayloadPath) {
        return {
          val: () => ({
            id: materialId,
            testType: 'IELTS',
            skill: 'Writing',
            metadata: { title: 'Private Writing' },
            tasks: [{ taskNumber: 2, promptText: 'Discuss both views.' }],
          }),
          exists: () => true,
        };
      }

      return {
        val: () => null,
        exists: () => false,
      };
    });
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-private-writing',
      createdBy: 'teacher-1',
      materialId,
      materialTitle: 'Private Writing',
      materialType: 'test',
      materialSkill: 'writing',
      contentRef: {
        contentKind: 'ielts_writing',
        contentId: materialId,
        title: 'Private Writing',
      },
      studentSafeTestPayloadPath,
      config: {
        timerMinutes: null,
        maxAttempts: null,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: false,
      },
    });
    getSubmissionByIdMock.mockResolvedValue({
      id: 'submission-private-writing',
      studentId: 'student-1',
      homeworkId: 'hw-private-writing',
      teacherId: 'teacher-1',
      startedAt: 123,
      status: 'in_progress',
    });

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: `/student/practice/${materialId}`,
          state: {
            isHomework: true,
            homeworkId: 'hw-private-writing',
            submissionId: 'submission-private-writing',
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('writing-practice-view')).toBeInTheDocument();
    });

    expect(refMock).toHaveBeenCalledWith({}, studentSafeTestPayloadPath);
    expect(refMock).not.toHaveBeenCalledWith({}, `student_safe_tests/${materialId}`);
    expect(refMock).not.toHaveBeenCalledWith({}, `tests/${materialId}`);
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

  it('fails closed when IELTS skill metadata is missing even if the material id looks like listening', async () => {
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

    expect(await screen.findAllByText('Material no longer available')).toHaveLength(2);
    expect(screen.queryByTestId('listening-practice-view')).not.toBeInTheDocument();
    expect(ieltsPracticeViewPropsMock).not.toHaveBeenCalled();
  });

  it('fails closed for legacy IELTS Reading V1 launches without probing Reading V2 storage', async () => {
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

    expect(await screen.findAllByText('Material no longer available')).toHaveLength(2);

    expect(refMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('reading_v2/'),
    );
    expect(ieltsPracticeViewPropsMock).not.toHaveBeenCalled();
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
    expect(readingV2RuntimePropsMock).toHaveBeenLastCalledWith(expect.objectContaining({
      textSizeStorageKey: 'reading_text_size_student-1',
    }));
  });

  it('uses canonical homework timer settings for explicit Reading V2 homework launches', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;

    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-v2',
      materialId: 'material-v2-homework',
      materialType: 'test',
      materialTitle: 'Reading V2 Homework',
      materialSkill: 'reading',
      config: { timerMinutes: 25, maxAttempts: 1 },
    });
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2-homework') {
          return {
            id: 'material-v2-homework',
            materialId: 'material-v2-homework',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2-homework:${snapshotVersionId}`) {
          return {
            ...projection,
            materialId: 'material-v2-homework',
          };
        }

        return null;
      },
      exists: () => [
        'tests/material-v2-homework',
        `reading_v2/projections/student_safe_tests/material-v2-homework:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-homework',
          state: {
            isHomework: true,
            homeworkId: 'hw-v2',
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

    expect(readingV2RuntimePropsMock).toHaveBeenCalledWith(expect.objectContaining({
      timer: expect.objectContaining({
        durationMinutes: 25,
        autoSubmitOnExpiry: true,
      }),
    }));
  });

  it('enables Reading V2 homework anti-cheat and submits the integrity report', async () => {
    const user = userEvent.setup();
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;
    const antiCheatConfig = {
      preset: 'standard',
      detectTabSwitch: true,
      detectCopyPaste: true,
      detectRightClick: true,
      detectFullscreenExit: true,
      detectKeyboardShortcuts: true,
      enableStudentWarnings: true,
      enableAutoSubmit: true,
      autoSubmitThreshold: 5,
      requireFullscreen: true,
      shuffleQuestions: false,
      shuffleOptions: false,
      nullifyRemainingAttempts: false,
    };

    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-v2-integrity',
      materialId: 'material-v2-integrity',
      materialType: 'test',
      materialTitle: 'Reading V2 Integrity Homework',
      materialSkill: 'reading',
      antiCheatConfig,
      config: { timerMinutes: 25, maxAttempts: 1 },
    });
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2-integrity') {
          return {
            id: 'material-v2-integrity',
            materialId: 'material-v2-integrity',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2-integrity:${snapshotVersionId}`) {
          return {
            ...projection,
            materialId: 'material-v2-integrity',
          };
        }

        return null;
      },
      exists: () => [
        'tests/material-v2-integrity',
        `reading_v2/projections/student_safe_tests/material-v2-integrity:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-integrity',
          state: {
            isHomework: true,
            homeworkId: 'hw-v2-integrity',
            submissionId: 'submission-integrity',
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
          <Route path="/student/homework" element={<div>Homework submit destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Submit Reading V2' }));

    expect(useTestIntegrityMock).toHaveBeenLastCalledWith(expect.objectContaining({
      config: antiCheatConfig,
      context: 'homework',
      surface: 'reading_v2_practice',
      studentId: 'student-1',
      homeworkId: 'hw-v2-integrity',
      submissionId: 'submission-integrity',
    }));
    expect(useAntiCopyPasteMock).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: true,
      detectRightClick: true,
      detectKeyboardShortcuts: true,
      onEvent: addIntegrityEventMock,
    }));
    expect(useFullscreenModeMock).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: true,
      onFullscreenExit: addIntegrityEventMock,
    }));
    expect(flushIntegrityEventsMock).toHaveBeenCalledWith('reading_v2_practice_submit');
    expect(submitReadingV2RuntimeAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        integrityReport: expect.objectContaining({
          violationCount: 1,
          copyAttempts: 1,
        }),
      }),
      context: expect.objectContaining({
        surface: 'homework',
        homeworkId: 'hw-v2-integrity',
      }),
    }));
  });

  it('routes Reading V2 homework submissions to the homework list after trusted submit and homework update', async () => {
    const user = userEvent.setup();
    mockReadingV2Launch({
      materialId: 'material-v2-submit-homework',
      title: 'Reading V2 Homework Submit',
    });
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-v2-submit',
      materialId: 'material-v2-submit-homework',
      materialType: 'test',
      materialTitle: 'Reading V2 Homework Submit',
      materialSkill: 'reading',
      config: { timerMinutes: 40, maxAttempts: 1 },
    });

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-submit-homework',
          state: {
            isHomework: true,
            homeworkId: 'hw-v2-submit',
            submissionId: 'submission-v2-submit',
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
          <Route
            path="/student/homework"
            element={<RouteStateProbe label="Homework submit destination" testId="homework-submit-state" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Submit Reading V2' }));

    await waitFor(() => {
      expect(submitReadingV2RuntimeAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
        context: expect.objectContaining({
          surface: 'homework',
          homeworkId: 'hw-v2-submit',
        }),
      }));
      expect(submitHomeworkMock).toHaveBeenCalledWith(
        'submission-v2-submit',
        'result-1',
        13,
        13,
        100,
        undefined,
        expect.any(Number),
      );
    });
    expect(await screen.findByText('Homework submit destination')).toBeInTheDocument();
    expect(screen.getByTestId('homework-submit-state')).toHaveTextContent('"justSubmitted":true');
  });

  it('routes Reading V2 solo submissions to Academic Record with result state', async () => {
    const user = userEvent.setup();
    mockReadingV2Launch({
      materialId: 'material-v2-submit-solo',
      title: 'Reading V2 Solo Submit',
    });

    render(
      <MemoryRouter initialEntries={['/student/practice/material-v2-submit-solo']}>
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
          <Route
            path="/student/academic-record"
            element={<RouteStateProbe label="Academic Record destination" testId="academic-record-state" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Submit Reading V2' }));

    await waitFor(() => {
      expect(submitReadingV2RuntimeAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
        context: expect.objectContaining({
          surface: 'solo-practice',
        }),
      }));
    });
    expect(submitHomeworkMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Academic Record destination')).toBeInTheDocument();
    expect(screen.getByTestId('academic-record-state')).toHaveTextContent('"resultId":"result-1"');
    expect(screen.getByTestId('academic-record-state')).toHaveTextContent('"showResult":true');
  });

  it('routes Reading V2 public-library submissions to Academic Record with result state', async () => {
    const user = userEvent.setup();
    mockReadingV2Launch({
      materialId: 'material-v2-submit-library',
      title: 'Reading V2 Library Submit',
    });

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-submit-library',
          state: {
            context: {
              type: 'practice',
              source: {
                type: 'library',
                id: 'material-v2-submit-library',
                name: 'Public Library Reading V2',
              },
            },
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
          <Route
            path="/student/academic-record"
            element={<RouteStateProbe label="Academic Record destination" testId="academic-record-state" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Submit Reading V2' }));

    await waitFor(() => {
      expect(submitReadingV2RuntimeAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
        context: expect.objectContaining({
          surface: 'public-library',
          sourceName: 'Public Library Reading V2',
        }),
      }));
    });
    expect(submitHomeworkMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Academic Record destination')).toBeInTheDocument();
    expect(screen.getByTestId('academic-record-state')).toHaveTextContent('"resultId":"result-1"');
    expect(screen.getByTestId('academic-record-state')).toHaveTextContent('"showResult":true');
  });

  it('routes Reading V2 course-material submissions to Academic Record with result state', async () => {
    const user = userEvent.setup();
    mockReadingV2Launch({
      materialId: 'material-v2-submit-course',
      title: 'Reading V2 Course Submit',
    });
    resolvePracticeSettingsMock.mockResolvedValue({
      enabled: true,
      timerMinutes: 40,
      feedbackTiming: 'after_completion',
      maxAttempts: null,
      allowPause: true,
      minPassingScore: null,
      reading: { showTimer: true },
      listening: {
        allowReplay: true,
        maxReplays: null,
        allowSpeedControl: true,
        allowSkipSection: true,
        allowPauseAudio: true,
      },
      _sources: {},
    });

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-submit-course',
          state: {
            courseId: 'course-1',
            moduleId: 'module-1',
            courseName: 'IELTS Reading Course',
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
          <Route
            path="/student/academic-record"
            element={<RouteStateProbe label="Academic Record destination" testId="academic-record-state" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Submit Reading V2' }));

    await waitFor(() => {
      expect(submitReadingV2RuntimeAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
        context: expect.objectContaining({
          surface: 'course-material',
          courseId: 'course-1',
          moduleId: 'module-1',
        }),
      }));
    });
    expect(submitHomeworkMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Academic Record destination')).toBeInTheDocument();
    expect(screen.getByTestId('academic-record-state')).toHaveTextContent('"resultId":"result-1"');
    expect(screen.getByTestId('academic-record-state')).toHaveTextContent('"showResult":true');
  });

  it('leaves Reading V2 submit unavailable when the trusted endpoint is not configured', async () => {
    mockReadingV2Launch({
      materialId: 'material-v2-submit-unconfigured',
      title: 'Reading V2 Unconfigured Submit',
    });
    isReadingV2RuntimeSubmissionConfiguredMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/student/practice/material-v2-submit-unconfigured']}>
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');

    expect(readingV2RuntimePropsMock).toHaveBeenLastCalledWith(expect.objectContaining({
      onSubmit: undefined,
    }));
    expect(screen.queryByRole('button', { name: 'Submit Reading V2' })).not.toBeInTheDocument();
  });

  it('preserves explicitly untimed Reading V2 homework launches', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;

    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-v2-untimed',
      materialId: 'material-v2-untimed-homework',
      materialType: 'test',
      materialTitle: 'Untimed Reading V2 Homework',
      materialSkill: 'reading',
      config: { timerMinutes: null, maxAttempts: 1 },
    });
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2-untimed-homework') {
          return {
            id: 'material-v2-untimed-homework',
            materialId: 'material-v2-untimed-homework',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            durationMinutes: 35,
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2-untimed-homework:${snapshotVersionId}`) {
          return {
            ...projection,
            materialId: 'material-v2-untimed-homework',
          };
        }

        return null;
      },
      exists: () => [
        'tests/material-v2-untimed-homework',
        `reading_v2/projections/student_safe_tests/material-v2-untimed-homework:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-untimed-homework',
          state: {
            isHomework: true,
            homeworkId: 'hw-v2-untimed',
            submissionId: 'submission-1',
            timerMinutes: null,
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

    expect(readingV2RuntimePropsMock).toHaveBeenCalledWith(expect.objectContaining({
      timer: expect.objectContaining({
        durationMinutes: null,
        autoSubmitOnExpiry: true,
      }),
    }));
  });

  it('uses material duration for private solo Reading V2 launches', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;

    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2-private') {
          return {
            id: 'material-v2-private',
            materialId: 'material-v2-private',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            durationMinutes: 35,
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2-private:${snapshotVersionId}`) {
          return {
            ...projection,
            materialId: 'material-v2-private',
          };
        }

        return null;
      },
      exists: () => [
        'tests/material-v2-private',
        `reading_v2/projections/student_safe_tests/material-v2-private:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter initialEntries={['/student/practice/material-v2-private']}>
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reading-v2-runtime')).toBeInTheDocument();
    });

    expect(readingV2RuntimePropsMock).toHaveBeenCalledWith(expect.objectContaining({
      timer: expect.objectContaining({
        durationMinutes: 35,
        autoSubmitOnExpiry: true,
      }),
    }));
  });

  it('uses material duration for public-library Reading V2 launches', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;

    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2-public') {
          return {
            id: 'material-v2-public',
            materialId: 'material-v2-public',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            duration: 40,
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2-public:${snapshotVersionId}`) {
          return {
            ...projection,
            materialId: 'material-v2-public',
          };
        }

        return null;
      },
      exists: () => [
        'tests/material-v2-public',
        `reading_v2/projections/student_safe_tests/material-v2-public:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-public',
          state: {
            context: {
              type: 'practice',
              source: {
                type: 'library',
                id: 'material-v2-public',
                name: 'Public V2',
              },
            },
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

    expect(readingV2RuntimePropsMock).toHaveBeenCalledWith(expect.objectContaining({
      timer: expect.objectContaining({
        durationMinutes: 40,
        autoSubmitOnExpiry: true,
      }),
    }));
  });

  it('returns Reading V2 homework launches to the homework list from the exit button', async () => {
    const user = userEvent.setup();
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;

    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-v2-return',
      materialId: 'material-v2-return-homework',
      materialType: 'test',
      materialTitle: 'Reading V2 Homework',
      materialSkill: 'reading',
      config: { timerMinutes: 25, maxAttempts: 1 },
    });
    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2-return-homework') {
          return {
            id: 'material-v2-return-homework',
            materialId: 'material-v2-return-homework',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2-return-homework:${snapshotVersionId}`) {
          return {
            ...projection,
            materialId: 'material-v2-return-homework',
          };
        }

        return null;
      },
      exists: () => [
        'tests/material-v2-return-homework',
        `reading_v2/projections/student_safe_tests/material-v2-return-homework:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-return-homework',
          state: {
            isHomework: true,
            homeworkId: 'hw-v2-return',
            submissionId: 'submission-1',
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
          <Route path="/student/homework" element={<div>Homework return</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Exit Reading V2' }));

    expect(await screen.findByText('Homework return')).toBeInTheDocument();
    expect(trackActionMock).toHaveBeenCalledWith('leaveTest', expect.objectContaining({
      surface: 'homework',
      materialId: 'material-v2-return-homework',
    }));
  });

  it('returns Reading V2 solo practice launches from public library materials to the library', async () => {
    const user = userEvent.setup();
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const snapshotVersionId = projection.sourceSnapshotVersionId;

    getMock.mockImplementation(async (target: { path: string }) => ({
      val: () => {
        if (target.path === 'tests/material-v2-public-return') {
          return {
            id: 'material-v2-public-return',
            materialId: 'material-v2-public-return',
            deliveryEngine: 'reading-v2',
            runtimeEngine: 'reading-v2',
            testType: 'IELTS',
            skill: 'Reading',
            skillType: 'reading-v2',
            duration: 40,
            publishedSnapshotVersionId: snapshotVersionId,
          };
        }

        if (target.path === `reading_v2/projections/student_safe_tests/material-v2-public-return:${snapshotVersionId}`) {
          return {
            ...projection,
            materialId: 'material-v2-public-return',
          };
        }

        return null;
      },
      exists: () => [
        'tests/material-v2-public-return',
        `reading_v2/projections/student_safe_tests/material-v2-public-return:${snapshotVersionId}`,
      ].includes(target.path),
    }));

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student/practice/material-v2-public-return',
          state: {
            context: {
              type: 'practice',
              source: {
                type: 'library',
                id: 'material-v2-public-return',
                name: 'Public V2',
              },
            },
          },
        }]}
      >
        <Routes>
          <Route path="/student/practice/:materialId" element={<StudentPracticePage />} />
          <Route path="/student/library" element={<div>Library return</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Exit Reading V2' }));

    expect(await screen.findByText('Library return')).toBeInTheDocument();
    expect(trackActionMock).toHaveBeenCalledWith('leaveTest', expect.objectContaining({
      surface: 'public-library',
      materialId: 'material-v2-public-return',
    }));
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
          <Route path="/student/homework" element={<div>Homework submit destination</div>} />
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
    expect(submitHomeworkMock).toHaveBeenCalledWith(
      'submission-1',
      'result-1',
      13,
      13,
      100,
      undefined,
      expect.any(Number),
    );
    expect(ieltsPracticeViewPropsMock).not.toHaveBeenCalled();
  });

  it('replays assigned Reading Passage set homework from frozen snapshots after source passages are archived', async () => {
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
    getMock.mockImplementation(async (target: { path: string }) => {
      if (
        target.path.startsWith('reading_v2/material_metadata/') ||
        target.path.startsWith('reading_v2/reading_passage_materials/') ||
        target.path === 'tests/passage-a' ||
        target.path === 'tests/passage-b'
      ) {
        throw new Error(`Archived replay must not read current source state: ${target.path}`);
      }

      return {
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
      };
    });

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
    expect(refMock).toHaveBeenCalledWith(
      {},
      'reading_v2/projections/student_safe_tests/passage-a:snapshot-a',
    );
    expect(refMock).toHaveBeenCalledWith(
      {},
      'reading_v2/projections/student_safe_tests/passage-b:snapshot-b',
    );
    expect(refMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^reading_v2\/material_metadata\//),
    );
    expect(refMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^reading_v2\/reading_passage_materials\//),
    );
  });

  it('launches Reading Passage set homework from the pinned frozen assignment payload before reading current source projections', async () => {
    const frozenProjection = {
      ...READING_V2_PROJECTION_FIXTURES.studentSafe,
      projectionId: 'assignment:hw-reading-set:composition-version-1',
      materialId: 'reading-passage-set:hw-reading-set',
      assignmentManifest: {
        homeworkId: 'hw-reading-set',
        compositionId: 'composition-1',
        compositionVersionId: 'composition-version-1',
      },
      content: {
        ...READING_V2_PROJECTION_FIXTURES.studentSafe.content,
        title: 'Frozen Reading Passage Set',
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
        assignmentPayloadPath: 'reading_v2/projections/assignment_payloads/hw-reading-set:composition-version-1',
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
        ],
      },
    });
    getMock.mockImplementation(async (target: { path: string }) => {
      if (target.path.startsWith('reading_v2/projections/student_safe_tests/')) {
        throw new Error(`Frozen assignment launch must not read current passage projection: ${target.path}`);
      }

      return {
        val: () => (
          target.path === 'reading_v2/projections/assignment_payloads/hw-reading-set:composition-version-1'
            ? frozenProjection
            : null
        ),
        exists: () => target.path === 'reading_v2/projections/assignment_payloads/hw-reading-set:composition-version-1',
      };
    });

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
    expect(projection).toEqual(expect.objectContaining({
      projectionId: 'assignment:hw-reading-set:composition-version-1',
      assignmentManifest: expect.objectContaining({
        homeworkId: 'hw-reading-set',
      }),
    }));
    expect(refMock).toHaveBeenCalledWith(
      {},
      'reading_v2/projections/assignment_payloads/hw-reading-set:composition-version-1',
    );
    expect(refMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^reading_v2\/projections\/student_safe_tests\//),
    );
  });

  it('fails closed when a Reading Passage set homework points at a missing frozen assignment payload', async () => {
    getHomeworkByIdMock.mockResolvedValue({
      id: 'hw-reading-set',
      materialId: 'reading-passage-set:hw-reading-set',
      materialType: 'reading-passage-set',
      materialTitle: 'Selected Reading Passages',
      materialSkill: 'reading',
      config: { timerMinutes: 40, maxAttempts: 1 },
      readingPassageSet: {
        assignmentPayloadPath: 'reading_v2/projections/assignment_payloads/hw-reading-set:missing',
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
        ],
      },
    });
    getMock.mockImplementation(async () => ({
      val: () => null,
      exists: () => false,
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

    expect(await screen.findByText(/Error Loading Test/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load test information/i)).toBeInTheDocument();
    expect(refMock).toHaveBeenCalledWith(
      {},
      'reading_v2/projections/assignment_payloads/hw-reading-set:missing',
    );
    expect(refMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^reading_v2\/projections\/student_safe_tests\//),
    );
    expect(readingV2RuntimePropsMock).not.toHaveBeenCalled();
  });
});

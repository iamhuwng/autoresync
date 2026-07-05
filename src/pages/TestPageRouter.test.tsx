import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { READING_V2_ENGINE, READING_V2_ENGINE_FIELDS } from '../config/readingV2FeatureFlags';
import { READING_V2_PROJECTION_FIXTURES } from '../services/reading-v2/fixtures/readingV2ProjectionFixtures';
import TestPageRouter from './TestPageRouter';

const {
  mockGet,
  mockOnValue,
  mockRef,
  mockTrackAction,
  mockNavigateTo,
  mockGetPlayerId,
  readingV2RuntimePropsMock,
  submitReadingV2RuntimeAttemptMock,
  useTestIntegrityMock,
  useAntiCopyPasteMock,
  useFullscreenModeMock,
  useIntegrityRefreshRequestMock,
  flushIntegrityEventsMock,
  getIntegrityReportMock,
  addIntegrityEventMock,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockOnValue: vi.fn(),
  mockRef: vi.fn((_: unknown, path: string) => ({ path })),
  mockTrackAction: vi.fn(),
  mockNavigateTo: vi.fn(),
  mockGetPlayerId: vi.fn(() => 'student-1'),
  readingV2RuntimePropsMock: vi.fn(),
  submitReadingV2RuntimeAttemptMock: vi.fn(),
  useTestIntegrityMock: vi.fn(),
  useAntiCopyPasteMock: vi.fn(),
  useFullscreenModeMock: vi.fn(),
  useIntegrityRefreshRequestMock: vi.fn(),
  flushIntegrityEventsMock: vi.fn(),
  getIntegrityReportMock: vi.fn(),
  addIntegrityEventMock: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  database: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  onValue: (...args: unknown[]) => mockOnValue(...args),
  ref: (...args: unknown[]) => mockRef(...args),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
    handleSessionChange: vi.fn(),
    handleTestChange: vi.fn(),
    currentPath: '/student-test/FMQYME',
    isNavigating: false,
    navigationHistory: [],
    context: {},
  }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: mockTrackAction }),
}));

vi.mock('../services/sessionService', () => ({
  sessionService: {
    getPlayerId: () => mockGetPlayerId(),
  },
}));

vi.mock('../services/reading-v2/readingV2RuntimeSubmission.service', () => ({
  isReadingV2RuntimeSubmissionConfigured: () => true,
  submitReadingV2RuntimeAttempt: (...args: unknown[]) => submitReadingV2RuntimeAttemptMock(...args),
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

vi.mock('../hooks/test/useIntegrityRefreshRequest', () => ({
  useIntegrityRefreshRequest: (...args: unknown[]) => useIntegrityRefreshRequestMock(...args),
}));

vi.mock('../services/reading-v2/readingV2LaunchIntegration.service', async () => {
  const actual = await vi.importActual<typeof import('../services/reading-v2/readingV2LaunchIntegration.service')>(
    '../services/reading-v2/readingV2LaunchIntegration.service',
  );

  return {
    ...actual,
    resolveReadingV2LaunchDecision: (input: Parameters<typeof actual.resolveReadingV2LaunchDecision>[0]) => {
      const projection = input.projection as { projectionKind?: string } | undefined;
      if (input.surface === 'live-session' && projection?.projectionKind === 'session-safe') {
        return {
          status: 'runtime' as const,
          projection: {
            ...input.projection,
            deliveryEngine: READING_V2_ENGINE,
          },
        };
      }

      return actual.resolveReadingV2LaunchDecision(input);
    },
  };
});

vi.mock('../skills/listening/components/ListeningTestPage', () => ({
  default: () => <div>listening-page</div>,
}));

vi.mock('./StudentTestPage', () => ({
  default: () => <div>generic-page</div>,
}));

vi.mock('../components/thcs-student/THCSTestLayout', () => ({
  default: () => <div>thcs-page</div>,
}));

vi.mock('../components/writing-student/WritingTestPage', () => ({
  default: ({ testData }: any) => <div>writing-page:{testData?.title}</div>,
}));

vi.mock('../components/reading-v2/runtime/ReadingV2RuntimeShell', () => ({
  ReadingV2RuntimeShell: (props: any) => {
    readingV2RuntimePropsMock(props);
    return (
      <div>
        <div>reading-v2-runtime</div>
        {props.onSubmit ? (
          <button
            type="button"
            onClick={() => props.onSubmit({
              materialId: props.projection?.materialId,
              projectionId: props.projection?.projectionId,
              sourceSnapshotVersionId: props.projection?.sourceSnapshotVersionId,
              answers: [{
                interactionId: 'interaction-1',
                taskGroupId: 'task-group-1',
                visibleNumber: 1,
                value: 'A',
              }],
            })}
          >
            Submit Reading V2
          </button>
        ) : null}
      </div>
    );
  },
}));

function createSnapshot(value: any, exists = true) {
  return {
    exists: () => exists,
    val: () => value,
  };
}

function renderRouter() {
  return render(
    <MemoryRouter initialEntries={['/student-test/FMQYME']}>
      <Routes>
        <Route path="/student-test/:sessionCode" element={<TestPageRouter />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TestPageRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlayerId.mockReturnValue('student-1');
    mockOnValue.mockReturnValue(vi.fn());
    submitReadingV2RuntimeAttemptMock.mockResolvedValue({
      resultId: 'result-1',
      attemptId: 'attempt-1',
      totalScore: 1,
      maxScore: 1,
      percentage: 100,
    });
    flushIntegrityEventsMock.mockResolvedValue(undefined);
    getIntegrityReportMock.mockReturnValue({
      violationCount: 1,
      totalEvents: 1,
      tabSwitchCount: 1,
      totalTimeAwayMs: 3000,
      copyAttempts: 0,
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
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('writing-test-1');
        case 'tests/writing-test-1/testType':
          return createSnapshot('IELTS');
        case 'tests/writing-test-1/skill':
          return createSnapshot('Writing');
        case 'tests/writing-test-1':
          return createSnapshot({
            id: 'writing-test-1',
            title: 'IELTS Writing Mock',
            type: 'IELTS',
            testType: 'IELTS',
            skill: 'Writing',
            metadata: {
              title: 'IELTS Writing Mock',
              format: 'task2-only',
            },
            tasks: [],
          });
        default:
          return createSnapshot(null, false);
      }
    });
  });

  it('does not import the retired Reading V1 runtime', () => {
    const source = readFileSync('src/pages/TestPageRouter.tsx', 'utf8');

    expect(source).not.toContain('ReadingTestPage');
    expect(source).not.toContain('../skills/reading/components/ReadingTestPage');
  });

  it('routes IELTS writing tests with testType set to the writing page', async () => {
    renderRouter();

    expect(await screen.findByText('writing-page:IELTS Writing Mock')).toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it('fails closed when the live session testId read is denied', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      if (path === 'game_sessions/FMQYME/testId') {
        throw new Error('Permission denied');
      }
      return createSnapshot(null, false);
    });

    renderRouter();

    expect(await screen.findAllByText('Material no longer available')).toHaveLength(2);
    expect(screen.queryByText('Failed to load test information')).not.toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalledWith(
      'Error detecting test skill:',
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  it('fails closed when IELTS skill metadata is missing even if the test id looks like listening', async () => {
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('listening-test-1');
        case 'tests/listening-test-1/testType':
          return createSnapshot('IELTS');
        case 'tests/listening-test-1/skill':
          return createSnapshot(null, false);
        default:
          return createSnapshot(null, false);
      }
    });

    renderRouter();

    expect(await screen.findAllByText('Material no longer available')).toHaveLength(2);
    expect(screen.queryByText('listening-page')).not.toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it('fails closed for explicit IELTS Reading without a Reading V2 projection', async () => {
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('reading-test-1');
        case 'tests/reading-test-1/testType':
          return createSnapshot('IELTS');
        case 'tests/reading-test-1/skill':
          return createSnapshot('Reading');
        default:
          return createSnapshot(null, false);
      }
    });

    renderRouter();

    expect(await screen.findAllByText('Material no longer available')).toHaveLength(2);
    expect(screen.queryByText('listening-page')).not.toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it('fails closed when live testType metadata is absent', async () => {
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('unknown-test-1');
        case 'tests/unknown-test-1/testType':
          return createSnapshot(null, false);
        default:
          return createSnapshot(null, false);
      }
    });

    renderRouter();

    expect(await screen.findAllByText('Material no longer available')).toHaveLength(2);
    expect(screen.queryByText('listening-page')).not.toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it('routes live Listening from session-safe payload when private test metadata is blocked', async () => {
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('listening-test-1');
        case 'tests/listening-test-1/testType':
          throw new Error('permission_denied');
        case 'session_test_payloads/FMQYME':
          return createSnapshot({
            testId: 'listening-test-1',
            testData: {
              skill: 'Listening',
            },
          });
        default:
          return createSnapshot(null, false);
      }
    });

    renderRouter();

    expect(await screen.findByText('listening-page')).toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it('routes live Listening from session-safe payload when optional Reading V2 metadata is blocked', async () => {
    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('listening-test-1');
        case 'game_sessions/FMQYME/readingV2':
          return createSnapshot(null, false);
        case 'reading_v2/material_metadata/listening-test-1':
          throw new Error('permission_denied');
        case 'session_test_payloads/FMQYME':
          return createSnapshot({
            testId: 'listening-test-1',
            testData: {
              skill: 'Listening',
            },
          });
        default:
          return createSnapshot(null, false);
      }
    });

    renderRouter();

    expect(await screen.findByText('listening-page')).toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it.each(READING_V2_ENGINE_FIELDS)(
    'fails closed when a Reading V2 %s marker is present',
    async (markerField) => {
      mockGet.mockImplementation(async ({ path }: { path: string }) => {
        switch (path) {
          case 'game_sessions/FMQYME/testId':
            return createSnapshot('reading-v2-test-1');
          case 'tests/reading-v2-test-1/testType':
            return createSnapshot('IELTS');
          case `tests/reading-v2-test-1/${markerField}`:
            return createSnapshot('reading-v2');
          default:
            return createSnapshot(null, false);
        }
      });

      renderRouter();

      expect(
        await screen.findByText(
          'Reading V2 payloads require a published session-safe projection before launch.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('reading-page')).not.toBeInTheDocument();
      expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
    },
  );

  it('redirects a submitted Reading V2 live student to the waiting-room result handoff', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.sessionSafe;
    const metadata = {
      materialId: 'reading-v2-material-1',
      deliveryEngine: READING_V2_ENGINE,
      productLabel: 'Reading V2',
      title: 'Reading V2 Live Test',
      materialKind: 'full-test',
      durationMinutes: 60,
      difficulty: 'medium',
      tags: ['ielts'],
      visibility: 'class-only',
      publishedSnapshotVersionId: projection.sourceSnapshotVersionId,
    };

    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('reading-v2-material-1');
        case 'game_sessions/FMQYME/readingV2':
          return createSnapshot(metadata);
        case `reading_v2/projections/session_test_payloads/FMQYME:${projection.sourceSnapshotVersionId}`:
          return createSnapshot(projection);
        default:
          return createSnapshot(null, false);
      }
    });

    mockOnValue.mockImplementation((_sessionRef, callback: (snapshot: ReturnType<typeof createSnapshot>) => void) => {
      callback(createSnapshot({
        status: 'in-progress',
        testId: 'reading-v2-material-1',
        players: {
          'student-1': {
            hasCompletedTest: true,
            hasSubmitted: true,
            isSubmitted: true,
            latestResultId: 'result-1',
          },
        },
        students: {
          'student-1': {
            readingV2: {
              submitted: true,
              resultId: 'result-1',
            },
          },
        },
      }));
      return vi.fn();
    });

    renderRouter();

    await waitFor(() => {
      expect(mockNavigateTo).toHaveBeenCalledWith(
        'STUDENT_WAITING',
        { gameSessionId: 'FMQYME' },
        expect.objectContaining({
          reason: 'reading_v2_student_completed',
          replace: true,
          state: expect.objectContaining({
            showResults: true,
            sessionCode: 'FMQYME',
            testId: 'reading-v2-material-1',
            resultId: 'result-1',
          }),
        }),
      );
    });

    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it('passes live Reading V2 timer and force-submit state to the runtime shell', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.sessionSafe;
    const metadata = {
      materialId: 'reading-v2-material-1',
      deliveryEngine: READING_V2_ENGINE,
      productLabel: 'Reading V2',
      title: 'Reading V2 Live Test',
      materialKind: 'full-test',
      durationMinutes: 60,
      difficulty: 'medium',
      tags: ['ielts'],
      visibility: 'class-only',
      publishedSnapshotVersionId: projection.sourceSnapshotVersionId,
    };

    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('reading-v2-material-1');
        case 'game_sessions/FMQYME/readingV2':
          return createSnapshot(metadata);
        case `reading_v2/projections/session_test_payloads/FMQYME:${projection.sourceSnapshotVersionId}`:
          return createSnapshot(projection);
        default:
          return createSnapshot(null, false);
      }
    });

    mockOnValue.mockImplementation((_sessionRef, callback: (snapshot: ReturnType<typeof createSnapshot>) => void) => {
      callback(createSnapshot({
        status: 'in-progress',
        testId: 'reading-v2-material-1',
        startTime: 123456,
        duration: 45,
        pausedDuration: 5000,
        players: {
          'student-1': {
            forceSubmitRequestedAt: 7890,
          },
        },
      }));
      return vi.fn();
    });

    renderRouter();

    expect(await screen.findByText('reading-v2-runtime')).toBeInTheDocument();

    await waitFor(() => {
      expect(readingV2RuntimePropsMock).toHaveBeenLastCalledWith(expect.objectContaining({
        textSizeStorageKey: 'reading_text_size_student-1',
        lifecycle: expect.objectContaining({
          status: 'in-progress',
          forceSubmitToken: 7890,
        }),
        timer: expect.objectContaining({
          durationMinutes: 45,
          startedAt: 123456,
          pausedDurationMs: 5000,
          running: true,
          autoSubmitOnExpiry: true,
        }),
      }));
    });
  });

  it('enables Reading V2 live anti-cheat and submits the integrity report', async () => {
    const projection = READING_V2_PROJECTION_FIXTURES.sessionSafe;
    const metadata = {
      materialId: 'reading-v2-material-1',
      deliveryEngine: READING_V2_ENGINE,
      productLabel: 'Reading V2',
      title: 'Reading V2 Live Test',
      materialKind: 'full-test',
      durationMinutes: 60,
      difficulty: 'medium',
      tags: ['ielts'],
      visibility: 'class-only',
      publishedSnapshotVersionId: projection.sourceSnapshotVersionId,
    };
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

    mockGet.mockImplementation(async ({ path }: { path: string }) => {
      switch (path) {
        case 'game_sessions/FMQYME/testId':
          return createSnapshot('reading-v2-material-1');
        case 'game_sessions/FMQYME/readingV2':
          return createSnapshot(metadata);
        case `reading_v2/projections/session_test_payloads/FMQYME:${projection.sourceSnapshotVersionId}`:
          return createSnapshot(projection);
        default:
          return createSnapshot(null, false);
      }
    });

    mockOnValue.mockImplementation((_sessionRef, callback: (snapshot: ReturnType<typeof createSnapshot>) => void) => {
      callback(createSnapshot({
        status: 'in-progress',
        testId: 'reading-v2-material-1',
        startTime: 123456,
        duration: 45,
        antiCheatConfig,
        integrityRefreshRequestedAt: 9999,
        players: {
          'student-1': {},
        },
      }));
      return vi.fn();
    });

    const user = await import('@testing-library/user-event').then((mod) => mod.default.setup());

    renderRouter();

    await screen.findByText('reading-v2-runtime');
    await user.click(screen.getByRole('button', { name: 'Submit Reading V2' }));

    expect(useTestIntegrityMock).toHaveBeenLastCalledWith(expect.objectContaining({
      config: antiCheatConfig,
      context: 'session',
      surface: 'reading_v2_live_session',
      sessionCode: 'FMQYME',
      studentId: 'student-1',
      testId: projection.materialId,
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
    expect(useIntegrityRefreshRequestMock).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: true,
      requestTimestamp: 9999,
    }));
    expect(flushIntegrityEventsMock).toHaveBeenCalledWith('reading_v2_live_submit');
    expect(submitReadingV2RuntimeAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        integrityReport: expect.objectContaining({
          violationCount: 1,
          tabSwitchCount: 1,
        }),
      }),
      context: expect.objectContaining({
        surface: 'live-session',
        sessionCode: 'FMQYME',
      }),
    }));
  });
});

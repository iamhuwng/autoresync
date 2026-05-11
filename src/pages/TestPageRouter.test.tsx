import { render, screen, waitFor } from '@testing-library/react';
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
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockOnValue: vi.fn(),
  mockRef: vi.fn((_: unknown, path: string) => ({ path })),
  mockTrackAction: vi.fn(),
  mockNavigateTo: vi.fn(),
  mockGetPlayerId: vi.fn(() => 'student-1'),
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

vi.mock('../skills/reading/components/ReadingTestPage', () => ({
  default: () => <div>reading-page</div>,
}));

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
  ReadingV2RuntimeShell: () => <div>reading-v2-runtime</div>,
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

  it('routes IELTS writing tests with testType set to the writing page', async () => {
    renderRouter();

    expect(await screen.findByText('writing-page:IELTS Writing Mock')).toBeInTheDocument();
    expect(screen.queryByText('generic-page')).not.toBeInTheDocument();
  });

  it('routes listening-like IELTS test ids to ListeningTestPage when skill metadata is missing', async () => {
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
});

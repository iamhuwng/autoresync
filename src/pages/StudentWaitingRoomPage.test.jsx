import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudentWaitingRoomPage from './StudentWaitingRoomPage';

const {
  mockNavigateTo,
  mockUseAuth,
  onValueMock,
  getMock,
  setMock,
  updateMock,
  onDisconnectUpdateMock,
  mockSessionService,
} = vi.hoisted(() => ({
  mockNavigateTo: vi.fn(),
  mockUseAuth: vi.fn(),
  onValueMock: vi.fn(),
  getMock: vi.fn(),
  setMock: vi.fn(),
  updateMock: vi.fn(),
  onDisconnectUpdateMock: vi.fn(),
  mockSessionService: {
    getPlayerId: vi.fn(),
    getPlayerName: vi.fn(),
    setPlayerId: vi.fn(),
    setPlayerName: vi.fn(),
    setSessionCode: vi.fn(),
    clearSession: vi.fn(),
  },
}));

const listenerRegistry = new Map();
let latestModalProps = null;

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
  }),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../services/sessionService', () => ({
  sessionService: mockSessionService,
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_database, path) => path),
  onValue: (...args) => onValueMock(...args),
  get: (...args) => getMock(...args),
  set: (...args) => setMock(...args),
  update: (...args) => updateMock(...args),
  onDisconnect: vi.fn(() => ({
    update: onDisconnectUpdateMock,
  })),
}));

vi.mock('../components/CustomAvatar.jsx', () => ({
  default: ({ name }) => <div data-testid="avatar">{name}</div>,
}));

vi.mock('../components/test/TestResultsModal', () => ({
  TestResultsModal: (props) => {
    latestModalProps = props;
    return (
      <div
        data-testid="results-modal"
        data-opened={props.opened ? 'true' : 'false'}
        data-review-state={props.reviewReleaseState || 'undefined'}
      >
        {props.opened ? 'open' : 'closed'}
      </div>
    );
  },
}));

function renderPage(state = { showResults: true, testId: 'test-1' }) {
  return render(
    <MantineProvider>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/student-wait/ABC123',
            state,
          },
        ]}
      >
        <Routes>
          <Route path="/student-wait/:gameSessionId" element={<StudentWaitingRoomPage />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('StudentWaitingRoomPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    listenerRegistry.clear();
    latestModalProps = null;

    mockUseAuth.mockReturnValue({ user: null });
    mockSessionService.getPlayerId.mockReturnValue('player-123');
    mockSessionService.getPlayerName.mockReturnValue('Test Student');
    getMock.mockResolvedValue({
      exists: () => true,
      key: 'test-1',
      val: () => ({ title: 'Active Test' }),
    });
    setMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    onDisconnectUpdateMock.mockResolvedValue(undefined);
    onValueMock.mockImplementation((refArg, success, error) => {
      const listeners = listenerRegistry.get(refArg) || [];
      listenerRegistry.set(refArg, [...listeners, { success, error }]);
      return () => {
        const current = listenerRegistry.get(refArg) || [];
        const next = current.filter((entry) => entry.success !== success || entry.error !== error);
        if (next.length === 0) {
          listenerRegistry.delete(refArg);
        } else {
          listenerRegistry.set(refArg, next);
        }
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  function emitSnapshot(path, data) {
    const listeners = listenerRegistry.get(path) || [];
    if (listeners.length === 0) {
      throw new Error(`No success listener registered for ${path}`);
    }

    act(() => {
      listeners.forEach(({ success }) => {
        success({
          val: () => data,
        });
      });
    });
  }

  function emitError(path, error) {
    const listeners = (listenerRegistry.get(path) || []).filter((entry) => entry.error);
    if (listeners.length === 0) {
      throw new Error(`No error listener registered for ${path}`);
    }

    act(() => {
      listeners.forEach(({ error: errorHandler }) => {
        errorHandler(error);
      });
    });
  }

  it('seeds the modal with the navigation-state review release value', async () => {
    renderPage({ showResults: true, testId: 'test-1', reviewReleaseState: 'review-released' });

    await waitFor(() => {
      expect(listenerRegistry.has('game_sessions/ABC123')).toBe(true);
    });

    expect(screen.getByTestId('results-modal')).toHaveAttribute('data-opened', 'true');
    expect(screen.getByTestId('results-modal')).toHaveAttribute('data-review-state', 'review-released');
    expect(latestModalProps.reviewReleaseState).toBe('review-released');
  });

  it('updates the modal review state when the teacher monitor changes the session release', async () => {
    renderPage();

    await waitFor(() => {
      expect(listenerRegistry.has('game_sessions/ABC123')).toBe(true);
    });

    expect(screen.getByTestId('results-modal')).toHaveAttribute('data-review-state', 'locked-review');

    emitSnapshot('game_sessions/ABC123', {
      status: 'waiting',
      lastTestId: 'test-1',
      reviewReleaseState: 'review-released',
      players: {
        'player-123': {
          name: 'Test Student',
          lastTestId: 'test-1',
          lastTestSessionCode: 'ABC123',
          lastTestEndedAt: Date.now(),
        },
      },
    });
    expect(screen.getByTestId('results-modal')).toHaveAttribute('data-review-state', 'review-released');

    emitSnapshot('game_sessions/ABC123', {
      status: 'waiting',
      lastTestId: 'test-1',
      reviewReleaseState: 'feedback-released',
      players: {
        'player-123': {
          name: 'Test Student',
          lastTestId: 'test-1',
          lastTestSessionCode: 'ABC123',
          lastTestEndedAt: Date.now(),
        },
      },
    });
    expect(screen.getByTestId('results-modal')).toHaveAttribute('data-review-state', 'feedback-released');
  });

  it('fails closed to locked review when the release listener errors', async () => {
    renderPage({ showResults: true, testId: 'test-1', reviewReleaseState: 'feedback-released' });

    await waitFor(() => {
      expect(listenerRegistry.has('game_sessions/ABC123')).toBe(true);
    });

    expect(screen.getByTestId('results-modal')).toHaveAttribute('data-review-state', 'feedback-released');

    emitError('game_sessions/ABC123', new Error('permission denied'));

    expect(screen.getByTestId('results-modal')).toHaveAttribute('data-review-state', 'locked-review');
  });

  it('re-enters the active test when a teacher reset arrives for the current student', async () => {
    renderPage();

    await waitFor(() => {
      expect(listenerRegistry.has('game_sessions/ABC123')).toBe(true);
    });

    emitSnapshot('game_sessions/ABC123', {
      mode: 'test',
      testId: 'test-1',
      status: 'in-progress',
      players: {
        'player-123': {
          name: 'Test Student',
          submissionResetAt: 1_700_000_000_000,
        },
      },
    });

    await waitFor(() => {
      expect(mockNavigateTo).toHaveBeenCalledWith(
        'STUDENT_TEST',
        { sessionCode: 'ABC123' },
        { reason: 'submission_reset_resume' },
      );
    });
  });

  it('restores recent results from persistent player breadcrumbs when router state is missing', async () => {
    renderPage({});

    await waitFor(() => {
      expect(listenerRegistry.has('game_sessions/ABC123')).toBe(true);
    });

    emitSnapshot('game_sessions/ABC123', {
      status: 'waiting',
      lastTestId: 'test-1',
      lastTestCompletedAt: Date.now(),
      reviewReleaseState: 'review-released',
      players: {
        'player-123': {
          name: 'Test Student',
          lastTestId: 'test-1',
          lastTestSessionCode: 'ABC123',
          lastTestEndedAt: Date.now() - 1000,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('View Last Results')).toBeInTheDocument();
      expect(screen.getByTestId('results-modal')).toHaveAttribute('data-opened', 'true');
      expect(screen.getByTestId('results-modal')).toHaveAttribute('data-review-state', 'review-released');
    });
  });
});

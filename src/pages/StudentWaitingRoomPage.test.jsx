import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
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
  TestResultsModal: ({ opened }) => (
    <div data-testid="results-modal">{opened ? 'open' : 'closed'}</div>
  ),
}));

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/student-wait/ABC123',
            state: { showResults: true, testId: 'test-1' },
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
  let sessionListener;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionListener = undefined;

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
    onValueMock.mockImplementation((_ref, callback) => {
      sessionListener = callback;
      return () => {};
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('re-enters the active test when a teacher reset arrives for the current student', async () => {
    renderPage();

    await waitFor(() => {
      expect(sessionListener).toBeTypeOf('function');
    });

    act(() => {
      sessionListener({
        val: () => ({
          mode: 'test',
          testId: 'test-1',
          status: 'in-progress',
          players: {
            'player-123': {
              name: 'Test Student',
              submissionResetAt: 1_700_000_000_000,
            },
          },
        }),
      });
    });

    await waitFor(() => {
      expect(mockNavigateTo).toHaveBeenCalledWith(
        'STUDENT_TEST',
        { sessionCode: 'ABC123' },
        { reason: 'submission_reset_resume' },
      );
    });
  });
});

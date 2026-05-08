import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestSession } from './useTestSession';

const {
  mockOnDisconnectUpdate,
  mockOnValue,
  mockUpdate,
  mockGetPlayerId,
  mockGetPlayerName,
  sessionSnapshotListeners,
  connectionSnapshotListeners,
} = vi.hoisted(() => ({
  mockOnDisconnectUpdate: vi.fn(),
  mockOnValue: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetPlayerId: vi.fn(),
  mockGetPlayerName: vi.fn(),
  sessionSnapshotListeners: [] as Array<(snapshot: any) => void>,
  connectionSnapshotListeners: [] as Array<(snapshot: any) => void>,
}));

vi.mock('../../services/sessionService', () => ({
  sessionService: {
    getPlayerId: () => mockGetPlayerId(),
    getPlayerName: () => mockGetPlayerName(),
  },
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_: unknown, path: string) => path),
  onValue: (...args: unknown[]) => mockOnValue(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
  onDisconnect: vi.fn(() => ({
    update: (...args: unknown[]) => mockOnDisconnectUpdate(...args),
  })),
}));

describe('useTestSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sessionSnapshotListeners.length = 0;
    connectionSnapshotListeners.length = 0;
    mockGetPlayerId.mockReturnValue('player-1');
    mockGetPlayerName.mockReturnValue('Student One');
    mockUpdate.mockResolvedValue(undefined);
    mockOnDisconnectUpdate.mockResolvedValue(undefined);
    mockOnValue.mockImplementation((path: string, callback: (snapshot: any) => void) => {
      if (path === 'game_sessions/SESSION123') {
        sessionSnapshotListeners.push(callback);
      } else if (path === '.info/connected') {
        connectionSnapshotListeners.push(callback);
      }
      return vi.fn();
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('surfaces the current player mobileState from the session payload', async () => {
    const { result, unmount } = renderHook(() =>
      useTestSession({
        sessionCode: 'SESSION123',
        testData: { id: 'test-1', questions: [] },
        answers: {},
        testSubmitted: false,
        testResults: null,
      }),
    );

    await act(async () => {
      connectionSnapshotListeners.at(-1)?.({
        val: () => true,
      });
      sessionSnapshotListeners.at(-1)?.({
        exists: () => true,
        val: () => ({
          status: 'waiting',
          isPaused: false,
          players: {
            'player-1': {
              mobileState: {
                activePassageId: 'p2',
                questionSheetOpen: true,
                reviewSummaryOpen: false,
                passageScrollByPassage: { p2: 220 },
                activeQuestionGroupByPassage: { p2: 8 },
                questionSheetScrollByPassage: { p2: 72 },
                textSize: 19,
              },
            },
          },
        }),
      });
      await Promise.resolve();
    });

    expect(result.current.mobileState).toEqual(
      expect.objectContaining({
        activePassageId: 'p2',
        textSize: 19,
      }),
    );

    expect(result.current.sessionStatus).toBe('waiting');
    expect(result.current.isConnected).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      'game_sessions/SESSION123/players/player-1',
      expect.objectContaining({
        isConnected: true,
        lastActivity: expect.any(Number),
      }),
    );

    unmount();
  });
});

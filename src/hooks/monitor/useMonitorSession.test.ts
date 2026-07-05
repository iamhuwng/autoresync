import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitorSession } from './useMonitorSession';

const {
  mockOnValue,
  mockRef,
} = vi.hoisted(() => ({
  mockOnValue: vi.fn(),
  mockRef: vi.fn((_: unknown, path: string) => ({ path })),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  onValue: (...args: unknown[]) => mockOnValue(...args),
  ref: (...args: unknown[]) => mockRef(...args),
}));

vi.mock('../../utils/monitor', () => ({
  transformPlayerToStudentProgress: vi.fn(),
}));

describe('useMonitorSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces a live-session permission error instead of leaving the monitor blank', async () => {
    mockOnValue.mockImplementation((
      _sessionRef: unknown,
      _callback: unknown,
      onError?: (error: Error) => void,
    ) => {
      onError?.(new Error('Permission denied'));
      return vi.fn();
    });

    const { result } = renderHook(() => useMonitorSession('SMOKE'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Session not found or no longer available');
    });
    expect(result.current.session).toBeNull();
  });
});

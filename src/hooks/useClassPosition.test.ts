import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClassPosition } from './useClassPosition';

const { getClassTestScoresMock } = vi.hoisted(() => ({
  getClassTestScoresMock: vi.fn(),
}));

vi.mock('../services/testResults.service', () => ({
  getClassTestScores: (...args: unknown[]) => getClassTestScoresMock(...args),
}));

describe('useClassPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the privacy-safe empty state when class id is missing', () => {
    const { result } = renderHook(() => useClassPosition('test-1', undefined, 75));

    expect(result.current).toEqual({
      average: null,
      totalStudents: 0,
      position: null,
      loading: false,
      error: null,
    });
    expect(getClassTestScoresMock).not.toHaveBeenCalled();
  });

  it('computes average and above/at/below position from class scores', async () => {
    getClassTestScoresMock.mockResolvedValue([
      { percentage: 60 },
      { percentage: 70 },
      { percentage: 80 },
    ]);

    const { result, rerender } = renderHook(
      ({ percentage }) => useClassPosition('test-1', 'class-1', percentage),
      { initialProps: { percentage: 75 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getClassTestScoresMock).toHaveBeenCalledWith('test-1', 'class-1');
    expect(result.current.average).toBe(70);
    expect(result.current.totalStudents).toBe(3);
    expect(result.current.position).toBe('above');

    rerender({ percentage: 70.4 });

    await waitFor(() => {
      expect(result.current.position).toBe('at');
    });

    rerender({ percentage: 69 });

    await waitFor(() => {
      expect(result.current.position).toBe('below');
    });
  });

  it('returns null averages when no class scores exist', async () => {
    getClassTestScoresMock.mockResolvedValue([]);

    const { result } = renderHook(() => useClassPosition('test-1', 'class-1', 75));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.average).toBeNull();
    expect(result.current.totalStudents).toBe(0);
    expect(result.current.position).toBeNull();
  });

  it('surfaces service errors as a message string', async () => {
    getClassTestScoresMock.mockRejectedValue(new Error('class lookup failed'));

    const { result } = renderHook(() => useClassPosition('test-1', 'class-1', 75));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('class lookup failed');
  });
});

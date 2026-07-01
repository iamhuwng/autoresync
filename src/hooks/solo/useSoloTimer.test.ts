import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoloTimer } from './useSoloTimer';

const { notificationsShowMock } = vi.hoisted(() => ({
  notificationsShowMock: vi.fn(),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: notificationsShowMock,
  },
}));

vi.mock('@tabler/icons-react', () => ({
  IconClock: () => null,
}));

describe('useSoloTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('initializes from elapsed resume time and enters grace before time-up', () => {
    const onTimeUp = vi.fn();
    const onGracePeriodStart = vi.fn();
    const { result } = renderHook(() =>
      useSoloTimer({
        durationMinutes: 1,
        allowPause: true,
        testSubmitted: false,
        initialElapsed: 58,
        onTimeUp,
        onGracePeriodStart,
      }),
    );

    expect(result.current.hasTimer).toBe(true);
    expect(result.current.timeRemaining).toBe(2);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.timeRemaining).toBe(0);
    expect(result.current.showTimeUpOverlay).toBe(true);
    expect(result.current.gracePeriodRemaining).toBe(5);
    expect(onGracePeriodStart).toHaveBeenCalledTimes(1);
    expect(onTimeUp).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onTimeUp).toHaveBeenCalledTimes(1);
    expect(result.current.showTimeUpOverlay).toBe(false);
  });

  it('stops ticking after the test is submitted', () => {
    const onTimeUp = vi.fn();
    const { result, rerender } = renderHook(
      ({ submitted }) =>
        useSoloTimer({
          durationMinutes: 1,
          allowPause: true,
          testSubmitted: submitted,
          initialElapsed: 50,
          onTimeUp,
        }),
      {
        initialProps: { submitted: false },
      },
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.timeRemaining).toBe(8);

    rerender({ submitted: true });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.timeRemaining).toBe(8);
    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('emits the five-minute warning once when the countdown reaches 300 seconds', () => {
    const { result } = renderHook(() =>
      useSoloTimer({
        durationMinutes: 6,
        allowPause: true,
        testSubmitted: false,
        initialElapsed: 59,
        onTimeUp: vi.fn(),
      }),
    );

    expect(result.current.timeRemaining).toBe(301);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.timeRemaining).toBe(300);
    expect(notificationsShowMock).toHaveBeenCalledTimes(1);
    expect(notificationsShowMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Time Warning',
      color: 'orange',
    }));
  });
});

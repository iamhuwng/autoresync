import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveTimeTracking } from './useActiveTimeTracking';

describe('useActiveTimeTracking', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns a referentially stable object across re-renders', () => {
        const { result, rerender } = renderHook(() => useActiveTimeTracking(2));
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it('tracks active time per task and switches cleanly on switchTask and cross-task keystrokes', () => {
        const { result } = renderHook(() => useActiveTimeTracking(2));

        act(() => {
            result.current.onKeystroke(1);
            vi.advanceTimersByTime(30_000);
            result.current.switchTask(2);
            vi.advanceTimersByTime(45_000);
            result.current.onKeystroke(2);
            vi.advanceTimersByTime(15_000);
            result.current.onKeystroke(1);
            vi.advanceTimersByTime(10_000);
        });

        expect(result.current.getActiveTime(1)).toBe(40);
        expect(result.current.getActiveTime(2)).toBe(60);
    });

    it('caps elapsed active time at the last keystroke when idle exceeds 5 minutes', () => {
        const { result } = renderHook(() => useActiveTimeTracking(2));

        act(() => {
            result.current.onKeystroke(1);
            vi.advanceTimersByTime(20_000);
            result.current.onKeystroke(1);
            // Jump 10 minutes ahead without keystrokes
            vi.setSystemTime(Date.now() + 10 * 60 * 1000);
        });

        // Only the 20s between start and last keystroke should be counted
        expect(result.current.getActiveTime(1)).toBe(20);
    });

    it('supports pause() and seedActiveTimes() for reload/pause workflows', () => {
        const { result } = renderHook(() => useActiveTimeTracking(2));

        act(() => {
            result.current.seedActiveTimes({ 1: 120, 2: 240 });
            result.current.onKeystroke(1);
            vi.advanceTimersByTime(30_000);
            result.current.pause();
            vi.advanceTimersByTime(60_000);
        });

        expect(result.current.getActiveTime(1)).toBe(150);
        expect(result.current.getActiveTime(2)).toBe(240);
    });
});

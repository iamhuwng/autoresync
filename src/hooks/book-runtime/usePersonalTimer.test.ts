import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PersonalTimerChannel,
  PersonalTimerChannelFactory,
  PersonalTimerStorage,
} from './usePersonalTimer';
import { formatPersonalTimerElapsed, usePersonalTimer } from './usePersonalTimer';

const createStore = (seed: Record<string, unknown> = {}): PersonalTimerStorage => {
  const values = new Map(Object.entries(seed));
  return {
    get: async <T>(key: string) => (values.get(key) as T | undefined) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

const createChannelFactory = (): PersonalTimerChannelFactory => {
  const listeners = new Map<string, Set<(event: MessageEvent<unknown>) => void>>();
  return (name) => {
    const channelListeners = listeners.get(name) ?? new Set<(event: MessageEvent<unknown>) => void>();
    listeners.set(name, channelListeners);
    const channel: PersonalTimerChannel = {
      postMessage: (message) => {
        for (const listener of channelListeners) listener({ data: message } as MessageEvent<unknown>);
      },
      addEventListener: (_type, listener) => {
        channelListeners.add(listener as unknown as (event: MessageEvent<unknown>) => void);
      },
      removeEventListener: (_type, listener) => {
        channelListeners.delete(listener as unknown as (event: MessageEvent<unknown>) => void);
      },
      close: () => undefined,
    };
    return channel;
  };
};

const hydrate = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('usePersonalTimer', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('starts, pauses, resets, and ignores wall-clock drift', async () => {
    vi.useFakeTimers();
    let monotonic = 0;
    let wall = 100;
    const storage = createStore();
    const readMonotonic = () => monotonic;
    const readWall = () => wall;
    const { result } = renderHook(() => usePersonalTimer({
      timerKey: 'clock',
      storage,
      monotonicNow: readMonotonic,
      wallNow: readWall,
      tabId: 'tab-a',
      channelFactory: () => null,
    }));
    await hydrate();

    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedLabel).toBe('00:00');
    act(() => { result.current.start(); });
    monotonic = 1_500;
    wall = 99_999_999;
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.elapsedMs).toBe(1_500);
    expect(result.current.elapsedLabel).toBe('00:01');

    act(() => { result.current.pause(); });
    expect(result.current.isRunning).toBe(false);
    monotonic = 9_000;
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current.elapsedMs).toBe(1_500);

    act(() => { result.current.reset(); });
    expect(result.current.elapsedMs).toBe(0);
  });

  it('pauses safely on background and restores paused state after reload', async () => {
    vi.useFakeTimers();
    let monotonic = 0;
    const storage = createStore();
    const readMonotonic = () => monotonic;
    const first = renderHook(() => usePersonalTimer({
      timerKey: 'lifecycle',
      storage,
      monotonicNow: readMonotonic,
      tabId: 'tab-a',
      channelFactory: () => null,
    }));
    await hydrate();
    act(() => { first.result.current.start(); });
    monotonic = 2_000;
    act(() => { vi.advanceTimersByTime(250); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(first.result.current.isRunning).toBe(false);
    expect(first.result.current.elapsedMs).toBe(2_000);
    first.unmount();

    const zeroMonotonic = () => 0;
    const second = renderHook(() => usePersonalTimer({
      timerKey: 'lifecycle',
      storage,
      monotonicNow: zeroMonotonic,
      tabId: 'tab-b',
      channelFactory: () => null,
    }));
    await hydrate();
    expect(second.result.current.isRunning).toBe(false);
    expect(second.result.current.elapsedMs).toBe(2_000);
  });

  it('elects one running owner across tabs', async () => {
    vi.useFakeTimers();
    const channelFactory = createChannelFactory();
    let monotonic = 0;
    const storage = createStore();
    const readMonotonic = () => monotonic;
    const first = renderHook(() => usePersonalTimer({
      timerKey: 'tabs',
      storage,
      monotonicNow: readMonotonic,
      tabId: 'tab-a',
      channelFactory,
    }));
    const second = renderHook(() => usePersonalTimer({
      timerKey: 'tabs',
      storage,
      monotonicNow: readMonotonic,
      tabId: 'tab-b',
      channelFactory,
    }));
    await hydrate();
    await hydrate();

    act(() => { first.result.current.start(); });
    monotonic = 1_000;
    act(() => { vi.advanceTimersByTime(250); });
    act(() => { second.result.current.start(); });
    expect(first.result.current.isRunning).toBe(true);
    expect(second.result.current.isRunning).toBe(false);
    expect(second.result.current.elapsedMs).toBe(first.result.current.elapsedMs);
  });

  it('formats long elapsed values without timer payload semantics', () => {
    expect(formatPersonalTimerElapsed(0)).toBe('00:00');
    expect(formatPersonalTimerElapsed(65_000)).toBe('01:05');
    expect(formatPersonalTimerElapsed(3_665_000)).toBe('1:01:05');
  });
});

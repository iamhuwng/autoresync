import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sessionStore } from '../../core/platform/storage';
import { useAppLifecycle } from '../../core/platform/hooks/useAppLifecycle';

const SNAPSHOT_VERSION = 1;
const STORAGE_PREFIX = 'prd0062-personal-timer:v1:';
const PERSIST_INTERVAL_MS = 1_000;

export interface PersonalTimerStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PersonalTimerSnapshot {
  readonly version: 1;
  readonly elapsedMs: number;
  readonly visible: boolean;
  readonly savedAtWallMs: number;
}

export interface PersonalTimerChannel {
  postMessage: (message: PersonalTimerMessage) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<PersonalTimerMessage>) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent<PersonalTimerMessage>) => void) => void;
  close: () => void;
}

export type PersonalTimerChannelFactory = (name: string) => PersonalTimerChannel | null;

export interface UsePersonalTimerOptions {
  readonly timerKey: string;
  readonly storage?: PersonalTimerStorage;
  readonly monotonicNow?: () => number;
  readonly wallNow?: () => number;
  readonly tabId?: string;
  readonly channelFactory?: PersonalTimerChannelFactory;
}

export interface PersonalTimerControls {
  readonly elapsedMs: number;
  readonly elapsedLabel: string;
  readonly isHydrated: boolean;
  readonly isRunning: boolean;
  readonly isVisible: boolean;
  readonly start: () => void;
  readonly pause: () => void;
  readonly reset: () => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly toggleVisibility: () => void;
}

interface InternalTimerState {
  elapsedMs: number;
  running: boolean;
  visible: boolean;
  startedAtMonotonicMs: number | null;
}

type PersonalTimerMessage =
  | {
    readonly type: 'claim' | 'owner' | 'release';
    readonly timerKey: string;
    readonly tabId: string;
    readonly elapsedMs: number;
    readonly visible: boolean;
  };

const defaultMonotonicNow = (): number => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

const defaultChannelFactory: PersonalTimerChannelFactory = (name) => {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(name) as unknown as PersonalTimerChannel;
};

const createTabId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to a non-cryptographic tab identifier. It is only a tie-breaker.
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const clampElapsed = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
);

const normalizeSnapshot = (value: unknown): PersonalTimerSnapshot | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PersonalTimerSnapshot>;
  if (candidate.version !== SNAPSHOT_VERSION) return null;
  return {
    version: SNAPSHOT_VERSION,
    elapsedMs: clampElapsed(candidate.elapsedMs),
    visible: candidate.visible !== false,
    savedAtWallMs: typeof candidate.savedAtWallMs === 'number' && Number.isFinite(candidate.savedAtWallMs)
      ? candidate.savedAtWallMs
      : 0,
  };
};

export const formatPersonalTimerElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(clampElapsed(elapsedMs) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const initialState = (): InternalTimerState => ({
  elapsedMs: 0,
  running: false,
  visible: true,
  startedAtMonotonicMs: null,
});

export const usePersonalTimer = ({
  timerKey,
  storage,
  monotonicNow,
  wallNow,
  tabId,
  channelFactory,
}: UsePersonalTimerOptions): PersonalTimerControls => {
  const storageAdapter = storage ?? sessionStore;
  const monotonicClock = monotonicNow ?? defaultMonotonicNow;
  const wallClock = wallNow ?? Date.now;
  const tabIdRef = useRef(tabId ?? createTabId());
  const stableTabId = tabIdRef.current;
  const channelCreator = channelFactory ?? defaultChannelFactory;
  const storageKey = `${STORAGE_PREFIX}${timerKey}`;
  const channelName = `${STORAGE_PREFIX}channel:${timerKey}`;
  const stateRef = useRef<InternalTimerState>(initialState());
  const hydratedRef = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const channelRef = useRef<PersonalTimerChannel | null>(null);
  const [view, setView] = useState({
    elapsedMs: 0,
    isHydrated: false,
    isRunning: false,
    isVisible: true,
  });

  const currentElapsed = useCallback((state: InternalTimerState): number => {
    if (!state.running || state.startedAtMonotonicMs === null) return state.elapsedMs;
    return state.elapsedMs + Math.max(0, monotonicClock() - state.startedAtMonotonicMs);
  }, [monotonicClock]);

  const persist = useCallback((state: InternalTimerState, elapsedOverride?: number): void => {
    const snapshot: PersonalTimerSnapshot = {
      version: SNAPSHOT_VERSION,
      elapsedMs: clampElapsed(elapsedOverride ?? currentElapsed(state)),
      visible: state.visible,
      savedAtWallMs: wallClock(),
    };
    void storageAdapter.set(storageKey, snapshot).catch(() => undefined);
  }, [currentElapsed, storageAdapter, storageKey, wallClock]);

  const commit = useCallback((next: InternalTimerState, elapsedOverride?: number): void => {
    stateRef.current = next;
    setView((previous) => ({
      ...previous,
      elapsedMs: clampElapsed(elapsedOverride ?? currentElapsed(next)),
      isRunning: next.running,
      isVisible: next.visible,
    }));
    persist(next, elapsedOverride);
  }, [currentElapsed, persist]);

  const applyRemoteSnapshot = useCallback((elapsedMs: number, visible: boolean): void => {
    const next: InternalTimerState = {
      elapsedMs: clampElapsed(elapsedMs),
      running: false,
      visible,
      startedAtMonotonicMs: null,
    };
    stateRef.current = next;
    setView((previous) => ({
      ...previous,
      elapsedMs: next.elapsedMs,
      isRunning: false,
      isVisible: next.visible,
    }));
    persist(next, next.elapsedMs);
  }, [persist]);

  const post = useCallback((message: PersonalTimerMessage): void => {
    channelRef.current?.postMessage(message);
  }, []);

  const start = useCallback((): void => {
    if (!hydratedRef.current || stateRef.current.running) return;
    const elapsedMs = currentElapsed(stateRef.current);
    const next: InternalTimerState = {
      ...stateRef.current,
      elapsedMs,
      running: true,
      startedAtMonotonicMs: monotonicClock(),
    };
    ownerRef.current = stableTabId;
    commit(next, elapsedMs);
    post({ type: 'claim', timerKey, tabId: stableTabId, elapsedMs, visible: next.visible });
  }, [commit, currentElapsed, monotonicClock, post, stableTabId, timerKey]);

  const pause = useCallback((): void => {
    if (!hydratedRef.current || !stateRef.current.running) return;
    const elapsedMs = currentElapsed(stateRef.current);
    const next: InternalTimerState = {
      ...stateRef.current,
      elapsedMs,
      running: false,
      startedAtMonotonicMs: null,
    };
    ownerRef.current = null;
    commit(next, elapsedMs);
    post({ type: 'release', timerKey, tabId: stableTabId, elapsedMs, visible: next.visible });
  }, [commit, currentElapsed, post, stableTabId, timerKey]);

  const reset = useCallback((): void => {
    if (!hydratedRef.current) return;
    const next: InternalTimerState = {
      ...stateRef.current,
      elapsedMs: 0,
      running: false,
      startedAtMonotonicMs: null,
    };
    ownerRef.current = null;
    commit(next, 0);
    post({ type: 'release', timerKey, tabId: stableTabId, elapsedMs: 0, visible: next.visible });
  }, [commit, post, stableTabId, timerKey]);

  const setVisible = useCallback((visible: boolean): void => {
    if (!hydratedRef.current || stateRef.current.visible === visible) return;
    commit({ ...stateRef.current, visible });
  }, [commit]);

  const show = useCallback(() => setVisible(true), [setVisible]);
  const hide = useCallback(() => setVisible(false), [setVisible]);
  const toggleVisibility = useCallback(() => setVisible(!stateRef.current.visible), [setVisible]);

  useEffect(() => {
    let disposed = false;
    hydratedRef.current = false;
    setView((previous) => ({ ...previous, isHydrated: false }));
    void storageAdapter.get<unknown>(storageKey)
      .then((value) => {
        if (disposed) return;
        const snapshot = normalizeSnapshot(value);
        const next: InternalTimerState = {
          elapsedMs: snapshot?.elapsedMs ?? 0,
          running: false,
          visible: snapshot?.visible ?? true,
          startedAtMonotonicMs: null,
        };
        stateRef.current = next;
        hydratedRef.current = true;
        setView({
          elapsedMs: next.elapsedMs,
          isHydrated: true,
          isRunning: false,
          isVisible: next.visible,
        });
      })
      .catch(() => {
        if (disposed) return;
        hydratedRef.current = true;
        setView((previous) => ({ ...previous, isHydrated: true }));
      });

    return () => {
      disposed = true;
      if (hydratedRef.current) persist(stateRef.current);
    };
  }, [persist, storageAdapter, storageKey]);

  useEffect(() => {
    if (!view.isHydrated) return undefined;
    let lastPersistedAt = monotonicClock();
    const interval = setInterval(() => {
      const state = stateRef.current;
      if (!state.running) return;
      const elapsedMs = currentElapsed(state);
      setView((previous) => ({ ...previous, elapsedMs }));
      const now = monotonicClock();
      if (now - lastPersistedAt >= PERSIST_INTERVAL_MS) {
        lastPersistedAt = now;
        persist(state, elapsedMs);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [currentElapsed, monotonicClock, persist, view.isHydrated]);

  useEffect(() => {
    const channel = channelCreator(channelName);
    channelRef.current = channel;
    if (!channel) return undefined;

    const handleMessage = (event: MessageEvent<PersonalTimerMessage>) => {
      const message = event.data;
      if (!message || message.timerKey !== timerKey || message.tabId === stableTabId) return;
      if (message.type === 'claim') {
        if (message.tabId < stableTabId) {
          ownerRef.current = message.tabId;
          applyRemoteSnapshot(message.elapsedMs, message.visible);
          channel.postMessage({
            type: 'owner',
            timerKey,
            tabId: message.tabId,
            elapsedMs: message.elapsedMs,
            visible: message.visible,
          });
        } else if (stateRef.current.running) {
          const elapsedMs = currentElapsed(stateRef.current);
          channel.postMessage({ type: 'owner', timerKey, tabId: stableTabId, elapsedMs, visible: stateRef.current.visible });
        }
        return;
      }
      if (message.type === 'owner') {
        if (message.tabId !== stableTabId) {
          ownerRef.current = message.tabId;
          applyRemoteSnapshot(message.elapsedMs, message.visible);
        }
        return;
      }
      if (ownerRef.current === message.tabId || !stateRef.current.running) {
        ownerRef.current = null;
        applyRemoteSnapshot(message.elapsedMs, message.visible);
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [applyRemoteSnapshot, channelCreator, channelName, currentElapsed, stableTabId, timerKey]);

  useAppLifecycle({
    onBackground: pause,
    onBeforeUnload: () => {
      if (hydratedRef.current) persist(stateRef.current);
    },
  });

  return useMemo(() => ({
    elapsedMs: view.elapsedMs,
    elapsedLabel: formatPersonalTimerElapsed(view.elapsedMs),
    isHydrated: view.isHydrated,
    isRunning: view.isRunning,
    isVisible: view.isVisible,
    start,
    pause,
    reset,
    show,
    hide,
    toggleVisibility,
  }), [hide, pause, reset, show, start, toggleVisibility, view]);
};

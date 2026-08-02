import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppLifecycle } from '../../core/platform/hooks/useAppLifecycle';
import { sessionStore } from '../../core/platform/storage';
import {
  bookIntegrityWarningMessage,
  shouldCaptureBookIntegritySignal,
} from '../../services/book-activity/bookIntegrityCapture.service';
import {
  BOOK_INTEGRITY_SCHEMA_VERSION,
  type BookIntegrityCaptureClient,
  type BookIntegrityCaptureResult,
  type BookIntegrityCaptureTarget,
  type BookIntegrityFrozenPolicy,
  type BookIntegritySignalRequest,
  type BookIntegritySignalType,
  type BookIntegrityWarning,
} from '../../services/book-activity/bookIntegrityCapture.types';

interface BookIntegritySessionStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

interface ExitMarker {
  readonly schemaVersion: 1;
  readonly scopeKey: string;
  readonly clientSessionId: string;
  readonly sequence: number;
  readonly policyId: string;
  readonly policyRevision: number;
}

export interface UseBookIntegrityCaptureOptions {
  readonly client: BookIntegrityCaptureClient;
  readonly target: BookIntegrityCaptureTarget;
  readonly frozenPolicy: BookIntegrityFrozenPolicy;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly onWarning?: (warning: BookIntegrityWarning) => void;
  readonly storage?: BookIntegritySessionStorage;
  readonly now?: () => number;
}

export interface BookIntegrityCaptureController {
  readonly status: 'disabled' | 'ready' | 'recording' | 'unavailable';
  readonly recordedEventCount: number;
  readonly lastResult: BookIntegrityCaptureResult | null;
  readonly recordSignal: (signal: BookIntegritySignalType) => Promise<BookIntegrityCaptureResult | null>;
}

const sessionId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `session-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const captureScopeKey = (target: BookIntegrityCaptureTarget): string => [
  target.bookId,
  target.bindingId,
  target.bindingRevision,
  target.contextId,
  target.placementId,
  target.activityId,
  target.activityVersion,
].join(':');

const markerKey = (scopeKey: string): string => `book-integrity-exit-v1:${scopeKey}`;
const protectedCopySelector = '[data-book-integrity-copy-protected="true"]';

const protectedAncestor = (value: EventTarget | Node | null): Element | null => {
  if (value instanceof Element) return value.closest(protectedCopySelector);
  if (value instanceof Node) return value.parentElement?.closest(protectedCopySelector) ?? null;
  return null;
};

const protectedCopyWasRequested = (event: ClipboardEvent): boolean => {
  if (event.composedPath().some((entry) => protectedAncestor(entry) !== null)) return true;
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const protectedRegions = document.querySelectorAll(protectedCopySelector);
  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
    const range = selection.getRangeAt(rangeIndex);
    if (protectedAncestor(range.commonAncestorContainer)) return true;
    for (const region of protectedRegions) {
      try {
        if (range.intersectsNode(region)) return true;
      } catch {
        // A detached range cannot identify a reliable protected copy.
      }
    }
  }
  return false;
};

export const useBookIntegrityCapture = (
  options: UseBookIntegrityCaptureOptions,
): BookIntegrityCaptureController => {
  const storage = options.storage ?? sessionStore;
  const scopeKey = useMemo(() => captureScopeKey(options.target), [options.target]);
  const captureEnabled = options.enabled
    && options.active
    && options.frozenPolicy.intent === 'accountable'
    && options.frozenPolicy.enabled;
  const optionsRef = useRef(options);
  const activeRef = useRef(options.active);
  const enabledRef = useRef(captureEnabled);
  const sessionIdRef = useRef(sessionId());
  const sequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const lastActivityAtRef = useRef((options.now ?? Date.now)());
  const inactivityRecordedRef = useRef(false);
  const [status, setStatus] = useState<BookIntegrityCaptureController['status']>(
    captureEnabled ? 'ready' : 'disabled',
  );
  const [recordedEventCount, setRecordedEventCount] = useState(0);
  const [lastResult, setLastResult] = useState<BookIntegrityCaptureResult | null>(null);

  optionsRef.current = options;
  activeRef.current = options.active;
  enabledRef.current = captureEnabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    sessionIdRef.current = sessionId();
    sequenceRef.current = 0;
    lastActivityAtRef.current = (optionsRef.current.now ?? Date.now)();
    inactivityRecordedRef.current = false;
    setRecordedEventCount(0);
    setLastResult(null);
    setStatus(enabledRef.current ? 'ready' : 'disabled');
  }, [scopeKey]);

  useEffect(() => {
    setStatus(captureEnabled ? 'ready' : 'disabled');
  }, [captureEnabled]);

  const send = useCallback(async (
    signal: BookIntegritySignalType,
    sendOptions: {
      readonly keepalive?: boolean;
      readonly identity?: Pick<ExitMarker, 'clientSessionId' | 'sequence'>;
      readonly capture?: {
        readonly target: BookIntegrityCaptureTarget;
        readonly frozenPolicy: BookIntegrityFrozenPolicy;
      };
    } = {},
  ): Promise<BookIntegrityCaptureResult | null> => {
    const current = optionsRef.current;
    const capture = sendOptions.capture ?? current;
    if (!enabledRef.current
      || !activeRef.current
      || !shouldCaptureBookIntegritySignal(capture.frozenPolicy, signal)) {
      return null;
    }
    const identity = sendOptions.identity ?? {
      clientSessionId: sessionIdRef.current,
      sequence: sequenceRef.current += 1,
    };
    const request: BookIntegritySignalRequest = {
      schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
      target: { ...capture.target },
      policyId: capture.frozenPolicy.policyId,
      policyRevision: capture.frozenPolicy.policyRevision,
      clientSessionId: identity.clientSessionId,
      sequence: identity.sequence,
      signal,
    };
    if (mountedRef.current) setStatus('recording');
    try {
      const result = await current.client.recordSignal(request, {
        keepalive: sendOptions.keepalive,
      });
      if (mountedRef.current) {
        setLastResult(result);
        setRecordedEventCount((count) => Math.max(count, result.recordedEventCount));
        setStatus('ready');
      }
      if (result.status === 'recorded' || result.status === 'deduplicated') {
        current.onWarning?.({
          signal,
          eventId: result.eventId,
          message: bookIntegrityWarningMessage(),
        });
      }
      return result;
    } catch {
      if (mountedRef.current) setStatus('unavailable');
      return null;
    }
  }, []);

  const recordSignal = useCallback((
    signal: BookIntegritySignalType,
  ): Promise<BookIntegrityCaptureResult | null> => send(signal), [send]);

  useEffect(() => {
    if (!captureEnabled) return;
    const key = markerKey(scopeKey);
    void storage.get<ExitMarker>(key).then((marker) => {
      if (marker?.schemaVersion === BOOK_INTEGRITY_SCHEMA_VERSION
        && marker.scopeKey === scopeKey
        && marker.policyId === optionsRef.current.frozenPolicy.policyId
        && marker.policyRevision === optionsRef.current.frozenPolicy.policyRevision) {
        void send('route_reload_close', {
          identity: {
            clientSessionId: marker.clientSessionId,
            sequence: marker.sequence,
          },
        });
      }
      return storage.remove(key);
    }).catch(() => undefined);
    void send('concurrent_attempt');
  }, [captureEnabled, scopeKey, send, storage]);

  useEffect(() => {
    if (!captureEnabled) return;
    const capture = {
      target: options.target,
      frozenPolicy: options.frozenPolicy,
    };
    let disposed = false;
    const emit = (signal: BookIntegritySignalType): void => {
      if (!disposed) void send(signal, { capture });
    };
    const activity = (): void => {
      lastActivityAtRef.current = (optionsRef.current.now ?? Date.now)();
      inactivityRecordedRef.current = false;
    };
    const onBlur = (): void => emit('focus_loss');
    const onPaste = (): void => emit('paste');
    const onCopy = (event: ClipboardEvent): void => {
      if (protectedCopyWasRequested(event)) {
        event.preventDefault();
        emit('protected_copy');
      }
    };
    const onFullscreenChange = (): void => {
      if (optionsRef.current.frozenPolicy.requiredFocusMode
        && document.fullscreenElement === null) {
        emit('focus_mode_exit');
      }
    };
    const activityEvents = ['pointerdown', 'keydown', 'input', 'touchstart'] as const;
    window.addEventListener('blur', onBlur);
    document.addEventListener('paste', onPaste);
    document.addEventListener('copy', onCopy);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    activityEvents.forEach((name) => document.addEventListener(name, activity, { passive: true }));
    const interval = window.setInterval(() => {
      const current = optionsRef.current;
      const now = (current.now ?? Date.now)();
      if (!inactivityRecordedRef.current
        && now - lastActivityAtRef.current >= current.frozenPolicy.inactivityThresholdMs) {
        inactivityRecordedRef.current = true;
        emit('inactivity');
      }
    }, 1_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      activityEvents.forEach((name) => document.removeEventListener(name, activity));
      if (activeRef.current && enabledRef.current) {
        void send('route_reload_close', { keepalive: true, capture });
      }
      disposed = true;
    };
  }, [captureEnabled, scopeKey, send]);

  useAppLifecycle({
    onBackground: () => { void send('visibility_loss'); },
    onBeforeUnload: () => {
      if (!enabledRef.current || !activeRef.current) return undefined;
      const current = optionsRef.current;
      const marker: ExitMarker = {
        schemaVersion: BOOK_INTEGRITY_SCHEMA_VERSION,
        scopeKey: captureScopeKey(current.target),
        clientSessionId: sessionIdRef.current,
        sequence: sequenceRef.current += 1,
        policyId: current.frozenPolicy.policyId,
        policyRevision: current.frozenPolicy.policyRevision,
      };
      void storage.set(markerKey(marker.scopeKey), marker);
      void send('route_reload_close', {
        keepalive: true,
        identity: {
          clientSessionId: marker.clientSessionId,
          sequence: marker.sequence,
        },
      });
      return undefined;
    },
  });

  return {
    status,
    recordedEventCount,
    lastResult,
    recordSignal,
  };
};

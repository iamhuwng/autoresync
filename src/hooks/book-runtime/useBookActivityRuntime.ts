import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppLifecycle } from '../../core/platform/hooks/useAppLifecycle';
import { useOnlineStatus } from '../../core/platform/hooks/useOnlineStatus';
import { storage } from '../../core/platform/storage';
import {
  BookRuntimeClientError,
  type BookRuntimeClient,
  type BookRuntimeDraftAddress,
} from '../../services/book-activity/activityRuntime.browser';
import type { BookRuntimeDraftRecord } from '../../services/book-activity/activityRuntimeAttempt.types';

const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_DEBOUNCE_MS = 600;
const DEFAULT_FLUSH_DEADLINE_MS = 2_000;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_MAX_RETRIES = 3;

export type BookActivityRuntimeStatus =
  | 'loading'
  | 'idle'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'retrying'
  | 'conflict'
  | 'error'
  | 'unsafe-to-leave';

export interface BookRuntimeRecoveryRecord {
  readonly schemaVersion: 1;
  readonly ownerId: string;
  readonly address: BookRuntimeDraftAddress & { readonly recipientId: string };
  readonly response: unknown;
  readonly clientRevision: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
}

export interface BookRuntimeRecoveryStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export const platformBookRuntimeRecoveryStore: BookRuntimeRecoveryStore = {
  get: (key) => storage.get(key),
  set: (key, value) => storage.set(key, value),
  remove: (key) => storage.remove(key),
};

export interface BookRuntimeMetric {
  readonly event: 'autosave-write' | 'autosave-ack' | 'offline-retained' | 'retry' | 'conflict';
  readonly durationMs?: number;
  readonly payloadBytes?: number;
  readonly attempt?: number;
}

export interface BookRuntimeConflict {
  readonly interactionId: string;
  readonly localResponse: unknown;
  readonly serverResponse: unknown | null;
  readonly serverRevision: number | null;
}

export interface BookRuntimeFlushResult {
  readonly status: 'saved' | 'idle' | 'offline' | 'conflict' | 'deadline' | 'error';
  readonly safeToLeave: boolean;
}

export interface UseBookActivityRuntimeOptions {
  readonly client: BookRuntimeClient;
  readonly recipientId: string;
  readonly address: Omit<BookRuntimeDraftAddress, 'interactionId'>;
  readonly interactionIds: readonly string[];
  readonly initialResponses?: Readonly<Record<string, unknown>>;
  readonly serializeResponse?: (interactionId: string, response: unknown) => unknown;
  readonly storage?: BookRuntimeRecoveryStore;
  readonly debounceMs?: number;
  readonly flushDeadlineMs?: number;
  readonly retryBaseMs?: number;
  readonly maxRetries?: number;
  readonly recoveryTtlMs?: number;
  readonly tabId?: string;
  readonly now?: () => number;
  readonly operationId?: () => string;
  readonly onMetric?: (metric: BookRuntimeMetric) => void;
  readonly enabled?: boolean;
}

export interface BookActivityRuntimeController {
  readonly responses: Readonly<Record<string, unknown>>;
  readonly status: BookActivityRuntimeStatus;
  readonly message: string;
  readonly isDirty: boolean;
  readonly conflict: BookRuntimeConflict | null;
  readonly change: (interactionId: string, response: unknown) => boolean;
  readonly flush: (reason?: string) => Promise<BookRuntimeFlushResult>;
  readonly retry: () => Promise<BookRuntimeFlushResult>;
  readonly reload: () => Promise<void>;
  readonly discardLocal: () => Promise<void>;
}

interface PendingEntry {
  response: unknown;
  attempts: number;
  version: number;
  operationId: string;
}

interface AcknowledgedEntry {
  response: unknown;
  revision: number;
  updatedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x40;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const responseSize = (value: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
};

const recoveryKey = (
  recipientId: string,
  address: Omit<BookRuntimeDraftAddress, 'interactionId'>,
  interactionId: string,
): string => [
  'book-runtime-draft:v1',
  encodeURIComponent(recipientId),
  encodeURIComponent(address.bindingId),
  address.bindingRevision,
  encodeURIComponent(address.contextId),
  encodeURIComponent(address.placementId),
  encodeURIComponent(address.activityId),
  address.activityVersion,
  encodeURIComponent(interactionId),
].join(':');

const validRecovery = (value: unknown, now: number): value is BookRuntimeRecoveryRecord => {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.ownerId !== 'string'
    || !isRecord(value.address)
    || typeof value.address.recipientId !== 'string'
    || typeof value.address.bindingId !== 'string'
    || typeof value.address.contextId !== 'string'
    || typeof value.address.placementId !== 'string'
    || typeof value.address.activityId !== 'string'
    || typeof value.address.interactionId !== 'string'
    || !Number.isSafeInteger(value.address.bindingRevision)
    || !Number.isSafeInteger(value.address.activityVersion)
    || !Number.isSafeInteger(value.clientRevision)
    || !Number.isSafeInteger(value.updatedAt)
    || typeof value.expiresAt !== 'number'
    || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= now
  ) return false;
  return true;
};

const newerRecovery = (
  candidate: BookRuntimeRecoveryRecord,
  current: BookRuntimeRecoveryRecord | null,
): boolean => current === null
  || candidate.updatedAt > current.updatedAt
  || (candidate.updatedAt === current.updatedAt && candidate.ownerId > current.ownerId);

export const useBookActivityRuntime = (
  options: UseBookActivityRuntimeOptions,
): BookActivityRuntimeController => {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const online = useOnlineStatus();
  const scopeKey = JSON.stringify({
    recipientId: options.recipientId,
    address: options.address,
    interactionIds: options.interactionIds,
  });
  const now = useCallback(() => optionsRef.current.now?.() ?? Date.now(), []);
  const generatedTabIdRef = useRef(randomId());
  const tabId = options.tabId ?? generatedTabIdRef.current;
  const storeRef = useRef<BookRuntimeRecoveryStore>(options.storage ?? platformBookRuntimeRecoveryStore);
  const store = storeRef.current;
  const [responses, setResponses] = useState<Readonly<Record<string, unknown>>>(
    options.initialResponses ?? {},
  );
  const [status, setStatus] = useState<BookActivityRuntimeStatus>(
    options.enabled === false ? 'idle' : 'loading',
  );
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState<BookRuntimeConflict | null>(null);
  const pendingRef = useRef(new Map<string, PendingEntry>());
  const acknowledgedRef = useRef(new Map<string, AcknowledgedEntry>());
  const generationRef = useRef(0);
  const flushPromiseRef = useRef<Promise<BookRuntimeFlushResult> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(new Set<string>());

  const addressFor = useCallback((interactionId: string): BookRuntimeDraftAddress => ({
    ...optionsRef.current.address,
    interactionId,
  }), []);

  const persist = useCallback(async (
    interactionId: string,
    response: unknown,
    clientRevision: number,
  ): Promise<void> => {
    const current = await store.get(recoveryKey(
      optionsRef.current.recipientId,
      optionsRef.current.address,
      interactionId,
    ));
    const existing = validRecovery(current, now()) ? current : null;
    const candidate: BookRuntimeRecoveryRecord = {
      schemaVersion: 1,
      ownerId: tabId,
      address: { ...addressFor(interactionId), recipientId: optionsRef.current.recipientId },
      response: structuredClone(response),
      clientRevision,
      updatedAt: now(),
      expiresAt: now() + (optionsRef.current.recoveryTtlMs ?? RECOVERY_TTL_MS),
    };
    if (newerRecovery(candidate, existing)) {
      await store.set(recoveryKey(
        optionsRef.current.recipientId,
        optionsRef.current.address,
        interactionId,
      ), candidate);
    }
  }, [addressFor, now, store, tabId]);

  const removeRecovery = useCallback(async (interactionId: string): Promise<void> => {
    const key = recoveryKey(
      optionsRef.current.recipientId,
      optionsRef.current.address,
      interactionId,
    );
    const current = await store.get(key);
    if (!validRecovery(current, now()) || current.ownerId === tabId) {
      await store.remove(key);
    }
  }, [now, store, tabId]);

  const setRuntimeStatus = useCallback((next: BookActivityRuntimeStatus, nextMessage = '') => {
    setStatus(next);
    setMessage(nextMessage);
  }, []);

  const load = useCallback(async (preserveLocal: boolean): Promise<void> => {
    const generation = generationRef.current;
    if (optionsRef.current.enabled === false) {
      setRuntimeStatus('idle');
      return;
    }
    setRuntimeStatus('loading', 'Loading saved Activity response.');
    const loaded: Record<string, unknown> = { ...(optionsRef.current.initialResponses ?? {}) };
    const localEntries: Array<{ interactionId: string; record: BookRuntimeRecoveryRecord }> = [];
    try {
      await Promise.all(optionsRef.current.interactionIds.map(async (interactionId) => {
        const localValue = await store.get(recoveryKey(
          optionsRef.current.recipientId,
          optionsRef.current.address,
          interactionId,
        ));
        const local = validRecovery(localValue, now()) ? localValue : null;
        if (localValue !== null && local === null) {
          await store.remove(recoveryKey(
            optionsRef.current.recipientId,
            optionsRef.current.address,
            interactionId,
          ));
        }
        let server: BookRuntimeDraftRecord | null = null;
        try {
          server = await optionsRef.current.client.readDraft(addressFor(interactionId));
        } catch (error) {
          if (!(error instanceof BookRuntimeClientError) || error.code !== 'not_found') throw error;
        }
        if (server) {
          acknowledgedRef.current.set(interactionId, {
            response: structuredClone(server.response),
            revision: server.revision,
            updatedAt: server.updatedAt,
          });
        }
        const keepLocal = preserveLocal && local !== null && (
          server === null || local.clientRevision > server.revision || local.updatedAt > Date.parse(server.updatedAt)
        );
        if (keepLocal && local) {
          loaded[interactionId] = structuredClone(local.response);
          localEntries.push({ interactionId, record: local });
          pendingRef.current.set(interactionId, {
            response: structuredClone(local.response),
            attempts: 0,
            version: 1,
            operationId: randomId(),
          });
        } else if (server) {
          loaded[interactionId] = structuredClone(server.response);
          if (local && !keepLocal) {
            await removeRecovery(interactionId);
          }
        }
      }));
      if (generation !== generationRef.current) return;
      setResponses(loaded);
      setConflict(null);
      if (localEntries.length > 0) {
        setRuntimeStatus(online ? 'pending' : 'offline', online
          ? 'Recovered local response; saving.'
          : 'Offline response retained locally.');
        optionsRef.current.onMetric?.({ event: 'offline-retained' });
      } else {
        setRuntimeStatus('saved', 'Saved response loaded.');
      }
    } catch (error) {
      if (generation !== generationRef.current) return;
      setRuntimeStatus('offline', 'Saved response retained locally; Worker unavailable.');
      optionsRef.current.onMetric?.({ event: 'offline-retained' });
    }
  }, [addressFor, now, online, removeRecovery, setRuntimeStatus, store]);

  const flush = useCallback(async (reason = 'manual'): Promise<BookRuntimeFlushResult> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    const run = async (): Promise<BookRuntimeFlushResult> => {
      const deadline = now() + (optionsRef.current.flushDeadlineMs ?? DEFAULT_FLUSH_DEADLINE_MS);
      if (!online) {
        for (const [interactionId, entry] of pendingRef.current) {
          await persist(interactionId, entry.response, acknowledgedRef.current.get(interactionId)?.revision ?? 0);
        }
        setRuntimeStatus('offline', 'Offline response retained locally.');
        return { status: 'offline', safeToLeave: false };
      }
      if (pendingRef.current.size === 0) {
        setRuntimeStatus('saved', reason === 'reload' ? 'Saved response loaded.' : 'All responses saved.');
        return { status: 'idle', safeToLeave: true };
      }
      setRuntimeStatus('saving', 'Saving response.');
      while (pendingRef.current.size > 0) {
        if (now() >= deadline) {
          setRuntimeStatus('unsafe-to-leave', 'Response still saving; keep this page open.');
          return { status: 'deadline', safeToLeave: false };
        }
        const next = [...pendingRef.current.entries()].find(([interactionId]) => !inFlightRef.current.has(interactionId));
        if (!next) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          continue;
        }
        const [interactionId, entry] = next;
        const snapshotVersion = entry.version;
        const snapshotResponse = structuredClone(entry.response);
        const acknowledged = acknowledgedRef.current.get(interactionId);
        const startedAt = now();
        inFlightRef.current.add(interactionId);
        try {
          const remaining = Math.max(1, deadline - now());
          const save = optionsRef.current.client.saveDraft({
            ...addressFor(interactionId),
            operationId: entry.operationId,
            clientRevision: acknowledged?.revision ?? 0,
            response: snapshotResponse,
          });
          const result = await Promise.race([
            save,
            new Promise<never>((_, reject) => setTimeout(
              () => reject(new BookRuntimeClientError('network_failure')),
              remaining,
            )),
          ]);
          const revision = result.receipt.draftRevision ?? (acknowledged?.revision ?? 0) + 1;
          if (result.status === 'conflict' || result.receipt.status === 'conflict') {
            let current: BookRuntimeDraftRecord | null = null;
            try { current = await optionsRef.current.client.readDraft(addressFor(interactionId)); } catch { /* retain local */ }
            setConflict({
              interactionId,
              localResponse: snapshotResponse,
              serverResponse: current?.response ?? null,
              serverRevision: current?.revision ?? null,
            });
            await persist(interactionId, snapshotResponse, acknowledged?.revision ?? 0);
            optionsRef.current.onMetric?.({ event: 'conflict' });
            setRuntimeStatus('conflict', 'Server changed this response. Choose retry, reload, or discard local.');
            return { status: 'conflict', safeToLeave: false };
          }
          acknowledgedRef.current.set(interactionId, {
            response: snapshotResponse,
            revision,
            updatedAt: new Date(now()).toISOString(),
          });
          optionsRef.current.onMetric?.({
            event: 'autosave-ack',
            durationMs: Math.max(0, now() - startedAt),
          });
          if (pendingRef.current.get(interactionId)?.version === snapshotVersion) {
            pendingRef.current.delete(interactionId);
            await removeRecovery(interactionId);
          } else {
            await persist(interactionId, pendingRef.current.get(interactionId)?.response, revision);
          }
          optionsRef.current.onMetric?.({
            event: 'autosave-write',
            payloadBytes: responseSize(snapshotResponse),
          });
        } catch (error) {
          if (now() >= deadline) {
            setRuntimeStatus('unsafe-to-leave', 'Response still saving; keep this page open.');
            return { status: 'deadline', safeToLeave: false };
          }
          const current = pendingRef.current.get(interactionId);
          if (error instanceof BookRuntimeClientError && error.code === 'conflict') {
            let serverDraft: BookRuntimeDraftRecord | null = null;
            try { serverDraft = await optionsRef.current.client.readDraft(addressFor(interactionId)); } catch { /* retain local */ }
            const localResponse = current?.response ?? snapshotResponse;
            setConflict({
              interactionId,
              localResponse,
              serverResponse: serverDraft?.response ?? null,
              serverRevision: serverDraft?.revision ?? error.currentRevision ?? null,
            });
            await persist(interactionId, localResponse, acknowledged?.revision ?? 0);
            optionsRef.current.onMetric?.({ event: 'conflict' });
            setRuntimeStatus('conflict', 'Server changed this response. Choose retry, reload, or discard local.');
            return { status: 'conflict', safeToLeave: false };
          }
          if (current) {
            current.attempts += 1;
            await persist(interactionId, current.response, acknowledged?.revision ?? 0);
            const maxRetries = optionsRef.current.maxRetries ?? DEFAULT_MAX_RETRIES;
            if (current.attempts <= maxRetries) {
              setRuntimeStatus('retrying', `Save retry ${current.attempts} of ${maxRetries}.`);
              optionsRef.current.onMetric?.({ event: 'retry', attempt: current.attempts });
              if (!retryTimerRef.current) {
                retryTimerRef.current = setTimeout(() => {
                  retryTimerRef.current = null;
                  void flush('retry');
                }, (optionsRef.current.retryBaseMs ?? DEFAULT_RETRY_BASE_MS) * 2 ** (current.attempts - 1));
              }
              return { status: 'error', safeToLeave: false };
            }
          }
          setRuntimeStatus('error', error instanceof BookRuntimeClientError && error.code === 'conflict'
            ? 'Response conflict. Retry, reload, or discard local.'
            : 'Could not save response; local recovery remains available.');
          return { status: 'error', safeToLeave: false };
        } finally {
          inFlightRef.current.delete(interactionId);
        }
      }
      setConflict(null);
      setRuntimeStatus('saved', 'Response saved.');
      return { status: 'saved', safeToLeave: true };
    };
    flushPromiseRef.current = run();
    try {
      return await flushPromiseRef.current;
    } finally {
      flushPromiseRef.current = null;
    }
  }, [addressFor, now, online, persist, removeRecovery, setRuntimeStatus]);

  const scheduleFlush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void flush('debounce');
    }, optionsRef.current.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }, [flush]);

  const change = useCallback((interactionId: string, response: unknown): boolean => {
    if (!optionsRef.current.interactionIds.includes(interactionId)) return false;
    let serialized: unknown;
    try {
      serialized = optionsRef.current.serializeResponse?.(interactionId, response) ?? response;
      structuredClone(serialized);
      JSON.stringify(serialized);
    } catch {
      setRuntimeStatus('error', 'Activity response could not be serialized.');
      return false;
    }
    setResponses((current) => ({ ...current, [interactionId]: structuredClone(serialized) }));
    const previous = pendingRef.current.get(interactionId);
    pendingRef.current.set(interactionId, {
      response: structuredClone(serialized),
      attempts: previous?.attempts ?? 0,
      version: (previous?.version ?? 0) + 1,
      operationId: previous?.operationId ?? randomId(),
    });
    void persist(
      interactionId,
      serialized,
      acknowledgedRef.current.get(interactionId)?.revision ?? 0,
    );
    setConflict(null);
    setRuntimeStatus(online ? 'pending' : 'offline', online
      ? 'Response pending save.'
      : 'Offline response retained locally.');
    scheduleFlush();
    return true;
  }, [online, persist, scheduleFlush, setRuntimeStatus]);

  const retry = useCallback(async (): Promise<BookRuntimeFlushResult> => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    for (const entry of pendingRef.current.values()) entry.attempts = 0;
    return flush('manual-retry');
  }, [flush]);

  const reload = useCallback(async (): Promise<void> => {
    generationRef.current += 1;
    pendingRef.current.clear();
    acknowledgedRef.current.clear();
    await load(false);
  }, [load]);

  const discardLocal = useCallback(async (): Promise<void> => {
    for (const interactionId of optionsRef.current.interactionIds) {
      await removeRecovery(interactionId);
    }
    pendingRef.current.clear();
    setConflict(null);
    await reload();
  }, [reload, removeRecovery]);

  useEffect(() => {
    generationRef.current += 1;
    pendingRef.current.clear();
    acknowledgedRef.current.clear();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setResponses(optionsRef.current.initialResponses ?? {});
    void load(true);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (pendingRef.current.size > 0) void flush('unmount');
    };
  }, [flush, load, scopeKey]);

  useEffect(() => {
    if (online && pendingRef.current.size > 0) void flush('online');
  }, [flush, online]);

  useAppLifecycle({
    onBackground: () => { void flush('background'); },
    onBeforeUnload: () => pendingRef.current.size > 0
      ? 'This Activity has unsaved local response work.'
      : undefined,
  });

  return {
    responses,
    status,
    message,
    isDirty: pendingRef.current.size > 0,
    conflict,
    change,
    flush,
    retry,
    reload,
    discardLocal,
  };
};

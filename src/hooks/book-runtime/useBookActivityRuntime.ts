import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppLifecycle } from '../../core/platform/hooks/useAppLifecycle';
import { useOnlineStatus } from '../../core/platform/hooks/useOnlineStatus';
import { storage } from '../../core/platform/storage';
import {
  BookRuntimeClientError,
  type BookRuntimeClient,
  type BookRuntimeDraftAddress,
  type BookRuntimeSubmitActivityResult,
} from '../../services/book-activity/activityRuntime.browser';
import type { BookRuntimeDraftRecord } from '../../services/book-activity/activityRuntimeAttempt.types';
import { activityDraftFromRuntimeResponses, activitySubmissionFromRuntimeResponses, runtimeResponsesFromActivityDraft } from '../../services/book-activity/activityRuntimeAttempt.service';
import {
  requireBookScheduleWindowDecision,
  type BookScheduleWindowDecision,
} from '../../services/book-delivery/bookScheduleWindow.service';

const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MIN_DEBOUNCE_MS = 1_500;
const DEFAULT_FLUSH_DEADLINE_MS = 2_000;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_MAX_RETRIES = 3;
const DRAFT_WRITE_LIMIT = 6;
const DRAFT_WRITE_WINDOW_MS = 60_000;

const draftWriteBudgets = new Map<string, number[]>();

export const resetBookRuntimeDraftWriteBudgetsForTest = (): void => {
  draftWriteBudgets.clear();
};

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
  readonly readTerminal?: () => Promise<BookRuntimeTerminalRead>;
  readonly enabled?: boolean;
  readonly canAutosave?: boolean;
  readonly canSubmit?: boolean;
  readonly windowDecision?: BookScheduleWindowDecision;
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
  readonly refreshTerminal: () => Promise<void>;
  readonly discardLocal: () => Promise<void>;
  readonly submitActivity: (interactionId: string) => Promise<BookRuntimeSubmitActivityResult>;
  readonly terminalResult: BookRuntimeSubmitActivityResult | null;
  readonly terminalReadStatus: BookRuntimeTerminalReadStatus;
  readonly terminalReadResultStatus: BookRuntimeSubmitActivityResult['resultStatus'] | null;
  readonly windowDecision: BookScheduleWindowDecision | null;
}

export type BookRuntimeTerminalReadStatus =
  | 'unknown'
  | 'unavailable'
  | 'confirmed-absent'
  | 'confirmed-present';

export type BookRuntimeTerminalRead =
  | { readonly status: 'unavailable' }
  | { readonly status: 'confirmed-absent' }
  | {
    readonly status: 'confirmed-present';
    readonly resultStatus: BookRuntimeSubmitActivityResult['resultStatus'];
    readonly responses: Readonly<Record<string, unknown>>;
  };

interface PendingEntry {
  response: unknown;
  version: number;
  operationId: string;
}

interface ActivityWriteSnapshot {
  readonly responses: Readonly<Record<string, unknown>>;
  readonly versions: ReadonlyMap<string, number>;
  readonly operationId: string;
  attempts: number;
}

type SaveSettlement = BookRuntimeFlushResult | null;
const FLUSH_DEADLINE = Symbol('book-runtime-flush-deadline');

const waitForSettlement = <T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof FLUSH_DEADLINE> => (
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(FLUSH_DEADLINE), timeoutMs);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  })
);

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const draftBudgetKey = (
  recipientId: string,
  address: Omit<BookRuntimeDraftAddress, 'interactionId'>,
): string => [
  recipientId,
  address.contextId,
  address.placementId,
  address.activityId,
].join('|');

const acquireDraftWriteSlot = async (
  key: string,
  now: () => number,
  deadline: number,
): Promise<boolean> => {
  while (now() < deadline) {
    const cutoff = now() - DRAFT_WRITE_WINDOW_MS;
    const issued = (draftWriteBudgets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (issued.length < DRAFT_WRITE_LIMIT) {
      issued.push(now());
      draftWriteBudgets.set(key, issued);
      return true;
    }
    const delay = Math.min(deadline - now(), issued[0]! + DRAFT_WRITE_WINDOW_MS - now());
    if (delay <= 0) continue;
    await wait(delay);
  }
  return false;
};

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
    enabled: options.enabled !== false,
  });
  const now = useCallback(() => optionsRef.current.now?.() ?? Date.now(), []);
  const generatedTabIdRef = useRef(randomId());
  const tabId = options.tabId ?? generatedTabIdRef.current;
  const storeRef = useRef<BookRuntimeRecoveryStore>(options.storage ?? platformBookRuntimeRecoveryStore);
  const store = storeRef.current;
  const [responses, setResponses] = useState<Readonly<Record<string, unknown>>>(
    options.initialResponses ?? {},
  );
  const responsesRef = useRef(responses);
  const acknowledgedDraftRef = useRef<BookRuntimeDraftRecord | null>(null);
  const writeSnapshotRef = useRef<ActivityWriteSnapshot | null>(null);
  const [status, setStatus] = useState<BookActivityRuntimeStatus>(
    options.enabled === false ? 'idle' : 'loading',
  );
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState<BookRuntimeConflict | null>(null);
  const [terminalResult, setTerminalResult] = useState<BookRuntimeSubmitActivityResult | null>(null);
  const [terminalReadStatus, setTerminalReadStatus] = useState<BookRuntimeTerminalReadStatus>(
    options.readTerminal ? 'unknown' : 'confirmed-absent',
  );
  const [terminalReadResultStatus, setTerminalReadResultStatus] = useState<BookRuntimeSubmitActivityResult['resultStatus'] | null>(null);
  const [windowDecision, setWindowDecision] = useState<BookScheduleWindowDecision | null>(() => {
    if (!options.windowDecision) return null;
    try { return requireBookScheduleWindowDecision(options.windowDecision); } catch { return null; }
  });
  const pendingRef = useRef(new Map<string, PendingEntry>());
  const recoveryRevisionsRef = useRef(new Map<string, number>());
  const generationRef = useRef(0);
  const terminalStatusRef = useRef(terminalReadStatus);
  terminalStatusRef.current = terminalReadStatus;
  const flushPromiseRef = useRef<Promise<BookRuntimeFlushResult> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(new Map<string, Promise<SaveSettlement>>());
  const flushAgainRef = useRef<() => void>(() => undefined);
  const terminalByInteractionRef = useRef(new Map<string, BookRuntimeSubmitActivityResult>());
  const submitPromiseRef = useRef(new Map<string, Promise<BookRuntimeSubmitActivityResult>>());
  const budgetKey = draftBudgetKey(options.recipientId, options.address);

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

  const consumeCurrentWindow = useCallback((error: unknown): void => {
    if (error instanceof BookRuntimeClientError && error.currentWindow) {
      setWindowDecision(error.currentWindow);
    }
  }, []);

  const restoreCommittedResponses = useCallback(async (terminal: Extract<BookRuntimeTerminalRead, { status: 'confirmed-present' }>, generation: number): Promise<void> => {
    await Promise.all(optionsRef.current.interactionIds.map(removeRecovery));
    if (generation !== generationRef.current) return;
    pendingRef.current.clear();
    recoveryRevisionsRef.current.clear();
    acknowledgedDraftRef.current = null;
    writeSnapshotRef.current = null;
    responsesRef.current = structuredClone(terminal.responses);
    setResponses(structuredClone(terminal.responses));
    setConflict(null);
    setTerminalResult(null);
  }, [removeRecovery]);

  const load = useCallback(async (preserveLocal: boolean): Promise<void> => {
    const generation = generationRef.current;
    if (optionsRef.current.enabled === false) {
      setRuntimeStatus('idle');
      return;
    }
    setRuntimeStatus('loading', 'Loading saved Activity response.');
    const loaded: Record<string, unknown> = { ...(optionsRef.current.initialResponses ?? {}) };
    const localEntries: Array<{ interactionId: string; record: BookRuntimeRecoveryRecord }> = [];
    const readTerminal = optionsRef.current.readTerminal;
    const restoredTerminal = readTerminal
      ? await readTerminal().catch((): BookRuntimeTerminalRead => ({ status: 'unavailable' }))
      : { status: 'confirmed-absent' as const };
    try {
      if (generation !== generationRef.current) return;
      if (restoredTerminal.status === 'confirmed-present') {
        await restoreCommittedResponses(restoredTerminal, generation);
        if (generation !== generationRef.current) return;
        setTerminalReadStatus(restoredTerminal.status);
        setTerminalReadResultStatus(restoredTerminal.resultStatus);
        setRuntimeStatus('saved', 'Submitted response loaded.');
        return;
      }
      const ids = optionsRef.current.interactionIds;
      const anchor = ids[0];
      const anchorDraft = anchor ? await optionsRef.current.client.readDraft(addressFor(anchor)) : null;
      if (generation !== generationRef.current) return;
      acknowledgedDraftRef.current = anchorDraft;
      const aggregate = anchorDraft ? runtimeResponsesFromActivityDraft(ids, anchorDraft.response) : null;
      if (anchorDraft && aggregate === null) throw new BookRuntimeClientError('invalid_response');
      await Promise.all(ids.map(async (interactionId) => {
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
        const server = aggregate !== null && Object.hasOwn(aggregate, interactionId)
          ? { ...anchorDraft!, response: aggregate[interactionId] } : null;
        if (server) {
          recoveryRevisionsRef.current.set(interactionId, server.revision);
        }
        if (pendingRef.current.has(interactionId)) return;
        const keepLocal = preserveLocal && restoredTerminal.status === 'confirmed-absent'
          && optionsRef.current.canAutosave !== false && local !== null && (
          anchorDraft === null || local.updatedAt > Date.parse(anchorDraft.updatedAt)
        );
        if (keepLocal && local) {
          loaded[interactionId] = structuredClone(local.response);
          localEntries.push({ interactionId, record: local });
          pendingRef.current.set(interactionId, {
            response: structuredClone(local.response),
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
      // Preserve edits made while the asynchronous reads were in flight.
      const merged = { ...loaded };
      for (const [interactionId, pending] of pendingRef.current) merged[interactionId] = pending.response;
      responsesRef.current = merged;
      setResponses(merged);
      setConflict(null);
      setTerminalReadStatus(restoredTerminal.status);
      setTerminalReadResultStatus(null);
      setTerminalResult(null);
      if (localEntries.length > 0) {
        setRuntimeStatus(online ? 'pending' : 'offline', online
          ? 'Recovered local response; saving.'
          : 'Offline response retained locally.');
        optionsRef.current.onMetric?.({ event: 'offline-retained' });
      } else {
        setRuntimeStatus('saved', 'Saved response loaded.');
      }
    } catch (error) {
      consumeCurrentWindow(error);
      if (generation !== generationRef.current) return;
      setTerminalReadStatus(restoredTerminal.status);
      setTerminalReadResultStatus(restoredTerminal.status === 'confirmed-present'
        ? restoredTerminal.resultStatus
        : null);
      setRuntimeStatus('offline', 'Saved response retained locally; Worker unavailable.');
      optionsRef.current.onMetric?.({ event: 'offline-retained' });
    }
  }, [addressFor, consumeCurrentWindow, now, online, removeRecovery, restoreCommittedResponses, setRuntimeStatus, store]);

  const flush = useCallback(async (reason = 'manual'): Promise<BookRuntimeFlushResult> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    const run = async (): Promise<BookRuntimeFlushResult> => {
      const deadline = now() + (optionsRef.current.flushDeadlineMs ?? DEFAULT_FLUSH_DEADLINE_MS);
      if (!online) {
        for (const [interactionId, entry] of pendingRef.current) {
          await persist(interactionId, entry.response, recoveryRevisionsRef.current.get(interactionId) ?? 0);
        }
        setRuntimeStatus('offline', 'Offline response retained locally.');
        return { status: 'offline', safeToLeave: false };
      }
      if (pendingRef.current.size === 0) {
        const saved = acknowledgedDraftRef.current;
        const snapshot = activityDraftFromRuntimeResponses(optionsRef.current.interactionIds, responsesRef.current);
        if (reason === 'submit' && JSON.stringify(saved?.response) !== JSON.stringify(snapshot)) {
          for (const [id, response] of Object.entries(responsesRef.current)) {
            pendingRef.current.set(id, { response, version: 1, operationId: randomId() });
          }
        }
      }
      if (pendingRef.current.size === 0) {
        setRuntimeStatus('saved', reason === 'reload' ? 'Saved response loaded.' : 'All responses saved.');
        return { status: 'idle', safeToLeave: true };
      }
      if (optionsRef.current.enabled === false || optionsRef.current.canAutosave === false) {
        return { status: 'deadline', safeToLeave: false };
      }
      setRuntimeStatus('saving', 'Saving response.');
      const retainPending = async () => {
        await Promise.all([...pendingRef.current].map(([id, entry]) => persist(
          id, entry.response, acknowledgedDraftRef.current?.revision ?? 0,
        )));
      };
      while (pendingRef.current.size > 0) {
        if (now() >= deadline) {
          setRuntimeStatus('unsafe-to-leave', 'Response still saving; keep this page open.');
          return { status: 'deadline', safeToLeave: false };
        }
        const interactionId = optionsRef.current.interactionIds[0]!;
        if (!writeSnapshotRef.current) {
          writeSnapshotRef.current = {
            responses: structuredClone(responsesRef.current),
            versions: new Map([...pendingRef.current].map(([id, entry]) => [id, entry.version])),
            operationId: [...pendingRef.current.values()][0]!.operationId,
            attempts: 0,
          };
        }
        const snapshot = writeSnapshotRef.current;
        let settlement = inFlightRef.current.get(interactionId);
        if (!settlement) {
          const generation = generationRef.current;
          const snapshotResponse = activityDraftFromRuntimeResponses(optionsRef.current.interactionIds, snapshot.responses);
          const acknowledged = acknowledgedDraftRef.current;
          const targetAddress = addressFor(interactionId);
          const startedAt = now();
          let created!: Promise<SaveSettlement>;
          created = (async (): Promise<SaveSettlement> => {
            try {
              if (!await acquireDraftWriteSlot(budgetKey, now, deadline)) {
                await retainPending();
                setRuntimeStatus('unsafe-to-leave', 'Response still saving; keep this page open.');
                return { status: 'deadline', safeToLeave: false };
              }
              const result = await optionsRef.current.client.saveDraft({
                ...targetAddress,
                operationId: snapshot.operationId,
                clientRevision: acknowledged?.revision ?? 0,
                response: snapshotResponse,
              });
              if (generation !== generationRef.current) return null;
              const revision = result.receipt.draftRevision ?? (acknowledged?.revision ?? 0) + 1;
              if (result.status === 'conflict' || result.receipt.status === 'conflict') {
                let current: BookRuntimeDraftRecord | null = null;
                try { current = await optionsRef.current.client.readDraft(targetAddress); } catch { /* retain local */ }
                setConflict({
                  interactionId,
                  localResponse: snapshotResponse,
                  serverResponse: current?.response ?? null,
                  serverRevision: current?.revision ?? null,
                });
                await retainPending();
                optionsRef.current.onMetric?.({ event: 'conflict' });
                setRuntimeStatus('conflict', 'Server changed this response. Choose retry, reload, or discard local.');
                return { status: 'conflict', safeToLeave: false };
              }
              if (result.status !== 'accepted' && result.status !== 'replayed') throw new BookRuntimeClientError('forbidden');
              const updatedAt = new Date(now()).toISOString();
              acknowledgedDraftRef.current = { schemaVersion: 1, ...targetAddress,
                recipientId: optionsRef.current.recipientId, response: snapshotResponse, revision,
                updatedAt, updatedByOperationId: snapshot.operationId };
              for (const id of Object.keys(snapshot.responses)) {
                recoveryRevisionsRef.current.set(id, revision);
              }
              optionsRef.current.onMetric?.({
                event: 'autosave-ack',
                durationMs: Math.max(0, now() - startedAt),
              });
              for (const [id, version] of snapshot.versions) {
                if (pendingRef.current.get(id)?.version === version) {
                  pendingRef.current.delete(id);
                  await removeRecovery(id);
                }
              }
              writeSnapshotRef.current = null;
              await retainPending();
              optionsRef.current.onMetric?.({
                event: 'autosave-write',
                payloadBytes: responseSize(snapshotResponse),
              });
              if (pendingRef.current.size === 0) {
                setConflict(null);
                setRuntimeStatus('saved', 'Response saved.');
              }
              return null;
            } catch (error) {
              if (generation !== generationRef.current) return null;
              consumeCurrentWindow(error);
              if (error instanceof BookRuntimeClientError
                && error.currentWindow
                && !error.currentWindow.permissions.canAutosave) {
                await retainPending();
                setRuntimeStatus('error', error.currentWindow.phase === 'unreleased'
                  ? 'This Activity is not released yet.'
                  : 'This Activity is read-only.');
                return { status: 'error', safeToLeave: false };
              }
              if (error instanceof BookRuntimeClientError && error.code === 'conflict') {
                let serverDraft: BookRuntimeDraftRecord | null = null;
                try { serverDraft = await optionsRef.current.client.readDraft(targetAddress); } catch { /* retain local */ }
                setConflict({
                  interactionId,
                  localResponse: snapshotResponse,
                  serverResponse: serverDraft?.response ?? null,
                  serverRevision: serverDraft?.revision ?? error.currentRevision ?? null,
                });
                await retainPending();
                optionsRef.current.onMetric?.({ event: 'conflict' });
                setRuntimeStatus('conflict', 'Server changed this response. Choose retry, reload, or discard local.');
                return { status: 'conflict', safeToLeave: false };
              }
              if (pendingRef.current.size > 0) {
                snapshot.attempts += 1;
                await retainPending();
                const maxRetries = optionsRef.current.maxRetries ?? DEFAULT_MAX_RETRIES;
                if (snapshot.attempts <= maxRetries) {
                  setRuntimeStatus('retrying', `Save retry ${snapshot.attempts} of ${maxRetries}.`);
                  optionsRef.current.onMetric?.({ event: 'retry', attempt: snapshot.attempts });
                  if (!retryTimerRef.current) {
                    retryTimerRef.current = setTimeout(() => {
                      retryTimerRef.current = null;
                      flushAgainRef.current();
                    }, (optionsRef.current.retryBaseMs ?? DEFAULT_RETRY_BASE_MS) * 2 ** (snapshot.attempts - 1));
                  }
                  return { status: 'error', safeToLeave: false };
                }
              }
              setRuntimeStatus('error', 'Could not save response; local recovery remains available.');
              return { status: 'error', safeToLeave: false };
            } finally {
              if (inFlightRef.current.get(interactionId) === created) {
                inFlightRef.current.delete(interactionId);
              }
            }
          })();
          settlement = created;
          inFlightRef.current.set(interactionId, settlement);
        }
        const settled = await waitForSettlement(settlement, Math.max(1, deadline - now()));
        if (settled === FLUSH_DEADLINE) {
          setRuntimeStatus('unsafe-to-leave', 'Response still saving; keep this page open.');
          return { status: 'deadline', safeToLeave: false };
        }
        if (settled) return settled;
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
  }, [addressFor, budgetKey, consumeCurrentWindow, now, online, persist, removeRecovery, setRuntimeStatus]);
  flushAgainRef.current = () => { void flush('settlement'); };

  const scheduleFlush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void flush('debounce');
    }, Math.max(optionsRef.current.debounceMs ?? MIN_DEBOUNCE_MS, MIN_DEBOUNCE_MS));
  }, [flush]);

  const change = useCallback((interactionId: string, response: unknown): boolean => {
    if (optionsRef.current.enabled === false || optionsRef.current.canAutosave === false) return false;
    if (terminalStatusRef.current !== 'confirmed-absent' || terminalByInteractionRef.current.size > 0 || submitPromiseRef.current.size > 0) return false;
    if (windowDecision && !windowDecision.permissions.canAutosave) {
      setRuntimeStatus('error', windowDecision.phase === 'unreleased'
        ? 'This Activity is not released yet.'
        : 'This Activity is read-only.');
      return false;
    }
    if (!optionsRef.current.interactionIds.includes(interactionId)) return false;
    let serialized: unknown;
    try {
      serialized = optionsRef.current.serializeResponse?.(interactionId, response) ?? response;
      structuredClone(serialized);
      JSON.stringify(serialized);
      activityDraftFromRuntimeResponses([interactionId], { [interactionId]: serialized });
    } catch {
      setRuntimeStatus('error', 'Activity response could not be serialized.');
      return false;
    }
    responsesRef.current = { ...responsesRef.current, [interactionId]: structuredClone(serialized) };
    setResponses(responsesRef.current);
    const previous = pendingRef.current.get(interactionId);
    pendingRef.current.set(interactionId, {
      response: structuredClone(serialized),
      version: (previous?.version ?? 0) + 1,
      // Each response snapshot needs its own id because the Worker fingerprints the payload.
      operationId: randomId(),
    });
    void persist(
      interactionId,
      serialized,
      recoveryRevisionsRef.current.get(interactionId) ?? 0,
    );
    setConflict(null);
    setRuntimeStatus(online ? 'pending' : 'offline', online
      ? 'Response pending save.'
      : 'Offline response retained locally.');
    scheduleFlush();
    return true;
  }, [online, persist, scheduleFlush, setRuntimeStatus, windowDecision]);

  const retry = useCallback(async (): Promise<BookRuntimeFlushResult> => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (writeSnapshotRef.current) writeSnapshotRef.current.attempts = 0;
    return flush('manual-retry');
  }, [flush]);

  const reload = useCallback(async (): Promise<void> => {
    generationRef.current += 1;
    pendingRef.current.clear();
    recoveryRevisionsRef.current.clear();
    acknowledgedDraftRef.current = null;
    writeSnapshotRef.current = null;
    inFlightRef.current.clear();
    await load(false);
  }, [load]);

  const refreshTerminal = useCallback(async (): Promise<void> => {
    const generation = generationRef.current;
    terminalStatusRef.current = 'unknown';
    setTerminalReadStatus('unknown');
    const result = await optionsRef.current.readTerminal?.().catch((): BookRuntimeTerminalRead => ({ status: 'unavailable' })) ?? { status: 'confirmed-absent' as const };
    if (generation !== generationRef.current) return;
    if (result.status === 'confirmed-present') {
      await restoreCommittedResponses(result, generation);
      if (generation !== generationRef.current) return;
    }
    terminalStatusRef.current = result.status;
    setTerminalReadStatus(result.status);
    setTerminalReadResultStatus(result.status === 'confirmed-present' ? result.resultStatus : null);
    setRuntimeStatus(result.status === 'unavailable' ? 'error' : pendingRef.current.size ? 'pending' : 'saved',
      result.status === 'unavailable' ? 'Submission status unavailable. Reload status to check again.' : result.status === 'confirmed-present' ? 'Activity submitted.' : 'Submission status checked.');
  }, [restoreCommittedResponses, setRuntimeStatus]);

  const discardLocal = useCallback(async (): Promise<void> => {
    for (const interactionId of optionsRef.current.interactionIds) {
      await removeRecovery(interactionId);
    }
    pendingRef.current.clear();
    setConflict(null);
    await reload();
  }, [reload, removeRecovery]);

  const submitActivity = useCallback(async (
    interactionId: string,
  ): Promise<BookRuntimeSubmitActivityResult> => {
    if (optionsRef.current.enabled === false || optionsRef.current.canSubmit === false) {
      throw new BookRuntimeClientError('forbidden', 403);
    }
    if (!optionsRef.current.interactionIds.includes(interactionId)) {
      throw new BookRuntimeClientError('invalid_response');
    }
    const anchorInteractionId = optionsRef.current.interactionIds[0];
    if (!anchorInteractionId) throw new BookRuntimeClientError('invalid_response');
    const existing = terminalByInteractionRef.current.get(anchorInteractionId);
    if (existing) return existing;
    if (terminalReadStatus !== 'confirmed-absent') {
      throw new BookRuntimeClientError('network_failure');
    }
    const inFlight = submitPromiseRef.current.get(anchorInteractionId);
    if (inFlight) return inFlight;
    if (windowDecision && !windowDecision.permissions.canSubmit) {
      setRuntimeStatus('error', windowDecision.phase === 'unreleased'
        ? 'This Activity is not released yet.'
        : 'The deadline has passed and late submission is not allowed.');
      throw new BookRuntimeClientError('forbidden', 403, undefined, windowDecision);
    }
    const run = (async () => {
      let submission;
      try {
        submission = activitySubmissionFromRuntimeResponses(optionsRef.current.interactionIds, responsesRef.current);
      } catch {
        throw new BookRuntimeClientError(optionsRef.current.interactionIds.some(
          (id) => !Object.hasOwn(responsesRef.current, id),
        ) ? 'incomplete_response' : 'invalid_response');
      }
      const flushed = await flush('submit');
      if (!flushed.safeToLeave) {
        throw new BookRuntimeClientError('network_failure');
      }
      const acknowledged = acknowledgedDraftRef.current;
      if (!acknowledged || JSON.stringify(acknowledged.response) !== JSON.stringify(submission)) {
        throw new BookRuntimeClientError('invalid_response');
      }
      setRuntimeStatus('saving', 'Submitting Activity.');
      let result: BookRuntimeSubmitActivityResult;
      let requestStarted = false;
      try {
        requestStarted = true;
        result = await optionsRef.current.client.submitActivity({
        ...addressFor(anchorInteractionId),
        operationId: randomId(),
        clientRevision: acknowledged.revision,
        response: submission,
      }); } catch (error) {
        consumeCurrentWindow(error);
        const uncertain = requestStarted || !(error instanceof BookRuntimeClientError) || ['network_failure', 'server_unavailable', 'conflict'].includes(error.code);
        if (uncertain) { terminalStatusRef.current = 'unavailable'; setTerminalReadStatus('unavailable'); }
        setRuntimeStatus('error', uncertain ? 'Submission outcome unavailable. Reload status before retrying.' : 'Activity was not submitted. Your saved response remains available.');
        throw error;
      }
      if (result.status !== 'accepted' && result.status !== 'replayed') {
        terminalStatusRef.current = 'unavailable';
        setTerminalReadStatus('unavailable');
        setRuntimeStatus('error', 'Submission outcome unavailable. Reload status before retrying.');
        throw new BookRuntimeClientError('conflict');
      }
      for (const id of optionsRef.current.interactionIds) {
        terminalByInteractionRef.current.set(id, result);
      }
      setTerminalResult(result);
      setRuntimeStatus('saved', result.resultStatus === 'pending_review'
        ? 'Submitted for teacher review.'
        : 'Activity submitted.');
      return result;
    })();
    submitPromiseRef.current.set(anchorInteractionId, run);
    try {
      return await run;
    } finally {
      submitPromiseRef.current.delete(anchorInteractionId);
    }
  }, [addressFor, consumeCurrentWindow, flush, setRuntimeStatus, terminalReadStatus, windowDecision]);

  useEffect(() => {
    generationRef.current += 1;
    pendingRef.current.clear();
    recoveryRevisionsRef.current.clear();
    acknowledgedDraftRef.current = null;
    writeSnapshotRef.current = null;
    terminalByInteractionRef.current.clear();
    submitPromiseRef.current.clear();
    setTerminalResult(null);
    setTerminalReadStatus(optionsRef.current.readTerminal ? 'unknown' : 'confirmed-absent');
    setTerminalReadResultStatus(null);
    if (optionsRef.current.windowDecision) {
      try {
        setWindowDecision(requireBookScheduleWindowDecision(optionsRef.current.windowDecision));
      } catch {
        setWindowDecision(null);
      }
    } else {
      setWindowDecision(null);
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    responsesRef.current = optionsRef.current.initialResponses ?? {};
    setResponses(responsesRef.current);
    const generation = generationRef.current;
    // Finish the previous connectivity generation's flush before restoring its queued work.
    void (async () => {
      if (flushPromiseRef.current) await flushPromiseRef.current;
      if (generation !== generationRef.current) return;
      await load(true);
      if (generation === generationRef.current && pendingRef.current.size > 0) void flush('recovery');
    })();
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
    refreshTerminal,
    discardLocal,
    submitActivity,
    terminalResult,
    terminalReadStatus,
    terminalReadResultStatus,
    windowDecision,
  };
};

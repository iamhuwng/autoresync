import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ReadingV2StudioSaveResult,
  ReadingV2StudioWorkflowSnapshot,
} from '../../components/reading-v2/studio/ReadingV2StudioShell';

export interface ReadingV2StudioAutosaveResult {
  readonly status: 'saved' | 'failed';
  readonly draftId: string;
  readonly revision?: number;
  readonly error?: unknown;
}

export interface UseReadingV2StudioAutosaveOptions {
  readonly autosaveKey: string;
  readonly enabled: boolean;
  readonly intervalMs?: number;
  readonly saveDraft: (snapshot: ReadingV2StudioWorkflowSnapshot) => ReadingV2StudioSaveResult | Promise<ReadingV2StudioSaveResult>;
  readonly onResult?: (result: ReadingV2StudioAutosaveResult) => void;
}

export const useReadingV2StudioAutosave = ({
  autosaveKey,
  enabled,
  intervalMs = 15000,
  saveDraft,
  onResult,
}: UseReadingV2StudioAutosaveOptions) => {
  const session = useMemo(() => ({
    active: true,
    pending: null as ReadingV2StudioWorkflowSnapshot | null,
    inFlight: null as Promise<ReadingV2StudioSaveResult | undefined> | null,
    revision: undefined as number | undefined,
  }), [autosaveKey, enabled]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const saveDraftRef = useRef(saveDraft);
  const onResultRef = useRef(onResult);
  saveDraftRef.current = saveDraft;
  onResultRef.current = onResult;
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);

  const queueAutosave = useCallback((snapshot: ReadingV2StudioWorkflowSnapshot) => {
    if (!enabled || sessionRef.current !== session) return;
    session.pending = snapshot;
    setSaveState((state) => state === 'error' || state === 'conflict' ? state : 'dirty');
  }, [enabled, session]);

  const flush = useCallback((): Promise<ReadingV2StudioSaveResult | undefined> => {
    if (session.inFlight) return session.inFlight;
    if (!enabled || !session.pending || sessionRef.current !== session) return Promise.resolve(undefined);
    const save = saveDraftRef.current;
    session.inFlight = Promise.resolve().then(async () => {
      let result: ReadingV2StudioSaveResult | undefined;
      while (session.pending && sessionRef.current === session && session.active) {
        const snapshot = { ...session.pending, revision: session.revision ?? session.pending.revision };
        session.pending = null;
        setSaveState('saving');
        try {
          result = await save(snapshot);
          if (sessionRef.current !== session || !session.active) return undefined;
          session.revision = result.revision;
          setSaveError(null);
          setSaveState(session.pending ? 'dirty' : 'saved');
          onResultRef.current?.({ status: 'saved', draftId: snapshot.draftId, revision: result.revision });
        } catch (error) {
          if (sessionRef.current !== session || !session.active) return undefined;
          session.pending ??= snapshot;
          setSaveState(error instanceof Error && 'payload' in error ? 'conflict' : 'error');
          setSaveError(error instanceof Error ? error.message : 'Could not save this draft.');
          onResultRef.current?.({ status: 'failed', draftId: snapshot.draftId, error });
          throw error;
        }
      }
      return result;
    }).finally(() => { session.inFlight = null; });
    return session.inFlight;
  }, [enabled, session]);

  const saveNow = useCallback((snapshot: ReadingV2StudioWorkflowSnapshot) => {
    session.pending = snapshot;
    return flush().then((result) => {
      if (!result) throw new Error('The draft session changed before the save was acknowledged.');
      return result;
    });
  }, [flush, session]);

  useEffect(() => {
    session.active = true;
    setSaveState('saved');
    setSaveError(null);
    if (!enabled) return () => { session.active = false; };
    const intervalId = setInterval(() => { void flush().catch(() => undefined); }, intervalMs);
    return () => {
      session.active = false;
      clearInterval(intervalId);
    };
  }, [enabled, flush, intervalMs, session]);

  return { queueAutosave, saveNow, flush, saveState, saveError };
};

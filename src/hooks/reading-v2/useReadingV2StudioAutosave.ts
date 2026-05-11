import { useCallback, useEffect, useRef } from 'react';
import type {
  ReadingV2StudioSaveResult,
  ReadingV2StudioWorkflowSnapshot,
} from '../../components/reading-v2/studio/ReadingV2StudioShell';

export interface ReadingV2StudioAutosaveResult {
  readonly status: 'saved' | 'failed';
  readonly draftId: string;
  readonly revisionToken?: string;
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
}: UseReadingV2StudioAutosaveOptions): {
  readonly queueAutosave: (snapshot: ReadingV2StudioWorkflowSnapshot) => void;
} => {
  const pendingSnapshotRef = useRef<ReadingV2StudioWorkflowSnapshot | null>(null);
  const inFlightRef = useRef(false);
  const saveDraftRef = useRef(saveDraft);
  const onResultRef = useRef(onResult);

  saveDraftRef.current = saveDraft;
  onResultRef.current = onResult;

  const queueAutosave = useCallback((snapshot: ReadingV2StudioWorkflowSnapshot) => {
    pendingSnapshotRef.current = snapshot;
  }, []);

  useEffect(() => {
    if (!enabled) {
      pendingSnapshotRef.current = null;
      return undefined;
    }

    const intervalId = setInterval(() => {
      const snapshot = pendingSnapshotRef.current;

      if (!snapshot || inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      void Promise.resolve(saveDraftRef.current(snapshot))
        .then((result) => {
          if (pendingSnapshotRef.current === snapshot) {
            pendingSnapshotRef.current = null;
          } else if (pendingSnapshotRef.current && result.revisionToken) {
            pendingSnapshotRef.current = {
              ...pendingSnapshotRef.current,
              revisionToken: result.revisionToken,
            };
          }
          onResultRef.current?.({
            status: 'saved',
            draftId: snapshot.draftId,
            revisionToken: result.revisionToken,
          });
        })
        .catch((error: unknown) => {
          onResultRef.current?.({
            status: 'failed',
            draftId: snapshot.draftId,
            error,
          });
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [autosaveKey, enabled, intervalMs]);

  return { queueAutosave };
};

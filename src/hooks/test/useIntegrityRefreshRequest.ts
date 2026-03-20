import { useEffect, useRef } from 'react';

interface UseIntegrityRefreshRequestOptions {
  enabled?: boolean;
  requestTimestamp?: number | null;
  onRefreshRequested: () => Promise<void> | void;
}

export function useIntegrityRefreshRequest({
  enabled = true,
  requestTimestamp,
  onRefreshRequested,
}: UseIntegrityRefreshRequestOptions): void {
  const lastHandledTimestampRef = useRef<number | null>(null);
  const onRefreshRequestedRef = useRef(onRefreshRequested);

  useEffect(() => {
    onRefreshRequestedRef.current = onRefreshRequested;
  }, [onRefreshRequested]);

  useEffect(() => {
    if (!enabled || typeof requestTimestamp !== 'number') {
      return;
    }

    if (lastHandledTimestampRef.current === null) {
      lastHandledTimestampRef.current = requestTimestamp;
      return;
    }

    if (requestTimestamp <= lastHandledTimestampRef.current) {
      return;
    }

    lastHandledTimestampRef.current = requestTimestamp;

    Promise.resolve(onRefreshRequestedRef.current()).catch((error) => {
      console.error('[IntegrityRefresh] Failed to flush integrity logs:', error);
    });
  }, [enabled, requestTimestamp]);
}

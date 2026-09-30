import { useCallback, useEffect, useRef, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { listTeacherThcsDraftPage, deleteThcsDraft } from '../../services/thcsDraftService';
import { listTeacherWritingDraftPage, deleteWritingDraft } from '../../services/writingTestService';

interface UseTeacherDraftsParams {
  userId: string;
  enabled: boolean;
}

type DraftKind = 'thcs' | 'writing';
type Cursor = { updatedAt: Timestamp; id: string };
type LobbyDraft = { id: string; updatedAt: Date; cursorUpdatedAt?: Timestamp; status?: string; publishedTestId?: string; draftKind: DraftKind } & Record<string, any>;
const PAGE_SIZE = 25;

const isUnpublishedDraft = (draft: LobbyDraft) => draft.status !== 'published' && !draft.publishedTestId;
const sortRecent = (a: LobbyDraft, b: LobbyDraft) => {
  const aTime = a.cursorUpdatedAt || Timestamp.fromDate(a.updatedAt);
  const bTime = b.cursorUpdatedAt || Timestamp.fromDate(b.updatedAt);
  return bTime.seconds - aTime.seconds
  || bTime.nanoseconds - aTime.nanoseconds
  || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  || (a.draftKind < b.draftKind ? -1 : a.draftKind > b.draftKind ? 1 : 0);
};

export function useTeacherDrafts({ userId, enabled }: UseTeacherDraftsParams) {
  const [drafts, setDrafts] = useState<LobbyDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursors = useRef<Partial<Record<DraftKind, Cursor>>>({});
  const generation = useRef(0);
  const loadingMoreNow = useRef(false);
  const loadingNow = useRef(false);

  const fetchPage = useCallback(async (reset: boolean) => {
    if (!userId || !enabled) return;
    if (!reset && (loadingNow.current || loadingMoreNow.current)) return;
    const request = reset ? ++generation.current : generation.current;
    if (reset) {
      cursors.current = {};
      loadingMoreNow.current = false;
      loadingNow.current = true;
      setDrafts([]);
      setHasMore(false);
      setLoading(true);
      setLoadingMore(false);
    } else {
      loadingMoreNow.current = true;
      setLoadingMore(true);
    }
    setError(null);

    try {
      const [thcs, writing] = await Promise.all([
        listTeacherThcsDraftPage(userId, cursors.current.thcs),
        listTeacherWritingDraftPage(userId, cursors.current.writing),
      ]);
      if (request !== generation.current) return;
      if (!thcs.success || !writing.success) {
        throw new Error(thcs.error || writing.error || 'Failed to load drafts');
      }

      const rows: LobbyDraft[] = [
        ...(thcs.data || []).map((draft) => ({ ...draft, draftKind: 'thcs' as const })),
        ...(writing.data || []).map((draft) => ({ ...draft, draftKind: 'writing' as const })),
      ].sort(sortRecent);
      const consumed = rows.slice(0, PAGE_SIZE);
      const nextCursors = { ...cursors.current };
      for (const draft of consumed) {
        nextCursors[draft.draftKind] = {
          updatedAt: draft.cursorUpdatedAt || Timestamp.fromDate(draft.updatedAt),
          id: draft.id,
        };
      }
      cursors.current = nextCursors;
      const visible = consumed.filter(isUnpublishedDraft);
      setDrafts((previous) => {
        const seen = new Set(previous.map((draft) => draft.draftKind + ':' + draft.id));
        return (reset ? visible : [...previous, ...visible.filter((draft) => !seen.has(draft.draftKind + ':' + draft.id))]).sort(sortRecent);
      });
      setHasMore(rows.length > PAGE_SIZE);
    } catch (err) {
      if (request === generation.current) {
        cursors.current = {};
        setDrafts([]);
        setHasMore(false);
        setError(err instanceof Error ? err.message : 'Failed to load drafts');
      }
    } finally {
      if (request === generation.current) {
        if (reset) {
          loadingNow.current = false;
          setLoading(false);
        } else {
          loadingMoreNow.current = false;
          setLoadingMore(false);
        }
      }
    }
  }, [userId, enabled]);

  useEffect(() => {
    if (enabled && userId) void fetchPage(true);
    else {
      generation.current++;
      cursors.current = {};
      loadingNow.current = false;
      loadingMoreNow.current = false;
      setDrafts([]);
      setHasMore(false);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
    }
    return () => { generation.current++; };
  }, [enabled, userId, fetchPage]);

  const refreshDrafts = () => fetchPage(true);
  const loadMore = () => hasMore ? fetchPage(false) : Promise.resolve();

  const deleteDraft = async (draftId: string): Promise<boolean> => {
    try {
      const draft = drafts.find((row) => row.id === draftId);
      if (!draft || !isUnpublishedDraft(draft)) return false;
      const result = draft.draftKind === 'writing'
        ? await deleteWritingDraft(draftId)
        : await deleteThcsDraft(draftId);
      if (!result.success) return false;
      setDrafts((previous) => previous.filter((row) => !(row.id === draftId && row.draftKind === draft.draftKind)));
      return true;
    } catch (err) {
      console.error('Failed to delete draft:', err);
      return false;
    }
  };

  return { drafts, loading, loadingMore, hasMore, error, deleteDraft, refreshDrafts, loadMore };
}

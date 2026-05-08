import { useState, useEffect } from 'react';
import { getUserThcsDrafts, deleteThcsDraft } from '../../services/thcsDraftService';
import { getUserWritingDrafts, deleteWritingDraft } from '../../services/writingTestService';

interface UseTeacherDraftsParams {
  userId: string;
  enabled: boolean;
}

export function useTeacherDrafts({ userId, enabled }: UseTeacherDraftsParams) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDrafts = async (): Promise<void> => {
    if (!userId) {
      setDrafts([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [thcsResult, writingResult] = await Promise.all([
        getUserThcsDrafts(userId),
        getUserWritingDrafts(userId),
      ]);

      const thcsDrafts = thcsResult.success && thcsResult.data
        ? thcsResult.data.map((draft: any) => ({ ...draft, draftKind: 'thcs' }))
        : [];
      const writingDrafts = writingResult.success && writingResult.data
        ? writingResult.data.map((draft: any) => ({ ...draft, draftKind: 'writing' }))
        : [];

      const mergedDrafts = [...thcsDrafts, ...writingDrafts].sort((a: any, b: any) => {
        const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt || 0).getTime();
        const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      });

      if (thcsResult.success || writingResult.success) {
        setDrafts(mergedDrafts);
      } else {
        setError(thcsResult.error || writingResult.error || 'Failed to load drafts');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load drafts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled || !userId) return;
    let isSubscribed = true;

    const loadDrafts = async () => {
      setLoading(true);
      setError(null);

      try {
        const [thcsResult, writingResult] = await Promise.all([
          getUserThcsDrafts(userId),
          getUserWritingDrafts(userId),
        ]);

        if (!isSubscribed) return;

        const thcsDrafts = thcsResult.success && thcsResult.data
          ? thcsResult.data.map((draft: any) => ({ ...draft, draftKind: 'thcs' }))
          : [];
        const writingDrafts = writingResult.success && writingResult.data
          ? writingResult.data.map((draft: any) => ({ ...draft, draftKind: 'writing' }))
          : [];

        const mergedDrafts = [...thcsDrafts, ...writingDrafts].sort((a: any, b: any) => {
          const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt || 0).getTime();
          const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt || 0).getTime();
          return bTime - aTime;
        });

        if (thcsResult.success || writingResult.success) {
          setDrafts(mergedDrafts);
        } else {
          setError(thcsResult.error || writingResult.error || 'Failed to load drafts');
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err.message || 'Failed to load drafts');
        }
      } finally {
        if (isSubscribed) setLoading(false);
      }
    };

    loadDrafts();
    return () => { isSubscribed = false; };
  }, [enabled, userId]);

  const deleteDraft = async (draftId: string): Promise<boolean> => {
    try {
      const draft = drafts.find((d: any) => d.id === draftId);
      const result = draft?.draftKind === 'writing'
        ? await deleteWritingDraft(draftId)
        : await deleteThcsDraft(draftId);
      if (result.success) {
        setDrafts(prev => prev.filter(d => d.id !== draftId));
        return true;
      } else {
        alert('Failed to delete draft: ' + (result.error || 'Unknown error'));
        return false;
      }
    } catch (err) {
      console.error('Failed to delete draft:', err);
      alert('Failed to delete draft. Please try again.');
      return false;
    }
  };

  return { drafts, loading, error, deleteDraft, refreshDrafts };
}

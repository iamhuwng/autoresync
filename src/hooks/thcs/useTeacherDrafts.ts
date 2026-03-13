import { useState, useEffect } from 'react';
import { getUserThcsDrafts, deleteThcsDraft } from '../../services/thcsDraftService';

interface UseTeacherDraftsParams {
  userId: string;
  enabled: boolean;
}

export function useTeacherDrafts({ userId, enabled }: UseTeacherDraftsParams) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;
    let isSubscribed = true;

    const loadDrafts = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getUserThcsDrafts(userId);
        if (!isSubscribed) return;
        if (result.success && result.data) {
          setDrafts(result.data);
        } else {
          setError(result.error || 'Failed to load drafts');
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
      const result = await deleteThcsDraft(draftId);
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

  return { drafts, loading, error, deleteDraft };
}

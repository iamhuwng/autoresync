/**
 * useHistoricalScores Hook (PRD-0039 Task 2.11)
 *
 * Loads historical scores for trend analysis based on an anchor result.
 *
 * Input: (studentId: string | undefined, anchorResult: TestResultRecord | null, limit?: number)
 * Return: { scores: TestResultRecord[], loading: boolean, error: string | null }
 */

import { useState, useEffect } from 'react';
import { getHistoricalScores, TestResultRecord } from '../services/testResults.service';

interface UseHistoricalScoresReturn {
  scores: TestResultRecord[];
  loading: boolean;
  error: string | null;
}

export function useHistoricalScores(
  studentId: string | undefined,
  anchorResult: TestResultRecord | null,
  limit?: number
): UseHistoricalScoresReturn {
  const [scores, setScores] = useState<TestResultRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If studentId is undefined or anchorResult is null, return immediately with empty data
    if (!studentId || !anchorResult) {
      setScores([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchScores() {
      setLoading(true);
      setError(null);

      try {
        const result = await getHistoricalScores(studentId!, anchorResult!, limit);
        if (!cancelled) {
          setScores(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch historical scores');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchScores();

    return () => {
      cancelled = true;
    };
  }, [studentId, anchorResult?.resultId]);

  return { scores, loading, error };
}

/**
 * useTestAttempts Hook (PRD-0039 Task 2.10)
 *
 * Loads all test attempts for a student on a specific test.
 * Returns attempts sorted by submittedAt DESC.
 *
 * Input: (studentId: string | undefined, testId: string | undefined)
 * Return: { attempts: TestResultRecord[], loading: boolean, error: string | null }
 */

import { useState, useEffect } from 'react';
import { getStudentTestAttempts, TestResultRecord } from '../services/testResults.service';

interface UseTestAttemptsReturn {
  attempts: TestResultRecord[];
  loading: boolean;
  error: string | null;
}

export function useTestAttempts(
  studentId: string | undefined,
  testId: string | undefined
): UseTestAttemptsReturn {
  const [attempts, setAttempts] = useState<TestResultRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If either input is undefined, return immediately with empty data
    if (!studentId || !testId) {
      setAttempts([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchAttempts() {
      setLoading(true);
      setError(null);

      try {
        const result = await getStudentTestAttempts(studentId!, testId!);
        if (!cancelled) {
          setAttempts(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch attempts');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAttempts();

    return () => {
      cancelled = true;
    };
  }, [studentId, testId]);

  return { attempts, loading, error };
}

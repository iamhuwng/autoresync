/**
 * useClassPosition Hook (PRD-0039 Task 2.12)
 *
 * Loads class-level test scores and computes aggregate position data.
 * PRIVACY: Individual student scores never reach the UI layer.
 * Only returns aggregate data: average, totalStudents, position.
 *
 * Input: (testId: string | undefined, classId: string | undefined, studentPercentage: number | undefined)
 * Return: { average: number | null, totalStudents: number, position: 'above' | 'at' | 'below' | null, loading: boolean, error: string | null }
 */

import { useState, useEffect } from 'react';
import { getClassTestScores } from '../services/testResults.service';

interface UseClassPositionReturn {
  average: number | null;
  totalStudents: number;
  position: 'above' | 'at' | 'below' | null;
  loading: boolean;
  error: string | null;
}

export function useClassPosition(
  testId: string | undefined,
  classId: string | undefined,
  studentPercentage: number | undefined
): UseClassPositionReturn {
  const [average, setAverage] = useState<number | null>(null);
  const [totalStudents, setTotalStudents] = useState(0);
  const [position, setPosition] = useState<'above' | 'at' | 'below' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If classId is undefined, return immediately with null data
    if (!testId || !classId) {
      setAverage(null);
      setTotalStudents(0);
      setPosition(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchAndCompute() {
      setLoading(true);
      setError(null);

      try {
        const records = await getClassTestScores(testId!, classId!);

        if (cancelled) return;

        if (records.length === 0) {
          setAverage(null);
          setTotalStudents(0);
          setPosition(null);
        } else {
          // Compute average as mean of percentages
          const sum = records.reduce((acc, r) => acc + r.percentage, 0);
          const avg = sum / records.length;
          setAverage(avg);
          setTotalStudents(records.length);

          // Compute position relative to average
          if (studentPercentage !== undefined) {
            if (studentPercentage > avg + 0.5) {
              setPosition('above');
            } else if (studentPercentage < avg - 0.5) {
              setPosition('below');
            } else {
              setPosition('at');
            }
          } else {
            setPosition(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch class scores');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAndCompute();

    return () => {
      cancelled = true;
    };
  }, [testId, classId, studentPercentage]);

  return { average, totalStudents, position, loading, error };
}

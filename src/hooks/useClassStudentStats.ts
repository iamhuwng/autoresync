import { useState, useEffect, useCallback, useRef } from 'react';
import { useClassRoster } from './useClassRoster';
import { getHomeworkSubmissions } from '../services/homeworkSubmissionService';
import type { HomeworkAssignment, HomeworkSubmission } from '../types/homework.types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StudentStats {
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  homeworkAssigned: number;
  completedCount: number;
  overdueCount: number;
  averageScore: number;
  completionRate: number;
  lastSubmissionDate: number | null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useClassStudentStats(
  classId: string | null,
  classHomework: HomeworkAssignment[]
) {
  const [studentStats, setStudentStats] = useState<StudentStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache pattern: store computed stats keyed by classId (Task 2.5d)
  const cacheRef = useRef<Record<string, StudentStats[]>>({});

  // Use the existing hook to get class roster (1 RTDB read, may be cached)
  const { students: rosterStudents, loading: rosterLoading } = useClassRoster(classId || undefined);

  const fetchStats = useCallback(async (forceRefresh = false) => {
    if (!classId) {
      setStudentStats([]);
      setLoading(false);
      return;
    }

    // Check cache first (Task 2.5d)
    if (!forceRefresh && cacheRef.current[classId]) {
      setStudentStats(cacheRef.current[classId]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch all submissions for class homework (N Firestore queries)
      const allSubmissions: HomeworkSubmission[] = [];
      const fetchPromises = classHomework.map(async (hw) => {
        try {
          const subs = await getHomeworkSubmissions(hw.id);
          return subs;
        } catch {
          console.warn(`Failed to fetch submissions for homework ${hw.id}`);
          return [];
        }
      });

      const results = await Promise.all(fetchPromises);
      for (const subs of results) {
        allSubmissions.push(...subs);
      }

      // Cross-reference roster with submissions to compute per-student stats
      const computedStats: StudentStats[] = rosterStudents.map(student => {
        // Find all submissions by this student
        const studentSubs = allSubmissions.filter(s => s.studentId === student.uid);

        // Count homework assigned to this student (all class homework)
        const homeworkAssigned = classHomework.length;

        // Completed = submissions with status 'submitted' or 'graded'
        const completedHomeworkIds = new Set<string>();
        for (const sub of studentSubs) {
          if (sub.status === 'submitted' || sub.status === 'graded') {
            completedHomeworkIds.add(sub.homeworkId);
          }
        }
        const completedCount = completedHomeworkIds.size;

        // Overdue = homework that is past_due and student hasn't submitted
        const overdueCount = classHomework.filter(hw =>
          hw.status === 'past_due' && !completedHomeworkIds.has(hw.id)
        ).length;

        // Average score from graded/submitted submissions
        const scoredSubs = studentSubs.filter(s => s.percentage != null);
        const averageScore = scoredSubs.length > 0
          ? Math.round(scoredSubs.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / scoredSubs.length)
          : 0;

        // Completion rate
        const completionRate = homeworkAssigned > 0
          ? Math.round((completedCount / homeworkAssigned) * 100)
          : 0;

        // Last submission date
        const submittedDates = studentSubs
          .filter(s => s.submittedAt)
          .map(s => s.submittedAt!);
        const lastSubmissionDate = submittedDates.length > 0
          ? Math.max(...submittedDates)
          : null;

        return {
          studentId: student.uid,
          studentName: student.name,
          avatarUrl: null, // roster doesn't include avatar URLs
          homeworkAssigned,
          completedCount,
          overdueCount,
          averageScore,
          completionRate,
          lastSubmissionDate,
        };
      });

      // Store in cache (Task 2.5d)
      cacheRef.current[classId] = computedStats;
      setStudentStats(computedStats);
    } catch (err) {
      console.error('Error computing student stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load student statistics');
    } finally {
      setLoading(false);
    }
  }, [classId, classHomework, rosterStudents]);

  // Fetch stats when classId changes or roster finishes loading
  useEffect(() => {
    if (!classId || rosterLoading) return;
    fetchStats();
  }, [classId, rosterLoading, fetchStats]);

  // Refetch function that bypasses cache (Task 2.5e)
  const refetch = useCallback(() => {
    if (classId) {
      delete cacheRef.current[classId];
    }
    return fetchStats(true);
  }, [classId, fetchStats]);

  return {
    studentStats,
    loading: loading || rosterLoading,
    error,
    refetch,
  };
}

export default useClassStudentStats;

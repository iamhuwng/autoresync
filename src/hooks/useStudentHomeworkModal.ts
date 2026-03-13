import { useMemo, useState, useCallback } from 'react';
import type { HomeworkAssignment } from '../types/homework.types';

const PAGE_SIZE = 20;

export function useStudentHomeworkModal(
  studentId: string | null,
  classId: string | null,
  allHomework: HomeworkAssignment[]
) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // ── Filter homework using explicit rules (Task 2.6a) ──
  const studentHomework = useMemo(() => {
    if (!studentId) return [];

    // Step 1: Filter by inclusion rules
    const included = allHomework.filter(hw => {
      // Exclude 'course' and 'group' type homework
      if (hw.target.type === 'course' || hw.target.type === 'group') return false;

      // Include homework where target.type === 'students' AND student is named
      if (hw.target.type === 'students' && hw.target.studentIds.includes(studentId)) {
        return true;
      }

      // If classId is provided (opened from class drill-down):
      // ALSO include homework targeting that class
      if (classId && hw.target.type === 'class' && hw.target.classId === classId) {
        return true;
      }

      // If classId is NOT provided: only include students-type above
      return false;
    });

    // Step 2: Sort with class priority (FR-33)
    if (classId) {
      // Partition into class homework and other homework
      const classHomework = included.filter(
        hw => hw.target.type === 'class' && hw.target.classId === classId
      );
      const otherHomework = included.filter(
        hw => !(hw.target.type === 'class' && hw.target.classId === classId)
      );

      // Sort each group by createdAt desc
      classHomework.sort((a, b) => b.createdAt - a.createdAt);
      otherHomework.sort((a, b) => b.createdAt - a.createdAt);

      // Class homework first
      return [...classHomework, ...otherHomework];
    }

    // No classId: sort all by createdAt desc
    return included.sort((a, b) => b.createdAt - a.createdAt);
  }, [studentId, classId, allHomework]);

  // Reset display count when student changes
  useMemo(() => {
    setDisplayCount(PAGE_SIZE);
  }, [studentId, classId]);

  const hasMore = displayCount < studentHomework.length;

  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + PAGE_SIZE);
  }, []);

  return {
    studentHomework: studentHomework.slice(0, displayCount),
    displayCount,
    loadMore,
    hasMore,
    totalCount: studentHomework.length,
  };
}

export default useStudentHomeworkModal;

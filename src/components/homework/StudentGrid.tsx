import React from 'react';
// @ts-ignore — Card.jsx has no type declarations (pre-existing pattern)
import { Card } from '../modern/Card';
import {
  BackArrowIcon,
  ChevronRightIcon,
  RefreshIcon,
  EmptyStudentsIcon,
} from './HomeworkIcons';
import { StudentCard } from './StudentCard';
import { useClassStudentStats } from '../../hooks/useClassStudentStats';
import type { HomeworkAssignment } from '../../types/homework.types';
import './StudentGrid.css';

// ─── Vietnamese diacritic-insensitive search (copied per Task 2.3/4.4) ───────
function normalizeSearchValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface StudentGridProps {
  classId: string;
  className: string;
  classHomework: HomeworkAssignment[];
  onBack: () => void;
  onStudentClick: (studentId: string, studentName: string, classId: string, className: string) => void;
  searchQuery: string;
}

// ─── Skeleton Card ───────────────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  return (
    <div style={{ '--index': index } as React.CSSProperties}>
      <Card variant="glass" className="student-card--skeleton">
        <div className="skeleton-avatar" />
        <div style={{ flex: 1 }}>
          <div className="skeleton-line skeleton-line--name" />
          <div className="skeleton-line skeleton-line--stats" />
          <div className="skeleton-line skeleton-line--meta" />
        </div>
      </Card>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StudentGrid({
  classId,
  className: classDisplayName,
  classHomework,
  onBack,
  onStudentClick,
  searchQuery,
}: StudentGridProps) {
  const { studentStats, loading, refetch } = useClassStudentStats(classId, classHomework);

  // Filter students by search query
  const filteredStudents = React.useMemo(() => {
    if (!searchQuery.trim()) return studentStats;
    const normalizedQuery = normalizeSearchValue(searchQuery.trim());
    return studentStats.filter(s =>
      normalizeSearchValue(s.studentName).includes(normalizedQuery)
    );
  }, [studentStats, searchQuery]);

  // Sort: completed-all students to bottom per FR-19
  const sortedStudents = React.useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      const aCompleted = a.completedCount >= a.homeworkAssigned && a.overdueCount === 0;
      const bCompleted = b.completedCount >= b.homeworkAssigned && b.overdueCount === 0;
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;
      // Among non-completed: overdue first
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount;
      return a.studentName.localeCompare(b.studentName, 'vi', { sensitivity: 'base' });
    });
  }, [filteredStudents]);

  return (
    <div>
      {/* ── Breadcrumb Bar (FR-14, FR-15) ── */}
      <div className="student-grid__breadcrumb">
        <button
          className="student-grid__back"
          onClick={onBack}
          title="Back to All Targets"
          type="button"
        >
          <BackArrowIcon size={16} />
        </button>
        <span
          className="student-grid__breadcrumb-link"
          onClick={onBack}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onBack()}
        >
          All Targets
        </span>
        <span className="student-grid__breadcrumb-separator">
          <ChevronRightIcon size={14} />
        </span>
        <span className="student-grid__breadcrumb-current">
          {classDisplayName}
        </span>
        <button
          className="student-grid__refresh"
          onClick={refetch}
          title="Refresh student data"
          type="button"
        >
          <RefreshIcon size={14} />
        </button>
      </div>

      {/* ── Grid ── */}
      <div className="student-grid__cards">
        {loading ? (
          // Skeleton loading state (FR-23)
          <>
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} index={i} />
            ))}
          </>
        ) : sortedStudents.length === 0 ? (
          // Empty state (FR-57)
          <div className="student-grid__empty">
            <div className="student-grid__empty-icon">
              <EmptyStudentsIcon size={56} />
            </div>
            <p className="student-grid__empty-text">
              {searchQuery.trim()
                ? 'No students match your search.'
                : 'No students found in this class.'}
            </p>
          </div>
        ) : (
          // Student cards
          sortedStudents.map((student, index) => (
            <div
              key={student.studentId}
              style={{ '--index': index } as React.CSSProperties}
            >
              <StudentCard
                student={student}
                onClick={(studentId, studentName) =>
                  onStudentClick(studentId, studentName, classId, classDisplayName)
                }
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default StudentGrid;

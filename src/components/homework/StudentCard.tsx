// @ts-ignore — Card.jsx has no type declarations (pre-existing pattern)
import { Card } from '../modern/Card';
import { CheckCircleIcon, OverdueFlashIcon } from './HomeworkIcons';
import type { StudentStats } from '../../hooks/useClassStudentStats';
import './StudentCard.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic color from student name for avatar background */
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6d28d9',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] as string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = (parts[0] ?? '')[0] ?? '';
    const last = (parts[parts.length - 1] ?? '')[0] ?? '';
    return (first + last).toUpperCase();
  }
  return (name[0] || '?').toUpperCase();
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ${date.getDate()}`;
}

// ─── Progress Ring Constants ─────────────────────────────────────────────────

const RING_RADIUS = 24;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface StudentCardProps {
  student: StudentStats;
  onClick: (studentId: string, studentName: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StudentCard({ student, onClick }: StudentCardProps) {
  const isOverdue = student.overdueCount > 0;
  const avatarColor = getAvatarColor(student.studentName);
  const initials = getInitials(student.studentName);

  // Progress ring offset: full circumference = 0%, 0 = 100%
  const progressOffset = RING_CIRCUMFERENCE - (student.completionRate / 100) * RING_CIRCUMFERENCE;

  const cardClass = [
    'student-card',
    isOverdue ? 'student-card--overdue' : '',
  ].filter(Boolean).join(' ');

  return (
    <Card
      variant="glass"
      hover
      className={cardClass}
      onClick={() => onClick(student.studentId, student.studentName)}
    >
      {/* ── Avatar with Progress Ring ── */}
      <div
        className="student-card__avatar"
        style={{ background: avatarColor }}
      >
        {initials}
        <svg className="student-card__progress-ring" viewBox="0 0 54 54">
          <circle
            className="student-card__progress-ring-bg"
            cx="27" cy="27" r={RING_RADIUS}
          />
          <circle
            className="student-card__progress-ring-fill"
            cx="27" cy="27" r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={progressOffset}
          />
        </svg>
      </div>

      {/* ── Body ── */}
      <div className="student-card__body">
        <div className="student-card__name" title={student.studentName}>
          {student.studentName}
        </div>

        {/* Stats row */}
        <div className="student-card__stats">
          <span className="student-card__stat-item">
            <CheckCircleIcon size={13} />
            {student.completedCount}/{student.homeworkAssigned}
          </span>
          {isOverdue && (
            <span className="student-card__stat-item student-card__stat-item--danger">
              <OverdueFlashIcon size={13} color="#ef4444" />
              {student.overdueCount} overdue
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="student-card__meta">
          <span>Avg: {student.averageScore}%</span>
          <span className="student-card__meta-separator">·</span>
          <span>Last: {formatDate(student.lastSubmissionDate)}</span>
        </div>
      </div>
    </Card>
  );
}

export default StudentCard;

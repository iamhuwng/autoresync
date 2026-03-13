import { HomeworkStatusBadge } from './HomeworkStatusBadge';
import { KebabActionMenu } from './KebabActionMenu';
import {
  DocumentIcon,
  ClassIcon,
  StudentIcon,
  ClockIcon,
  RetryIcon,
  BarChartIcon,
} from './HomeworkIcons';
import type { HomeworkAssignment } from '../../types/homework.types';
import './CompactHomeworkCard.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDueDate(timestamp: number | undefined): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(hw: HomeworkAssignment): boolean {
  if (hw.status === 'past_due') return true;
  if (!hw.scheduling?.dueDate) return false;
  return hw.scheduling.dueDate < Date.now() && hw.status === 'active';
}

function getTargetLabel(hw: HomeworkAssignment): { icon: 'class' | 'student'; label: string } {
  if (hw.target?.type === 'students') {
    const names = hw.target.studentNames;
    return { icon: 'student', label: names?.[0] ?? 'Student' };
  }
  if (hw.target?.type === 'class') {
    return { icon: 'class', label: hw.target.className ?? 'Class' };
  }
  if (hw.target?.type === 'course') {
    return { icon: 'class', label: hw.target.courseName ?? 'Course' };
  }
  if (hw.target?.type === 'group') {
    return { icon: 'class', label: hw.target.groupName ?? 'Group' };
  }
  return { icon: 'class', label: 'Unknown' };
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CompactHomeworkCardProps {
  homework: HomeworkAssignment;
  onClick: (hw: HomeworkAssignment) => void;
  onEdit: (hw: HomeworkAssignment) => void;
  onDuplicate: (hw: HomeworkAssignment) => void;
  onDelete: (hw: HomeworkAssignment) => void;
  onExtendDeadline: (hw: HomeworkAssignment) => void;
  onRestore?: (hw: HomeworkAssignment) => void;
  onPermanentDelete?: (hw: HomeworkAssignment) => void;
  onResetComplete?: (hw: HomeworkAssignment) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CompactHomeworkCard({
  homework,
  onClick,
  onEdit,
  onDuplicate,
  onDelete,
  onExtendDeadline,
  onRestore,
  onPermanentDelete,
  onResetComplete,
}: CompactHomeworkCardProps) {
  const overdue = isOverdue(homework);
  const target = getTargetLabel(homework);
  const completionRate = homework.stats?.completionRate ?? 0;
  const submittedCount = homework.stats?.submitted ?? 0;
  const totalStudents = homework.stats?.totalAssigned ?? 0;
  const avgScore = homework.stats?.averageScore ?? 0;
  const displayTitle = homework.title ?? homework.materialTitle;

  return (
    <div
      className="compact-hw-card"
      onClick={() => onClick(homework)}
    >
      {/* Left Status Border */}
      <div className={`compact-hw-card__status-border compact-hw-card__status-border--${homework.status}`} />

      {/* Content Area */}
      <div className="compact-hw-card__content">
        {/* Row 1: Title + Badge + Target */}
        <div className="compact-hw-card__row1">
          <span className="compact-hw-card__title-icon">
            <DocumentIcon size={14} />
          </span>
          <span className="compact-hw-card__title" title={displayTitle}>
            {displayTitle}
          </span>
          <HomeworkStatusBadge status={homework.status} />
          <span className="compact-hw-card__target" title={target.label}>
            {target.icon === 'class' ? <ClassIcon size={12} /> : <StudentIcon size={12} />}
            {target.label}
          </span>
        </div>

        {/* Row 2: Due date + timer + attempts */}
        <div className="compact-hw-card__row2">
          <span className={`compact-hw-card__detail ${overdue ? 'compact-hw-card__detail--overdue' : ''}`}>
            <ClockIcon size={12} />
            {formatDueDate(homework.scheduling?.dueDate)}
          </span>
          {homework.config?.timerMinutes != null && homework.config.timerMinutes > 0 && (
            <span className="compact-hw-card__detail">
              <ClockIcon size={12} />
              {homework.config.timerMinutes}m
            </span>
          )}
          {homework.config?.maxAttempts != null && (
            <span className="compact-hw-card__detail">
              <RetryIcon size={12} />
              {homework.config.maxAttempts}x
            </span>
          )}
        </div>

        {/* Row 3: Progress + submitted + avg */}
        <div className="compact-hw-card__row3">
          <div className="compact-hw-card__inline-progress">
            <div
              className="compact-hw-card__inline-progress-fill"
              style={{ width: `${completionRate}%` }}
            />
          </div>
          <span>{submittedCount}/{totalStudents} submitted</span>
          <span className="compact-hw-card__detail">
            <BarChartIcon size={12} />
            {Math.round(avgScore)}%
          </span>
        </div>
      </div>

      {/* Kebab */}
      <div className="compact-hw-card__kebab">
        <KebabActionMenu
          homework={homework}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExtendDeadline={onExtendDeadline}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
          onResetComplete={onResetComplete}
        />
      </div>
    </div>
  );
}

export default CompactHomeworkCard;

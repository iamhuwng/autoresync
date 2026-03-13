// @ts-ignore — Card.jsx has no type declarations (pre-existing pattern)
import { Card } from '../modern/Card';
import {
  ClassIcon,
  StudentIcon,
  OverdueFlashIcon,
  CheckCircleIcon,
  UsersIcon,
  CalendarIcon,
} from './HomeworkIcons';
import type { TargetCardData } from '../../hooks/useTargetGrid';
import './TargetCard.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // Today
  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  // Same year → "Mar 13"
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  if (date.getFullYear() === now.getFullYear()) {
    return `${month} ${day}`;
  }

  // Different year → "Mar 13, 2025"
  return `${month} ${day}, ${date.getFullYear()}`;
}

function getProgressColorClass(rate: number): string {
  if (rate < 30) return 'target-card__progress-fill--danger';
  if (rate < 60) return 'target-card__progress-fill--low';
  return '';
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface TargetCardProps {
  target: TargetCardData;
  onClick: (target: TargetCardData) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TargetCard({ target, onClick }: TargetCardProps) {
  const isOverdue = target.overdueCount > 0;
  const isCompleted = target.activeCount === 0 && target.overdueCount === 0;

  const cardClass = [
    'target-card',
    isOverdue ? 'target-card--overdue' : '',
    isCompleted ? 'target-card--completed' : '',
  ].filter(Boolean).join(' ');

  return (
    <Card
      variant="glass"
      hover
      className={cardClass}
      onClick={() => onClick(target)}
    >
      {/* ── Header: Icon + Name + Overdue Badge ── */}
      <div className="target-card__header">
        <div className="target-card__icon">
          {target.targetType === 'class' ? (
            <ClassIcon size={20} />
          ) : (
            <StudentIcon size={20} />
          )}
        </div>
        <span className="target-card__name" title={target.targetName}>
          {target.targetName}
        </span>
        {isOverdue && (
          <span className="target-card__overdue-badge">
            <OverdueFlashIcon size={12} color="#ef4444" />
            {target.overdueCount}
          </span>
        )}
      </div>

      {/* ── Meta Line ── */}
      <div className="target-card__meta">
        <span className="target-card__meta-item">
          <CheckCircleIcon size={13} />
          {target.activeCount} active
        </span>
        {target.overdueCount > 0 && (
          <>
            <span className="target-card__meta-separator">·</span>
            <span className="target-card__meta-item" style={{ color: '#ef4444' }}>
              <OverdueFlashIcon size={13} color="#ef4444" />
              {target.overdueCount} overdue
            </span>
          </>
        )}
        {target.targetType === 'class' && target.studentCount > 0 && (
          <>
            <span className="target-card__meta-separator">·</span>
            <span className="target-card__meta-item">
              <UsersIcon size={13} />
              {target.studentCount} students
            </span>
          </>
        )}
      </div>

      {/* ── Progress Bar ── */}
      <div className="target-card__progress">
        <div className="target-card__progress-header">
          <span>Completion</span>
          <span className="target-card__progress-percent">
            {target.completionRate}%
          </span>
        </div>
        <div className="target-card__progress-bar">
          <div
            className={`target-card__progress-fill ${getProgressColorClass(target.completionRate)}`}
            style={{ width: `${target.completionRate}%` }}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="target-card__footer">
        <span className="target-card__footer-item">
          {target.totalCount} total
        </span>
        <span className="target-card__footer-item">
          <CalendarIcon size={12} />
          Latest: {formatDate(target.latestHomeworkDate)}
        </span>
      </div>
    </Card>
  );
}

export default TargetCard;

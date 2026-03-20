import { Button } from '../modern';
import {
  TotalIcon,
  ActiveIcon,
  WarningIcon,
  PercentIcon,
  AttentionIcon,
} from './HomeworkIcons';
import './CompactStatsBar.css';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CompactStatsBarProps {
  totalCount: number;
  visibleCount: number;
  activeScheduledCount: number;
  pastDueCount: number;
  avgCompletionRate: number;
  needsAttentionCount: number;
  onClosePastDue: () => void;
  onCreateHomework: () => void;
  userId?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CompactStatsBar({
  totalCount,
  visibleCount,
  activeScheduledCount,
  pastDueCount,
  avgCompletionRate,
  needsAttentionCount,
  onClosePastDue,
  onCreateHomework,
  userId,
}: CompactStatsBarProps) {
  return (
    <div className="compact-stats-bar" role="region" aria-label="Homework statistics">

      {/* Total */}
      <div className="compact-stats-bar__stat">
        <span className="compact-stats-bar__stat-icon"><TotalIcon size={16} /></span>
        <span className="compact-stats-bar__stat-label">Total:</span>
        <span className="compact-stats-bar__stat-value">{totalCount}</span>
        <span className="compact-stats-bar__stat-helper">({visibleCount} visible)</span>
      </div>

      <div className="compact-stats-bar__divider" />

      {/* Active + Scheduled */}
      <div className="compact-stats-bar__stat">
        <span className="compact-stats-bar__stat-icon"><ActiveIcon size={16} /></span>
        <span className="compact-stats-bar__stat-label">Active:</span>
        <span className="compact-stats-bar__stat-value">{activeScheduledCount}</span>
      </div>

      <div className="compact-stats-bar__divider" />

      {/* Past Due */}
      <div className={`compact-stats-bar__stat ${pastDueCount > 0 ? 'compact-stats-bar__stat--past-due' : ''}`}>
        <span className="compact-stats-bar__stat-icon"><WarningIcon size={16} /></span>
        <span className="compact-stats-bar__stat-label">Past Due:</span>
        <span className="compact-stats-bar__stat-value">{pastDueCount}</span>
      </div>

      <div className="compact-stats-bar__divider" />

      {/* Avg Completion */}
      <div className="compact-stats-bar__stat">
        <span className="compact-stats-bar__stat-icon"><PercentIcon size={16} /></span>
        <span className="compact-stats-bar__stat-label">Avg:</span>
        <span className="compact-stats-bar__stat-value">{Math.round(avgCompletionRate)}%</span>
      </div>

      <div className="compact-stats-bar__divider" />

      {/* Needs Attention */}
      <div className="compact-stats-bar__stat">
        <span className="compact-stats-bar__stat-icon"><AttentionIcon size={16} /></span>
        <span className="compact-stats-bar__stat-label">Attention:</span>
        <span className="compact-stats-bar__stat-value">{needsAttentionCount}</span>
      </div>

      {/* Actions — right-aligned */}
      <div className="compact-stats-bar__actions">
        <Button
          variant="secondary"
          onClick={onClosePastDue}
          disabled={pastDueCount === 0 || !userId}
        >
          Close All Past Due
        </Button>
        <Button
          variant="primary"
          onClick={onCreateHomework}
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          }}
        >
          ➕ Create New Homework
        </Button>
      </div>
    </div>
  );
}

export default CompactStatsBar;

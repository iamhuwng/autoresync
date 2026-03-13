import React from 'react';
// @ts-ignore — Button.jsx has no type declarations (pre-existing pattern)
import { Button } from '../modern/Button';
import { EmptyHomeworkIcon } from './HomeworkIcons';
import { TargetCard } from './TargetCard';
import type { TargetCardData } from '../../hooks/useTargetGrid';
import './TargetGrid.css';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface TargetGridProps {
  targetCards: TargetCardData[];
  onTargetClick: (target: TargetCardData) => void;
  onCreateHomework?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TargetGrid({
  targetCards,
  onTargetClick,
  onCreateHomework,
}: TargetGridProps) {
  // ── Empty State (FR-56) ──
  if (targetCards.length === 0) {
    return (
      <div className="target-grid">
        <div className="target-grid__empty">
          <div className="target-grid__empty-icon">
            <EmptyHomeworkIcon size={64} />
          </div>
          <h3 className="target-grid__empty-heading">No homework yet</h3>
          <p className="target-grid__empty-desc">
            You haven&#39;t assigned any homework. Create your first assignment
            to start tracking student progress.
          </p>
          {onCreateHomework && (
            <Button variant="primary" size="sm" onClick={onCreateHomework}>
              Create Homework
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="target-grid">
      {targetCards.map((target, index) => (
        <div
          key={`${target.targetType}-${target.targetId}`}
          style={{ '--index': index } as React.CSSProperties}
        >
          <TargetCard target={target} onClick={onTargetClick} />
        </div>
      ))}
    </div>
  );
}

export default TargetGrid;

/**
 * AttemptHistory — PRD-0039 Task 6.6–6.8
 *
 * Presentational attempt switcher for the active result.
 * Shared loading/fetching lives in the parent panel so all tabs stay in sync.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './AttemptHistory.css';

export interface AttemptHistoryItem {
  resultId: string;
  submittedAt: number;
  createdAt?: number;
  percentage?: number;
  attemptNumber?: number;
  contextLabel?: string;
  statusLabel?: string;
  scoreLabel?: string;
}

export interface AttemptHistoryProps {
  currentResult: AttemptHistoryItem;
  attempts: readonly AttemptHistoryItem[];
  loading?: boolean;
  onAttemptChange: (resultId: string) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPercentage(pct: number): string {
  return `${Math.round(pct)}%`;
}

export const AttemptHistory: React.FC<AttemptHistoryProps> = ({
  currentResult,
  attempts,
  loading = false,
  onAttemptChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const currentIndex = attempts.findIndex((attempt) => attempt.resultId === currentResult.resultId);
    optionRefs.current[Math.max(0, currentIndex)]?.focus();
  }, [attempts, currentResult.resultId, isOpen]);

  const handleSelect = useCallback((resultId: string) => {
    if (resultId !== currentResult.resultId) {
      onAttemptChange(resultId);
    }
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [currentResult.resultId, onAttemptChange]);

  const handleOptionKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % attempts.length;
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + attempts.length) % attempts.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = attempts.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      optionRefs.current[nextIndex]?.focus();
    }
  }, [attempts.length]);

  if (loading || attempts.length <= 1) {
    return null;
  }

  const currentIndex = attempts.findIndex((attempt) => attempt.resultId === currentResult.resultId);
  const attemptNumber = currentResult.attemptNumber
    ?? (currentIndex >= 0 ? attempts.length - currentIndex : attempts.length);
  const totalAttempts = attempts.length;
  const newest = attempts[0]!;
  const oldest = attempts[attempts.length - 1]!;
  const hasComparablePercentages = typeof newest.percentage === 'number'
    && typeof oldest.percentage === 'number';
  const diff = hasComparablePercentages ? newest.percentage! - oldest.percentage! : 0;
  const improvementText = hasComparablePercentages
    ? diff > 0
      ? `+${Math.round(diff)}% improvement`
      : diff < 0
        ? `${Math.round(diff)}% change`
        : 'No change'
    : null;

  return (
    <div className="ah-root" ref={dropdownRef} data-testid="ah-root">
      <button
        ref={triggerRef}
        type="button"
        className="ah-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="ah-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="attempt-history-options"
        aria-label={`Select result attempt. Attempt ${attemptNumber} of ${totalAttempts}`}
      >
        <span className="ah-label">
          Attempt {attemptNumber} of {totalAttempts}
        </span>
        <svg className={`ah-chevron ${isOpen ? 'ah-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {improvementText && (
        <span
          className={`ah-improvement ${diff > 0 ? 'ah-improvement--up' : diff < 0 ? 'ah-improvement--down' : ''}`}
          data-testid="ah-improvement"
        >
          {improvementText}
        </span>
      )}

      {isOpen && (
        <div
          id="attempt-history-options"
          className="ah-dropdown"
          data-testid="ah-dropdown"
          role="listbox"
          aria-label="Result attempts"
        >
          {attempts.map((attempt, index) => {
            const optionNumber = attempt.attemptNumber ?? totalAttempts - index;
            const isCurrent = attempt.resultId === currentResult.resultId;
            const scoreLabel = attempt.scoreLabel
              ?? (typeof attempt.percentage === 'number' ? formatPercentage(attempt.percentage) : null);
            const accessibleParts = [
              `Attempt ${optionNumber}`,
              attempt.contextLabel,
              attempt.statusLabel,
              scoreLabel,
              formatDate(attempt.submittedAt || attempt.createdAt || 0),
            ].filter(Boolean);

            return (
              <button
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                key={attempt.resultId}
                className={`ah-option ${isCurrent ? 'ah-option--active' : ''}`}
                onClick={() => handleSelect(attempt.resultId)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                data-testid={`ah-option-${optionNumber}`}
                role="option"
                aria-selected={isCurrent}
                aria-label={accessibleParts.join(', ')}
              >
                <div className="ah-option-main">
                  <span className="ah-option-num">Attempt {optionNumber}</span>
                  {scoreLabel && <span className="ah-option-score">{scoreLabel}</span>}
                </div>
                {(attempt.contextLabel || attempt.statusLabel) && (
                  <span className="ah-option-context">
                    {[attempt.contextLabel, attempt.statusLabel].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span className="ah-option-date">{formatDate(attempt.submittedAt || attempt.createdAt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

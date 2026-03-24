/**
 * AttemptHistory — PRD-0039 Task 6.6–6.8
 *
 * Presentational attempt switcher for the active result.
 * Shared loading/fetching lives in the parent panel so all tabs stay in sync.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TestResultRecord } from '../../services/testResults.service';
import './AttemptHistory.css';

export interface AttemptHistoryProps {
  currentResult: TestResultRecord;
  attempts: TestResultRecord[];
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

  const handleSelect = useCallback((resultId: string) => {
    if (resultId !== currentResult.resultId) {
      onAttemptChange(resultId);
    }
    setIsOpen(false);
  }, [currentResult.resultId, onAttemptChange]);

  if (loading || attempts.length <= 1) {
    return null;
  }

  const currentIndex = attempts.findIndex((attempt) => attempt.resultId === currentResult.resultId);
  const attemptNumber = currentIndex >= 0 ? attempts.length - currentIndex : attempts.length;
  const totalAttempts = attempts.length;
  const newest = attempts[0]!;
  const oldest = attempts[attempts.length - 1]!;
  const diff = newest.percentage - oldest.percentage;
  const improvementText = diff > 0
    ? `+${Math.round(diff)}% improvement`
    : diff < 0
      ? `${Math.round(diff)}% change`
      : 'No change';

  return (
    <div className="ah-root" ref={dropdownRef} data-testid="ah-root">
      <button
        className="ah-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        data-testid="ah-trigger"
      >
        <span className="ah-label">
          Attempt {attemptNumber} of {totalAttempts}
        </span>
        <svg className={`ah-chevron ${isOpen ? 'ah-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <span
        className={`ah-improvement ${diff > 0 ? 'ah-improvement--up' : diff < 0 ? 'ah-improvement--down' : ''}`}
        data-testid="ah-improvement"
      >
        {improvementText}
      </span>

      {isOpen && (
        <div className="ah-dropdown" data-testid="ah-dropdown">
          {attempts.map((attempt, index) => {
            const optionNumber = totalAttempts - index;
            const isCurrent = attempt.resultId === currentResult.resultId;

            return (
              <button
                key={attempt.resultId}
                className={`ah-option ${isCurrent ? 'ah-option--active' : ''}`}
                onClick={() => handleSelect(attempt.resultId)}
                data-testid={`ah-option-${optionNumber}`}
              >
                <div className="ah-option-main">
                  <span className="ah-option-num">Attempt {optionNumber}</span>
                  <span className="ah-option-score">{formatPercentage(attempt.percentage)}</span>
                </div>
                <span className="ah-option-date">{formatDate(attempt.submittedAt || attempt.createdAt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

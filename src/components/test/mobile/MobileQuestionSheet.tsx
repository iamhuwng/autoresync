/**
 * MobileQuestionSheet — Bottom sheet for question navigation
 *
 * Slides up from bottom edge with 250ms ease-out animation.
 * Semi-transparent backdrop behind the sheet.
 * Close triggers: close button, swipe-down gesture, backdrop tap.
 * Near-full viewport height (leaving ~48px for mobile header).
 * Must not redirect or navigate.
 *
 * No @mantine imports.
 * @see PRD-0043 Task 3.4
 */

import React, { useRef, useCallback, useEffect } from 'react';
import './MobileQuestionSheet.css';

export interface MobileQuestionSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Sheet title (optional) */
  title?: string;
  /** Render the built-in header row */
  showHeader?: boolean;
  /** Sheet body content */
  children: React.ReactNode;
}

// Minimum distance (px) user must swipe down to trigger close
const SWIPE_THRESHOLD = 60;

export const MobileQuestionSheet: React.FC<MobileQuestionSheetProps> = ({
  isOpen,
  onClose,
  title = 'Questions',
  showHeader = true,
  children,
}) => {
  const headerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

  // ── Swipe-down gesture on header ──────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      touchStartY.current = null;
      if (deltaY > SWIPE_THRESHOLD) {
        onClose();
      }
    },
    [onClose],
  );

  // ── Lock body scroll when open ────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  // ── Escape key closes sheet ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="mobile-question-sheet-backdrop"
        className={`mobile-question-sheet-backdrop${isOpen ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        data-testid="mobile-question-sheet"
        className={`mobile-question-sheet${isOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {showHeader ? (
          <div
            ref={headerRef}
            className="mobile-question-sheet-header"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="mobile-question-sheet-handle" aria-hidden="true" />
            <span className="mobile-question-sheet-header-title">{title}</span>
            <button
              data-testid="mobile-question-sheet-close"
              className="mobile-question-sheet-close-btn"
              onClick={onClose}
              aria-label="Close question sheet"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </button>
          </div>
        ) : null}

        {/* Body */}
        <div className="mobile-question-sheet-body" data-testid="mobile-question-sheet-body">
          {children}
        </div>
      </div>
    </>
  );
};

export default MobileQuestionSheet;

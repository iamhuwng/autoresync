/**
 * MobileListeningHeader — Compact top bar for mobile Listening exam
 *
 * Renders exactly three functional areas:
 *   - Timer display (left)
 *   - Submit trigger (center)
 *   - Overflow trigger (right)
 *
 * Audio controls are NOT embedded here — they live in row 2 (audio row).
 *
 * No @mantine imports. No internal state. No Firebase/storage/router imports.
 * @see PRD-0045 Task 2.3, FR-7
 */

import React from 'react';
import { MOBILE_LISTENING_LAYER_Z_INDEX } from './mobileListeningLayering';

export interface MobileListeningHeaderProps {
  /** Remaining time in seconds */
  timeRemaining: number;
  /** Timer formatter from host */
  formatTime: (seconds: number) => string;
  /** Open the submit confirmation sheet */
  onSubmitPress: () => void;
  /** Toggle overflow menu */
  onOverflowMenuToggle: () => void;
  /** Whether exam is paused (live mode) */
  isPaused: boolean;
  /** Whether wait state is active */
  isWaiting: boolean;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Whether test has been submitted */
  testSubmitted: boolean;
}

const headerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: MOBILE_LISTENING_LAYER_Z_INDEX.HEADER,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 48,
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingLeft: 8,
  paddingRight: 8,
  background: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  boxSizing: 'border-box',
};

const timerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '0.8125rem',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: '#1e293b',
  minWidth: 64,
};

const submitButtonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 999,
  border: 'none',
  background: '#0f172a',
  color: '#ffffff',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  flexShrink: 0,
  margin: '0 6px',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
};

const overflowBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 8,
  color: '#64748b',
  fontSize: '1.25rem',
  padding: 0,
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
};

export const MobileListeningHeader: React.FC<MobileListeningHeaderProps> = ({
  timeRemaining,
  formatTime,
  onSubmitPress,
  onOverflowMenuToggle,
  isPaused,
  isWaiting,
  isSubmitting,
  testSubmitted,
}) => {
  const isTimeLow = timeRemaining > 0 && timeRemaining <= 300; // 5 min warning
  const isUntimed = !isFinite(timeRemaining);
  // Submit disabled when: paused, waiting, submitting, or already submitted (PRD FR-33..36)
  const submitDisabled = isPaused || isWaiting || isSubmitting || testSubmitted;
  const submitLabel = testSubmitted ? 'Submitted' : isSubmitting ? 'Submitting' : 'Submit';
  const visibleTimerText = testSubmitted
    ? 'Done'
    : isPaused
      ? 'Paused'
      : isUntimed
        ? 'Untimed'
        : formatTime(timeRemaining);
  const timerAriaLabel = testSubmitted
    ? 'Time remaining: Done'
    : isPaused
      ? 'Time remaining: Paused'
      : isUntimed
        ? 'Time remaining: untimed'
        : `Time remaining: ${formatTime(timeRemaining)}${isTimeLow ? '. Less than 5 minutes left' : ''}`;

  return (
    <header
      data-testid="mobile-listening-header"
      style={headerStyle}
      role="banner"
    >
      {/* Timer — Left */}
      <div
        data-testid="mobile-listening-header-timer"
        role="status"
        aria-live="polite"
        aria-label={timerAriaLabel}
        style={{
          ...timerStyle,
          color: isPaused
            ? '#f59e0b'
            : isTimeLow
              ? '#ef4444'
              : '#1e293b',
        }}
      >
        {/* Clock icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {visibleTimerText}
      </div>

      {/* Submit CTA — Center */}
      <button
        data-testid="mobile-listening-header-submit"
        style={{
          ...submitButtonStyle,
          background: submitDisabled ? '#cbd5e1' : '#0f172a',
          color: submitDisabled ? '#475569' : '#ffffff',
          cursor: submitDisabled ? 'default' : 'pointer',
        }}
        onClick={onSubmitPress}
        aria-label="Submit test"
        type="button"
        disabled={submitDisabled}
      >
        {submitLabel}
      </button>

      {/* Overflow Menu — Right */}
      <button
        data-testid="mobile-listening-header-overflow"
        style={overflowBtnStyle}
        onClick={onOverflowMenuToggle}
        aria-label="More options"
        type="button"
      >
        {/* Three-dot vertical icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>
    </header>
  );
};

export default MobileListeningHeader;

/**
 * MobileReadingHeader — Compact top bar for mobile Reading exam
 *
 * Renders: timer (left) · passage label (center) · overflow menu icon (right)
 * Height: 48px. Respects safe-area-inset-top for notch phones.
 *
 * No @mantine imports. No internal state.
 * @see PRD-0043 Task 3.1
 */

import React from 'react';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

export interface MobileReadingHeaderProps {
  /** Exam mode */
  mode: 'live' | 'solo' | 'homework';
  /** Remaining time in seconds */
  timeRemaining: number;
  /** Timer formatter from host */
  formatTime: (seconds: number) => string;
  /** Open the submit / review flow */
  onSubmitPress: () => void;
  /** Toggle overflow menu */
  onOverflowMenuToggle: () => void;
  /** Whether exam is paused (live mode) */
  isPaused: boolean;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Whether test has been submitted */
  testSubmitted: boolean;
}

const headerStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: MOBILE_READING_LAYER_Z_INDEX.HEADER,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 48,
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingLeft: 12,
  paddingRight: 12,
  background: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  boxSizing: 'border-box',
};

const timerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '0.875rem',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: '#1e293b',
  minWidth: 72,
};

const submitButtonStyle: React.CSSProperties = {
  minHeight: 34,
  padding: '0 16px',
  borderRadius: 999,
  border: 'none',
  background: '#0f172a',
  color: '#ffffff',
  fontSize: '0.8125rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  flexShrink: 0,
  margin: '0 8px',
  WebkitTapHighlightColor: 'transparent',
};

const overflowBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 8,
  color: '#64748b',
  fontSize: '1.25rem',
  padding: 0,
  WebkitTapHighlightColor: 'transparent',
};

export const MobileReadingHeader: React.FC<MobileReadingHeaderProps> = ({
  timeRemaining,
  formatTime,
  onSubmitPress,
  onOverflowMenuToggle,
  isPaused,
  isSubmitting,
  testSubmitted,
}) => {
  const isTimeLow = timeRemaining > 0 && timeRemaining <= 300; // 5 min warning
  const isUntimed = !isFinite(timeRemaining);
  const submitDisabled = isSubmitting || testSubmitted;
  const submitLabel = testSubmitted ? 'Submitted' : isSubmitting ? 'Submitting' : 'Submit';

  return (
    <header
      data-testid="mobile-reading-header"
      style={headerStyle}
      role="banner"
    >
      {/* Timer — Left */}
      <div
        data-testid="mobile-header-timer"
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
        {testSubmitted
          ? 'Done'
          : isPaused
            ? 'Paused'
            : isUntimed
              ? '∞'
              : formatTime(timeRemaining)}
      </div>

      {/* Submit CTA — Center */}
      <button
        data-testid="mobile-header-submit"
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
        data-testid="mobile-header-overflow"
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

export default MobileReadingHeader;

/**
 * MobileQuestionsFab — Floating action button showing question progress
 *
 * Bottom-right positioned, respects safe-area-inset-bottom.
 * Shows the compact "Questions" label with an unanswered badge.
 *
 * No @mantine imports. No internal state.
 * @see PRD-0043 Task 3.3
 */

import React from 'react';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

export interface MobileQuestionsFabProps {
  /** Number of answered questions */
  answeredCount: number;
  /** Total number of questions */
  totalCount: number;
  /** Number of unanswered questions */
  unansweredCount: number;
  /** Callback when FAB is pressed */
  onPress: () => void;
}

const fabContainerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
  right: 16,
  zIndex: MOBILE_READING_LAYER_Z_INDEX.FAB,
};

const fabButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 48,
  minWidth: 48,
  padding: '0 16px',
  border: 'none',
  borderRadius: 24,
  background: '#1e293b',
  color: '#ffffff',
  fontSize: '0.8125rem',
  fontWeight: 600,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)',
  WebkitTapHighlightColor: 'transparent',
  transition: 'transform 0.1s ease, box-shadow 0.1s ease',
};

const badgeBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.6875rem',
  fontWeight: 700,
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  padding: '0 5px',
  lineHeight: 1,
};

export const MobileQuestionsFab: React.FC<MobileQuestionsFabProps> = ({
  answeredCount,
  totalCount,
  unansweredCount,
  onPress,
}) => {
  return (
    <div style={fabContainerStyle} data-testid="mobile-questions-fab-container">
      <button
        data-testid="mobile-questions-fab"
        style={fabButtonStyle}
        onClick={onPress}
        aria-label={`Questions. ${answeredCount} answered of ${totalCount}. ${unansweredCount} unanswered.`}
        type="button"
      >
        {/* Clipboard icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 2V1.5a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 10 1.5V2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5.5 6.5h5M5.5 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>

        <span>Questions</span>

        {/* Unanswered badge — warning amber */}
        {unansweredCount > 0 && (
          <span
            data-testid="fab-unanswered-badge"
            style={{
              ...badgeBaseStyle,
              background: '#fbbf24',
              color: '#78350f',
            }}
          >
            {unansweredCount}
          </span>
        )}
      </button>
    </div>
  );
};

export default MobileQuestionsFab;

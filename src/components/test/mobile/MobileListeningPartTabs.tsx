/**
 * MobileListeningPartTabs — Dynamic-width part tabs for Listening
 *
 * Renders N equal-width tabs (N = partCount) derived from the test's
 * `audioSections.length`, NOT hardcoded to 4.
 *
 * Label-only — no counts, badges, or secondary labels (PRD FR-13).
 * Tapping the active tab does nothing (PRD FR-14).
 *
 * Unlike MobilePassageTabs (which scrolls and uses passage IDs),
 * this uses fixed 1-based part numbers for Listening's N-part structure.
 *
 * No @mantine imports. No internal state beyond refs.
 * @see PRD-0045 Task 2.4, FR-11..16
 */

import React from 'react';
import { MOBILE_LISTENING_LAYER_Z_INDEX } from './mobileListeningLayering';

export interface MobileListeningPartTabsProps {
  /** Currently viewed part number (1-based) */
  activePartNumber: number;
  /** Callback when user taps a different part tab */
  onPartChange: (partNumber: number) => void;
  /** Total number of parts to render (derived from audioSections.length).
   *  Defaults to 4 for backward compatibility. */
  partCount?: number;
}

const stripStyle: React.CSSProperties = {
  display: 'flex',
  position: 'sticky',
  top: 48, // Below compact header
  zIndex: MOBILE_LISTENING_LAYER_Z_INDEX.PART_TABS,
  height: 44,
  minHeight: 44,
  borderBottom: '1px solid #e2e8f0',
  background: '#ffffff',
  padding: 0,
};

const tabBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  flex: 1, // Equal width for all tabs
  fontSize: '0.75rem',
  fontWeight: 500,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#64748b',
  whiteSpace: 'nowrap',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  position: 'relative',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  transition: 'color 0.15s ease',
  boxSizing: 'border-box',
  padding: 0,
};

const activeIndicatorStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 4,
  right: 4,
  height: 2,
  borderRadius: '3px 3px 0 0',
  background: '#3b82f6',
};

export const MobileListeningPartTabs: React.FC<MobileListeningPartTabsProps> = ({
  activePartNumber,
  onPartChange,
  partCount = 4,
}) => {
  // Clamp to sensible range (1-10)
  const safeCount = Math.max(1, Math.min(partCount, 10));

  return (
    <div
      data-testid="mobile-listening-part-tabs"
      role="tablist"
      aria-label="Listening parts"
      style={stripStyle}
    >
      {Array.from({ length: safeCount }, (_, i) => {
        const partNumber = i + 1;
        const isActive = partNumber === activePartNumber;
        const label = `Part ${partNumber}`;

        return (
          <button
            key={partNumber}
            data-testid={`listening-part-tab-${partNumber}`}
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            type="button"
            onClick={() => {
              // PRD FR-14: tapping the currently active tab must do nothing
              if (!isActive) {
                onPartChange(partNumber);
              }
            }}
            style={{
              ...tabBaseStyle,
              color: isActive ? '#1e293b' : '#64748b',
              fontWeight: isActive ? 600 : 500,
              cursor: isActive ? 'default' : 'pointer',
            }}
          >
            {label}
            {isActive && <span style={activeIndicatorStyle} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
};

export default MobileListeningPartTabs;

/**
 * MobilePassageTabs — Horizontal scrollable tab strip for passage switching
 *
 * Reusable in both the main page and the question sheet.
 * Auto-scrolls active tab into view on activePassageId change.
 *
 * No @mantine imports. No internal state beyond refs.
 * @see PRD-0043 Task 3.2
 */

import React, { useRef, useEffect, useCallback } from 'react';

export interface MobilePassageTabsProps {
  /** Array of passages with id and optional label */
  passages: Array<{ id: string; title?: string }>;
  /** Currently active passage ID */
  activePassageId: string;
  /** Callback when user taps a tab */
  onPassageChange: (passageId: string) => void;
}

const stripStyle: React.CSSProperties = {
  display: 'flex',
  overflowX: 'auto',
  overflowY: 'hidden',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none', // Firefox
  height: 44,
  minHeight: 44,
  borderBottom: '1px solid #e2e8f0',
  background: '#ffffff',
  padding: '0 8px',
  gap: 0,
};

const tabBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: '0 16px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#64748b',
  whiteSpace: 'nowrap',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  position: 'relative',
  flexShrink: 0,
  maxWidth: 140,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  WebkitTapHighlightColor: 'transparent',
  transition: 'color 0.15s ease',
  boxSizing: 'border-box',
};

const activeIndicatorStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 4,
  right: 4,
  height: 3,
  borderRadius: '3px 3px 0 0',
  background: '#3b82f6',
};

export const MobilePassageTabs: React.FC<MobilePassageTabsProps> = ({
  passages,
  activePassageId,
  onPassageChange,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const setTabRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) {
      tabRefs.current.set(id, el);
    } else {
      tabRefs.current.delete(id);
    }
  }, []);

  // Auto-scroll active tab into view
  useEffect(() => {
    const container = scrollRef.current;
    const activeTab = tabRefs.current.get(activePassageId);
    if (!container || !activeTab) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();

    // Center the tab in the container
    const scrollLeft = activeTab.offsetLeft - (containerRect.width / 2) + (tabRect.width / 2);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    } else {
      container.scrollLeft = scrollLeft;
    }
  }, [activePassageId]);

  return (
    <div
      data-testid="mobile-passage-tabs"
      ref={scrollRef}
      role="tablist"
      aria-label="Passages"
      style={stripStyle}
    >
      {/* Hide scrollbar via inline style for webkit */}
      <style>{`[data-testid="mobile-passage-tabs"]::-webkit-scrollbar { display: none; }`}</style>

      {passages.map((passage, index) => {
        const isActive = passage.id === activePassageId;
        const label = `Passage ${index + 1}`;

        return (
          <button
            key={passage.id}
            ref={(el) => setTabRef(passage.id, el)}
            data-testid={`passage-tab-${passage.id}`}
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            type="button"
            onClick={() => onPassageChange(passage.id)}
            style={{
              ...tabBaseStyle,
              color: isActive ? '#1e293b' : '#64748b',
              fontWeight: isActive ? 600 : 500,
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

export default MobilePassageTabs;

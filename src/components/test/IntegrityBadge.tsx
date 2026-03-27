/**
 * IntegrityBadge — PRD-0036 Task 7.1
 * A compact, reusable badge showing integrity violation status.
 * 
 * Risk levels:
 *  - low  (0 violations): green dot
 *  - medium (1-2): amber dot + count
 *  - high (3+): red dot + count
 */

import React from 'react';

interface IntegrityBadgeProps {
  violationCount: number;
  riskLevel: 'low' | 'medium' | 'high';
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const badgeBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 6px',
  borderRadius: '999px',
  fontWeight: 600,
  fontSize: '0.75rem',
  lineHeight: 1,
  border: 'none',
  background: 'transparent',
};

const dotStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

export const IntegrityBadge: React.FC<IntegrityBadgeProps> = ({
  violationCount,
  riskLevel,
  onClick,
}) => {
  let dotColor: string;
  let textColor: string;
  let label: React.ReactNode = null;

  switch (riskLevel) {
    case 'low':
      dotColor = '#10b981';
      textColor = '#10b981';
      // No count text for low risk
      break;
    case 'medium':
      dotColor = '#f59e0b';
      textColor = '#f59e0b';
      label = <span style={{ color: textColor }}>⚠️ {violationCount}</span>;
      break;
    case 'high':
      dotColor = '#ef4444';
      textColor = '#ef4444';
      label = <span style={{ color: textColor }}>🚩 {violationCount}</span>;
      break;
    default:
      dotColor = '#10b981';
      textColor = '#10b981';
  }

  const content = (
    <>
      <span style={dotStyle(dotColor)} />
      {label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          ...badgeBaseStyle,
          cursor: 'pointer',
        }}
        title={`${violationCount} integrity violation${violationCount !== 1 ? 's' : ''}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      style={badgeBaseStyle}
      title={`${violationCount} integrity violation${violationCount !== 1 ? 's' : ''}`}
    >
      {content}
    </span>
  );
};

export default IntegrityBadge;

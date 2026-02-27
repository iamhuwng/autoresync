import React from 'react';
import PropTypes from 'prop-types';

/**
 * AuroraCard - A glassmorphic card component with aurora theme
 */
export const AuroraCard = ({ children, tone = 'default', style = {}, className = '' }) => {
  const toneStyles = {
    default: {
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    teal: {
      background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)',
      border: '1px solid rgba(20, 184, 166, 0.3)',
    },
    twilight: {
      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
      border: '1px solid rgba(139, 92, 246, 0.3)',
    },
    aurora: {
      background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(139, 92, 246, 0.15) 50%, rgba(236, 72, 153, 0.15) 100%)',
      border: '1px solid rgba(167, 139, 250, 0.3)',
    },
    glacier: {
      background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
      border: '1px solid rgba(56, 189, 248, 0.3)',
    },
    emerald: {
      background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
      border: '1px solid rgba(52, 211, 153, 0.3)',
    },
    rose: {
      background: 'linear-gradient(135deg, rgba(251, 113, 133, 0.1) 0%, rgba(244, 63, 94, 0.1) 100%)',
      border: '1px solid rgba(251, 113, 133, 0.3)',
    },
    slate: {
      background: 'rgba(100, 116, 139, 0.1)',
      border: '1px solid rgba(100, 116, 139, 0.3)',
    },
  };

  const cardStyle = {
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
    ...toneStyles[tone],
    ...style,
  };

  return (
    <div className={className} style={cardStyle}>
      {children}
    </div>
  );
};

AuroraCard.propTypes = {
  children: PropTypes.node.isRequired,
  tone: PropTypes.oneOf(['default', 'teal', 'twilight', 'aurora', 'glacier', 'emerald', 'rose', 'slate']),
  style: PropTypes.object,
  className: PropTypes.string,
};

/**
 * AuroraCardSection - A section within an AuroraCard
 */
export const AuroraCardSection = ({ children, direction = 'column', gap = '1rem', style = {} }) => {
  const sectionStyle = {
    display: 'flex',
    flexDirection: direction,
    gap: gap,
    ...style,
  };

  return <div style={sectionStyle}>{children}</div>;
};

AuroraCard.Section = AuroraCardSection;

AuroraCardSection.propTypes = {
  children: PropTypes.node.isRequired,
  direction: PropTypes.oneOf(['row', 'column']),
  gap: PropTypes.string,
  style: PropTypes.object,
};

/**
 * AuroraMetric - A metric display component
 */
export const AuroraMetric = ({ label, value, tone = 'default' }) => {
  const toneColors = {
    default: '#64748b',
    emerald: '#10b981',
    rose: '#f43f5a',
    teal: '#14b8a6',
    violet: '#8b5cf6',
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: toneColors[tone] || toneColors.default }}>
        {value}
      </div>
    </div>
  );
};

AuroraMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  tone: PropTypes.oneOf(['default', 'emerald', 'rose', 'teal', 'violet']),
};

export default AuroraCard;

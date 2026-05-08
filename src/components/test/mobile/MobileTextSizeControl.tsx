import React from 'react';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

export interface MobileTextSizeControlProps {
  currentSize: number;
  onSizeChange: (size: number) => void;
  onClose: () => void;
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: MOBILE_READING_LAYER_Z_INDEX.UTILITY_MODAL,
  background: 'rgba(15, 23, 42, 0.52)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: '1rem',
};

const panelStyle: React.CSSProperties = {
  width: 'min(100%, 420px)',
  borderRadius: '1.25rem',
  background: '#ffffff',
  padding: '1.25rem',
  boxShadow: '0 24px 48px rgba(15, 23, 42, 0.24)',
};

const closeButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  marginTop: '1rem',
  borderRadius: '0.875rem',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: '0.9375rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export const MobileTextSizeControl: React.FC<MobileTextSizeControlProps> = ({
  currentSize,
  onSizeChange,
  onClose,
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="mobile-text-size-title"
    data-testid="mobile-text-size-control"
    style={backdropStyle}
  >
    <div style={panelStyle}>
      <h2
        id="mobile-text-size-title"
        style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}
      >
        Text Size
      </h2>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
        Adjust the passage and question text only. Tabs, chips, and buttons stay unchanged.
      </p>

      <div style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '0.75rem',
          }}
        >
          <span style={{ fontSize: '0.875rem', color: '#475569' }}>Current size</span>
          <strong data-testid="mobile-text-size-value" style={{ fontSize: '1.125rem', color: '#0f172a' }}>
            {currentSize}px
          </strong>
        </div>

        <input
          type="range"
          min={14}
          max={22}
          step={1}
          value={currentSize}
          aria-label="Text size"
          data-testid="mobile-text-size-slider"
          onChange={(event) => onSizeChange(Number(event.currentTarget.value))}
          style={{ width: '100%' }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '0.375rem',
            fontSize: '0.75rem',
            color: '#64748b',
          }}
        >
          <span>14px</span>
          <span>22px</span>
        </div>
      </div>

      <button type="button" onClick={onClose} style={closeButtonStyle}>
        Done
      </button>
    </div>
  </div>
);

export default MobileTextSizeControl;

import React from 'react';
import type { PracticeContext } from '../../practice/IELTSPracticeView';
import type { ResolvedPracticeSettings } from '../../../types/practice.types';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';
import { getMobileInstructionsContent, type ExamMode } from './mobileInstructionsContent';

export interface MobileInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: ExamMode;
  practiceContext?: PracticeContext;
  resolvedSettings?: ResolvedPracticeSettings;
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: MOBILE_READING_LAYER_Z_INDEX.UTILITY_MODAL,
  background: 'rgba(15, 23, 42, 0.52)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const cardStyle: React.CSSProperties = {
  width: 'min(100%, 440px)',
  maxHeight: 'min(82dvh, 720px)',
  overflowY: 'auto',
  borderRadius: '1.25rem',
  background: '#ffffff',
  boxShadow: '0 24px 48px rgba(15, 23, 42, 0.24)',
};

const closeButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: '0.875rem',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: '0.9375rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export const MobileInstructionsModal: React.FC<MobileInstructionsModalProps> = ({
  isOpen,
  onClose,
  mode,
  practiceContext,
  resolvedSettings,
}) => {
  if (!isOpen) {
    return null;
  }

  const { rules, controlsHelp } = getMobileInstructionsContent(mode, practiceContext, resolvedSettings);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-instructions-title"
      data-testid="mobile-instructions-modal"
      style={backdropStyle}
    >
      <div style={cardStyle}>
        <div style={{ padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
          <h2
            id="mobile-instructions-title"
            style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}
          >
            Instructions & Help
          </h2>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
            Review the current rules and the mobile controls before continuing.
          </p>
        </div>

        <div style={{ padding: '1rem 1.25rem' }}>
          <section>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
              Rules
            </h3>
            <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.125rem', color: '#334155', lineHeight: 1.6 }}>
              {rules.map((rule) => (
                <li key={rule} style={{ marginBottom: '0.5rem' }}>
                  {rule}
                </li>
              ))}
            </ul>
          </section>

          <section style={{ marginTop: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
              Controls Help
            </h3>
            <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.125rem', color: '#334155', lineHeight: 1.6 }}>
              {controlsHelp.map((helpItem) => (
                <li key={helpItem} style={{ marginBottom: '0.5rem' }}>
                  {helpItem}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div style={{ padding: '0 1.25rem 1.25rem' }}>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileInstructionsModal;

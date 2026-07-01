/**
 * MobileListeningSubmitSheet — Bottom-sheet submission confirmation
 *
 * Renders as a bottom sheet (not centered modal or full-screen overlay)
 * with the exact content contract from PRD-0045 FR-30..36:
 *   - Total answered count
 *   - Total unanswered count
 *   - Per-part counts
 *   - Warning line (only when unanswered > 0)
 *   - Cancel/back action
 *   - Final confirm action
 *
 * No @mantine imports. No Firebase/storage/router/service imports.
 * @see PRD-0045 Task 2.5, FR-29..36
 */

import React, { useMemo } from 'react';
import { MOBILE_LISTENING_LAYER_Z_INDEX } from './mobileListeningLayering';

/** Per-part question info for the submit sheet */
export interface ListeningPartInfo {
  /** Part number (1-based) */
  partNumber: number;
  /** Question numbers belonging to this part */
  questionNumbers: number[];
}

export interface MobileListeningSubmitSheetProps {
  /** Part info array (should have 4 entries for standard IELTS Listening) */
  parts: ListeningPartInfo[];
  /** Current answers keyed by question number */
  answers: Record<number, unknown>;
  /** Callback to confirm and submit */
  onConfirmSubmit: () => void | Promise<void>;
  /** Callback to cancel / go back */
  onClose: () => void;
  /** Whether submission is in progress */
  isSubmitting: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const isAnsweredValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim().length > 0);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      (item) => String(item ?? '').trim().length > 0,
    );
  }
  return true;
};

// ── Styles ───────────────────────────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: MOBILE_LISTENING_LAYER_Z_INDEX.SUBMIT_SHEET_BACKDROP,
  background: 'rgba(15, 23, 42, 0.4)',
};

const sheetStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: MOBILE_LISTENING_LAYER_Z_INDEX.SUBMIT_SHEET,
  background: '#ffffff',
  borderRadius: '1rem 1rem 0 0',
  boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.12)',
  maxHeight: '80dvh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const handleBarStyle: React.CSSProperties = {
  width: 40,
  height: 4,
  borderRadius: 2,
  background: '#cbd5e1',
  margin: '12px auto 0',
};

const sheetHeaderStyle: React.CSSProperties = {
  padding: '0.75rem 1rem 0',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.125rem',
  fontWeight: 700,
  color: '#0f172a',
};

const totalRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  marginTop: '0.75rem',
};

const totalPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.375rem 0.75rem',
  borderRadius: 999,
  fontSize: '0.8125rem',
  fontWeight: 600,
};

const sheetBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '0.75rem 1rem',
};

const partRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.625rem 0',
  borderBottom: '1px solid #f1f5f9',
};

const partLabelStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#1e293b',
};

const partCountStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#64748b',
};

const warningStyle: React.CSSProperties = {
  margin: '0.75rem 0 0',
  padding: '0.75rem 1rem',
  background: '#fef3c7',
  borderRadius: '0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: '#92400e',
  lineHeight: 1.5,
};

const sheetFooterStyle: React.CSSProperties = {
  display: 'grid',
  gap: '0.625rem',
  padding: '0.75rem 1rem',
  paddingBottom: 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))',
  borderTop: '1px solid #e2e8f0',
};

const confirmBtnStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: '0.875rem',
  border: 'none',
  background: '#0f766e',
  color: '#ffffff',
  fontSize: '0.9375rem',
  fontWeight: 600,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

const cancelBtnStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  borderRadius: '0.875rem',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: '0.9375rem',
  fontWeight: 600,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

// ── Component ────────────────────────────────────────────────────────────────

export const MobileListeningSubmitSheet: React.FC<MobileListeningSubmitSheetProps> = ({
  parts,
  answers,
  onConfirmSubmit,
  onClose,
  isSubmitting,
}) => {
  const { totalAnswered, totalUnanswered, perPart } = useMemo(() => {
    let answered = 0;
    let unanswered = 0;
    const partStats = parts.map((part) => {
      const partAnswered = part.questionNumbers.filter((qn) => isAnsweredValue(answers[qn])).length;
      const partUnanswered = part.questionNumbers.length - partAnswered;
      answered += partAnswered;
      unanswered += partUnanswered;
      return {
        partNumber: part.partNumber,
        answered: partAnswered,
        unanswered: partUnanswered,
        total: part.questionNumbers.length,
      };
    });
    return { totalAnswered: answered, totalUnanswered: unanswered, perPart: partStats };
  }, [parts, answers]);

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="mobile-listening-submit-backdrop"
        style={backdropStyle}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        data-testid="mobile-listening-submit-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listening-submit-title"
        aria-describedby={totalUnanswered > 0 ? 'listening-submit-warning' : undefined}
        style={sheetStyle}
      >
        {/* Drag handle */}
        <div style={handleBarStyle} aria-hidden="true" />

        {/* Header with totals */}
        <div style={sheetHeaderStyle}>
          <h2 id="listening-submit-title" style={titleStyle}>
            Submit Test
          </h2>
          <div style={totalRowStyle}>
            <span
              data-testid="submit-total-answered"
              style={{ ...totalPillStyle, background: '#ecfdf5', color: '#065f46' }}
            >
              {totalAnswered} answered
            </span>
            <span
              data-testid="submit-total-unanswered"
              style={{ ...totalPillStyle, background: '#f1f5f9', color: '#475569' }}
            >
              {totalUnanswered} unanswered
            </span>
          </div>
        </div>

        {/* Per-part breakdown */}
        <div style={sheetBodyStyle} data-testid="submit-part-breakdown">
          {perPart.map((stat) => (
            <div key={stat.partNumber} style={partRowStyle} data-testid={`submit-part-${stat.partNumber}`}>
              <span style={partLabelStyle}>Part {stat.partNumber}</span>
              <span style={partCountStyle}>
                {stat.answered}/{stat.total} answered
              </span>
            </div>
          ))}
        </div>

        {/* Warning — only when unanswered > 0 (PRD FR-32 exact copy) */}
        {totalUnanswered > 0 && (
          <div
            id="listening-submit-warning"
            data-testid="submit-warning"
            role="alert"
            style={warningStyle}
          >
            You still have {totalUnanswered} unanswered question{totalUnanswered === 1 ? '' : 's'}.
            Are you sure you want to submit?
          </div>
        )}

        {/* Actions */}
        <div style={sheetFooterStyle}>
          <button
            data-testid="submit-confirm-btn"
            type="button"
            style={{
              ...confirmBtnStyle,
              background: isSubmitting ? '#cbd5e1' : '#0f766e',
              cursor: isSubmitting ? 'default' : 'pointer',
            }}
            onClick={() => { void onConfirmSubmit(); }}
            aria-busy={isSubmitting ? 'true' : 'false'}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm Submit'}
          </button>
          <button
            data-testid="submit-cancel-btn"
            type="button"
            style={cancelBtnStyle}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Back to Test
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileListeningSubmitSheet;

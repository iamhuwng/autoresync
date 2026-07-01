/**
 * MobileListeningAnswerSheet — Answer-entry sheet for Listening image mode
 *
 * Opens below the part-tab row (row 3) leaving header, audio row,
 * and part tabs visible and interactive above.
 *
 * Positioned absolutely within the scaffold's main content area (row 4).
 *
 * Key behaviors (PRD-0045 Task 4.4-4.7):
 *   - Scoped to the currently viewed part only
 *   - Tab switch updates sheet content in place
 *   - Per-part scroll preserved when reopened for same part
 *   - Audio auto-advance does not steal viewed part
 *   - Sheet must NOT auto-open on restore
 *
 * No @mantine imports. No Firebase.
 * @see PRD-0045 Task 4.4, 4.5, 4.6, 4.7, 4.10
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { MOBILE_LISTENING_LAYER_Z_INDEX } from './mobileListeningLayering';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnswerSheetQuestion {
  number: number;
  type: string;
}

export interface MobileListeningAnswerSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Currently viewed part number */
  viewedPartNumber: number;
  /** Start question for the viewed part */
  startQuestion: number;
  /** End question for the viewed part */
  endQuestion: number;
  /** Questions scoped to the viewed part */
  questions: AnswerSheetQuestion[];
  /** Current answers */
  answers: Record<number, unknown>;
  /** Answer change handler */
  onAnswerChange: (questionNumber: number, answer: string) => void;
  /** Current question number (for active highlight) */
  currentQuestionNumber: number;
  /** Whether the test has been submitted */
  testSubmitted?: boolean;
  /** Per-question results */
  questionResults?: Record<number, boolean>;
  /** Whether interaction is locked (submitted/paused) */
  isLocked?: boolean;
  /** Per-part scroll position, keyed by part number string */
  scrollByPart: Record<string, number>;
  /** Callback to save scroll position */
  onScrollChange: (partNumber: number, scrollTop: number) => void;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: MOBILE_LISTENING_LAYER_Z_INDEX.SHEET_BACKDROP,
  background: 'rgba(0, 0, 0, 0.35)',
};

const sheetStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  top: 0,
  zIndex: MOBILE_LISTENING_LAYER_Z_INDEX.SHEET,
  background: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 -2px 12px rgba(0, 0, 0, 0.08)',
};

const sheetHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.625rem 1rem',
  borderBottom: '1px solid #e2e8f0',
  flexShrink: 0,
  background: '#f8fafc',
};

const sheetHeaderTitleStyle: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const sheetBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '0.75rem',
  paddingBottom: 'calc(16rem + env(safe-area-inset-bottom, 0px))',
  scrollPaddingBottom: 'calc(17rem + env(safe-area-inset-bottom, 0px))',
};

const closeButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  border: 'none',
  background: '#f1f5f9',
  borderRadius: '50%',
  color: '#64748b',
  cursor: 'pointer',
  padding: 0,
  WebkitTapHighlightColor: 'transparent',
};

const answerRowStyle = (isActive: boolean, isAnswered: boolean, isCorrect?: boolean, testSubmitted?: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.625rem 0.75rem',
  background: isActive ? '#f0f9ff' : testSubmitted
    ? (isCorrect ? '#f0fdf4' : '#fef2f2')
    : '#fafafa',
  borderRadius: '0.5rem',
  border: `1.5px solid ${isActive ? '#3b82f6' : testSubmitted
    ? (isCorrect ? '#10b981' : '#ef4444')
    : isAnswered ? '#10b981' : '#e2e8f0'}`,
  transition: 'border-color 0.15s ease',
});

const questionBadgeStyle = (isActive: boolean, isAnswered: boolean, isCorrect?: boolean, testSubmitted?: boolean): React.CSSProperties => ({
  minWidth: 30,
  height: 30,
  background: testSubmitted
    ? (isCorrect ? '#10b981' : '#ef4444')
    : isActive ? '#3b82f6' : isAnswered ? '#10b981' : '#94a3b8',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.75rem',
  flexShrink: 0,
  fontFamily: 'system-ui, -apple-system, sans-serif',
});

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  fontSize: '0.875rem',
  border: '1.5px solid #e2e8f0',
  borderRadius: '0.375rem',
  outline: 'none',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  background: '#ffffff',
  transition: 'border-color 0.15s ease',
};

const footerStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
  background: '#f8fafc',
  borderTop: '1px solid #e2e8f0',
  fontSize: '0.75rem',
  color: '#64748b',
  textAlign: 'center',
  flexShrink: 0,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};


// ── Component ──────────────────────────────────────────────────────────────

export const MobileListeningAnswerSheet: React.FC<MobileListeningAnswerSheetProps> = ({
  isOpen,
  onClose,
  viewedPartNumber,
  startQuestion,
  endQuestion,
  questions,
  answers,
  onAnswerChange,
  currentQuestionNumber,
  testSubmitted,
  questionResults,
  isLocked,
  scrollByPart,
  onScrollChange,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const partKey = String(viewedPartNumber);
  const touchStartY = useRef<number | null>(null);

  // ── Restore scroll position for reopened part ──────────────────────────
  useEffect(() => {
    if (isOpen && bodyRef.current) {
      const savedScroll = scrollByPart[partKey] || 0;
      bodyRef.current.scrollTop = savedScroll;
    }
  }, [isOpen, partKey]); // intentionally omit scrollByPart to avoid re-triggering

  // ── Save scroll position on scroll ─────────────────────────────────────
  const handleScroll = useCallback(() => {
    if (bodyRef.current) {
      onScrollChange(viewedPartNumber, bodyRef.current.scrollTop);
    }
  }, [viewedPartNumber, onScrollChange]);

  // ── Swipe-down-to-close on header ──────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      touchStartY.current = null;
      if (deltaY > 60) {
        onClose();
      }
    },
    [onClose],
  );

  // ── Count answered for this part ───────────────────────────────────────
  const answeredInPart = questions.filter(
    q => answers[q.number] !== undefined && answers[q.number] !== '',
  ).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — tapping closes the sheet */}
      <div
        data-testid="mobile-listening-answer-sheet-backdrop"
        style={backdropStyle}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel — fills row 4 */}
      <div
        data-testid="mobile-listening-answer-sheet"
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label={`Answer Sheet — Part ${viewedPartNumber}`}
      >
        {/* Header with structural cue (Task 4.10) */}
        <div
          style={sheetHeaderStyle}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div style={sheetHeaderTitleStyle}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
              ✍️ Part {viewedPartNumber}
            </div>
            <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>
              Questions {startQuestion}–{endQuestion}
            </div>
          </div>
          <button
            data-testid="mobile-listening-answer-sheet-close"
            style={closeButtonStyle}
            onClick={onClose}
            aria-label="Close answer sheet"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>

        {/* Scrollable answer list */}
        <div
          ref={bodyRef}
          style={sheetBodyStyle}
          onScroll={handleScroll}
          data-testid="mobile-listening-answer-sheet-body"
          data-keyboard-safe-bottom="calc(16rem + env(safe-area-inset-bottom, 0px))"
          data-scroll-safe-bottom="calc(17rem + env(safe-area-inset-bottom, 0px))"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {questions.map(question => {
              const isActive = currentQuestionNumber === question.number;
              const currentAnswer = answers[question.number];
              const isAnswered = currentAnswer !== undefined && currentAnswer !== '';
              const isCorrect = testSubmitted ? questionResults?.[question.number] : undefined;

              return (
                <div
                  key={question.number}
                  style={answerRowStyle(isActive, isAnswered, isCorrect, testSubmitted)}
                >
                  <div style={questionBadgeStyle(isActive, isAnswered, isCorrect, testSubmitted)}>
                    {question.number}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={String(currentAnswer || '')}
                      onChange={e => onAnswerChange(question.number, e.target.value)}
                      disabled={testSubmitted || isLocked}
                      placeholder="Your answer…"
                      style={{
                        ...inputStyle,
                        background: testSubmitted ? '#f9fafb' : '#ffffff',
                      }}
                      data-testid={`answer-input-${question.number}`}
                      onFocus={e => {
                        if (!testSubmitted && !isLocked) {
                          e.currentTarget.style.borderColor = '#3b82f6';
                        }
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                    />
                  </div>
                  {testSubmitted && (
                    <span style={{ fontSize: '0.875rem', flexShrink: 0 }}>
                      {isCorrect ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer summary */}
        <div
          style={footerStyle}
          data-testid="mobile-listening-answer-sheet-footer"
          data-keyboard-safe-bottom="calc(0.5rem + env(safe-area-inset-bottom, 0px))"
        >
          {answeredInPart} of {questions.length} answered
        </div>
      </div>
    </>
  );
};

export default MobileListeningAnswerSheet;

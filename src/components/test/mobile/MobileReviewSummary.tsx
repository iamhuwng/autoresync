import React, { useMemo, useState } from 'react';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

type ReviewQuestion = {
  number: number;
  passageId?: string;
  [key: string]: unknown;
};

type ReviewPassage = {
  id: string;
  title?: string;
};

export interface MobileReviewSummaryProps {
  passages: ReviewPassage[];
  questions: ReviewQuestion[];
  answers: Record<number, unknown>;
  onQuestionChipTap: (passageId: string, questionNumber: number) => void;
  onConfirmSubmit: () => void | Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: MOBILE_READING_LAYER_Z_INDEX.REVIEW_SUMMARY,
  display: 'flex',
  flexDirection: 'column',
  background: '#f8fafc',
};

const headerStyle: React.CSSProperties = {
  padding: 'max(16px, env(safe-area-inset-top, 0px)) 16px 16px',
  background: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
};

const headerTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.125rem',
  fontWeight: 700,
  color: '#0f172a',
};

const headerBodyStyle: React.CSSProperties = {
  margin: '0.5rem 0 0',
  fontSize: '0.875rem',
  color: '#475569',
  lineHeight: 1.5,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '1rem',
  WebkitOverflowScrolling: 'touch',
};

const passageSectionStyle: React.CSSProperties = {
  marginBottom: '1rem',
  padding: '1rem',
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '1rem',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
};

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginTop: '0.75rem',
  marginBottom: '1rem',
};

const statPillBaseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.375rem 0.625rem',
  borderRadius: '999px',
  fontSize: '0.75rem',
  fontWeight: 600,
};

const chipGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(52px, 1fr))',
  gap: '0.625rem',
};

const footerStyle: React.CSSProperties = {
  padding: '1rem 1rem max(16px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
  background: '#ffffff',
  borderTop: '1px solid #e2e8f0',
  display: 'grid',
  gap: '0.75rem',
};

const secondaryButtonStyle: React.CSSProperties = {
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

const primaryButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  border: 'none',
  background: '#0f766e',
  color: '#ffffff',
};

const confirmBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: MOBILE_READING_LAYER_Z_INDEX.FINAL_CONFIRM_MODAL,
  background: 'rgba(15, 23, 42, 0.56)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const confirmCardStyle: React.CSSProperties = {
  width: 'min(100%, 420px)',
  background: '#ffffff',
  borderRadius: '1rem',
  padding: '1.25rem',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.24)',
};

const confirmActionsStyle: React.CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  marginTop: '1rem',
};

const isAnsweredValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => String(item ?? '').trim().length > 0);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .some((item) => String(item ?? '').trim().length > 0);
  }

  return true;
};

const getChipStyle = (answered: boolean): React.CSSProperties => ({
  position: 'relative',
  minHeight: 52,
  borderRadius: '0.875rem',
  border: `1px solid ${answered ? '#99f6e4' : '#cbd5e1'}`,
  background: answered ? '#ecfdf5' : '#f1f5f9',
  color: answered ? '#065f46' : '#475569',
  fontWeight: 700,
  fontSize: '0.9375rem',
  cursor: 'pointer',
});

export const MobileReviewSummary: React.FC<MobileReviewSummaryProps> = ({
  passages,
  questions,
  answers,
  onQuestionChipTap,
  onConfirmSubmit,
  onClose,
  isSubmitting,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalUnansweredCount = useMemo(
    () => questions.filter((question) => !isAnsweredValue(answers[question.number])).length,
    [answers, questions],
  );

  return (
    <div style={overlayStyle} data-testid="mobile-review-summary">
      <div style={headerStyle}>
        <h2 style={headerTitleStyle}>Review Answers</h2>
        <p style={headerBodyStyle}>
          Check each passage before submitting. Unanswered questions stay highlighted so you can jump back quickly.
        </p>
      </div>

      <div style={bodyStyle}>
        {passages.map((passage, index) => {
          const passageQuestions = questions.filter((question) => question.passageId === passage.id);
          const answeredCount = passageQuestions.filter((question) => isAnsweredValue(answers[question.number])).length;
          const unansweredCount = passageQuestions.length - answeredCount;

          return (
            <section
              key={passage.id}
              style={passageSectionStyle}
              aria-label={passage.title || `Passage ${index + 1}`}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                {passage.title || `Passage ${index + 1}`}
              </h3>

              <div style={statsRowStyle}>
                <span style={{ ...statPillBaseStyle, background: '#ecfdf5', color: '#065f46' }}>
                  {answeredCount}/{passageQuestions.length} answered
                </span>
                <span style={{ ...statPillBaseStyle, background: '#f1f5f9', color: '#475569' }}>
                  {unansweredCount} unanswered
                </span>
              </div>

              <div style={chipGridStyle}>
                {passageQuestions.map((question) => {
                  const answered = isAnsweredValue(answers[question.number]);

                  return (
                    <button
                      key={question.number}
                      type="button"
                      style={getChipStyle(answered)}
                      onClick={() => onQuestionChipTap(passage.id, question.number)}
                      data-testid={`review-chip-${question.number}`}
                      data-state={answered ? 'answered' : 'unanswered'}
                      aria-label={`Question ${question.number}`}
                    >
                      Q{question.number}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div style={footerStyle}>
        <button
          type="button"
          style={primaryButtonStyle}
          onClick={() => setConfirmOpen(true)}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Test'}
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={onClose}
          disabled={isSubmitting}
        >
          Back to Test
        </button>
      </div>

      {confirmOpen ? (
        <div style={confirmBackdropStyle}>
          <div
            style={confirmCardStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-review-confirm-title"
            aria-describedby="mobile-review-confirm-body"
          >
            <h3
              id="mobile-review-confirm-title"
              style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}
            >
              Confirm Submit
            </h3>
            <p
              id="mobile-review-confirm-body"
              style={{ margin: '0.75rem 0 0', fontSize: '0.9375rem', lineHeight: 1.5, color: '#475569' }}
            >
              {`You have ${totalUnansweredCount} unanswered question${totalUnansweredCount === 1 ? '' : 's'}. Are you sure you want to submit?`}
            </p>

            <div style={confirmActionsStyle}>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => {
                  void onConfirmSubmit();
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm'}
              </button>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => setConfirmOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MobileReviewSummary;

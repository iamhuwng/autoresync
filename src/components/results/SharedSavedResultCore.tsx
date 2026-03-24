/**
 * SharedSavedResultCore — PRD-0040 Task 2.2
 *
 * Presentation-only component that renders the content body of a saved test result.
 * All 3 shells delegate their content rendering to this single component.
 *
 * CONTRACT:
 *   - Never loads data, never checks ownership, never decides access.
 *   - Receives a loaded TestResultRecord and rendering callbacks via props.
 *   - Shells own chrome, data loading, ownership, open/close.
 *   - See documentation/architecture/prd0040-preflight-ledger.md §SharedSavedResultCore Contract
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { TestResultRecord } from '../../services/testResults.service';
import type { FormativeFeedback } from '../../types/thcs-test.types';
import { OverviewTab } from './OverviewTab';
import { ReviewTab } from './ReviewTab';
import { FeedbackTab } from './FeedbackTab';
import { WritingSpeakingPlaceholder } from '../test/WritingSpeakingPlaceholder';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface SharedSavedResultCoreSections {
  scoreSummary?: boolean;
  sectionBreakdown?: boolean;
  answerMap?: boolean;
  questionReview?: boolean;
  feedbackDisplay?: boolean;
  teacherFeedback?: boolean;
  writingPlaceholder?: boolean;
}

export interface SharedSavedResultCoreFeedbackState {
  formativeFeedback?: FormativeFeedback | null;
  feedbackLoading?: boolean;
  feedbackError?: string | null;
  needsUpgrade?: boolean;
  isEligibleForAIFeedback?: boolean;
  onRetryFeedback?: () => void;
}

export interface SharedSavedResultCoreProps {
  /** The loaded test result record. Never null when core renders. */
  result: TestResultRecord;

  /** Shell layout variant — affects spacing, sizing, and visual density */
  variant: 'slide-panel' | 'modal' | 'full-page';

  /** Which sections to render. Shells control visibility. Defaults all to true except teacherFeedback/writingPlaceholder. */
  sections?: SharedSavedResultCoreSections;

  /** Formative feedback state — passed from shell's feedback management */
  feedbackState?: SharedSavedResultCoreFeedbackState;

  /** Navigation callbacks — shells wire these to their own tab/scroll behavior */
  onNavigateToQuestion?: (questionNumber: number) => void;

  /** feedbackTiming from homework context — controls question breakdown visibility */
  feedbackTiming?: 'after_completion' | 'after_deadline' | 'never';
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const DEFAULT_SECTIONS: Required<SharedSavedResultCoreSections> = {
  scoreSummary: true,
  sectionBreakdown: true,
  answerMap: true,
  questionReview: true,
  feedbackDisplay: true,
  teacherFeedback: false,
  writingPlaceholder: false,
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Presentation-only: format a timestamp for teacher feedback display */
function formatFeedbackDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ─── Sub-components (vanilla, no Mantine) ───────────────────────────────── */

/**
 * TeacherFeedbackCard — vanilla replacement for Mantine-based FeedbackDisplay.
 * Used only for the full-page shell (LegacyResultDetailView) teacher feedback.
 */
const TeacherFeedbackCard: React.FC<{
  feedback: string;
  teacherName?: string;
  updatedAt: number;
  isOverall?: boolean;
  questionNumber?: number;
}> = ({ feedback, teacherName, updatedAt, isOverall, questionNumber }) => (
  <div
    style={{
      padding: '1rem 1.25rem',
      borderRadius: '0.75rem',
      border: isOverall ? '1px solid rgba(99,102,241,0.18)' : '1px solid #e2e8f0',
      background: isOverall
        ? 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(59,130,246,0.06))'
        : '#f8fafc',
    }}
    data-testid={isOverall ? 'teacher-feedback-overall' : `teacher-feedback-q${questionNumber}`}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
        💬 {teacherName || 'Teacher'}
      </span>
      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
        {formatFeedbackDate(updatedAt)}
      </span>
    </div>
    <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#334155' }}>
      {feedback}
    </div>
  </div>
);

/* ─── Main Component ─────────────────────────────────────────────────────── */

export const SharedSavedResultCore: React.FC<SharedSavedResultCoreProps> = ({
  result,
  variant,
  sections: sectionsProp,
  feedbackState,
  onNavigateToQuestion,
  feedbackTiming = 'after_completion',
}) => {
  const sections = useMemo(
    () => ({ ...DEFAULT_SECTIONS, ...sectionsProp }),
    [sectionsProp],
  );

  // Internal navigation state for cross-section question highlighting
  const [highlightedQuestion, setHighlightedQuestion] = useState<number | null>(null);

  const handleNavigateToQuestion = useCallback(
    (questionNumber: number | null) => {
      if (questionNumber != null && onNavigateToQuestion) {
        onNavigateToQuestion(questionNumber);
      }
      setHighlightedQuestion(questionNumber);
    },
    [onNavigateToQuestion],
  );

  const handleHighlightComplete = useCallback(() => {
    setHighlightedQuestion(null);
  }, []);

  // Derive feedback props
  const feedbackLoading = feedbackState?.feedbackLoading ?? false;
  const feedbackError = feedbackState?.feedbackError ?? null;
  const isEligibleForAIFeedback = feedbackState?.isEligibleForAIFeedback ?? false;
  const onRetryFeedback = feedbackState?.onRetryFeedback;

  // Determine whether detailed feedback sections should be shown
  const showDetailedFeedback = feedbackTiming !== 'never';
  const showQuestionReview = sections.questionReview && showDetailedFeedback;

  // Variant-specific spacing
  const gapSize = variant === 'full-page' ? '2rem' : variant === 'modal' ? '1.5rem' : '0';

  return (
    <div
      className="ssrc-root"
      data-testid="shared-saved-result-core"
      data-variant={variant}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: gapSize,
      }}
    >
      {/* ── Score Summary + Answer Map + Section Breakdown (Overview) ── */}
      {(sections.scoreSummary || sections.answerMap || sections.sectionBreakdown) && (
        <OverviewTab
          result={result}
          onTabSwitch={() => {}}
          onHighlightQuestion={handleNavigateToQuestion}
          formativeFeedbackLoading={feedbackLoading}
          feedbackError={feedbackError}
          onRetryFeedback={onRetryFeedback}
        />
      )}

      {/* ── Teacher Overall Feedback (full-page shell only) ── */}
      {sections.teacherFeedback && result.overallFeedback && (
        <div data-testid="ssrc-teacher-overall-feedback">
          <TeacherFeedbackCard
            feedback={result.overallFeedback}
            teacherName={(result as any).feedbackUpdatedBy || 'Your Teacher'}
            updatedAt={(result as any).feedbackUpdatedAt || Date.now()}
            isOverall
          />
        </div>
      )}

      {/* ── Question Review ── */}
      {showQuestionReview && (
        <ReviewTab
          result={result}
          highlightedQuestionNumber={highlightedQuestion}
          onHighlightComplete={handleHighlightComplete}
        />
      )}

      {/* ── Per-Question Teacher Feedback (full-page shell only) ── */}
      {sections.teacherFeedback && showDetailedFeedback && result.questionResults && (
        <div data-testid="ssrc-teacher-question-feedback">
          {result.questionResults
            .filter((qr: any) => qr.teacherFeedback)
            .map((qr: any) => (
              <TeacherFeedbackCard
                key={qr.questionNumber}
                feedback={qr.teacherFeedback}
                teacherName={(result as any).feedbackUpdatedBy || 'Your Teacher'}
                updatedAt={(result as any).feedbackUpdatedAt || Date.now()}
                questionNumber={qr.questionNumber}
              />
            ))}
        </div>
      )}

      {/* ── Feedback Display (AI analysis, recommendations, trend, class position) ── */}
      {sections.feedbackDisplay && showDetailedFeedback && (
        <FeedbackTab
          result={result}
          feedbackLoading={feedbackLoading}
          feedbackError={feedbackError}
          onRetryFeedback={onRetryFeedback}
          isEligibleForAIFeedback={isEligibleForAIFeedback}
        />
      )}

      {/* ── Writing/Speaking Placeholder (full-page shell only) ── */}
      {sections.writingPlaceholder && ((result as any).writingSubmission || (result as any).speakingSubmission) && (
        <WritingSpeakingPlaceholder
          type={result.testSkill === 'speaking' ? 'speaking' : 'writing'}
          submission={(result as any).writingSubmission || (result as any).speakingSubmission}
          status={(result as any).markingStatus as 'auto-marked' | 'pending-review' | 'manually-marked' | undefined}
        />
      )}

      {/* ── Empty State: No question results at all ── */}
      {!result.questionResults?.length && !sections.writingPlaceholder && (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem',
            color: '#64748b',
            fontSize: '0.9rem',
          }}
          data-testid="ssrc-empty-questions"
        >
          No question results available for this test.
        </div>
      )}
    </div>
  );
};

export default SharedSavedResultCore;

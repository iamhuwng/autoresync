/**
 * MobileReadingExamScaffold — Phone-Optimized Reading Exam Layout
 *
 * Pure presentation scaffold consumed by both live and solo/homework hosts.
 * All state is owned by the host components (ReadingTestPage / IELTSPracticeView)
 * and passed as props. This component must NOT import submission hooks,
 * storage helpers, or services. It must NOT own host-state contract fields
 * via internal useState.
 *
 * @see PRD-0043 Sections 7.2a, 7.3
 */

import React from 'react';

// ── Scaffold Props (PRD Section 7.2a + 7.3 host-owned state contract) ─────────

export interface MobileReadingExamScaffoldProps {
  // ── Mode & Identity ─────────────────────────────────────────────────────────
  /** Live session, solo practice, or homework */
  mode: 'live' | 'solo' | 'homework';

  // ── Test Data (host-provided) ───────────────────────────────────────────────
  /** Array of passages with id and optional label */
  passages: Array<{ id: string; title?: string }>;
  /** All questions for the test (display-ready, possibly shuffled) */
  questions: Array<{
    number: number;
    passageId?: string;
    type: string;
    [key: string]: unknown;
  }>;
  /** Total question count */
  totalQuestions: number;

  // ── Passage State (host-owned) ──────────────────────────────────────────────
  /** Currently active passage ID */
  activePassageId: string;
  /** Callback when user switches passages */
  onPassageChange: (passageId: string) => void;
  /** The current passage data to render */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentPassage: any;
  /** Render function for the passage content (host provides the PassageRenderer) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PassageRendererComponent: React.ComponentType<any>;

  // ── Answer State (host-owned) ───────────────────────────────────────────────
  /** Current answers keyed by question number */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers: Record<number, any>;
  /** Callback to update an answer */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAnswerChange: (questionNumber: number, answer: any) => void;
  /** Current active question number */
  activeQuestionNumber: number;
  /** Navigate to a specific question */
  onQuestionClick: (questionNumber: number) => void;

  // ── Timer State (host-owned) ────────────────────────────────────────────────
  /** Remaining time in seconds */
  timeRemaining: number;
  /** Timer formatter function */
  formatTime: (seconds: number) => string;

  // ── Submission State (host-owned) ───────────────────────────────────────────
  /** Whether the test has been submitted */
  testSubmitted: boolean;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Question results after submission */
  questionResults?: Record<number, boolean>;
  /** Manual submit handler */
  onManualSubmit: () => void;
  /** Auto-submit handler (triggered by scaffold on time expiry) */
  onAutoSubmit: () => void;

  // ── Session State (host-owned, live mode) ───────────────────────────────────
  /** Session connection status */
  isConnected: boolean;
  /** Session status */
  sessionStatus: string;
  /** Whether the test is paused (teacher-driven for live, always false for solo) */
  isPaused: boolean;

  // ── Reading Display Props (host-owned) ──────────────────────────────────────
  /** Font size for passage and question text (14-22px) */
  fontSize: number;
  /** Line spacing for passage text */
  lineSpacing: number;
  /** Whether highlighter is active (always false on mobile per FR-99/100) */
  highlighterActive: boolean;
  /** Highlight color */
  highlightColor: string;
  /** Clear highlights trigger counter */
  clearHighlightsTrigger: number;

  // ── Mobile Shell State (host-owned per PRD Section 7.3) ─────────────────────
  /** Whether the questions bottom sheet is open */
  questionSheetOpen: boolean;
  /** Open the question sheet */
  onOpenQuestionSheet: () => void;
  /** Close the question sheet */
  onCloseQuestionSheet: () => void;
  /** Whether the review summary is open */
  reviewSummaryOpen: boolean;
  /** Open the review summary */
  onOpenReviewSummary: () => void;
  /** Close the review summary */
  onCloseReviewSummary: () => void;

  // ── Anti-Cheat (host-owned) ─────────────────────────────────────────────────
  /** CSS class for anti-copy-paste protection */
  antiSelectClass?: string;

  // ── Flagging State (host-owned, added in Phase 4) ───────────────────────────
  /** Set of flagged question numbers */
  flaggedQuestions?: Set<number>;
  /** Toggle flag for a question */
  onToggleFlag?: (questionNumber: number) => void;

  // ── Scroll Persistence (host-owned, added in Phase 3/6) ─────────────────────
  /** Passage scroll positions keyed by passage ID */
  passageScrollByPassage?: Record<string, number>;
  /** Update scroll position for a passage */
  onPassageScroll?: (passageId: string, scrollTop: number) => void;
}

/**
 * MobileReadingExamScaffold — Stub Implementation
 *
 * This is a placeholder that will be replaced with the full mobile UI
 * in Phase 3. It currently renders a minimal indicator to verify the
 * conditional rendering branch works correctly.
 */
export const MobileReadingExamScaffold: React.FC<MobileReadingExamScaffoldProps> = ({
  mode,
  totalQuestions,
  answers,
  activePassageId,
  passages,
  antiSelectClass,
}) => {
  const answeredCount = Object.keys(answers).length;
  const passageIndex = passages.findIndex(p => p.id === activePassageId) + 1;

  return (
    <div
      className={antiSelectClass}
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f4f8',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{
        fontSize: '3rem',
        marginBottom: '1rem',
      }}>
        📱
      </div>
      <div style={{
        fontSize: '1.25rem',
        fontWeight: 700,
        color: '#1e293b',
        marginBottom: '0.5rem',
      }}>
        Mobile Reading Exam Mode
      </div>
      <div style={{
        fontSize: '0.875rem',
        color: '#64748b',
        marginBottom: '1rem',
      }}>
        Scaffold not yet implemented — Phase 3
      </div>
      <div style={{
        fontSize: '0.8125rem',
        color: '#94a3b8',
        display: 'flex',
        gap: '1rem',
      }}>
        <span>Mode: {mode}</span>
        <span>Passage {passageIndex}/{passages.length}</span>
        <span>{answeredCount}/{totalQuestions} answered</span>
      </div>
    </div>
  );
};

export default MobileReadingExamScaffold;

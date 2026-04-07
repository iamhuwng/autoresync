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

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { MobileReadingHeader } from './MobileReadingHeader';
import { MobilePassageTabs } from './MobilePassageTabs';
import { MobileQuestionsFab } from './MobileQuestionsFab';
import { MobileQuestionSheet } from './MobileQuestionSheet';

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

// ── Styles ────────────────────────────────────────────────────────────────────

const scaffoldRootStyle: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: '#f8fafc',
  position: 'relative',
  overflow: 'hidden',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const passageAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '0.75rem',
};

const sheetInfoBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  fontSize: '0.75rem',
  color: '#64748b',
  borderBottom: '1px solid #f1f5f9',
  background: '#fafbfc',
};

const sheetPlaceholderStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  color: '#94a3b8',
  fontSize: '0.875rem',
  textAlign: 'center',
};

const noPassageStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#94a3b8',
  fontSize: '0.875rem',
};

// ── Scroll debounce interval (ms) ─────────────────────────────────────────────
const SCROLL_DEBOUNCE_MS = 150;

/**
 * MobileReadingExamScaffold — Full Mobile Layout
 *
 * Layout: Header → Passage Tabs → Passage Content → FAB (floating)
 * Overlay: MobileQuestionSheet (when questionSheetOpen)
 */
export const MobileReadingExamScaffold: React.FC<MobileReadingExamScaffoldProps> = (props) => {
  const {
    mode,
    passages,
    questions,
    totalQuestions,
    activePassageId,
    onPassageChange,
    currentPassage,
    PassageRendererComponent,
    answers,
    timeRemaining,
    formatTime,
    testSubmitted,
    isPaused,
    fontSize,
    lineSpacing,
    highlighterActive,
    highlightColor,
    clearHighlightsTrigger,
    questionSheetOpen,
    onOpenQuestionSheet,
    onCloseQuestionSheet,
    antiSelectClass,
    flaggedQuestions,
    passageScrollByPassage,
    onPassageScroll,
  } = props;

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const passageContentRef = useRef<HTMLDivElement>(null);
  const prevPassageIdRef = useRef<string>(activePassageId);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Per-passage derived data ──────────────────────────────────────────────────

  const activePassageIndex = passages.findIndex(p => p.id === activePassageId);
  const activePassageEntry = activePassageIndex >= 0 ? passages[activePassageIndex] : undefined;
  const activePassageLabel = activePassageEntry
    ? (activePassageEntry.title || `Passage ${activePassageIndex + 1}`)
    : 'Passage';

  const activePassageQuestions = useMemo(
    () => questions.filter(q => q.passageId === activePassageId),
    [questions, activePassageId],
  );

  const passageAnsweredCount = useMemo(
    () => activePassageQuestions.filter(q => answers[q.number] !== undefined && answers[q.number] !== '').length,
    [activePassageQuestions, answers],
  );

  const passageUnansweredCount = activePassageQuestions.length - passageAnsweredCount;

  const passageFlaggedCount = useMemo(
    () => flaggedQuestions
      ? activePassageQuestions.filter(q => flaggedQuestions.has(q.number)).length
      : 0,
    [activePassageQuestions, flaggedQuestions],
  );

  const questionRange = useMemo(() => {
    if (activePassageQuestions.length === 0) return '';
    const nums = activePassageQuestions.map(q => q.number);
    return `Q${Math.min(...nums)}\u2013Q${Math.max(...nums)}`;
  }, [activePassageQuestions]);

  const totalAnsweredCount = useMemo(
    () => questions.filter(q => answers[q.number] !== undefined && answers[q.number] !== '').length,
    [questions, answers],
  );

  // ── Scroll persistence ────────────────────────────────────────────────────────

  const handlePassageContentScroll = useCallback(() => {
    if (!onPassageScroll || !passageContentRef.current) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    const passageId = activePassageId;
    scrollTimerRef.current = setTimeout(() => {
      if (passageContentRef.current) {
        onPassageScroll(passageId, passageContentRef.current.scrollTop);
      }
    }, SCROLL_DEBOUNCE_MS);
  }, [activePassageId, onPassageScroll]);

  // Save scroll before passage switch, restore after
  useEffect(() => {
    const prevId = prevPassageIdRef.current;
    if (prevId !== activePassageId) {
      // Save previous passage scroll position
      if (onPassageScroll && passageContentRef.current) {
        onPassageScroll(prevId, passageContentRef.current.scrollTop);
      }
      prevPassageIdRef.current = activePassageId;

      // Restore new passage scroll position
      requestAnimationFrame(() => {
        if (passageContentRef.current) {
          const savedScroll = passageScrollByPassage?.[activePassageId] ?? 0;
          passageContentRef.current.scrollTop = savedScroll;
        }
      });
    }
  }, [activePassageId, passageScrollByPassage, onPassageScroll]);

  // Cleanup scroll timer
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // ── Overflow menu toggle (placeholder — Phase 8) ──────────────────────────────
  const handleOverflowMenuToggle = useCallback(() => {
    // Overflow menu will be implemented in Phase 8 (Task 8.0)
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className={antiSelectClass}
      style={scaffoldRootStyle}
      data-testid="mobile-reading-scaffold"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <MobileReadingHeader
        mode={mode}
        timeRemaining={timeRemaining}
        formatTime={formatTime}
        activePassageLabel={activePassageLabel}
        onOverflowMenuToggle={handleOverflowMenuToggle}
        isPaused={isPaused}
        testSubmitted={testSubmitted}
      />

      {/* ── Page-Level Passage Tabs ────────────────────────────────────────── */}
      <MobilePassageTabs
        passages={passages}
        activePassageId={activePassageId}
        onPassageChange={onPassageChange}
      />

      {/* ── Passage Content Area (scrollable) ──────────────────────────────── */}
      <div
        ref={passageContentRef}
        style={passageAreaStyle}
        data-testid="mobile-passage-content"
        onScroll={handlePassageContentScroll}
      >
        {currentPassage ? (
          <PassageRendererComponent
            passage={currentPassage}
            fontSize={fontSize}
            lineSpacing={lineSpacing}
            highlighterActive={highlighterActive}
            highlightColor={highlightColor}
            clearHighlightsTrigger={clearHighlightsTrigger}
          />
        ) : (
          <div style={noPassageStyle}>No passage selected</div>
        )}
      </div>

      {/* ── Floating Questions Button ──────────────────────────────────────── */}
      {!testSubmitted && (
        <MobileQuestionsFab
          answeredCount={passageAnsweredCount}
          totalCount={activePassageQuestions.length}
          unansweredCount={passageUnansweredCount}
          flaggedCount={passageFlaggedCount}
          onPress={onOpenQuestionSheet}
        />
      )}

      {/* ── Question Sheet (overlay) ───────────────────────────────────────── */}
      <MobileQuestionSheet
        isOpen={questionSheetOpen}
        onClose={onCloseQuestionSheet}
        title="Questions"
      >
        {/* Sheet info bar: passage label, question range, progress */}
        <div style={sheetInfoBarStyle} data-testid="mobile-sheet-info-bar">
          <span style={{ fontWeight: 600, color: '#334155' }}>
            {activePassageLabel}
          </span>
          <span>
            {questionRange} &middot; {passageAnsweredCount}/{activePassageQuestions.length} answered
          </span>
        </div>

        {/* Sheet-level passage tabs (synced with page tabs) */}
        <MobilePassageTabs
          passages={passages}
          activePassageId={activePassageId}
          onPassageChange={onPassageChange}
        />

        {/* Question content placeholder — wired in Task 4.0 */}
        <div style={sheetPlaceholderStyle} data-testid="mobile-sheet-question-body">
          <div>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
            <div>Question navigator and answer controls</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
              {totalAnsweredCount}/{totalQuestions} total answered
            </div>
          </div>
        </div>
      </MobileQuestionSheet>
    </div>
  );
};

export default MobileReadingExamScaffold;

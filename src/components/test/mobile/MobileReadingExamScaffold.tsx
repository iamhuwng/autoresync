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
import type { PracticeContext } from '../../practice/IELTSPracticeView';
import type { ResolvedPracticeSettings } from '../../../types/practice.types';
import { MobileReadingHeader } from './MobileReadingHeader';
import { MobilePassageTabs } from './MobilePassageTabs';
import { MobileQuestionsFab } from './MobileQuestionsFab';
import { MobileQuestionSheet } from './MobileQuestionSheet';
import { MobileReviewSummary } from './MobileReviewSummary';
import { MobileOverflowMenu } from './MobileOverflowMenu';
import { MobileTextSizeControl } from './MobileTextSizeControl';
import { MobileInstructionsModal } from './MobileInstructionsModal';
import { QuestionNavigator } from '../QuestionNavigator';
import { IELTSQuestionsPanel } from '../IELTSQuestionsPanel';
import { mobileReadingLayerVars } from './mobileReadingLayering';
import {
  findReadingQuestionGroupStart,
  getFirstUnansweredReadingQuestionGroupStart,
  groupReadingQuestionsByTaskType,
} from '../readingQuestionGroups';

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
  /** Manual submit handler (PRD 7.2a: may return Promise for submission gating) */
  onManualSubmit: () => void | Promise<void>;
  /** Auto-submit handler (triggered by scaffold on time expiry) */
  onAutoSubmit: () => void | Promise<void>;

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
  overflowMenuOpen: boolean;
  onOpenOverflowMenu: () => void;
  onCloseOverflowMenu: () => void;
  textSizeControlOpen: boolean;
  onOpenTextSizeControl: () => void;
  onCloseTextSizeControl: () => void;
  instructionsOpen: boolean;
  onOpenInstructions: () => void;
  onCloseInstructions: () => void;
  onTextSizeChange: (size: number) => void;
  onLeaveTest: () => void;
  practiceContext?: PracticeContext;
  resolvedSettings?: ResolvedPracticeSettings;

  // ── Anti-Cheat (host-owned) ─────────────────────────────────────────────────
  /** CSS class for anti-copy-paste protection */
  antiSelectClass?: string;

  // ── Flagging State (host-owned, added in Phase 4) ───────────────────────────
  /** Set of flagged question numbers */

  // ── Scroll Persistence (host-owned, added in Phase 3/6) ─────────────────────
  /** Passage scroll positions keyed by passage ID */
  passageScrollByPassage?: Record<string, number>;
  /** Update scroll position for a passage */
  onPassageScroll?: (passageId: string, scrollTop: number) => void;

  // ── Per-Passage Question Group Memory (host-owned, Task 4.6) ──────────────
  /** Last-active question-group anchor per passage (restored on switch/reopen) */
  activeQuestionGroupByPassage?: Record<string, number>;
  /** Update the remembered active question group for a passage */
  onActiveQuestionGroupChange?: (passageId: string, questionGroupStart: number) => void;
  /** Question sheet body scroll positions keyed by passage ID */
  questionSheetScrollByPassage?: Record<string, number>;
  /** Update the question sheet scroll position for a passage */
  onQuestionSheetScroll?: (passageId: string, scrollTop: number) => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const scaffoldRootStyle: React.CSSProperties = {
  height: '100dvh', // 100dvh for mobile Safari; falls back to 100vh via CSS below
  display: 'flex',
  flexDirection: 'column',
  background: '#f8fafc',
  position: 'relative',
  overflow: 'hidden',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  ...(mobileReadingLayerVars as React.CSSProperties),
};

const passageAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '0.75rem',
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
// NOTE: 150ms is for in-memory host state tracking (UI responsiveness).
// The PRD specifies ≥500ms for persistence writes (Tasks 6.2/6.3).
// Autosave hooks must use their own ≥500ms debounce for storage writes.
const SCROLL_DEBOUNCE_MS = 150;

type QuestionGroupAnchor = {
  startNumber: number;
  topOffset: number;
};

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
    activePassageId,
    onPassageChange,
    currentPassage,
    PassageRendererComponent,
    answers,
    onAnswerChange,
    activeQuestionNumber,
    onQuestionClick,
    timeRemaining,
    formatTime,
    testSubmitted,
    onManualSubmit,
    onAutoSubmit,
    isPaused,
    fontSize,
    lineSpacing,
    highlighterActive,
    highlightColor,
    clearHighlightsTrigger,
    questionSheetOpen,
    onOpenQuestionSheet,
    onCloseQuestionSheet,
    reviewSummaryOpen,
    onOpenReviewSummary,
    onCloseReviewSummary,
    overflowMenuOpen,
    onOpenOverflowMenu,
    onCloseOverflowMenu,
    textSizeControlOpen,
    onOpenTextSizeControl,
    onCloseTextSizeControl,
    instructionsOpen,
    onOpenInstructions,
    onCloseInstructions,
    onTextSizeChange,
    onLeaveTest,
    practiceContext,
    resolvedSettings,
    antiSelectClass,
    questionResults,
    passageScrollByPassage,
    onPassageScroll,
    activeQuestionGroupByPassage,
    onActiveQuestionGroupChange,
    questionSheetScrollByPassage,
    onQuestionSheetScroll,
  } = props;

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const passageContentRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const prevPassageIdRef = useRef<string>(activePassageId);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveActiveQuestionGroupRef = useRef<number>(1);
  const questionGroupAnchorsByPassageRef = useRef<Record<string, QuestionGroupAnchor[]>>({});
  const lastKnownQuestionGroupByPassageRef = useRef<Record<string, number>>({});
  const autoSubmitTriggeredRef = useRef(false);
  const skipNextOutgoingPassageSaveRef = useRef(false);
  const lastRestoredPassageIdRef = useRef<string | null>(null);

  // ── Per-passage derived data ──────────────────────────────────────────────────

  const activePassageIndex = passages.findIndex(p => p.id === activePassageId);
  const activePassageQuestions = useMemo(
    () => questions.filter(q => q.passageId === activePassageId),
    [questions, activePassageId],
  );

  const activePassageQuestionGroups = useMemo(
    () => groupReadingQuestionsByTaskType(activePassageQuestions),
    [activePassageQuestions],
  );

  const passageAnsweredCount = useMemo(
    () => activePassageQuestions.filter(q => answers[q.number] !== undefined && answers[q.number] !== '').length,
    [activePassageQuestions, answers],
  );

  const passageUnansweredCount = activePassageQuestions.length - passageAnsweredCount;

  // Answered set for QuestionNavigator (current-passage only)
  const passageAnsweredSet = useMemo(() => {
    const set = new Set<number>();
    activePassageQuestions.forEach(q => {
      if (answers[q.number] !== undefined && answers[q.number] !== '') {
        set.add(q.number);
      }
    });
    return set;
  }, [activePassageQuestions, answers]);

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

  const restoreScrollPosition = useCallback((
    elementRef: React.RefObject<HTMLDivElement | null>,
    scrollTop: number,
    onAfterApply?: (appliedScrollTop: number) => void,
  ) => {
    const applyScroll = (attempt: number) => {
      const element = elementRef.current;
      if (!element) {
        if (attempt < 5) {
          requestAnimationFrame(() => applyScroll(attempt + 1));
        }
        return;
      }

      element.scrollTop = scrollTop;
      onAfterApply?.(scrollTop);

      if (Math.abs(element.scrollTop - scrollTop) > 1 && attempt < 5) {
        requestAnimationFrame(() => applyScroll(attempt + 1));
      }
    };

    requestAnimationFrame(() => applyScroll(0));
  }, []);

  const resolveVisibleQuestionGroup = useCallback((passageId: string, scrollTop: number) => {
    const anchors = questionGroupAnchorsByPassageRef.current[passageId];
    if (!anchors || anchors.length === 0) {
      return null;
    }

    const threshold = scrollTop + 48;
    let visibleGroupStart = anchors[0]?.startNumber ?? null;

    anchors.forEach((anchor) => {
      if (anchor.topOffset <= threshold) {
        visibleGroupStart = anchor.startNumber;
      }
    });

    return visibleGroupStart;
  }, []);

  const syncVisibleQuestionGroup = useCallback((passageId: string, scrollTop: number) => {
    const visibleGroup = resolveVisibleQuestionGroup(passageId, scrollTop);
    if (visibleGroup !== null) {
      lastKnownQuestionGroupByPassageRef.current[passageId] = visibleGroup;
      onActiveQuestionGroupChange?.(passageId, visibleGroup);
    }
  }, [onActiveQuestionGroupChange, resolveVisibleQuestionGroup]);

  const saveCurrentPassageState = useCallback((passageId: string) => {
    if (onPassageScroll && passageContentRef.current) {
      onPassageScroll(passageId, passageContentRef.current.scrollTop);
    }

    if (!questionSheetOpen) {
      return;
    }

    if (onQuestionSheetScroll && sheetBodyRef.current) {
      onQuestionSheetScroll(passageId, sheetBodyRef.current.scrollTop);
    }

    if (onActiveQuestionGroupChange) {
      const outgoingQuestionGroup =
        lastKnownQuestionGroupByPassageRef.current[passageId]
        ?? activeQuestionGroupByPassage?.[passageId]
        ?? effectiveActiveQuestionGroupRef.current;
      onActiveQuestionGroupChange(passageId, outgoingQuestionGroup);
    }
  }, [
    activeQuestionGroupByPassage,
    onActiveQuestionGroupChange,
    onPassageScroll,
    onQuestionSheetScroll,
    questionSheetOpen,
  ]);

  const handlePassageTabChange = useCallback((passageId: string) => {
    if (passageId === activePassageId) {
      return;
    }

    saveCurrentPassageState(activePassageId);
    skipNextOutgoingPassageSaveRef.current = true;
    onPassageChange(passageId);
  }, [activePassageId, onPassageChange, saveCurrentPassageState]);

  useEffect(() => {
    if (!currentPassage) {
      return;
    }

    if (prevPassageIdRef.current !== activePassageId) {
      return;
    }

    if (lastRestoredPassageIdRef.current === activePassageId) {
      return;
    }

    lastRestoredPassageIdRef.current = activePassageId;
    const savedScroll = passageScrollByPassage?.[activePassageId] ?? 0;
    restoreScrollPosition(passageContentRef, savedScroll);
  }, [activePassageId, currentPassage, passageScrollByPassage, restoreScrollPosition]);

  // Save scroll before passage switch, restore after (passage + sheet + active question)
  // IMPORTANT: prevPassageIdRef must only be updated in ONE place — this effect.
  // The Task 4.6 sheet logic lives here (not in a separate effect) because a later
  // effect would read prevPassageIdRef AFTER this one already updated it.
  useEffect(() => {
    const prevId = prevPassageIdRef.current;
    if (prevId !== activePassageId) {
      if (skipNextOutgoingPassageSaveRef.current) {
        skipNextOutgoingPassageSaveRef.current = false;
      } else {
        saveCurrentPassageState(prevId);
      }

      prevPassageIdRef.current = activePassageId;

      const savedScroll = passageScrollByPassage?.[activePassageId] ?? 0;
      restoreScrollPosition(passageContentRef, savedScroll);

      // ── Task 4.6: Restore new passage's sheet scroll (if sheet is open) ──
      if (questionSheetOpen) {
        const savedSheetScroll = questionSheetScrollByPassage?.[activePassageId] ?? 0;
        restoreScrollPosition(sheetBodyRef, savedSheetScroll, (appliedScrollTop) => {
          syncVisibleQuestionGroup(activePassageId, appliedScrollTop);
        });
      }
    }
  }, [activePassageId, passageScrollByPassage, questionSheetOpen, questionSheetScrollByPassage,
      restoreScrollPosition, saveCurrentPassageState, syncVisibleQuestionGroup]);

  // Cleanup scroll timers
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (sheetScrollTimerRef.current) clearTimeout(sheetScrollTimerRef.current);
    };
  }, []);

  // ── Per-passage question group memory (Task 4.6) ──────────────────────────────

  const firstUnansweredQuestionGroup = useMemo(() => {
    const firstUnansweredGroupStart = getFirstUnansweredReadingQuestionGroupStart(
      activePassageQuestionGroups,
      answers,
    );
    return firstUnansweredGroupStart ?? (activePassageQuestionGroups[0]?.startNumber ?? 1);
  }, [activePassageQuestionGroups, answers]);

  const effectiveActiveQuestionGroup = useMemo(() => {
    const saved = activeQuestionGroupByPassage?.[activePassageId];
    return saved ?? firstUnansweredQuestionGroup;
  }, [activeQuestionGroupByPassage, activePassageId, firstUnansweredQuestionGroup]);

  effectiveActiveQuestionGroupRef.current = effectiveActiveQuestionGroup;
  lastKnownQuestionGroupByPassageRef.current[activePassageId] = effectiveActiveQuestionGroup;

  const effectivePanelQuestionNumber = useMemo(() => {
    const isHostQuestionInPassage = activePassageQuestions.some(
      (question) => question.number === activeQuestionNumber,
    );

    if (!isHostQuestionInPassage) {
      return effectiveActiveQuestionGroup;
    }

    const hostQuestionGroupStart = findReadingQuestionGroupStart(
      activePassageQuestionGroups,
      activeQuestionNumber,
    );

    return hostQuestionGroupStart === effectiveActiveQuestionGroup
      ? activeQuestionNumber
      : effectiveActiveQuestionGroup;
  }, [
    activePassageQuestionGroups,
    activePassageQuestions,
    activeQuestionNumber,
    effectiveActiveQuestionGroup,
  ]);

  const handleQuestionClick = useCallback((questionNumber: number) => {
    const questionGroupStart = findReadingQuestionGroupStart(
      activePassageQuestionGroups,
      questionNumber,
    );

    if (questionGroupStart !== null) {
      lastKnownQuestionGroupByPassageRef.current[activePassageId] = questionGroupStart;
      onActiveQuestionGroupChange?.(activePassageId, questionGroupStart);
    }

    onQuestionClick(questionNumber);
  }, [activePassageId, activePassageQuestionGroups, onActiveQuestionGroupChange, onQuestionClick]);

  const handleReviewQuestionChipTap = useCallback((passageId: string, questionNumber: number) => {
    const targetPassageQuestions = questions.filter((question) => question.passageId === passageId);
    const targetQuestionGroupStart = findReadingQuestionGroupStart(
      groupReadingQuestionsByTaskType(targetPassageQuestions),
      questionNumber,
    ) ?? questionNumber;

    onCloseReviewSummary();
    onPassageChange(passageId);
    onActiveQuestionGroupChange?.(passageId, targetQuestionGroupStart);
    onQuestionClick(questionNumber);

    requestAnimationFrame(() => {
      onOpenQuestionSheet();
    });
  }, [
    onActiveQuestionGroupChange,
    onCloseReviewSummary,
    onOpenQuestionSheet,
    onPassageChange,
    onQuestionClick,
    questions,
  ]);

  const handleQuestionGroupLayoutChange = useCallback((anchors: QuestionGroupAnchor[]) => {
    questionGroupAnchorsByPassageRef.current[activePassageId] = anchors;
    if (sheetBodyRef.current) {
      syncVisibleQuestionGroup(activePassageId, sheetBodyRef.current.scrollTop);
    }
  }, [activePassageId, syncVisibleQuestionGroup]);

  const handleSheetBodyScroll = useCallback(() => {
    if (!sheetBodyRef.current) return;

    const passageId = activePassageId;
    const currentScrollTop = sheetBodyRef.current.scrollTop;
    syncVisibleQuestionGroup(passageId, currentScrollTop);

    if (!onQuestionSheetScroll) {
      return;
    }

    if (sheetScrollTimerRef.current) clearTimeout(sheetScrollTimerRef.current);
    sheetScrollTimerRef.current = setTimeout(() => {
      if (sheetBodyRef.current) {
        onQuestionSheetScroll(passageId, sheetBodyRef.current.scrollTop);
      }
    }, SCROLL_DEBOUNCE_MS);
  }, [activePassageId, onQuestionSheetScroll, syncVisibleQuestionGroup]);

  useEffect(() => {
    if (questionSheetOpen) {
      const savedSheetScroll = questionSheetScrollByPassage?.[activePassageId] ?? 0;
      restoreScrollPosition(sheetBodyRef, savedSheetScroll, (appliedScrollTop) => {
        syncVisibleQuestionGroup(activePassageId, appliedScrollTop);
      });
    }
  }, [activePassageId, questionSheetOpen, questionSheetScrollByPassage, restoreScrollPosition, syncVisibleQuestionGroup]);

  // ── Overflow menu toggle (placeholder — Phase 8) ──────────────────────────────
  const overflowMenuItems = useMemo(() => ([
    { key: 'text-size', label: 'Text size', onSelect: onOpenTextSizeControl },
    { key: 'review-answers', label: 'Review answers', onSelect: onOpenReviewSummary },
    { key: 'instructions-help', label: 'Instructions / Help', onSelect: onOpenInstructions },
    { key: 'leave-test', label: 'Leave test', onSelect: onLeaveTest, destructive: true },
  ]), [
    onLeaveTest,
    onOpenInstructions,
    onOpenReviewSummary,
    onOpenTextSizeControl,
  ]);

  const handleOverflowMenuToggle = useCallback(() => {
    if (testSubmitted) {
      return;
    }

    if (overflowMenuOpen) {
      onCloseOverflowMenu();
      return;
    }

    onOpenOverflowMenu();
  }, [onCloseOverflowMenu, onOpenOverflowMenu, overflowMenuOpen, testSubmitted]);

  const handleHeaderSubmitPress = useCallback(() => {
    if (testSubmitted || props.isSubmitting) {
      return;
    }

    onOpenReviewSummary();
  }, [onOpenReviewSummary, props.isSubmitting, testSubmitted]);

  useEffect(() => {
    if (testSubmitted) {
      autoSubmitTriggeredRef.current = false;
      return;
    }

    if (timeRemaining > 0) {
      autoSubmitTriggeredRef.current = false;
      return;
    }

    if (autoSubmitTriggeredRef.current) {
      return;
    }

    autoSubmitTriggeredRef.current = true;
    onCloseOverflowMenu();
    onCloseTextSizeControl();
    onCloseInstructions();
    onCloseQuestionSheet();
    onCloseReviewSummary();
    void Promise.resolve(onAutoSubmit());
  }, [
    onAutoSubmit,
    onCloseInstructions,
    onCloseOverflowMenu,
    onCloseQuestionSheet,
    onCloseReviewSummary,
    onCloseTextSizeControl,
    testSubmitted,
    timeRemaining,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className={antiSelectClass}
      style={scaffoldRootStyle}
      data-testid="mobile-reading-scaffold"
    >
      {/* dvh fallback for older browsers that don't support 100dvh */}
      <style>{`[data-testid="mobile-reading-scaffold"] { height: 100vh; height: 100dvh; }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <MobileReadingHeader
        mode={mode}
        timeRemaining={timeRemaining}
        formatTime={formatTime}
        onSubmitPress={handleHeaderSubmitPress}
        onOverflowMenuToggle={handleOverflowMenuToggle}
        isPaused={isPaused}
        isSubmitting={props.isSubmitting}
        testSubmitted={testSubmitted}
      />

      {/* ── Page-Level Passage Tabs ────────────────────────────────────────── */}
      <MobilePassageTabs
        passages={passages}
        activePassageId={activePassageId}
        onPassageChange={handlePassageTabChange}
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
          onPress={onOpenQuestionSheet}
        />
      )}

      {/* ── Question Sheet (overlay) ───────────────────────────────────────── */}
      <MobileQuestionSheet
        isOpen={questionSheetOpen}
        onClose={onCloseQuestionSheet}
        title="Questions"
        showHeader={false}
      >
        {/* Question Navigator — collapsible horizontal scroll (Task 4.5) */}
        <div
          style={{
            padding: '4px 10px 2px',
            borderBottom: '1px solid #f1f5f9',
            background: '#ffffff',
          }}
          data-testid="mobile-sheet-navigator"
        >
          <QuestionNavigator
            totalQuestions={activePassageQuestions.length}
            startNumber={activePassageQuestions.length > 0
              ? Math.min(...activePassageQuestions.map(q => q.number))
              : 1}
            currentQuestion={effectiveActiveQuestionGroup}
            answeredQuestions={passageAnsweredSet}
            onQuestionClick={handleQuestionClick}
            collapsible
            size="sm"
          />
        </div>

        {/* Question Blocks — embedded mode (Task 4.5)
            TODO (Task 8.5): Pass lineSpacing={1.6} and fontSize to IELTSQuestionsPanel
            when it supports those props, per FR-108 (mobile fixed line spacing). */}
        <div ref={sheetBodyRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }} onScroll={handleSheetBodyScroll} data-testid="mobile-sheet-question-body">
          <IELTSQuestionsPanel
            questions={questions as any}
            currentPassageId={activePassageId}
            answers={answers}
            onAnswerChange={onAnswerChange}
            activeQuestionNumber={effectivePanelQuestionNumber}
            onQuestionClick={handleQuestionClick}
            testSubmitted={testSubmitted}
            questionResults={questionResults}
            partIndex={activePassageIndex >= 0 ? activePassageIndex : 0}
            skill="reading"
            embedded
            fontSize={fontSize}
            lineSpacing={lineSpacing}
            scrollContainerRef={sheetBodyRef}
            onQuestionGroupLayoutChange={handleQuestionGroupLayoutChange}
          />
        </div>
      </MobileQuestionSheet>

      <MobileOverflowMenu
        isOpen={overflowMenuOpen}
        onClose={onCloseOverflowMenu}
        menuItems={overflowMenuItems}
      />

      {textSizeControlOpen ? (
        <MobileTextSizeControl
          currentSize={fontSize}
          onSizeChange={onTextSizeChange}
          onClose={onCloseTextSizeControl}
        />
      ) : null}

      <MobileInstructionsModal
        isOpen={instructionsOpen}
        onClose={onCloseInstructions}
        mode={mode}
        practiceContext={practiceContext}
        resolvedSettings={resolvedSettings}
      />

      {reviewSummaryOpen ? (
        <MobileReviewSummary
          passages={passages}
          questions={questions}
          answers={answers}
          onQuestionChipTap={handleReviewQuestionChipTap}
          onConfirmSubmit={onManualSubmit}
          onClose={onCloseReviewSummary}
          isSubmitting={props.isSubmitting}
        />
      ) : null}
    </div>
  );
};

export default MobileReadingExamScaffold;

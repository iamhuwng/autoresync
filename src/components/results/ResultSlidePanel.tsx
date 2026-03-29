/**
 * ResultSlidePanel — PRD-0039 Task 5.0 / PRD-0040 Task 2.4
 *
 * Slide-out panel shell for viewing test result details.
 * Owns shared state (current result, active tab, attempts, etc.)
 * and delegates tab content rendering to SharedSavedResultCore.
 *
 * Shell-owned: chrome, data loading, attempts, feedback generation,
 *   body scroll lock, escape key, tab switching, close animation.
 * Core-owned: score summary, answer map, question review, feedback display.
 *
 * Data-loading: RTDB onValue listener → fallback to getTestResult → inline error
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';
import { getTestResult, TestResultRecord } from '../../services/testResults.service';
import type { FormativeFeedback } from '../../types/thcs-test.types';
import { deriveSessionReleaseState, getReleaseVisibility, type ReviewReleaseState } from '../../types/releaseState.types';
import { isEligibleForSavedResultFeedback, useFeedbackAutoTrigger } from '../../hooks/useFeedbackAutoTrigger';
import { useScreenSize } from '@/core/platform';
import { useTestAttempts } from '../../hooks/useTestAttempts';
import { AttemptHistory } from './AttemptHistory';
import { SharedSavedResultCore } from './SharedSavedResultCore';
import type { SharedSavedResultCoreSections } from './SharedSavedResultCore';
import { isPermissionDeniedError, AccessLostState, ACCESS_LOST_INITIAL } from '../../utils/rtdbAccessLost';
import './ResultSlidePanel.css';

/* ─── Props ──────────────────────────────────────────────────────────────── */

export interface ResultSlidePanelProps {
  resultId: string;
  onClose: () => void;
}

/* ─── Tab Type ───────────────────────────────────────────────────────────── */

export type TabId = 'overview' | 'review' | 'feedback';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'review', label: 'Review Mistakes' },
  { id: 'feedback', label: 'Feedback' },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Derive a type badge from the test result record. */
function getTypeBadge(result: TestResultRecord): { label: string; className: string } {
  const type = (result.testType || '').toLowerCase();
  const skill = (result.testSkill || '').toLowerCase();

  if (type.startsWith('thcs') || type.startsWith('practice_thcs')) {
    return { label: 'THCS', className: 'rsp-type-badge--thcs' };
  }
  if (skill === 'reading' || type === 'reading' || (type.includes('ielts') && type.includes('reading'))) {
    return { label: 'IELTS Reading', className: 'rsp-type-badge--reading' };
  }
  if (skill === 'listening' || type === 'listening' || (type.includes('ielts') && type.includes('listening'))) {
    return { label: 'IELTS Listening', className: 'rsp-type-badge--listening' };
  }
  // Fallback for any other type
  return { label: type.toUpperCase() || 'TEST', className: 'rsp-type-badge--thcs' };
}

/** Format date as "20 Mar 2026" (no time). */
function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatSubtitleLabel(value: string): string {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Build subtitle: "Skill/Section | Date" */
function getSubtitle(result: TestResultRecord): string {
  const section = formatSubtitleLabel(result.testSkill || result.testType || 'Result');
  const timestamp = result.submittedAt || result.createdAt;
  const date = formatDate(timestamp);
  const time = formatTime(timestamp);
  return `${section} • ${date} • ${time}`;
}

function isSessionGovernedSavedResult(result: TestResultRecord): boolean {
  return result.context?.type === 'class_session' && Boolean(result.sessionCode);
}

function sessionStillGovernsSavedResult(
  session: Record<string, any> | null | undefined,
  result: TestResultRecord,
): boolean {
  if (!session) {
    return false;
  }

  const status = String(session.status || '').toLowerCase();
  const currentTestId = typeof session.testId === 'string' ? session.testId : null;
  if (!currentTestId || currentTestId !== result.testId) {
    return false;
  }

  return (
    status === 'in-progress'
    || status === 'paused'
    || status === 'active'
    || status === 'completed'
    || status === 'ended'
  );
}

function sanitizeResultForReleaseState(
  result: TestResultRecord,
  releaseState: ReviewReleaseState,
): TestResultRecord {
  if (releaseState === 'feedback-released') {
    return result;
  }

  return {
    ...result,
    questionResults: (result.questionResults || []).map((question) => ({
      ...question,
      correctAnswer: releaseState === 'locked-review' ? '' : question.correctAnswer,
      feedback: '',
      teacherFeedback: undefined,
    })),
    formativeFeedback: undefined,
    overallFeedback: undefined,
    feedbackUpdatedAt: undefined,
    feedbackUpdatedBy: undefined,
    hasFeedback: undefined,
  };
}

interface SavedResultReleaseGate {
  sessionCode: string | null;
  resolved: boolean;
  isGoverned: boolean;
  releaseState: ReviewReleaseState;
}

const DEFAULT_SAVED_RESULT_RELEASE_GATE: SavedResultReleaseGate = {
  sessionCode: null,
  resolved: true,
  isGoverned: false,
  releaseState: 'feedback-released',
};



/* ─── Component ──────────────────────────────────────────────────────────── */

export const ResultSlidePanel: React.FC<ResultSlidePanelProps> = ({ resultId, onClose }) => {
  const { isMobile } = useScreenSize();

  // ── Shared state (Task 5.2) ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [result, setResult] = useState<TestResultRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAttemptResultId, setActiveAttemptResultId] = useState<string>(resultId);
  const [_highlightedQuestionNumber, setHighlightedQuestionNumber] = useState<number | null>(null);
  // ── FR-035: Access-lost state (Task 3.3) ────────────────────────────────
  const [accessLost, setAccessLost] = useState<AccessLostState>(ACCESS_LOST_INITIAL);
  const [savedResultReleaseGate, setSavedResultReleaseGate] = useState<SavedResultReleaseGate>(
    DEFAULT_SAVED_RESULT_RELEASE_GATE,
  );

  // ── Closing animation ────────────────────────────────────────────────────
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const studentId = result?.studentId || (result as any)?.userId;
  const { attempts, loading: attemptsLoading } = useTestAttempts(studentId, result?.testId);
  const isPotentiallyGovernedSavedResult = useMemo(
    () => (result ? isSessionGovernedSavedResult(result) : false),
    [result],
  );
  const releaseGateResolved = !isPotentiallyGovernedSavedResult
    || (
      savedResultReleaseGate.resolved
      && savedResultReleaseGate.sessionCode === result?.sessionCode
    );
  const effectiveSavedResultReleaseState: ReviewReleaseState = isPotentiallyGovernedSavedResult
    ? (
      releaseGateResolved
        ? (savedResultReleaseGate.isGoverned ? savedResultReleaseGate.releaseState : 'feedback-released')
        : 'locked-review'
    )
    : 'feedback-released';
  const releaseVisibility = useMemo(
    () => getReleaseVisibility(effectiveSavedResultReleaseState),
    [effectiveSavedResultReleaseState],
  );
  const visibleResult = useMemo(
    () => (result ? sanitizeResultForReleaseState(result, effectiveSavedResultReleaseState) : null),
    [result, effectiveSavedResultReleaseState],
  );
  const feedbackAutoTriggerEnabled = !isPotentiallyGovernedSavedResult
    || (releaseGateResolved && effectiveSavedResultReleaseState === 'feedback-released');
  const isEligibleForAIFeedback = isEligibleForSavedResultFeedback(result);
  const availableTabs = useMemo(() => {
    const tabs = [TABS[0]];
    if (releaseVisibility.showCorrectAnswers) {
      tabs.push(TABS[1]);
    }
    if (releaseVisibility.showAIFeedback) {
      tabs.push(TABS[2]);
    }
    return tabs;
  }, [releaseVisibility.showAIFeedback, releaseVisibility.showCorrectAnswers]);

  // ── Centralized feedback auto-trigger (PRD-0040 Task 3.6) ───────────────
  const {
    feedbackLoading: formativeFeedbackLoading,
    feedbackError,
    storedFeedbackNeedsUpgrade,
    handleGenerateFeedback: handleGenerateFormativeFeedback,
  } = useFeedbackAutoTrigger({
    resultId: activeAttemptResultId,
    result,
    loading,
    autoTriggerEnabled: feedbackAutoTriggerEnabled,
    shellName: 'ResultSlidePanel',
  });

  useEffect(() => {
    setActiveAttemptResultId(resultId);
    setActiveTab('overview');
    setResult(null);
    setLoading(true);
    setError(null);
    setHighlightedQuestionNumber(null);
    setAccessLost(ACCESS_LOST_INITIAL);
    setSavedResultReleaseGate(DEFAULT_SAVED_RESULT_RELEASE_GATE);
  }, [resultId]);

  useEffect(() => {
    if (!result || !isSessionGovernedSavedResult(result)) {
      setSavedResultReleaseGate(DEFAULT_SAVED_RESULT_RELEASE_GATE);
      return;
    }

    const governedSessionCode = result.sessionCode;
    setSavedResultReleaseGate({
      sessionCode: governedSessionCode,
      resolved: false,
      isGoverned: true,
      releaseState: 'locked-review',
    });

    const sessionRef = ref(database, `game_sessions/${governedSessionCode}`);
    const unsubscribe = onValue(
      sessionRef,
      (snapshot) => {
        const sessionData = snapshot.exists() ? snapshot.val() : null;
        const stillGoverned = sessionStillGovernsSavedResult(sessionData, result);
        setSavedResultReleaseGate({
          sessionCode: governedSessionCode,
          resolved: true,
          isGoverned: stillGoverned,
          releaseState: stillGoverned ? deriveSessionReleaseState(sessionData) : 'feedback-released',
        });
      },
      (sessionError) => {
        console.warn('[ResultSlidePanel] Could not load saved-result release state. Falling back to locked review.', sessionError);
        setSavedResultReleaseGate({
          sessionCode: governedSessionCode,
          resolved: true,
          isGoverned: true,
          releaseState: 'locked-review',
        });
      },
    );

    return () => unsubscribe();
  }, [result?.context?.type, result?.sessionCode]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, availableTabs]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    // Wait for animation to finish before calling onClose
    setTimeout(() => {
      onClose();
    }, 250);
  }, [onClose]);

  // ── Lock body scroll (Task 5.4) ──────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── Escape key close (Task 5.6) ──────────────────────────────────────────
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [handleClose]);

  // ── Data loading (Task 5.3) ──────────────────────────────────────────────
  // Primary: onValue RTDB listener
  // Fallback: getTestResult (one-shot) if listener errors before first snapshot
  // If both fail: show error card with retry
  useEffect(() => {
    let cancelled = false;
    let hasReceivedFirstSnapshot = false;

    setLoading(true);
    setError(null);

    const resultRef = ref(database, `test_results/${activeAttemptResultId}`);

    const unsubscribe = onValue(
      resultRef,
      (snapshot) => {
        if (cancelled) return;
        hasReceivedFirstSnapshot = true;

        if (snapshot.exists()) {
          const data = snapshot.val() as TestResultRecord;
          setResult(data);
          setLoading(false);
          setError(null);
        } else {
          setResult(null);
          setLoading(false);
          setError('Result not found.');
        }
      },
      async (err) => {
        if (cancelled) return;

        // FR-035 (Task 3.3): If error is PERMISSION_DENIED, access was revoked
        // Immediately clear sensitive content and show access-lost state
        if (isPermissionDeniedError(err)) {
          console.warn('[ResultSlidePanel] Access revoked (PERMISSION_DENIED). Clearing data.', err);
          setResult(null);
          setLoading(false);
          setError(null);
          setAccessLost({ isAccessLost: true, reason: 'permission_denied' });
          return;
        }

        // If we already have data (connection dropped after load), keep it visible
        if (hasReceivedFirstSnapshot) {
          console.warn('[ResultSlidePanel] RTDB connection lost, keeping loaded data.', err);
          return;
        }

        // Fallback to one-shot fetch
        console.warn('[ResultSlidePanel] RTDB listener error, falling back to getTestResult.', err);
        try {
          const fallbackResult = await getTestResult(activeAttemptResultId);
          if (cancelled) return;
          if (fallbackResult) {
            setResult(fallbackResult);
            setLoading(false);
            setError(null);
          } else {
            setResult(null);
            setLoading(false);
            setError('Result not found.');
          }
        } catch (fallbackErr) {
          if (cancelled) return;

          // FR-035: Check fallback error too
          if (isPermissionDeniedError(fallbackErr)) {
            setResult(null);
            setLoading(false);
            setError(null);
            setAccessLost({ isAccessLost: true, reason: 'permission_denied' });
            return;
          }

          console.error('[ResultSlidePanel] Both RTDB and fallback failed:', fallbackErr);
          setLoading(false);
          setError('Could not load result. Please try again.');
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeAttemptResultId]);

  // ── Retry handler ────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    // Reset state — the useEffect will re-fire because of resultId dependency
    // We force a re-mount by toggling a key (a simple pattern)
    setResult(null);
    setLoading(true);
    setError(null);

    // Manual one-shot fetch for retry since the listener may already be dead
    (async () => {
      try {
        const data = await getTestResult(activeAttemptResultId);
        if (data) {
          setResult(data);
          setLoading(false);
        } else {
          setError('Result not found.');
          setLoading(false);
        }
      } catch {
        setError('Could not load result. Please try again.');
        setLoading(false);
      }
    })();
  }, [activeAttemptResultId]);

  // ── Attempt change handler (Task 6.8) ─────────────────────────────────
  const handleAttemptChange = useCallback((newResultId: string) => {
    if (newResultId === activeAttemptResultId) {
      return;
    }

    setActiveAttemptResultId(newResultId);
    setActiveTab('overview');  // reset to overview on attempt switch
    setHighlightedQuestionNumber(null);
    setResult(null);           // clear stale data
    setLoading(true);
    setError(null);
  }, [activeAttemptResultId]);

  // Feedback generation, auto-trigger, and dedupe are now centralized
  // in useFeedbackAutoTrigger (PRD-0040 Task 3.6)

  // ── Badge / subtitle derived values ──────────────────────────────────────
  const badge = useMemo(() => (result ? getTypeBadge(result) : null), [result]);
  const subtitle = useMemo(() => (result ? getSubtitle(result) : ''), [result]);
  const isWritingResult = Boolean(
    result && (
      result.testSkill === 'writing'
      || (result as any).writingData
      || (result as any).writingSubmission
    ),
  );

  // ── Tab → section visibility mapping (PRD-0040 Task 2.4) ────────────────
  const tabSections: SharedSavedResultCoreSections = useMemo(() => {
    if (isWritingResult) {
      return {
        scoreSummary: false,
        answerMap: false,
        sectionBreakdown: false,
        questionReview: false,
        feedbackDisplay: false,
        teacherFeedback: false,
        writingPlaceholder: true,
      };
    }

    switch (activeTab) {
      case 'overview':
        return { scoreSummary: true, answerMap: true, sectionBreakdown: releaseVisibility.showQuestionScoring, questionReview: false, feedbackDisplay: false, teacherFeedback: false, writingPlaceholder: false };
      case 'review':
        return { scoreSummary: false, answerMap: false, sectionBreakdown: false, questionReview: releaseVisibility.showCorrectAnswers, feedbackDisplay: false, teacherFeedback: false, writingPlaceholder: false };
      case 'feedback':
        return { scoreSummary: false, answerMap: false, sectionBreakdown: false, questionReview: false, feedbackDisplay: releaseVisibility.showAIFeedback, teacherFeedback: false, writingPlaceholder: false };
      default:
        return { scoreSummary: false, answerMap: false, sectionBreakdown: false, questionReview: false, feedbackDisplay: false, teacherFeedback: false, writingPlaceholder: false };
    }
  }, [activeTab, isWritingResult, releaseVisibility.showAIFeedback, releaseVisibility.showCorrectAnswers, releaseVisibility.showQuestionScoring]);

  // ── Question navigation: pill click → switch to review tab + highlight ──
  const handleCoreNavigateToQuestion = useCallback((questionNumber: number) => {
    if (!releaseVisibility.showCorrectAnswers) {
      return;
    }
    setActiveTab('review');
    setHighlightedQuestionNumber(questionNumber);
  }, [releaseVisibility.showCorrectAnswers]);

  // ── Feedback retry handler for core ──────────────────────────────────────
  const handleFeedbackRetry = useCallback(() => {
    handleGenerateFormativeFeedback(storedFeedbackNeedsUpgrade);
  }, [handleGenerateFormativeFeedback, storedFeedbackNeedsUpgrade]);

  // ── Tab content rendering ───────────────────────────────────────────────
  const renderTabContent = () => {
    // FR-035 (Task 3.3): Access-lost state takes precedence over all other states
    if (accessLost.isAccessLost) {
      return (
        <div className="rsp-error-card" data-testid="rsp-access-lost">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
          <p style={{ fontWeight: 600, fontSize: '1rem', color: '#1e293b', marginBottom: '0.5rem' }}>
            Access Revoked
          </p>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
            You no longer have access to this result. This may happen if your permissions were changed.
          </p>
          <button className="rsp-retry-btn" onClick={handleClose}>
            Close
          </button>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="rsp-loading">
          <div className="rsp-spinner" />
          <span>Loading result…</span>
        </div>
      );
    }

    if (error || !result) {
      return (
        <div className="rsp-error-card">
          <p>{error || 'Something went wrong.'}</p>
          <button className="rsp-retry-btn" onClick={handleRetry}>
            Retry
          </button>
        </div>
      );
    }

    const renderedResult = visibleResult || result;
    const releaseNotice = savedResultReleaseGate.isGoverned && effectiveSavedResultReleaseState !== 'feedback-released' ? (
      <div
        style={{
          marginBottom: '1rem',
          padding: '0.875rem 1rem',
          borderRadius: '0.875rem',
          border: effectiveSavedResultReleaseState === 'locked-review'
            ? '1px solid rgba(245, 158, 11, 0.22)'
            : '1px solid rgba(59, 130, 246, 0.18)',
          background: effectiveSavedResultReleaseState === 'locked-review'
            ? 'rgba(255, 251, 235, 0.92)'
            : 'rgba(239, 246, 255, 0.92)',
        }}
        data-testid={`rsp-release-notice-${effectiveSavedResultReleaseState}`}
      >
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: effectiveSavedResultReleaseState === 'locked-review' ? '#92400e' : '#1d4ed8',
            marginBottom: '0.25rem',
          }}
        >
          {effectiveSavedResultReleaseState === 'locked-review' ? 'Detailed review is still locked' : 'Answers released, feedback still pending'}
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: effectiveSavedResultReleaseState === 'locked-review' ? '#b45309' : '#3b82f6',
            lineHeight: 1.5,
          }}
        >
          {effectiveSavedResultReleaseState === 'locked-review'
            ? 'This saved result is still governed by the live-session release state. You can see your score and answer map, but not the released answer review yet.'
            : 'Your teacher has released answer review for this live-session result. AI and teacher feedback will appear here once the session reaches feedback release.'}
        </div>
      </div>
    ) : null;

    return (
      <>
        {releaseNotice}
        <SharedSavedResultCore
          result={renderedResult}
          variant="slide-panel"
          sections={tabSections}
          feedbackState={{
            formativeFeedback: renderedResult.formativeFeedback as FormativeFeedback | null | undefined,
            feedbackLoading: feedbackAutoTriggerEnabled && formativeFeedbackLoading && !renderedResult.formativeFeedback,
            feedbackError: releaseVisibility.showFeedbackControls ? feedbackError : null,
            needsUpgrade: releaseVisibility.showFeedbackControls ? storedFeedbackNeedsUpgrade : false,
            isEligibleForAIFeedback: releaseVisibility.showFeedbackControls && isEligibleForAIFeedback,
            onRetryFeedback: releaseVisibility.showFeedbackControls ? handleFeedbackRetry : undefined,
          }}
          onNavigateToQuestion={handleCoreNavigateToQuestion}
          canNavigateToReview={availableTabs.some((tab) => tab.id === 'review')}
        />
      </>
    );
  };

  // ── Backdrop click handler (desktop only, Task 5.6) ──────────────────────
  const handleBackdropClick = useCallback(() => {
    if (!isMobile) {
      handleClose();
    }
  }, [isMobile, handleClose]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop (desktop only) */}
      {!isMobile && (
        <div
          className={`rsp-backdrop ${isClosing ? 'rsp-backdrop--closing' : ''}`}
          onClick={handleBackdropClick}
          data-testid="rsp-backdrop"
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={[
          'rsp-panel',
          isMobile && 'rsp-panel--mobile',
          isClosing && 'rsp-panel--closing',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label="Test result details"
        data-testid="rsp-panel"
      >
        {/* Header (Task 5.7) */}
        <div className="rsp-header">
          <button
            className="rsp-back-btn"
            onClick={handleClose}
            aria-label="Close panel"
            data-testid="rsp-back-btn"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12.5 15L7.5 10L12.5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="rsp-header-content">
            {result ? (
              <>
                <div className="rsp-title-row">
                  <div className="rsp-heading-inline">
                    <h2 className="rsp-title" title={result.testTitle}>
                      {result.testTitle}
                    </h2>
                    <div className="rsp-subtitle-row">
                      {badge && (
                        <span className={`rsp-type-badge ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                      <span className="rsp-subtitle-text">{subtitle}</span>
                    </div>
                  </div>
                  <div className="rsp-attempt-slot" data-testid="rsp-header-attempt">
                    <AttemptHistory
                      currentResult={result}
                      attempts={attempts}
                      loading={attemptsLoading}
                      onAttemptChange={handleAttemptChange}
                    />
                  </div>
                </div>
              </>
            ) : loading ? (
              <span className="rsp-subtitle-text">Loading...</span>
            ) : null}
          </div>

          <button
            className="rsp-close-btn"
            onClick={handleClose}
            aria-label="Close panel"
            data-testid="rsp-close-btn"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M5 5L13 13M13 5L5 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tab bar (Task 5.8, 5.9) */}
        <div className="rsp-tab-bar" data-testid="rsp-tab-bar">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              className={`rsp-tab ${activeTab === tab.id ? 'rsp-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`rsp-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable tab body (Task 5.9) */}
        <div className="rsp-tab-body" data-testid="rsp-tab-body">
          {renderTabContent()}
        </div>
      </div>
    </>
  );
};

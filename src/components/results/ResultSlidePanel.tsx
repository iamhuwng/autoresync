/**
 * ResultSlidePanel — PRD-0039 Task 5.0
 *
 * Slide-out panel shell for viewing test result details.
 * Owns shared state (current result, active tab, attempts, etc.)
 * and delegates tab content to child components.
 *
 * Data-loading: RTDB onValue listener → fallback to getTestResult → inline error
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';
import { getTestResult, TestResultRecord } from '../../services/testResults.service';
import { generateFormativeFeedback } from '../../services/formativeFeedback.service';
import { useScreenSize } from '@/core/platform';
import { useTestAttempts } from '../../hooks/useTestAttempts';
import { AttemptHistory } from './AttemptHistory';
import { OverviewTab } from './OverviewTab';
import { ReviewTab } from './ReviewTab';
import { FeedbackTab } from './FeedbackTab';
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

function isIeltsResult(result: TestResultRecord): boolean {
  const type = String(result.testType || '').toLowerCase();
  const skill = String(result.testSkill || '').toLowerCase();
  return type.includes('ielts') || skill === 'reading' || skill === 'listening';
}

function normalizeFeedbackQuestionType(questionType: string | undefined): string {
  const raw = String(questionType || 'question').trim().toLowerCase();
  if (!raw) return 'question';

  return raw
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function buildFeedbackPayload(result: TestResultRecord, activeResultId: string) {
  const questionResults = Array.isArray(result.questionResults) ? result.questionResults : [];

  if (questionResults.length === 0) {
    return null;
  }

  const questionResultsRecord = Object.fromEntries(
    questionResults.map((questionResult) => [
      questionResult.questionNumber,
      {
        questionNumber: questionResult.questionNumber,
        isCorrect: questionResult.isCorrect,
        studentAnswer: questionResult.studentAnswer,
        correctAnswer: questionResult.correctAnswer,
        pointsEarned: questionResult.score,
        pointsMax: questionResult.maxScore,
      },
    ]),
  );

  const buildIntentBreakdown = (items: typeof questionResults) =>
    items.reduce<Record<string, { correct: number; total: number }>>((acc, item) => {
      const key = normalizeFeedbackQuestionType(item.questionType);

      if (!acc[key]) {
        acc[key] = { correct: 0, total: 0 };
      }

      acc[key].total += 1;
      if (item.isCorrect) {
        acc[key].correct += 1;
      }

      return acc;
    }, {});

  if (result.thcsData?.sectionResults?.length) {
    const thcsData = result.thcsData;
    const safeSections = Array.isArray((result as any).sections)
      ? (result as any).sections
      : thcsData.sectionResults.map((section: any) => ({
          id: section.sectionId || section.sectionName,
          name: section.sectionName,
          questions: [],
        }));

    return {
      gradingResult: {
        scaledScore: thcsData.scaledScore,
        totalPoints: result.totalScore,
        maxPoints: result.maxScore,
        sectionResults: thcsData.sectionResults,
        questionResults: questionResultsRecord,
        gradingStatus: 'fully-graded',
        gradedAt: result.submittedAt,
        testId: result.testId,
        studentId: result.studentId || (result as any).userId || '',
      },
      sections: safeSections,
      testMetadata: {
        title: result.testTitle || 'Test',
        gradeLevel: (result as any).gradeLevel || 9,
        type: result.testType,
        skill: result.testSkill,
        family: 'thcs',
        timeSpent: result.timeElapsed,
        totalQuestions: result.totalQuestions,
      },
      resultId: activeResultId,
    };
  }

  if (!isIeltsResult(result)) {
    return null;
  }

  const passageResults = result.ieltsData?.passageResults || [];
  const derivedSections = passageResults.length > 0
    ? passageResults.map((passage, index) => {
        const sectionQuestions = questionResults.filter(
          (questionResult) =>
            questionResult.questionNumber >= passage.questionRange[0] &&
            questionResult.questionNumber <= passage.questionRange[1],
        );

        return {
          id: `passage-${index + 1}`,
          name: passage.passageName || `Passage ${index + 1}`,
          questions: sectionQuestions.map((questionResult) => ({
            questionNumber: questionResult.questionNumber,
            questionText: `Question ${questionResult.questionNumber}`,
            type: normalizeFeedbackQuestionType(questionResult.questionType),
            intent: normalizeFeedbackQuestionType(questionResult.questionType),
          })),
          questionItems: sectionQuestions,
        };
      })
    : [
        {
          id: 'overall',
          name: 'Overall Performance',
          questions: questionResults.map((questionResult) => ({
            questionNumber: questionResult.questionNumber,
            questionText: `Question ${questionResult.questionNumber}`,
            type: normalizeFeedbackQuestionType(questionResult.questionType),
            intent: normalizeFeedbackQuestionType(questionResult.questionType),
          })),
          questionItems: questionResults,
        },
      ];

  const sectionResults = derivedSections.map((section) => {
    const items = section.questionItems;
    const correctCount = items.filter((item) => item.isCorrect).length;
    const totalCount = items.length;

    return {
      sectionId: section.id,
      sectionName: section.name,
      pointsEarned: correctCount,
      pointsMax: totalCount,
      correctCount,
      totalCount,
      percentage: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
      intentBreakdown: buildIntentBreakdown(items) as any,
    };
  });

  return {
    gradingResult: {
      scaledScore: result.bandScore || Number((result.percentage / 10).toFixed(1)),
      totalPoints: result.totalScore,
      maxPoints: result.maxScore,
      sectionResults,
      questionResults: questionResultsRecord,
      gradingStatus: 'fully-graded',
      gradedAt: result.submittedAt,
      testId: result.testId,
      studentId: result.studentId || (result as any).userId || '',
    },
    sections: derivedSections.map(({ questionItems: _questionItems, ...section }) => section),
    testMetadata: {
      title: result.testTitle || 'IELTS Test',
      gradeLevel: (result as any).gradeLevel || 9,
      type: result.testType,
      skill: result.testSkill,
      family: 'ielts',
      bandScore: result.bandScore,
      passageResults,
      timeSpent: result.timeElapsed,
      totalQuestions: result.totalQuestions,
    },
    resultId: activeResultId,
  };
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export const ResultSlidePanel: React.FC<ResultSlidePanelProps> = ({ resultId, onClose }) => {
  const { isMobile } = useScreenSize();

  // ── Shared state (Task 5.2) ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [result, setResult] = useState<TestResultRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAttemptResultId, setActiveAttemptResultId] = useState<string>(resultId);
  const [highlightedQuestionNumber, setHighlightedQuestionNumber] = useState<number | null>(null);
  const [formativeFeedbackLoading, setFormativeFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const feedbackAttemptedRef = useRef(false);

  // ── Closing animation ────────────────────────────────────────────────────
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const studentId = result?.studentId || (result as any)?.userId;
  const { attempts, loading: attemptsLoading } = useTestAttempts(studentId, result?.testId);

  useEffect(() => {
    setActiveAttemptResultId(resultId);
    setActiveTab('overview');
    setResult(null);
    setLoading(true);
    setError(null);
    setHighlightedQuestionNumber(null);
    setFeedbackError(null);
    feedbackAttemptedRef.current = false;
  }, [resultId]);

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

  // ── Auto-trigger feedback generation (Task 6.21–6.22) ────────────────────
  const handleGenerateFormativeFeedback = useCallback(async () => {
    if (!result) return;
    const payload = buildFeedbackPayload(result, activeAttemptResultId);
    if (!payload) return;

    try {
      setFormativeFeedbackLoading(true);
      setFeedbackError(null);

      await generateFormativeFeedback(
        payload.gradingResult as any,
        payload.sections as any,
        payload.testMetadata,
        payload.resultId,
      );
      // RTDB onValue listener will pick up the new formativeFeedback
    } catch (err) {
      console.error('[ResultSlidePanel] Failed to generate formative feedback:', err);
      setFeedbackError('Failed to generate feedback.');
    } finally {
      setFormativeFeedbackLoading(false);
    }
  }, [result, activeAttemptResultId]);

  // Auto-trigger when result loads without feedback (THCS or IELTS)
  useEffect(() => {
    if (!result || loading) return;

    const hasFeedback = !!result.formativeFeedback;
    const hasThcsData = !!result.thcsData?.sectionResults;
    const isEligible = hasThcsData || isIeltsResult(result);

    if (isEligible && !hasFeedback && !formativeFeedbackLoading && !feedbackError) {
      if (!feedbackAttemptedRef.current) {
        feedbackAttemptedRef.current = true;
        handleGenerateFormativeFeedback();
      }
    }
  }, [result, loading, formativeFeedbackLoading, feedbackError, handleGenerateFormativeFeedback]);

  // Reset feedback attempt when switching results
  useEffect(() => {
    feedbackAttemptedRef.current = false;
    setFeedbackError(null);
  }, [activeAttemptResultId]);

  // ── Badge / subtitle derived values ──────────────────────────────────────
  const badge = useMemo(() => (result ? getTypeBadge(result) : null), [result]);
  const subtitle = useMemo(() => (result ? getSubtitle(result) : ''), [result]);

  // ── Tab content placeholder ──────────────────────────────────────────────
  const renderTabContent = () => {
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

    // Tab bodies — real content
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            result={result}
            onTabSwitch={setActiveTab}
            onHighlightQuestion={setHighlightedQuestionNumber}
            formativeFeedbackLoading={formativeFeedbackLoading}
            feedbackError={feedbackError}
            onRetryFeedback={() => {
              feedbackAttemptedRef.current = false;
              setFeedbackError(null);
              handleGenerateFormativeFeedback();
            }}
          />
        );
      case 'review':
        return (
          <ReviewTab
            result={result}
            highlightedQuestionNumber={highlightedQuestionNumber}
            onHighlightComplete={() => setHighlightedQuestionNumber(null)}
          />
        );
      case 'feedback':
        return <FeedbackTab result={result} />;
      default:
        return null;
    }
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
          {TABS.map((tab) => (
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

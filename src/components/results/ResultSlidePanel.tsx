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
import { useScreenSize } from '@/core/platform';
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
  if (skill === 'reading' || type === 'reading') {
    return { label: 'IELTS Reading', className: 'rsp-type-badge--reading' };
  }
  if (skill === 'listening' || type === 'listening') {
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

/** Build subtitle: "Skill/Section | Date" */
function getSubtitle(result: TestResultRecord): string {
  const skill = result.testSkill || result.testType || '';
  const section = skill.charAt(0).toUpperCase() + skill.slice(1);
  const date = formatDate(result.submittedAt || result.createdAt);
  return `${section} | ${date}`;
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
  const [attempts, setAttempts] = useState<TestResultRecord[]>([]);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [highlightedQuestionNumber, setHighlightedQuestionNumber] = useState<number | null>(null);
  const [formativeFeedbackLoading, setFormativeFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const feedbackAttemptedRef = useRef(false);

  // ── Closing animation ────────────────────────────────────────────────────
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

    const resultRef = ref(database, `test_results/${resultId}`);

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
          const fallbackResult = await getTestResult(resultId);
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
  }, [resultId]);

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
        const data = await getTestResult(resultId);
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
  }, [resultId]);

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

    // Tab bodies — placeholders until Task 6/7/8 build real content
    switch (activeTab) {
      case 'overview':
        return <div className="rsp-placeholder">Overview tab — coming in Task 6.0</div>;
      case 'review':
        return <div className="rsp-placeholder">Review Mistakes tab — coming in Task 7.0</div>;
      case 'feedback':
        return <div className="rsp-placeholder">Feedback tab — coming in Task 8.0</div>;
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
          className="rsp-backdrop"
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
              </>
            ) : loading ? (
              <span className="rsp-subtitle-text">Loading…</span>
            ) : null}
          </div>
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

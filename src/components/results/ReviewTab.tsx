/**
 * ReviewTab — PRD-0039 Task 7.0
 *
 * Displays question-by-question review with incorrect heading banner,
 * show-all/show-incorrect toggle, review cards with answer comparison,
 * AI explanations, pending-review notices, and perfect-score congratulations.
 */

import React, { useEffect, useMemo } from 'react';
import type { TestResultRecord } from '../../services/testResults.service';
import {
  getPreferredQuestionExplanation,
  getRenderableQuestionExplanations,
  needsAiFeedbackUpgrade,
} from '../../services/formativeFeedback.service';
import './ReviewTab.css';

/* ─── Props ──────────────────────────────────────────────────────────────── */

export interface ReviewTabProps {
  result: TestResultRecord;
  highlightedQuestionNumber?: number | null;
  onHighlightComplete?: () => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Format a raw answer for display */
function formatAnswer(answer: unknown): string {
  if (answer == null) return '';
  if (Array.isArray(answer)) return answer.join(', ');
  if (typeof answer === 'object') return JSON.stringify(answer);
  return String(answer);
}

/** Get question type label */
function getTypeLabel(type: string | undefined): string {
  if (!type) return 'MCQ';
  const map: Record<string, string> = {
    'mcq': 'MCQ',
    'multiple-choice': 'MCQ',
    'fill-in-blank': 'Fill-in-blank',
    'true-false': 'True/False',
    'sentence-rewrite': 'Sentence Rewrite',
    'matching': 'Matching',
    'completion': 'Completion',
    'short-answer': 'Short Answer',
  };
  return map[type] || type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getQuestionStatusText(question: {
  isCorrect: boolean;
  score: number;
  maxScore: number;
}): string {
  const scoreLabel = `${question.score}/${question.maxScore}`;
  return question.isCorrect ? `Correct — ${scoreLabel}` : `Incorrect — ${scoreLabel}`;
}

function renderFormattedExplanation(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const regex = /<b>(.*?)<\/b>|\*\*(.*?)\*\*/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);
  let key = 0;

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    nodes.push(<strong key={`strong-${key++}`}>{match[1] || match[2]}</strong>);
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export const ReviewTab: React.FC<ReviewTabProps> = ({
  result,
  highlightedQuestionNumber = null,
  onHighlightComplete,
}) => {
  const questions = useMemo(() => result.questionResults || [], [result]);

  const incorrectQuestions = useMemo(
    () => questions.filter(q => !q.isCorrect),
    [questions],
  );

  const isPerfectScore = incorrectQuestions.length === 0;

  const formativeFeedback = (result as any).formativeFeedback;
  const explanations = useMemo(
    () => getRenderableQuestionExplanations(formativeFeedback?.questionExplanations),
    [formativeFeedback?.questionExplanations],
  );
  const aiExplanationPending = useMemo(
    () => Boolean(formativeFeedback && needsAiFeedbackUpgrade(formativeFeedback, result.questionResults as any)),
    [formativeFeedback, result.questionResults],
  );

  useEffect(() => {
    if (!highlightedQuestionNumber) {
      return;
    }

    const target = document.getElementById(`qcard-${highlightedQuestionNumber}`);
    if (!target) {
      onHighlightComplete?.();
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('rv-card--highlighted');

    const resetTimer = window.setTimeout(() => {
      target.classList.remove('rv-card--highlighted');
      onHighlightComplete?.();
    }, 2000);

    return () => {
      window.clearTimeout(resetTimer);
      target.classList.remove('rv-card--highlighted');
    };
  }, [highlightedQuestionNumber, onHighlightComplete]);

  // ── Perfect Score (Task 7.9) ────────────────────────────────────────────
  if (isPerfectScore) {
    return (
      <div className="rv-root">
        <div className="rv-perfect-card" data-testid="rv-perfect-score">
          <div className="rv-perfect-trophy">{'\u{1F3C6}'}</div>
          <div className="rv-perfect-title">Perfect Score!</div>
          <div className="rv-perfect-subtitle">You answered all questions correctly.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rv-root">
      {/* ── Incorrect Heading Banner (Task 7.2) ──────────────────────────── */}
      <div className="rv-incorrect-banner" data-testid="rv-incorrect-banner">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="rv-banner-title">Incorrect Questions</span>
        <span className="rv-banner-count" data-testid="rv-incorrect-count">
          {incorrectQuestions.length}
        </span>
      </div>

      {/* ── Toggle (Task 7.3) ────────────────────────────────────────────── */}

      {/* ── Review Cards (Task 7.5–7.7) ──────────────────────────────────── */}
      <div className="rv-cards">
        {incorrectQuestions.map((q) => {
          const isSentenceRewrite = (q.questionType || '').includes('sentence-rewrite');
          const hasPendingReview = isSentenceRewrite && q.score === 0 && q.maxScore > 0 && !q.isCorrect;
          const explanationEntry = getPreferredQuestionExplanation(formativeFeedback, q as any);
          const explanation = explanationEntry?.text || explanations[String(q.questionNumber)];
          const explanationLabel = explanationEntry?.source === 'fallback' ? 'Explanation' : 'AI Explanation';
          const questionType = getTypeLabel(q.questionType);

          return (
            <div
              key={q.questionNumber}
              id={`qcard-${q.questionNumber}`}
              className="rv-card"
              data-testid={`rv-card-${q.questionNumber}`}
            >
              {/* Question number badge + type */}
              <div className="rv-card-header">
                <span className={`rv-q-badge ${q.isCorrect ? 'rv-q-badge--correct' : 'rv-q-badge--incorrect'}`}>
                  {q.questionNumber}
                </span>
                <div className="rv-question-meta">
                  <div className="rv-meta-title">Question {q.questionNumber}</div>
                  <div className="rv-meta-row">
                    <span className="rv-q-type">{questionType}</span>
                    <span className={`rv-q-status ${q.isCorrect ? 'rv-q-status--correct' : 'rv-q-status--incorrect'}`}>
                      {getQuestionStatusText(q)}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`rv-answer-grid ${q.isCorrect ? 'rv-answer-grid--single' : ''}`}>
                <div className={`rv-answer-block ${q.isCorrect ? 'rv-answer--correct' : 'rv-answer--incorrect'}`}>
                  <span className="rv-answer-label">Your Answer</span>
                  <span className="rv-answer-text">{formatAnswer(q.studentAnswer) || '—'}</span>
                </div>
                {!q.isCorrect ? (
                  <div className="rv-answer-block rv-answer--correct">
                    <span className="rv-answer-label">
                      {isSentenceRewrite ? 'Model Answers' : 'Correct Answer'}
                    </span>
                    <span className="rv-answer-text">{formatAnswer(q.correctAnswer) || '—'}</span>
                  </div>
                ) : null}
              </div>

              {explanation ? (
                <div className="rv-explanation" data-testid={`rv-explanation-${q.questionNumber}`}>
                  <span className="rv-explanation-label">{explanationLabel}</span>
                  <p className="rv-explanation-text">{renderFormattedExplanation(explanation)}</p>
                </div>
              ) : (!hasPendingReview && aiExplanationPending) ? (
                <div className="rv-pending" data-testid={`rv-ai-pending-${q.questionNumber}`}>
                  Detailed AI explanation is still being generated for this question.
                </div>
              ) : null}

              {/* Pending review notice (Task 7.6) */}
              {hasPendingReview && (
                <div className="rv-pending" data-testid={`rv-pending-${q.questionNumber}`}>
                  Awaiting teacher review
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

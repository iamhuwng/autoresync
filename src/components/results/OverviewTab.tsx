/**
 * OverviewTab - PRD-0039 Task 6.0
 */

import React, { useMemo, useEffect, useCallback, useState } from 'react';
import type { TestResultRecord } from '../../services/testResults.service';
import type { TabId } from './ResultSlidePanel';
import type { FormativeFeedback } from '../../types/thcs-test.types';
import './OverviewTab.css';

export interface OverviewTabProps {
  result: TestResultRecord;
  onTabSwitch: (tab: TabId) => void;
  onHighlightQuestion: (qNum: number | null) => void;
  formativeFeedbackLoading?: boolean;
  feedbackError?: string | null;
  onRetryFeedback?: () => void;
}

function getTestCategory(result: TestResultRecord): 'thcs' | 'ielts-reading' | 'ielts-listening' | 'generic' {
  const type = String(result.testType || '').toLowerCase();
  const skill = String(result.testSkill || '').toLowerCase();

  if (type.startsWith('thcs') || type.startsWith('practice_thcs')) return 'thcs';
  if (skill === 'reading' || type === 'reading' || (type.includes('ielts') && type.includes('reading'))) {
    return 'ielts-reading';
  }
  if (skill === 'listening' || type === 'listening' || (type.includes('ielts') && type.includes('listening'))) {
    return 'ielts-listening';
  }

  return 'generic';
}

function formatTime(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return '--';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getIntentColor(percentage: number): string {
  if (percentage >= 70) return '#059669';
  if (percentage >= 50) return '#d97706';
  return '#dc2626';
}

function getPillStatus(question: { isCorrect: boolean; score: number; maxScore: number }): 'correct' | 'incorrect' | 'partial' | 'pending' {
  if (question.isCorrect) return 'correct';
  if (question.score > 0 && question.score < question.maxScore) return 'partial';
  return 'incorrect';
}

function getPerformanceLevel(percentage: number): {
  label: string;
  icon: string;
  bgClass: string;
} {
  if (percentage >= 80) {
    return { label: 'Excellent Performance!', icon: '\u{1F389}', bgClass: 'ov-perf--excellent' };
  }
  if (percentage >= 60) {
    return { label: 'Good Job!', icon: '\u{1F4AA}', bgClass: 'ov-perf--good' };
  }
  return { label: 'Keep Practicing!', icon: '\u{1F4DA}', bgClass: 'ov-perf--needs-work' };
}

interface ScoreRingProps {
  value: number;
  color: string;
  centerText: string;
  subText: string;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ value, color, centerText, subText }) => {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));

  return (
    <div className="ov-ring-wrap">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
        />
      </svg>
      <div className="ov-ring-center">
        <span className="ov-ring-main">{centerText}</span>
        <span className="ov-ring-sub">{subText}</span>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="ov-stat-card fade-in-d2">
    <span className="ov-stat-value">{value}</span>
    <span className="ov-stat-label">{label}</span>
  </div>
);

const AnswerMapLegend: React.FC<{ hasPartial: boolean }> = ({ hasPartial }) => (
  <div className="ov-legend">
    <span className="ov-legend-item"><span className="ov-legend-dot ov-legend-dot--correct" /> Correct</span>
    <span className="ov-legend-item"><span className="ov-legend-dot ov-legend-dot--incorrect" /> Incorrect</span>
    {hasPartial ? (
      <span className="ov-legend-item"><span className="ov-legend-dot ov-legend-dot--partial" /> Partial</span>
    ) : null}
  </div>
);

export const OverviewTab: React.FC<OverviewTabProps> = ({
  result,
  onTabSwitch,
  onHighlightQuestion,
  formativeFeedbackLoading,
  feedbackError,
  onRetryFeedback,
}) => {
  const category = useMemo(() => getTestCategory(result), [result]);
  const timeSpent = formatTime(result.timeElapsed);
  const formativeFeedback = result.formativeFeedback as FormativeFeedback | undefined;
  const [showAllSections, setShowAllSections] = useState(false);

  useEffect(() => {
    setShowAllSections(false);
  }, [result.resultId, result.submittedAt, result.createdAt]);

  const goToQuestion = useCallback((questionNumber: number) => {
    onTabSwitch('review');
    onHighlightQuestion(questionNumber);
  }, [onHighlightQuestion, onTabSwitch]);

  const questions = result.questionResults || [];
  const hasPartial = questions.some((question) => question.score > 0 && question.score < question.maxScore && !question.isCorrect);
  const gridCols = result.totalQuestions > 50 ? 10 : 20;
  const answerMapStats = useMemo(
    () =>
      questions.reduce(
        (acc, question) => {
          const status = getPillStatus(question);
          acc[status] += 1;
          return acc;
        },
        { correct: 0, incorrect: 0, partial: 0, pending: 0 },
      ),
    [questions],
  );

  let ringValue: number;
  let ringColor: string;
  let ringCenter: string;
  let ringSub: string;
  let statCards: Array<{ value: string; label: string }>;
  const ringPercentage = `${Math.round(result.percentage)}%`;
  const ringScore = result.maxScore
    ? `${result.totalScore}/${result.maxScore}`
    : `${result.correct}/${result.totalQuestions}`;

  if (category === 'thcs' && result.thcsData) {
    const scaledScore = result.thcsData.scaledScore;
    ringValue = result.percentage / 100;
    ringColor = '#4f46e5';
    ringCenter = ringPercentage;
    ringSub = ringScore;
    statCards = [
      { value: `${result.totalScore}/${result.maxScore}`, label: 'Points Earned' },
      { value: scaledScore.toFixed(1), label: 'Scaled Score' },
      { value: timeSpent, label: 'Time Spent' },
    ];
  } else if (category === 'ielts-reading' || category === 'ielts-listening') {
    ringValue = result.percentage / 100;
    ringColor = '#4f46e5';
    ringCenter = ringPercentage;
    ringSub = ringScore;
    statCards = [
      { value: result.bandScore ? result.bandScore.toFixed(1) : '--', label: 'Band Score' },
      { value: `${result.correct}/${result.totalQuestions}`, label: 'Correct Answers' },
      { value: timeSpent, label: 'Time Spent' },
    ];
  } else {
    ringValue = result.percentage / 100;
    ringColor = '#4f46e5';
    ringCenter = ringPercentage;
    ringSub = ringScore;
    statCards = [
      { value: `${result.totalScore}/${result.maxScore}`, label: 'Score' },
      { value: `${result.correct}/${result.totalQuestions}`, label: 'Correct' },
      { value: timeSpent, label: 'Time Spent' },
    ];
  }

  const perfLevel = getPerformanceLevel(result.percentage);
  const aiSummary = formativeFeedback?.aiFeedback?.summary?.trim();
  const sectionResults = category === 'thcs' ? result.thcsData?.sectionResults || [] : [];
  const visibleSectionResults = showAllSections ? sectionResults : sectionResults.slice(0, 3);
  const hasExtraSections = sectionResults.length > 3;

  return (
    <div className="ov-root" data-testid="ov-root">
      <div className="ov-score-header fade-in-d1" data-testid="ov-score-header">
        <ScoreRing
          value={ringValue}
          color={ringColor}
          centerText={ringCenter}
          subText={ringSub}
        />
        <div className="ov-stat-cards">
          {statCards.map((card, index) => (
            <StatCard key={index} value={card.value} label={card.label} />
          ))}
        </div>
      </div>

      {questions.length > 0 ? (
        <div className="ov-answer-map fade-in-d3" data-testid="ov-answer-map">
          <div className="ov-answer-map-header">
            <div className="ov-answer-map-title">Answer Map</div>
            <div className="ov-answer-map-summary">
              <span><span className="ov-answer-map-dot ov-answer-map-dot--correct" /> {answerMapStats.correct} correct</span>
              <span><span className="ov-answer-map-dot ov-answer-map-dot--incorrect" /> {answerMapStats.incorrect} incorrect</span>
              {answerMapStats.partial > 0 ? (
                <span><span className="ov-answer-map-dot ov-answer-map-dot--partial" /> {answerMapStats.partial} partial</span>
              ) : null}
            </div>
          </div>
          <AnswerMapLegend hasPartial={hasPartial} />
          <div className="ov-pill-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
            {questions.map((question) => {
              const status = getPillStatus(question);
              const isClickable = status === 'incorrect' || status === 'partial';

              return (
                <button
                  key={question.questionNumber}
                  className={`ov-pill ov-pill--${status} ${isClickable ? 'ov-pill--clickable' : ''}`}
                  onClick={isClickable ? () => goToQuestion(question.questionNumber) : undefined}
                  data-tooltip={isClickable ? 'Click to review' : undefined}
                  style={{ cursor: isClickable ? 'pointer' : 'default' }}
                  aria-label={`Question ${question.questionNumber} - ${status}`}
                  data-testid={`ov-pill-${question.questionNumber}`}
                >
                  {question.questionNumber}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {category === 'thcs' && sectionResults.length > 0 ? (
        <div className="ov-section-cards fade-in-d3" data-testid="ov-thcs-sections">
          <h3 className="ov-section-title">Performance by Section</h3>
          {visibleSectionResults.map((section, index) => (
            <div key={index} className="ov-section-card">
              <div className="ov-section-card-row">
                <span className="ov-section-name">{section.sectionName || `Section ${index + 1}`}</span>
                <div className="ov-section-bar-track">
                  <div
                    className="ov-section-bar-fill"
                    style={{
                      width: `${section.totalCount > 0 ? (section.correctCount / section.totalCount) * 100 : 0}%`,
                      background: getIntentColor(section.totalCount > 0 ? (section.correctCount / section.totalCount) * 100 : 0),
                    }}
                  />
                </div>
                <span className="ov-section-score">{section.correctCount}/{section.totalCount}</span>
              </div>
            </div>
          ))}
          {hasExtraSections ? (
            <button
              type="button"
              className="ov-section-toggle"
              onClick={() => setShowAllSections((prev) => !prev)}
              data-testid="ov-sections-toggle"
            >
              {showAllSections ? 'Show fewer sections' : `Show all ${sectionResults.length} sections`}
            </button>
          ) : null}
        </div>
      ) : null}

      {(category === 'ielts-reading' || category === 'ielts-listening') && result.ieltsData?.passageResults ? (
        <div className="ov-passage-cards fade-in-d3" data-testid="ov-ielts-passages">
          <h3 className="ov-section-title">Passage Breakdown</h3>
          {result.ieltsData.passageResults.map((passage, index) => (
            <div key={index} className="ov-section-card">
              <div className="ov-section-card-row">
                <span className="ov-section-name">{passage.passageName || `Passage ${index + 1}`}</span>
                <div className="ov-section-bar-track">
                  <div
                    className="ov-section-bar-fill"
                    style={{
                      width: `${passage.total > 0 ? (passage.correct / passage.total) * 100 : 0}%`,
                      background: getIntentColor(passage.total > 0 ? (passage.correct / passage.total) * 100 : 0),
                    }}
                  />
                </div>
                <span className="ov-section-score">{passage.correct}/{passage.total}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {aiSummary ? (
        <div className={`ov-perf-card fade-in-d4 ${perfLevel.bgClass}`} data-testid="ov-perf-card">
          <span className="ov-perf-icon">{perfLevel.icon}</span>
          <div className="ov-perf-copy">
            <span className="ov-perf-label">{perfLevel.label}</span>
            <p className="ov-perf-summary">{aiSummary}</p>
          </div>
        </div>
      ) : null}

      {!formativeFeedback && formativeFeedbackLoading ? (
        <div className="ov-feedback-shimmer fade-in-d4" data-testid="ov-feedback-shimmer">
          <div className="ov-shimmer-header">
            <div className="ov-shimmer-spinner" />
            <div>
              <div className="ov-shimmer-title">Generating personalized feedback...</div>
              <div className="ov-shimmer-sub">AI is analyzing your performance</div>
            </div>
          </div>
          {[85, 70, 55, 40].map((width, index) => (
            <div key={index} className="ov-shimmer-bar" style={{ width: `${width}%` }} />
          ))}
        </div>
      ) : !formativeFeedback && feedbackError ? (
        <div className="ov-feedback-error fade-in-d4" data-testid="ov-feedback-error">
          <div className="ov-error-info">
            <div className="ov-error-title">AI feedback unavailable</div>
            <div className="ov-error-sub">{feedbackError}</div>
          </div>
          {onRetryFeedback ? (
            <button className="ov-retry-btn" onClick={onRetryFeedback}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

    </div>
  );
};

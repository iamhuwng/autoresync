/**
 * FeedbackTab - PRD-0039 Task 8.0
 *
 * Left column (3fr): AI Performance Analysis, plus Score Trend when that creates a better visual balance
 * Right column (2fr): Study recommendations and remaining widgets
 * Mobile: single column stacked
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { TestResultRecord } from '../../services/testResults.service';
import type { FormativeFeedback, SkillAnalysis } from '../../types/thcs-test.types';
import { useHistoricalScores } from '../../hooks/useHistoricalScores';
import { useClassPosition } from '../../hooks/useClassPosition';
import { needsAiFeedbackUpgrade } from '../../services/formativeFeedback.service';
import { StudyRecommendations } from './StudyRecommendations';
import './FeedbackTab.css';

export interface FeedbackTabProps {
  result: TestResultRecord;
  feedbackLoading?: boolean;
  feedbackError?: string | null;
  onRetryFeedback?: () => void;
  isEligibleForAIFeedback?: boolean;
}

interface AnalysisSectionProps {
  title: string;
  content: string;
  icon: string;
  tone: 'strengths' | 'revision' | 'practice';
  items: SkillAnalysis[];
}

function formatAnalysisBullet(entry: SkillAnalysis): string {
  const wrongQuestionNumbers = Array.isArray(entry.wrongQuestionNumbers)
    ? entry.wrongQuestionNumbers
    : [];

  const questionSuffix = wrongQuestionNumbers.length > 0
    ? ` - Questions ${wrongQuestionNumbers.join(', ')}`
    : '';

  return `${entry.skillName} - ${Math.round(entry.percentage)}%${questionSuffix}`;
}

const AnalysisSection: React.FC<AnalysisSectionProps> = ({ title, icon, content, tone, items }) => (
  <div className={`fb-analysis-section fb-analysis-section--${tone}`}>
    <div className="fb-analysis-header">
      <span className="fb-analysis-icon">{icon}</span>
      <span className="fb-analysis-title">{title}</span>
    </div>
    {items.length > 0 ? (
      <div className="fb-analysis-bullets">
        {items.map((entry) => (
          <div className="fb-analysis-bullet" key={`${tone}-${entry.intent}-${entry.skillName}`}>
            <span className="fb-analysis-bullet-icon">●</span>
            <span>{formatAnalysisBullet(entry)}</span>
          </div>
        ))}
      </div>
    ) : null}
    <p className="fb-analysis-note">{content}</p>
  </div>
);

const AIPerformanceAnalysis: React.FC<{
  feedback: FormativeFeedback;
  containerRef?: React.Ref<HTMLDivElement>;
}> = ({ feedback, containerRef }) => {
  const ai = feedback.aiFeedback;
  if (!ai) return null;

  return (
    <div ref={containerRef} className="fb-analysis-card" data-testid="fb-ai-analysis">
      <h3 className="fb-card-title">
        <span>🤖</span> AI Performance Analysis
      </h3>
      {ai.summary ? (
        <p className="fb-analysis-summary">{ai.summary}</p>
      ) : null}
      <div className="fb-analysis-sections">
        {ai.strengths ? (
          <AnalysisSection
            title="Strengths"
            icon="✅"
            content={ai.strengths}
            tone="strengths"
            items={feedback.analysis?.strengths || []}
          />
        ) : null}
        {ai.revision ? (
          <AnalysisSection
            title="Areas for Improvement"
            icon="⚠️"
            content={ai.revision}
            tone="revision"
            items={feedback.analysis?.revision || []}
          />
        ) : null}
        {ai.critical ? (
          <AnalysisSection
            title="Recommended Practice"
            icon="📚"
            content={ai.critical}
            tone="practice"
            items={feedback.analysis?.critical || []}
          />
        ) : null}
      </div>
    </div>
  );
};

function getBarColor(pct: number): string {
  if (pct >= 70) return '#059669';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

function formatDate(timestamp: number | string | undefined): string {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'string' ? timestamp : timestamp);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const ScoreTrendWidget: React.FC<{
  scores: TestResultRecord[];
  currentResultId: string;
  loading: boolean;
  containerRef?: React.Ref<HTMLDivElement>;
}> = ({ scores, currentResultId, loading, containerRef }) => {
  if (loading) {
    return <div ref={containerRef} className="fb-widget-card fb-shimmer-card" data-testid="fb-trend-loading" />;
  }

  if (scores.length === 0) {
    return null;
  }

  let trendLabel = '';
  let trendIcon = '';

  if (scores.length === 1) {
    trendLabel = 'Need more results to show a trend';
  } else {
    const first = scores[0]?.percentage ?? 0;
    const last = scores[scores.length - 1]?.percentage ?? 0;
    const diff = last - first;

    if (diff > 2) {
      trendLabel = 'Improving';
      trendIcon = '📈';
    } else if (diff < -2) {
      trendLabel = 'Declining';
      trendIcon = '📉';
    } else {
      trendLabel = 'Stable';
      trendIcon = '➡️';
    }
  }

  return (
    <div ref={containerRef} className="fb-widget-card" data-testid="fb-score-trend">
      <h4 className="fb-widget-title">Score Trend</h4>
      {trendIcon ? (
        <div className="fb-trend-badge" data-testid="fb-trend-badge">
          <span>{trendIcon}</span>
          <span>{trendLabel}</span>
        </div>
      ) : null}
      <div className="fb-bar-chart">
        {scores.map((score) => {
          const pct = score.percentage ?? 0;
          const isCurrent = score.resultId === currentResultId;
          const color = getBarColor(pct);

          return (
            <div key={score.resultId} className="fb-bar-col">
              <div
                className="fb-bar"
                style={{
                  height: `${Math.max((pct / 100) * 80, 4)}px`,
                  background: color,
                  opacity: isCurrent ? 1 : 0.6,
                  borderBottom: isCurrent ? `2px solid ${color}` : 'none',
                }}
                title={`${pct.toFixed(0)}%`}
              />
              <span className={`fb-bar-value ${isCurrent ? 'fb-bar-value--current' : ''}`}>{pct.toFixed(0)}%</span>
              <span className="fb-bar-label">{formatDate(score.submittedAt)}</span>
            </div>
          );
        })}
      </div>
      {scores.length === 1 ? (
        <p className="fb-trend-helper">{trendLabel}</p>
      ) : null}
    </div>
  );
};

const ClassPositionWidget: React.FC<{
  position: 'above' | 'at' | 'below' | null;
  average: number | null;
  totalStudents: number;
  studentPct: number;
  loading: boolean;
  classId: string | undefined;
  containerRef?: React.Ref<HTMLDivElement>;
}> = ({ position, average, totalStudents, studentPct, loading, classId, containerRef }) => {
  if (!classId) {
    return null;
  }

  if (loading) {
    return <div ref={containerRef} className="fb-widget-card fb-shimmer-card" data-testid="fb-class-loading" />;
  }

  const posConfig = {
    above: { label: 'Above Average', icon: '🟢', color: '#059669' },
    at: { label: 'At Average', icon: '➖', color: '#6b7280' },
    below: { label: 'Below Average', icon: '🔴', color: '#dc2626' },
  };

  const config = position ? posConfig[position] : null;

  return (
    <div ref={containerRef} className="fb-widget-card" data-testid="fb-class-position">
      <h4 className="fb-widget-title">Class Position</h4>
      <div className="fb-class-rows">
        <div className="fb-class-row">
          <span className="fb-class-key">Your score</span>
          <span className="fb-class-main-score">{studentPct.toFixed(0)}%</span>
        </div>
        {average != null ? (
          <div className="fb-class-row">
            <span className="fb-class-key">Class average</span>
            <span className="fb-class-value">Class average: {average.toFixed(0)}%</span>
          </div>
        ) : null}
      </div>
      {totalStudents <= 1 ? (
        <p className="fb-class-helper">Only student in this test</p>
      ) : config ? (
        <div className="fb-class-badge" style={{ color: config.color }}>
          <span>{config.icon}</span> {config.label}
        </div>
      ) : null}
    </div>
  );
};

const feedbackRetryButtonStyle: React.CSSProperties = {
  marginTop: '0.75rem',
  border: '1px solid rgba(79,70,229,0.22)',
  borderRadius: '999px',
  padding: '0.55rem 0.95rem',
  background: 'rgba(79,70,229,0.08)',
  color: '#4338ca',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const FeedbackStateCard: React.FC<{
  title: string;
  body: string;
  icon: string;
  containerRef?: React.Ref<HTMLDivElement>;
  loading?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  testId: string;
}> = ({ title, body, icon, containerRef, loading = false, onRetry, retryLabel = 'Retry AI Feedback', testId }) => (
  <div ref={containerRef} className="fb-no-feedback" data-testid={testId}>
    <span className="fb-no-icon">{icon}</span>
    <p className="fb-no-text" style={{ marginBottom: 0 }}>{title}</p>
    <p className="fb-no-text" style={{ fontSize: '0.85rem', maxWidth: '42ch', color: '#64748b' }}>{body}</p>
    {!loading && onRetry ? (
      <button type="button" style={feedbackRetryButtonStyle} onClick={onRetry}>
        {retryLabel}
      </button>
    ) : null}
  </div>
);

export const FeedbackTab: React.FC<FeedbackTabProps> = ({
  result,
  feedbackLoading = false,
  feedbackError = null,
  onRetryFeedback,
  isEligibleForAIFeedback = false,
}) => {
  const formativeFeedback = (result as any).formativeFeedback as FormativeFeedback | undefined;
  const primaryLeftRef = useRef<HTMLDivElement | null>(null);
  const recommendationsRef = useRef<HTMLDivElement | null>(null);
  const trendRef = useRef<HTMLDivElement | null>(null);
  const classPositionRef = useRef<HTMLDivElement | null>(null);
  const [trendColumn, setTrendColumn] = useState<'left' | 'right'>('right');

  const { scores, loading: scoresLoading } = useHistoricalScores(
    result.studentId,
    result,
  );

  const classId = (result as any).classId || (result.context as any)?.classId;
  const { average, totalStudents, position, loading: classLoading } = useClassPosition(
    result.testId,
    classId,
    result.percentage,
  );

  const hasStoredFeedback = !!formativeFeedback;
  const hasAIFeedback = !!formativeFeedback?.aiFeedback;
  const needsFeedbackUpgrade = hasStoredFeedback
    && needsAiFeedbackUpgrade(formativeFeedback, result.questionResults as any, result);
  const storedFeedbackBody = formativeFeedback?.deterministicFeedback?.trim()
    || 'This result already has saved formative feedback. Additional AI generation is locked for this result.';
  const feedbackRetryLabel = needsFeedbackUpgrade ? 'Retry AI Feedback' : 'Generate AI Feedback';
  const showTrendWidget = scoresLoading || scores.length > 0;
  const showClassPosition = !!classId;

  useLayoutEffect(() => {
    const stackGapPx = 16;
    const rightHeavyThresholdPx = 120;
    const improvementThresholdPx = 48;

    const getStackHeight = (nodes: Array<HTMLDivElement | null>) => {
      const visibleNodes = nodes.filter(
        (node): node is HTMLDivElement => Boolean(node && node.offsetHeight > 0),
      );

      if (visibleNodes.length === 0) {
        return 0;
      }

      return visibleNodes.reduce((sum, node) => sum + node.offsetHeight, 0)
        + (visibleNodes.length - 1) * stackGapPx;
    };

    const measureTrendPlacement = () => {
      const trendHeight = trendRef.current?.offsetHeight ?? 0;

      if (trendHeight === 0) {
        setTrendColumn('right');
        return;
      }

      const leftBaseHeight = getStackHeight([primaryLeftRef.current]);
      const rightWithTrendHeight = getStackHeight([
        recommendationsRef.current,
        trendRef.current,
        classPositionRef.current,
      ]);
      const leftWithTrendHeight = getStackHeight([primaryLeftRef.current, trendRef.current]);
      const rightWithoutTrendHeight = getStackHeight([
        recommendationsRef.current,
        classPositionRef.current,
      ]);

      const currentImbalance = Math.abs(rightWithTrendHeight - leftBaseHeight);
      const rebalancedImbalance = Math.abs(rightWithoutTrendHeight - leftWithTrendHeight);
      const shouldMoveTrendLeft = rightWithTrendHeight > leftBaseHeight + rightHeavyThresholdPx
        && rebalancedImbalance + improvementThresholdPx < currentImbalance;

      setTrendColumn((currentColumn) => {
        const nextColumn = shouldMoveTrendLeft ? 'left' : 'right';
        return currentColumn === nextColumn ? currentColumn : nextColumn;
      });
    };

    measureTrendPlacement();

    const timerId = globalThis.setTimeout(measureTrendPlacement, 0);
    let observer: ResizeObserver | null = null;

    if (typeof globalThis.ResizeObserver !== 'undefined') {
      observer = new globalThis.ResizeObserver(() => {
        measureTrendPlacement();
      });

      [
        primaryLeftRef.current,
        recommendationsRef.current,
        trendRef.current,
        classPositionRef.current,
      ].forEach((node) => {
        if (node) {
          observer?.observe(node);
        }
      });
    }

    return () => {
      globalThis.clearTimeout(timerId);
      observer?.disconnect();
    };
  }, [
    formativeFeedback,
    scores,
    scoresLoading,
    classId,
    classLoading,
    average,
    totalStudents,
    position,
  ]);

  return (
    <div className="fb-root">
      <div className="fb-layout">
        <div className="fb-left" data-testid="fb-left-column">
          {hasAIFeedback ? (
            <>
              {needsFeedbackUpgrade ? (
                <FeedbackStateCard
                  title="Question explanations still need an AI refresh"
                  body={feedbackError || 'The saved AI summary exists, but some question explanations are still weak or fallback-based. Retry AI to refresh the detailed reasoning.'}
                  icon="ðŸ¤–"
                  onRetry={onRetryFeedback}
                  retryLabel="Retry AI Feedback"
                  testId="fb-feedback-upgrade"
                />
              ) : null}
              <AIPerformanceAnalysis feedback={formativeFeedback!} containerRef={primaryLeftRef} />
            </>
          ) : hasStoredFeedback ? (
            <FeedbackStateCard
              title={needsFeedbackUpgrade ? 'Saved feedback still needs an AI upgrade' : 'Feedback already saved for this result'}
              body={needsFeedbackUpgrade
                ? (feedbackError || 'This result is still showing saved fallback feedback or weak explanations. Retry AI to replace it with full contextual analysis.')
                : storedFeedbackBody}
              icon="📝"
              containerRef={primaryLeftRef}
              onRetry={needsFeedbackUpgrade ? onRetryFeedback : undefined}
              retryLabel={feedbackRetryLabel}
              testId="fb-feedback-stored"
            />
          ) : feedbackLoading ? (
            <FeedbackStateCard
              title="Generating AI feedback..."
              body="The result modal is still waiting for AI analysis to finish. Question review remains available while this runs."
              icon="⌛"
              containerRef={primaryLeftRef}
              loading
              testId="fb-feedback-loading"
            />
          ) : feedbackError ? (
            <FeedbackStateCard
              title="AI feedback unavailable"
              body={feedbackError}
              icon="⚠️"
              containerRef={primaryLeftRef}
              onRetry={onRetryFeedback}
              retryLabel="Generate AI Feedback"
              testId="fb-feedback-error"
            />
          ) : isEligibleForAIFeedback ? (
            <FeedbackStateCard
              title="AI analysis has not been generated yet"
              body="This result is eligible for AI feedback, but there is no AI summary saved for it yet. You can retry the generation now."
              icon="🤖"
              containerRef={primaryLeftRef}
              onRetry={onRetryFeedback}
              retryLabel="Generate AI Feedback"
              testId="fb-feedback-missing"
            />
          ) : (
            <div ref={primaryLeftRef} className="fb-no-feedback" data-testid="fb-no-analysis">
              <span className="fb-no-icon">🤖</span>
              <p className="fb-no-text">AI feedback is not yet available for this result.</p>
            </div>
          )}

          {showTrendWidget && trendColumn === 'left' ? (
            <ScoreTrendWidget
              scores={scores}
              currentResultId={result.resultId}
              loading={scoresLoading}
              containerRef={trendRef}
            />
          ) : null}
        </div>

        <div className="fb-right" data-testid="fb-right-column">
          {formativeFeedback ? (
            <StudyRecommendations
              formativeFeedback={formativeFeedback}
              containerRef={recommendationsRef}
            />
          ) : null}

          {showTrendWidget && trendColumn === 'right' ? (
            <ScoreTrendWidget
              scores={scores}
              currentResultId={result.resultId}
              loading={scoresLoading}
              containerRef={trendRef}
            />
          ) : null}

          {showClassPosition ? (
            <ClassPositionWidget
              position={position}
              average={average}
              totalStudents={totalStudents}
              studentPct={result.percentage}
              loading={classLoading}
              classId={classId}
              containerRef={classPositionRef}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

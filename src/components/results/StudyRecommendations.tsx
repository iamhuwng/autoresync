import React from 'react';
import type { FormativeFeedback, StudyRecommendation } from '../../types/thcs-test.types';

export interface StudyRecommendationsProps {
  formativeFeedback?: FormativeFeedback;
  containerRef?: React.Ref<HTMLDivElement>;
}

function toTestIdSlug(value: string, index: number): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `rec-${index + 1}`;
}

function formatQuestionNumbers(questionNumbers: number[]): string {
  return questionNumbers.map((questionNumber) => `Q${questionNumber}`).join(', ');
}

interface NormalizedStudyRecommendation extends StudyRecommendation {
  questionNumbers: number[];
  focusLabel: string;
}

function deriveFocusLabel(guidance: string, skillTag: string): string {
  const lower = guidance.toLowerCase();

  if (lower.includes('tense')) return 'Tense';
  if (lower.includes('evidence') || lower.includes('keyword') || lower.includes('clue')) return 'Evidence';
  if (lower.includes('structure') || lower.includes('rewrite')) return 'Structure';
  if (lower.includes('scan') || lower.includes('scanning')) return 'Scanning';
  if (lower.includes('vocabulary')) return 'Vocabulary';
  if (lower.includes('grammar')) return 'Grammar';

  const compactSkill = skillTag.split(/\s+/).slice(0, 2).join(' ').trim();
  return compactSkill || 'Focus';
}

function normalizeRecommendation(rawRecommendation: unknown): NormalizedStudyRecommendation | null {
  if (!rawRecommendation || typeof rawRecommendation !== 'object') {
    return null;
  }

  const recommendation = rawRecommendation as Record<string, unknown>;
  const skillTag = String(recommendation.skillTag || recommendation.label || 'Study Focus').trim();
  const guidance = String(recommendation.guidance || '').trim();
  const questionNumbers = Array.isArray(recommendation.questionNumbers)
    ? recommendation.questionNumbers
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  const resources = Array.isArray(recommendation.resources)
    ? recommendation.resources
        .map((rawResource) => {
          if (!rawResource || typeof rawResource !== 'object') {
            return null;
          }

          const resource = rawResource as Record<string, unknown>;
          const bookTitle = String(resource.bookTitle || '').trim();
          const author = String(resource.author || '').trim();
          const sectionTitle = String(resource.sectionTitle || '').trim();
          const reason = String(resource.reason || '').trim();

          if (!bookTitle || !author || !sectionTitle || !reason) {
            return null;
          }

          return {
            bookTitle,
            author,
            sectionTitle,
            reason,
          };
        })
        .filter((resource): resource is NormalizedStudyRecommendation['resources'][number] => Boolean(resource))
    : [];

  if (!skillTag || !guidance || resources.length === 0) {
    return null;
  }

  return {
    skillTag,
    guidance,
    questionNumbers: Array.from(new Set(questionNumbers)).sort((left, right) => left - right),
    focusLabel: deriveFocusLabel(guidance, skillTag),
    resources,
  };
}

function getVisibleRecommendations(formativeFeedback?: FormativeFeedback): NormalizedStudyRecommendation[] {
  if (!Array.isArray(formativeFeedback?.studyRecommendations)) {
    return [];
  }

  return formativeFeedback.studyRecommendations
    .map((recommendation) => normalizeRecommendation(recommendation))
    .filter((recommendation): recommendation is NormalizedStudyRecommendation => Boolean(recommendation))
    .slice(0, 3);
}

export const StudyRecommendations: React.FC<StudyRecommendationsProps> = ({
  formativeFeedback,
  containerRef,
}) => {
  const recommendations = getVisibleRecommendations(formativeFeedback);

  if (recommendations.length === 0) {
    return null;
  }

  const isStretchSet = recommendations.every((recommendation) => recommendation.questionNumbers.length === 0);

  return (
    <div
      ref={containerRef}
      className={`fb-recommendations-card ${isStretchSet ? 'fb-recommendations-card--perfect' : ''}`}
      data-testid="fb-study-recommendations"
    >
      <div className="fb-recommendations-header">
        <h3 className="fb-card-title">
          <span>📚</span> What to Study Next
        </h3>
        <span className="fb-recommendations-badge">
          {isStretchSet ? 'Stretch targets' : 'Top priorities'}
        </span>
      </div>
      <div className="fb-recommendation-list">
        {recommendations.map((recommendation, index) => {
          const cardSlug = toTestIdSlug(recommendation.skillTag, index);
          const primaryResource = recommendation.resources[0];
          const extraResources = recommendation.resources.slice(1);
          const visibleQuestionNumbers = recommendation.questionNumbers.slice(0, 3);
          const hiddenQuestionCount = Math.max(recommendation.questionNumbers.length - visibleQuestionNumbers.length, 0);

          return (
            <details
              className="fb-recommendation-item fb-recommendation-item--compact"
              key={`${cardSlug}-${index}`}
              data-testid={`fb-study-card-${cardSlug}`}
            >
              <summary className="fb-recommendation-summary">
                <div className="fb-recommendation-priority">{index + 1}</div>
                <div className="fb-recommendation-main">
                  <div className="fb-recommendation-head">
                    <span className="fb-recommendation-tag">{recommendation.skillTag}</span>
                    <span className="fb-recommendation-focus">{recommendation.focusLabel}</span>
                    {visibleQuestionNumbers.length > 0 ? (
                      <div className="fb-question-chip-row" aria-label={formatQuestionNumbers(recommendation.questionNumbers)}>
                        {visibleQuestionNumbers.map((questionNumber) => (
                          <span className="fb-question-chip" key={`${cardSlug}-q-${questionNumber}`}>
                            Q{questionNumber}
                          </span>
                        ))}
                        {hiddenQuestionCount > 0 ? (
                          <span className="fb-question-chip fb-question-chip--more">+{hiddenQuestionCount}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="fb-recommendation-start">
                    <span className="fb-recommendation-start-label">Start:</span>
                    <span className="fb-recommendation-start-unit">{primaryResource.sectionTitle}</span>
                    <span className="fb-recommendation-start-book">{primaryResource.author}</span>
                  </div>
                </div>
                <div className="fb-recommendation-expand">
                  {extraResources.length > 0 ? `+${extraResources.length}` : 'Why'}
                </div>
              </summary>

              <div className="fb-recommendation-details">
                <p className="fb-recommendation-guidance">
                  <strong>Why:</strong> {recommendation.guidance}
                </p>

                <div className="fb-book-chip fb-book-chip--primary">
                  <div className="fb-book-title-row">
                    <strong className="fb-book-title">{primaryResource.sectionTitle}</strong>
                    <span className="fb-book-author">{primaryResource.bookTitle}</span>
                  </div>
                  <span className="fb-book-focus">{primaryResource.reason}</span>
                </div>

                {extraResources.length > 0 ? (
                  <div className="fb-recommendation-books">
                    {extraResources.map((resource, resourceIndex) => (
                      <div className="fb-book-chip" key={`${resource.bookTitle}-${resource.sectionTitle}-${resourceIndex}`}>
                        <div className="fb-book-title-row">
                          <strong className="fb-book-title">{resource.sectionTitle}</strong>
                          <span className="fb-book-author">{resource.bookTitle}</span>
                        </div>
                        <span className="fb-book-focus">{resource.reason}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
};

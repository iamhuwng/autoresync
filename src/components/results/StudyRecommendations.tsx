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
      <h3 className="fb-card-title">
        <span>📚</span> What to Study Next
      </h3>
      <p className="fb-recommendations-intro">
        {isStretchSet
          ? 'These AI suggestions keep you moving forward with specific stretch targets from your approved book library.'
          : 'These AI suggestions connect the exact mistakes in this result to specific chapters, units, and sections from your approved book library.'}
      </p>
      <div className="fb-recommendation-list">
        {recommendations.map((recommendation, index) => {
          const cardSlug = toTestIdSlug(recommendation.skillTag, index);

          return (
            <article className="fb-recommendation-item" key={`${cardSlug}-${index}`} data-testid={`fb-study-card-${cardSlug}`}>
              <div className="fb-recommendation-head">
                <span className="fb-recommendation-tag">{recommendation.skillTag}</span>
                {recommendation.questionNumbers.length > 0 ? (
                  <span className="fb-recommendation-questions">{formatQuestionNumbers(recommendation.questionNumbers)}</span>
                ) : null}
              </div>
              <p className="fb-recommendation-guidance">{recommendation.guidance}</p>
              <div className="fb-recommendation-books">
                {recommendation.resources.map((resource, resourceIndex) => (
                  <div className="fb-book-chip" key={`${resource.bookTitle}-${resource.sectionTitle}-${resourceIndex}`}>
                    <div className="fb-book-title-row">
                      <strong className="fb-book-title">{resource.bookTitle}</strong>
                      <span className="fb-book-author">{resource.author}</span>
                    </div>
                    <span className="fb-book-section">{resource.sectionTitle}</span>
                    <span className="fb-book-focus">{resource.reason}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

import { useEffect } from 'react';
import { READING_V2_ENGINE, READING_V2_PRODUCT_LABEL } from '../../config/readingV2FeatureFlags';
import type {
  ReadingV2GroupedReviewPayload,
  ReadingV2ReviewTaskGroup,
} from '../../services/reading-v2/readingV2ResultAdapter.service';

export type ReadingV2ReviewContentVariant = 'teacher' | 'student';

export interface ReadingV2OpaqueReviewPayload {
  readonly deliveryEngine?: string;
  readonly [key: string]: unknown;
}

export interface ReadingV2ReviewContentAdapterProps {
  readonly resultId?: string;
  readonly variant?: ReadingV2ReviewContentVariant;
  readonly reviewPayload?: ReadingV2OpaqueReviewPayload | ReadingV2GroupedReviewPayload;
}

const DIAG_PREFIX = '[Diag][ReadingV2ResultReview]';

const logDiag = (event: string, payload: Record<string, unknown>): void => {
  if (
    !import.meta.env.DEV
    || typeof window === 'undefined'
    || !window.location.search.includes('readingV2ResultDiag=1')
  ) {
    return;
  }

  console.log(`${DIAG_PREFIX} ${event}`, payload);
};

const formatAnswer = (answer: unknown): string => {
  if (answer == null || answer === '') {
    return 'No answer';
  }

  if (Array.isArray(answer)) {
    return answer.join(', ');
  }

  if (typeof answer === 'object') {
    return JSON.stringify(answer);
  }

  return String(answer);
};

const isReadingV2ReviewPayload = (
  payload: ReadingV2ReviewContentAdapterProps['reviewPayload'],
): payload is ReadingV2GroupedReviewPayload =>
  payload?.deliveryEngine === READING_V2_ENGINE
  && Array.isArray(payload.taskGroups);

const groupScore = (taskGroup: ReadingV2ReviewTaskGroup): string => {
  const score = taskGroup.interactions.reduce((total, interaction) => total + interaction.score, 0);
  const maxScore = taskGroup.interactions.reduce((total, interaction) => total + interaction.maxScore, 0);
  return `${score}/${maxScore}`;
};

const hasStimulusContext = (taskGroup: ReadingV2ReviewTaskGroup): boolean =>
  Array.isArray(taskGroup.stimulusContext) && taskGroup.stimulusContext.length > 0;

export function ReadingV2ReviewContentAdapter(
  props: ReadingV2ReviewContentAdapterProps,
) {
  useEffect(() => {
    logDiag('review_adapter_rendered', {
      resultId: props.resultId ?? null,
      variant: props.variant ?? 'teacher',
      hasPayload: isReadingV2ReviewPayload(props.reviewPayload),
      taskGroupCount: isReadingV2ReviewPayload(props.reviewPayload)
        ? props.reviewPayload.taskGroups.length
        : 0,
    });
  }, [props.resultId, props.reviewPayload, props.variant]);

  if (!isReadingV2ReviewPayload(props.reviewPayload)) {
    return (
      <div data-testid="reading-v2-review-empty" style={{ padding: '1rem', color: '#64748b' }}>
        No Reading V2 review content is available for this result.
      </div>
    );
  }

  const showCorrectAnswers = props.variant !== 'student'
    || props.reviewPayload.taskGroups.some((taskGroup) =>
      taskGroup.interactions.some((interaction) => interaction.reviewState === 'released'),
    );

  return (
    <div
      data-testid="reading-v2-review-adapter"
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.875rem 1rem',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          background: '#f8fafc',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            {READING_V2_PRODUCT_LABEL} Review
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            {props.reviewPayload.title}
          </div>
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#475569', textAlign: 'right' }}>
          Snapshot {props.reviewPayload.sourceSnapshotVersionId}
        </div>
      </div>

      {props.reviewPayload.taskGroups.map((taskGroup) => (
        <section
          key={taskGroup.taskGroupId}
          data-testid={`reading-v2-review-group-${taskGroup.taskGroupId}`}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#ffffff',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
                {taskGroup.title || taskGroup.officialTaskType.replace(/-/g, ' ')}
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
                {taskGroup.instructionText}
              </div>
              {hasStimulusContext(taskGroup) ? (
                <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                  {taskGroup.stimulusContext.map((stimulus) => (
                    <div
                      key={stimulus.stimulusId}
                      data-testid={`reading-v2-review-stimulus-${stimulus.stimulusId}`}
                      style={{
                        padding: '0.625rem 0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                        {stimulus.title || stimulus.kind.replace(/-/g, ' ')}
                      </div>
                      {stimulus.anchorLabels.length > 0 ? (
                        <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: '#64748b' }}>
                          {stimulus.anchorLabels.join(', ')}
                        </div>
                      ) : null}
                      <div style={{ marginTop: '0.35rem', fontSize: '0.8125rem', color: '#334155', lineHeight: 1.5 }}>
                        {stimulus.excerpt}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#334155' }}>
              {groupScore(taskGroup)}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem' }}>
            {taskGroup.interactions.map((interaction) => (
              <article
                key={interaction.interactionId}
                id={`reading-v2-qcard-${interaction.displayNumber}`}
                data-testid={`reading-v2-review-interaction-${interaction.displayNumber}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(42px, auto) 1fr',
                  gap: '0.75rem',
                  alignItems: 'start',
                  padding: '0.875rem',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    display: 'grid',
                    placeItems: 'center',
                    background: interaction.score >= interaction.maxScore ? '#dcfce7' : '#fee2e2',
                    color: interaction.score >= interaction.maxScore ? '#166534' : '#991b1b',
                    fontWeight: 800,
                  }}
                >
                  {interaction.displayNumber}
                </div>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8125rem' }}>
                    <span>{interaction.officialTaskType.replace(/-/g, ' ')}</span>
                    <strong>{interaction.score}/{interaction.maxScore}</strong>
                  </div>
                  <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#334155' }}>
                    <div>
                      <strong>Your answer:</strong> {formatAnswer(interaction.studentAnswer)}
                    </div>
                    {showCorrectAnswers && interaction.reviewState === 'released' ? (
                      <div>
                        <strong>Correct answer:</strong> {formatAnswer(interaction.correctAnswer)}
                      </div>
                    ) : (
                      <div data-testid={`reading-v2-review-withheld-${interaction.displayNumber}`}>
                        Correct answer is hidden until release.
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

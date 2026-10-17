import { useState } from 'react';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import {
  MAX_LONG_RESPONSE_TEXT_LENGTH,
  type LongResponseResponse,
} from '../../../../services/book-activity/runtime/codecs/longResponseResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import './LongResponseRenderer.css';

export const MAX_LONG_RESPONSE_CHARACTERS = MAX_LONG_RESPONSE_TEXT_LENGTH;
export const MAX_LONG_RESPONSE_WORDS = 4_000;

type LongResponseInteraction = Extract<StudentActivityInteraction, { family: 'long-response' }>;

export interface LongResponseRendererProps extends ActivityRendererProps<LongResponseResponse | null> {
  disabled?: boolean;
  pendingReview?: boolean;
  reviewText?: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const domId = (prefix: string, value: string): string =>
  `${prefix}-${encodeURIComponent(value).replaceAll('%', '_')}`;

const interactionIsValid = (
  value: StudentActivityInteraction,
): value is LongResponseInteraction =>
  value.family === 'long-response' &&
  isNonEmptyString(value.interactionId) &&
  isNonEmptyString(value.prompt);

const responseIsValid = (
  value: LongResponseResponse | null,
  interactionId: string,
): boolean =>
  value === null ||
  (
    value.interactionId === interactionId &&
    typeof value.text === 'string' &&
    value.text.length <= MAX_LONG_RESPONSE_CHARACTERS
  );

const countWords = (value: string): number => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
};

const sourceDetails = (
  interaction: LongResponseInteraction,
  sourceContext: ActivityRendererProps<unknown>['sourceContext'],
): string[] => [
  sourceContext?.description,
  interaction.sourceAssisted?.accessiblePrompt,
  interaction.sourceAssisted?.questionLabel
    ? `Question ${interaction.sourceAssisted.questionLabel}`
    : undefined,
  interaction.sourceAssisted?.sourceExerciseLabel
    ? `Exercise ${interaction.sourceAssisted.sourceExerciseLabel}`
    : undefined,
  interaction.sourceAssisted?.sourcePartLabel
    ? `Part ${interaction.sourceAssisted.sourcePartLabel}`
    : undefined,
].filter(isNonEmptyString);

export function LongResponseRenderer({
  interaction: rawInteraction,
  response,
  validation,
  mode,
  sourceContext,
  onChange,
  disabled = false,
  pendingReview = false,
  reviewText,
}: LongResponseRendererProps) {
  const interaction = interactionIsValid(rawInteraction) ? rawInteraction : null;
  const [localError, setLocalError] = useState('');

  if (!interaction) return <p role="alert">Unsupported long-response activity.</p>;
  if (!responseIsValid(response, interaction.interactionId)) {
    return <p role="alert">Unsupported long-response response.</p>;
  }

  const text = response?.text ?? '';
  const source = sourceDetails(interaction, sourceContext);
  const sourceId = domId('long-response-source', interaction.interactionId);
  const errorId = domId('long-response-error', interaction.interactionId);
  const counterId = domId('long-response-counter', interaction.interactionId);
  const validationMessage = validation.status === 'invalid'
    ? validation.message?.trim() || 'Response needs review.'
    : null;
  const message = localError || validationMessage;
  const describedBy = [
    source.length > 0 ? sourceId : null,
    counterId,
    message ? errorId : null,
  ].filter(Boolean).join(' ');
  const locked = disabled || mode !== 'editable' || pendingReview;
  const update = (nextText: string) => {
    if (locked) return;
    const words = countWords(nextText);
    if (nextText.length > MAX_LONG_RESPONSE_CHARACTERS) {
      setLocalError(`Response cannot exceed ${MAX_LONG_RESPONSE_CHARACTERS.toLocaleString()} characters.`);
      return;
    }
    if (words > MAX_LONG_RESPONSE_WORDS) {
      setLocalError(`Response cannot exceed ${MAX_LONG_RESPONSE_WORDS.toLocaleString()} words.`);
      return;
    }
    setLocalError('');
    onChange({ interactionId: interaction.interactionId, text: nextText });
  };

  return (
    <section
      aria-describedby={describedBy}
      aria-label={interaction.prompt}
      aria-readonly={locked}
      className="book-long-response"
    >
      {source.length > 0 ? (
        <aside aria-label="Source correspondence" className="book-long-response__source" id={sourceId}>
          {source.map((detail, index) => <p key={`${detail}-${index}`}>{detail}</p>)}
        </aside>
      ) : null}
      <label htmlFor={`${sourceId}-input`}>{interaction.prompt}</label>
      <textarea
        aria-describedby={describedBy}
        aria-invalid={message ? true : undefined}
        aria-readonly={locked}
        className="book-long-response__input"
        disabled={disabled}
        id={`${sourceId}-input`}
        maxLength={MAX_LONG_RESPONSE_CHARACTERS}
        onChange={(event) => update(event.target.value)}
        readOnly={locked}
        rows={8}
        value={text}
      />
      <p aria-live="polite" className="book-long-response__counter" id={counterId}>
        {text.length.toLocaleString()} / {MAX_LONG_RESPONSE_CHARACTERS.toLocaleString()} characters · {countWords(text).toLocaleString()} / {MAX_LONG_RESPONSE_WORDS.toLocaleString()} words
      </p>
      {pendingReview || mode === 'review' ? (
        <p className="book-long-response__review" role="status">
          Pending review{reviewText ? `: ${reviewText}` : '.'}
        </p>
      ) : null}
      {message ? <p id={errorId} role="alert">{message}</p> : null}
    </section>
  );
}

export default LongResponseRenderer;

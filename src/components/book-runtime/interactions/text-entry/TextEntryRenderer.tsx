import type { ChangeEvent } from 'react';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type {
  TextEntryResponse,
} from '../../../../services/book-activity/runtime/codecs/textEntryResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import './TextEntryRenderer.css';

type TextEntryInteraction = Extract<StudentActivityInteraction, { family: 'text-entry' }>;

export const MAX_TEXT_ENTRY_LENGTH = 4_000;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const domId = (prefix: string, value: string): string =>
  `${prefix}-${encodeURIComponent(value).replaceAll('%', '_')}`;

const hasSourceCorrespondence = (
  interaction: TextEntryInteraction,
  sourceContext: ActivityRendererProps<unknown>['sourceContext'],
): boolean => [
  sourceContext?.description,
  interaction.sourceAssisted?.accessiblePrompt,
  interaction.sourceAssisted?.questionLabel,
  interaction.sourceAssisted?.sourceExerciseLabel,
  interaction.sourceAssisted?.sourcePartLabel,
].some(isNonEmptyString);

const SourceCorrespondence = ({
  interaction,
  sourceContext,
  id,
}: {
  interaction: TextEntryInteraction;
  sourceContext: ActivityRendererProps<unknown>['sourceContext'];
  id: string;
}) => {
  const source = interaction.sourceAssisted;
  const details = [
    sourceContext?.description,
    source?.accessiblePrompt,
    source?.questionLabel ? `Question ${source.questionLabel}` : undefined,
    source?.sourceExerciseLabel ? `Exercise ${source.sourceExerciseLabel}` : undefined,
    source?.sourcePartLabel ? `Part ${source.sourcePartLabel}` : undefined,
  ].filter(isNonEmptyString);
  if (details.length === 0) return null;
  return (
    <aside aria-label="Source correspondence" className="book-text-entry__source" id={id}>
      <p>Source correspondence</p>
      {details.map((detail, index) => <p key={`${detail}-${index}`}>{detail}</p>)}
    </aside>
  );
};

export interface TextEntryRendererProps extends ActivityRendererProps<TextEntryResponse | null> {}

function renderTextEntry({
  interaction,
  response,
  validation,
  mode,
  sourceContext,
  onChange,
}: TextEntryRendererProps, multiline: boolean) {
  if (interaction.family !== 'text-entry' || !isNonEmptyString(interaction.interactionId) || !isNonEmptyString(interaction.prompt)) {
    return <p role="alert">Unsupported text-entry activity.</p>;
  }
  if (
    response !== null &&
    (
      typeof response !== 'object' ||
      response.interactionId !== interaction.interactionId ||
      typeof response.text !== 'string' ||
      response.text.length > MAX_TEXT_ENTRY_LENGTH
    )
  ) {
    return <p role="alert">Unsupported text-entry response.</p>;
  }
  const responseText = response?.text ?? '';

  const sourceId = domId('text-entry-source', interaction.interactionId);
  const validationId = domId('text-entry-validation', interaction.interactionId);
  const validationMessage = validation.status === 'invalid'
    ? validation.message?.trim() || 'Response needs review.'
    : null;
  const describedBy = [
    hasSourceCorrespondence(interaction, sourceContext) ? sourceId : null,
    validationMessage ? validationId : null,
  ].filter(Boolean).join(' ') || undefined;
  const inputId = domId('text-entry-input', interaction.interactionId);
  const locked = mode !== 'editable';
  const commonProps = {
    'aria-describedby': describedBy,
    'aria-invalid': validationMessage ? true : undefined,
    'aria-readonly': locked,
    id: inputId,
    maxLength: MAX_TEXT_ENTRY_LENGTH,
    name: interaction.interactionId,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (mode !== 'editable' || event.target.value.length > MAX_TEXT_ENTRY_LENGTH) return;
      onChange({
        interactionId: interaction.interactionId,
        text: event.target.value,
      });
    },
    readOnly: locked,
    value: responseText,
  };

  return (
    <section className="book-text-entry" aria-describedby={describedBy} aria-label={interaction.prompt} aria-readonly={locked}>
      <SourceCorrespondence interaction={interaction} sourceContext={sourceContext} id={sourceId} />
      <label htmlFor={inputId}>{interaction.prompt}</label>
      {multiline ? <textarea {...commonProps} rows={4} /> : <input {...commonProps} type="text" />}
      {validationMessage ? <p id={validationId} role="alert">{validationMessage}</p> : null}
    </section>
  );
}

export function TextEntryRenderer(props: TextEntryRendererProps) {
  return renderTextEntry(props, false);
}

export function TextAreaEntryRenderer(props: TextEntryRendererProps) {
  return renderTextEntry(props, true);
}

export const TextEntryActivityRenderer = TextEntryRenderer;
export default TextEntryRenderer;

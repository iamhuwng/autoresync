import { useEffect, useState } from 'react';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type {
  ChoiceMultipleResponse,
  ChoiceSingleResponse,
} from '../../../../services/book-activity/runtime/codecs/choiceResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import './ChoiceRenderer.css';

type ChoiceInteraction = Extract<StudentActivityInteraction, { family: 'choice' }>;
type ChoiceResponse = ChoiceSingleResponse | ChoiceMultipleResponse | null;
type ChoiceMode = 'single' | 'multiple';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const describeValidation = (message: string | undefined): string =>
  message?.trim() || 'Response needs review.';

const hasSourceCorrespondence = (
  interaction: ChoiceInteraction,
  sourceContext: ActivityRendererProps<unknown>['sourceContext'],
): boolean => [
  sourceContext?.description,
  interaction.sourceAssisted?.accessiblePrompt,
  interaction.sourceAssisted?.questionLabel,
  interaction.sourceAssisted?.sourceExerciseLabel,
  interaction.sourceAssisted?.sourcePartLabel,
].some(isNonEmptyString);

const domId = (prefix: string, value: string): string =>
  `${prefix}-${encodeURIComponent(value).replaceAll('%', '_')}`;

const getChoiceMode = (interaction: ChoiceInteraction, requestedMode?: ChoiceMode): ChoiceMode | null => {
  const sourceShape = interaction.sourceAssisted?.responseShape;
  const sourceMode = sourceShape === 'single-choice'
    ? 'single'
    : sourceShape === 'multiple-choice'
      ? 'multiple'
      : null;
  if (requestedMode && sourceMode && sourceMode !== requestedMode) return null;
  return requestedMode ?? sourceMode;
};

const getOptions = (interaction: ChoiceInteraction): ChoiceInteraction['options'] | null => {
  if (!Array.isArray(interaction.options) || interaction.options.length === 0) return null;
  const seenIds = new Set<string>();
  for (const option of interaction.options) {
    if (!isNonEmptyString(option.itemId) || !isNonEmptyString(option.label) || seenIds.has(option.itemId)) {
      return null;
    }
    seenIds.add(option.itemId);
  }
  return interaction.options;
};

const getResponse = (
  response: unknown,
  mode: ChoiceMode,
  interactionId: string,
  optionIds: ReadonlySet<string>,
): string | readonly string[] | null => {
  if (response === null) return mode === 'single' ? '' : [];
  if (
    typeof response !== 'object' ||
    !Object.hasOwn(response, 'interactionId') ||
    (response as { interactionId?: unknown }).interactionId !== interactionId
  ) return null;
  if (mode === 'single') {
    if (!Object.hasOwn(response, 'selectedOptionId')) return null;
    const selectedOptionId = (response as { selectedOptionId?: unknown }).selectedOptionId;
    if (selectedOptionId === null) return '';
    if (typeof selectedOptionId !== 'string' || !optionIds.has(selectedOptionId)) return null;
    return selectedOptionId;
  }
  if (!Object.hasOwn(response, 'selectedOptionIds')) return null;
  const selectedOptionIds = (response as { selectedOptionIds?: unknown }).selectedOptionIds;
  if (!Array.isArray(selectedOptionIds) ||
      selectedOptionIds.some((item) => typeof item !== 'string')) return null;
  const values = selectedOptionIds as string[];
  if (new Set(values).size !== values.length || values.some((item) => !optionIds.has(item))) return null;
  return values;
};

const SourceCorrespondence = ({
  interaction,
  sourceContext,
  id,
}: {
  interaction: ChoiceInteraction;
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
    <aside aria-label="Source correspondence" className="book-choice__source" id={id}>
      <p>Source correspondence</p>
      {details.map((detail, index) => <p key={`${detail}-${index}`}>{detail}</p>)}
    </aside>
  );
};

export interface ChoiceRendererProps extends ActivityRendererProps<ChoiceResponse> {}

function ChoiceRendererImpl({
  interaction,
  answerRule,
  response,
  validation,
  mode,
  sourceContext,
  onChange,
  requestedMode,
}: ChoiceRendererProps & { requestedMode?: ChoiceMode }) {
  const [pendingSelections, setPendingSelections] = useState<readonly string[] | null>(null);
  useEffect(() => {
    const candidate = response as { selectedOptionIds?: unknown } | null;
    const responseSelections = response &&
      typeof response === 'object' &&
      Object.hasOwn(response, 'selectedOptionIds') &&
      Array.isArray(candidate?.selectedOptionIds)
      ? candidate.selectedOptionIds.filter((item): item is string => typeof item === 'string')
      : [];
    setPendingSelections(responseSelections);
  }, [interaction.interactionId, response]);
  if (interaction.family !== 'choice' || !isNonEmptyString(interaction.interactionId) || !isNonEmptyString(interaction.prompt)) {
    return <p role="alert">Unsupported choice activity.</p>;
  }
  const choiceMode = getChoiceMode(interaction, requestedMode);
  const options = getOptions(interaction);
  if (!choiceMode || !options) return <p role="alert">Unsupported choice activity.</p>;

  const optionIds = new Set(options.map((option) => option.itemId));
  const selected = getResponse(response, choiceMode, interaction.interactionId, optionIds);
  if (selected === null) return <p role="alert">Unsupported choice response.</p>;

  const sourceId = domId('choice-source', interaction.interactionId);
  const validationId = domId('choice-validation', interaction.interactionId);
  const validationMessage = validation.status === 'invalid' ? describeValidation(validation.message) : null;
  const describedBy = [
    hasSourceCorrespondence(interaction, sourceContext) ? sourceId : null,
    validationMessage ? validationId : null,
  ].filter(Boolean).join(' ') || undefined;
  const locked = mode !== 'editable';
  const selectedValues = choiceMode === 'multiple' && Array.isArray(selected) ? selected : [];
  const visibleSelections = pendingSelections ?? selectedValues;
  const requiredSelectionCount = choiceMode === 'single'
    ? 1
    : answerRule.requiredSelectionCount;

  return (
    <fieldset
      className="book-choice"
      aria-describedby={describedBy}
      aria-label={sourceContext?.description ? undefined : interaction.prompt}
      aria-readonly={locked}
      aria-disabled={locked}
    >
      <legend>{interaction.prompt}</legend>
      <SourceCorrespondence interaction={interaction} sourceContext={sourceContext} id={sourceId} />
      {requiredSelectionCount === undefined ? null : (
        <p>
          Select {requiredSelectionCount} option{requiredSelectionCount === 1 ? '' : 's'}.
        </p>
      )}
      {options.map((option) => {
        const inputId = domId('choice-option', `${interaction.interactionId}-${option.itemId}`);
        const checked = choiceMode === 'multiple'
          ? visibleSelections.includes(option.itemId)
          : selected === option.itemId;
        return (
          <label className="book-choice__option" htmlFor={inputId} key={option.itemId}>
            <input
              aria-describedby={describedBy}
              aria-invalid={validationMessage ? true : undefined}
              checked={checked}
              id={inputId}
              name={interaction.interactionId}
              onChange={() => {
                if (mode !== 'editable') return;
                if (choiceMode === 'single') {
                  onChange({
                    interactionId: interaction.interactionId,
                    selectedOptionId: option.itemId,
                  });
                  return;
                }
                if (
                  !visibleSelections.includes(option.itemId) &&
                  requiredSelectionCount !== undefined &&
                  visibleSelections.length >= requiredSelectionCount
                ) return;
                const next = visibleSelections.includes(option.itemId)
                  ? visibleSelections.filter((item) => item !== option.itemId)
                  : [...visibleSelections, option.itemId];
                setPendingSelections(next);
                if (requiredSelectionCount !== undefined && next.length !== requiredSelectionCount) return;
                onChange({
                  interactionId: interaction.interactionId,
                  selectedOptionIds: next,
                });
              }}
              type={choiceMode === 'multiple' ? 'checkbox' : 'radio'}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
      {validationMessage ? <p id={validationId} role="alert">{validationMessage}</p> : null}
    </fieldset>
  );
}

export function ChoiceRenderer(props: ChoiceRendererProps) {
  return <ChoiceRendererImpl {...props} />;
}

export function SingleChoiceRenderer(props: ChoiceRendererProps) {
  return <ChoiceRendererImpl {...props} requestedMode="single" />;
}

export function MultipleChoiceRenderer(props: ChoiceRendererProps) {
  return <ChoiceRendererImpl {...props} requestedMode="multiple" />;
}

export const ChoiceActivityRenderer = ChoiceRenderer;
export default ChoiceRenderer;

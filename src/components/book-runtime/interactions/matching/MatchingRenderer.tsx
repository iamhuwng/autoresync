import { useEffect, useState } from 'react';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type {
  MatchingPairResponse,
  MatchingResponse,
} from '../../../../services/book-activity/runtime/codecs/matchingResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import './MatchingRenderer.css';

type MatchingInteraction = Extract<StudentActivityInteraction, { family: 'matching' }>;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const domId = (prefix: string, value: string): string =>
  `${prefix}-${encodeURIComponent(value).replaceAll('%', '_')}`;

const getInteraction = (value: StudentActivityInteraction): MatchingInteraction | null =>
  value.family === 'matching' &&
  isNonEmptyString(value.interactionId) &&
  isNonEmptyString(value.prompt) &&
  Array.isArray(value.leftItems) &&
  Array.isArray(value.rightItems) &&
  value.leftItems.length > 0 &&
  value.rightItems.length > 0 &&
  new Set(value.leftItems.map((item) => item.itemId)).size === value.leftItems.length &&
  new Set(value.rightItems.map((item) => item.itemId)).size === value.rightItems.length &&
  value.leftItems.every((item) => isNonEmptyString(item.itemId) && isNonEmptyString(item.label)) &&
  value.rightItems.every((item) => isNonEmptyString(item.itemId) && isNonEmptyString(item.label))
    ? value
    : null;

const readResponse = (
  response: unknown,
  interaction: MatchingInteraction,
  allowOptionReuse: boolean,
): MatchingPairResponse[] | null => {
  if (response === null) return [];
  if (!response || typeof response !== 'object' ||
      !Object.hasOwn(response, 'interactionId') ||
      (response as { interactionId?: unknown }).interactionId !== interaction.interactionId ||
      !Object.hasOwn(response, 'pairs') ||
      !Array.isArray((response as { pairs?: unknown }).pairs)) return null;
  const leftIds = new Set(interaction.leftItems.map((item) => item.itemId));
  const rightIds = new Set(interaction.rightItems.map((item) => item.itemId));
  const pairs = (response as { pairs: unknown[] }).pairs;
  const result: MatchingPairResponse[] = [];
  for (const pair of pairs) {
    if (!pair || typeof pair !== 'object' ||
        typeof (pair as { leftItemId?: unknown }).leftItemId !== 'string' ||
        typeof (pair as { rightItemId?: unknown }).rightItemId !== 'string') return null;
    const value = pair as MatchingPairResponse;
    if (!leftIds.has(value.leftItemId) || !rightIds.has(value.rightItemId)) return null;
    result.push({ leftItemId: value.leftItemId, rightItemId: value.rightItemId });
  }
  if (new Set(result.map((pair) => pair.leftItemId)).size !== result.length) return null;
  if (!allowOptionReuse &&
      new Set(result.map((pair) => pair.rightItemId)).size !== result.length) return null;
  return result;
};

const sourceDetails = (
  interaction: MatchingInteraction,
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

export interface MatchingRendererProps extends ActivityRendererProps<MatchingResponse | null> {}

export function MatchingRenderer({
  interaction: rawInteraction,
  answerRule,
  response,
  validation,
  mode,
  sourceContext,
  onChange,
}: MatchingRendererProps) {
  const interaction = getInteraction(rawInteraction);
  const [pendingPairs, setPendingPairs] = useState<MatchingPairResponse[] | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  useEffect(() => {
    setPendingPairs(null);
    setStatusMessage('');
  }, [rawInteraction.interactionId, response]);

  if (!interaction) return <p role="alert">Unsupported matching activity.</p>;
  const allowReuse = answerRule.allowOptionReuse === true;
  const pairs = readResponse(response, interaction, allowReuse);
  if (!pairs) return <p role="alert">Unsupported matching response.</p>;
  const visiblePairs = pendingPairs ?? pairs;
  const selectedByLeft = new Map(visiblePairs.map((pair) => [pair.leftItemId, pair.rightItemId]));
  const leftLabels = new Map(interaction.leftItems.map((item) => [item.itemId, item.label]));
  const rightLabels = new Map(interaction.rightItems.map((item) => [item.itemId, item.label]));
  const sourceId = domId('matching-source', interaction.interactionId);
  const validationId = domId('matching-validation', interaction.interactionId);
  const source = sourceDetails(interaction, sourceContext);
  const validationMessage = validation.status === 'invalid'
    ? validation.message?.trim() || 'Response needs review.'
    : null;
  const describedBy = [
    source.length > 0 ? sourceId : null,
    validationMessage ? validationId : null,
  ].filter(Boolean).join(' ') || undefined;
  const locked = mode !== 'editable';
  const announce = (message: string) => setStatusMessage(message);
  const changePair = (leftItemId: string, rightItemId: string) => {
    if (locked) return;
    const current = visiblePairs.filter((pair) => pair.leftItemId !== leftItemId);
    if (rightItemId && !allowReuse && current.some((pair) => pair.rightItemId === rightItemId)) {
      announce('That option is already used. Choose another option.');
      return;
    }
    const next = rightItemId
      ? [...current, { leftItemId, rightItemId }]
      : current;
    setPendingPairs(next);
    announce(`${next.length} of ${interaction.leftItems.length} items matched.`);
    onChange({ interactionId: interaction.interactionId, pairs: next });
  };

  return (
    <section
      aria-describedby={describedBy}
      aria-label={interaction.prompt}
      aria-readonly={locked}
      className="book-matching"
    >
      <h3>{interaction.prompt}</h3>
      {source.length > 0 ? (
        <aside aria-label="Source correspondence" className="book-matching__source" id={sourceId}>
          {source.map((detail, index) => <p key={`${detail}-${index}`}>{detail}</p>)}
        </aside>
      ) : null}
      <p id={`${sourceId}-instructions`}>Match each left item with one right option.</p>
      <div className="book-matching__rows">
        {interaction.leftItems.map((leftItem) => {
          const selectId = domId('matching-select', `${interaction.interactionId}-${leftItem.itemId}`);
          return (
            <div className="book-matching__row" key={leftItem.itemId}>
              <label htmlFor={selectId}>{leftItem.label}</label>
              <select
                aria-describedby={`${sourceId}-instructions${describedBy ? ` ${describedBy}` : ''}`}
                aria-disabled={locked}
                aria-label={`Match ${leftItem.label}`}
                disabled={locked}
                id={selectId}
                value={selectedByLeft.get(leftItem.itemId) ?? ''}
                onChange={(event) => changePair(leftItem.itemId, event.target.value)}
              >
                <option value="">Not matched</option>
                {interaction.rightItems.map((rightItem) => (
                  <option key={rightItem.itemId} value={rightItem.itemId}>
                    {rightItem.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="book-matching__status" role={statusMessage ? 'status' : undefined}>
        {statusMessage || `${visiblePairs.length} of ${interaction.leftItems.length} items matched.`}
      </p>
      {validationMessage ? <p id={validationId} role="alert">{validationMessage}</p> : null}
      {visiblePairs.length > 0 ? (
        <ul aria-label="Current matches">
          {visiblePairs.map((pair) => <li key={pair.leftItemId}>{leftLabels.get(pair.leftItemId)} — {rightLabels.get(pair.rightItemId)}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

export const MatchingActivityRenderer = MatchingRenderer;
export default MatchingRenderer;

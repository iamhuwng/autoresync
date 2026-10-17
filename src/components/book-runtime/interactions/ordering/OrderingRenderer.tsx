import { useEffect, useRef, useState } from 'react';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type { OrderingResponse } from '../../../../services/book-activity/runtime/codecs/orderingResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import './OrderingRenderer.css';

type OrderingInteraction = Extract<StudentActivityInteraction, { family: 'ordering' }>;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const domId = (prefix: string, value: string): string =>
  `${prefix}-${encodeURIComponent(value).replaceAll('%', '_')}`;

const getInteraction = (value: StudentActivityInteraction): OrderingInteraction | null =>
  value.family === 'ordering' &&
  isNonEmptyString(value.interactionId) &&
  isNonEmptyString(value.prompt) &&
  Array.isArray(value.items) &&
  value.items.length > 0 &&
  new Set(value.items.map((item) => item.itemId)).size === value.items.length &&
  value.items.every((item) => isNonEmptyString(item.itemId) && isNonEmptyString(item.label))
    ? value
    : null;

const readResponse = (
  response: unknown,
  interaction: OrderingInteraction,
): string[] | null => {
  if (response === null) return [];
  if (!response || typeof response !== 'object' ||
      (response as { interactionId?: unknown }).interactionId !== interaction.interactionId ||
      !Array.isArray((response as { orderedItemIds?: unknown }).orderedItemIds)) return null;
  const ids = (response as { orderedItemIds: unknown[] }).orderedItemIds;
  const allowed = new Set(interaction.items.map((item) => item.itemId));
  if (!ids.every((id) => typeof id === 'string' && allowed.has(id)) ||
      new Set(ids).size !== ids.length) return null;
  return Array.from(ids as string[]);
};

const sourceDetails = (
  interaction: OrderingInteraction,
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

export interface OrderingRendererProps extends ActivityRendererProps<OrderingResponse | null> {}

export function OrderingRenderer({
  interaction: rawInteraction,
  response,
  validation,
  mode,
  sourceContext,
  onChange,
}: OrderingRendererProps) {
  const interaction = getInteraction(rawInteraction);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const sectionRef = useRef<HTMLElement | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  useEffect(() => {
    setPendingOrder(null);
    setStatusMessage('');
    setFocusTarget(null);
  }, [rawInteraction.interactionId, response]);
  useEffect(() => {
    if (!focusTarget) return;
    const target = Array.from(
      sectionRef.current?.querySelectorAll<HTMLButtonElement>('button[data-focus-key]') ?? [],
    ).find((button) => button.dataset.focusKey === focusTarget);
    target?.focus();
    setFocusTarget(null);
  }, [focusTarget, pendingOrder]);

  if (!interaction) return <p role="alert">Unsupported ordering activity.</p>;
  const parsedOrder = readResponse(response, interaction);
  if (!parsedOrder) return <p role="alert">Unsupported ordering response.</p>;
  const orderedIds = pendingOrder ?? parsedOrder;
  const labels = new Map(interaction.items.map((item) => [item.itemId, item.label]));
  const available = interaction.items
    .map((item) => item.itemId)
    .filter((itemId) => !orderedIds.includes(itemId));
  const sourceId = domId('ordering-source', interaction.interactionId);
  const validationId = domId('ordering-validation', interaction.interactionId);
  const source = sourceDetails(interaction, sourceContext);
  const validationMessage = validation.status === 'invalid'
    ? validation.message?.trim() || 'Response needs review.'
    : null;
  const describedBy = [
    source.length > 0 ? sourceId : null,
    validationMessage ? validationId : null,
  ].filter(Boolean).join(' ') || undefined;
  const locked = mode !== 'editable';
  const update = (next: string[], message: string, nextFocusTarget: string) => {
    if (locked) return;
    setPendingOrder(next);
    setStatusMessage(message);
    setFocusTarget(nextFocusTarget);
    onChange({ interactionId: interaction.interactionId, orderedItemIds: next });
  };
  const move = (itemId: string, delta: -1 | 1) => {
    const index = orderedIds.indexOf(itemId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= orderedIds.length) return;
    const next = Array.from(orderedIds);
    [next[index], next[target]] = [next[target]!, next[index]!];
    update(next, `Moved ${labels.get(itemId)}.`, `remove:${itemId}`);
  };
  const add = (itemId: string) => update(
    [...orderedIds, itemId],
    `Added ${labels.get(itemId)} to the order.`,
    `remove:${itemId}`,
  );
  const remove = (itemId: string) => update(
    orderedIds.filter((value) => value !== itemId),
    `Removed ${labels.get(itemId)} from the order.`,
    `add:${itemId}`,
  );

  return (
    <section
      ref={sectionRef}
      aria-describedby={describedBy}
      aria-label={interaction.prompt}
      aria-readonly={locked}
      className="book-ordering"
    >
      <h3>{interaction.prompt}</h3>
      {source.length > 0 ? (
        <aside aria-label="Source correspondence" className="book-ordering__source" id={sourceId}>
          {source.map((detail, index) => <p key={`${detail}-${index}`}>{detail}</p>)}
        </aside>
      ) : null}
      <p id={`${sourceId}-instructions`}>Build the order from first to last.</p>
      <ol aria-label="Current order" className="book-ordering__list">
        {orderedIds.map((itemId, index) => (
          <li className="book-ordering__item" key={itemId}>
            <span className="book-ordering__label">{labels.get(itemId)}</span>
            {!locked ? (
              <>
                <button
                  aria-label={`Move ${labels.get(itemId)} up`}
                  className="book-ordering__button"
                  disabled={index === 0}
                  onClick={() => move(itemId, -1)}
                  type="button"
                >Move up</button>
                <button
                  aria-label={`Move ${labels.get(itemId)} down`}
                  className="book-ordering__button"
                  disabled={index === orderedIds.length - 1}
                  onClick={() => move(itemId, 1)}
                  type="button"
                >Move down</button>
                <button
                  aria-label={`Remove ${labels.get(itemId)}`}
                  className="book-ordering__button"
                  data-focus-key={`remove:${itemId}`}
                  onClick={() => remove(itemId)}
                  type="button"
                >Remove</button>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      {available.length > 0 ? (
        <ul aria-label="Items not yet ordered" className="book-ordering__available">
          {available.map((itemId) => (
            <li className="book-ordering__item" key={itemId}>
              <span className="book-ordering__label">{labels.get(itemId)}</span>
              {!locked ? (
                <button
                  aria-label={`Add ${labels.get(itemId)} to order`}
                  className="book-ordering__button"
                  data-focus-key={`add:${itemId}`}
                  onClick={() => add(itemId)}
                  type="button"
                >Add to order</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p aria-live="polite" className="book-ordering__status" role={statusMessage ? 'status' : undefined}>
        {statusMessage || `${orderedIds.length} of ${interaction.items.length} items ordered.`}
      </p>
      {validationMessage ? <p id={validationId} role="alert">{validationMessage}</p> : null}
    </section>
  );
}

export const OrderingActivityRenderer = OrderingRenderer;
export default OrderingRenderer;

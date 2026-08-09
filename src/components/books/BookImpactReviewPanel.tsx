import { useEffect, useMemo, useState } from 'react';
import type {
  BookImpactSnapshot,
  BookImpactSnapshotChoice,
} from '../../services/book-delivery/bookImpactSnapshot.types';
import { isBookImpactSnapshotExpired } from '../../services/book-delivery/bookImpactSnapshot.types';
import './BookImpactReviewPanel.css';

export interface BookImpactReviewSelection {
  readonly contextKey: string;
  readonly placementId: string;
  readonly choice: BookImpactSnapshotChoice;
}

export interface BookImpactReviewPanelProps {
  readonly snapshot: BookImpactSnapshot;
  readonly now?: string;
  readonly onSelectionChange?: (selections: readonly BookImpactReviewSelection[]) => void;
  readonly onDismiss?: () => void;
  readonly onTrackAction?: (action: string, metadata: Readonly<Record<string, unknown>>) => void;
}

const label = (value: string): string => value.replaceAll('-', ' ');

export function BookImpactReviewPanel({
  snapshot,
  now = new Date().toISOString(),
  onSelectionChange,
  onDismiss,
  onTrackAction,
}: BookImpactReviewPanelProps) {
  const [selected, setSelected] = useState<Readonly<Record<string, BookImpactSnapshotChoice>>>({});
  const expired = isBookImpactSnapshotExpired(snapshot, now);
  useEffect(() => setSelected({}), [snapshot.snapshotId]);

  const selections = useMemo(() => Object.entries(selected).map(([key, choice]) => {
    const separator = key.lastIndexOf(':');
    return {
      contextKey: key.slice(0, separator),
      placementId: key.slice(separator + 1),
      choice,
    };
  }).sort((left, right) => (
    `${left.contextKey}:${left.placementId}`.localeCompare(`${right.contextKey}:${right.placementId}`)
  )), [selected]);

  const checkpointCount = snapshot.contexts.reduce(
    (total, context) => total + context.estimatedCheckpointCount,
    0,
  );
  const notificationCount = snapshot.contexts.reduce(
    (total, context) => total + context.estimatedNotificationCount,
    0,
  );

  const choose = (contextKey: string, placementId: string, choice: BookImpactSnapshotChoice) => {
    if (expired) return;
    const key = `${contextKey}:${placementId}`;
    const next = { ...selected, [key]: choice };
    setSelected(next);
    const nextSelections = Object.entries(next).map(([selectionKey, selectedChoice]) => {
      const separator = selectionKey.lastIndexOf(':');
      return {
        contextKey: selectionKey.slice(0, separator),
        placementId: selectionKey.slice(separator + 1),
        choice: selectedChoice,
      };
    });
    onSelectionChange?.(nextSelections);
    onTrackAction?.('teacher_materials_book_impact_choice_selected', {
      bookId: snapshot.bookId,
      snapshotId: snapshot.snapshotId,
      contextKey,
      placementId,
      choice,
    });
  };

  return (
    <section className="book-impact-review" aria-labelledby="book-impact-review-title">
      <header className="book-impact-review__header">
        <div>
          <p className="book-impact-review__eyebrow">Read-only update analysis</p>
          <h2 id="book-impact-review-title">Review affected Book contexts</h2>
          <p>
            Nothing is selected by default. Choices stay local until the later update action is reviewed.
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="book-impact-review__dismiss"
            onClick={() => {
              onTrackAction?.('teacher_materials_book_impact_review_dismissed', {
                bookId: snapshot.bookId,
                snapshotId: snapshot.snapshotId,
                selectedCount: selections.length,
              });
              onDismiss();
            }}
          >
            Close review
          </button>
        ) : null}
      </header>

      {expired ? (
        <div className="book-impact-review__notice" role="alert">
          This analysis expired. Refresh the impact analysis before making update choices.
        </div>
      ) : null}

      <dl className="book-impact-review__summary">
        <div><dt>Contexts</dt><dd>{snapshot.contexts.length}</dd></div>
        <div><dt>Estimated checkpoints</dt><dd>{checkpointCount}</dd></div>
        <div><dt>Estimated notifications</dt><dd>{notificationCount}</dd></div>
        <div><dt>Expires</dt><dd>{new Date(snapshot.expiresAt).toLocaleString()}</dd></div>
      </dl>

      <div className="book-impact-review__contexts">
        {snapshot.contexts.length === 0 ? (
          <p className="book-impact-review__empty">No active owned contexts are affected.</p>
        ) : snapshot.contexts.map((context) => (
          <article className="book-impact-review__context" key={context.contextKey}>
            <div className="book-impact-review__context-heading">
              <div>
                <h3>{label(context.impact.contextKind)}</h3>
                <p>{context.impact.contextId} · {label(context.recipientScope.lifecycle)}</p>
              </div>
              <span>{label(context.impact.classification.primaryEffect)}</span>
            </div>
            <dl className="book-impact-review__facts">
              <div><dt>Recipient</dt><dd>{context.recipientScope.recipientId}</dd></div>
              <div><dt>Binding</dt><dd>{context.impact.bindingId}</dd></div>
              <div><dt>Window</dt><dd>{context.impact.effectiveWindow?.dueAt ?? 'No deadline'}</dd></div>
            </dl>
            <div className="book-impact-review__activities">
              {context.activityChoices.map((activity) => {
                const selectionKey = `${context.contextKey}:${activity.placementId}`;
                return (
                  <fieldset key={activity.placementId} disabled={expired}>
                    <legend>{activity.activityId} · {activity.placementId}</legend>
                    {activity.allowedChoices.map((choice) => (
                      <label key={choice}>
                        <input
                          type="radio"
                          name={selectionKey}
                          value={choice}
                          disabled={expired}
                          checked={selected[selectionKey] === choice}
                          onChange={() => choose(context.contextKey, activity.placementId, choice)}
                        />
                        <span>{label(choice)}</span>
                      </label>
                    ))}
                  </fieldset>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

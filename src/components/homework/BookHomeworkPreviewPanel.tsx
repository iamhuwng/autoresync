import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BookHomeworkSelectionTarget } from '../../types/homework.types';
import {
  buildBookHomeworkPreview,
  createDefaultBookHomeworkPolicy,
  updateBookHomeworkActivityPolicy,
  type BookHomeworkFeedbackRelease,
  type BookHomeworkPolicyDraft,
  type BookHomeworkPreviewDraft,
  type BookHomeworkPreviewSource,
  type BookHomeworkScheduleDraft,
} from '../../services/book-homework/bookHomeworkPreview.service';
import { createBookHomeworkManifest } from '../../services/book-homework/bookHomeworkManifest.service';
import './BookHomeworkPreviewPanel.css';

export interface BookHomeworkScheduleEditorProps {
  readonly value: BookHomeworkScheduleDraft;
  readonly onChange: (next: BookHomeworkScheduleDraft) => void;
}

export type BookHomeworkScheduleEditor = (
  props: BookHomeworkScheduleEditorProps,
) => ReactNode;

interface BookHomeworkPreviewPanelProps {
  readonly source: BookHomeworkPreviewSource;
  readonly renderScheduleEditor: BookHomeworkScheduleEditor;
  readonly onConfirm: (draft: BookHomeworkPreviewDraft) => void | Promise<void>;
  readonly onCancel: () => void;
  readonly onForkBeforeAssign?: () => void;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

type TargetOption = {
  readonly value: string;
  readonly label: string;
  readonly target: BookHomeworkSelectionTarget;
};

const targetKey = (target: BookHomeworkSelectionTarget): string => {
  if (target.kind === 'book') return 'book';
  if (target.kind === 'activity') return `activity:${target.placementId ?? target.activityId}`;
  return `${target.kind}:${target.nodeKey}`;
};

const targetLabel = (target: BookHomeworkSelectionTarget, title: string): string => {
  if (target.kind === 'book') return `Whole Book — ${title}`;
  if (target.kind === 'activity') return `Activity — ${target.activityId}`;
  return `${target.kind[0].toUpperCase()}${target.kind.slice(1)} — ${target.nodeKey}`;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'This Book target cannot form a safe preview.';
};

const feedbackOptions: readonly { value: BookHomeworkFeedbackRelease; label: string }[] = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'after_completion', label: 'After completion' },
  { value: 'after_deadline', label: 'After deadline' },
  { value: 'never', label: 'Never' },
  { value: 'manual', label: 'Manual release' },
];

const BookHomeworkPreviewPanel = ({
  source,
  renderScheduleEditor,
  onConfirm,
  onCancel,
  onForkBeforeAssign,
  onAction,
}: BookHomeworkPreviewPanelProps) => {
  const title = source.bookTitle?.trim() || 'PDF Book';
  const initialTarget = source.initialTarget ?? { kind: 'book', bookId: source.delivery.book.bookId };
  const targetOptions = useMemo<readonly TargetOption[]>(() => [
    {
      value: 'book',
      label: targetLabel({ kind: 'book', bookId: source.delivery.book.bookId }, title),
      target: { kind: 'book', bookId: source.delivery.book.bookId },
    },
    ...source.delivery.outline
      .filter((node) => ['section', 'chapter', 'unit', 'test'].includes(node.nodeType))
      .map((node) => ({
        value: `${node.nodeType}:${node.nodeKey}`,
        label: `${node.nodeType[0].toUpperCase()}${node.nodeType.slice(1)} — ${node.titleSnapshot || node.nodeKey}`,
        target: {
          kind: node.nodeType as 'section' | 'chapter' | 'unit' | 'test',
          bookId: source.delivery.book.bookId,
          nodeKey: node.nodeKey,
        },
      })),
    ...source.delivery.activities.map((activity) => ({
      value: `activity:${activity.placementId}`,
      label: `Activity — ${activity.titleSnapshot || activity.activityId}`,
      target: {
        kind: 'activity' as const,
        bookId: source.delivery.book.bookId,
        activityId: activity.activityId,
        placementId: activity.placementId,
      },
    })),
  ], [source.delivery.activities, source.delivery.book.bookId, source.delivery.outline, title]);
  const targetMap = useMemo(
    () => new Map(targetOptions.map((option) => [option.value, option.target])),
    [targetOptions],
  );
  const initialTargetValue = targetMap.has(targetKey(initialTarget))
    ? targetKey(initialTarget)
    : 'book';
  const [selectedTargetValue, setSelectedTargetValue] = useState(initialTargetValue);
  const selectedTarget = targetMap.get(selectedTargetValue) ?? targetOptions[0]?.target;
  const [policy, setPolicy] = useState<BookHomeworkPolicyDraft | null>(null);
  const [schedule, setSchedule] = useState<BookHomeworkScheduleDraft>({ availableFrom: '', dueDate: '' });

  const manifestResult = useMemo(() => {
    if (!selectedTarget) return { manifest: null, error: null };
    try {
      return {
        manifest: createBookHomeworkManifest({
          resolution: { delivery: source.delivery },
          target: selectedTarget,
          ...source.identity,
          excludedActivities: source.excludedActivities,
        }),
        error: null,
      };
    } catch (error) {
      return { manifest: null, error: errorMessage(error) };
    }
  }, [selectedTarget, source.delivery, source.excludedActivities, source.identity]);
  const manifest = manifestResult.manifest;

  useEffect(() => {
    setPolicy(manifest ? createDefaultBookHomeworkPolicy(manifest) : null);
  }, [manifest]);

  const previewResult = useMemo(() => {
    if (!manifest || !policy) return { preview: null, error: null };
    try {
      return {
        preview: buildBookHomeworkPreview({ source, manifest, policy }),
        error: null,
      };
    } catch (error) {
      return { preview: null, error: errorMessage(error) };
    }
  }, [manifest, policy, source]);
  const preview = previewResult.preview;
  const manifestError = manifestResult.error ?? previewResult.error;

  const updatePolicy = (next: BookHomeworkPolicyDraft): void => {
    setPolicy(next);
    onAction?.('bookHomeworkPolicyChanged', {
      intent: next.intent,
      integrityCapture: next.integrityCapture,
    });
  };

  const handleIntentChange = (intent: BookHomeworkPolicyDraft['intent']): void => {
    if (!policy) return;
    updatePolicy({
      ...policy,
      intent,
      integrityCapture: policy.integrityOverride ? policy.integrityCapture : intent === 'accountable',
    });
  };

  const handleIntegrityChange = (integrityCapture: boolean): void => {
    if (!policy) return;
    updatePolicy({ ...policy, integrityCapture, integrityOverride: true });
  };

  const handleActivityPolicyChange = (
    placementId: string,
    update: Parameters<typeof updateBookHomeworkActivityPolicy>[2],
  ): void => {
    if (!policy) return;
    updatePolicy(updateBookHomeworkActivityPolicy(policy, placementId, update));
    onAction?.('bookHomeworkActivityPolicyChanged', { placementId, ...update });
  };

  const handleConfirm = (): void => {
    if (!preview || !preview.canConfirm || schedule.dueDate === '') return;
    onAction?.('bookHomeworkPreviewConfirmed', {
      target: targetKey(preview.manifest.selectedTarget),
      activityCount: preview.manifest.completion.requiredBindingCount,
    });
    void onConfirm({
      manifest: preview.manifest,
      policy: preview.policy,
      schedule,
      warnings: preview.warnings,
    });
  };

  const handleCancel = (): void => {
    onAction?.('bookHomeworkPreviewCanceled', { target: selectedTargetValue });
    onCancel();
  };

  const updateSchedule = (next: BookHomeworkScheduleDraft): void => {
    setSchedule(next);
  };

  return (
    <section className="book-homework-preview" aria-labelledby="book-homework-preview-title">
      <div className="book-homework-preview__heading">
        <div>
          <p className="book-homework-preview__eyebrow">Read-only Book assignment preview</p>
          <h3 id="book-homework-preview-title">{title}</h3>
          <p>Select the exact structured scope and inspect the frozen Delivery facts before assignment handoff.</p>
        </div>
        <span className="book-homework-preview__status" role="status">No assignment written</span>
      </div>

      <label className="book-homework-preview__field" htmlFor="book-homework-target">
        <span>Assignment scope</span>
        <select
          id="book-homework-target"
          value={selectedTargetValue}
          onChange={(event) => {
            setSelectedTargetValue(event.target.value);
            onAction?.('bookHomeworkTargetSelected', { target: event.target.value });
          }}
        >
          {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {manifestError && (
        <div className="book-homework-preview__blocker" role="alert">
          <strong>Preview blocked</strong>
          <p>{manifestError}</p>
        </div>
      )}

      {preview && (
        <>
          <dl className="book-homework-preview__facts" aria-label="Book Delivery facts">
            <div><dt>Source strategy</dt><dd>{preview.sourceSummary.strategy === 'full_pdf' ? 'Full PDF' : 'Component PDFs'}</dd></div>
            <div><dt>Book revision</dt><dd>{preview.manifest.book.bookRevision}</dd></div>
            <div><dt>Publication revision</dt><dd>{preview.manifest.book.publicationRevision}</dd></div>
            <div><dt>Activities</dt><dd>{preview.manifest.completion.requiredBindingCount}</dd></div>
          </dl>

          <div className="book-homework-preview__columns">
            <section aria-labelledby="book-homework-outline-title">
              <h4 id="book-homework-outline-title">Frozen outline</h4>
              <ol className="book-homework-preview__outline">
                {preview.manifest.outline.map((node) => (
                  <li key={node.nodeKey}>
                    <span>{node.titleSnapshot || node.nodeKey}</span>
                    <small>{node.nodeType}</small>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="book-homework-source-title">
              <h4 id="book-homework-source-title">Delivered source breadth</h4>
              <ul className="book-homework-preview__source-list">
                {preview.sourceSummary.sources.map((source) => (
                  <li key={source.sourceKey}>
                    <strong>{source.sourceKey}</strong>
                    <span>{source.sourceVersionId}</span>
                    {source.ownerNodeKey && <small>Owner: {source.ownerNodeKey}</small>}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section aria-labelledby="book-homework-activity-title">
            <h4 id="book-homework-activity-title">Ordered Activity policy</h4>
            <ol className="book-homework-preview__activities">
              {preview.manifest.bindings.map((binding) => {
                const activityPolicy = policy?.activityPolicies.find((entry) => entry.placementId === binding.placementId);
                return (
                  <li key={binding.placementId} className={binding.state === 'excluded' ? 'is-excluded' : undefined}>
                    <div className="book-homework-preview__activity-heading">
                      <div>
                        <strong>{binding.titleSnapshot || binding.activityId}</strong>
                        <span>{binding.state === 'required' ? `Activity Version ${binding.activityVersionId}` : `Excluded: ${binding.exclusionReason}`}</span>
                      </div>
                      {binding.state === 'required' && activityPolicy && (
                        <div className="book-homework-preview__activity-controls">
                          <label>
                            <span>Max attempts</span>
                            <input
                              aria-label={`Max attempts for ${binding.titleSnapshot || binding.activityId}`}
                              type="number"
                              min="1"
                              placeholder="Unlimited"
                              value={activityPolicy.maxAttempts ?? ''}
                              onChange={(event) => handleActivityPolicyChange(binding.placementId, {
                                maxAttempts: event.target.value === '' ? null : Number(event.target.value),
                              })}
                            />
                          </label>
                          <label>
                            <span>Feedback</span>
                            <select
                              aria-label={`Feedback release for ${binding.titleSnapshot || binding.activityId}`}
                              value={activityPolicy.feedbackRelease}
                              onChange={(event) => handleActivityPolicyChange(binding.placementId, {
                                feedbackRelease: event.target.value as BookHomeworkFeedbackRelease,
                              })}
                            >
                              {feedbackOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label className="book-homework-preview__late-policy">
                            <input
                              type="checkbox"
                              checked={activityPolicy.lateSubmissionAllowed}
                              onChange={(event) => handleActivityPolicyChange(binding.placementId, {
                                lateSubmissionAllowed: event.target.checked,
                              })}
                            />
                            <span>Allow late</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="book-homework-preview__policy" aria-labelledby="book-homework-intent-title">
            <h4 id="book-homework-intent-title">Assignment intent</h4>
            <div className="book-homework-preview__intent-options">
              <label>
                <input
                  type="radio"
                  name="book-homework-intent"
                  checked={policy?.intent === 'accountable'}
                  onChange={() => handleIntentChange('accountable')}
                />
                <span><strong>Accountable</strong><small>Integrity capture defaults on.</small></span>
              </label>
              <label>
                <input
                  type="radio"
                  name="book-homework-intent"
                  checked={policy?.intent === 'practice'}
                  onChange={() => handleIntentChange('practice')}
                />
                <span><strong>Practice</strong><small>Integrity capture defaults off.</small></span>
              </label>
            </div>
            <label className="book-homework-preview__integrity-toggle">
              <input
                type="checkbox"
                checked={policy?.integrityCapture ?? false}
                onChange={(event) => handleIntegrityChange(event.target.checked)}
              />
              <span>Capture Book integrity signals for this handoff</span>
            </label>
            {policy?.integrityOverride && <p className="book-homework-preview__hint">Explicit integrity override will be included in the assignment handoff audit.</p>}
          </section>

          {renderScheduleEditor({ value: schedule, onChange: updateSchedule })}

          {preview.warnings.length > 0 && (
            <section className="book-homework-preview__warnings" aria-labelledby="book-homework-warning-title">
              <h4 id="book-homework-warning-title">Before assignment</h4>
              <ul>
                {preview.warnings.map((warning, index) => (
                  <li
                    key={`${warning.code}-${index}`}
                    className={warning.severity === 'blocker' ? 'is-blocker' : undefined}
                    role={warning.severity === 'blocker' ? 'alert' : undefined}
                  >
                    {warning.message}
                    {warning.code === 'prior-feedback-risk' && onForkBeforeAssign && (
                      <button type="button" onClick={() => {
                        onAction?.('bookHomeworkForkRequested', { reason: warning.code });
                        onForkBeforeAssign();
                      }}>
                        Fork before assign
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="book-homework-preview__no-score">Preview creates no whole-Book attempt, grade, manifest record, Homework record, or Delivery mutation.</p>
      <div className="book-homework-preview__actions">
        <button type="button" onClick={handleCancel}>Cancel preview</button>
        <button
          type="button"
          className="is-primary"
          disabled={!preview?.canConfirm || schedule.dueDate === ''}
          onClick={handleConfirm}
        >
          Confirm preview for assignment handoff
        </button>
      </div>
    </section>
  );
};

export default BookHomeworkPreviewPanel;

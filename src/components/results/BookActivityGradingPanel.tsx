import React from 'react';
import { toast } from '../modern/ToastNotification';
import {
  BookActivityEvaluationBrowserError,
  createBookActivityEvaluationBrowserClient,
  type BookActivityEvaluationBrowserClient,
  type BookActivityEvaluationLocator,
  type BookActivityTeacherEvaluationPresentation,
} from '../../services/book-activity/activityEvaluation.browser';
import './BookActivityGradingPanel.css';

export interface BookActivityGradingPanelProps {
  readonly locator: BookActivityEvaluationLocator;
  readonly studentName: string;
  readonly activityLabel: string;
  readonly client?: BookActivityEvaluationBrowserClient;
  readonly onAction?: (
    action:
      | 'bookActivityEvaluationLoaded'
      | 'bookActivityGradeSubmitted'
      | 'bookActivityRegradeSubmitted'
      | 'bookActivityEvaluationConflict'
      | 'bookActivityEvaluationRetried',
    metadata: Record<string, unknown>,
  ) => void;
}

const visibleError = (error: unknown): string => {
  if (error instanceof BookActivityEvaluationBrowserError) {
    if (error.code === 'unauthorized' || error.code === 'forbidden') {
      return 'You no longer have permission to grade this Activity.';
    }
    if (error.code === 'not_found') return 'This submitted Activity is no longer available.';
    if (error.code === 'route_disabled' || error.code === 'presentation_disabled') {
      return 'Book Activity grading is temporarily unavailable.';
    }
    if (error.code === 'stale_conflict') {
      return 'A newer evaluation was saved before this one.';
    }
  }
  return 'The Activity evaluation could not be loaded. Try again.';
};

const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
};

const responseText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    const encoded = JSON.stringify(value, null, 2);
    return encoded === undefined ? 'No response was recorded.' : encoded;
  } catch {
    return 'The submitted response could not be displayed.';
  }
};

const BookActivityGradingPanelContent: React.FC<BookActivityGradingPanelProps> = ({
  locator,
  studentName,
  activityLabel,
  client: clientOverride,
  onAction,
}) => {
  const [client] = React.useState<BookActivityEvaluationBrowserClient | null>(() => {
    if (clientOverride) return clientOverride;
    try {
      return createBookActivityEvaluationBrowserClient();
    } catch {
      return null;
    }
  });
  const [presentation, setPresentation] = React.useState<BookActivityTeacherEvaluationPresentation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflictRevision, setConflictRevision] = React.useState<number | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [earnedScore, setEarnedScore] = React.useState('');
  const [maximumScore, setMaximumScore] = React.useState('');
  const [feedback, setFeedback] = React.useState('');
  const [correctionNote, setCorrectionNote] = React.useState('');
  const earnedScoreRef = React.useRef<HTMLInputElement>(null);

  const applyPresentation = React.useCallback((
    next: BookActivityTeacherEvaluationPresentation,
    restoreFocus = false,
  ) => {
    setPresentation(next);
    setEarnedScore(next.current?.facts.earnedScore?.toString() ?? '');
    setMaximumScore(next.current?.facts.maximumScore?.toString() ?? '');
    setFeedback(next.current?.facts.feedback ?? '');
    setCorrectionNote('');
    setConflictRevision(null);
    if (restoreFocus) {
      queueMicrotask(() => earnedScoreRef.current?.focus());
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!client) {
      setLoading(false);
      setError('Book Activity grading is temporarily unavailable.');
      return undefined;
    }
    void client.readTeacherEvaluation(locator).then((next) => {
      if (!active) return;
      applyPresentation(next);
      onAction?.('bookActivityEvaluationLoaded', {
        activityId: locator.activityId,
        revision: next.current?.revision ?? 0,
      });
    }).catch((loadError: unknown) => {
      if (active) setError(visibleError(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [applyPresentation, client, locator, onAction, retry]);

  const retryLoad = React.useCallback((restoreFocus = false) => {
    onAction?.('bookActivityEvaluationRetried', {
      activityId: locator.activityId,
      reason: conflictRevision === null ? 'load_error' : 'stale_conflict',
    });
    if (restoreFocus) {
      setLoading(true);
      setError(null);
      void client?.readTeacherEvaluation(locator).then((next) => {
        applyPresentation(next, true);
      }).catch((loadError: unknown) => {
        setError(visibleError(loadError));
      }).finally(() => setLoading(false));
      return;
    }
    setRetry((value) => value + 1);
  }, [applyPresentation, client, conflictRevision, locator, onAction]);

  const submit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !presentation || saving) return;
    const earned = Number(earnedScore);
    const maximum = Number(maximumScore);
    const regrade = presentation.current !== null;
    if (!Number.isFinite(earned)
      || !Number.isFinite(maximum)
      || earned < 0
      || maximum < 0
      || earned > maximum) {
      setError('Enter a valid score between zero and the maximum score.');
      earnedScoreRef.current?.focus();
      return;
    }
    if (regrade && correctionNote.trim() === '') {
      setError('Add a correction note before saving a regrade.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const input = {
        locator,
        expectedRevision: presentation.current?.revision ?? 0,
        earnedScore: earned,
        maximumScore: maximum,
        ...(feedback.trim() === '' ? {} : { feedback: feedback.trim() }),
        ...(correctionNote.trim() === '' ? {} : { correctionNote: correctionNote.trim() }),
      };
      const next = regrade
        ? await client.regrade(input)
        : await client.grade(input);
      applyPresentation(next, true);
      onAction?.(
        regrade ? 'bookActivityRegradeSubmitted' : 'bookActivityGradeSubmitted',
        {
          activityId: locator.activityId,
          revision: next.current?.revision ?? 0,
        },
      );
      toast.success(regrade ? 'Activity regrade saved.' : 'Activity grade saved.');
    } catch (submitError) {
      if (submitError instanceof BookActivityEvaluationBrowserError
        && submitError.code === 'stale_conflict') {
        setConflictRevision(submitError.currentRevision ?? 0);
        onAction?.('bookActivityEvaluationConflict', {
          activityId: locator.activityId,
          expectedRevision: presentation.current?.revision ?? 0,
          currentRevision: submitError.currentRevision ?? null,
        });
      }
      const message = visibleError(submitError);
      setError(message);
      toast.error('Activity evaluation could not be saved.');
    } finally {
      setSaving(false);
    }
  }, [
    applyPresentation,
    client,
    correctionNote,
    earnedScore,
    feedback,
    locator,
    maximumScore,
    onAction,
    presentation,
    saving,
  ]);

  if (loading && !presentation) {
    return (
      <section className="book-grading-panel" aria-label={`Grade ${activityLabel}`}>
        <p className="book-grading-panel__state" role="status">Loading evaluation history…</p>
      </section>
    );
  }

  if (error && !presentation) {
    return (
      <section className="book-grading-panel" aria-label={`Grade ${activityLabel}`}>
        <div className="book-grading-panel__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => retryLoad()}>Try again</button>
        </div>
      </section>
    );
  }

  if (!presentation) return null;
  const allRevisions = [
    ...(presentation.current ? [presentation.current] : []),
    ...presentation.priorRevisions,
  ];

  return (
    <section className="book-grading-panel" aria-labelledby="book-grading-panel-title">
      <header className="book-grading-panel__header">
        <div>
          <p className="book-grading-panel__eyebrow">Book Activity grading</p>
          <h3 id="book-grading-panel-title">{activityLabel}</h3>
          <p>{studentName}</p>
        </div>
        <span className="book-grading-panel__revision">
          {presentation.current ? `Revision ${presentation.current.revision}` : 'Not graded'}
        </span>
      </header>

      {error && (
        <div className="book-grading-panel__error" role="alert">
          <p>{error}</p>
          {conflictRevision !== null ? (
            <button type="button" onClick={() => retryLoad(true)}>
              Reload latest evaluation
            </button>
          ) : (
            <button type="button" onClick={() => retryLoad()}>Try again</button>
          )}
        </div>
      )}

      {conflictRevision !== null && (
        <p className="book-grading-panel__conflict" role="status">
          Latest saved revision: {conflictRevision}. Reload it before retrying your correction.
        </p>
      )}

      <div className="book-grading-panel__submission">
        <h4>Submitted work</h4>
        <pre>{responseText(presentation.submission)}</pre>
      </div>

      <form className="book-grading-panel__form" onSubmit={submit}>
        <div className="book-grading-panel__score-fields">
          <label>
            Earned score
            <input
              ref={earnedScoreRef}
              type="number"
              min="0"
              step="0.01"
              required
              value={earnedScore}
              onChange={(event) => setEarnedScore(event.currentTarget.value)}
            />
          </label>
          <label>
            Maximum score
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={maximumScore}
              onChange={(event) => setMaximumScore(event.currentTarget.value)}
            />
          </label>
        </div>
        <label>
          Feedback
          <textarea
            rows={4}
            maxLength={4_000}
            value={feedback}
            onChange={(event) => setFeedback(event.currentTarget.value)}
          />
        </label>
        {presentation.current && (
          <label>
            Correction note
            <span>Required because this regrade changes an immutable evaluation history.</span>
            <textarea
              rows={3}
              maxLength={1_000}
              required
              value={correctionNote}
              onChange={(event) => setCorrectionNote(event.currentTarget.value)}
            />
          </label>
        )}
        <button className="book-grading-panel__submit" type="submit" disabled={saving}>
          {saving
            ? 'Saving…'
            : presentation.current
              ? 'Save regrade'
              : 'Save grade'}
        </button>
      </form>

      <section className="book-grading-panel__history" aria-labelledby="book-grading-history-title">
        <h4 id="book-grading-history-title">Evaluation history</h4>
        {allRevisions.length === 0 ? (
          <p className="book-grading-panel__state">No evaluation revisions yet.</p>
        ) : (
          <ol>
            {allRevisions.map((revision, index) => (
              <li key={revision.revision}>
                <div>
                  <strong>
                    Revision {revision.revision}
                    {index === 0 ? ' · Current' : ''}
                  </strong>
                  <span>{formatDateTime(revision.evaluatedAt)} · {revision.evaluatedBy.replace('_', ' ')}</span>
                </div>
                <span>{revision.facts.displayScore ?? revision.facts.status.replace('_', ' ')}</span>
                {revision.facts.feedback && <p>{revision.facts.feedback}</p>}
                {revision.facts.correctionFacts.map((fact) => (
                  fact.note ? <p key={`${revision.revision}:${fact.interactionId}`}>{fact.note}</p> : null
                ))}
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
};

const locatorIdentity = (locator: BookActivityEvaluationLocator): string => JSON.stringify([
  locator.bookId,
  locator.studentId,
  locator.contextKind,
  locator.contextId,
  locator.placementId,
  locator.activityId,
  locator.activityVersionId,
  locator.terminalId ?? null,
  locator.attemptId ?? null,
]);

export const BookActivityGradingPanel: React.FC<BookActivityGradingPanelProps> = (props) => (
  <BookActivityGradingPanelContent
    key={locatorIdentity(props.locator)}
    {...props}
  />
);

export default BookActivityGradingPanel;

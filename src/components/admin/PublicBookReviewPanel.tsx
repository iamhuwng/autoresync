import React, { useCallback, useEffect, useState } from 'react';

import { Button, Card } from '../modern';
import {
  approvePublicBook,
  listPublicBookReviewQueue,
  rejectPublicBookReview,
  returnPublicBookToPrivate,
  type MaterialBookListRow,
  type MaterialBooksRepository,
} from '../../services/materialCatalog/materialBooks.service';
import type { MaterialBookValidationContext } from '../../services/materialCatalog/bookValidation.service';

interface PublicBookReviewPanelProps {
  readonly context: MaterialBookValidationContext;
  readonly repository: MaterialBooksRepository;
  readonly onTrackAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
}

type ReviewDecision = 'approve' | 'reject' | 'returnPrivate';

type ReasonSet = Readonly<{
  approve: string;
  reject: string;
  returnPrivate: string;
}>;

type ReasonState = Readonly<Record<string, ReasonSet>>;

const emptyReasons: ReasonSet = {
  approve: '',
  reject: '',
  returnPrivate: '',
};

const panelHeaderStyle: React.CSSProperties = {
  alignItems: 'flex-start',
  display: 'flex',
  gap: '1rem',
  justifyContent: 'space-between',
};

const detailTextStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '0.84rem',
  lineHeight: 1.55,
  margin: '0.35rem 0 0',
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  marginTop: '1rem',
};

const textareaStyle: React.CSSProperties = {
  border: '1px solid rgba(148, 163, 184, 0.34)',
  borderRadius: '8px',
  color: '#1e293b',
  minHeight: '78px',
  padding: '0.6rem',
  resize: 'vertical',
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Public Book review action failed.';

const getReasons = (reasons: ReasonState, bookId: string): ReasonSet =>
  reasons[bookId] ?? emptyReasons;

const decisionActionName = (decision: ReviewDecision): string => {
  if (decision === 'approve') {
    return 'approvePublicBookReview';
  }

  if (decision === 'reject') {
    return 'rejectPublicBookReview';
  }

  return 'returnPublicBookToPrivate';
};

const successMessage = (decision: ReviewDecision, title: string): string => {
  if (decision === 'approve') {
    return `${title} approved for public library.`;
  }

  if (decision === 'reject') {
    return `${title} rejected from public review.`;
  }

  return `${title} returned to private.`;
};

export const PublicBookReviewPanel: React.FC<PublicBookReviewPanelProps> = ({
  context,
  repository,
  onTrackAction,
}) => {
  const [rows, setRows] = useState<readonly MaterialBookListRow[]>([]);
  const [reasons, setReasons] = useState<ReasonState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextRows = await listPublicBookReviewQueue({
        repository,
        testTypeConfigs: context.testTypeConfigs,
      });
      setRows(nextRows);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [context.testTypeConfigs, repository]);

  useEffect(() => {
    if (context.actorRole !== 'super_admin') {
      setRows([]);
      setLoading(false);
      return;
    }

    void loadQueue();
  }, [context.actorRole, loadQueue]);

  const updateReason = (bookId: string, decision: ReviewDecision, value: string): void => {
    setReasons((current) => ({
      ...current,
      [bookId]: {
        ...getReasons(current, bookId),
        [decision]: value,
      },
    }));
  };

  const runDecision = async (row: MaterialBookListRow, decision: ReviewDecision): Promise<void> => {
    const bookId = row.bookId;
    const reason = getReasons(reasons, bookId)[decision].trim();

    if (!reason) {
      setActionError('Review reason is required.');
      return;
    }

    const actionName = decisionActionName(decision);
    setBusyAction(`${actionName}:${bookId}`);
    setActionError(null);
    setActionMessage(null);
    onTrackAction?.(actionName, { bookId });

    try {
      if (decision === 'approve') {
        await approvePublicBook(bookId, repository, context, { reason });
      } else if (decision === 'reject') {
        await rejectPublicBookReview(bookId, reason, repository, context);
      } else {
        await returnPublicBookToPrivate(bookId, reason, repository, context);
      }

      setRows((current) => current.filter((entry) => entry.bookId !== bookId));
      setActionMessage(successMessage(decision, row.title));
    } catch (decisionError) {
      setActionError(getErrorMessage(decisionError));
    } finally {
      setBusyAction(null);
    }
  };

  if (context.actorRole !== 'super_admin') {
    return (
      <Card variant="glass" style={{ padding: '1.5rem' }}>
        <h2 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>Permission denied</h2>
        <p style={detailTextStyle}>Only super administrators can review public Books.</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card variant="glass" style={{ padding: '1.5rem' }}>
        <h2 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>Loading public Book reviews...</h2>
        <p style={detailTextStyle}>Reading pending public review queue.</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="glass" style={{ padding: '1.5rem' }}>
        <h2 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>Public Book reviews failed to load</h2>
        <p role="alert" style={{ ...detailTextStyle, color: '#b91c1c', fontWeight: 700 }}>{error}</p>
        <div style={{ marginTop: '1rem' }}>
          <Button
            variant="glass"
            onClick={() => {
              onTrackAction?.('retryPublicBookReviewQueue');
              void loadQueue();
            }}
          >
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <section aria-labelledby="public-book-review-title">
      <Card variant="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={panelHeaderStyle}>
          <div>
            <h2 id="public-book-review-title" style={{ color: '#1e293b', fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
              Public Book Reviews
            </h2>
            <p style={detailTextStyle}>
              Review Books requested for the public library. Approval writes the public-safe
              projection; reject and return decisions remove any public projection.
            </p>
          </div>
          <Button
            variant="glass"
            onClick={() => {
              onTrackAction?.('retryPublicBookReviewQueue');
              void loadQueue();
            }}
          >
            Refresh
          </Button>
        </div>
      </Card>

      {actionMessage ? (
        <p role="status" style={{ color: '#047857', fontSize: '0.9rem', fontWeight: 800 }}>
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '0.9rem', fontWeight: 800 }}>
          {actionError}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <Card variant="glass" style={{ padding: '1.5rem' }}>
          <h3 style={{ color: '#1e293b', fontSize: '1rem', margin: 0 }}>No pending public Book reviews.</h3>
          <p style={detailTextStyle}>Books appear here after teachers request public review.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rows.map((row) => {
            const rowReasons = getReasons(reasons, row.bookId);
            const approveBusy = busyAction === `approvePublicBookReview:${row.bookId}`;
            const rejectBusy = busyAction === `rejectPublicBookReview:${row.bookId}`;
            const returnBusy = busyAction === `returnPublicBookToPrivate:${row.bookId}`;

            return (
              <Card key={row.bookId} variant="glass" style={{ padding: '1.25rem' }}>
                <div style={panelHeaderStyle}>
                  <div>
                    <h3 style={{ color: '#1e293b', fontSize: '1.05rem', margin: 0 }}>{row.title}</h3>
                    <p style={detailTextStyle}>
                      Owner: {row.ownerId} / Status: {row.status} / Updated: {row.updatedAt}
                    </p>
                    <p style={detailTextStyle}>
                      Test Types: {row.testTypes.map((testType) => testType.shortLabel).join(', ') || 'None'}
                    </p>
                    {row.publicReview?.reason ? (
                      <p style={detailTextStyle}>Request note: {row.publicReview.reason}</p>
                    ) : null}
                  </div>
                </div>

                <div style={fieldGridStyle}>
                  <label style={{ color: '#334155', display: 'grid', fontSize: '0.8rem', fontWeight: 800, gap: '0.35rem' }}>
                    Approval reason for {row.title}
                    <textarea
                      aria-label={`Approval reason for ${row.title}`}
                      value={rowReasons.approve}
                      onChange={(event) => updateReason(row.bookId, 'approve', event.target.value)}
                      style={textareaStyle}
                    />
                    <Button
                      variant="success"
                      aria-label={`Approve ${row.title}`}
                      disabled={!rowReasons.approve.trim()}
                      loading={approveBusy}
                      onClick={() => {
                        void runDecision(row, 'approve');
                      }}
                    >
                      Approve
                    </Button>
                  </label>

                  <label style={{ color: '#334155', display: 'grid', fontSize: '0.8rem', fontWeight: 800, gap: '0.35rem' }}>
                    Rejection reason for {row.title}
                    <textarea
                      aria-label={`Rejection reason for ${row.title}`}
                      value={rowReasons.reject}
                      onChange={(event) => updateReason(row.bookId, 'reject', event.target.value)}
                      style={textareaStyle}
                    />
                    <Button
                      variant="danger"
                      aria-label={`Reject ${row.title}`}
                      disabled={!rowReasons.reject.trim()}
                      loading={rejectBusy}
                      onClick={() => {
                        void runDecision(row, 'reject');
                      }}
                    >
                      Reject
                    </Button>
                  </label>

                  <label style={{ color: '#334155', display: 'grid', fontSize: '0.8rem', fontWeight: 800, gap: '0.35rem' }}>
                    Return-to-private reason for {row.title}
                    <textarea
                      aria-label={`Return-to-private reason for ${row.title}`}
                      value={rowReasons.returnPrivate}
                      onChange={(event) => updateReason(row.bookId, 'returnPrivate', event.target.value)}
                      style={textareaStyle}
                    />
                    <Button
                      variant="warning"
                      aria-label={`Return ${row.title} to private`}
                      disabled={!rowReasons.returnPrivate.trim()}
                      loading={returnBusy}
                      onClick={() => {
                        void runDecision(row, 'returnPrivate');
                      }}
                    >
                      Return to private
                    </Button>
                  </label>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PublicBookReviewPanel;

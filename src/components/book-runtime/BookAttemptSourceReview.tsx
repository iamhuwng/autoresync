import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  BookAttemptSourceContextProjection,
} from '../../services/book-delivery/attemptSourceContextProjection.types';
import { BookPdfViewerHost } from './BookPdfViewerHost';
import { createBookHistoricalAttemptDocumentRoute } from '../../services/book-delivery/bookDelivery.browser';
import './BookAttemptSourceReview.css';

export interface BookAttemptSourceReviewProps {
  readonly projection: BookAttemptSourceContextProjection;
  readonly children: ReactNode;
  readonly onAction?: (
    action: 'switchResultTab' | 'viewQuestion',
    metadata: Record<string, unknown>,
  ) => void;
}

const labelForReason = (
  reason: Extract<
    BookAttemptSourceContextProjection,
    { state: 'historical_source_unavailable' }
  >['reason'],
): string => {
  const readableReason = reason.replace(/[-_]/gu, ' ').replace(/^\w/gu, (letter) => letter.toUpperCase());
  if (['missing', 'deleted', 'replaced', 'invalidated', 'revoked'].includes(reason)) {
    return `Historical PDF unavailable · ${readableReason}`;
  }
  return 'Historical source context unavailable';
};

const pagePillLabel = (
  projection: BookAttemptSourceContextProjection,
): string => projection.metadata
  ? projection.state === 'available'
    ? `Book page · page ${projection.metadata.physicalPageNumber}`
    : `Book page · page ${projection.metadata.physicalPageNumber} · unavailable`
  : 'Book page unavailable';

const unavailableDescription = (
  reason: Extract<
    BookAttemptSourceContextProjection,
    { state: 'historical_source_unavailable' }
  >['reason'],
): string => ['missing', 'deleted', 'replaced', 'invalidated', 'revoked'].includes(reason)
  ? 'The original PDF is unavailable. Result, response, provenance, and permitted feedback remain available.'
  : 'The historical source context could not be verified. Result, response, and permitted feedback remain available.';

export const BookAttemptSourceReview = ({
  projection,
  children,
  onAction,
}: BookAttemptSourceReviewProps) => {
  const [mobileTab, setMobileTab] = useState<'page' | 'activity'>('activity');
  const activityRef = useRef<HTMLElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const interactionFocusId = projection.metadata?.interactionFocusId;
  const focusInteraction = useCallback(() => {
    const targets = activityRef.current?.querySelectorAll<HTMLElement>(
      '[data-book-interaction-id]',
    );
    [...(targets ?? [])].find(
      (target) => target.dataset.bookInteractionId === interactionFocusId,
    )?.focus();
  }, [interactionFocusId]);

  useEffect(() => {
    if (mobileTab === 'page') pageRef.current?.focus();
    else focusInteraction();
  }, [focusInteraction, mobileTab]);

  const metadata = projection.metadata;
  const selectTab = (tab: 'page' | 'activity') => {
    setMobileTab(tab);
    onAction?.('switchResultTab', {
      tab,
      attemptId: metadata?.attemptId,
    });
  };

  return (
    <section
      className="book-attempt-review"
      data-mobile-tab={mobileTab}
      data-testid="book-attempt-source-review"
    >
      <nav aria-label="Historical attempt context" className="book-attempt-review__pills">
        <button
          aria-current={mobileTab === 'page' ? 'page' : undefined}
          onClick={() => selectTab('page')}
          type="button"
        >
          {pagePillLabel(projection)}
        </button>
        <button
          aria-current={mobileTab === 'activity' ? 'page' : undefined}
          onClick={() => {
            selectTab('activity');
            onAction?.('viewQuestion', {
              activityId: metadata?.activityId,
              interactionFocusId: metadata?.interactionFocusId,
            });
          }}
          type="button"
        >
          Activity response
        </button>
      </nav>

      <div className="book-attempt-review__workspace">
        <section
          aria-labelledby="book-attempt-page-title"
          className="book-attempt-review__panel book-attempt-review__panel--page"
          ref={pageRef}
          tabIndex={-1}
        >
          <header className="book-attempt-review__heading">
            <p>Book Page</p>
            <h3 id="book-attempt-page-title">Original book page</h3>
          </header>

          {metadata ? (
            <details className="book-attempt-review__metadata-details">
              <summary>Technical source details</summary>
              <dl className="book-attempt-review__metadata">
                <div><dt>Component</dt><dd>{metadata.componentId}</dd></div>
                <div><dt>Source Version</dt><dd>{metadata.sourceVersionId}</dd></div>
                <div><dt>Local physical page</dt><dd>{metadata.physicalPageNumber}</dd></div>
                <div><dt>Page Group</dt><dd>{metadata.pageGroupId}</dd></div>
                <div><dt>Placement</dt><dd>{metadata.placementId}</dd></div>
                <div><dt>Correspondence</dt><dd>{metadata.correspondence}</dd></div>
              </dl>
            </details>
          ) : null}

          {projection.state === 'available' ? (
            <div className="book-attempt-review__viewer" data-testid="historical-source-viewer">
              <BookPdfViewerHost
                initialPage={projection.metadata.physicalPageNumber}
                key={`${projection.metadata.attemptId}:${projection.documentResource.opaqueRouteKey}`}
                route={createBookHistoricalAttemptDocumentRoute({
                  bookId: projection.metadata.bookId,
                  studentId: projection.metadata.studentId,
                  resultId: projection.metadata.resultId,
                  opaqueRouteKey: projection.documentResource.opaqueRouteKey,
                  sourceVersionId: projection.documentResource.sourceVersionId,
                })}
                title="Historical source document"
              />
            </div>
          ) : (
            <div
              className="book-attempt-review__unavailable"
              data-testid="historical-source-unavailable"
              role="status"
            >
              <strong>{labelForReason(projection.reason)}</strong>
              <span>
                {unavailableDescription(projection.reason)}
              </span>
            </div>
          )}
        </section>

        <section
          aria-labelledby="book-attempt-activity-title"
          className="book-attempt-review__panel book-attempt-review__panel--activity"
          ref={activityRef}
          tabIndex={-1}
        >
          <header className="book-attempt-review__heading">
            <p>Activity</p>
            <h3 id="book-attempt-activity-title">Submitted activity</h3>
          </header>
          {metadata && (
            <p className="book-attempt-review__activity-note">
              Response recorded for this activity and its historical version.
            </p>
          )}
          <div>{children}</div>
        </section>
      </div>
    </section>
  );
};

export default BookAttemptSourceReview;

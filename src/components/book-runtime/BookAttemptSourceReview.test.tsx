import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BookAttemptSourceContextProjection } from '../../services/book-delivery/attemptSourceContextProjection.types';
import { BookAttemptSourceReview } from './BookAttemptSourceReview';

vi.mock('./BookPdfViewerHost', () => ({
  BookPdfViewerHost: ({
    initialPage,
    route,
  }: {
    initialPage: number;
    route: { url: string; sourceVersionId: string; expectedByteLength?: number; expectedEtag?: string };
  }) => (
    <div data-testid="mock-historical-pdf" data-byte-length={route.expectedByteLength} data-etag={route.expectedEtag}>
      {`${route.url}:${route.sourceVersionId}:page-${initialPage}`}
    </div>
  ),
}));

const available: BookAttemptSourceContextProjection = {
  schemaVersion: 1,
  state: 'available',
  metadata: {
    attemptId: 'attempt-1',
    resultId: 'result-1',
    bookId: 'book-1',
    studentId: 'student-1',
    surface: 'homework',
    contextId: 'homework-1',
    ownerId: 'teacher-1',
    componentId: 'component-a',
    sourceKey: 'component-a',
    sourceVersionId: 'source-version-4',
    physicalPageNumber: 7,
    pageGroupId: 'page-group-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-3',
    activityVersion: 3,
    interactionFocusId: 'interaction-1',
    correspondence: 'source-assisted',
  },
  documentResource: {
    sourceKey: 'component-a',
    sourceVersionId: 'source-version-4',
    opaqueRouteKey: 'opaque-attempt-1',
    localPageScope: { kind: 'pages', pages: [7] },
  },
};

describe('BookAttemptSourceReview', () => {
  it('opens the pinned combined page while preserving component-local provenance', () => {
    render(
      <BookAttemptSourceReview projection={{
        ...available,
        state: 'available',
        metadata: { ...available.metadata!, combinedPhysicalPageNumber: 17,
          pageGroupIds: ['page-group-1', 'page-group-2'],
          pageContexts: [
            { sourceKey: 'component-a', sourceVersionId: 'source-version-4', physicalPageNumber: 7, combinedPhysicalPageNumber: 17 },
            { sourceKey: 'component-b', sourceVersionId: 'source-version-9', physicalPageNumber: 2, combinedPhysicalPageNumber: 22 },
          ] },
        documentResource: { sourceKey: 'student-document', sourceVersionId: 'combined-version-1',
          opaqueRouteKey: 'pinned-combined', localPageScope: { kind: 'all', pages: [] },
          studentDocument: { descriptorRevision: 4, sha256Hex: 'a'.repeat(64),
            descriptorFingerprint: 'fnv1a64:1234567890abcdef', expectedByteLength: 1000, physicalPageCount: 30 } },
      }}>
        <p>Preserved response</p>
      </BookAttemptSourceReview>,
    );
    expect(screen.getByRole('button', { name: 'Book page · page 17' })).toBeInTheDocument();
    expect(screen.getByTestId('mock-historical-pdf')).toHaveTextContent(':combined-version-1:page-17');
    expect(screen.getByTestId('mock-historical-pdf')).toHaveAttribute('data-byte-length', '1000');
    expect(screen.getByTestId('mock-historical-pdf')).not.toHaveAttribute('data-etag');
    fireEvent.click(screen.getByText('Technical source details'));
    expect(screen.getByText('Local page 7 · book page 17')).toBeVisible();
    expect(screen.getByText('Local page 2 · book page 22')).toBeVisible();
    expect(screen.getByText('page-group-1, page-group-2')).toBeVisible();
  });
  it('renders exact context pills, metadata, response, and historical PDF route', async () => {
    render(
      <BookAttemptSourceReview projection={available}>
        <p
          aria-label="Interaction interaction-1"
          data-book-interaction-id="interaction-1"
          tabIndex={-1}
        >
          Preserved submitted response
        </p>
      </BookAttemptSourceReview>,
    );

    expect(screen.getByRole('button', { name: /Book page.*page 7/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activity response' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Technical source details'));
    expect(screen.getByText('source-version-4')).toBeVisible();
    expect(screen.getByText('page-group-1')).toBeVisible();
    expect(screen.getByText('placement-1')).toBeVisible();
    expect(screen.getByText('source-assisted')).toBeVisible();
    expect(screen.getByTestId('mock-historical-pdf'))
      .toHaveTextContent(
        '/v1/book-delivery/historical-document/book-1/student-1/result-1/opaque-attempt-1'
          + ':source-version-4:page-7',
      );
    expect(screen.getByText('Preserved submitted response')).toBeInTheDocument();
    await waitFor(() => expect(
      screen.getByLabelText('Interaction interaction-1'),
    ).toHaveFocus());
  });

  it('switches the compact page/activity view with keyboard-operable buttons and moves focus', () => {
    const onAction = vi.fn();
    render(
      <BookAttemptSourceReview projection={available} onAction={onAction}>
        <p
          aria-label="Interaction interaction-1"
          data-book-interaction-id="interaction-1"
          tabIndex={-1}
        >
          Response
        </p>
      </BookAttemptSourceReview>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Book page.*page 7/u }));
    expect(screen.getByTestId('book-attempt-source-review')).toHaveAttribute('data-mobile-tab', 'page');
    expect(screen.getByRole('heading', { name: 'Original book page' }).closest('section'))
      .toHaveFocus();
    expect(onAction).toHaveBeenCalledWith('switchResultTab', {
      tab: 'page',
      attemptId: 'attempt-1',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Activity response' }));
    expect(screen.getByTestId('book-attempt-source-review')).toHaveAttribute('data-mobile-tab', 'activity');
    expect(screen.getByLabelText('Interaction interaction-1')).toHaveFocus();
    expect(onAction).toHaveBeenCalledWith('viewQuestion', {
      activityId: 'activity-1',
      interactionFocusId: 'interaction-1',
    });
  });

  it.each(['missing', 'deleted', 'replaced', 'invalidated', 'revoked'] as const)(
    'keeps %s attempts metadata-only and does not mount a substitute PDF',
    (reason) => {
      const unavailable: BookAttemptSourceContextProjection = {
        schemaVersion: 1,
        state: 'historical_source_unavailable',
        reason,
        metadata: available.metadata,
        documentResource: null,
      };
      render(
        <BookAttemptSourceReview projection={unavailable}>
          <p>Answers and permitted feedback remain</p>
        </BookAttemptSourceReview>,
      );

      expect(screen.getByText(`Historical PDF unavailable · ${reason[0]!.toUpperCase()}${reason.slice(1)}`)).toBeInTheDocument();
      expect(screen.queryByTestId('mock-historical-pdf')).not.toBeInTheDocument();
      expect(screen.getByText('Answers and permitted feedback remain')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Technical source details'));
      expect(screen.getByText('source-version-4')).toBeVisible();
    },
  );

  it.each(['missing_context', 'malformed_context', 'authorization_unavailable'] as const)(
    'fails closed when immutable source context is %s', (reason) => {
    render(
      <BookAttemptSourceReview projection={{
        schemaVersion: 1,
        state: 'historical_source_unavailable',
        reason,
        metadata: null,
        documentResource: null,
      }}>
        <p>Result remains readable</p>
      </BookAttemptSourceReview>,
    );

    expect(screen.getByText('Historical source context unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-historical-pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Result remains readable')).toBeInTheDocument();
    },
  );
});

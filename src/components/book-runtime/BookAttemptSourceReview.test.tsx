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
    route: { url: string; sourceVersionId: string };
  }) => (
    <div data-testid="mock-historical-pdf">
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

    expect(screen.getByRole('button', { name: /Component component-a.*page 7/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activity-1.*interaction-1/u })).toBeInTheDocument();
    expect(screen.getByText('source-version-4')).toBeInTheDocument();
    expect(screen.getByText('page-group-1')).toBeInTheDocument();
    expect(screen.getByText('placement-1')).toBeInTheDocument();
    expect(screen.getByText('source-assisted')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /Component component-a.*page 7/u }));
    expect(screen.getByTestId('book-attempt-source-review')).toHaveAttribute('data-mobile-tab', 'page');
    expect(screen.getByRole('heading', { name: 'Historical source context' }).closest('section'))
      .toHaveFocus();
    expect(onAction).toHaveBeenCalledWith('switchResultTab', {
      tab: 'page',
      attemptId: 'attempt-1',
    });

    fireEvent.click(screen.getByRole('button', { name: /activity-1.*interaction-1/u }));
    expect(screen.getByTestId('book-attempt-source-review')).toHaveAttribute('data-mobile-tab', 'activity');
    expect(screen.getByLabelText('Interaction interaction-1')).toHaveFocus();
    expect(onAction).toHaveBeenCalledWith('viewQuestion', {
      activityId: 'activity-1',
      interactionFocusId: 'interaction-1',
    });
  });

  it.each(['deleted', 'replaced'] as const)(
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

      expect(screen.getByText('Historical PDF unavailable')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-historical-pdf')).not.toBeInTheDocument();
      expect(screen.getByText('Answers and permitted feedback remain')).toBeInTheDocument();
      expect(screen.getByText('source-version-4')).toBeInTheDocument();
    },
  );

  it('fails closed when immutable source context is missing', () => {
    render(
      <BookAttemptSourceReview projection={{
        schemaVersion: 1,
        state: 'historical_source_unavailable',
        reason: 'missing_context',
        metadata: null,
        documentResource: null,
      }}>
        <p>Result remains readable</p>
      </BookAttemptSourceReview>,
    );

    expect(screen.getByText('Historical source context unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-historical-pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Result remains readable')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedActivity } from '../../../types/bookActivity.types';
import { projectStudentActivity } from '../../../services/book-activity/activityProjection.service';
import type { CandidateUnitPreviewProjection } from '../../../services/book-assembly/unitPreview.service';
import { BookAssemblyStudentPreviewHost } from './BookAssemblyStudentPreviewHost';
import type { BookPdfViewerHostProps } from '../../book-runtime/BookPdfViewerHost';

vi.mock('../../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../../book-runtime/BookPdfViewerHost', () => ({
  BookPdfViewerHost: ({ title, initialPage, route, allowedPages, onPageChange }: BookPdfViewerHostProps) => (
    <div data-testid="candidate-pdf" data-route={'url' in route ? route.url : undefined}>{title} page {initialPage}
      {allowedPages?.map(page => <button key={page} onClick={() => onPageChange?.(page)}>View page {page}</button>)}
    </div>
  ),
}));

const activity = (key: string) => projectStudentActivity({
  schemaVersion: 1,
  title: `Activity ${key}`,
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: `Instructions ${key}` }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: `choice-${key}`,
    prompt: `Choose ${key}`,
    options: ['A', 'B'],
    itemIdentities: { family: 'choice', optionIds: [`${key}-a`, `${key}-b`] },
    answerKey: { family: 'choice', acceptedOptionItemIds: [`${key}-a`] },
  }],
  scoring: { mode: 'auto-where-possible' },
} satisfies NormalizedActivity);

const preview = (input: {
  readonly registryVersion?: string;
  readonly opaqueRouteKey?: string;
} = {}): CandidateUnitPreviewProjection => ({
  bookId: 'book-1', bookRevision: 2, candidateId: 'candidate-1', candidateRevision: 1,
  sourceSetRevision: 3, unitKey: 'unit-1', registryVersion: input.registryVersion ?? 'registry-v1',
  activities: ['one', 'two'].map((key) => ({
    activityKey: key,
    projection: activity(key),
    sourceContext: { available: true, description: 'Combined Book pages.' },
  })),
  runtime: {
    schemaVersion: 1, projectionKind: 'book-runtime-candidate-preview', candidateId: 'candidate-1',
    candidateRevision: 1, sourceSetRevision: 3, unitKey: 'unit-1',
    book: { bookId: 'book-1', bookMode: 'pdf', bookRevision: 2 },
    context: { contextId: 'candidate-1', kind: 'preview', entitlementBasis: 'candidate-preview' },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
    sourceSet: { strategy: 'component_pdfs', sources: [] },
    documentRequests: [{
      opaqueRouteKey: input.opaqueRouteKey ?? 'student-document',
      expectedByteLength: 4096,
      expectedEtag: '"student-document"',
    }],
    pageGroups: [
      { pageGroupKey: 'pages-1', combinedPhysicalPages: [2] },
      { pageGroupKey: 'pages-2', combinedPhysicalPages: [8] },
    ],
    activities: ['one', 'two'].map((key, index) => ({
      placementId: `candidate-1:${key}`, activityId: key, nodeKey: `pages-${index + 1}`,
      order: index + 1, contextMode: 'required',
      sourceContext: {
        available: true, description: 'Combined Book pages.', pageGroupKeys: [`pages-${index + 1}`], sourcePageScopes: [],
      },
    })),
    actionFlags: { canAutosave: false, canSubmit: false, canReview: false },
  },
});

const fullPdfPreview = (): CandidateUnitPreviewProjection => {
  const base = preview();
  return {
    ...base,
    runtime: {
      ...base.runtime!,
      sourceSet: {
        strategy: 'full_pdf',
        sources: [{
          sourceKey: 'full', sourceVersionId: 'version-1', sourceOrder: 1,
          lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] },
        }],
      },
      documentRequests: [{
        sourceKey: 'full', sourceVersionId: 'version-1', opaqueRouteKey: 'full',
        localPageScope: { kind: 'all', pages: [] },
      }],
    },
  };
};

describe('BookAssemblyStudentPreviewHost', () => {
  it('renders the existing single-source full-PDF teacher route', async () => {
    const user = userEvent.setup();
    render(
      <BookAssemblyStudentPreviewHost bookTitle="Full Book" preview={fullPdfPreview()} workerOrigin="https://worker.example" />,
    );
    expect(screen.getByTestId('candidate-pdf')).toHaveAttribute(
      'data-route',
      'https://worker.example/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/1/full/version-1/3/2',
    );
    expect(screen.getByTestId('candidate-pdf')).toHaveTextContent('Book document page 2');
    await user.click(screen.getByRole('button', { name: 'View page 8' }));
    expect(screen.getByTestId('candidate-pdf')).toHaveTextContent('page 8');
    expect(screen.queryByRole('navigation', { name: 'Authorized Book components' })).not.toBeInTheDocument();
  });

  it('renders one combined teacher document and navigates by combined page', async () => {
    const user = userEvent.setup();
    render(
      <BookAssemblyStudentPreviewHost bookTitle="Component Book" preview={preview()} workerOrigin="https://worker.example" />,
    );
    expect(screen.getByTestId('candidate-pdf')).toHaveTextContent('combined student document page 2');
    expect(screen.getByTestId('candidate-pdf')).toHaveAttribute(
      'data-route',
      'https://worker.example/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/1/student-document/3/2',
    );
    expect(screen.queryByRole('navigation', { name: 'Authorized Book components' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View page 8' }));
    expect(screen.getByRole('heading', { name: 'Activity two' })).toBeInTheDocument();
    expect(screen.getByTestId('candidate-pdf')).toHaveTextContent('page 8');
  });

  it('preserves answers across route refresh and resets them on canonical content change', async () => {
    const user = userEvent.setup();
    const rendered = render(
      <BookAssemblyStudentPreviewHost bookTitle="Book" preview={preview()} workerOrigin="https://worker.example" />,
    );
    await user.click(screen.getByRole('radio', { name: 'A' }));
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();

    rendered.rerender(
      <BookAssemblyStudentPreviewHost
        bookTitle="Book"
        preview={preview({ opaqueRouteKey: 'refreshed-student-document' })}
        workerOrigin="https://worker.example"
      />,
    );
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();

    rendered.rerender(
      <BookAssemblyStudentPreviewHost
        bookTitle="Book"
        preview={preview({ registryVersion: 'registry-v2' })}
        workerOrigin="https://worker.example"
      />,
    );
    expect(screen.getByRole('radio', { name: 'A' })).not.toBeChecked();
  });

  it('fails closed without exactly one combined request', () => {
    const stale = preview();
    render(
      <BookAssemblyStudentPreviewHost
        bookTitle="Old"
        preview={{ ...stale, runtime: { ...stale.runtime!, documentRequests: [] } }}
        workerOrigin="https://worker.example"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
  });

  it('fails closed for a stale projection without the shared runtime contract', () => {
    render(<BookAssemblyStudentPreviewHost bookTitle="Old" preview={{ ...preview(), runtime: undefined }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh preview');
    expect(screen.queryByTestId('book-runtime-shell')).not.toBeInTheDocument();
  });
});

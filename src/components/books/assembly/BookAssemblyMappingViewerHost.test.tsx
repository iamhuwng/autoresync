import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookUnitCandidate, TrustedBookSourceVersionProjection } from '../../../types/bookAssembly.types';
import { createBookTeacherAssemblyDocumentRoute } from '../../../services/book-delivery/bookTeacherAssemblyDocument.types';
import type { BookTeacherAssemblyDocumentProjection } from '../../../services/book-delivery/bookTeacherAssemblyDocument.types';
import BookAssemblyMappingViewerHost from './BookAssemblyMappingViewerHost';

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(({ title, initialPage }: { readonly title: string; readonly initialPage?: number }) => (
    <div data-testid="mapping-viewer-host">{title}:{initialPage ?? 'default'}</div>
  )),
}));

vi.mock('../../book-runtime/BookPdfViewerHost', () => ({
  default: mocks.viewer,
}));

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { sourceVersionId: 'source-full', bookId: 'book-1', physicalPageCount: 40, verifiedUsable: true },
  { sourceVersionId: 'source-part-a', bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true },
];

const document = (
  sourceKey: string,
  sourceVersionId: string,
  physicalPageNumber = 1,
): BookTeacherAssemblyDocumentProjection => ({
  kind: 'teacher_assembly',
  bookId: 'book-1',
  candidateId: 'candidate-1',
  candidateRevision: 1,
  bookRevision: 2,
  sourceSetRevision: 3,
  sourceKey,
  sourceVersionId,
  route: createBookTeacherAssemblyDocumentRoute({
    workerOrigin: 'https://worker.example',
    bookId: 'book-1',
    unitKey: 'unit-1',
    candidateId: 'candidate-1',
    candidateRevision: 1,
    sourceKey,
    sourceVersionId,
    sourceSetRevision: 3,
    bookRevision: 2,
    physicalPageNumber,
  }),
});

const selectedUnit: BookUnitCandidate = {
  unitKey: 'unit-1',
  activitySlots: [],
  pageGroups: [
    {
      pageGroupKey: 'pages-full-2',
      sourceKey: 'full',
      pages: [2],
      activityKeys: [],
      mode: 'reference_only',
      defaultPhysicalPageNumber: 2,
    },
  ],
};

describe('BookAssemblyMappingViewerHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when no current authorized documents exist', () => {
    render(
      <BookAssemblyMappingViewerHost
        bookTitle="Assembly Book"
        documents={[]}
        sourceVersions={sourceVersions}
        selectedSourceVersionId={null}
        onDocumentSelected={vi.fn()}
        onViewerPageSelected={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Preview is unavailable');
    expect(mocks.viewer).not.toHaveBeenCalled();
  });

  it('renders only authorized source controls and preview host after explicit selection', async () => {
    const user = userEvent.setup();
    const onDocumentSelected = vi.fn();

    render(
      <BookAssemblyMappingViewerHost
        bookTitle="Assembly Book"
        documents={[document('full', 'source-full', 3)]}
        sourceVersions={sourceVersions}
        selectedSourceVersionId={null}
        onDocumentSelected={onDocumentSelected}
        onViewerPageSelected={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('mapping-viewer-host')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preview full' }));

    expect(onDocumentSelected).toHaveBeenCalledWith('source-full');
  });

  it('emits source-qualified local page selections without implicit save', async () => {
    const user = userEvent.setup();
    const onViewerPageSelected = vi.fn();

    render(
      <BookAssemblyMappingViewerHost
        bookTitle="Assembly Book"
        documents={[document('full', 'source-full', 3)]}
        sourceVersions={sourceVersions}
        selectedSourceVersionId="source-full"
        selectedUnit={selectedUnit}
        onDocumentSelected={vi.fn()}
        onViewerPageSelected={onViewerPageSelected}
      />,
    );

    expect(screen.getByTestId('mapping-viewer-host')).toHaveTextContent('Assembly Book');
    await user.clear(screen.getByLabelText('Viewer local page'));
    await user.type(screen.getByLabelText('Viewer local page'), '12');
    await user.click(screen.getByRole('button', { name: 'Use viewer page for mapping' }));

    expect(onViewerPageSelected).toHaveBeenCalledWith({
      sourceKey: 'full',
      sourceVersionId: 'source-full',
      physicalPageNumber: 12,
    });
  });

  it('replays mapped Page Group selection and reports stale/out-of-range mappings', async () => {
    const user = userEvent.setup();
    const onDocumentSelected = vi.fn();
    const onViewerPageSelected = vi.fn();
    const onError = vi.fn();

    render(
      <BookAssemblyMappingViewerHost
        bookTitle="Assembly Book"
        documents={[document('full', 'source-full')]}
        sourceVersions={sourceVersions}
        selectedSourceVersionId="source-full"
        selectedUnit={selectedUnit}
        onDocumentSelected={onDocumentSelected}
        onViewerPageSelected={onViewerPageSelected}
        onError={onError}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Preview full page 2' }));
    expect(onDocumentSelected).toHaveBeenCalledWith('source-full');
    expect(onViewerPageSelected).toHaveBeenCalledWith({
      sourceKey: 'full',
      sourceVersionId: 'source-full',
      physicalPageNumber: 2,
    });

    await user.clear(screen.getByLabelText('Viewer local page'));
    await user.type(screen.getByLabelText('Viewer local page'), '41');
    await user.click(screen.getByRole('button', { name: 'Use viewer page for mapping' }));
    expect(onError).toHaveBeenCalledWith('Selected page is outside the authorized Source Version.');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedActivity } from '../../../types/bookActivity.types';
import type { BookAssemblyCandidateRecord } from '../../../services/book-assembly/unitAssembly.types';
import { createCandidateUnitPreview } from '../../../services/book-assembly/unitPreview.service';
import type { BookTeacherAssemblyDocumentProjection } from '../../../services/book-delivery/bookTeacherAssemblyDocument.types';
import { BookAssemblyStudentPreviewHost } from './BookAssemblyStudentPreviewHost';

vi.mock('../../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../../book-runtime/BookPdfViewerHost', () => ({
  BookPdfViewerHost: ({ title, initialPage, route }: { title: string; initialPage?: number; route: { url: string } }) => (
    <div data-testid="candidate-pdf" data-route={route.url}>{title} page {initialPage}</div>
  ),
}));

const activity = (key: string): NormalizedActivity => ({
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
});

const candidate = (strategy: 'full_pdf' | 'component_pdfs', revision = 1): BookAssemblyCandidateRecord => {
  const component = strategy === 'component_pdfs';
  const sources = component
    ? [
        { sourceKey: 'component-1', sourceVersionId: 'source-1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'component-2', sourceVersionId: 'source-2', sourceOrder: 2, ownerNodeKey: 'unit-1' },
      ] as const
    : [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }] as const;
  return {
    candidateId: 'candidate-1', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 2,
    sourceSetRevision: 3, unitKey: 'unit-1', revision, lifecycle: 'validated',
    validation: { valid: true, errors: [] }, updatedAt: '2026-08-28T00:00:00.000Z',
    manifest: {
      bookId: 'book-1',
      sourceSet: component
        ? { sourceStrategy: 'component_pdfs', sources }
        : { sourceStrategy: 'full_pdf', sources },
      nodes: [
        { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
        { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
      ],
      units: [{
        unitKey: 'unit-1',
        activitySlots: component
          ? [
              { activityKey: 'one', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] },
              { activityKey: 'two', order: 2, contextRequirement: 'required', pageGroupKeys: ['pages-2'] },
            ]
          : [{ activityKey: 'one', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
        pageGroups: component
          ? [
              { pageGroupKey: 'pages-1', sourceKey: 'component-1', pages: [2], activityKeys: ['one'], mode: 'activity' },
              { pageGroupKey: 'pages-2', sourceKey: 'component-2', pages: [3], activityKeys: ['two'], mode: 'activity' },
            ]
          : [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [2], activityKeys: ['one'], mode: 'activity' }],
      }],
    },
  };
};

const preview = (strategy: 'full_pdf' | 'component_pdfs', revision = 1) => createCandidateUnitPreview({
  candidate: candidate(strategy, revision),
  sourceVersions: strategy === 'component_pdfs'
    ? [
        { sourceVersionId: 'source-1', bookId: 'book-1', physicalPageCount: 5, verifiedUsable: true },
        { sourceVersionId: 'source-2', bookId: 'book-1', physicalPageCount: 5, verifiedUsable: true },
      ]
    : [{ sourceVersionId: 'source-1', bookId: 'book-1', physicalPageCount: 5, verifiedUsable: true }],
  sourceIsPreviewReady: () => true,
  activitiesByKey: strategy === 'component_pdfs' ? { one: activity('one'), two: activity('two') } : { one: activity('one') },
  registryVersion: 'registry-v1',
});

const documents = (strategy: 'full_pdf' | 'component_pdfs'): readonly BookTeacherAssemblyDocumentProjection[] => (
  (strategy === 'component_pdfs'
    ? [['component-1', 'source-1'], ['component-2', 'source-2']]
    : [['full', 'source-1']]
  ).map(([sourceKey, sourceVersionId]) => ({
    kind: 'teacher_assembly' as const,
    bookId: 'book-1', candidateId: 'candidate-1', candidateRevision: 1,
    bookRevision: 2, sourceSetRevision: 3, sourceKey: sourceKey!, sourceVersionId: sourceVersionId!,
    route: { url: `http://localhost:8787/${sourceKey}`, sourceVersionId: sourceVersionId! },
  }))
);

describe('BookAssemblyStudentPreviewHost', () => {
  it('mounts the real Book shell with outline, PDF, Activity, and ephemeral responses', async () => {
    const user = userEvent.setup();
    const rendered = render(
      <BookAssemblyStudentPreviewHost bookTitle="English Book" documents={documents('full_pdf')} preview={preview('full_pdf')} />,
    );
    expect(screen.getByRole('heading', { name: 'Student Book preview' })).toBeInTheDocument();
    expect(screen.getByTestId('book-runtime-shell')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'English Book' })).toBeInTheDocument();
    expect(screen.getByTestId('book-runtime-outline')).toHaveTextContent('unit-1');
    expect(screen.getByTestId('candidate-pdf')).toHaveTextContent('English Book — full page 2');
    await user.click(screen.getByRole('radio', { name: 'A' }));
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();

    rendered.rerender(
      <BookAssemblyStudentPreviewHost bookTitle="English Book" documents={documents('full_pdf')} preview={preview('full_pdf', 2)} />,
    );
    expect(screen.getByRole('radio', { name: 'A' })).not.toBeChecked();
  });

  it('preserves Component-PDF order and switches the authorized PDF with Activity navigation', async () => {
    const user = userEvent.setup();
    render(
      <BookAssemblyStudentPreviewHost bookTitle="Component Book" documents={documents('component_pdfs')} preview={preview('component_pdfs')} />,
    );
    expect(screen.getByRole('navigation', { name: 'Authorized Book components' })).toBeInTheDocument();
    expect(screen.getByTestId('candidate-pdf')).toHaveTextContent('component-1');
    await user.click(screen.getByRole('button', { name: /Component 2/i }));
    expect(screen.getByTestId('candidate-pdf')).toHaveTextContent('component-2 page 3');
    await user.click(screen.getByRole('button', { name: 'Next Activity' }));
    expect(screen.getByRole('heading', { name: 'Activity two' })).toBeInTheDocument();
  });

  it('derives current candidate document routes for the ordinary product flow', () => {
    render(
      <BookAssemblyStudentPreviewHost
        bookTitle="Component Book"
        preview={preview('component_pdfs')}
        workerOrigin="https://worker.example"
      />,
    );
    const renderedDocuments = screen.getAllByTestId('candidate-pdf');
    expect(renderedDocuments[0]).toHaveAttribute(
      'data-route',
      'https://worker.example/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/1/component-1/source-1/3/2',
    );
    expect(screen.queryByText(/authorization is unavailable/i)).not.toBeInTheDocument();
  });

  it('fails closed for a stale projection without the shared runtime contract', () => {
    render(<BookAssemblyStudentPreviewHost bookTitle="Old" preview={{ ...preview('full_pdf'), runtime: undefined }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh preview');
    expect(screen.queryByTestId('book-runtime-shell')).not.toBeInTheDocument();
  });
});

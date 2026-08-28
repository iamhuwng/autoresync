import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookAssemblyPreviewClient } from '../../services/book-assembly/assemblyPublication.client';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import BookPdfFlowWorkspace from './BookPdfFlowWorkspace';

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

const candidate = (strategy: 'component_pdfs' | 'full_pdf'): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 2,
  sourceSetRevision: 3,
  unitKey: 'unit-b',
  revision: 4,
  lifecycle: 'validated',
  manifest: {
    bookId: 'book-1',
    sourceSet: {
      sourceStrategy: strategy,
      sources: strategy === 'component_pdfs'
        ? [
            { sourceKey: 'component-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'unit-a' },
            { sourceKey: 'component-b', sourceVersionId: 'source-b', sourceOrder: 2, ownerNodeKey: 'unit-b' },
          ]
        : [{ sourceKey: 'full', sourceVersionId: 'source-b', sourceOrder: 1 }],
    },
    nodes: [
      { nodeKey: 'section-a', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-a', parentNodeKey: 'section-a', nodeType: 'unit', order: 1 },
      { nodeKey: 'section-b', parentNodeKey: null, nodeType: 'section', order: 2 },
      { nodeKey: 'unit-b', parentNodeKey: 'section-b', nodeType: 'unit', order: 1 },
    ],
    units: [
      {
        unitKey: 'unit-a',
        activitySlots: [{ activityKey: 'activity-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-a'] }],
        pageGroups: [{ pageGroupKey: 'pages-a', sourceKey: strategy === 'component_pdfs' ? 'component-a' : 'full', pages: [1], activityKeys: ['activity-a'], mode: 'activity', defaultPhysicalPageNumber: 1 }],
      },
      {
        unitKey: 'unit-b',
        activitySlots: [{ activityKey: 'activity-b', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-b'] }],
        pageGroups: [{ pageGroupKey: 'pages-b', sourceKey: strategy === 'component_pdfs' ? 'component-b' : 'full', pages: [1], activityKeys: ['activity-b'], mode: 'activity', defaultPhysicalPageNumber: 1 }],
      },
    ],
  },
  validation: { valid: true, errors: [] },
  updatedAt: '2026-08-28T00:00:00.000Z',
});

const previewClient = (): BookAssemblyPreviewClient => ({
  preview: vi.fn(async () => ({
    status: 'previewed' as const,
    preview: {
      bookId: 'book-1',
      bookRevision: 2,
      candidateId: 'candidate-1',
      candidateRevision: 4,
      sourceSetRevision: 3,
      unitKey: 'unit-b',
      registryVersion: 'registry-v1',
      activities: [{
        activityKey: 'activity-b',
        sourceContext: { available: true, description: 'Component B page 1.' },
        projection: {
          schemaVersion: 1,
          title: 'Student-visible Unit B activity',
          taskProfile: null,
          presentationMode: 'structured',
          contextRequirement: { mode: 'none', acceptedKinds: [] },
          instructions: [{ text: 'Student preview content.' }],
          interaction: { family: 'choice', variant: 'v1' },
          answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
          stimulus: null,
          assetRefs: [],
          interactions: [{ family: 'choice', interactionId: 'choice-b', prompt: 'Choose B', options: [{ itemId: 'b', label: 'B' }] }],
          scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
        },
      }],
    },
  })),
  approve: vi.fn(),
  publish: vi.fn(),
});

describe('BookPdfFlowWorkspace student preview', () => {
  it.each([
    ['Component-PDF', 'component_pdfs'],
    ['Full-PDF', 'full_pdf'],
  ] as const)('opens the returned candidate Unit preview in %s mode', async (_label, strategy) => {
    const user = userEvent.setup();
    const initialCandidate = candidate(strategy);
    render(
      <BookPdfFlowWorkspace
        access="owner"
        bookId="book-1"
        title={`${_label} Book`}
        presentation="modal"
        uploadWorkflow={null}
        uploadEnabled={false}
        assemblySourceVersions={strategy === 'component_pdfs'
          ? [
              { sourceVersionId: 'source-a', bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true },
              { sourceVersionId: 'source-b', bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true },
            ]
          : [{ sourceVersionId: 'source-b', bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true }]}
        assemblyInitialCandidate={initialCandidate}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
        assemblyPreviewClient={previewClient()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));

    expect(await screen.findByRole('heading', { name: 'Candidate runtime preview' })).toBeInTheDocument();
    expect(screen.getByText('Student preview content.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Exit preview' }));
    expect(screen.queryByRole('heading', { name: 'Candidate runtime preview' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh preview' }));
    expect(await screen.findByRole('heading', { name: 'Candidate runtime preview' })).toBeInTheDocument();
  });

  it('clears a stale preview failure after a successful retry', async () => {
    const user = userEvent.setup();
    const client = previewClient();
    vi.mocked(client.preview)
      .mockRejectedValueOnce(new Error('temporary preview failure'));

    render(
      <BookPdfFlowWorkspace
        access="owner"
        bookId="book-1"
        title="Component-PDF Book"
        presentation="modal"
        uploadWorkflow={null}
        uploadEnabled={false}
        assemblySourceVersions={[
          { sourceVersionId: 'source-a', bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true },
          { sourceVersionId: 'source-b', bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true },
        ]}
        assemblyInitialCandidate={candidate('component_pdfs')}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
        assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('temporary preview failure');

    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    expect(await screen.findByRole('heading', { name: 'Candidate runtime preview' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

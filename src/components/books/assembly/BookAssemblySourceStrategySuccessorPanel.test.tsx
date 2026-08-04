import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPreviewApprovalReference,
} from '../../../types/bookAssembly.types';
import type { BookAssemblySourceStrategySuccessorClient } from '../../../services/book-assembly/assemblyClient.browser';
import BookAssemblySourceStrategySuccessorPanel from './BookAssemblySourceStrategySuccessorPanel';

const previewApproval: BookAssemblyPreviewApprovalReference = {
  approvalId: 'approval-71',
  approvalRevision: 1,
  approvedAt: '2026-07-27T23:00:00.000Z',
  expiresAt: '2026-07-28T01:00:00.000Z',
};

const predecessor: BookAssemblyImmutableManifestVersion = {
  schemaVersion: 1,
  manifestVersionId: 'manifest-before',
  publicationId: 'publication-before',
  publicationRevision: 4,
  lifecycle: 'published',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 7,
  sourceSetRevision: 4,
  candidateId: 'candidate-before',
  candidateRevision: 3,
  strategy: 'full_pdf',
  adapterTicket: '16',
  inputFingerprint: 'fnv1a64:before',
  createdByCommandId: '00000000-0000-4000-8000-000000000064',
  createdAt: '2026-07-27T22:00:00.000Z',
  manifest: {
    bookId: 'book-1',
    sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] },
    nodes: [
      { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
    ],
    units: [{
      unitKey: 'unit-1',
      activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
      pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [2], activityKeys: ['activity-1'], mode: 'activity' }],
    }],
  },
  studentSafeProjection: {
    schemaVersion: 1,
    bookId: 'book-1',
    publicationId: 'publication-before',
    publicationRevision: 4,
    sourceStrategy: 'full_pdf',
    sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] },
    units: [],
  },
};

const sourceVersions = [
  { sourceVersionId: 'full-v1', bookId: 'book-1', physicalPageCount: 10, verifiedUsable: true },
  { sourceVersionId: 'component-v1', bookId: 'book-1', physicalPageCount: 10, verifiedUsable: true },
] as const;

describe('BookAssemblySourceStrategySuccessorPanel', () => {
  it('requires explicit remaps, publishes, and reports the predecessor as retained', async () => {
    const user = userEvent.setup();
    const client: BookAssemblySourceStrategySuccessorClient = {
      publishSuccessor: vi.fn(async () => ({
        status: 'published' as const,
        pointer: {
          publicationId: 'publication-successor',
          publicationRevision: 5,
          manifestVersionId: 'manifest-successor',
          bookRevision: 7,
          sourceSetRevision: 5,
          inputFingerprint: 'fnv1a64:successor',
          updatedAt: '2026-07-28T00:00:00.000Z',
          updatedByCommandId: '00000000-0000-4000-8000-000000000071',
        },
      })),
    };
    const onPublished = vi.fn();
    const onClosed = vi.fn();
    render(
      <BookAssemblySourceStrategySuccessorPanel
        bookId="book-1"
        bookRevision={7}
        currentSourceSetRevision={4}
        predecessor={predecessor}
        sourceVersions={sourceVersions}
        targetStrategy="component_pdfs"
        previewApproval={previewApproval}
        successorClient={client}
        onPublished={onPublished}
        onClosed={onClosed}
      />,
    );

    expect(screen.getByTestId('book-assembly-successor-predecessor')).toHaveTextContent('publication-before');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Successor Source Version 1' }), 'component-v1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Successor owner node 1' }), 'section-1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Successor mapping source for pages-1' }), 'component-1');
    await user.type(screen.getByRole('textbox', { name: 'Successor local page pages-1 1' }), '1');
    await user.click(screen.getByRole('button', { name: 'Publish successor' }));

    await waitFor(() => expect(client.publishSuccessor).toHaveBeenCalledOnce());
    expect(client.publishSuccessor).toHaveBeenCalledWith(expect.objectContaining({
      expectedCurrentPublicationId: 'publication-before',
      targetSourceSetRevision: 5,
      targetSourceSet: expect.objectContaining({ sourceStrategy: 'component_pdfs' }),
    }));
    expect(onPublished).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('cancels without invoking the publication client', async () => {
    const user = userEvent.setup();
    const publishSuccessor = vi.fn();
    const onClosed = vi.fn();
    render(
      <BookAssemblySourceStrategySuccessorPanel
        bookId="book-1"
        bookRevision={7}
        currentSourceSetRevision={4}
        predecessor={predecessor}
        sourceVersions={sourceVersions}
        targetStrategy="component_pdfs"
        previewApproval={previewApproval}
        successorClient={{ publishSuccessor }}
        onPublished={vi.fn()}
        onClosed={onClosed}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel successor' }));
    expect(publishSuccessor).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledOnce();
  });
});

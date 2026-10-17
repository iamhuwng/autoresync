import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookSourceVersionAuthority,
} from '../../../types/bookAssembly.types';
import type { BookAssemblyPublicationResult } from '../../../services/book-assembly/publicationTransaction.service';
import BookAssemblyMappingRevisionPanel from './BookAssemblyMappingRevisionPanel';

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
  },
  nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-1',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['activity-pages'],
    }],
    pageGroups: [
      {
        pageGroupKey: 'activity-pages',
        sourceKey: 'full',
        pages: [2],
        activityKeys: ['activity-1'],
        mode: 'activity',
      },
      {
        pageGroupKey: 'reference-pages',
        sourceKey: 'full',
        pages: [3],
        activityKeys: [],
        mode: 'reference_only',
      },
    ],
  }],
});

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
  createdByCommandId: '00000000-0000-4000-8000-000000000016',
  createdAt: '2026-07-27T22:00:00.000Z',
  manifest: manifest(),
  studentSafeProjection: {
    schemaVersion: 1,
    bookId: 'book-1',
    publicationId: 'publication-before',
    publicationRevision: 4,
    sourceStrategy: 'full_pdf',
    sourceSet: manifest().sourceSet,
    units: manifest().units,
  },
};

const sourceVersionAuthority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => ({
    sourceVersionId,
    bookId: 'book-1',
    physicalPageCount: 10,
    verifiedUsable: true,
  }),
};

const publishedResult: BookAssemblyPublicationResult = {
  status: 'published',
  pointer: {
    publicationId: 'publication-after',
    publicationRevision: 5,
    manifestVersionId: 'manifest-after',
    bookRevision: 7,
    sourceSetRevision: 4,
    inputFingerprint: 'fnv1a64:after',
    updatedAt: '2026-07-28T00:00:00.000Z',
    updatedByCommandId: '00000000-0000-4000-8000-000000000017',
  },
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof BookAssemblyMappingRevisionPanel>> = {}) => render(
  <BookAssemblyMappingRevisionPanel
    predecessor={predecessor}
    sourceVersionAuthority={sourceVersionAuthority}
    preservedActivityVersionIds={['activity-1-v1', 'activity-2-v3']}
    publisher={null}
    onPublished={vi.fn()}
    onClosed={vi.fn()}
    {...overrides}
  />,
);

describe('BookAssemblyMappingRevisionPanel', () => {
  it('requires fresh preview after source-assisted page change, then publishes exact target and approval', async () => {
    const user = userEvent.setup();
    const publishMapping = vi.fn(async () => publishedResult);
    const onPublished = vi.fn();
    renderPanel({ publisher: { publishMapping }, onPublished });

    const page = screen.getByRole('textbox', { name: 'Mapping activity source page' });
    await user.clear(page);
    await user.type(page, '4');
    await user.click(screen.getByRole('button', { name: 'Preview source-assisted mapping' }));
    expect(screen.getByTestId('mapping-revision-preview-state')).toHaveTextContent('approved');

    await user.clear(page);
    await user.type(page, '5');
    expect(screen.getByTestId('mapping-revision-preview-state')).toHaveTextContent('required');
    await user.click(screen.getByRole('button', { name: 'Publish mapping revision' }));
    expect(publishMapping).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Preview the exact source-assisted mapping');

    await user.click(screen.getByRole('button', { name: 'Preview source-assisted mapping' }));
    await user.click(screen.getByRole('button', { name: 'Publish mapping revision' }));
    await waitFor(() => expect(publishMapping).toHaveBeenCalledOnce());

    const [{ targetManifest, previewApproval }] = publishMapping.mock.calls[0]!;
    expect(targetManifest).toEqual(expect.objectContaining({
      ...predecessor.manifest,
      units: [expect.objectContaining({
        pageGroups: expect.arrayContaining([
          expect.objectContaining({ mode: 'activity', pages: [5] }),
          expect.objectContaining({ mode: 'reference_only', pages: [3] }),
        ]),
      })],
    }));
    expect(previewApproval).toEqual(expect.objectContaining({
      approvalId: 'preview-publication-before',
      approvalRevision: 1,
      approvedInputFingerprint: expect.any(String),
    }));
    expect(onPublished).toHaveBeenCalledWith(publishedResult);
  });

  it('reports preserved Activity Versions and predecessor, while cancel never publishes', async () => {
    const user = userEvent.setup();
    const publishMapping = vi.fn();
    const onClosed = vi.fn();
    renderPanel({ publisher: { publishMapping }, onClosed });

    expect(screen.getByTestId('mapping-revision-predecessor')).toHaveTextContent('publication-before');
    expect(screen.getByTestId('mapping-revision-activity-versions')).toHaveTextContent('activity-1-v1, activity-2-v3');
    expect(screen.getByText(/prior Manifest, Activity Version, and existing bindings remain readable/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel mapping repair' }));
    expect(publishMapping).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('fails safely for page outside trusted Source Version range', async () => {
    const user = userEvent.setup();
    const publishMapping = vi.fn();
    const onAction = vi.fn();
    renderPanel({
      publisher: { publishMapping },
      onAction,
      sourceVersionAuthority: {
        getSourceVersion: () => ({
          sourceVersionId: 'source-v1',
          bookId: 'book-1',
          physicalPageCount: 3,
          verifiedUsable: true,
        }),
      },
    });

    const page = screen.getByRole('textbox', { name: 'Mapping activity source page' });
    await user.clear(page);
    await user.type(page, '4');
    expect(screen.getByRole('alert')).toHaveTextContent('inside the trusted Source Version range');
    await user.click(screen.getByRole('button', { name: 'Preview source-assisted mapping' }));
    await user.click(screen.getByRole('button', { name: 'Publish mapping revision' }));

    expect(publishMapping).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_mapping_revision_failed',
      expect.objectContaining({ code: 'invalid-page' }),
    );
  });
});

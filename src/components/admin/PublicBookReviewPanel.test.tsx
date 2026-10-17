import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  materialCatalogIds,
  type MaterialBookMetadata,
  type MaterialBookNode,
} from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';
import type { MaterialBooksRepository } from '../../services/materialCatalog/materialBooks.service';
import { PublicBookReviewPanel } from './PublicBookReviewPanel';

const { announcements } = vi.hoisted(() => ({ announcements: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('../modern', async (importOriginal) => ({ ...await importOriginal<typeof import('../modern')>(), toast: announcements }));
beforeEach(() => vi.clearAllMocks());

const NOW = '2026-06-02T00:00:00.000Z';

const metadata = (overrides: Partial<MaterialBookMetadata> = {}): MaterialBookMetadata => ({
  bookId: materialCatalogIds.bookId('book-1'),
  ownerId: 'teacher-1',
  title: 'Pending Public Book',
  subtitle: 'Academic Reading',
  authors: ['Cambridge'],
  publisher: 'Cambridge',
  series: 'IELTS',
  primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
  testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  tags: ['reading'],
  visibility: 'public-library-pending-review',
  status: 'ready',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  publicReview: {
    status: 'pending-review',
    reason: 'Teacher requested public listing.',
    requestedAt: NOW,
    requestedBy: 'teacher-1',
  },
  ...overrides,
});

const node = (): MaterialBookNode => ({
  nodeId: materialCatalogIds.nodeId('node-1'),
  bookId: materialCatalogIds.bookId('book-1'),
  parentNodeId: null,
  type: 'section',
  title: 'Section 1',
  order: 1,
  materialRefs: [
    {
      refId: materialCatalogIds.refId('ref-1'),
      materialId: 'passage-1',
      materialKind: 'reading-passage',
      snapshotVersionId: 'snapshot-1',
      titleSnapshot: 'Owner title',
      testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
      visibilitySnapshot: 'public',
      availability: 'available',
      updateState: 'current',
      order: 1,
      addedAt: NOW,
      addedBy: 'teacher-1',
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
});

const createRepo = (book = metadata()): MaterialBooksRepository & {
  writes: Record<string, unknown>[];
  removals: string[];
  updates: Record<string, unknown | null>[];
} => {
  const bookMap = new Map<string, MaterialBookMetadata>([[book.bookId, book]]);
  const writes: Record<string, unknown>[] = [];
  const removals: string[] = [];
  const updates: Record<string, unknown | null>[] = [];
  const applyWrite = (path: string, value: unknown): void => {
    writes.push({ path, value });
    const bookMatch = path.match(/^material_catalog\/books\/(.+)$/);

    if (bookMatch) {
      bookMap.set(bookMatch[1], value as MaterialBookMetadata);
    }
  };

  return {
    writes,
    removals,
    updates,
    async readBook(bookId) {
      return bookMap.get(bookId) ?? null;
    },
    async listBookNodes() {
      return [node()];
    },
    async listBooksByIndex(query) {
      if (query.scope !== 'public-review-pending') {
        return [];
      }

      return [...bookMap.values()].filter((entry) => entry.visibility === 'public-library-pending-review');
    },
    async readPublicMaterialSummary() {
      return {
        materialId: 'passage-1',
        ownerId: 'teacher-2',
        title: 'Public Passage Summary',
        materialKind: 'reading-passage',
        visibility: 'public',
        publicationState: 'published',
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeMembership: { ielts: true },
        updatedAt: NOW,
      };
    },
    async write(path, value) {
      applyWrite(path, value);
    },
    async remove(path) {
      removals.push(path);
    },
    async update(payload) {
      updates.push(payload);
      Object.entries(payload).forEach(([path, value]) => {
        if (value === null) {
          removals.push(path);
          return;
        }

        applyWrite(path, value);
      });
    },
  };
};

const renderPanel = (repository = createRepo(), onTrackAction = vi.fn()) => {
  render(
    <PublicBookReviewPanel
      context={{
        actorId: 'admin-1',
        actorRole: 'super_admin',
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        now: () => NOW,
      }}
      repository={repository}
      onTrackAction={onTrackAction}
    />,
  );

  return { repository, onTrackAction };
};

describe('PublicBookReviewPanel', () => {
  it('announces persisted approval truthfully and removes the pending row when readiness refresh fails', async () => {
    const user = userEvent.setup();
    const repository = createRepo();
    repository.refreshPublicReadiness = vi.fn(async () => { throw new Error('offline'); });
    renderPanel(repository);
    await screen.findByText('Pending Public Book');
    await user.type(screen.getByLabelText(/Approval reason for Pending Public Book/i), 'Reviewed public content.');
    await user.click(screen.getByRole('button', { name: /Approve Pending Public Book/i }));
    await waitFor(() => expect(announcements.warning).toHaveBeenCalledWith('Pending Public Book approved for public library. Book availability could not be refreshed.'));
    expect((await repository.readBook('book-1'))?.visibility).toBe('public-library-published');
    expect(repository.updates).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Approve Pending Public Book/i })).not.toBeInTheDocument();
    expect(announcements.error).not.toHaveBeenCalled();
  });
  it('loads pending public Books and approves with a required visible reason field', async () => {
    const user = userEvent.setup();
    const { repository, onTrackAction } = renderPanel();

    expect(await screen.findByText('Pending Public Book')).toBeInTheDocument();
    const approveButton = screen.getByRole('button', { name: /Approve Pending Public Book/i });

    expect(approveButton).toBeDisabled();

    await user.type(
      screen.getByLabelText(/Approval reason for Pending Public Book/i),
      'Reviewed structure and public refs.',
    );
    await user.click(approveButton);

    await waitFor(() => {
      expect(announcements.success).toHaveBeenCalledWith('Pending Public Book approved for public library.');
    });

    expect(repository.writes.map((write) => write.path)).toEqual(
      expect.arrayContaining([
        'material_catalog/books/book-1',
        'material_catalog/public_book_projections/book-1',
      ]),
    );
    expect(repository.updates).toHaveLength(1);
    expect(onTrackAction).toHaveBeenCalledWith('approvePublicBookReview', { bookId: 'book-1' });
  });

  it('rejects Books with a separate required reason field', async () => {
    const user = userEvent.setup();
    const rejectRepo = createRepo();
    const { onTrackAction } = renderPanel(rejectRepo);

    expect(await screen.findByText('Pending Public Book')).toBeInTheDocument();
    const rejectButton = screen.getByRole('button', { name: /Reject Pending Public Book/i });
    expect(rejectButton).toBeDisabled();

    await user.type(
      screen.getByLabelText(/Rejection reason for Pending Public Book/i),
      'Outdated source material.',
    );
    await user.click(rejectButton);

    await waitFor(() => {
      expect(announcements.success).toHaveBeenCalledWith('Pending Public Book rejected from public review.');
    });
    expect(onTrackAction).toHaveBeenCalledWith('rejectPublicBookReview', { bookId: 'book-1' });
    expect(rejectRepo.removals).toContain('material_catalog/public_book_projections/book-1');
  });

  it('returns Books to private with a separate required reason field', async () => {
    const user = userEvent.setup();
    const returnRepo = createRepo();
    const { onTrackAction } = renderPanel(returnRepo);

    expect(await screen.findByText('Pending Public Book')).toBeInTheDocument();

    const returnButton = screen.getByRole('button', { name: /Return Pending Public Book to private/i });
    expect(returnButton).toBeDisabled();

    await user.type(
      screen.getByLabelText(/Return-to-private reason for Pending Public Book/i),
      'Needs metadata revision.',
    );
    await user.click(returnButton);

    await waitFor(() => {
      expect(announcements.success).toHaveBeenCalledWith('Pending Public Book returned to private.');
    });
    expect(onTrackAction).toHaveBeenCalledWith('returnPublicBookToPrivate', { bookId: 'book-1' });
    expect(returnRepo.removals).toContain('material_catalog/public_book_projections/book-1');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2StudioModalAdapter } from './ReadingV2StudioModalAdapter';

vi.mock('../../../services/reading-v2/readingV2StudioFirebaseHydration.service', async () => {
  const { createReadingV2CanonicalFixture } = await vi.importActual<typeof import('../../../services/reading-v2/fixtures/readingV2CanonicalFixtures')>(
    '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures',
  );

  return {
    loadReadingV2PublishedRevisionSource: vi.fn(async (materialId: string) => {
      const document = {
        ...createReadingV2CanonicalFixture('matching-headings'),
        title: 'Modal hydrated Reading V2',
      };

      return {
        status: 'loaded',
        materialId,
        metadata: {
          materialId,
          ownerId: 'current-teacher',
          deliveryEngine: 'reading-v2',
          productLabel: 'Reading V2',
          title: document.title,
          materialKind: 'full-test',
          durationMinutes: 60,
          difficulty: 'intermediate',
          targetBand: 'Band 6-7',
          description: '',
          tags: [],
          visibility: 'private',
          publishedSnapshotVersionId: 'snapshot-modal',
          updatedAt: '2026-04-29T00:00:00.000Z',
          relationshipSurfaces: ['teacher-lobby'],
        },
        snapshot: {
          snapshotVersionId: 'snapshot-modal',
          materialId,
          ownerId: 'current-teacher',
          document,
          publishedAt: '2026-04-29T00:00:00.000Z',
          publishedBy: 'current-teacher',
        },
      };
    }),
  };
});

describe('ReadingV2StudioModalAdapter', () => {
  it('hydrates and hosts the same Studio shell for Teacher Lobby modal entry', async () => {
    render(<ReadingV2StudioModalAdapter mode="revise-published" materialId="material-1" />);

    expect(screen.getByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).toBeInTheDocument();
    expect(screen.getByText('Loading published Reading V2 material...')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-host', 'modal'));
    expect(screen.getByRole('main')).toHaveAttribute('data-mode', 'revise-published');
    expect(screen.getAllByText('Modal hydrated Reading V2').length).toBeGreaterThan(0);
  });

  it('does not expose legacy TestEditor as modal content', () => {
    render(<ReadingV2StudioModalAdapter mode="resume-draft" draftId="draft-1" />);

    expect(screen.queryByText(/TestEditor/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Missing draft draft-1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
  });
});

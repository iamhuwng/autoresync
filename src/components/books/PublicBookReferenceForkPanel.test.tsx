import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../modern/ToastNotification';
import type {
  PublicBookCatalogView,
  PublicBookSelectionRequest,
} from '../../services/materialCatalog/publicBookReferenceFork.types';
import PublicBookReferenceForkPanel from './PublicBookReferenceForkPanel';

const selection: PublicBookSelectionRequest = {
  sourceBookId: 'source-book',
  publicationId: 'publication-1',
  publicationRevision: 1,
  kind: 'activity',
  selectionPath: ['unit-1'],
  activities: [{ activityId: 'activity-1', activityVersionId: 'version-1', order: 0 }],
};

const catalog: PublicBookCatalogView = {
  bookId: 'source-book',
  title: 'Source Book',
  publicState: 'playable',
  publicationStatus: 'trusted',
  sourceReadiness: 'ready',
  nodes: [],
  activities: [{
    activityId: 'activity-1',
    versionId: 'version-1',
    title: 'Activity',
    order: 0,
    selectionPath: ['unit-1'],
  }],
  newerVersionAvailable: false,
};

afterEach(() => {
  toast.clear();
  vi.restoreAllMocks();
});

describe('PublicBookReferenceForkPanel', () => {
  it('keeps the UI hard-disabled until the composition gate is enabled', () => {
    render(
      <PublicBookReferenceForkPanel
        catalog={catalog}
        selection={selection}
        onReference={vi.fn()}
        onFork={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('currently unavailable');
    expect(screen.getByRole('button', { name: 'Reference pinned content' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Customize here' })).toBeDisabled();
  });

  it('shows version awareness and announces successful reference/fork outcomes', async () => {
    const onReference = vi.fn().mockResolvedValue(undefined);
    const onFork = vi.fn().mockResolvedValue(undefined);
    const success = vi.spyOn(toast, 'success');
    render(
      <PublicBookReferenceForkPanel
        catalog={{ ...catalog, newerVersionAvailable: true }}
        selection={selection}
        enabled
        referenceStatus="newer-version-available"
        onReference={onReference}
        onFork={onFork}
      />,
    );
    expect(screen.getAllByText('Newer version available')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reference pinned content' }));
    await waitFor(() => expect(onReference).toHaveBeenCalledWith(selection));
    expect(success).toHaveBeenCalledWith('Referenced "Source Book" at its pinned publication.');
    fireEvent.click(screen.getByRole('button', { name: 'Customize here' }));
    await waitFor(() => expect(onFork).toHaveBeenCalledWith(selection));
    expect(success).toHaveBeenCalledWith('Created a teacher-owned fork of "Source Book".');
  });

  it('does not offer reuse for metadata-only content', () => {
    render(
      <PublicBookReferenceForkPanel
        catalog={{ ...catalog, publicState: 'metadata-only' }}
        selection={selection}
        enabled
        onReference={vi.fn()}
        onFork={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reference pinned content' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Customize here' })).toBeDisabled();
  });
});

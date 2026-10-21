import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { materialCatalogIds, type MaterialBookMetadata } from '../../types/materialCatalog.types';
import BookPdfEditWorkspace from './BookPdfEditWorkspace';

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('./BookEditorWorkspace', () => ({
  default: ({ activeTab, onDirtyChange }: { activeTab: string; onDirtyChange?: (dirty: boolean) => void }) => (
    <div>
      <span>Metadata surface: {activeTab}</span>
      <button type="button" onClick={() => onDirtyChange?.(true)}>Dirty metadata</button>
      <button type="button" onClick={() => onDirtyChange?.(false)}>Clean metadata</button>
    </div>
  ),
}));

vi.mock('./BookMode2EditorShell', () => ({
  default: ({ editingSection, onDirtyChange }: { editingSection: string; onDirtyChange?: (dirty: boolean) => void }) => (
    <div>
      <span>Assembly surface: {editingSection}</span>
      <button type="button" onClick={() => onDirtyChange?.(true)}>Dirty assembly</button>
      <button type="button" onClick={() => onDirtyChange?.(false)}>Clean assembly</button>
    </div>
  ),
}));

const book: MaterialBookMetadata = {
  bookId: materialCatalogIds.bookId('pdf-book'),
  bookMode: 'pdf',
  ownerId: 'teacher-1',
  title: 'Configured PDF Book',
  authors: [],
  testTypeIds: [],
  tags: [],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-full', sourceOrder: 1 }],
  },
};

describe('BookPdfEditWorkspace', () => {
  it('opens Content and keeps setup options secondary with keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<BookPdfEditWorkspace access="owner" book={book} presentation="modal" />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Content', 'Preview']);
    expect(screen.queryByRole('button', { name: 'PDF files' })).not.toBeInTheDocument();
    const activitiesTab = screen.getByRole('tab', { name: 'Content' });
    expect(activitiesTab).toHaveAttribute('aria-selected', 'true');
    activitiesTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Assembly surface: preview')).toBeInTheDocument();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Book options' }));
    await user.click(screen.getByRole('button', { name: 'Book details' }));
    expect(screen.getByText('Metadata surface: settings')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('tabindex', '0');
  });

  it('keeps the editor dirty until both mounted editing surfaces are clean', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    render(<BookPdfEditWorkspace access="owner" book={book} presentation="modal" onDirtyChange={onDirtyChange} />);

    await user.click(screen.getByRole('button', { name: 'Book options' }));
    await user.click(screen.getByRole('button', { name: 'Book details' }));
    await user.click(screen.getByRole('button', { name: 'Dirty metadata' }));
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    await user.click(screen.getByRole('button', { name: 'Dirty assembly' }));
    await user.click(screen.getByRole('button', { name: 'Clean assembly' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Book options' }));
    await user.click(screen.getByRole('button', { name: 'Book details' }));
    await user.click(screen.getByRole('button', { name: 'Clean metadata' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { materialCatalogIds, type MaterialBookMetadata } from '../../types/materialCatalog.types';
import BookMode2EditorShell from './BookMode2EditorShell';
import type { SourceUploadBrowserWorkflow } from '../../services/book-source-delivery/sourceUpload.browserWorkflow';

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

const book: MaterialBookMetadata = {
  bookId: materialCatalogIds.bookId('pdf-book'),
  bookMode: 'pdf',
  ownerId: 'teacher-1',
  title: 'PDF Assembly Book',
  authors: [],
  testTypeIds: [],
  tags: [],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
};

afterEach(() => cleanup());

describe('BookMode2EditorShell', () => {
  it.each(['owner', 'administrator'] as const)(
    'exposes source inspection to authorized %s without upload authorization',
    (access) => {
      render(<BookMode2EditorShell access={access} book={book} presentation="page-compat" />);

      expect(screen.getByRole('heading', { name: 'Inspect source PDF' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue to upload' })).toBeDisabled();
    },
  );

  it('never exposes source inspection to public read-only access', () => {
    render(
      <BookMode2EditorShell
        access="public-readonly"
        book={book}
        presentation="page-compat"
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Inspect source PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to upload' })).not.toBeInTheDocument();
  });

  it('keeps upload default-deny while preserving restored operation UI', async () => {
    const uploadWorkflow: SourceUploadBrowserWorkflow = {
      load: vi.fn(async () => null),
      start: vi.fn(),
      retryBytes: vi.fn(),
      retryCompletion: vi.fn(),
      requestCancellation: vi.fn(),
    };
    render(
      <BookMode2EditorShell
        access="owner"
        book={book}
        presentation="page-compat"
        uploadWorkflow={uploadWorkflow}
      />,
    );

    expect(screen.getByRole('button', { name: 'Continue to upload' })).toBeDisabled();
    expect(await screen.findByText(/New upload authorization is disabled/iu))
      .toBeInTheDocument();
  });
});

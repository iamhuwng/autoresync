import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { materialCatalogIds, type MaterialBookMetadata } from '../../types/materialCatalog.types';
import BookMode2EditorShell from './BookMode2EditorShell';
import type { SourceUploadBrowserWorkflow } from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import { BookAssemblyClientError } from '../../services/book-assembly/assemblyClient.browser';

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
    'starts the mode-first flow for authorized %s',
    async (access) => {
      const user = userEvent.setup();
      render(<BookMode2EditorShell access={access} book={book} presentation="page-compat" />);

      expect(screen.getByRole('heading', { name: 'How will this Book use PDFs?' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /One complete PDF/iu }));
      expect(screen.getByRole('heading', { name: 'Start with one PDF' })).toBeInTheDocument();
      expect(screen.getByText('Choose your PDF')).toBeInTheDocument();
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

    expect(screen.getByRole('heading', { name: 'How will this Book use PDFs?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose the PDF for this Book' })).not.toBeInTheDocument();
  });

  it('keeps upload default-deny while preserving restored operation UI', async () => {
    const uploadWorkflow: SourceUploadBrowserWorkflow = {
      load: vi.fn(async () => null),
      start: vi.fn(),
      retryBytes: vi.fn(),
      retryCompletion: vi.fn(),
      requestCancellation: vi.fn(),
      retryCleanup: vi.fn(),
    };
    const user = userEvent.setup();
    render(
      <BookMode2EditorShell
        access="owner"
        book={book}
        presentation="page-compat"
        uploadWorkflow={uploadWorkflow}
      />,
    );

    await user.click(screen.getByRole('button', { name: /One complete PDF/iu }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(await screen.findByText(/We will check the file in your browser/iu))
      .toBeInTheDocument();
  });

  it('exposes the authorized upload step when the local presentation gate is enabled', async () => {
    const uploadWorkflow: SourceUploadBrowserWorkflow = {
      load: vi.fn(async () => null),
      start: vi.fn(),
      retryBytes: vi.fn(),
      retryCompletion: vi.fn(),
      requestCancellation: vi.fn(),
      retryCleanup: vi.fn(),
    };
    const user = userEvent.setup();
    render(
      <BookMode2EditorShell
        access="owner"
        book={book}
        presentation="modal"
        uploadWorkflow={uploadWorkflow}
        uploadPresentationEnabled
        assemblyRepository={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: /One complete PDF/iu }));
    expect(screen.getByRole('navigation', { name: 'PDF Book progress' })).toBeInTheDocument();
    expect(screen.queryByText('Upload authorization is disabled in this view.')).not.toBeInTheDocument();
    expect(screen.getByText('We will check the file in your browser before anything is uploaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('keeps full and component preparation interfaces separate', async () => {
    const user = userEvent.setup();
    render(
      <BookMode2EditorShell
        access="owner"
        book={book}
        presentation="page-compat"
        uploadWorkflow={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Several component PDFs/iu }));
    expect(screen.getByRole('heading', { name: 'Bring in your PDF sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a PDF' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a PDF' }));
    expect(screen.getByRole('heading', { name: 'PDF 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Book PDF' })).not.toBeInTheDocument();
  });

  it('fails closed when the saved Assembly draft cannot be loaded', async () => {
    const assemblyRepository = {
      loadCurrent: vi.fn().mockRejectedValue(new Error('network unavailable')),
    } as unknown as UnitAssemblyRepository;
    render(
      <BookMode2EditorShell
        access="owner"
        book={{
          ...book,
          sourceSet: {
            sourceStrategy: 'component_pdfs',
            sources: [{
              sourceKey: 'component-1',
              sourceVersionId: 'source-version-1',
              sourceOrder: 1,
              ownerNodeKey: 'unit-1',
            }],
          },
        }}
        presentation="modal"
        assemblyRepository={assemblyRepository}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('saved Book draft could not be loaded');
    expect(screen.queryByRole('heading', { name: 'Bring in your PDF sections' })).not.toBeInTheDocument();
  });

  it('ignores only explicit stale current-candidate conflicts while loading a Book', async () => {
    const assemblyRepository = {
      loadCurrent: vi.fn().mockRejectedValue(new BookAssemblyClientError('stale-book-revision', 409)),
    } as unknown as UnitAssemblyRepository;
    render(
      <BookMode2EditorShell
        access="owner"
        book={{
          ...book,
          sourceSet: {
            sourceStrategy: 'component_pdfs',
            sources: [{
              sourceKey: 'component-1',
              sourceVersionId: 'source-version-1',
              sourceOrder: 1,
              ownerNodeKey: 'unit-1',
            }],
          },
        }}
        presentation="modal"
        assemblyRepository={assemblyRepository}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Bring in your PDF sections' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

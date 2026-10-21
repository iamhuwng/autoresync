import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { materialCatalogIds, type MaterialBookMetadata } from '../../types/materialCatalog.types';
import BookMode2EditorShell from './BookMode2EditorShell';
import type { SourceUploadBrowserWorkflow } from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import { BookAssemblyClientError } from '../../services/book-assembly/assemblyClient.browser';
import type { BookAssemblyCurrentPublication, BookAssemblyPreviewClient } from '../../services/book-assembly/assemblyPublication.client';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import { createComponentPdfActivationReceipt, fingerprintComponentPdfActivationValue } from '../../services/book-assembly/componentPdfActivation.service';
import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';

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

const publishedUnit = (unitKey: string): BookAssemblyCurrentPublication['units'][number] => ({
  unitKey,
  activitySlots: [],
  pageGroups: [],
});

const currentPublication = (units: readonly BookAssemblyCurrentPublication['units'][number][]): BookAssemblyCurrentPublication => ({
  candidateId: 'candidate-1',
  candidateRevision: 1,
  pointer: {
    publicationId: 'publication-1',
    publicationRevision: 1,
    manifestVersionId: 'manifest-1',
    bookRevision: 1,
    sourceSetRevision: 1,
    inputFingerprint: 'fingerprint-1',
    updatedAt: '2026-08-28T00:00:00.000Z',
    updatedByCommandId: 'command-1',
  },
  units,
});

const componentManifest = {
  bookId: 'pdf-book',
  sourceSet: {
    sourceStrategy: 'component_pdfs' as const,
    sources: [
      { sourceKey: 'part-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'unit-a' },
      { sourceKey: 'part-b', sourceVersionId: 'source-b', sourceOrder: 2, ownerNodeKey: 'unit-b' },
    ],
  },
  nodes: [
    { nodeKey: 'unit-a', parentNodeKey: null, nodeType: 'unit' as const, order: 1 },
    { nodeKey: 'unit-b', parentNodeKey: null, nodeType: 'unit' as const, order: 2 },
  ],
  units: [
    {
      unitKey: 'unit-a',
      activitySlots: [{ activityKey: 'activity-a', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-a'] }],
      pageGroups: [{ pageGroupKey: 'pages-a', sourceKey: 'part-a', pages: [1], activityKeys: ['activity-a'], mode: 'activity' as const, defaultPhysicalPageNumber: 1 }],
    },
    {
      unitKey: 'unit-b',
      activitySlots: [{ activityKey: 'activity-b', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-b'] }],
      pageGroups: [{ pageGroupKey: 'pages-b', sourceKey: 'part-b', pages: [1], activityKeys: ['activity-b'], mode: 'activity' as const, defaultPhysicalPageNumber: 1 }],
    },
  ],
};

const componentCandidate: BookAssemblyCandidateRecord = {
  candidateId: 'candidate-a', ownerId: 'teacher-1', bookId: 'pdf-book',
  bookRevision: 3, sourceSetRevision: 4, unitKey: 'unit-a', revision: 1,
  lifecycle: 'validated', manifest: componentManifest,
  validation: { valid: true, errors: [] }, updatedAt: '2026-09-20T00:00:00.000Z',
};

const componentActivation = createComponentPdfActivationReceipt({
  operationId: 'activation-original', ownerId: 'teacher-1', bookId: 'pdf-book',
  expectedBookRevision: 2, expectedSourceSetRevision: 3,
  sourceSet: componentManifest.sourceSet,
  unitCandidates: ['unit-a', 'unit-b'].map((unitKey) => ({
    unitKey,
    candidateId: unitKey === 'unit-a' ? 'candidate-a' : 'candidate-b',
    candidateRevision: 1,
    manifestFingerprint: fingerprintComponentPdfActivationValue(componentManifest),
  })),
  studentDocument: {
    sourceVersionId: 'student-document-1', descriptorRevision: 4,
    descriptorFingerprint: 'd'.repeat(64),
  },
  activities: [], activatedAt: '2026-09-20T00:00:00.000Z',
});

describe('BookMode2EditorShell', () => {
  it('rehydrates saved pre-activation Unit content after a true remount without replacement writes', async () => {
    const user = userEvent.setup();
    const candidate = { ...componentCandidate, bookRevision: 0, sourceSetRevision: 0 };
    const repository = {
      discoverDrafts: vi.fn().mockResolvedValue([{ candidate,
        savedActivityKeysByUnit: { 'unit-a': ['activity-a'], 'unit-b': ['activity-b'] } }]),
      loadCurrent: vi.fn(), create: vi.fn(), replace: vi.fn(), validate: vi.fn(), discard: vi.fn(), load: vi.fn(),
    };
    const props = {
      access: 'owner' as const, book: { ...book, bookRevision: 0, sourceSetRevision: 0 },
      presentation: 'modal' as const, experience: 'guided-creation' as const,
      assemblyRepository: repository, assemblyPreviewClient: null, uploadWorkflow: null,
      assemblySourceVersions: componentManifest.sourceSet.sources.map((source) => ({ ...source,
        bookId: 'pdf-book', physicalPageCount: 10, verifiedUsable: true,
        checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
        purpose: 'book-source' as const, studentSafeStatus: 'unreviewed' as const,
      })),
    };
    for (let mount = 0; mount < 2; mount += 1) {
      const view = render(<BookMode2EditorShell {...props} />);
      await user.click(await screen.findByRole('button', { name: /Build your Book/u }));
      expect(await screen.findByText('Unit content is ready')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replace Unit content' })).toBeInTheDocument();
      view.unmount();
    }
    expect(repository.discoverDrafts).toHaveBeenCalledTimes(2);
    expect(repository.loadCurrent).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.replace).not.toHaveBeenCalled();
    expect(repository.validate).not.toHaveBeenCalled();
  });

  it('replays the original Component-PDF activation receipt after a true Shell remount', async () => {
    const user = userEvent.setup();
    let activatedManifest: BookAssemblyManifestCandidate | null = null;
    let receipt: typeof componentActivation | null = null;
    const activateComponentPdf = vi.fn().mockImplementation(async (command: {
      operationId: string;
      expectedBookRevision: number;
      expectedSourceSetRevision: number;
      sourceSet: typeof componentManifest.sourceSet;
      manifest: BookAssemblyManifestCandidate;
      activatedAt: string;
    }) => {
      if (!receipt) {
        activatedManifest = command.manifest;
        receipt = createComponentPdfActivationReceipt({
          operationId: command.operationId,
          ownerId: 'teacher-1', bookId: 'pdf-book',
          expectedBookRevision: command.expectedBookRevision,
          expectedSourceSetRevision: command.expectedSourceSetRevision,
          sourceSet: command.sourceSet,
          unitCandidates: componentActivation.unitCandidates.map((reference) => ({
            ...reference,
            manifestFingerprint: fingerprintComponentPdfActivationValue(command.manifest),
          })),
          studentDocument: componentActivation.studentDocument,
          activities: [], activatedAt: command.activatedAt,
        });
        throw new Error('response_lost_after_commit');
      }
      return receipt;
    });
    const attachSourceSet = vi.fn();
    const replace = vi.fn();
    const create = vi.fn();
    const loadCurrent = vi.fn(async (_bookId: string, unitKey: string) => ({
        candidate: {
          ...componentCandidate,
          candidateId: unitKey === 'unit-a' ? 'candidate-a' : 'candidate-b',
          unitKey,
          bookRevision: activatedManifest ? 3 : 2,
          sourceSetRevision: activatedManifest ? 4 : 3,
          lifecycle: activatedManifest ? 'validated' : 'draft',
          manifest: activatedManifest ?? componentManifest,
        },
        savedActivityKeysByUnit: { [unitKey]: [] },
      }));
    const assemblyRepository = {
      loadCurrent,
      replace,
      create,
      validate: vi.fn(),
      discard: vi.fn(),
      load: vi.fn(),
    } as unknown as UnitAssemblyRepository;
    const initialBook: MaterialBookMetadata = {
      ...book,
      bookRevision: 2,
      sourceSetRevision: 3,
      sourceSet: componentManifest.sourceSet,
    };
    const props = {
      access: 'owner' as const,
      presentation: 'modal' as const,
      experience: 'focused-editing' as const,
      editingSection: 'content-tree' as const,
      assemblyRepository,
      componentPdfActivationClient: { activateComponentPdf },
      sourceSetAttachmentClient: { attachSourceSet } as never,
      assemblySourceVersions: componentManifest.sourceSet.sources.map((source) => ({
        sourceKey: source.sourceKey,
        sourceVersionId: source.sourceVersionId,
        bookId: 'pdf-book',
        physicalPageCount: 10,
        verifiedUsable: true,
        checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
        purpose: 'book-source' as const,
        studentSafeStatus: 'unreviewed' as const,
      })),
    };
    const saveThroughEditor = async () => {
      const save = await screen.findByRole('button', { name: 'Save changes' }, { timeout: 10_000 });
      expect(save).toBeEnabled();
      await user.click(save);
    };

    const firstMount = render(<BookMode2EditorShell {...props} book={initialBook} componentStudentDocumentSourceVersionId="student-document-1" />);
    await waitFor(() => {
      expect(loadCurrent).toHaveBeenCalledWith('pdf-book', 'unit-a');
      expect(loadCurrent).toHaveBeenCalledWith('pdf-book', 'unit-b');
    });
    await user.click(await screen.findByRole('button', { name: 'Add section' }, { timeout: 10_000 }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await saveThroughEditor();
    await waitFor(() => expect(activateComponentPdf).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('response_lost_after_commit')).toBeInTheDocument();
    firstMount.unmount();

    expect(receipt).not.toBeNull();
    loadCurrent.mockClear();
    const advancedBook: MaterialBookMetadata = {
      ...initialBook, bookRevision: 3, sourceSetRevision: 4, setupActivations: [receipt!],
    };
    render(<BookMode2EditorShell {...props} book={advancedBook} />);
    await waitFor(() => {
      expect(loadCurrent).toHaveBeenCalledWith('pdf-book', 'unit-a');
      expect(loadCurrent).toHaveBeenCalledWith('pdf-book', 'unit-b');
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
    await saveThroughEditor();
    await waitFor(() => expect(activateComponentPdf).toHaveBeenCalledTimes(2));

    for (const [command] of activateComponentPdf.mock.calls) {
      expect(command).toMatchObject({
        operationId: receipt!.operationId,
        activatedAt: receipt!.activatedAt,
        expectedBookRevision: 2,
        expectedSourceSetRevision: 3,
        studentDocumentSourceVersionId: receipt!.studentDocument.sourceVersionId,
      });
      expect(command).not.toHaveProperty('preparation');
    }
    expect(activateComponentPdf.mock.calls[1]![0]).toEqual(activateComponentPdf.mock.calls[0]![0]);
    expect(assemblyRepository.loadCurrent).toHaveBeenCalledWith('pdf-book', 'unit-a');
    expect(replace).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(attachSourceSet).not.toHaveBeenCalled();
  });

  it.each(['owner', 'administrator'] as const)(
    'starts the mode-first flow for authorized %s',
    async (access) => {
      const user = userEvent.setup();
      render(<BookMode2EditorShell access={access} book={book} presentation="page-compat" experience="guided-creation" />);

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
        experience="guided-creation"
      />,
    );

    expect(screen.getByRole('heading', { name: 'How will this Book use PDFs?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose the PDF for this Book' })).not.toBeInTheDocument();
  });

  it('keeps preparation locked until a PDF is selected', async () => {
    const uploadWorkflow: SourceUploadBrowserWorkflow = {
      load: vi.fn(async () => null),
      prepareReplacement: vi.fn(async () => undefined),
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
        experience="guided-creation"
        uploadWorkflow={uploadWorkflow}
      />,
    );

    await user.click(screen.getByRole('button', { name: /One complete PDF/iu }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(await screen.findByText(/We will check the file in your browser/iu))
      .toBeInTheDocument();
  });

  it('exposes upload when the canonical source workflow is configured', async () => {
    const uploadWorkflow: SourceUploadBrowserWorkflow = {
      load: vi.fn(async () => null),
      prepareReplacement: vi.fn(async () => undefined),
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
        experience="guided-creation"
        uploadWorkflow={uploadWorkflow}
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
        experience="guided-creation"
        uploadWorkflow={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Several component PDFs/iu }));
    expect(screen.getByRole('heading', { name: 'Combine your PDF sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add PDFs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Choose PDFs to combine')).toHaveAttribute('multiple');
    expect(screen.queryByRole('heading', { name: 'Book PDF' })).not.toBeInTheDocument();
  });

  it('loads a configured Full-PDF candidate from the canonical Unit 1 scope', async () => {
    const assemblyRepository = {
      loadCurrent: vi.fn().mockResolvedValue(null),
    } as unknown as UnitAssemblyRepository;

    render(
      <BookMode2EditorShell
        access="owner"
        book={{
          ...book,
          sourceSet: {
            sourceStrategy: 'full_pdf',
            sources: [{ sourceKey: 'full', sourceVersionId: 'source-version-1', sourceOrder: 1 }],
          },
        }}
        presentation="modal"
        experience="focused-editing"
        editingSection="content-tree"
        assemblyRepository={assemblyRepository}
      />,
    );

    await waitFor(() => {
      expect(assemblyRepository.loadCurrent).toHaveBeenCalledWith('pdf-book', 'unit-1');
    });
  });

  it('loads the actual published Full-PDF Units after publication resolves', async () => {
    const loadCurrent = vi.fn().mockResolvedValue(null);
    const readCurrentPublication = vi.fn().mockResolvedValue(currentPublication([publishedUnit('qa-unit-a'), publishedUnit('qa-unit-b')]));
    render(<BookMode2EditorShell
      access="owner"
      book={{ ...book, sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }] } }}
      presentation="modal"
      experience="focused-editing"
      assemblyRepository={{ loadCurrent } as unknown as UnitAssemblyRepository}
      assemblyPreviewClient={{ readCurrentPublication } as unknown as BookAssemblyPreviewClient}
    />);
    await waitFor(() => expect(loadCurrent).toHaveBeenCalledWith('pdf-book', 'qa-unit-a'));
    expect(loadCurrent).toHaveBeenCalledWith('pdf-book', 'qa-unit-b');
  });

  it('loads current publication independently from the saved draft', async () => {
    const readCurrentPublication = vi.fn().mockResolvedValue(null);
    const assemblyPreviewClient = { readCurrentPublication } as unknown as BookAssemblyPreviewClient;
    render(
      <BookMode2EditorShell
        access="owner"
        book={{ ...book, sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }] } }}
        presentation="modal"
        experience="focused-editing"
        assemblyInitialCandidate={null}
        assemblyPreviewClient={assemblyPreviewClient}
      />,
    );

    await waitFor(() => expect(readCurrentPublication).toHaveBeenCalledWith('pdf-book'));
  });

  it('selects the visible preview Unit for homework without exposing Unit keys', async () => {
    const user = userEvent.setup();
    render(
      <BookMode2EditorShell
        access="owner"
        book={book}
        presentation="modal"
        experience="focused-editing"
        editingSection="preview"
        assemblyInitialPublication={currentPublication([publishedUnit('unit-a'), publishedUnit('unit-b')])}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Unit' });
    expect(select).toHaveValue('unit-a');
    expect(screen.getByRole('option', { name: 'Unit 1' })).toBeInTheDocument();
    expect(screen.queryByText('unit-a')).not.toBeInTheDocument();
    await user.selectOptions(select, 'unit-b');
    expect(select).toHaveValue('unit-b');
  });

  it('implicitly uses the only trusted published unit', async () => {
    render(
      <BookMode2EditorShell
        access="owner"
        book={book}
        presentation="modal"
        experience="focused-editing"
        assemblyInitialPublication={currentPublication([publishedUnit('unit-b')])}
      />,
    );

    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Unit' })).not.toBeInTheDocument());
  });

  it('retains an unpublished draft Unit from Content to Preview without assigning a published fallback', async () => {
    const user = userEvent.setup();
    const props = {
      access: 'owner' as const, presentation: 'modal' as const, experience: 'focused-editing' as const,
      book: { ...book, sourceSet: componentManifest.sourceSet, bookRevision: 3, sourceSetRevision: 4 },
      assemblyInitialCandidate: { ...componentCandidate, manifest: { ...componentManifest,
        nodes: componentManifest.nodes.map((node, index) => ({ ...node, title: `Chapter ${index + 1}` })),
      } },
      assemblyInitialPublication: currentPublication([publishedUnit('unit-a')]),
      assemblyRepository: null, assemblyPreviewClient: null, activityAuthoring: null, uploadWorkflow: null,
    };
    const view = render(<BookMode2EditorShell {...props} editingSection="activity-json" />);
    await user.click(await screen.findByRole('button', { name: 'Chapter 2' }));
    expect(screen.getByRole('heading', { name: 'Chapter 2 activities' })).toBeInTheDocument();

    view.rerender(<BookMode2EditorShell {...props} editingSection="preview" />);
    expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('unit-b');
    expect(screen.getByRole('option', { name: 'Chapter 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign as homework' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Unit' }), 'unit-a');
    expect(screen.getByRole('button', { name: 'Assign as homework' })).toBeEnabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Unit' }), 'unit-b');
    view.rerender(<BookMode2EditorShell {...props} editingSection="activity-json" />);
    expect(screen.getByRole('heading', { name: 'Chapter 2 activities' })).toBeInTheDocument();
  });

  it('does not restart candidate loading for a structurally unchanged Source Set', async () => {
    const assemblyRepository = {
      loadCurrent: vi.fn().mockResolvedValue(null),
    } as unknown as UnitAssemblyRepository;
    const sourceSet = {
      sourceStrategy: 'full_pdf' as const,
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-version-1', sourceOrder: 1 }],
    };
    const { rerender } = render(
      <BookMode2EditorShell access="owner" book={{ ...book, sourceSet }} presentation="modal" experience="focused-editing" assemblyRepository={assemblyRepository} />,
    );
    await waitFor(() => expect(assemblyRepository.loadCurrent).toHaveBeenCalledTimes(1));

    rerender(
      <BookMode2EditorShell access="owner" book={{ ...book, sourceSet: structuredClone(sourceSet) }} presentation="modal" experience="focused-editing" assemblyRepository={assemblyRepository} />,
    );
    await waitFor(() => expect(assemblyRepository.loadCurrent).toHaveBeenCalledTimes(1));
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
        experience="guided-creation"
        assemblyRepository={assemblyRepository}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('saved Book draft could not be loaded');
    expect(screen.queryByRole('heading', { name: 'Combine your PDF sections' })).not.toBeInTheDocument();
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
        experience="guided-creation"
        assemblyRepository={assemblyRepository}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Combine your PDF sections' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

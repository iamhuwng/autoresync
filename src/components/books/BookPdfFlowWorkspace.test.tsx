import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookAssemblyCurrentPublication, BookAssemblyPreviewClient } from '../../services/book-assembly/assemblyPublication.client';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { SourceUploadBrowserWorkflow } from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import { SourceUploadClientError, type SourceSetAttachmentClient, type SourceUploadSafeOperationState } from '../../services/book-source-delivery/sourceUpload.client';
import type { SourcePdfInspectionClaim } from '../../services/book-source-delivery/sourcePdfInspection.browser';
import { createCandidateUnitPreview, previewInputFingerprint } from '../../services/book-assembly/unitPreview.service';
import { createComponentStudentDocument } from '../../services/book-assembly/componentStudentDocument.types';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import type { TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import BookPdfFlowWorkspace from './BookPdfFlowWorkspace';
import { composeComponentPdfs } from '../../services/book-source-delivery/componentPdfComposition.browser';
import { inspectSourcePdf } from '../../services/book-source-delivery/sourcePdfInspection.browser';
import { FEATURE_IDS, FEATURE_REGISTRY } from '../../config/featureRegistry';

const { toast } = vi.hoisted(() => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../modern/ToastNotification', () => ({ toast }));

vi.mock('../../services/book-source-delivery/sourcePdfInspection.browser', () => {
  let sameNameInspectionCount = 0;
  class MockSourcePdfInspectionError extends Error {
    readonly code: string;

    constructor(code: string, cause?: unknown) {
      super(code);
      this.code = code;
      if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause });
    }
  }
  return {
    SourcePdfInspectionError: MockSourcePdfInspectionError,
    inspectSourcePdf: vi.fn(async (file: File) => {
      if (file.name === 'bad.pdf') throw new MockSourcePdfInspectionError('unreadable', new Error('invalid xref'));
      return {
        schemaVersion: 1,
        trust: 'browser-supplied-untrusted',
        state: 'complete',
        displayFilename: file.name,
        exactByteSize: file.size,
        sha256Hex: file.name === 'book-combined.pdf'
          ? 'b'.repeat(64)
          : file.name === 'first.pdf'
          ? 'a'.repeat(64)
          : file.name === 'second.pdf'
            ? 'b'.repeat(64)
          : file.name === 'copy.pdf'
              ? 'a'.repeat(64)
              : file.name === 'same-name.pdf'
                ? `${sameNameInspectionCount++ === 0 ? 'd' : 'e'}`.repeat(64)
                : 'f'.repeat(64),
        physicalPageCount: file.name === 'book-combined.pdf' ? 5 : file.name.startsWith('first') ? 2 : 3,
        pdfType: 'application/pdf',
        readability: 'readable',
      };
    }),
    invalidateSourcePdfInspectionClaim: vi.fn(),
    isSourcePdfInspectionClaimForFile: vi.fn(() => true),
  };
});

vi.mock('../../services/book-source-delivery/componentPdfComposition.browser', () => ({
  composeComponentPdfs: vi.fn(async (files: readonly File[]) => ({
    file: new File(['combined'], 'book-combined.pdf', { type: 'application/pdf' }),
    sha256Hex: 'b'.repeat(64),
    mapping: files.map((file, index) => ({
      componentIndex: index,
      fileName: file.name,
      pageCount: file.name.startsWith('first') ? 2 : 3,
      startPage: index === 0 ? 1 : 3,
      endPage: index === 0 ? 2 : 5,
    })),
    inputManifest: await Promise.all(files.map(async (file, index) => ({
      componentIndex: index,
      sha256Hex: file.name === 'first.pdf'
        ? 'a'.repeat(64)
        : file.name === 'second.pdf'
          ? 'b'.repeat(64)
          : file.name === 'copy.pdf'
            ? 'a'.repeat(64)
            : file.name === 'same-name.pdf'
              ? 'd'.repeat(64)
              : 'f'.repeat(64),
      byteSize: file.size,
      pageCount: file.name.startsWith('first') ? 2 : 3,
    }))),
  })),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../book-runtime/BookPdfViewerHost', () => ({
  BookPdfViewerHost: ({ title }: { title: string }) => <div data-testid="candidate-pdf">{title}</div>,
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

const previewActivity: NormalizedActivity = {
  schemaVersion: 1, title: 'Student-visible Unit B activity', taskProfile: null,
  presentationMode: 'structured', contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Student preview content.' }], interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 }, stimulus: null, assetRefs: [],
  interactions: [{ family: 'choice', interactionId: 'choice-b', prompt: 'Choose B', options: ['B'],
    itemIdentities: { family: 'choice', optionIds: ['b'] }, answerKey: { family: 'choice', acceptedOptionItemIds: ['b'] } }],
  scoring: { mode: 'auto-where-possible' },
};

const sourceVersion = (sourceVersionId: string, physicalPageCount = 2) => ({
  sourceVersionId,
  bookId: 'book-1',
  physicalPageCount,
  purpose: 'book-source' as const,
  studentSafeStatus: 'unreviewed' as const,
  verifiedUsable: true,
});

const trustedSourceVersion = (sourceVersionId: string, sourceKey: string): TrustedBookSourceVersionProjection => ({
  sourceKey,
  sourceVersionId,
  bookId: 'book-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  purpose: 'book-source',
  studentSafeStatus: 'unreviewed',
  physicalPageCount: 2,
  verifiedUsable: true,
});

const verifiedUploadState: SourceUploadSafeOperationState = {
  schemaVersion: 1,
  bookId: 'book-1',
  operationId: '11111111-1111-4111-8111-111111111111',
  reservationId: 'reservation-1',
  sourceVersionId: 'source-b',
  sourceKey: 'full',
  kind: 'initial',
  displayFilename: 'book.pdf',
  exactByteSize: 8,
  sha256Hex: 'a'.repeat(64),
  phase: 'verified',
};

const safetyDecision = () => ({
  status: 'verified_completed' as const,
  reservationId: 'reservation-1',
  sourceVersionId: 'source-b',
  checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
  purpose: 'book-source' as const,
  studentSafeStatus: 'ready' as const,
  studentSafeDecision: {
    decidedBy: 'teacher-1',
    decidedAt: '2026-08-11T00:02:00.000Z',
    sourceVersionId: 'source-b',
    sha256Hex: 'a'.repeat(64),
    reasonCode: 'teacher-reviewed' as const,
  },
});

const fullUploadWorkflow = (
  decideStudentSafeSource = vi.fn(async () => safetyDecision()),
): SourceUploadBrowserWorkflow => ({
  load: vi.fn(async () => verifiedUploadState),
  prepareReplacement: vi.fn(async () => undefined),
  start: vi.fn(async () => { throw new Error('unused'); }),
  retryBytes: vi.fn(async () => { throw new Error('unused'); }),
  retryCompletion: vi.fn(async () => { throw new Error('unused'); }),
  decideStudentSafeSource,
  requestCancellation: vi.fn(async () => false),
  retryCleanup: vi.fn(async () => 'cleanup_pending' as const),
});

const previewClient = (
  strategy: 'component_pdfs' | 'full_pdf' = 'component_pdfs',
  candidateOverride?: ReturnType<typeof candidate>,
  activityOverride: NormalizedActivity = previewActivity,
): BookAssemblyPreviewClient => {
  return {
  readCurrentPublication: vi.fn(async () => null),
  preview: vi.fn(async () => {
    const preview = createCandidateUnitPreview({
      candidate: candidateOverride ?? candidate(strategy),
      sourceVersions: strategy === 'component_pdfs'
        ? [
            sourceVersion('source-a'),
            sourceVersion('source-b'),
          ]
        : [sourceVersion('source-b')],
      sourceIsPreviewReady: () => true,
      activitiesByKey: { 'activity-b': activityOverride },
      registryVersion: 'registry-v1',
      ...(strategy === 'component_pdfs' ? { studentDocument: {
        descriptor: createComponentStudentDocument({
          sourceVersionId: 'student-document-v1', descriptorRevision: 1,
          sha256Hex: 'a'.repeat(64), byteSize: 123, physicalPageCount: 4,
          compositionFingerprint: 'composition-v1',
          components: [
            { sourceKey: 'component-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'unit-a', localPageCount: 2, combinedStartPage: 1, combinedEndPage: 2 },
            { sourceKey: 'component-b', sourceVersionId: 'source-b', sourceOrder: 2, ownerNodeKey: 'unit-b', localPageCount: 2, combinedStartPage: 3, combinedEndPage: 4 },
          ],
        }),
        request: { opaqueRouteKey: 'student-document-route', expectedByteLength: 123 },
      } } : {}),
    });
    return { status: 'previewed' as const, preview };
  }),
  approve: vi.fn(async () => ({ approval: {
    approvalId: 'approval-1', approvalRevision: 1,
    approvedAt: '2026-08-28T00:00:00.000Z', expiresAt: '2026-08-29T00:00:00.000Z',
  } })),
  publishFull: vi.fn(async () => ({ operationId: 'operation-1', manifestVersionId: 'manifest-1', publicationId: 'publication-1', publicationRevision: 1, result: { pointer: currentPublication.pointer, version: { studentSafeProjection: { units: currentPublication.units } } } })),
  publishComponent: vi.fn(async () => ({ operationId: 'operation-1', manifestVersionId: 'manifest-1', publicationId: 'publication-1', publicationRevision: 1, result: { pointer: currentPublication.pointer, version: { studentSafeProjection: { units: currentPublication.units } } } })),
  };
};

const currentPublication: BookAssemblyCurrentPublication = {
  pointer: { publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1',
  bookRevision: 2, sourceSetRevision: 3, inputFingerprint: 'input-current',
  updatedAt: '2026-08-28T00:00:00.000Z', updatedByCommandId: 'command-current' },
  units: candidate('full_pdf').manifest!.units,
};

describe('BookPdfFlowWorkspace tracking and announcements', () => {
  const fullPdfProps = (sourceSetAttachmentClient: SourceSetAttachmentClient) => ({
    access: 'owner' as const,
    bookId: 'book-1',
    title: 'Full-PDF Book',
    presentation: 'modal' as const,
    experience: 'guided-creation' as const,
    uploadWorkflow: fullUploadWorkflow(),
    assemblySourceVersions: [sourceVersion('source-b')],
    assemblyInitialCandidate: candidate('full_pdf'),
    assemblyBookRevision: 2,
    assemblySourceSetRevision: 3,
    sourceSetAttachmentClient,
  });

  it('attaches the current full PDF source set before advancing', async () => {
    const user = userEvent.setup();
    const sourceSetAttachmentClient = {
      attachSourceSet: vi.fn(async (command) => ({
        status: 'attached' as const,
        bookRevision: 3,
        sourceSetRevision: 4,
        sourceSet: command.sourceSet,
      })),
    } satisfies SourceSetAttachmentClient;
    render(<BookPdfFlowWorkspace {...fullPdfProps(sourceSetAttachmentClient)} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(sourceSetAttachmentClient.attachSourceSet).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      expectedBookRevision: 2,
      expectedSourceSetRevision: 3,
      sourceSet: {
        sourceStrategy: 'full_pdf',
        sources: [{ sourceKey: 'full', sourceVersionId: 'source-b', sourceOrder: 1 }],
      },
    }));
    expect(await screen.findByRole('heading', { name: 'Build the Book structure' })).toBeInTheDocument();
  });

  it.each([false, true])('recovers only exact component reservations for a saved first draft (wrong source=%s)', async (wrongSource) => {
    const user = userEvent.setup();
    const draft = { ...candidate('component_pdfs'), bookRevision: 0, sourceSetRevision: 0 };
    const workflows = Object.fromEntries(['component-a', 'component-b', 'student-document'].map((sourceKey, index) => [sourceKey, {
      ...fullUploadWorkflow(), load: vi.fn(async () => ({ ...verifiedUploadState, sourceKey,
        purpose: sourceKey === 'student-document' ? 'student-document' as const : 'book-source' as const,
        sourceVersionId: sourceKey === 'component-a' ? (wrongSource ? 'wrong-source' : 'source-a') : 'source-b',
        reservationId: `reservation-${index}`, })),
    }]));
    render(<BookPdfFlowWorkspace access="owner" bookId="book-1" title="Book" presentation="modal"
      experience="guided-creation" uploadWorkflow={null} uploadWorkflowForSource={(sourceKey) => workflows[sourceKey]}
      assemblyInitialCandidate={draft} assemblyBookRevision={0} assemblySourceSetRevision={0}
      assemblySourceVersions={[sourceVersion('source-a'), sourceVersion('source-b')]} />);
    await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
    if (wrongSource) {
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(workflows['student-document'].decideStudentSafeSource).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Give each PDF a place', level: 2 })).not.toBeInTheDocument();
    } else {
      await screen.findByRole('heading', { name: 'Give each PDF a place', level: 2 });
      expect(workflows['student-document'].load).toHaveBeenCalledWith('book-1');
      expect(workflows['student-document'].decideStudentSafeSource).toHaveBeenCalledWith('book-1');
    }
    for (const workflow of Object.values(workflows)) expect(workflow.start).not.toHaveBeenCalled();
  });

  it('fences component setup and picker changes while saved reservations resume', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: SourceUploadSafeOperationState) => void;
    const pending = new Promise<SourceUploadSafeOperationState>((resolve) => { resolveFirst = resolve; });
    const workflows = Object.fromEntries(['component-a', 'component-b', 'student-document'].map((sourceKey, index) => [sourceKey, {
      ...fullUploadWorkflow(), load: vi.fn(() => sourceKey === 'component-a' ? pending : Promise.resolve({
        ...verifiedUploadState, sourceKey, reservationId: `reservation-${index}`,
        purpose: sourceKey === 'student-document' ? 'student-document' as const : 'book-source' as const,
        sourceVersionId: 'source-b',
      })),
    }]));
    render(<BookPdfFlowWorkspace access="owner" bookId="book-1" title="Book" presentation="modal"
      experience="guided-creation" uploadWorkflow={null} uploadWorkflowForSource={(sourceKey) => workflows[sourceKey]}
      assemblyInitialCandidate={{ ...candidate('component_pdfs'), bookRevision: 0, sourceSetRevision: 0 }}
      assemblyBookRevision={0} assemblySourceSetRevision={0}
      assemblySourceVersions={[sourceVersion('source-a'), sourceVersion('source-b')]} />);
    await user.click(screen.getByRole('button', { name: 'Continue', exact: true }));
    expect(workflows['component-a'].load).toHaveBeenCalledWith('book-1');
    expect(screen.getByRole('button', { name: 'Add PDFs' })).toBeDisabled();
    expect(screen.getByLabelText('Choose PDFs to combine')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change PDF setup' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Build your Book/u })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attaching…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Change PDF setup' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose PDFs to combine'), {
      target: { files: [new File(['changed'], 'changed.pdf', { type: 'application/pdf' })] },
    });
    expect(screen.queryByText('changed.pdf')).not.toBeInTheDocument();
    resolveFirst({ ...verifiedUploadState, sourceKey: 'component-a', sourceVersionId: 'source-a',
      reservationId: 'reservation-0', purpose: 'book-source' });
    await screen.findByRole('heading', { name: 'Give each PDF a place', level: 2 });
    expect(workflows['student-document'].load).toHaveBeenCalledWith('book-1');
    for (const workflow of Object.values(workflows)) expect(workflow.start).not.toHaveBeenCalled();
  });

  it('keeps Continue busy and on Upload PDFs until full attachment succeeds', async () => {
    const user = userEvent.setup();
    let resolve!: (value: Awaited<ReturnType<SourceSetAttachmentClient['attachSourceSet']>>) => void;
    const pending = new Promise<Awaited<ReturnType<SourceSetAttachmentClient['attachSourceSet']>>>((nextResolve) => { resolve = nextResolve; });
    const sourceSetAttachmentClient = {
      attachSourceSet: vi.fn(() => pending),
    } satisfies SourceSetAttachmentClient;
    render(<BookPdfFlowWorkspace {...fullPdfProps(sourceSetAttachmentClient)} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Attaching…' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Start with one PDF' })).toBeInTheDocument();

    resolve({
      status: 'attached',
      bookRevision: 3,
      sourceSetRevision: 4,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-b', sourceOrder: 1 }] },
    });
    expect(await screen.findByRole('heading', { name: 'Build the Book structure' })).toBeInTheDocument();
  });

  it('keeps the attachment operation id for failure recovery and retry', async () => {
    const user = userEvent.setup();
    const sourceSetAttachmentClient = {
      attachSourceSet: vi.fn()
        .mockRejectedValueOnce(new Error('temporary attachment failure'))
        .mockResolvedValueOnce({
          status: 'replayed' as const,
          bookRevision: 3,
          sourceSetRevision: 4,
          sourceSet: { sourceStrategy: 'full_pdf' as const, sources: [{ sourceKey: 'full', sourceVersionId: 'source-b', sourceOrder: 1 }] },
        }),
    } satisfies SourceSetAttachmentClient;
    render(<BookPdfFlowWorkspace {...fullPdfProps(sourceSetAttachmentClient)} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The Book PDF could not be attached. Retry.'));
    expect(screen.getByRole('heading', { name: 'Start with one PDF' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Build the Book structure' });
    expect(sourceSetAttachmentClient.attachSourceSet).toHaveBeenCalledTimes(2);
    expect(sourceSetAttachmentClient.attachSourceSet.mock.calls[1]?.[0].operationId)
      .toBe(sourceSetAttachmentClient.attachSourceSet.mock.calls[0]?.[0].operationId);
  });

  it('rotates the full attachment key after a stale revision and keeps retry on Upload PDFs', async () => {
    const user = userEvent.setup();
    const stale = Object.assign(new Error('backend stale revision'), { code: 'stale_cas', status: 409 });
    const sourceSetAttachmentClient = {
      attachSourceSet: vi.fn()
        .mockRejectedValueOnce(stale)
        .mockResolvedValueOnce({
          status: 'attached' as const,
          bookRevision: 4,
          sourceSetRevision: 5,
          sourceSet: { sourceStrategy: 'full_pdf' as const, sources: [{ sourceKey: 'full', sourceVersionId: 'source-b', sourceOrder: 1 }] },
        }),
    } satisfies SourceSetAttachmentClient;
    const props = fullPdfProps(sourceSetAttachmentClient);
    const view = render(<BookPdfFlowWorkspace {...props} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The Book changed elsewhere. Refresh and retry.'));
    expect(screen.getByRole('heading', { name: 'Start with one PDF' })).toBeInTheDocument();

    view.rerender(<BookPdfFlowWorkspace {...props} assemblyBookRevision={3} assemblySourceSetRevision={4} />);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Build the Book structure' });

    expect(sourceSetAttachmentClient.attachSourceSet.mock.calls[1]?.[0].expectedBookRevision).toBe(3);
    expect(sourceSetAttachmentClient.attachSourceSet.mock.calls[1]?.[0].expectedSourceSetRevision).toBe(4);
    expect(sourceSetAttachmentClient.attachSourceSet.mock.calls[1]?.[0].operationId)
      .not.toBe(sourceSetAttachmentClient.attachSourceSet.mock.calls[0]?.[0].operationId);
  });

  it('registers every PDF workspace action under the live Book feature exactly once', () => {
    const liveActions = FEATURE_REGISTRY.find((feature) => feature.id === FEATURE_IDS.bookAuthoring)?.actions ?? [];
    const testCreationActions = FEATURE_REGISTRY.find((feature) => feature.id === FEATURE_IDS.testCreation)?.actions ?? [];
    const pdfWorkspaceActions = [
      'teacher_materials_book_pdf_workflow_step_changed',
      'teacher_materials_book_pdf_mode_selected',
      'teacher_materials_book_pdf_source_verified',
      'teacher_materials_book_pdf_source_upload_verified',
      'teacher_materials_book_pdf_combine_files_selected',
      'teacher_materials_book_pdf_combine_files_checked',
      'teacher_materials_book_pdf_combine_selection_rejected',
      'teacher_materials_book_pdf_combine_started',
      'teacher_materials_book_pdf_combine_canceled',
      'teacher_materials_book_pdf_combine_completed',
      'teacher_materials_book_pdf_combine_failed',
      'teacher_materials_book_pdf_combine_back_to_files',
      'teacher_materials_book_pdf_combine_order_changed',
      'teacher_materials_book_pdf_combine_file_removed',
      'teacher_materials_book_pdf_combine_duplicate_kept',
      'teacher_materials_book_pdf_combine_handed_off_to_upload',
      'teacher_materials_book_assembly_candidate_preview_opened',
      'teacher_materials_book_assembly_candidate_preview_approved',
      'teacher_materials_book_pdf_student_safe_decision',
      'teacher_materials_book_pdf_published',
      'teacher_materials_book_pdf_returned_to_book',
    ];

    expect(liveActions).toEqual(expect.arrayContaining(pdfWorkspaceActions));
    expect(testCreationActions).not.toEqual(expect.arrayContaining(pdfWorkspaceActions));
    expect(pdfWorkspaceActions.filter((action) => liveActions.includes(action))).toHaveLength(pdfWorkspaceActions.length);
  });

  it('redacts internal preview identities from workspace telemetry', async () => {
    const user = userEvent.setup();
    const onTrackAction = vi.fn();
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={null}
        assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')}
        assemblyBookRevision={2} assemblySourceSetRevision={3}
        assemblyPreviewClient={previewClient('full_pdf')} onTrackAction={onTrackAction}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));

    const opened = onTrackAction.mock.calls.find(([action]) => action === 'teacher_materials_book_assembly_candidate_preview_opened');
    const approved = onTrackAction.mock.calls.find(([action]) => action === 'teacher_materials_book_assembly_candidate_preview_approved');
    expect(opened?.[1]).toEqual(expect.objectContaining({ status: 'opened' }));
    expect(approved?.[1]).toEqual(expect.objectContaining({ status: 'approved' }));
    for (const metadata of [opened?.[1], approved?.[1]]) {
      expect(metadata).not.toHaveProperty('candidateId');
      expect(metadata).not.toHaveProperty('approvalId');
    }
  });

  it('uses the shared warning for an unavailable setup change', async () => {
    const user = userEvent.setup();
    render(
      <BookPdfFlowWorkspace
        access="owner"
        bookId="book-1"
        title="Full-PDF Book"
        presentation="modal"
        experience="guided-creation"
        uploadWorkflow={null}
        assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change PDF setup' }));
    await user.click(screen.getByRole('button', { name: 'Prepare reviewed change' }));

    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('trusted migration service'));
    expect(screen.queryByText(/trusted migration service/)).not.toBeInTheDocument();
  });
});

describe('BookPdfFlowWorkspace student preview', () => {
  it('keeps publication unavailable while the current publication is loading', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={null} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loading"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));

    expect(screen.getByText(/Publishing is locked until this finishes/i)).toBeInTheDocument();
    expect(screen.queryByText('Nothing is published yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish Unit 1', exact: true })).not.toBeInTheDocument();
    expect(client.publishFull).not.toHaveBeenCalled();
  });

  it('fails closed when the current publication cannot be verified and offers retry guidance', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const client = previewClient('full_pdf');
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={null} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="error"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client} onRetryCurrentPublication={retry}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Retry the check or close and reopen/i);
    await user.click(screen.getByRole('button', { name: 'Retry publication check' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Nothing is published yet')).not.toBeInTheDocument();
    expect(client.publishFull).not.toHaveBeenCalled();
  });

  it('publishes with a null current-publication pointer after a confirmed empty read', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    const workflow = fullUploadWorkflow();
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={workflow} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loaded"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));
    await user.click(screen.getByRole('button', { name: 'Publish Unit 1', exact: true }));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);

    expect(client.publishFull).toHaveBeenCalledWith(expect.objectContaining({ expectedCurrentPublicationId: null }));
    expect(screen.getAllByRole('heading', { name: 'Unit 1 is published' })).toHaveLength(2);
  });

  it('offers publication for another approved Activity revision with unchanged Book and source revisions', async () => {
    const user = userEvent.setup();
    const titledCandidate = {
      ...candidate('full_pdf'),
      manifest: {
        ...candidate('full_pdf').manifest!,
        nodes: candidate('full_pdf').manifest!.nodes.map((node) => node.nodeKey === 'unit-b' ? { ...node, title: 'Growing Up' } : node),
      },
    };
    const priorPublication = {
      ...currentPublication,
      pointer: { ...currentPublication.pointer, publicationId: 'publication-2', publicationRevision: 2, manifestVersionId: 'manifest-2' },
    };
    const updatedActivity = { ...previewActivity, instructions: [{ text: 'Review the revised source pages before responding.' }] };
    const client = previewClient('full_pdf', titledCandidate, updatedActivity);
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal"
        experience="focused-editing" editingSection="preview" previewUnitKey="unit-b"
        uploadWorkflow={null} assemblySourceVersions={[trustedSourceVersion('source-b', 'full')]}
        assemblyInitialCandidate={titledCandidate} assemblyInitialPublication={priorPublication}
        assemblyInitialPublicationStatus="loaded" assemblyBookRevision={2} assemblySourceSetRevision={3}
        assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    const approveButton = screen.getByRole('button', { name: 'Approve this preview' });
    await waitFor(() => expect(approveButton).toBeEnabled());
    await user.click(approveButton);
    const publishButton = screen.getByRole('button', { name: 'Publish Growing Up' });
    await waitFor(() => expect(publishButton).toBeEnabled());

    expect(client.approve).toHaveBeenCalledOnce();
    const approvalResult = await client.approve.mock.results[0]!.value;
    expect(approvalResult.approval).not.toHaveProperty('approvedInputFingerprint');
    expect(approvalResult.approval).not.toHaveProperty('candidateId');
    expect(approvalResult.approval).not.toHaveProperty('inputFingerprint');
    expect(priorPublication.pointer.bookRevision).toBe(titledCandidate.bookRevision);
    expect(priorPublication.pointer.sourceSetRevision).toBe(titledCandidate.sourceSetRevision);
    expect(screen.queryByRole('button', { name: 'Review publication' })).not.toBeInTheDocument();
    expect(screen.getByText('Review the revised source pages before responding.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unit 1 is published' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish Growing Up' }));
    const confirmation = screen.getByRole('dialog', { name: 'Publish Growing Up?' });
    expect(confirmation).toHaveTextContent('Students can open Growing Up after you assign it as homework.');
    expect(confirmation).toHaveTextContent('Existing homework keeps the currently published version.');
  });

  it('decides the full PDF immediately before publishing through the existing confirmation', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    const decideStudentSafeSource = vi.fn(async () => safetyDecision());
    const workflow = fullUploadWorkflow(decideStudentSafeSource);
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={workflow} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loaded"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));
    await user.click(screen.getByRole('button', { name: 'Publish Unit 1', exact: true }));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);

    await waitFor(() => expect(decideStudentSafeSource).toHaveBeenCalledWith('book-1'));
    expect(client.publishFull).toHaveBeenCalledTimes(1);
    expect(client.publishFull.mock.calls[0]![0].previewApproval).toEqual({
      approvalId: 'approval-1', approvalRevision: 1,
      approvedAt: '2026-08-28T00:00:00.000Z', expiresAt: '2026-08-29T00:00:00.000Z',
    });
  });

  it('keeps the publish confirmation open and publishes nothing on stale or hash-mismatched safety failure', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    const workflow = fullUploadWorkflow(vi.fn(async () => {
      throw new SourceUploadClientError('response_binding_mismatch', 502);
    }));
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={workflow} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loaded"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));
    await user.click(screen.getByRole('button', { name: 'Publish Unit 1', exact: true }));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The Book service is unavailable. Retry.'));
    expect(client.publishFull).not.toHaveBeenCalled();
  });

  it('keeps owner and administrator denial actionable at the publish confirmation', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    const workflow = fullUploadWorkflow(vi.fn(async () => {
      throw new SourceUploadClientError('authority_denied', 403);
    }));
    render(
      <BookPdfFlowWorkspace
        access="administrator" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={workflow} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loaded"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));
    await user.click(screen.getByRole('button', { name: 'Publish Unit 1', exact: true }));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You no longer have access to this Book. Reopen it and retry.'));
    expect(client.publishFull).not.toHaveBeenCalled();
  });

  it('retries the full-PDF safety decision with the same workflow identity before publishing', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    const decideStudentSafeSource = vi.fn()
      .mockRejectedValueOnce(new SourceUploadClientError('unavailable', 503))
      .mockResolvedValueOnce(safetyDecision());
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={fullUploadWorkflow(decideStudentSafeSource)} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loaded"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));
    await user.click(screen.getByRole('button', { name: 'Publish Unit 1', exact: true }));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The Book service is unavailable. Retry.'));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);

    await waitFor(() => expect(decideStudentSafeSource).toHaveBeenCalledTimes(2));
    expect(client.publishFull).toHaveBeenCalledTimes(1);
  });

  it('replays the same safety decision when publish fails and Publish is retried', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    const decision = safetyDecision();
    const decideStudentSafeSource = vi.fn(async () => decision);
    vi.mocked(client.publishFull)
      .mockRejectedValueOnce(new SourceUploadClientError('unavailable', 503));
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={fullUploadWorkflow(decideStudentSafeSource)} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loaded"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The Book service is unavailable. Retry.'));

    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);

    await waitFor(() => expect(client.publishFull).toHaveBeenCalledTimes(2));
    expect(decideStudentSafeSource).toHaveBeenCalledTimes(2);
    expect(await decideStudentSafeSource.mock.results[0]!.value).toBe(decision);
    expect(await decideStudentSafeSource.mock.results[1]!.value).toBe(decision);
    expect(client.publishFull.mock.calls[0]![0].operationId)
      .toBe(client.publishFull.mock.calls[1]![0].operationId);
  });

  it('does not decide or publish private component rows', async () => {
    const user = userEvent.setup();
    const client = previewClient('component_pdfs');
    const decideStudentSafeSource = vi.fn(async () => safetyDecision());
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Component-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={fullUploadWorkflow(decideStudentSafeSource)}
        assemblySourceVersions={[sourceVersion('source-a'), sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('component_pdfs')}
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));

    const publishButton = screen.getByRole('button', { name: 'Combine PDFs before publishing', exact: true });
    expect(publishButton).toBeDisabled();
    expect(decideStudentSafeSource).not.toHaveBeenCalled();
    expect(client.publishComponent).not.toHaveBeenCalled();
  });

  it('keeps the publish receipt after refresh failure and exposes one retry', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    const workflow = fullUploadWorkflow();
    vi.mocked(client.readCurrentPublication!).mockRejectedValueOnce(new Error('temporary refresh failure')).mockResolvedValueOnce(currentPublication);
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={workflow} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={null} assemblyInitialPublicationStatus="loaded"
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));
    await user.click(screen.getByRole('button', { name: 'Publish Unit 1', exact: true }));
    await user.click(screen.getAllByRole('button', { name: 'Publish Unit 1', exact: true }).at(-1)!);

    expect(client.publishFull).toHaveBeenCalledTimes(1);
    expect(await screen.findAllByRole('heading', { name: 'Unit 1 is published' })).toHaveLength(2);
    expect(await screen.findByRole('button', { name: 'Refresh publication status' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish Unit 1', exact: true })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh publication status' }));
    await waitFor(() => expect(client.readCurrentPublication).toHaveBeenCalledTimes(2));
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('could not be refreshed'));
    expect(toast.success).toHaveBeenCalledWith('Book published. The current publication is now confirmed.');
    expect(screen.queryByText('Book published. The current publication is now confirmed.')).not.toBeInTheDocument();
    expect(client.publishFull).toHaveBeenCalledTimes(1);
  });

  it('keeps the persisted publication live while offering a reviewed successor after reopen', async () => {
    const user = userEvent.setup();
    const client = previewClient('full_pdf');
    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Full-PDF Book" presentation="modal" experience="guided-creation"
        uploadWorkflow={null} assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')} assemblyInitialPublication={currentPublication}
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: /Publish$/i }));

    expect(screen.getByText('Reviewed version ready to publish')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish Unit 1', exact: true })).toBeEnabled();
    expect(client.publishFull).not.toHaveBeenCalled();
    expect(screen.queryByText('Nothing is published yet')).not.toBeInTheDocument();
  });

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
        experience="guided-creation"
        uploadWorkflow={null}
        assemblySourceVersions={strategy === 'component_pdfs'
          ? [
              sourceVersion('source-a'),
              sourceVersion('source-b'),
            ]
          : [sourceVersion('source-b')]}
        assemblyInitialCandidate={initialCandidate}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
        assemblyPreviewClient={previewClient(strategy)}
        assemblyPreviewDocuments={[{
          kind: 'teacher_assembly', bookId: 'book-1', candidateId: 'candidate-1', candidateRevision: 4,
          bookRevision: 2, sourceSetRevision: 3,
          sourceKey: strategy === 'component_pdfs' ? 'component-b' : 'full', sourceVersionId: 'source-b',
          route: { url: 'http://localhost:8787/preview', sourceVersionId: 'source-b' },
        }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));

    expect(await screen.findByRole('heading', { name: 'Student Book preview' })).toBeInTheDocument();
    expect(screen.getByTestId('book-runtime-shell')).toBeInTheDocument();
    expect(screen.getByText('Student preview content.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Exit preview' }));
    expect(screen.queryByRole('heading', { name: 'Student Book preview' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh preview' }));
    expect(await screen.findByRole('heading', { name: 'Student Book preview' })).toBeInTheDocument();
  });

  it('publishes a focused component successor after exact approval of every Unit at unchanged Book/source revisions', async () => {
    const user = userEvent.setup();
    const descriptor = createComponentStudentDocument({ sourceVersionId: 'student-document-v1', descriptorRevision: 1,
      sha256Hex: 'a'.repeat(64), byteSize: 123, physicalPageCount: 4, compositionFingerprint: 'composition-v1', components: [
        { sourceKey: 'component-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'unit-a', localPageCount: 2, combinedStartPage: 1, combinedEndPage: 2 },
        { sourceKey: 'component-b', sourceVersionId: 'source-b', sourceOrder: 2, ownerNodeKey: 'unit-b', localPageCount: 2, combinedStartPage: 3, combinedEndPage: 4 },
      ] });
    const qualification = { wholeActivationFingerprint: 'fnv1a64:aaaaaaaaaaaaaaaa', units: [
      { unitKey: 'unit-b', candidateId: 'candidate-1', candidateRevision: 4 },
      { unitKey: 'unit-a', candidateId: 'candidate-2', candidateRevision: 5 },
    ] };
    let latestFingerprints: Record<string, string> = {};
    const preview = vi.fn(async (input: { unitKey: string; candidateId: string; expectedCandidateRevision: number }) => {
      const selected = { ...candidate('component_pdfs'), unitKey: input.unitKey,
        candidateId: input.candidateId, revision: input.expectedCandidateRevision };
      const projection = createCandidateUnitPreview({ candidate: selected,
        sourceVersions: [trustedSourceVersion('source-a', 'component-a'), trustedSourceVersion('source-b', 'component-b')], sourceIsPreviewReady: () => true,
        activitiesByKey: { [input.unitKey === 'unit-a' ? 'activity-a' : 'activity-b']: previewActivity },
        registryVersion: 'registry-v1', studentDocument: { descriptor,
          request: { opaqueRouteKey: 'student-document-route', expectedByteLength: 123 } } });
      latestFingerprints[input.unitKey] = previewInputFingerprint(projection);
      return { preview: projection, qualification };
    });
    const approve = vi.fn(async (input: { unitKey: string; candidateId: string; expectedCandidateRevision: number; expectedUnitInputFingerprint?: string; expectedWholeActivationFingerprint?: string }) => ({ approval: { approvalId: `approval-${input.unitKey}`,
        approvalRevision: 1, approvedAt: '2026-08-28T00:00:00.000Z', expiresAt: '2026-08-29T00:00:00.000Z' } }));
    const publishComponent = vi.fn(async () => ({ operationId: 'operation-1', manifestVersionId: 'manifest-1',
      publicationId: 'publication-1', publicationRevision: 1, result: {} }));
    const client: BookAssemblyPreviewClient = { readCurrentPublication: vi.fn(async () => null), preview, approve,
      publishComponent, publishFull: vi.fn(async () => { throw new Error('wrong publication path'); }) };
    const priorComponentPublication = { ...currentPublication, units: candidate('component_pdfs').manifest!.units };
    expect(candidate('component_pdfs').bookRevision).toBe(currentPublication.pointer.bookRevision);
    expect(candidate('component_pdfs').sourceSetRevision).toBe(currentPublication.pointer.sourceSetRevision);
    render(<BookPdfFlowWorkspace access="owner" bookId="book-1" title="Component Book" presentation="modal"
      experience="focused-editing" editingSection="preview" mode="component" uploadWorkflow={null}
      assemblySourceVersions={[trustedSourceVersion('source-a', 'component-a'), trustedSourceVersion('source-b', 'component-b')]}
      assemblyInitialCandidate={candidate('component_pdfs')} assemblyInitialPublication={priorComponentPublication}
      assemblyInitialPublicationStatus="loaded" assemblyBookRevision={2} assemblySourceSetRevision={3}
      assemblyPreviewClient={client} />);
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    expect(screen.getByRole('button', { name: 'Publish Book' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    await user.click(screen.getByRole('button', { name: 'Publish Book' }));
    expect(approve.mock.calls.map(([input]) => input.expectedUnitInputFingerprint)).toEqual([
      latestFingerprints['unit-b'], latestFingerprints['unit-a'],
    ]);
    expect(approve.mock.calls.every(([input]) => input.expectedWholeActivationFingerprint === qualification.wholeActivationFingerprint)).toBe(true);
    const confirmation = screen.getByRole('dialog', { name: 'Publish 2 approved Units?' });
    expect(confirmation).toHaveTextContent('Unit 1, Unit 2');
    expect(confirmation).not.toHaveTextContent('unit-b');
    expect(confirmation).toHaveTextContent('after you assign them as homework');
    await user.click(screen.getByRole('button', { name: 'Publish approved Units' }));
    expect(preview).toHaveBeenCalledTimes(2);
    expect(approve).toHaveBeenCalledTimes(2);
    expect(publishComponent).toHaveBeenCalledWith(expect.objectContaining({
      unitApprovals: [expect.objectContaining({ unitKey: 'unit-b' }), expect.objectContaining({ unitKey: 'unit-a' })],
    }));
      for (const reference of vi.mocked(client.publishComponent).mock.calls[0]![0].unitApprovals) {
        expect(Object.keys(reference).sort()).toEqual([
          'approvalId', 'approvalRevision', 'approvedAt', 'candidateId', 'candidateRevision', 'expiresAt', 'unitKey',
        ]);
      }
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
        experience="guided-creation"
        uploadWorkflow={null}
        assemblySourceVersions={[
          sourceVersion('source-a'),
          sourceVersion('source-b'),
        ]}
        assemblyInitialCandidate={candidate('component_pdfs')}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
        assemblyPreviewClient={client}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Check & preview/i }));
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    expect(toast.error).toHaveBeenCalledWith('Student preview could not be loaded. Retry.');
    expect(screen.queryByText('temporary preview failure')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    expect(await screen.findByRole('heading', { name: 'Student Book preview' })).toBeInTheDocument();
    expect(screen.queryByText('temporary preview failure')).not.toBeInTheDocument();
  });

  it('previews the selected saved Unit and invalidates preview when the Unit or saved candidate changes', async () => {
    const user = userEvent.setup();
    const selected = { ...candidate('full_pdf'), candidateId: 'candidate-a', unitKey: 'unit-a' };
    const fullSource = { ...trustedSourceVersion('source-b', 'full'), studentSafeStatus: 'ready' as const,
      studentSafeDecision: safetyDecision().studentSafeDecision };
    const decideStudentSafeSource = vi.fn(async () => { throw new Error('invalid_operation'); });
    const workflow = { ...fullUploadWorkflow(decideStudentSafeSource), load: vi.fn(async () => null) };
    const loadCurrent = vi.fn(async () => ({ candidate: selected, savedActivityKeysByUnit: {} }));
    const replace = vi.fn(async (input: { manifest: BookAssemblyCandidateRecord['manifest'] }) => ({
      status: 'replaced', candidate: { ...candidate('full_pdf'), manifest: input.manifest, revision: 5 },
    }));
    const client = previewClient('full_pdf');
    client.preview = vi.fn(async () => ({ preview: createCandidateUnitPreview({
      candidate: selected, sourceVersions: [fullSource], sourceIsPreviewReady: () => true,
      activitiesByKey: { 'activity-a': previewActivity }, registryVersion: 'registry-v1',
    }) }));
    const props = {
      access: 'owner' as const, bookId: 'book-1', title: 'Book', presentation: 'modal' as const,
      experience: 'focused-editing' as const, editingSection: 'preview' as const,
      uploadWorkflow: workflow,
      assemblySourceVersions: [fullSource], assemblyInitialCandidate: candidate('full_pdf'),
      assemblyInitialPublication: currentPublication, assemblyInitialPublicationStatus: 'loaded' as const,
      assemblyBookRevision: 2, assemblySourceSetRevision: 3, assemblyPreviewClient: client,
      assemblyRepository: { loadCurrent, replace } as unknown as UnitAssemblyRepository,
    };
    const view = render(<BookPdfFlowWorkspace {...props} previewUnitKey="unit-a" />);
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    expect(loadCurrent).toHaveBeenCalledWith('book-1', 'unit-a');
    expect(client.preview).toHaveBeenCalledWith(expect.objectContaining({ unitKey: 'unit-a', candidateId: 'candidate-a' }));
    expect(screen.getByRole('button', { name: 'Approve this preview' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Approve this preview' }));
    const publishButton = screen.getByRole('button', { name: 'Publish Selected Unit', exact: true });
    expect(publishButton).toBeEnabled();
    await user.click(publishButton);
    await user.click(within(screen.getByRole('dialog', { name: 'Publish Selected Unit?' }))
      .getByRole('button', { name: 'Publish Selected Unit', exact: true }));
    await waitFor(() => expect(client.publishFull).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1', unitKey: 'unit-a', candidateId: 'candidate-a', expectedCandidateRevision: selected.revision,
      expectedBookRevision: 2, expectedSourceSetRevision: 3,
      expectedCurrentPublicationId: currentPublication.pointer.publicationId,
    })));
    expect(decideStudentSafeSource).not.toHaveBeenCalled();
    expect(workflow.start).not.toHaveBeenCalled();
    view.rerender(<BookPdfFlowWorkspace {...props} previewUnitKey="unit-b" />);
    expect(screen.getByRole('button', { name: 'Approve this preview' })).toBeDisabled();
    view.rerender(<BookPdfFlowWorkspace {...props} previewUnitKey="unit-a" />);
    await user.click(screen.getByRole('button', { name: 'Preview as a student' }));
    expect(screen.getByRole('button', { name: 'Approve this preview' })).toBeEnabled();
    view.rerender(<BookPdfFlowWorkspace {...props} previewUnitKey="unit-a" editingSection="content-tree" />);
    const changedPlan = candidate('full_pdf').manifest!;
    fireEvent.change(screen.getByLabelText('Book plan JSON'), { target: { value: JSON.stringify({
      nodes: changedPlan.nodes.map((node) => ({ ...node, title: 'Updated chapter' })), units: changedPlan.units,
    }) } });
    await user.click(screen.getByRole('button', { name: 'Import plan' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    view.rerender(<BookPdfFlowWorkspace {...props} previewUnitKey="unit-a" />);
    expect(screen.getByRole('button', { name: 'Approve this preview' })).toBeDisabled();
  });

  it('shows saved Unit content on opening Content without opening or approving the explicit preview', async () => {
    const savedCandidate = {
      ...candidate('full_pdf'), unitKey: 'unit-a',
      manifest: {
        ...candidate('full_pdf').manifest!,
        nodes: candidate('full_pdf').manifest!.nodes.map((node) => node.nodeKey === 'unit-a' ? { ...node, title: 'Getting Started' } : node),
      },
    };
    const loadCurrent = vi.fn(async () => ({ candidate: savedCandidate, savedActivityKeysByUnit: { 'unit-a': ['activity-a'] } }));
    const client = previewClient('full_pdf');
    client.preview = vi.fn(async () => ({ preview: createCandidateUnitPreview({
      candidate: savedCandidate, sourceVersions: [sourceVersion('source-b')], sourceIsPreviewReady: () => true,
      activitiesByKey: { 'activity-a': { ...previewActivity, title: 'Choose the best answer', instructions: [{ text: 'Read the short passage, then select one answer.' }] } },
      registryVersion: 'registry-v1',
    }) }));

    render(
      <BookPdfFlowWorkspace
        access="owner" bookId="book-1" title="Book" presentation="modal" experience="focused-editing"
        editingSection="activity-json" previewUnitKey="unit-a" uploadWorkflow={null}
        assemblySourceVersions={[sourceVersion('source-b')]} assemblyInitialCandidate={savedCandidate}
        assemblyInitialSavedActivityKeysByUnit={{ 'unit-a': ['activity-a'] }}
        assemblyBookRevision={2} assemblySourceSetRevision={3} assemblyPreviewClient={client}
        assemblyRepository={{ loadCurrent } as unknown as UnitAssemblyRepository}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Getting Started activities' })).toBeInTheDocument();
    expect(await screen.findByText('Choose the best answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace activities' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import activities' })).not.toBeInTheDocument();
    expect(screen.getByText('Read the short passage, then select one answer.')).toBeInTheDocument();
    expect(loadCurrent).toHaveBeenCalledWith('book-1', 'unit-a');
    expect(client.preview).toHaveBeenCalledOnce();
    expect(screen.queryByRole('heading', { name: 'Student Book preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve this preview' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit Choose the best answer' }));
    expect(screen.getByRole('button', { name: 'Save activity' })).toBeDisabled();
    expect(screen.getByLabelText('Paste returned JSON')).toBeInTheDocument();
  });

  it('keeps focused preview fail-closed while the persisted PDF source is not ready', () => {
    const client = previewClient('full_pdf');
    render(
      <BookPdfFlowWorkspace
        access="owner"
        bookId="book-1"
        title="Full-PDF Book"
        presentation="modal"
        experience="focused-editing"
        editingSection="preview"
        uploadWorkflow={null}
        assemblySourceVersions={[]}
        assemblyInitialCandidate={candidate('full_pdf')}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
        assemblyPreviewClient={client}
      />,
    );

    expect(screen.getByRole('button', { name: 'Preview as a student' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve this preview' })).toBeDisabled();
    expect(client.preview).not.toHaveBeenCalled();
  });

  it('lets focused editing replace a persisted PDF source', async () => {
    const user = userEvent.setup();
    render(
      <BookPdfFlowWorkspace
        access="owner"
        bookId="book-1"
        title="Full-PDF Book"
        presentation="modal"
        experience="focused-editing"
        editingSection="pdf-files"
        uploadWorkflow={null}
        assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Replace PDF' }));

    expect(screen.getByText('Choose your PDF', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('We will check the file in your browser before anything is uploaded.')).toBeInTheDocument();
  });

  it('keeps replacement upload active when the scoped session still has the prior verified source', async () => {
    const user = userEvent.setup();
    const previousState: SourceUploadSafeOperationState = {
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: 'previous-operation',
      sourceKey: 'full',
      kind: 'initial',
      displayFilename: 'existing.pdf',
      exactByteSize: 8,
      sha256Hex: 'c'.repeat(64),
      phase: 'verified',
      reservationId: 'previous-reservation',
      sourceVersionId: 'source-b',
    };
    const replacementState: SourceUploadSafeOperationState = {
      ...previousState,
      operationId: 'replacement-operation',
      kind: 'replacement',
      displayFilename: 'replacement.pdf',
      exactByteSize: 11,
      sha256Hex: 'd'.repeat(64),
      reservationId: 'replacement-reservation',
      sourceVersionId: 'source-replacement',
    };
    let replacementPrepared = false;
    const workflow = {
      load: vi.fn(async () => replacementPrepared ? null : previousState),
      prepareReplacement: vi.fn(async () => { replacementPrepared = true; }),
      start: vi.fn(async () => ({
        state: replacementState,
        completion: { status: 'verified_completed' as const, reservationId: 'replacement-reservation', sourceVersionId: 'source-replacement' },
      })),
      retryBytes: vi.fn(),
      retryCompletion: vi.fn(),
      requestCancellation: vi.fn(),
      retryCleanup: vi.fn(),
    } satisfies SourceUploadBrowserWorkflow;

    render(
      <BookPdfFlowWorkspace
        access="owner"
        bookId="book-1"
        title="Full-PDF Book"
        presentation="modal"
        experience="focused-editing"
        editingSection="pdf-files"
        uploadWorkflow={workflow}
        assemblySourceVersions={[sourceVersion('source-b')]}
        assemblyInitialCandidate={candidate('full_pdf')}
        assemblyInitialPublication={currentPublication}
        assemblyBookRevision={2}
        assemblySourceSetRevision={3}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Replace PDF' }));
    const inspectionInput = document.querySelector<HTMLInputElement>('#full-1-inspection-file');
    if (!inspectionInput) throw new Error('replacement inspection input not found');
    fireEvent.change(inspectionInput, {
      target: { files: [new File(['replacement'], 'replacement.pdf', { type: 'application/pdf' })] },
    });
    await screen.findByText('replacement.pdf');
    await user.click(screen.getByRole('button', { name: 'Upload PDF' }));

    await waitFor(() => expect(workflow.start).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'replacement',
      sourceKey: 'full',
      file: expect.objectContaining({ name: 'replacement.pdf' }),
    })));
  });

  it('uses focused edit sections without restoring the creation progress pipeline', async () => {
    const initialCandidate = candidate('full_pdf');
    const commonProps = {
      access: 'owner' as const,
      bookId: 'book-1',
      title: 'Full-PDF Book',
      presentation: 'modal' as const,
      experience: 'focused-editing' as const,
      uploadWorkflow: null,
      assemblySourceVersions: [sourceVersion('source-b')],
      assemblyInitialCandidate: initialCandidate,
      assemblyBookRevision: 2,
      assemblySourceSetRevision: 3,
      assemblyPreviewClient: previewClient('full_pdf'),
    };
    const view = render(<BookPdfFlowWorkspace {...commonProps} editingSection="content-tree" />);

    expect(screen.queryByRole('navigation', { name: 'PDF Book progress' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Book content tree editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy plan prompt' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unit 1 content' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    view.rerender(<BookPdfFlowWorkspace {...commonProps} editingSection="activity-json" />);
    expect(screen.getByRole('region', { name: 'Unit activities' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Activity JSON' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Book hierarchy' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Paste returned JSON'), { target: { value: '{"unfinished":' } });
    view.rerender(<BookPdfFlowWorkspace {...commonProps} editingSection="pdf-files" />);
    expect(screen.queryByRole('region', { name: 'Unit activities' })).not.toBeInTheDocument();
    view.rerender(<BookPdfFlowWorkspace {...commonProps} editingSection="activity-json" />);
    expect(screen.getByLabelText('Paste returned JSON')).toHaveValue('{"unfinished":');

    view.rerender(<BookPdfFlowWorkspace {...commonProps} editingSection="preview" />);
    expect(screen.getByRole('region', { name: 'Preview corrections' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });
});

describe('BookPdfFlowWorkspace combined PDF preview', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:combined-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  beforeEach(() => {
    vi.mocked(composeComponentPdfs).mockClear();
    vi.mocked(inspectSourcePdf).mockClear();
    vi.clearAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
  });

  const renderComponentMode = (workflow: SourceUploadBrowserWorkflow | null = null, onDirtyChange?: (dirty: boolean) => void) => render(
    <BookPdfFlowWorkspace
      access="owner"
      bookId="book-1"
      title="Component-PDF Book"
      presentation="modal"
      experience="guided-creation"
      uploadWorkflow={workflow}
      assemblySourceVersions={[]}
      assemblyBookRevision={1}
      assemblySourceSetRevision={1}
      onDirtyChange={onDirtyChange}
    />,
  );

  const selectTwoPdfs = async (workflow: SourceUploadBrowserWorkflow | null = null) => {
    renderComponentMode(workflow);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Several component PDFs/ }));
    const input = screen.getByLabelText('Choose PDFs to combine') as HTMLInputElement;
    await user.upload(input, [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
    ]);
    await screen.findByText('first.pdf');
    await screen.findByText('second.pdf');
    return user;
  };

  const inspectionClaim = (file: File, pageCount: number, sha256Hex: string): SourcePdfInspectionClaim => ({
    schemaVersion: 1,
    trust: 'browser-supplied-untrusted',
    state: 'complete',
    displayFilename: file.name,
    exactByteSize: file.size,
    sha256Hex,
    physicalPageCount: pageCount,
    pdfType: 'application/pdf',
    readability: 'readable',
  });

  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
    return { promise, resolve };
  };

  it('keeps component selection on the single combined-document path', async () => {
    const user = userEvent.setup();
    renderComponentMode();

    await user.click(screen.getByRole('button', { name: /Several component PDFs/ }));

    expect(screen.getByRole('heading', { name: 'Combine your PDF sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add PDFs' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'PDF 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'PDF 2' })).not.toBeInTheDocument();
  });

  it('preserves selection order, exposes accessible reorder/remove controls, and previews mapped ranges', async () => {
    const user = await selectTwoPdfs();
    const list = screen.getByRole('list', { name: 'Selected PDFs' });
    let items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('first.pdf');
    expect(items[1]).toHaveTextContent('second.pdf');

    await user.click(screen.getByRole('button', { name: 'Move second.pdf up' }));
    items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('second.pdf');
    expect(items[1]).toHaveTextContent('first.pdf');

    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    expect(await screen.findByRole('heading', { name: 'Combined PDF preview' })).toBeInTheDocument();
    expect(screen.getByTitle('Combined PDF preview')).toBeInTheDocument();
    expect(screen.getByText(/second\.pdf: pages 1–2/)).toBeInTheDocument();
    expect(screen.getByText(/first\.pdf: pages 3–5/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to files' }));
    expect(screen.getByRole('list', { name: 'Selected PDFs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combine and preview' })).toBeInTheDocument();
  });

  it('appends a later additive selection and inspects only the new file', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderComponentMode(null, onDirtyChange);
    await user.click(screen.getByRole('button', { name: /Several component PDFs/ }));
    const input = screen.getByLabelText('Choose PDFs to combine') as HTMLInputElement;
    await user.upload(input, [new File(['first'], 'first.pdf', { type: 'application/pdf' })]);
    const list = screen.getByRole('list', { name: 'Selected PDFs' });
    expect(await within(list).findByText('first.pdf')).toBeInTheDocument();
    expect(within(list).getByRole('listitem')).toHaveTextContent('2 pages');

    await user.upload(input, [new File(['second'], 'second.pdf', { type: 'application/pdf' })]);
    expect(await within(list).findByText('second.pdf')).toBeInTheDocument();

    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('first.pdf');
    expect(items[0]).toHaveTextContent('2 pages');
    expect(items[1]).toHaveTextContent('second.pdf');
    expect(items[1]).toHaveTextContent('3 pages');
    expect(vi.mocked(inspectSourcePdf)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(inspectSourcePdf).mock.calls.map(([file]) => file.name)).toEqual(['first.pdf', 'second.pdf']);
    expect(screen.getByRole('button', { name: 'Add PDFs' })).toBeEnabled();
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it('rejects selections and appends that exceed the 20-PDF limit without truncating', async () => {
    const user = userEvent.setup();
    renderComponentMode();
    await user.click(screen.getByRole('button', { name: /Several component PDFs/ }));
    const input = screen.getByLabelText('Choose PDFs to combine') as HTMLInputElement;
    const files = (count: number, start = 0) => Array.from({ length: count }, (_, index) => (
      new File([`pdf-${start + index}`], `file-${start + index}.pdf`, { type: 'application/pdf' })
    ));

    await user.upload(input, files(21));
    expect(screen.queryByRole('list', { name: 'Selected PDFs' })).not.toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('up to 20 component PDFs'));

    await user.upload(input, files(20));
    const list = await screen.findByRole('list', { name: 'Selected PDFs' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(20));

    await user.upload(input, [new File(['pdf-20'], 'file-20.pdf', { type: 'application/pdf' })]);
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('Remove a PDF before adding this batch'));
  });

  it('requires an explicit duplicate-byte choice while preserving same-named different-byte files', async () => {
    const user = userEvent.setup();
    renderComponentMode();
    await user.click(screen.getByRole('button', { name: /Several component PDFs/ }));
    const input = screen.getByLabelText('Choose PDFs to combine') as HTMLInputElement;
    await user.upload(input, [
      new File(['same-bytes'], 'first.pdf', { type: 'application/pdf' }),
      new File(['same-bytes'], 'copy.pdf', { type: 'application/pdf' }),
    ]);

    expect(await screen.findByText(/Duplicate PDF bytes detected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep both' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combine and preview' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Keep both' }));
    expect(screen.getByRole('button', { name: 'Combine and preview' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Remove duplicate' }));
    expect(within(screen.getByRole('list', { name: 'Selected PDFs' })).getAllByRole('listitem')).toHaveLength(1);

    await user.upload(input, [
      new File(['different-one'], 'same-name.pdf', { type: 'application/pdf' }),
      new File(['different-two'], 'same-name.pdf', { type: 'application/pdf' }),
    ]);
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Selected PDFs' })).getAllByRole('listitem')).toHaveLength(3));
    expect(screen.queryByText(/Duplicate PDF bytes detected/)).not.toBeInTheDocument();
  });

  it('rejects a composed result whose input manifest no longer matches the selected sequence', async () => {
    const user = await selectTwoPdfs();
    vi.mocked(composeComponentPdfs).mockImplementationOnce(async (files) => ({
      file: new File(['combined'], 'book-combined.pdf', { type: 'application/pdf' }),
      sha256Hex: 'b'.repeat(64),
      mapping: files.map((file, index) => ({
        componentIndex: index,
        fileName: file.name,
        pageCount: file.name.startsWith('first') ? 2 : 3,
        startPage: index === 0 ? 1 : 3,
        endPage: index === 0 ? 2 : 5,
      })),
      inputManifest: files.map((file, index) => ({
        componentIndex: index,
        sha256Hex: '0'.repeat(64),
        byteSize: file.size,
        pageCount: file.name.startsWith('first') ? 2 : 3,
      })),
    }));

    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    await screen.findByRole('heading', { name: 'Combined PDF preview' });
    await user.click(screen.getByRole('button', { name: 'Use these PDFs' }));

    expect(screen.queryByRole('heading', { name: 'PDF 1' })).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no longer matches'));
  });

  it('ignores stale results for a reselected File and aborts inspection on unmount', async () => {
    const first = deferred<SourcePdfInspectionClaim>();
    const second = deferred<SourcePdfInspectionClaim>();
    const pending = deferred<SourcePdfInspectionClaim>();
    vi.mocked(inspectSourcePdf)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => pending.promise);
    const user = userEvent.setup();
    const { unmount } = renderComponentMode();
    await user.click(screen.getByRole('button', { name: /Several component PDFs/ }));
    const input = screen.getByLabelText('Choose PDFs to combine') as HTMLInputElement;
    const file = new File(['same-bytes'], 'same.pdf', { type: 'application/pdf' });
    await user.upload(input, [file]);
    await user.upload(input, [file]);
    const list = screen.getByRole('list', { name: 'Selected PDFs' });

    second.resolve(inspectionClaim(file, 9, 'b'.repeat(64)));
    await waitFor(() => expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('9 pages'));
    first.resolve(inspectionClaim(file, 2, 'a'.repeat(64)));
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('2 pages'));
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('9 pages');

    await user.upload(input, [new File(['pending'], 'pending.pdf', { type: 'application/pdf' })]);
    await waitFor(() => expect(vi.mocked(inspectSourcePdf)).toHaveBeenCalledTimes(3));
    const inspectionCall = vi.mocked(inspectSourcePdf).mock.calls[2];
    expect(inspectionCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    unmount();
    expect(inspectionCall?.[1]?.signal?.aborted).toBe(true);
  });

  it('keeps a good file usable when one selected file fails inspection', async () => {
    const user = userEvent.setup();
    const onTrackAction = vi.fn();
    render(
      <BookPdfFlowWorkspace
        access="owner"
        bookId="book-1"
        title="Component-PDF Book"
        presentation="modal"
        experience="guided-creation"
        uploadWorkflow={null}
        assemblySourceVersions={[]}
        assemblyBookRevision={1}
        assemblySourceSetRevision={1}
        onTrackAction={onTrackAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Several component PDFs/ }));
    const input = screen.getByLabelText('Choose PDFs to combine') as HTMLInputElement;
    await user.upload(input, [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['bad'], 'bad.pdf', { type: 'application/pdf' }),
    ]);

    const list = screen.getByRole('list', { name: 'Selected PDFs' });
    const items = within(list).getAllByRole('listitem');
    await within(list).findByText('first.pdf');
    expect(items[0]).toHaveTextContent('2 pages');
    await within(list).findByText('bad.pdf');
    expect(items[1]).toHaveTextContent('Failed: bad.pdf');
    expect(items[1]).toHaveTextContent('unreadable');
    expect(within(list).getByRole('button', { name: 'Retry bad.pdf' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Remove bad.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combine and preview' })).toBeDisabled();
    expect(onTrackAction).toHaveBeenCalledWith('book_source_pdf_inspection_failed', expect.objectContaining({
      code: 'unreadable', cause: 'invalid xref',
    }));
    expect(onTrackAction).not.toHaveBeenCalledWith('book_source_pdf_inspection_failed', expect.objectContaining({ filename: expect.anything() }));

    await user.click(within(list).getByRole('button', { name: 'Remove bad.pdf' }));
    expect(screen.queryByText('bad.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combine and preview' })).toBeDisabled();
  });

  it('cancels combining without discarding the selected files', async () => {
    const user = await selectTwoPdfs();
    vi.mocked(composeComponentPdfs).mockImplementationOnce(() => new Promise(() => undefined));

    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    await screen.findByText('Combining PDFs in your browser…');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('list', { name: 'Selected PDFs' })).toBeInTheDocument();
    expect(screen.getByText('first.pdf')).toBeInTheDocument();
    expect(screen.getByText('second.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combine and preview' })).toBeInTheDocument();
  });

  it.each(['hash', 'pages'] as const)('denies a composed output whose actual %s differs from composition', async (fact) => {
    const user = await selectTwoPdfs();
    vi.mocked(inspectSourcePdf).mockImplementationOnce(async (file) => inspectionClaim(file,
      fact === 'pages' ? 6 : 5, fact === 'hash' ? 'c'.repeat(64) : 'b'.repeat(64)));
    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDFs could not be combined.');
    expect(screen.queryByRole('heading', { name: 'Combined PDF preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use these PDFs' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Selected PDFs' })).toBeInTheDocument();
  });

  it('does not expose output inspected after combining was canceled', async () => {
    const user = await selectTwoPdfs();
    const outputInspection = deferred<SourcePdfInspectionClaim>();
    vi.mocked(inspectSourcePdf).mockImplementationOnce(() => outputInspection.promise);
    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    await waitFor(() => expect(inspectSourcePdf).toHaveBeenCalledTimes(3));
    const [file, options] = vi.mocked(inspectSourcePdf).mock.calls[2]!;
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(options?.signal?.aborted).toBe(true);
    outputInspection.resolve(inspectionClaim(file, 5, 'b'.repeat(64)));
    await outputInspection.promise;
    expect(screen.queryByRole('heading', { name: 'Combined PDF preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Selected PDFs' })).toBeInTheDocument();
  });

  it('invalidates a stale compose when Add PDFs changes the selection', async () => {
    const user = await selectTwoPdfs();
    let composeSignal!: AbortSignal;
    let resolveCompose!: (result: {
      readonly file: File;
      readonly sha256Hex: string;
      readonly mapping: readonly {
        readonly componentIndex: number;
        readonly fileName: string;
        readonly pageCount: number;
        readonly startPage: number;
        readonly endPage: number;
      }[];
      readonly inputManifest: readonly {
        readonly componentIndex: number;
        readonly sha256Hex: string;
        readonly byteSize: number;
        readonly pageCount: number;
      }[];
    }) => void;
    vi.mocked(composeComponentPdfs).mockImplementationOnce((_files, options) => {
      composeSignal = options.signal;
      return new Promise((resolve) => { resolveCompose = resolve; });
    });

    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    await screen.findByText('Combining PDFs in your browser…');
    const input = screen.getByLabelText('Choose PDFs to combine') as HTMLInputElement;
    await user.upload(input, [new File(['third'], 'third.pdf', { type: 'application/pdf' })]);

    expect(composeSignal.aborted).toBe(true);
    expect(await screen.findByText('third.pdf')).toBeInTheDocument();
    resolveCompose({
      file: new File(['stale-combined'], 'stale-combined.pdf', { type: 'application/pdf' }),
      sha256Hex: 'c'.repeat(64),
      mapping: [
        { componentIndex: 0, fileName: 'first.pdf', pageCount: 2, startPage: 1, endPage: 2 },
        { componentIndex: 1, fileName: 'second.pdf', pageCount: 3, startPage: 3, endPage: 5 },
      ],
      inputManifest: [
        { componentIndex: 0, sha256Hex: 'a'.repeat(64), byteSize: 5, pageCount: 2 },
        { componentIndex: 1, sha256Hex: 'b'.repeat(64), byteSize: 6, pageCount: 3 },
      ],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByRole('heading', { name: 'Combined PDF preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Selected PDFs' })).toBeInTheDocument();
  });

  it('keeps the selection after a recoverable combine failure and allows retry', async () => {
    const user = await selectTwoPdfs();
    vi.mocked(composeComponentPdfs)
      .mockRejectedValueOnce(new Error('temporary combine failure'));

    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDFs could not be combined. Your selection is still available to retry.');
    expect(screen.getByText('first.pdf')).toBeInTheDocument();
    expect(screen.getByText('second.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    expect(await screen.findByRole('heading', { name: 'Combined PDF preview' })).toBeInTheDocument();
    expect(composeComponentPdfs).toHaveBeenCalledTimes(2);
  });

  it('hands the ordered sources to component slots without collapsing mode', async () => {
    const user = await selectTwoPdfs();
    await user.click(screen.getByRole('button', { name: 'Move second.pdf up' }));
    await user.click(screen.getByRole('button', { name: 'Combine and preview' }));
    await screen.findByRole('heading', { name: 'Combined PDF preview' });
    await user.click(screen.getByRole('button', { name: 'Use these PDFs' }));

    expect(document.querySelector('[data-mode="component"]')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PDF 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PDF 2' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Book PDF' })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import { ActivityAuthoringHttpError } from '../../services/book-activity/activityStorage.service';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import { createComponentPdfActivationReceipt, fingerprintComponentPdfActivationValue } from '../../services/book-assembly/componentPdfActivation.service';
import { bookScopedActivityTargetId } from '../../services/book-assembly/bookActivityTargetId.service';
import { createBookTeacherAssemblyDocumentRoute } from '../../services/book-delivery/bookTeacherAssemblyDocument.types';
import BookAssemblyWorkspace from './BookAssemblyWorkspace';

const mocks = vi.hoisted(() => ({
  trackAction: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  writeClipboardText: vi.fn(),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: mocks.trackAction }),
}));

vi.mock('../../core/platform', () => ({
  useClipboard: () => ({ writeText: mocks.writeClipboardText }),
}));

vi.mock('../modern', () => ({
  toast: {
    success: mocks.success,
    error: mocks.error,
    info: mocks.info,
    warning: mocks.warning,
  },
}));

vi.mock('../book-runtime/BookPdfViewerHost', () => ({
  BookPdfViewerHost: ({ title }: { readonly title: string }) => (
    <div data-testid="teacher-assembly-pdf-preview">{title}</div>
  ),
  default: ({ title }: { readonly title: string }) => (
    <div data-testid="teacher-assembly-pdf-preview">{title}</div>
  ),
}));

const sourceVersion = (sourceKey: string, sourceVersionId: string, physicalPageCount: number, verifiedUsable: boolean) => ({
  sourceKey, sourceVersionId, bookId: 'book-1', physicalPageCount, verifiedUsable,
  checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
  purpose: 'book-source' as const, studentSafeStatus: 'unreviewed' as const,
});
const sourceVersions = [
  sourceVersion('full', 'source-full', 40, true),
  sourceVersion('source-source-part-a', 'source-part-a', 20, true),
  sourceVersion('source-source-part-b', 'source-part-b', 22, true),
  sourceVersion('source-invalid', 'source-invalid', 10, false),
] as const;

const candidate = (revision = 1): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 2,
  sourceSetRevision: 3,
  unitKey: 'unit-1',
  revision,
  lifecycle: 'draft',
  manifest: {
    bookId: 'book-1',
    sourceSet: {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-full', sourceOrder: 1 }],
    },
    nodes: [
      { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
    ],
    units: [{ unitKey: 'unit-1', activitySlots: [], pageGroups: [] }],
  },
  validation: { valid: true, errors: [] },
  updatedAt: '2026-07-26T00:00:00.000Z',
});

const invalidSourceCandidate = (): BookAssemblyCandidateRecord => ({
  ...candidate(),
  manifest: {
    bookId: 'book-1',
    sourceSet: {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-invalid', sourceOrder: 1 }],
    },
    nodes: [
      { nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 },
    ],
    units: [{ unitKey: 'unit-a', activitySlots: [], pageGroups: [] }, { unitKey: 'unit-b', activitySlots: [], pageGroups: [] }],
  },
});

const componentMappingCandidate = (): BookAssemblyCandidateRecord => ({
  ...candidate(),
  manifest: {
    bookId: 'book-1',
    sourceSet: {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'source-source-part-a', sourceVersionId: 'source-part-a', sourceOrder: 1, ownerNodeKey: 'section-a' },
        { sourceKey: 'source-source-part-b', sourceVersionId: 'source-part-b', sourceOrder: 2, ownerNodeKey: 'section-b' },
      ],
    },
    nodes: [
      { nodeKey: 'section-a', parentNodeKey: null, nodeType: 'section', order: 1 },
      { nodeKey: 'unit-a', parentNodeKey: 'section-a', nodeType: 'unit', order: 1 },
      { nodeKey: 'section-b', parentNodeKey: null, nodeType: 'section', order: 2 },
      { nodeKey: 'unit-b', parentNodeKey: 'section-b', nodeType: 'unit', order: 1 },
    ],
    units: [],
  },
});

const componentReadyCandidate = (): BookAssemblyCandidateRecord => ({
  ...componentMappingCandidate(),
  lifecycle: 'validated',
  manifest: {
    ...componentMappingCandidate().manifest!,
    sourceSet: {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'source-source-part-a', sourceVersionId: 'source-part-a', sourceOrder: 1, ownerNodeKey: 'unit-a' },
        { sourceKey: 'source-source-part-b', sourceVersionId: 'source-part-b', sourceOrder: 2, ownerNodeKey: 'unit-b' },
      ],
    },
    units: [
      {
        unitKey: 'unit-a',
        activitySlots: [{ activityKey: 'activity-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-a'] }],
        pageGroups: [{ pageGroupKey: 'pages-a', sourceKey: 'source-source-part-a', pages: [1], activityKeys: ['activity-a'], mode: 'activity', defaultPhysicalPageNumber: 1 }],
      },
      {
        unitKey: 'unit-b',
        activitySlots: [{ activityKey: 'activity-b', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-b'] }],
        pageGroups: [{ pageGroupKey: 'pages-b', sourceKey: 'source-source-part-b', pages: [1], activityKeys: ['activity-b'], mode: 'activity', defaultPhysicalPageNumber: 1 }],
      },
    ],
  },
});

const nestedComponentReadyCandidate = (): BookAssemblyCandidateRecord => {
  const current = componentReadyCandidate();
  const nodes = current.manifest!.nodes;
  return {
    ...current,
    manifest: {
      ...current.manifest!,
      nodes: [
        nodes[0]!,
        { nodeKey: 'chapter-a', parentNodeKey: 'section-a', nodeType: 'chapter', order: 1 },
        { ...nodes[1]!, parentNodeKey: 'chapter-a' },
        ...nodes.slice(2),
      ],
    },
  };
};

const repository = (createResult: 'created' | 'conflict' | 'forbidden' = 'created'): UnitAssemblyRepository => ({
  create: vi.fn(async (input) => ({
    status: createResult === 'created' ? 'created' : createResult,
    candidate: createResult === 'created' ? candidate() : undefined,
    receipt: {
      operationId: input.operationId,
      fingerprint: 'fingerprint',
      status: createResult === 'created' ? 'created' : createResult,
      createdAt: '2026-07-26T00:00:00.000Z',
    },
  })),
  replace: vi.fn(async (input) => ({
    status: createResult === 'created' ? 'replaced' : createResult,
    candidate: createResult === 'created' ? candidate(2) : undefined,
    receipt: {
      operationId: input.operationId,
      fingerprint: 'fingerprint',
      status: createResult === 'created' ? 'replaced' : createResult,
      createdAt: '2026-07-26T00:00:00.000Z',
    },
  })),
  validate: vi.fn(),
  discard: vi.fn(),
  load: vi.fn(async () => ({ status: 'loaded', candidate: candidate(3), conflict: null })),
});

const activityAuthoring = (): ActivityAuthoringService => ({
  stage: vi.fn(async (input) => ({
    status: 'staged',
    candidateId: `candidate-${input.targetActivityId}`,
    targetActivityId: input.targetActivityId ?? 'generated',
    revision: 1,
    lifecycle: 'staged',
    validation: { valid: true, errors: [] },
    diff: { classification: 'added', reasons: ['import'], requiresRedo: false },
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
    answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
  })),
  validate: vi.fn(async (input) => ({
    status: 'validated' as const,
    candidateId: input.candidateId,
    revision: input.expectedRevision + 1,
    lifecycle: 'validated' as const,
    validation: { valid: true, errors: [] },
    diff: null,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
    answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
  })),
  saveDraft: vi.fn(async (input) => ({
    status: 'saved' as const,
    activityId: input.candidateId.replace('candidate-', ''),
    candidateId: input.candidateId,
    candidateRevision: input.expectedRevision + 1,
    revision: 1,
    lifecycle: 'saved' as const,
    validation: { valid: true, errors: [] },
    diff: null,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
    answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
  })),
  discard: vi.fn(),
  loadCandidate: vi.fn(),
});

const unitImportJson = (activityKey = 'activity-reading-1') => JSON.stringify({
  promptVersion: 'book-unit-json-v1',
  schemaVersion: 'prd0062.unit_activity_import.v1',
  bookId: 'book-1',
  unitKey: 'unit-1',
  slots: [{
    activityKey,
    content: {
      schemaVersion: 1,
      title: 'Imported Activity',
      taskProfile: null,
      presentationMode: 'structured',
      contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
      instructions: [{ text: 'Answer.' }],
      stimulus: null,
      assetRefs: [],
      interaction: { family: 'choice', variant: 'single-select' },
      answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
      interactions: [{ prompt: 'Pick.', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
      scoring: { mode: 'auto-where-possible' },
    },
    evidenceRefs: [`import:${activityKey}`],
    sourceEvidenceRefs: ['source:full:page:2'],
    answerEvidenceRefs: ['pageGroup:pages-full-2-activity'],
  }],
});

const renderWorkspace = (overrides: Partial<React.ComponentProps<typeof BookAssemblyWorkspace>> = {}) => {
  const props: React.ComponentProps<typeof BookAssemblyWorkspace> = {
    access: 'owner',
    bookId: 'book-1',
    bookTitle: 'Assembly Book',
    bookRevision: 2,
    sourceSetRevision: 3,
    sourceVersions,
    presentation: 'modal',
    repository: repository(),
    ...overrides,
  };
  return { ...render(<BookAssemblyWorkspace {...props} />), props };
};

beforeEach(() => vi.clearAllMocks());

describe('BookAssemblyWorkspace', () => {
  it('uses the single A0 activation command for a prepared Component-PDF document', async () => {
    const user = userEvent.setup();
    const current = componentReadyCandidate();
    const repo = repository();
    repo.loadCurrent = vi.fn(async (_bookId, unitKey) => ({
      candidate: { ...current, candidateId: unitKey === 'unit-a' ? 'assembly-a' : 'assembly-b', unitKey },
      savedActivityKeysByUnit: { [unitKey]: unitKey === 'unit-a' ? ['activity-a'] : ['activity-b'] },
    }));
    const activateComponentPdf = vi.fn()
      .mockRejectedValueOnce(new Error('response_lost_after_commit'));
    const rendered = renderWorkspace({
      initialCandidate: current,
      initialSourceSet: current.manifest!.sourceSet,
      repository: repo,
      componentPdfActivationClient: { activateComponentPdf },
      componentStudentDocumentSourceVersionId: 'student-v1',
    });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(activateComponentPdf).toHaveBeenCalledTimes(1));
    const firstOperationId = activateComponentPdf.mock.calls[0]![0].operationId;
    const firstActivatedAt = activateComponentPdf.mock.calls[0]![0].activatedAt;
    expect(firstOperationId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/u);
    const receipt = createComponentPdfActivationReceipt({
      operationId: firstOperationId, ownerId: 'teacher-1', bookId: 'book-1',
      expectedBookRevision: 2, expectedSourceSetRevision: 3,
      sourceSet: current.manifest!.sourceSet,
      unitCandidates: [
        { unitKey: 'unit-a', candidateId: 'assembly-a', candidateRevision: 1, manifestFingerprint: fingerprintComponentPdfActivationValue(current.manifest) },
        { unitKey: 'unit-b', candidateId: 'assembly-b', candidateRevision: 1, manifestFingerprint: fingerprintComponentPdfActivationValue(current.manifest) },
      ],
      studentDocument: { sourceVersionId: 'student-v1', descriptorRevision: 4, descriptorFingerprint: 'c'.repeat(64) },
      activities: [], activatedAt: firstActivatedAt,
    });
    activateComponentPdf.mockResolvedValue(receipt);
    rendered.rerender(<BookAssemblyWorkspace {...rendered.props}
      bookRevision={3}
      sourceSetRevision={4}
      componentPdfActivationRecovery={receipt} />);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(activateComponentPdf).toHaveBeenCalledTimes(2));
    expect(activateComponentPdf.mock.calls[1]![0].operationId).toBe(firstOperationId);
    expect(activateComponentPdf.mock.calls[1]![0].activatedAt).toBe(firstActivatedAt);
    expect(repo.replace).not.toHaveBeenCalled();
    expect(repo.loadCurrent).toHaveBeenCalledWith('book-1', 'unit-a');
  });

  it.each([
    ['stale revisions', { bookRevision: 2, sourceSetRevision: 3 }],
    ['another Book', { bookId: 'book-2' }],
    ['a changed manifest', { changedManifest: true }],
    ['an invalid fingerprint', { inputFingerprint: 'fnv1a64:0000000000000000' }],
    ['an unavailable activation client', { clientUnavailable: true }],
  ])('fails closed for Component-PDF activation recovery with %s', async (_label, change) => {
    const user = userEvent.setup();
    const current = componentReadyCandidate();
    const repo = repository();
    repo.loadCurrent = vi.fn();
    const activateComponentPdf = vi.fn();
    const attachSourceSet = vi.fn();
    const manifestFingerprint = fingerprintComponentPdfActivationValue(current.manifest);
    const validRecovery = createComponentPdfActivationReceipt({
      operationId: 'activation-recovery',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      expectedBookRevision: 2,
      expectedSourceSetRevision: 3,
      sourceSet: current.manifest!.sourceSet,
      unitCandidates: ['unit-a', 'unit-b'].map((recoveryUnitKey) => ({
        unitKey: recoveryUnitKey,
        candidateId: `assembly-${recoveryUnitKey}`,
        candidateRevision: 1,
        manifestFingerprint,
      })),
      studentDocument: {
        sourceVersionId: 'student-v1',
        descriptorRevision: 4,
        descriptorFingerprint: 'c'.repeat(64),
      },
      activities: [],
      activatedAt: '2026-09-20T00:00:00.000Z',
    });
    const recovery = {
      ...validRecovery,
      ...change,
    };
    const changedCandidate = change.changedManifest
      ? { ...current, manifest: { ...current.manifest!, units: current.manifest!.units.map((unit, index) => index === 0
        ? { ...unit, pageGroups: unit.pageGroups.map((group) => ({ ...group, pages: [2], defaultPhysicalPageNumber: 2 })) }
        : unit) } }
      : current;

    renderWorkspace({
      bookRevision: 3,
      sourceSetRevision: 4,
      initialCandidate: changedCandidate,
      initialSourceSet: current.manifest!.sourceSet,
      repository: repo,
      componentPdfActivationClient: change.clientUnavailable ? null : { activateComponentPdf },
      componentPdfActivationRecovery: recovery,
      sourceSetAttachmentClient: { attachSourceSet } as never,
    });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('component_pdf_activation_recovery_invalid')).toBeInTheDocument();
    expect(activateComponentPdf).not.toHaveBeenCalled();
    expect(attachSourceSet).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.replace).not.toHaveBeenCalled();
    expect(repo.loadCurrent).not.toHaveBeenCalled();
  });

  it('switches the guided interface between Full PDF and Component PDFs', async () => {
    const user = userEvent.setup();
    renderWorkspace({ guided: true });

    const componentRadio = screen.getByRole('radio', { name: /Several component PDFs/u });
    expect(screen.getByRole('heading', { name: 'Choose the PDF for this Book' })).toBeInTheDocument();
    await user.click(componentRadio);

    expect(componentRadio).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Add the PDFs that make up this Book' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose the PDF for this Book' })).not.toBeInTheDocument();
  });

  it('copies the current Book structure contract and exposes manual copy when clipboard is blocked', async () => {
    const user = userEvent.setup();
    mocks.writeClipboardText.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderWorkspace({
      guided: true,
      guidedStep: 'outline',
      guidedUiVariant: 'mockup',
      strategyOverride: 'full_pdf',
      initialSourceSet: {
        sourceStrategy: 'full_pdf',
        sources: [{ sourceKey: 'full', sourceVersionId: 'source-full', sourceOrder: 1 }],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Copy Prompt' }));

    const fallback = screen.getByLabelText('Manual copy Book structure prompt') as HTMLTextAreaElement;
    expect(fallback.value).toContain('book-structure-json-v1');
    expect(fallback.value).toContain('"title": "Assembly Book"');
    expect(fallback.value).toContain('"sourceKey": "full"');
    expect(fallback.value).toContain('"physicalPageCount": 40');
    expect(fallback.value).toContain('"nodes"');
    expect(fallback.value).toContain('"units"');
    expect(mocks.warning).toHaveBeenCalledWith('Clipboard was blocked. Copy the visible Book structure prompt manually.');

    await user.click(screen.getByRole('button', { name: 'Copy Prompt' }));

    expect(mocks.success).toHaveBeenCalledWith('Book structure prompt copied.');
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_structure_prompt_copied',
      expect.objectContaining({ sourceKey: 'full', physicalPageCount: 40 }),
    );
  });

  it('builds full-PDF hierarchy with native tree semantics and saves through 13A CAS', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo });

    expect(screen.getByRole('radio', { name: 'Full PDF' })).toBeChecked();
    expect(screen.getByRole('tree', { name: 'Assembly hierarchy tree' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Bind' })[0]).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Bind' })[3]).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(repo.create).toHaveBeenCalledTimes(1));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      expectedBookRevision: 2,
      expectedSourceSetRevision: 3,
      unitKey: 'unit-1',
      manifest: expect.objectContaining({
        sourceSet: expect.objectContaining({ sourceStrategy: 'full_pdf' }),
      }),
    }));
    expect(mocks.success).toHaveBeenCalledWith('Book draft saved.');
  });

  it('starts an existing candidate clean and returns clean after conflict reload', async () => {
    const user = userEvent.setup();
    const repo = repository('conflict');
    const onDirtyChange = vi.fn();
    renderWorkspace({ repository: repo, initialCandidate: candidate(), onDirtyChange });

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'unit: unit-1' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This book changed; review again.');

    await user.click(screen.getByRole('button', { name: 'Reload current' }));
    await waitFor(() => expect(repo.load).toHaveBeenCalledWith('book-1', 'unit-1', 'candidate-1'));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(mocks.info).toHaveBeenCalledWith('Assembly draft reloaded.');
  });

  it('supports nested tree keyboard operation and focus after add, reorder, and delete', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Add section' }));
    const sectionButton = screen.getByRole('button', { name: /^section:/u });
    expect(sectionButton).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Add chapter' }));
    const chapterButton = screen.getByRole('button', { name: /^chapter:/u });
    expect(chapterButton).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    const unitButton = screen.getByRole('button', { name: /^unit:/u });
    expect(unitButton).toHaveFocus();

    const treeItems = screen.getAllByRole('treeitem');
    expect(treeItems.map((item) => item.getAttribute('aria-level'))).toEqual(['1', '2', '3']);

    await user.keyboard('{Home}');
    expect(sectionButton).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(chapterButton).toHaveFocus();
    await user.keyboard('{End}');
    expect(unitButton).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(chapterButton).toHaveFocus();
    expect(screen.queryByRole('button', { name: /^unit:/u })).not.toBeInTheDocument();
  });

  it('supports component ownership, deterministic order, and order normalization after removal', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('radio', { name: 'Component PDFs' }));
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    await user.click(screen.getAllByRole('button', { name: 'Bind' })[1]);
    await user.click(screen.getByRole('button', { name: 'Add chapter' }));
    await user.click(screen.getAllByRole('button', { name: 'Bind' })[1]);

    const orderList = screen.getByRole('list', { name: 'Component source order' });
    expect(orderList).toHaveTextContent('1. source-source-part-a');
    expect(orderList).toHaveTextContent('2. source-source-part-b');
    expect(screen.getByLabelText('Owner for source-source-part-a')).not.toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Move source-source-part-b up' }));
    expect(within(orderList).getAllByRole('listitem')[0]).toHaveTextContent('1. source-source-part-b');
    await user.click(screen.getByRole('button', { name: 'Remove source-source-part-b' }));
    expect(within(orderList).getAllByRole('listitem')[0]).toHaveTextContent('1. source-source-part-a');
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_source_removed',
      expect.objectContaining({ sourceVersionId: 'source-part-b' }),
    );
  });

  it('seeds a valid Activity slot and page group when component structure is added', async () => {
    const user = userEvent.setup();
    renderWorkspace({
      guided: true,
      guidedStep: 'outline',
      guidedUiVariant: 'mockup',
      strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1]],
    });

    await user.click(screen.getByRole('button', { name: 'Add structure' }));

    expect(screen.getByText('Add the activities for this Unit to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Unit content' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('repairs persisted component owners that do not resolve to the current Book tree', async () => {
    const user = userEvent.setup();
    renderWorkspace({
      guided: true,
      guidedStep: 'outline',
      guidedUiVariant: 'mockup',
      strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]],
      initialSourceSet: {
        sourceStrategy: 'component_pdfs',
        sources: [
          { sourceKey: 'component-1', sourceVersionId: 'source-part-a', sourceOrder: 1, ownerNodeKey: 'missing-section-a' },
          { sourceKey: 'component-2', sourceVersionId: 'source-part-b', sourceOrder: 2, ownerNodeKey: 'missing-section-b' },
        ],
      },
    });

    expect(screen.getByText('0 of 2 placed')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add structure' })).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Add structure' })[0]);

    expect(screen.getByText('1 of 2 placed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Unit content' })).toBeEnabled();
    const firstUnit = (screen.getByRole('combobox', { name: 'Unit for PDF 1' }) as HTMLSelectElement).value;
    await user.selectOptions(screen.getByRole('combobox', { name: 'Unit for PDF 2' }), firstUnit);
    expect(screen.getByText('2 of 2 placed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add structure' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Unit for PDF 2' })).toHaveValue(firstUnit);
    expect(screen.getByRole('combobox', { name: 'Unit for PDF 2' }).querySelectorAll('option')).toHaveLength(2);
  });

  it('targets the newly added component Unit when copying authoring instructions', async () => {
    const user = userEvent.setup();
    mocks.writeClipboardText.mockResolvedValue(true);
    renderWorkspace({
      guided: true,
      guidedStep: 'outline',
      guidedUiVariant: 'mockup',
      strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]],
    });

    await user.click(screen.getAllByRole('button', { name: 'Add structure' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add Unit content' }));
    await user.click(screen.getByRole('button', { name: 'Copy instructions' }));
    const firstPrompt = mocks.writeClipboardText.mock.calls.at(-1)?.[0] as string;

    await user.click(screen.getAllByRole('button', { name: 'Add structure' })[0]);
    await user.click(screen.getByRole('button', { name: 'Copy instructions' }));
    const secondPrompt = mocks.writeClipboardText.mock.calls.at(-1)?.[0] as string;

    expect(secondPrompt).not.toBe(firstPrompt);
    expect(secondPrompt).toContain('"sourceKey": "source-source-part-b"');
  });

  it('hydrates exact saved Unit Activity bindings when a Component-PDF draft is reopened', () => {
    renderWorkspace({
      guided: true,
      guidedStep: 'outline',
      guidedUiVariant: 'mockup',
      strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]],
      initialCandidate: componentReadyCandidate(),
      initialSavedActivityKeysByUnit: {
        'unit-a': ['activity-a'],
        'unit-b': ['activity-b'],
      },
    });

    expect(screen.getByText('2 of 2 placed')).toBeInTheDocument();
    expect(screen.getByText('Unit content is ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('resolves component owners through nested hierarchy in the guided editor', () => {
    renderWorkspace({
      guided: true,
      guidedStep: 'outline',
      guidedUiVariant: 'mockup',
      strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]],
      initialCandidate: nestedComponentReadyCandidate(),
      initialSavedActivityKeysByUnit: {
        'unit-a': ['activity-a'],
        'unit-b': ['activity-b'],
      },
    });

    expect(screen.getByText('2 of 2 placed')).toBeInTheDocument();
    expect(screen.getByText('Unit content is ready')).toBeInTheDocument();
  });

  it('lets a teacher select every persisted Component-PDF Unit after reopen', async () => {
    const user = userEvent.setup();
    mocks.writeClipboardText.mockResolvedValue(true);
    renderWorkspace({
      guided: true,
      guidedStep: 'outline',
      guidedUiVariant: 'mockup',
      strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]],
      initialCandidate: componentReadyCandidate(),
      initialSavedActivityKeysByUnit: {
        'unit-a': ['activity-a'],
        'unit-b': ['activity-b'],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Select PDF 2' }));
    await user.click(screen.getByRole('button', { name: 'Replace Unit content' }));
    await user.click(screen.getByRole('button', { name: 'Copy instructions' }));

    expect(mocks.writeClipboardText.mock.calls.at(-1)?.[0]).toContain('"unitKey": "unit-b"');
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_component_unit_selected',
      expect.objectContaining({ sourceVersionId: 'source-part-b', unitKey: 'unit-b' }),
    );
  });

  it.each([false, true])('saves missing Units and reconciles the live selected draft (changed=%s)', async (changed) => {
    const user = userEvent.setup();
    const existing = { ...componentReadyCandidate(), unitKey: 'unit-a', bookRevision: 0, sourceSetRevision: 0 };
    const live = changed ? { ...existing, revision: 2, manifest: { ...existing.manifest!,
      units: existing.manifest!.units.map((unit) => unit.unitKey === 'unit-a' ? { ...unit,
        pageGroups: unit.pageGroups.map((group) => ({ ...group, pages: [2], defaultPhysicalPageNumber: 2 })),
      } : unit),
    } } : existing;
    const repo = { ...repository(), discoverDrafts: vi.fn(async () => [{ candidate: live, savedActivityKeysByUnit: {} }]) };
    vi.mocked(repo.create).mockImplementation(async (input) => ({
      status: 'created',
      candidate: { ...existing, candidateId: `candidate-${input.unitKey}`, unitKey: input.unitKey, lifecycle: 'draft', revision: 1 },
      receipt: { operationId: input.operationId, fingerprint: 'created', status: 'created', createdAt: existing.updatedAt },
    }));
    vi.mocked(repo.replace).mockImplementation(async (input) => ({
      status: 'replaced',
      candidate: { ...existing, manifest: input.manifest, candidateId: input.candidateId, unitKey: input.unitKey, lifecycle: 'validated', revision: input.expectedCandidateRevision + 1 },
      receipt: { operationId: input.operationId, fingerprint: 'replaced', status: 'replaced', createdAt: existing.updatedAt },
    }));
    vi.mocked(repo.validate).mockImplementation(async (input) => ({
      status: 'validated',
      candidate: { ...existing, candidateId: input.candidateId, unitKey: input.unitKey, lifecycle: 'validated', revision: input.expectedCandidateRevision + 1 },
      receipt: { operationId: input.operationId, fingerprint: 'validated', status: 'validated', createdAt: existing.updatedAt },
    }));
    renderWorkspace({
      bookRevision: 0,
      sourceSetRevision: 0,
      strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]],
      repository: repo,
      initialCandidate: existing,
    });

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1', unitKey: 'unit-b', expectedBookRevision: 0, expectedSourceSetRevision: 0,
    })));
    if (changed) {
      expect(repo.replace).toHaveBeenCalledWith(expect.objectContaining({
        candidateId: live.candidateId, expectedCandidateRevision: 2, unitKey: 'unit-a',
      }));
    } else {
      expect(repo.replace).not.toHaveBeenCalled();
    }
    expect(repo.validate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Book draft saved.'));
  });

  it('blocks setup and duplicate persistence while current draft discovery is pending', async () => {
    const user = userEvent.setup();
    const current = { ...componentReadyCandidate(), unitKey: 'unit-a', bookRevision: 0, sourceSetRevision: 0 };
    let resolveDiscovery!: (value: { candidate: BookAssemblyCandidateRecord; savedActivityKeysByUnit: {} }[]) => void;
    const repo = { ...repository(), discoverDrafts: vi.fn(() => new Promise<{ candidate: BookAssemblyCandidateRecord; savedActivityKeysByUnit: {} }[]>((resolve) => { resolveDiscovery = resolve; })) };
    const activateComponentPdf = vi.fn();
    renderWorkspace({ guided: true, guidedUiVariant: 'mockup', guidedStep: 'review',
      bookRevision: 0, sourceSetRevision: 0, strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]], repository: repo, initialCandidate: current,
      componentPdfActivationClient: { activateComponentPdf },
      componentPdfPreparation: { componentReservationIds: ['component-a', 'component-b'], studentDocumentReservationId: 'combined' },
    });
    const setup = screen.getByRole('button', { name: 'Prepare Book preview after saving Activities' });
    expect(setup).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(setup).toBeDisabled();
    fireEvent.click(setup);
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(repo.discoverDrafts).toHaveBeenCalledTimes(1);
    expect(activateComponentPdf).not.toHaveBeenCalled();
    resolveDiscovery([{ candidate: current, savedActivityKeysByUnit: {} },
      { candidate: { ...current, unitKey: 'unit-b' }, savedActivityKeysByUnit: {} }]);
    await waitFor(() => expect(setup).toBeEnabled());
    expect(repo.replace).not.toHaveBeenCalled();
  });

  it('does not report a first Component-PDF draft saved when a Unit validation rejects', async () => {
    const user = userEvent.setup();
    const existing = { ...componentReadyCandidate(), unitKey: 'unit-a', bookRevision: 0, sourceSetRevision: 0 };
    const repo = { ...repository(), discoverDrafts: vi.fn(async () => [{ candidate: existing, savedActivityKeysByUnit: {} }]) };
    vi.mocked(repo.create).mockImplementation(async (input) => ({
      status: 'created',
      candidate: { ...existing, candidateId: `candidate-${input.unitKey}`, unitKey: input.unitKey, lifecycle: 'draft', revision: 1 },
      receipt: { operationId: input.operationId, fingerprint: 'created', status: 'created', createdAt: existing.updatedAt },
    }));
    vi.mocked(repo.validate).mockImplementation(async (input) => ({
      status: 'invalid',
      candidate: { ...existing, candidateId: input.candidateId, unitKey: input.unitKey, lifecycle: 'draft', revision: 1 },
      receipt: { operationId: input.operationId, fingerprint: 'invalid', status: 'invalid', createdAt: existing.updatedAt },
    }));
    renderWorkspace({ bookRevision: 0, sourceSetRevision: 0, strategyOverride: 'component_pdfs',
      sourceVersions: [sourceVersions[1], sourceVersions[2]], repository: repo, initialCandidate: existing });

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(repo.validate).toHaveBeenCalledWith(expect.objectContaining({ unitKey: 'unit-b' })));
    expect(repo.replace).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalledWith('Book draft saved.');
  });

  it('rejects invalid persisted Source Versions before 13A mutation', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo, initialCandidate: invalidSourceCandidate() });

    await user.click(screen.getByRole('button', { name: 'unit: unit-1' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('sourceSet.sources[0].sourceVersionId');
    expect(repo.replace).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Please fix the highlighted Book outline issues before saving.');
  });

  it('shows readable permission loss when the trusted route rejects save', async () => {
    const user = userEvent.setup();
    const repo = repository('forbidden');
    renderWorkspace({ repository: repo });

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no longer have permission');
    expect(mocks.error).toHaveBeenCalledWith('You no longer have permission to save this Assembly draft.');
  });

  it('maps source-qualified pages to Page Groups and Activity slots before saving', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo });

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2,3');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-reading-1');
    await user.selectOptions(screen.getByLabelText('Context requirement'), 'required');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('full pages 2, 3');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('1. activity-reading-1 (required)');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(repo.create).toHaveBeenCalledTimes(1));
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      manifest: expect.objectContaining({
        units: [expect.objectContaining({
          activitySlots: [expect.objectContaining({
            activityKey: 'activity-reading-1',
            contextRequirement: 'required',
            pageGroupKeys: [expect.stringMatching(/-pages-full-2-3-activity$/u)],
          })],
          pageGroups: [expect.objectContaining({
            pageGroupKey: expect.stringMatching(/-pages-full-2-3-activity$/u),
            sourceKey: 'full',
            pages: [2, 3],
            defaultPhysicalPageNumber: 2,
            activityKeys: ['activity-reading-1'],
          })],
        })],
      }),
    }));
  });

  it('supports reference-only/default pages and one Activity mapped to multiple Page Groups', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.selectOptions(screen.getByLabelText('Page Group mode'), 'reference_only');
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '1');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('Reference only');
    expect(screen.queryByRole('list', { name: 'Activity slot order' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Activity slot order' })).queryAllByRole('listitem')).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText('Page Group mode'), 'activity');
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-shared');
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '3');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '3');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('activity-shared');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent(/-pages-full-2-activity, .+-pages-full-3-activity/u);
  });

  it('merges multiple Activities onto one source page without duplicating Page Group content', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '7');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '7');
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-a');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-b');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    expect(within(screen.getByRole('list', { name: 'Page Groups' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('Activities activity-a, activity-b');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('1. activity-a');
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('2. activity-b');
  });

  it('rejects malformed and out-of-range physical page input before save', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2, nope');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid physical page "nope"');

    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '41');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '41');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('outside full');
  });

  it('preserves mappings as repairable state when source strategy or source binding changes', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo });

    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('pages-full-2-activity');

    await user.click(screen.getByRole('button', { name: 'Remove full' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('pages-full-2-activity');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Full PDF Source Set must contain exactly one source');
    expect(repo.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'Component PDFs' }));
    expect(screen.getByRole('list', { name: 'Page Groups' })).toHaveTextContent('pages-full-2-activity');
  });

  it('limits component-PDF mapping choices to the selected Unit owner branch', async () => {
    const user = userEvent.setup();
    renderWorkspace({ initialCandidate: componentMappingCandidate() });

    const firstUnit = screen.getByRole('button', { name: 'unit: unit-a' });
    await user.click(firstUnit);
    expect(screen.getByLabelText('Mapping source key')).toHaveTextContent('source-source-part-a');
    expect(screen.getByLabelText('Mapping source key')).not.toHaveTextContent('source-source-part-b');

    const secondUnit = screen.getByRole('button', { name: 'unit: unit-b' });
    await user.click(secondUnit);
    expect(screen.getByLabelText('Mapping source key')).toHaveTextContent('source-source-part-b');
    expect(screen.getByLabelText('Mapping source key')).not.toHaveTextContent('source-source-part-a');
  });

  it('shows only an exact current teacher Assembly preview projection', async () => {
    const user = userEvent.setup();
    const preview = {
      kind: 'teacher_assembly' as const,
      bookId: 'book-1',
      bookRevision: 2,
      candidateId: 'candidate-1',
      candidateRevision: 1,
      sourceSetRevision: 3,
      sourceKey: 'full',
      sourceVersionId: 'source-full',
      route: createBookTeacherAssemblyDocumentRoute({
        workerOrigin: 'https://worker.example',
        bookId: 'book-1',
        unitKey: 'unit-1',
        candidateId: 'candidate-1',
        candidateRevision: 1,
        sourceKey: 'full',
        sourceVersionId: 'source-full',
        sourceSetRevision: 3,
        bookRevision: 2,
      }),
    };
    const { unmount } = renderWorkspace({
      initialCandidate: candidate(),
      previewDocuments: [preview],
    });

    await user.click(screen.getByRole('button', { name: 'Preview full' }));
    expect(screen.getByTestId('teacher-assembly-pdf-preview')).toHaveTextContent(
      'Assembly Book — full',
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_document_previewed',
      expect.objectContaining({
        candidateId: 'candidate-1',
        candidateRevision: 1,
        sourceVersionId: 'source-full',
      }),
    );

    unmount();
    renderWorkspace({
      initialCandidate: candidate(2),
      previewDocuments: [preview],
    });
    expect(screen.queryByRole('button', { name: 'Preview full' })).not.toBeInTheDocument();
  });

  it('mounts only an exact current #63 candidate runtime preview projection', () => {
    const runtimePreview = {
      bookId: 'book-1', bookRevision: 2, candidateId: 'candidate-1', candidateRevision: 1,
      sourceSetRevision: 3, unitKey: 'unit-1', registryVersion: 'registry-v1',
      activities: [{
        activityKey: 'activity-1', sourceContext: { available: true, description: 'Candidate source context: full page 2.' },
        projection: {
          schemaVersion: 1, title: 'Preview', taskProfile: null, presentationMode: 'structured',
          contextRequirement: { mode: 'none', acceptedKinds: [] }, instructions: [],
          interaction: { family: 'choice', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact' },
          stimulus: null, assetRefs: [], interactions: [], scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
        },
      }],
      runtime: {
        schemaVersion: 1, projectionKind: 'book-runtime-candidate-preview',
        candidateId: 'candidate-1', candidateRevision: 1, sourceSetRevision: 3, unitKey: 'unit-1',
        book: { bookId: 'book-1', bookMode: 'pdf', bookRevision: 2 },
        context: { contextId: 'candidate-1', kind: 'preview', entitlementBasis: 'candidate-preview' },
        outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        sourceSet: { strategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-full', lifecycle: 'verified-usable', sourceOrder: 1, localPageScope: { kind: 'all', pages: [] } }] },
        documentRequests: [{ sourceKey: 'full', sourceVersionId: 'source-full', opaqueRouteKey: 'full', localPageScope: { kind: 'all', pages: [] } }],
        pageGroups: [{ pageGroupKey: 'unit-1', combinedPhysicalPages: [2] }],
        activities: [{ placementId: 'candidate-1:activity-1', activityId: 'activity-1', nodeKey: 'unit-1', order: 1, contextMode: 'required', sourceContext: { available: true, description: 'full page 2', pageGroupKeys: ['unit-1'], sourcePageScopes: [{ sourceKey: 'full', pages: [2] }] } }],
        actionFlags: { canAutosave: false, canSubmit: false, canReview: false },
      },
    } as const;
    const { unmount } = renderWorkspace({
      initialCandidate: candidate(),
      candidateRuntimePreview: runtimePreview,
    });
    expect(screen.getByRole('heading', { name: 'Student Book preview' })).toBeInTheDocument();
    unmount();
    renderWorkspace({ initialCandidate: candidate(2), candidateRuntimePreview: runtimePreview });
    expect(screen.queryByRole('heading', { name: 'Student Book preview' })).not.toBeInTheDocument();
  });

  it('uses viewer page selection to update source-qualified mapping fields without saving', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const preview = {
      kind: 'teacher_assembly' as const,
      bookId: 'book-1',
      bookRevision: 2,
      candidateId: 'candidate-1',
      candidateRevision: 1,
      sourceSetRevision: 3,
      sourceKey: 'full',
      sourceVersionId: 'source-full',
      route: createBookTeacherAssemblyDocumentRoute({
        workerOrigin: 'https://worker.example',
        bookId: 'book-1',
        unitKey: 'unit-1',
        candidateId: 'candidate-1',
        candidateRevision: 1,
        sourceKey: 'full',
        sourceVersionId: 'source-full',
        sourceSetRevision: 3,
        bookRevision: 2,
        physicalPageNumber: 1,
      }),
    };

    renderWorkspace({
      repository: repo,
      initialCandidate: candidate(),
      previewDocuments: [preview],
    });

    await user.click(screen.getByRole('button', { name: 'Preview full' }));
    await user.clear(screen.getByLabelText('Viewer local page'));
    await user.type(screen.getByLabelText('Viewer local page'), '8');
    await user.click(screen.getByRole('button', { name: 'Use viewer page for mapping' }));

    expect(screen.getByLabelText('Mapping source key')).toHaveValue('full');
    expect(screen.getByLabelText('One-based physical pages')).toHaveValue('8');
    expect(screen.getByLabelText('Default physical page')).toHaveValue('8');
    expect(repo.create).not.toHaveBeenCalled();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_mapping_viewer_page_selected',
      expect.objectContaining({
        sourceKey: 'full',
        sourceVersionId: 'source-full',
        physicalPageNumber: 8,
      }),
    );
  });

  it('copies Unit prompt and exposes deterministic manual fallback when clipboard is denied', async () => {
    const user = userEvent.setup();
    mocks.writeClipboardText.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderWorkspace({ initialCandidate: {
      ...candidate(),
      manifest: {
        ...candidate().manifest!,
        units: [{
          unitKey: 'unit-1',
          activitySlots: [{ activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-full-2-activity'] }],
          pageGroups: [{ pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1'], mode: 'activity' }],
        }],
      },
    } });

    await user.click(screen.getByRole('button', { name: 'Copy Unit prompt' }));
    expect(mocks.warning).toHaveBeenCalledWith('Clipboard was blocked. Manual copy fallback is available.');
    const fallback = screen.getByLabelText('Manual copy fallback') as HTMLTextAreaElement;
    expect(fallback.value).toContain('prd0062.unit_activity_import.v1');
    expect(fallback.value).not.toContain('source-full');

    await user.click(screen.getByRole('button', { name: 'Copy Unit prompt' }));
    expect(mocks.success).toHaveBeenCalledWith('Unit prompt copied.');
  });

  it('persists the Assembly contract before staging Unit JSON through 12C', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const authoring = activityAuthoring();
    renderWorkspace({
      repository: repo,
      activityAuthoring: authoring,
      initialCandidate: {
        ...candidate(),
        manifest: {
          ...candidate().manifest!,
          units: [{
            unitKey: 'unit-1',
            activitySlots: [{ activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-full-2-activity'] }],
            pageGroups: [{ pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1'], mode: 'activity' }],
          }],
        },
      },
    });

    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), {
      target: { value: unitImportJson() },
    });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));

    await waitFor(() => expect(authoring.stage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(repo.replace).toHaveBeenCalledTimes(1));
    expect(authoring.stage).toHaveBeenCalledWith(expect.objectContaining({
      targetActivityId: 'ba_626f6f6b2d31_61637469766974792d72656164696e672d31',
      clientValidationContext: { mappedBookPageRefs: ['source:full:page:2'] },
      sourceEvidenceRefs: ['source:full:page:2'],
      answerEvidenceRefs: ['pageGroup:pages-full-2-activity'],
    }));
    expect(authoring.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-reading-1' },
    }));
    expect(repo.replace).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: 'candidate-1',
      expectedCandidateRevision: 1,
    }));
    expect(repo.replace.mock.invocationCallOrder[0]).toBeLessThan(authoring.stage.mock.invocationCallOrder[0]);
    expect(mocks.success).toHaveBeenCalledWith('Unit Activity JSON imported.');
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_unit_import_staged',
      expect.objectContaining({ slotCount: 1 }),
    );
  });

  it('requires an explicit teacher choice before replacing a conflicting Unit Activity draft', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const authoring = activityAuthoring();
    vi.mocked(authoring.stage).mockRejectedValueOnce(new ActivityAuthoringHttpError(409, {
      status: 'conflict',
      currentRevision: 1,
    }));
    renderWorkspace({
      repository: repo,
      activityAuthoring: authoring,
      initialCandidate: {
        ...candidate(),
        manifest: {
          ...candidate().manifest!,
          units: [{
            unitKey: 'unit-1',
            activitySlots: [{ activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-full-2-activity'] }],
            pageGroups: [{ pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1'], mode: 'activity' }],
          }],
        },
      },
    });

    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), {
      target: { value: unitImportJson() },
    });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));

    const replace = await screen.findByRole('button', { name: 'Replace existing Activity draft' });
    expect(screen.queryByText('Current candidate changed. Choose an action.')).not.toBeInTheDocument();
    expect(authoring.stage).toHaveBeenCalledTimes(1);
    expect(authoring.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({ expectedRevision: 0 }));
    expect(authoring.validate).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith(
      'This Unit Activity already has a newer draft. Review the replacement choice before importing.',
    );

    await user.click(replace);

    await waitFor(() => expect(authoring.stage).toHaveBeenCalledTimes(2));
    expect(authoring.stage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedRevision: 1,
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-reading-1' },
    }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Unit Activity JSON imported.'));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_unit_import_replacement_selected',
      expect.objectContaining({ activityKey: 'activity-reading-1', currentRevision: 1 }),
    );
  });

  it('stops before 12C Activity staging when the prerequisite 13A Assembly save conflicts', async () => {
    const user = userEvent.setup();
    const repo = repository('conflict');
    const authoring = activityAuthoring();
    renderWorkspace({
      repository: repo,
      activityAuthoring: authoring,
      initialCandidate: {
        ...candidate(),
        manifest: {
          ...candidate().manifest!,
          units: [{
            unitKey: 'unit-1',
            activitySlots: [{ activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-full-2-activity'] }],
            pageGroups: [{ pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1'], mode: 'activity' }],
          }],
        },
      },
    });

    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), {
      target: { value: unitImportJson() },
    });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));

    await waitFor(() => expect(repo.replace).toHaveBeenCalled());
    expect(authoring.stage).not.toHaveBeenCalled();
    expect(authoring.discard).not.toHaveBeenCalled();
    expect(repo.replace).toHaveBeenCalled();
    expect(await screen.findByText('This Book changed elsewhere. Reload or retry before importing Activities.')).toBeVisible();
  });

  it('rejects malformed import atomically before 12C or 13A writes', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const authoring = activityAuthoring();
    renderWorkspace({
      repository: repo,
      activityAuthoring: authoring,
      initialCandidate: {
        ...candidate(),
        manifest: {
          ...candidate().manifest!,
          units: [{
            unitKey: 'unit-1',
            activitySlots: [{ activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-full-2-activity'] }],
            pageGroups: [{ pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1'], mode: 'activity' }],
          }],
        },
      },
    });

    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), {
      target: { value: unitImportJson('foreign-slot') },
    });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('exactly match');
    expect(authoring.stage).not.toHaveBeenCalled();
    expect(repo.replace).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Unit Activity import failed.');
  });

  it('rolls back the persisted Assembly manifest edit when subsequent 12C Activity staging fails', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const authoring = activityAuthoring();
    vi.mocked(authoring.stage).mockRejectedValueOnce(new Error('authoring_worker_unavailable'));
    const initialManifest = {
      ...candidate().manifest!,
      units: [{
        unitKey: 'unit-1',
        activitySlots: [{ activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-full-2-activity'] }],
        pageGroups: [
          { pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1'], mode: 'activity' as const },
          { pageGroupKey: 'pages-ref-9', sourceKey: 'full', pages: [9], defaultPhysicalPageNumber: 9, activityKeys: [], mode: 'reference_only' as const },
        ],
      }],
    };
    renderWorkspace({
      repository: repo,
      activityAuthoring: authoring,
      initialCandidate: {
        ...candidate(),
        manifest: initialManifest,
      },
    });

    // Mutate the Book manifest in-editor before importing so persistAndValidateManifest writes a changed manifest
    await user.click(screen.getByRole('button', { name: 'Add section' }));

    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), {
      target: { value: unitImportJson() },
    });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));

    await waitFor(() => expect(authoring.stage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(repo.replace).toHaveBeenCalledTimes(2));
    // First replace saved the edited manifest; second replace restored initialManifest after stage failed
    expect(repo.replace).toHaveBeenNthCalledWith(2, expect.objectContaining({
      candidateId: 'candidate-1',
      manifest: initialManifest,
    }));
    expect(mocks.error).toHaveBeenCalledWith('Unit Activity import failed.');
  });

  it('applies only exact candidate reconciliation through one 13A CAS revision', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const existing = candidate();
    const unit = {
      unitKey: 'unit-1',
      activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'optional' as const, pageGroupKeys: [] }],
      pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [2, 1, 1], activityKeys: ['activity-1'], mode: 'activity' as const, defaultPhysicalPageNumber: 1 }],
    };
    renderWorkspace({ repository: repo, initialCandidate: { ...existing, manifest: { ...existing.manifest, units: [unit] } } });

    await user.click(screen.getByRole('button', { name: 'Apply exact repairs' }));

    await waitFor(() => expect(repo.replace).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: 'candidate-1',
      expectedCandidateRevision: 1,
      manifest: expect.objectContaining({
        units: [expect.objectContaining({
          activitySlots: [expect.objectContaining({ pageGroupKeys: ['pages-1'] })],
          pageGroups: [expect.objectContaining({ pages: [1, 2] })],
        })],
      }),
    })));
    expect(mocks.success).toHaveBeenCalledWith('Exact Assembly repairs saved.');
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_reconciliation_repair_applied',
      expect.objectContaining({ candidateId: 'candidate-1' }),
    );
  });

  it('treats non-contiguous textbook pages as advisory notes and allows saving without a dead choice button', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const existing = candidate();
    const unit = {
      unitKey: 'unit-1',
      activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'optional' as const, pageGroupKeys: ['pages-1'] }],
      pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [1, 3], activityKeys: ['activity-1'], mode: 'activity' as const }],
    };
    renderWorkspace({ repository: repo, initialCandidate: { ...existing, manifest: { ...existing.manifest, units: [unit] } } });

    expect(screen.queryByRole('button', { name: 'Apply exact repairs' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record teacher choice needed' })).toBeNull();
    expect(screen.getByText(/1 page note \(does not block saving\)/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(repo.replace).toHaveBeenCalledTimes(1));
    expect(mocks.success).toHaveBeenCalledWith('Book draft saved.');
  });

  it('imports a real multi-unit textbook Book outline with shared pages and transcripts, saves any unit, and supports manual activity/reference edits', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({
      repository: repo,
      guided: true,
      guidedUiVariant: 'mockup',
      editingPanel: 'content-tree',
      sourceVersions: [
        { ...sourceVersions[0], physicalPageCount: 128 },
      ],
    });

    const collinsOutlineJson = JSON.stringify({
      sourceKey: 'full',
      nodes: [
        { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', title: 'Part 1: Meeting people', order: 1 },
        { nodeKey: 'unit-01', parentNodeKey: 'section-1', nodeType: 'unit', title: 'Unit 1: Making a good impression', order: 1 },
        { nodeKey: 'unit-02', parentNodeKey: 'section-1', nodeType: 'unit', title: 'Unit 2: Small talk', order: 2 },
      ],
      units: [
        {
          unitKey: 'unit-01',
          activitySlots: [
            { activityKey: 'u01-ex1', order: 1, contextRequirement: 'required', pageGroupKeys: ['u01-p9-a'] },
            { activityKey: 'u01-ex2', order: 2, contextRequirement: 'required', pageGroupKeys: ['u01-p9-b'] },
          ],
          pageGroups: [
            { pageGroupKey: 'u01-p9-a', sourceKey: 'full', pages: [9], defaultPhysicalPageNumber: 9, activityKeys: ['u01-ex1'], mode: 'activity' },
            { pageGroupKey: 'u01-p9-b', sourceKey: 'full', pages: [9], defaultPhysicalPageNumber: 9, activityKeys: ['u01-ex2'], mode: 'activity' },
            { pageGroupKey: 'u01-transcript', sourceKey: 'full', pages: [103, 104], defaultPhysicalPageNumber: 103, activityKeys: [], mode: 'reference_only' },
          ],
        },
        {
          unitKey: 'unit-02',
          activitySlots: [
            { activityKey: 'u02-ex1', order: 1, contextRequirement: 'required', pageGroupKeys: ['u02-p13'] },
          ],
          pageGroups: [
            { pageGroupKey: 'u02-p13', sourceKey: 'full', pages: [13], defaultPhysicalPageNumber: 13, activityKeys: ['u02-ex1'], mode: 'activity' },
          ],
        },
      ],
    });

    fireEvent.change(screen.getByLabelText('Paste Book structure JSON'), {
      target: { value: `\`\`\`json\n${collinsOutlineJson}\n\`\`\`` },
    });
    await user.click(screen.getByRole('button', { name: 'Apply pasted JSON' }));

    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Imported 2 units (3 activities)'));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_structure_imported',
      expect.objectContaining({ unitCount: 2, activityCount: 3 }),
    );

    // Add a manual activity slot to Unit 1
    await user.click(screen.getByRole('button', { name: 'Add activity' }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_activity_slot_added',
      expect.objectContaining({ unitKey: 'unit-01' }),
    );

    // Save Unit 1 directly (must use actual unitKey 'unit-01', not hardcoded 'unit-1')
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      unitKey: 'unit-01',
    })));
    expect(mocks.success).toHaveBeenCalledWith('Book draft saved.');
  });

  it('keeps row choices local and advances the baseline only after persistence succeeds', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    const repo = repository();
    const base = candidate();
    const unit = base.manifest!.units[0];
    const current = { ...base, manifest: { ...base.manifest!, units: [{ ...unit,
      activitySlots: [
        { activityKey: 'activity-1', order: 1, contextRequirement: 'optional' as const, pageGroupKeys: ['pages-1'] },
        { activityKey: 'activity-2', order: 2, contextRequirement: 'optional' as const, pageGroupKeys: ['pages-2'] },
      ],
      pageGroups: [
        { pageGroupKey: 'pages-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-1'], mode: 'activity' as const },
        { pageGroupKey: 'pages-2', sourceKey: 'full', pages: [2], activityKeys: ['activity-2'], mode: 'activity' as const },
      ],
    }] } };
    renderWorkspace({ initialCandidate: current, repository: repo, onDirtyChange });

    for (const [activityKey, page] of [['activity-1', '4'], ['activity-2', '3']] as const) {
      await user.clear(screen.getByLabelText('Activity key'));
      await user.type(screen.getByLabelText('Activity key'), activityKey);
      await user.clear(screen.getByLabelText('One-based physical pages'));
      await user.type(screen.getByLabelText('One-based physical pages'), page);
      await user.clear(screen.getByLabelText('Default physical page'));
      await user.type(screen.getByLabelText('Default physical page'), page);
      await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    }

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Keep current' })).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: 'Keep current' })[0]);
    expect(screen.getAllByRole('button', { name: 'Use proposed' })).toHaveLength(1);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(repo.replace).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    expect(repo.replace).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Use proposed' }));
    expect(screen.getAllByRole('button', { name: 'Save draft' })[0]).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Review changes before saving' })).toHaveTextContent('0 to confirm');
    vi.mocked(repo.replace)
      .mockResolvedValueOnce({ status: 'conflict', conflict: { expectedRevision: 1, currentRevision: 2 } })
      .mockResolvedValueOnce({ status: 'replaced', candidate: { ...current, revision: 2 } });
    await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    await waitFor(() => expect(repo.replace).toHaveBeenCalledTimes(1));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    await waitFor(() => expect(repo.replace).toHaveBeenCalledTimes(2));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('re-requires teacher choice when a resolved mapping change is edited again to another page', async () => {
    const user = userEvent.setup();
    const repo = repository();
    const base = candidate();
    const unit = base.manifest!.units[0];
    const current = {
      ...base,
      manifest: {
        ...base.manifest!,
        units: [{
          ...unit,
          activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'optional' as const, pageGroupKeys: ['pages-1'] }],
          pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [1], activityKeys: ['activity-1'], mode: 'activity' as const }],
        }],
      },
    };
    renderWorkspace({ initialCandidate: current, repository: repo });

    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-1');
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    await waitFor(() => expect(screen.getByRole('region', { name: 'Review changes before saving' })).toHaveTextContent('1 to confirm'));
    await user.click(screen.getByRole('button', { name: 'Use proposed' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Review changes before saving' })).toHaveTextContent('0 to confirm'));

    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-1');
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '3');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '3');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));

    await waitFor(() => expect(screen.getByRole('region', { name: 'Review changes before saving' })).toHaveTextContent('1 to confirm'));
    await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
    expect(repo.replace).not.toHaveBeenCalled();
  });

  it('supports per-unit tinkering and bulk multi-unit import with auto-detection on Unit activities', async () => {
    const user = userEvent.setup();
    const multiManifest: BookAssemblyManifestCandidate = {
      bookId: 'book-1',
      sourceSet: {
        sourceStrategy: 'full_pdf',
        sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
      },
      nodes: [
        { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1 },
        { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1 },
        { nodeKey: 'unit-2', parentNodeKey: 'section-1', nodeType: 'unit', order: 2 },
      ],
      units: [
        {
          unitKey: 'unit-1',
          activitySlots: [{ activityKey: 'u1-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['u1-p1'] }],
          pageGroups: [{ pageGroupKey: 'u1-p1', sourceKey: 'full', pages: [1], defaultPhysicalPageNumber: 1, activityKeys: ['u1-a1'], mode: 'activity' }],
        },
        {
          unitKey: 'unit-2',
          activitySlots: [{ activityKey: 'u2-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['u2-p2'] }],
          pageGroups: [{ pageGroupKey: 'u2-p2', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['u2-a1'], mode: 'activity' }],
        },
      ],
    };
    const repo: UnitAssemblyRepository = {
      create: vi.fn(async (input) => ({
        status: 'staged' as const,
        candidate: {
          candidateId: `cand-${input.unitKey}`,
          bookId: input.bookId,
          unitKey: input.unitKey,
          ownerId: 'teacher-1',
          bookRevision: input.expectedBookRevision,
          sourceSetRevision: input.expectedSourceSetRevision,
          revision: 1,
          lifecycle: 'validated' as const,
          manifest: input.manifest,
          validation: { valid: true, errors: [] },
          updatedAt: '2026-11-26T00:00:00.000Z',
        },
      })),
      replace: vi.fn(async (input) => ({
        status: 'replaced' as const,
        candidate: {
          candidateId: input.candidateId,
          bookId: input.bookId,
          unitKey: input.unitKey,
          ownerId: 'teacher-1',
          bookRevision: input.expectedBookRevision,
          sourceSetRevision: input.expectedSourceSetRevision,
          revision: input.expectedCandidateRevision + 1,
          lifecycle: 'validated' as const,
          manifest: input.manifest,
          validation: { valid: true, errors: [] },
          updatedAt: '2026-11-26T00:00:00.000Z',
        },
      })),
      validate: vi.fn(),
      discard: vi.fn(),
      load: vi.fn(),
    };
    const activityAuthoring = {
      importUnit: vi.fn(async () => 1),
      stage: vi.fn(async (input: { targetActivityId: string; evidenceRefs?: readonly string[]; sourceEvidenceRefs?: readonly string[]; answerEvidenceRefs?: readonly string[] }) => ({
        status: 'staged' as const,
        candidateId: `act-${input.targetActivityId}`,
        targetActivityId: input.targetActivityId,
        revision: 1,
        lifecycle: 'staged' as const,
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
      })),
      validate: vi.fn(async (input: { candidateId: string; expectedRevision: number }) => ({
        status: 'validated' as const,
        candidateId: input.candidateId,
        revision: input.expectedRevision + 1,
        lifecycle: 'validated' as const,
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
        sourceEvidenceRefs: [],
        answerEvidenceRefs: [],
      })),
      saveDraft: vi.fn(async (input: { candidateId: string; expectedRevision: number }) => ({
        status: 'saved' as const,
        activityId: input.candidateId.replace(/^act-/u, ''),
        candidateId: input.candidateId,
        candidateRevision: input.expectedRevision + 1,
        revision: 1,
        lifecycle: 'saved' as const,
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
        sourceEvidenceRefs: [],
        answerEvidenceRefs: [],
      })),
      discard: vi.fn(),
      loadCandidate: vi.fn(),
    };

    render(
      <BookAssemblyWorkspace
        access="owner"
        activityAuthoring={activityAuthoring as never}
        bookId="book-1"
        bookTitle="Multi-Unit Textbook"
        bookRevision={1}
        editingPanel="activity-json"
        guided
        guidedUiVariant="mockup"
        initialCandidate={{
          candidateId: 'cand-unit-1',
          bookId: 'book-1',
          unitKey: 'unit-1',
          ownerId: 'teacher-1',
          bookRevision: 1,
          sourceSetRevision: 1,
          revision: 1,
          lifecycle: 'validated',
          manifest: multiManifest,
          validation: { valid: true, errors: [] },
          updatedAt: '2026-11-26T00:00:00.000Z',
        }}
        initialSourceSet={multiManifest.sourceSet}
        presentation="modal"
        repository={repo}
        sourceSetRevision={1}
        sourceVersions={[sourceVersion('full', 'source-v1', 40, true)]}
        suppressGuidedChrome
        suppressModeChoice
      />,
    );

    // Single-unit view shows Unit 1 prompt button + All units (Bulk) in sidebar
    expect(screen.getByRole('button', { name: 'Copy Unit 1 prompt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All units \(Bulk\)/ })).toBeInTheDocument();

    // Pasting a multi-unit bulk JSON while on Unit 1 auto-switches to Bulk import
    const bulkPayload = JSON.stringify({
      promptVersion: 'book-units-bulk-json-v1',
      schemaVersion: 'prd0062.book_unit_activities_bulk_import.v1',
      bookId: 'book-1',
      units: [
        {
          unitKey: 'unit-1',
          slots: [{
            activityKey: 'u1-a1',
            content: {
              schemaVersion: 1,
              title: 'Unit 1 Task',
              taskProfile: null,
              presentationMode: 'source-assisted',
              contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
              instructions: [{ text: 'Listen.' }],
              stimulus: null,
              assetRefs: [],
              interaction: { family: 'choice', variant: 'single-select' },
              answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
              interactions: [{ prompt: 'Q1', options: ['A', 'B'], acceptedOptionIndexes: [0], sourceAssisted: { questionLabel: '1', accessiblePrompt: 'Choose one.', responseShape: 'single-choice', sourceExerciseLabel: 'Exercise 1' } }],
              scoring: { mode: 'auto-where-possible' },
            },
            evidenceRefs: ['import:u1-a1'],
            sourceEvidenceRefs: ['source:full:page:1'],
            answerEvidenceRefs: ['source:full:page:1'],
          }],
        },
        {
          unitKey: 'unit-2',
          slots: [{
            activityKey: 'u2-a1',
            content: {
              schemaVersion: 1,
              title: 'Unit 2 Task',
              taskProfile: null,
              presentationMode: 'source-assisted',
              contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
              instructions: [{ text: 'Listen.' }],
              stimulus: null,
              assetRefs: [],
              interaction: { family: 'choice', variant: 'single-select' },
              answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
              interactions: [{ prompt: 'Q2', options: ['A', 'B'], acceptedOptionIndexes: [1] }],
              scoring: { mode: 'auto-where-possible' },
            },
            evidenceRefs: ['import:u2-a1'],
            sourceEvidenceRefs: ['source:full:page:2'],
            answerEvidenceRefs: ['source:full:page:2'],
          }],
        },
      ],
    });

    fireEvent.change(screen.getByLabelText('Paste Unit 1 JSON'), { target: { value: bulkPayload } });
    expect(screen.getByRole('heading', { name: 'Bulk import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy bulk prompt \(2\)/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import all' }));
    await waitFor(() => expect(activityAuthoring.importUnit).toHaveBeenCalledTimes(2));
    expect(screen.getByText('2 / 2 units ready')).toBeInTheDocument();
    expect(screen.getByLabelText('Bulk import unit status')).toHaveTextContent('Unit 1');
    expect(screen.getByLabelText('Bulk import unit status')).toHaveTextContent('Unit 2');
  });

  it('accumulates expectedActivityRevisions across multi-slot conflict retries instead of resetting earlier slots to 0', async () => {
    const user = userEvent.setup();
    const multiSlotCandidate: BookAssemblyCandidateRecord = {
      candidateId: 'cand-multi-slot',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      bookRevision: 2,
      sourceSetRevision: 3,
      unitKey: 'unit-1',
      revision: 1,
      lifecycle: 'validated',
      manifest: {
        bookId: 'book-1',
        sourceSet: {
          sourceStrategy: 'full_pdf',
          sources: [{ sourceKey: 'full', sourceVersionId: 'source-full', sourceOrder: 1 }],
        },
        nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
        units: [{
          unitKey: 'unit-1',
          activitySlots: [
            { activityKey: 'u1-a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['unit-1-p1'] },
            { activityKey: 'u1-a2', order: 2, contextRequirement: 'required', pageGroupKeys: ['unit-1-p2'] },
          ],
          pageGroups: [
            { pageGroupKey: 'unit-1-p1', sourceKey: 'full', pages: [1], defaultPhysicalPageNumber: 1, activityKeys: ['u1-a1'], mode: 'activity' },
            { pageGroupKey: 'unit-1-p2', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['u1-a2'], mode: 'activity' },
          ],
        }],
      },
      validation: { valid: true, errors: [] },
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const repo = repository();
    const seenExpectedBySlot: Array<{ readonly activityKey: string; readonly expectedRevision: number }> = [];
    const existingRevisions: Record<string, number> = { 'u1-a1': 2, 'u1-a2': 3 };
    const activityAuthoring: ActivityAuthoringService = {
      stage: vi.fn(async (input) => {
        const activityKey = input.unitActivityBinding!.activityKey;
        seenExpectedBySlot.push({ activityKey, expectedRevision: input.expectedRevision });
        const required = existingRevisions[activityKey]!;
        if (input.expectedRevision !== required) {
          throw new ActivityAuthoringHttpError(409, { status: 'conflict', currentRevision: required });
        }
        return {
          status: 'staged' as const,
          candidateId: `cand-${activityKey}-${input.expectedRevision}`,
          targetActivityId: input.targetActivityId!,
          revision: 1,
          lifecycle: 'staged' as const,
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [...(input.evidenceRefs ?? [])],
          sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
          answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
        };
      }),
      validate: vi.fn(async (input) => ({
        status: 'validated' as const,
        candidateId: input.candidateId,
        revision: input.expectedRevision + 1,
        lifecycle: 'validated' as const,
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
      })),
      saveDraft: vi.fn(async (input) => ({
        status: 'saved' as const,
        activityId: bookScopedActivityTargetId('book-1', input.unitActivityBinding!.activityKey),
        candidateId: input.candidateId,
        candidateRevision: input.expectedRevision + 1,
        revision: 1,
        lifecycle: 'saved' as const,
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
      })),
      discard: vi.fn(async (input) => ({
        status: 'discarded' as const,
        candidateId: input.candidateId,
        revision: input.expectedRevision + 1,
        lifecycle: 'discarded' as const,
      })),
      loadCandidate: vi.fn(),
    };

    renderWorkspace({
      repository: repo,
      initialCandidate: multiSlotCandidate,
      initialCandidatesByUnit: { 'unit-1': multiSlotCandidate },
      initialSourceSet: multiSlotCandidate.manifest!.sourceSet,
      activityAuthoring,
      editingPanel: 'activity-json',
      guided: true,
      guidedUiVariant: 'mockup',
      suppressGuidedChrome: true,
      suppressModeChoice: true,
    });

    const unitPayload = JSON.stringify({
      promptVersion: 'book-unit-json-v1',
      schemaVersion: 'prd0062.unit_activity_import.v1',
      bookId: 'book-1',
      unitKey: 'unit-1',
      slots: ['u1-a1', 'u1-a2'].map((activityKey, index) => ({
        activityKey,
        content: {
          schemaVersion: 1,
          title: `Task ${index + 1}`,
          taskProfile: null,
          presentationMode: 'source-assisted',
          contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
          instructions: [{ text: 'Listen.' }],
          stimulus: null,
          assetRefs: [],
          interaction: { family: 'choice', variant: 'single-select' },
          answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
          interactions: [{
            prompt: `Q${index + 1}`,
            options: ['A', 'B'],
            acceptedOptionIndexes: [0],
            sourceAssisted: {
              questionLabel: `Q${index + 1}`,
              accessiblePrompt: `Question ${index + 1}`,
              responseShape: 'single-choice',
              sourceExerciseLabel: `Exercise ${index + 1}`,
            },
          }],
          scoring: { mode: 'auto-where-possible' },
        },
        evidenceRefs: [`import:${activityKey}`],
        sourceEvidenceRefs: [`source:full:page:${index + 1}`],
        answerEvidenceRefs: [`source:full:page:${index + 1}`],
      })),
    });

    fireEvent.change(screen.getByLabelText('Paste Unit 1 JSON'), { target: { value: unitPayload } });
    await user.click(screen.getByRole('button', { name: 'Import' }));

    // 1st conflict on u1-a1 (rev 2) -> click Replace
    await waitFor(() => expect(screen.getByRole('button', { name: /Replace/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Replace/i }));

    // 2nd conflict on u1-a2 (rev 3), with u1-a1 remembered at rev 2 -> click Replace
    await waitFor(() => expect(screen.getByRole('button', { name: /Replace/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Replace/i }));

    // Both slots commit on the 3rd attempt (u1-a1: 2, u1-a2: 3)
    await waitFor(() => expect(activityAuthoring.saveDraft).toHaveBeenCalledTimes(2));
    expect(seenExpectedBySlot.slice(-2)).toEqual([
      { activityKey: 'u1-a1', expectedRevision: 2 },
      { activityKey: 'u1-a2', expectedRevision: 3 },
    ]);
  });

  it('never rolls back the manifest when an Activity slot remains committed and surfaces manifest rollback failures explicitly', async () => {
    const user = userEvent.setup();
    // Case 1: Phase 2 partial commit (slot 1 saved, slot 2 failed) -> manifest MUST NOT be reverted
    const repoPartial = repository();
    const initialManifest = {
      ...candidate().manifest!,
      units: [{
        unitKey: 'unit-1',
        activitySlots: [
          { activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-full-2-activity'] },
          { activityKey: 'activity-reading-2', order: 2, contextRequirement: 'required' as const, pageGroupKeys: ['pages-full-2-activity'] },
        ],
        pageGroups: [
          { pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1', 'activity-reading-2'], mode: 'activity' as const },
        ],
      }],
    };
    const twoSlotPayload = JSON.stringify({
      promptVersion: 'book-unit-json-v1',
      schemaVersion: 'prd0062.unit_activity_import.v1',
      bookId: 'book-1',
      unitKey: 'unit-1',
      slots: ['activity-reading-1', 'activity-reading-2'].map((activityKey) => ({
        activityKey,
        content: JSON.parse(unitImportJson()).slots[0].content,
        evidenceRefs: [`import:${activityKey}`],
        sourceEvidenceRefs: ['source:full:page:2'],
        answerEvidenceRefs: ['source:full:page:2'],
      })),
    });
    const authoringPartial = activityAuthoring();
    vi.mocked(authoringPartial.stage)
      .mockResolvedValueOnce({
        status: 'staged',
        candidateId: 'cand-1',
        targetActivityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        revision: 1,
        lifecycle: 'staged',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      })
      .mockResolvedValueOnce({
        status: 'staged',
        candidateId: 'cand-2',
        targetActivityId: bookScopedActivityTargetId('book-1', 'activity-reading-2'),
        revision: 1,
        lifecycle: 'staged',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      });
    vi.mocked(authoringPartial.saveDraft)
      .mockResolvedValueOnce({
        status: 'saved',
        activityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        candidateId: 'cand-1',
        candidateRevision: 3,
        revision: 1,
        lifecycle: 'saved',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      })
      .mockRejectedValueOnce(new Error('save_slot_2_failed'));

    const firstRender = renderWorkspace({
      repository: repoPartial,
      activityAuthoring: authoringPartial,
      initialCandidate: { ...candidate(), manifest: initialManifest },
    });
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), { target: { value: twoSlotPayload } });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));

    await waitFor(() => expect(authoringPartial.saveDraft).toHaveBeenCalledTimes(2));
    // Manifest was saved once before staging, and MUST NOT be reverted while activity-reading-1 stays committed
    expect(repoPartial.replace).toHaveBeenCalledTimes(1);
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_unit_import_failed',
      expect.objectContaining({ code: 'partial-commit-failed' }),
    );
    firstRender.unmount();

    // Case 2: Phase 1 staging fails AND compensating manifest restore ALSO fails -> explicit manifest-rollback-failed surfaced
    const repoRollbackFail = repository();
    vi.mocked(repoRollbackFail.replace)
      .mockResolvedValueOnce({
        status: 'validated',
        candidate: { ...candidate(), revision: 2, manifest: initialManifest },
        receipt: { operationId: 'op-save', status: 'validated', fingerprint: 'fp', committedAt: '2026-07-24T00:00:00.000Z' },
        conflict: null,
      })
      .mockRejectedValueOnce(new Error('rtdb_restore_503'));
    const authoringFailStage = activityAuthoring();
    vi.mocked(authoringFailStage.stage).mockRejectedValueOnce(new Error('stage_failed'));
    renderWorkspace({
      repository: repoRollbackFail,
      activityAuthoring: authoringFailStage,
      initialCandidate: { ...candidate(), manifest: initialManifest },
    });
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), { target: { value: twoSlotPayload } });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));

    await waitFor(() => expect(repoRollbackFail.replace).toHaveBeenCalledTimes(2));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_unit_import_failed',
      expect.objectContaining({ code: 'manifest-rollback-failed' }),
    );
    expect(screen.getAllByText(/Manifest changes could not be reverted/i).length).toBeGreaterThan(0);
  });

  it('cleans up newly created validated candidates on Phase 1 failure, preserves manifest on HTTP 409 binding-conflict, and loads prior slot snapshots for compensation', async () => {
    const user = userEvent.setup();
    const { ActivityAuthoringHttpError } = await import('../../services/book-activity/activityStorage.service');

    // Case 1: Newly created + validated candidate (no previousCandidate) when Phase 1 stage fails -> calls guarded discard
    const repoNew = repository();
    vi.mocked(repoNew.create).mockImplementationOnce(async (input) => ({
      status: 'created',
      candidate: { ...candidate(), unitKey: input.unitKey, candidateId: 'cand-brand-new', revision: 1, lifecycle: 'draft', manifest: input.manifest },
      receipt: { operationId: input.operationId, status: 'created', fingerprint: 'fp', createdAt: '2026-07-24T00:00:00.000Z' },
      conflict: null,
    }));
    vi.mocked(repoNew.validate).mockImplementationOnce(async (input) => ({
      status: 'validated',
      candidate: { ...candidate(), unitKey: input.unitKey, candidateId: 'cand-brand-new', revision: 2, lifecycle: 'validated' },
      receipt: { operationId: input.operationId, status: 'validated', fingerprint: 'fp', createdAt: '2026-07-24T00:00:00.000Z' },
      conflict: null,
    }));
    vi.mocked(repoNew.discard).mockImplementationOnce(async (input) => ({
      status: 'discarded',
      candidate: { ...candidate(), unitKey: input.unitKey, candidateId: 'cand-brand-new', revision: 3, lifecycle: 'discarded', manifest: null },
      receipt: { operationId: input.operationId, status: 'discarded', fingerprint: 'fp', createdAt: '2026-07-24T00:00:00.000Z' },
      conflict: null,
    }));
    const authoringFailNew = activityAuthoring();
    vi.mocked(authoringFailNew.stage).mockRejectedValueOnce(new Error('stage_phase1_failed'));
    const r1 = renderWorkspace({
      repository: repoNew,
      activityAuthoring: authoringFailNew,
      initialCandidate: null,
      validateCandidateAfterSave: true,
    });
    await user.click(screen.getAllByRole('button', { name: 'Bind' })[0]);
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    const createdUnitButton = screen.getByRole('button', { name: /^unit: / });
    const createdUnitKey = createdUnitButton.textContent!.replace(/^unit:\s*/u, '').trim();
    await user.clear(screen.getByLabelText('One-based physical pages'));
    await user.type(screen.getByLabelText('One-based physical pages'), '2');
    await user.clear(screen.getByLabelText('Default physical page'));
    await user.type(screen.getByLabelText('Default physical page'), '2');
    await user.clear(screen.getByLabelText('Activity key'));
    await user.type(screen.getByLabelText('Activity key'), 'activity-reading-1');
    await user.selectOptions(screen.getByLabelText('Context requirement'), 'required');
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    const baseUnitPayload = JSON.parse(unitImportJson());
    const createdUnitPayload = JSON.stringify({
      ...baseUnitPayload,
      unitKey: createdUnitKey,
      slots: baseUnitPayload.slots.map((slot: Record<string, unknown>) => ({
        ...slot,
        answerEvidenceRefs: [`pageGroup:${createdUnitKey}-pages-full-2-activity`],
      })),
    });
    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), { target: { value: createdUnitPayload } });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));
    await waitFor(() => expect(repoNew.discard).toHaveBeenCalledTimes(1));
    expect(repoNew.discard).toHaveBeenCalledWith(expect.objectContaining({
      unitKey: createdUnitKey,
      candidateId: 'cand-brand-new',
      expectedCandidateRevision: 2,
      allowUnpublishedValidatedRollback: true,
    }));
    r1.unmount();

    // Case 2: HTTP 409 binding-conflict on Slot 1 keeps manifest (never reverts it!)
    const oneSlotManifest = {
      ...candidate().manifest!,
      units: [{
        unitKey: 'unit-1',
        activitySlots: [
          { activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-full-2-activity'] },
        ],
        pageGroups: [
          { pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1'], mode: 'activity' as const },
        ],
      }],
    };
    const repo409 = repository();
    const authoring409 = activityAuthoring();
    vi.mocked(authoring409.saveDraft).mockRejectedValueOnce(new ActivityAuthoringHttpError(409, {
      status: 'binding-conflict',
      activityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
      revision: 1,
      candidateId: 'cand-1',
      candidateRevision: 3,
      lifecycle: 'saved',
      binding: {
        schemaVersion: 1,
        ownerId: 'teacher-1',
        bookId: 'book-1',
        unitKey: 'unit-1',
        activityKey: 'activity-reading-1',
        activityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        candidateId: 'cand-1',
        candidateRevision: 3,
        candidateLifecycle: 'saved',
        phase: 'binding-conflict',
      },
    }));
    const r2 = renderWorkspace({
      repository: repo409,
      activityAuthoring: authoring409,
      initialCandidate: { ...candidate(), manifest: oneSlotManifest },
    });
    await user.click(screen.getByRole('button', { name: 'Add section' }));
    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), { target: { value: unitImportJson() } });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));
    await waitFor(() => expect(authoring409.saveDraft).toHaveBeenCalledTimes(1));
    expect(repo409.replace).toHaveBeenCalledTimes(1);
    expect(authoring409.discard).not.toHaveBeenCalled();
    r2.unmount();

    // Case 3: initialSavedCandidateIdsByUnit loads previous slot snapshot and compensates Slot 1 when Slot 2 fails
    const twoSlotManifest = {
      ...candidate().manifest!,
      units: [{
        unitKey: 'unit-1',
        activitySlots: [
          { activityKey: 'activity-reading-1', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pages-full-2-activity'] },
          { activityKey: 'activity-reading-2', order: 2, contextRequirement: 'required' as const, pageGroupKeys: ['pages-full-2-activity'] },
        ],
        pageGroups: [
          { pageGroupKey: 'pages-full-2-activity', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-reading-1', 'activity-reading-2'], mode: 'activity' as const },
        ],
      }],
    };
    const twoSlotJson = JSON.stringify({
      promptVersion: 'book-unit-json-v1',
      schemaVersion: 'prd0062.unit_activity_import.v1',
      bookId: 'book-1',
      unitKey: 'unit-1',
      slots: ['activity-reading-1', 'activity-reading-2'].map((activityKey) => ({
        activityKey,
        content: JSON.parse(unitImportJson()).slots[0].content,
        evidenceRefs: [`import:${activityKey}`],
        sourceEvidenceRefs: ['source:full:page:2'],
        answerEvidenceRefs: ['source:full:page:2'],
      })),
    });
    const priorContent = { ...JSON.parse(unitImportJson()).slots[0].content, title: 'Prior Saved Slot 1' };
    const authoringComp = activityAuthoring();
    vi.mocked(authoringComp.loadCandidate).mockResolvedValueOnce({
      status: 'loaded',
      candidate: {
        candidateId: 'saved-cand-prior-1',
        targetActivityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        ownerId: 'teacher-1',
        bookId: 'book-1',
        targetRevision: 1,
        revision: 3,
        lifecycle: 'saved',
        content: priorContent,
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: ['import:prior-1'],
        sourceEvidenceRefs: ['source:full:page:2'],
        answerEvidenceRefs: ['source:full:page:2'],
        updatedAt: 1000,
      },
    });
    vi.mocked(authoringComp.stage)
      .mockResolvedValueOnce({
        status: 'staged',
        candidateId: 'cand-new-1',
        targetActivityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        revision: 1,
        lifecycle: 'staged',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      })
      .mockResolvedValueOnce({
        status: 'staged',
        candidateId: 'cand-new-2',
        targetActivityId: bookScopedActivityTargetId('book-1', 'activity-reading-2'),
        revision: 1,
        lifecycle: 'staged',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      })
      .mockResolvedValueOnce({
        status: 'staged',
        candidateId: 'cand-rollback-1',
        targetActivityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        revision: 1,
        lifecycle: 'staged',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      });
    vi.mocked(authoringComp.saveDraft)
      .mockResolvedValueOnce({
        status: 'saved',
        activityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        candidateId: 'cand-new-1',
        candidateRevision: 3,
        revision: 2,
        lifecycle: 'saved',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      })
      .mockRejectedValueOnce(new Error('save_slot_2_boom'))
      .mockResolvedValueOnce({
        status: 'saved',
        activityId: bookScopedActivityTargetId('book-1', 'activity-reading-1'),
        candidateId: 'cand-rollback-1',
        candidateRevision: 3,
        revision: 3,
        lifecycle: 'saved',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      });
    renderWorkspace({
      repository: repository(),
      activityAuthoring: authoringComp,
      initialCandidate: { ...candidate(), manifest: twoSlotManifest },
      initialSavedCandidateIdsByUnit: { 'unit-1': { 'activity-reading-1': 'saved-cand-prior-1' } },
    });
    fireEvent.change(screen.getByLabelText('Paste Unit Activity JSON'), { target: { value: twoSlotJson } });
    await user.click(screen.getByRole('button', { name: 'Stage Unit JSON' }));
    await waitFor(() => expect(authoringComp.saveDraft).toHaveBeenCalledTimes(3));
    expect(authoringComp.loadCandidate).toHaveBeenCalledWith('saved-cand-prior-1');
    expect(authoringComp.stage).toHaveBeenNthCalledWith(3, expect.objectContaining({
      content: priorContent,
      expectedRevision: 2,
    }));
  });

});

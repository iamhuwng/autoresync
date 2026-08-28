import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import { ActivityAuthoringHttpError } from '../../services/book-activity/activityStorage.service';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
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
  default: ({ title }: { readonly title: string }) => (
    <div data-testid="teacher-assembly-pdf-preview">{title}</div>
  ),
}));

const sourceVersions = [
  { sourceVersionId: 'source-full', bookId: 'book-1', physicalPageCount: 40, verifiedUsable: true },
  { sourceVersionId: 'source-part-a', bookId: 'book-1', physicalPageCount: 20, verifiedUsable: true },
  { sourceVersionId: 'source-part-b', bookId: 'book-1', physicalPageCount: 22, verifiedUsable: true },
  { sourceVersionId: 'source-invalid', bookId: 'book-1', physicalPageCount: 10, verifiedUsable: false },
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
      manifest: expect.objectContaining({
        sourceSet: expect.objectContaining({ sourceStrategy: 'full_pdf' }),
      }),
    }));
    expect(mocks.success).toHaveBeenCalledWith('Assembly draft saved.');
  });

  it('starts an existing candidate clean and returns clean after conflict reload', async () => {
    const user = userEvent.setup();
    const repo = repository('conflict');
    const onDirtyChange = vi.fn();
    renderWorkspace({ repository: repo, initialCandidate: candidate(), onDirtyChange });

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'unit: unit-1' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current candidate changed');

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

  it('rejects invalid persisted Source Versions before 13A mutation', async () => {
    const user = userEvent.setup();
    const repo = repository();
    renderWorkspace({ repository: repo, initialCandidate: invalidSourceCandidate() });

    await user.click(screen.getByRole('button', { name: 'unit: unit-1' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('sourceSet.sources[0].sourceVersionId');
    expect(repo.replace).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Assembly changes need correction before saving.');
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
            pageGroupKeys: ['pages-full-2-3-activity'],
          })],
          pageGroups: [expect.objectContaining({
            pageGroupKey: 'pages-full-2-3-activity',
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
    expect(screen.getByRole('list', { name: 'Activity slot order' })).toHaveTextContent('pages-full-2-activity, pages-full-3-activity');
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
      bookId: 'book-1', candidateId: 'candidate-1', candidateRevision: 1,
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
    } as const;
    const { unmount } = renderWorkspace({
      initialCandidate: candidate(),
      candidateRuntimePreview: runtimePreview,
    });
    expect(screen.getByRole('heading', { name: 'Candidate runtime preview' })).toBeInTheDocument();
    unmount();
    renderWorkspace({ initialCandidate: candidate(2), candidateRuntimePreview: runtimePreview });
    expect(screen.queryByRole('heading', { name: 'Candidate runtime preview' })).not.toBeInTheDocument();
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
    expect(await screen.findByText('Assembly changed elsewhere. Reload or retry before importing Activities.')).toBeVisible();
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

  it('does not write uncertain reconciliation and records teacher choice', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Record teacher choice needed' }));

    expect(repo.replace).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith('Choose the intended source and Activity mapping before saving.');
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'teacher_materials_book_assembly_reconciliation_teacher_choice_recorded',
      expect.objectContaining({ issueCount: 1 }),
    );
  });
});

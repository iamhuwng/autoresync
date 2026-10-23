import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import LocalBookAuthoringWorkspace from './LocalBookAuthoringWorkspace';
import type { BookPdfViewerProps } from '../book-runtime/BookPdfViewer';
import type { LocalBookAuthoringDraft } from '../../services/materialCatalog/localBookAuthoring.service';
import { BOOK_ACTIVITY_MODEL_GUIDANCE } from '../../services/book-assembly/unitPrompt.service';
import { toast, ToastContainer } from '../modern/ToastNotification';

const mocks = vi.hoisted(() => {
  let stored: LocalBookAuthoringDraft | null = null;
  let pdfs: LocalBookAuthoringDraft['pdfs'] = [];
  return {
    save: vi.fn(async (draft: LocalBookAuthoringDraft, patch: Partial<LocalBookAuthoringDraft>) => {
      stored = { ...draft, ...patch, pdfs: patch.pdfs ?? (pdfs.length ? pdfs : draft.pdfs), revision: draft.revision + 1 };
      return structuredClone(stored);
    }),
    savePdf: vi.fn(async (_owner: string, _draft: string, file: File, key: string) => {
      const pdf = { id: key, sourceKey: key, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, blobKey: key };
      pdfs = [...pdfs, pdf];
      return pdf;
    }),
    load: vi.fn(async () => stored ? { ...stored, pdfs: pdfs.length ? pdfs : stored.pdfs } : null),
    loadPdf: vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' }) as Blob | null),
    removePdf: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    inspect: vi.fn(async () => 300),
    prompts: [] as string[],
    reset: () => { stored = null; pdfs = []; },
  };
});
vi.mock('../../services/materialCatalog/localBookAuthoring.service', () => ({
  saveLocalBookAuthoringDraft: mocks.save, saveLocalBookAuthoringPdf: mocks.savePdf,
  loadLocalBookAuthoringDraft: mocks.load, loadLocalBookAuthoringPdf: mocks.loadPdf,
  removeLocalBookAuthoringPdf: mocks.removePdf,
  replaceLocalBookAuthoringPdf: vi.fn(async () => undefined), discardLocalBookAuthoringDraft: mocks.discard,
}));
vi.mock('../../core/platform', () => ({ useClipboard: () => ({ writeText: vi.fn(async (text: string) => { mocks.prompts.push(text); return true; }) }) }));
vi.mock('../../services/materialCatalog/localBookPdfTransport', () => ({
  inspectLocalPdfPageCount: mocks.inspect,
  createLocalBookPdfTransport: vi.fn(() => ({ destroy: vi.fn(), head: vi.fn(async () => ({ contentLength: 3 })) })),
  createLocalComponentPdfTransport: vi.fn(() => ({ destroy: vi.fn(), head: vi.fn(async () => ({ contentLength: 3 })) })),
}));
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('../book-runtime/BookPdfViewer', () => ({
  BookPdfViewer: ({ initialPage = 1, allowedPages, onPageChange, onPageReady }: BookPdfViewerProps) => <div data-testid="local-pdf-viewer">
    <span>PDF page {initialPage}</span>
    {allowedPages?.map((page) => <button key={page} onClick={() => onPageChange?.(page)}>View page {page}</button>)}
    <button onClick={() => onPageReady?.(initialPage)}>Render PDF page</button>
  </div>,
}));
const pdf = { id: 'full', sourceKey: 'full', name: 'book.pdf', size: 3, type: 'application/pdf', lastModified: 1, blobKey: 'full' };
const activity = {
  schemaVersion: 1, title: 'New content', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] }, instructions: [{ text: 'Choose an answer.' }],
  stimulus: null, assetRefs: [], interaction: { family: 'choice', variant: 'single-select' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{ prompt: 'Choose.', options: ['A', 'B'], acceptedOptionIndexes: [0] }], scoring: { mode: 'auto-where-possible' },
};
const draft: LocalBookAuthoringDraft = {
  schemaVersion: 2, draftId: 'draft-1', ownerId: 'teacher-1',
  metadata: { bookMode: 'pdf', title: 'Local Book', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private' },
  strategy: 'full', step: 1, structureJson: '{"nodes":[],"units":[]}', unitsJson: '{}', pageMappingJson: '{"units":[]}',
  validationState: 'pending', revision: 0, submission: { state: 'idle' }, pdfs: [pdf], updatedAt: '2026-01-01T00:00:00.000Z',
};
const unit = (n: number) => ({ unitKey: `unit-${n}`, activitySlots: [{ activityKey: `activity-${n}`, order: 1, contextRequirement: 'none', pageGroupKeys: [`group-${n}`] }], pageGroups: [{ pageGroupKey: `group-${n}`, sourceKey: 'full', pages: [n], activityKeys: [`activity-${n}`], mode: 'activity' }] });
const structure = { nodes: [1, 2].map((n) => ({ nodeKey: `unit-${n}`, parentNodeKey: null, nodeType: 'unit', title: `Chapter ${n}`, order: n })), units: [unit(1), unit(2)] };
const importDraft: LocalBookAuthoringDraft = { ...draft, step: 3, structureJson: JSON.stringify(structure), unitsJson: JSON.stringify({ units: [1, 2].map((n) => ({ unitKey: `unit-${n}`, slots: [{ activityKey: `activity-${n}`, content: { ...activity, title: `Previous ${n}` } }] })) }) };
const bundle = (content: unknown = activity, key = 'activity-1') => JSON.stringify({ promptVersion: 'book-unit-json-v1', schemaVersion: 'prd0062.unit_activity_import.v1', slots: [{ activityKey: key, content }] });
const props = () => ({ onChange: vi.fn(), onComplete: vi.fn(), onClose: vi.fn() });
const paste = async (text: string, label = 'Import content') => {
  fireEvent.change(screen.getByLabelText('Paste returned JSON'), { target: { value: text } });
  await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeEnabled());
};
const previewDraft = (): LocalBookAuthoringDraft => {
  const u = { unitKey: 'unit-1', activitySlots: ['first', 'second'].map((key, i) => ({ activityKey: key, order: i + 1, contextRequirement: 'none', pageGroupKeys: [`group-${i}`] })), pageGroups: [
    ...['first', 'second'].map((key, i) => ({ pageGroupKey: `group-${i}`, sourceKey: 'full', pages: [i === 0 ? 2 : 4], activityKeys: [key], mode: 'activity' })),
    { pageGroupKey: 'reference', sourceKey: 'full', pages: [300], activityKeys: [], mode: 'reference_only' },
  ] };
  return { ...draft, step: 4, structureJson: JSON.stringify({ nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', title: 'Individuality', order: 1 }], units: [u] }), unitsJson: JSON.stringify({ units: [{ unitKey: 'unit-1', slots: ['first', 'second'].map((key) => ({ activityKey: key, content: { ...activity, title: `Readable ${key}`, interactions: [{ prompt: `Choose ${key}`, options: ['A', 'B'], acceptedOptionIndexes: [0] }] } })) }] }) };
};
beforeAll(() => { Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } }); });
beforeEach(() => { vi.clearAllMocks(); mocks.reset(); mocks.prompts.length = 0; mocks.loadPdf.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })); mocks.inspect.mockResolvedValue(300); });

afterEach(() => { act(() => toast.clear()); });

describe('local PDF Book modal', () => {
  it.each([true, false])('discards a failed submission only after authoritative resolution (%s)', async (resolved) => {
    const p = props();
    const onResolveDiscard = vi.fn(async () => resolved);
    render(<LocalBookAuthoringWorkspace draft={{ ...draft, step: 5, submission: { state: 'retryable', operationId: 'submission-1', lastError: 'book_submission_book_submission_unavailable' } }}
      {...p} onResolveDiscard={onResolveDiscard} />);
    expect(screen.getByText('Could not confirm Book creation. Your draft is saved. Try again to check its status.')).toBeVisible();
    expect(screen.queryByText('book_submission_book_submission_unavailable')).not.toBeInTheDocument();
    const discard = screen.getByText('Discard draft');
    expect(discard).toBeEnabled();
    await act(async () => fireEvent.click(discard));
    expect(onResolveDiscard).toHaveBeenCalledOnce();
    expect(mocks.discard).toHaveBeenCalledTimes(resolved ? 1 : 0);
    expect(p.onClose).toHaveBeenCalledTimes(resolved ? 1 : 0);
  });

  it('keeps a remote submission when no authoritative discard resolver is available', () => {
    render(<LocalBookAuthoringWorkspace draft={{ ...draft, submission: { state: 'retryable', operationId: 'submission-1' } }} {...props()} />);
    expect(screen.getByText('Discard draft')).toBeDisabled();
  });

  it('requires every Unit review before opening Create', async () => {
    render(<LocalBookAuthoringWorkspace draft={{ ...importDraft, step: 4, reviewedUnits: { 'unit-1': true } }} {...props()} />);
    await screen.findByTestId('local-pdf-viewer');
    fireEvent.click(screen.getByRole('button', { name: /5\s*Create/ }));
    expect(screen.getByRole('heading', { name: 'Preview as student' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Create your Book' })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('announces a failed local save and preserves returned input for retry', async () => {
    mocks.save.mockRejectedValueOnce(new Error('storage unavailable'));
    render(<><ToastContainer /><LocalBookAuthoringWorkspace draft={importDraft} {...props()} /></>);
    fireEvent.change(screen.getByLabelText('Paste returned JSON'), { target: { value: '{recoverable' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this Book on the device');
    expect(screen.getByLabelText('Paste returned JSON')).toHaveValue('{recoverable');
    expect(screen.getByText('Not saved on this device. Retry your last action.')).toBeVisible();
  });

  it('keeps creation disabled until saved files are inspected and permission confirmed', async () => {
    let finish!: (pages: number) => void;
    mocks.inspect.mockImplementationOnce(() => new Promise<number>((resolve) => { finish = resolve; }));
    render(<LocalBookAuthoringWorkspace draft={{ ...previewDraft(), step: 5, reviewedUnits: { 'unit-1': true } }} {...props()} />);
    expect(screen.getByText('Checking saved PDFs…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create Book' })).toBeDisabled();
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => finish(300));
    fireEvent.click(screen.getByRole('checkbox', { name: /permission to share/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Book' })).toBeEnabled());
  });

  it('keeps one viewer, readable titles and page scopes; answers do not approve or remount preview', async () => {
    const p = props();
    render(<LocalBookAuthoringWorkspace draft={previewDraft()} {...p} />);
    await screen.findByTestId('local-pdf-viewer');
    expect(screen.getAllByTestId('local-pdf-viewer')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Render PDF page' }));
    await waitFor(() => expect(screen.getByText('Choose first')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'View page 4' }));
    await screen.findByText('PDF page 4');
    fireEvent.click(screen.getByRole('button', { name: 'Render PDF page' }));
    await waitFor(() => expect(screen.getByText('Choose second')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'View page 300' }));
    await screen.findByText('PDF page 300');
    fireEvent.click(screen.getByRole('button', { name: 'Render PDF page' }));
    await waitFor(() => expect(screen.getByText(/reference-only/i)).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'View page 2' }));
    await screen.findByText('PDF page 2');
    fireEvent.click(screen.getByRole('button', { name: 'Render PDF page' }));
    const mounted = screen.getByTestId('local-pdf-viewer');
    expect(screen.getByRole('radio', { name: 'A' })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'A' })));
    expect(screen.getByTestId('local-pdf-viewer')).toBe(mounted);
    expect(p.onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Preview as student' })).toBeVisible();
    expect(screen.getByText('Readable first')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve Unit & continue' })).toBeEnabled());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Approve Unit & continue' })));
    await screen.findByRole('heading', { name: 'Create your Book' });
    expect(p.onChange.mock.calls.at(-1)?.[0].reviewedUnits).toEqual({ 'unit-1': true });
  });

  it('offers reselection when a saved PDF Blob is missing', async () => {
    mocks.loadPdf.mockResolvedValue(null);
    render(<LocalBookAuthoringWorkspace draft={previewDraft()} {...props()} />);
    await screen.findByText(/saved PDF is unavailable/i);
    expect(screen.getByRole('button', { name: 'Go to Files' })).toBeVisible();
    expect(screen.queryByTestId('local-pdf-viewer')).not.toBeInTheDocument();
  });

  it('saves selected PDF bytes before continuing', async () => {
    render(<LocalBookAuthoringWorkspace draft={{ ...draft, strategy: null, pdfs: [] }} {...props()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'One complete PDF' })));
    await act(async () => fireEvent.change(screen.getByLabelText('Choose complete PDF'), { target: { files: [new File(['pdf'], 'book.pdf', { type: 'application/pdf' })] } }));
    await waitFor(() => expect(mocks.savePdf).toHaveBeenCalledWith('teacher-1', 'draft-1', expect.any(File), 'full'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
  });

  it('uses a primary plan import, preserves real prompt guidance and advances to Unit content', async () => {
    render(<LocalBookAuthoringWorkspace draft={{ ...draft, step: 2 }} {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy planning prompt' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Copy planning prompt' }));
    await waitFor(() => expect(mocks.prompts).toHaveLength(1));
    expect(mocks.prompts[0]).toContain(BOOK_ACTIVITY_MODEL_GUIDANCE);
    expect(mocks.prompts[0]).toContain('"physicalPageCount": 300');
    await paste(JSON.stringify(structure), 'Import plan');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Import plan' })));
    await screen.findByRole('button', { name: 'Copy Unit prompt' });
    expect(screen.queryByLabelText('Technical Activity JSON')).not.toBeInTheDocument();
    expect(screen.queryByText('Add section')).not.toBeInTheDocument();
  });

  it('validates content and replaces only the selected Unit before previewing', async () => {
    const p = props();
    render(<LocalBookAuthoringWorkspace draft={importDraft} {...p} />);
    await paste(bundle());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Import content' })));
    await screen.findByRole('heading', { name: 'Preview as student' });
    const saved = p.onChange.mock.calls.at(-1)![0] as LocalBookAuthoringDraft;
    const units = JSON.parse(saved.unitsJson).units;
    expect(units[0].slots[0].content.title).toBe('New content');
    expect(units[1]).toEqual(JSON.parse(importDraft.unitsJson).units[1]);
  });

  it.each([
    ['incomplete JSON', '{', 'incomplete or malformed'],
    ['invalid rubric', bundle({ ...activity, interaction: { family: 'long-response', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact' }, interactions: [{ prompt: 'Write.', rubric: { criteria: [{ label: 'Invalid' }] } }] }), 'rubric.criteria'],
    ['wrong slot', bundle(activity, 'wrong-slot'), 'exactly match'],
  ])('preserves valid content and pasted input after %s, then accepts correction', async (_name, invalid, error) => {
    render(<LocalBookAuthoringWorkspace draft={importDraft} {...props()} />);
    await paste(invalid);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Import content' })));
    await screen.findByText(new RegExp(error));
    expect(mocks.save.mock.calls.some(([, patch]) => 'unitsJson' in patch)).toBe(false);
    expect(screen.getByLabelText('Paste returned JSON')).toHaveValue(invalid);
    await paste(bundle());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Import content' })));
    await screen.findByRole('heading', { name: 'Preview as student' });
  });

  it('restores unfinished returned JSON separately from validated Unit content', async () => {
    render(<LocalBookAuthoringWorkspace draft={{ ...importDraft, unitImportTexts: { 'unit-1': '{unfinished' } }} {...props()} />);
    expect(screen.getByLabelText('Paste returned JSON')).toHaveValue('{unfinished');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy Unit prompt' })).toBeEnabled());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('copies the canonical Unit prompt before content exists', async () => {
    render(<LocalBookAuthoringWorkspace draft={{ ...importDraft, unitsJson: '{}' }} {...props()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy Unit prompt' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Copy Unit prompt' }));
    await waitFor(() => expect(mocks.prompts).toHaveLength(1));
    expect(mocks.prompts[0]).toContain('book-unit-json-v1');
    expect(mocks.prompts[0]).toContain('source:full:page:1');
    expect(mocks.prompts[0]).toContain('"activityKey": "activity-1"');
  });

  it('repairs a selected Activity directly, rejects invalid physical pages and preserves other mappings', async () => {
    const p = props();
    render(<LocalBookAuthoringWorkspace draft={previewDraft()} {...p} />);
    await screen.findByTestId('local-pdf-viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Change PDF connection' }));
    const dialog = screen.getByRole('dialog', { name: 'PDF connection' });
    expect(within(dialog).getByLabelText('PDF pages')).toHaveValue('2');
    fireEvent.change(within(dialog).getByLabelText('PDF pages'), { target: { value: '301' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Apply change' })));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('1–300');
    expect(p.onChange).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('PDF pages'), { target: { value: '299, 300' } });
    fireEvent.change(within(dialog).getByLabelText('Open on'), { target: { value: '300' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Apply change' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const saved = p.onChange.mock.calls.at(-1)![0] as LocalBookAuthoringDraft;
    const u = JSON.parse(saved.structureJson).units[0];
    expect(u.pageGroups.find((g: { activityKeys: string[] }) => g.activityKeys.includes('first')).pages).toEqual([299, 300]);
    expect(u.pageGroups.find((g: { pageGroupKey: string }) => g.pageGroupKey === 'group-1').pages).toEqual([4]);
    expect(u.activitySlots).toHaveLength(2);
    expect(saved.reviewedUnits).toEqual({});
  });

  it('does not invalidate approval or write the draft for an unchanged connection', async () => {
    const p = props();
    render(<LocalBookAuthoringWorkspace draft={{ ...previewDraft(), reviewedUnits: { 'unit-1': true } }} {...p} />);
    await screen.findByTestId('local-pdf-viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Change PDF connection' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apply change' })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(p.onChange).not.toHaveBeenCalled();
  });

  it.each([[1, 'second'], [2, 'references']])('opens the correct correction target for page group %s', async (groupIndex, target) => {
    const current = previewDraft();
    const structure = JSON.parse(current.structureJson);
    structure.units[0].pageGroups[Number(groupIndex)].pages = [301];
    render(<LocalBookAuthoringWorkspace draft={{ ...current, structureJson: JSON.stringify(structure) }} {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fix this issue' }));
    const dialog = screen.getByRole('dialog', { name: 'PDF connection' });
    expect(within(dialog).getByLabelText('Activity')).toHaveValue(target);
    expect(within(dialog).getByLabelText('PDF pages')).toHaveValue('301');
  });
});

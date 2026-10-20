import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalBookDrafts } from './useLocalBookDrafts';
import type { LocalBookAuthoringDraft } from '../services/materialCatalog/localBookAuthoring.service';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), load: vi.fn(), submit: vi.fn(), resolve: vi.fn(), track: vi.fn(), sourceClient: vi.fn(() => ({})) }));
vi.mock('../services/materialCatalog/localBookAuthoring.service', () => ({
  listLocalBookAuthoringDrafts: mocks.list, createLocalBookAuthoringDraft: mocks.create, loadLocalBookAuthoringDraft: mocks.load,
}));
vi.mock('../services/materialCatalog/bookSubmission.workflow.service', () => ({ submitLocalBookDraft: mocks.submit, resolveLocalBookSubmission: mocks.resolve }));
vi.mock('../services/materialCatalog/bookSubmission.client', () => ({ createBookSubmissionClient: () => ({}) }));
vi.mock('../services/book-source-delivery/sourceUpload.client', () => ({ createSourceUploadClient: mocks.sourceClient }));
vi.mock('../services/book-source-delivery/sourcePdfInspection.browser', () => ({ inspectSourcePdf: vi.fn() }));
vi.mock('../services/book-source-delivery/sourceUpload.browser', () => ({ uploadSourcePdfDirect: vi.fn() }));
vi.mock('../components/modern/ToastNotification', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('./useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: mocks.track }) }));

const draft = { draftId: 'local-1', ownerId: 'teacher-1', metadata: { bookMode: 'pdf', title: 'Book', testTypeIds: ['reading'], visibility: 'private' },
  updatedAt: '2026-10-19T00:00:00Z', submission: { state: 'idle' } } as LocalBookAuthoringDraft;
const user = { uid: 'teacher-1', getIdToken: vi.fn(async () => 'token') };
afterEach(() => vi.unstubAllEnvs());

describe('local Book lobby lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([draft]); mocks.create.mockResolvedValue(draft); mocks.load.mockResolvedValue(draft); });

  it('uses the configured reconciliation authority before discarding a remote submission', async () => {
    vi.stubEnv('VITE_BOOK_SOURCE_CONTROL_WORKER_URL', 'https://source.example');
    vi.stubEnv('VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL', 'https://cleanup.example');
    const { result } = renderHook(() => useLocalBookDrafts({ user, enabled: true, onCommitted: vi.fn() }));
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));
    act(() => { result.current.resume(draft.draftId); });
    await act(async () => { expect(await result.current.resolveDiscard()).toBe(true); });
    expect(mocks.sourceClient).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://source.example', reconciliationBaseUrl: 'https://cleanup.example',
    }));
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });

  it('hides drafts immediately across account changes and ignores the old load response', async () => {
    let resolve!: (value: LocalBookAuthoringDraft[]) => void;
    mocks.list.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(({ current }) => useLocalBookDrafts({ user: current, enabled: true, onCommitted: vi.fn() }), { initialProps: { current: user } });
    rerender({ current: { ...user, uid: 'teacher-2' } });
    await act(async () => resolve([draft]));
    expect(result.current.drafts).toEqual([]);
    expect(result.current.draft).toBeNull();
    expect(result.current.resume(draft.draftId)).toBe(false);
  });

  it('keeps disabled creation from loading, resuming or submitting local data', async () => {
    const { result } = renderHook(() => useLocalBookDrafts({ user, enabled: false, onCommitted: vi.fn() }));
    expect(mocks.list).not.toHaveBeenCalled();
    expect(result.current.resume(draft.draftId)).toBe(false);
    await expect(result.current.submit(draft)).rejects.toThrow('unavailable');
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('retains cleanup-pending state and only reports a finished Book after cleanup', async () => {
    const onCommitted = vi.fn();
    mocks.submit.mockResolvedValueOnce({ receipt: { finalBookId: 'book-1' }, cleanupPending: true })
      .mockResolvedValueOnce({ receipt: { finalBookId: 'book-1' }, cleanupPending: false });
    const retained = { ...draft, submission: { state: 'committed', cleanupPending: true } };
    mocks.load.mockResolvedValue(retained);
    const { result } = renderHook(() => useLocalBookDrafts({ user, enabled: true, onCommitted }));
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));
    await act(async () => result.current.submit(draft));
    expect(result.current.draft).toEqual(retained);
    expect(onCommitted).not.toHaveBeenCalled();
    await act(async () => result.current.submit(retained as LocalBookAuthoringDraft));
    expect(result.current.drafts).toEqual([]);
    expect(onCommitted).toHaveBeenCalledWith('book-1');
  });

  it('retains a failed submission for retry and denies discard while its remote operation is active', async () => {
    mocks.submit.mockRejectedValue(new Error('provider_unavailable'));
    mocks.resolve.mockRejectedValue(new Error('operation_committing'));
    const { result } = renderHook(() => useLocalBookDrafts({ user, enabled: true, onCommitted: vi.fn() }));
    await waitFor(() => expect(result.current.drafts).toHaveLength(1));
    await act(async () => { await expect(result.current.submit(draft)).rejects.toThrow('provider_unavailable'); });
    expect(result.current.draft).toEqual(draft);
    await act(async () => expect(await result.current.resolveDiscard()).toBe(false));
    expect(result.current.drafts).toHaveLength(1);
  });
});

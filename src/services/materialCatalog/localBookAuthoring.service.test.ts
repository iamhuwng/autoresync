import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock('../../core/platform/storage', () => ({
  indexedDbStore: <T>(_databaseName: string, storeName: string) => {
    const values = stores.get(storeName) ?? new Map<string, unknown>();
    stores.set(storeName, values);
    return {
      get: async (key: string) => (values.get(String(key)) as T | undefined) ?? null,
      set: async (key: string, value: T) => { values.set(String(key), value); },
      update: async (key: string, updater: (current: T | null) => T | null) => {
        const next = updater((values.get(String(key)) as T | undefined) ?? null);
        if (next === null) values.delete(String(key));
        else values.set(String(key), next);
        return next;
      },
      remove: async (key: string) => { values.delete(String(key)); },
      keys: async () => [...values.keys()],
      clear: async () => { values.clear(); },
    };
  },
}));

import {
  createLocalBookAuthoringDraft,
  discardLocalBookAuthoringDraft,
  loadLocalBookAuthoringDraft,
  listLocalBookAuthoringDrafts,
  loadLocalBookAuthoringPdf,
  saveLocalBookAuthoringDraft,
  saveLocalBookAuthoringPdf,
  replaceLocalBookAuthoringPdf,
  removeLocalBookAuthoringPdf,
  LOCAL_BOOK_AUTHORING_STORAGE,
} from './localBookAuthoring.service';

describe('localBookAuthoring.service', () => {
  beforeEach(() => stores.clear());

  it('persists metadata and PDF bytes in one owner-scoped session record', async () => {
    const draft = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf',
      title: 'Local Book',
      authors: [],
      testTypeIds: ['reading'],
      tags: [],
      visibility: 'private',
    });
    const file = new File(['%PDF-local'], 'book.pdf', { type: 'application/pdf' });
    const descriptor = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, file, 'full');

    const loaded = await loadLocalBookAuthoringDraft('teacher-1', draft.draftId);
    const loadedFile = await loadLocalBookAuthoringPdf('teacher-1', draft.draftId, descriptor);

    expect(JSON.parse(draft.pageMappingJson)).toEqual({ units: [] });
    expect(loaded?.pdfs).toEqual([descriptor]);
    expect(loaded?.revision).toBe(1);
    expect(loadedFile).toMatchObject({ name: 'book.pdf', size: file.size, type: 'application/pdf' });
    expect(await loadLocalBookAuthoringDraft('teacher-2', draft.draftId)).toBeNull();
  });

  it('discards the complete session without touching another owner', async () => {
    const first = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf', title: 'First', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });
    const second = await createLocalBookAuthoringDraft('teacher-2', {
      bookMode: 'pdf', title: 'Second', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });

    await discardLocalBookAuthoringDraft('teacher-1', first.draftId);

    expect(await loadLocalBookAuthoringDraft('teacher-1', first.draftId)).toBeNull();
    expect(await loadLocalBookAuthoringDraft('teacher-2', second.draftId)).toEqual(second);
  });

  it('merges queued field patches onto the newest stored revision', async () => {
    const draft = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf', title: 'Local Book', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });

    const first = saveLocalBookAuthoringDraft(draft, { structureJson: '{"nodes":[1]}' });
    const second = saveLocalBookAuthoringDraft(draft, { unitsJson: '{"units":[1]}' });
    const [firstSaved, secondSaved] = await Promise.all([first, second]);

    expect(firstSaved.revision).toBe(1);
    expect(secondSaved.revision).toBe(2);
    expect(secondSaved.structureJson).toBe('{"nodes":[1]}');
    expect(secondSaved.unitsJson).toBe('{"units":[1]}');
    await expect(saveLocalBookAuthoringDraft(draft)).rejects.toThrow('local_book_authoring_stale_revision');
  });

  it('keeps review state across workflow saves and clears it when a PDF changes', async () => {
    const draft = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf', title: 'Local Book', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });
    const reviewed = await saveLocalBookAuthoringDraft(draft, { reviewedUnits: { 'unit-1': true }, previewRevision: 1 });
    const workflowSaved = await saveLocalBookAuthoringDraft(reviewed, { step: 5, submission: { state: 'preparing' } });
    expect(workflowSaved.reviewedUnits).toEqual({ 'unit-1': true });

    await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['pdf'], 'book.pdf'), 'full');
    const changed = await loadLocalBookAuthoringDraft('teacher-1', draft.draftId);
    expect(changed?.reviewedUnits).toEqual({});
    expect(changed?.previewRevision).toBeUndefined();
  });

  it('persists raw imports and PDF order without changing bytes or losing a concurrently added PDF', async () => {
    const draft = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf', title: 'Components', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });
    const one = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['one'], 'one.pdf', { type: 'application/pdf' }), 'component-1');
    const two = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['two'], 'two.pdf', { type: 'application/pdf' }), 'component-2');
    const three = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['three'], 'three.pdf', { type: 'application/pdf' }), 'component-3');
    await saveLocalBookAuthoringDraft(draft, { pdfs: [two, one], structureImportText: '{unfinished', unitImportTexts: { 'unit-1': '{returned' } });
    const loaded = await loadLocalBookAuthoringDraft('teacher-1', draft.draftId);
    expect(loaded?.pdfs).toEqual([two, one, three]);
    expect(loaded?.structureImportText).toBe('{unfinished');
    expect(loaded?.unitImportTexts).toEqual({ 'unit-1': '{returned' });
    const blob = await loadLocalBookAuthoringPdf('teacher-1', draft.draftId, one);
    const bytes = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob!);
    });
    expect(bytes).toBe('one');
    await expect(saveLocalBookAuthoringDraft(draft, { pdfs: [two, two] })).rejects.toThrow('local_book_authoring_pdf_order_invalid');
    expect((await loadLocalBookAuthoringDraft('teacher-1', draft.draftId))?.pdfs).toEqual([two, one, three]);
  });

  it('reconciles a missing blob without losing the logical source mapping', async () => {
    const draft = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf', title: 'Local Book', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });
    const descriptor = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['pdf'], 'book.pdf', { type: 'application/pdf' }), 'component-1');
    const stored = await LOCAL_BOOK_AUTHORING_STORAGE.sessions.get(`teacher-1:${draft.draftId}`) as unknown as { pdfs: typeof draft.pdfs; blobs: Record<string, Blob> };
    delete stored.blobs[descriptor.blobKey];
    stored.blobs.orphan = new Blob(['orphan'], { type: 'application/pdf' });
    await LOCAL_BOOK_AUTHORING_STORAGE.sessions.set(`teacher-1:${draft.draftId}`, stored as never);

    const recovered = await loadLocalBookAuthoringDraft('teacher-1', draft.draftId);
    expect(recovered?.pdfs[0]).toMatchObject({ id: descriptor.id, sourceKey: 'component-1', storageState: 'needs-reselection' });
    expect(await loadLocalBookAuthoringPdf('teacher-1', draft.draftId, descriptor)).toBeNull();
    const repaired = await LOCAL_BOOK_AUTHORING_STORAGE.sessions.get(`teacher-1:${draft.draftId}`) as unknown as { blobs: Record<string, Blob> };
    expect(repaired.blobs).toEqual({});
  });

  it('lists healthy drafts when a separate local record is corrupt', async () => {
    const ownerId = 'list-owner';
    const healthy = await createLocalBookAuthoringDraft(ownerId, {
      bookMode: 'pdf', title: 'Healthy Book', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });
    await LOCAL_BOOK_AUTHORING_STORAGE.sessions.set(`${ownerId}:corrupt`, {
      schemaVersion: 2, draftId: 'corrupt', ownerId, pdfs: null, blobs: null,
    } as never);

    await expect(listLocalBookAuthoringDrafts(ownerId)).resolves.toEqual([healthy]);
  });

  it('replaces PDF bytes atomically while preserving descriptor identity', async () => {
    const draft = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf', title: 'Local Book', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });
    const original = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['old'], 'old.pdf', { type: 'application/pdf' }), 'component-1');
    const replacement = await replaceLocalBookAuthoringPdf(
      'teacher-1', draft.draftId, original, new File(['new'], 'new.pdf', { type: 'application/pdf' }),
    );

    expect(replacement).toMatchObject({ id: original.id, sourceKey: original.sourceKey, name: 'new.pdf', storageState: 'ready' });
    expect(replacement.blobKey).not.toBe(original.blobKey);
    expect(await loadLocalBookAuthoringPdf('teacher-1', draft.draftId, replacement)).toMatchObject({ name: 'new.pdf', size: 3 });
    expect(await loadLocalBookAuthoringPdf('teacher-1', draft.draftId, original)).toBeNull();
  });

  it('removes one PDF and its blob without touching the draft or other PDFs', async () => {
    const draft = await createLocalBookAuthoringDraft('teacher-1', {
      bookMode: 'pdf', title: 'Local Book', authors: [], testTypeIds: ['reading'], tags: [], visibility: 'private',
    });
    const first = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['one'], 'one.pdf'), 'component-1');
    const second = await saveLocalBookAuthoringPdf('teacher-1', draft.draftId, new File(['two'], 'two.pdf'), 'component-2');
    await removeLocalBookAuthoringPdf('teacher-1', draft.draftId, first);

    const loaded = await loadLocalBookAuthoringDraft('teacher-1', draft.draftId);
    expect(loaded?.pdfs).toEqual([second]);
    expect(await loadLocalBookAuthoringPdf('teacher-1', draft.draftId, first)).toBeNull();
    expect(await loadLocalBookAuthoringPdf('teacher-1', draft.draftId, second)).toMatchObject({ name: 'two.pdf' });
  });
});

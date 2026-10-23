import { indexedDbStore } from '../../core/platform/storage';
import type { MaterialBookVisibility } from '../../types/materialCatalog.types';
import type {
  BookSubmissionAuthoringPayload,
  BookSubmissionCommitReceipt,
} from './bookSubmission.contract.ts';

export type LocalBookAuthoringStep = 1 | 2 | 3 | 4 | 5;
export type LocalBookAuthoringStrategy = 'full' | 'component';
export type LocalBookSubmissionState =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'validating'
  | 'committing'
  | 'committed'
  | 'retryable'
  | 'canceled'
  | 'expired';

export interface LocalBookPdfDescriptor {
  readonly id: string;
  readonly sourceKey: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number;
  readonly blobKey: string;
  /** Missing or invalid local bytes require selecting the same logical source again. */
  readonly storageState?: 'ready' | 'needs-reselection';
}

export interface LocalBookAuthoringMetadata {
  readonly bookMode: 'pdf';
  readonly title: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly publisher?: string;
  readonly edition?: string;
  readonly series?: string;
  readonly isbn?: string;
  readonly coverUrl?: string;
  readonly testTypeIds: readonly string[];
  readonly tags: readonly string[];
  readonly description?: string;
  readonly visibility: MaterialBookVisibility;
}

export interface LocalBookSubmission {
  readonly state: LocalBookSubmissionState;
  readonly operationId?: string;
  readonly idempotencyKey?: string;
  readonly finalBookId?: string;
  readonly fingerprint?: string;
  /** Frozen, normalized inputs used by the remote operation. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly authoring?: BookSubmissionAuthoringPayload;
  readonly committedBookId?: string;
  readonly receipt?: BookSubmissionCommitReceipt;
  readonly cleanupPending?: boolean;
  readonly lastError?: string;
  /** Durable source reservations/receipts make a retry resume instead of re-uploading blindly. */
  readonly uploads?: readonly LocalBookSubmissionUpload[];
}

export interface LocalBookSubmissionUpload {
  readonly descriptorId: string;
  readonly sourceKey: string;
  readonly operationId: string;
  readonly reservationId?: string;
  readonly sourceVersionId?: string;
  readonly phase?: 'begin-pending' | 'reserved' | 'completion-pending' | 'verified';
  readonly sha256Hex?: string;
  readonly byteSize?: number;
  readonly physicalPageCount?: number;
  readonly studentSafeStatus?: 'ready';
}

export interface LocalBookAuthoringDraft {
  readonly schemaVersion: 2;
  readonly draftId: string;
  readonly ownerId: string;
  readonly metadata: LocalBookAuthoringMetadata;
  readonly strategy: LocalBookAuthoringStrategy | null;
  readonly step: LocalBookAuthoringStep;
  readonly structureJson: string;
  readonly unitsJson: string;
  readonly pageMappingJson: string;
  /** Raw external responses remain recoverable independently of validated content. */
  readonly structureImportText?: string;
  readonly unitImportTexts?: Readonly<Record<string, string>>;
  readonly validationState: 'pending' | 'ready' | 'error';
  readonly validationMessage?: string;
  readonly previewRevision?: number;
  /** Units reviewed against the current files, structure, activities, and mapping. */
  readonly reviewedUnits?: Readonly<Record<string, boolean>>;
  readonly revision: number;
  readonly pdfs: readonly LocalBookPdfDescriptor[];
  readonly submission: LocalBookSubmission;
  readonly updatedAt: string;
}

type StoredDraft = LocalBookAuthoringDraft & {
  readonly blobs: Readonly<Record<string, Blob>>;
};

const sessions = indexedDbStore<StoredDraft>('luyentap-book-authoring', 'sessions', 2, ['sessions']);
const draftKey = (ownerId: string, draftId: string) => `${ownerId}:${draftId}`;
const saveQueues = new Map<string, Promise<unknown>>();
const enqueue = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const previous = saveQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  saveQueues.set(key, next);
  return next.finally(() => {
    if (saveQueues.get(key) === next) saveQueues.delete(key);
  });
};
const makeId = (prefix: string) => `${prefix}-${typeof globalThis.crypto?.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const now = () => new Date().toISOString();
const initialStructure = '{\n  "nodes": [],\n  "units": []\n}';

const assertOwner = (draft: LocalBookAuthoringDraft, ownerId: string): void => {
  if (draft.ownerId !== ownerId) throw new Error('local_book_authoring_owner_mismatch');
  if (draft.schemaVersion !== 2) throw new Error('local_book_authoring_schema_unsupported');
};

const loadStored = async (ownerId: string, draftId: string): Promise<StoredDraft | null> => {
  const stored = await sessions.get(draftKey(ownerId, draftId));
  if (!stored || stored.ownerId !== ownerId) return null;
  assertOwner(stored, ownerId);
  if (!Array.isArray(stored.pdfs) || !stored.blobs || typeof stored.blobs !== 'object') {
    throw new Error('local_book_authoring_storage_corrupt');
  }
  const reconciled = reconcileStored(stored);
  if (!reconciled.changed) return stored;
  const repaired = await sessions.update(draftKey(ownerId, draftId), (current) => {
    if (!current) return null;
    assertOwner(current, ownerId);
    const next = reconcileStored(current);
    if (!next.changed) return current;
    return {
      ...next.value,
      revision: current.revision + 1,
      updatedAt: now(),
    };
  });
  return repaired;
};

const blobMatches = (blob: unknown, descriptor: LocalBookPdfDescriptor): blob is Blob => (
  typeof Blob !== 'undefined'
  && blob instanceof Blob
  && blob.size === descriptor.size
  && (!descriptor.type || !blob.type || blob.type === descriptor.type)
);

const reconcileStored = (stored: StoredDraft): { readonly value: StoredDraft; readonly changed: boolean } => {
  const referenced = new Set<string>();
  let changed = false;
  const pdfs = stored.pdfs.map((descriptor) => {
    const blob = stored.blobs[descriptor.blobKey];
    if (!blobMatches(blob, descriptor)) {
      if (descriptor.storageState !== 'needs-reselection') changed = true;
      return { ...descriptor, storageState: 'needs-reselection' as const };
    }
    referenced.add(descriptor.blobKey);
    if (descriptor.storageState === 'needs-reselection') {
      changed = true;
      return { ...descriptor, storageState: 'ready' as const };
    }
    return descriptor;
  });
  const blobs = Object.fromEntries(Object.entries(stored.blobs).filter(([key]) => referenced.has(key)));
  if (Object.keys(blobs).length !== Object.keys(stored.blobs).length) changed = true;
  if (!changed) return { value: stored, changed: false };
  return { value: { ...stored, pdfs, blobs }, changed: true };
};

const applyDraftPatch = (
  base: Omit<StoredDraft, 'blobs'>,
  patch: Partial<LocalBookAuthoringDraft>,
): Omit<StoredDraft, 'blobs'> => {
  const next = { ...base, ...patch };
  if (patch.pdfs) {
    const pdfs = new Map(base.pdfs.map((pdf) => [pdf.id, pdf]));
    const order = patch.pdfs.map((pdf) => pdf.id);
    if (new Set(order).size !== order.length || order.some((id) => !pdfs.has(id))) throw new Error('local_book_authoring_pdf_order_invalid');
    // Reordering cannot replace descriptors/blobs or remove concurrently added PDFs.
    next.pdfs = [...order.map((id) => pdfs.get(id)!), ...base.pdfs.filter((pdf) => !order.includes(pdf.id))];
  }
  return next;
};

export const createLocalBookAuthoringDraft = async (
  ownerId: string,
  metadata: LocalBookAuthoringMetadata,
): Promise<LocalBookAuthoringDraft> => {
  if (!ownerId.trim()) throw new Error('local_book_authoring_owner_required');
  const draft: LocalBookAuthoringDraft = {
    schemaVersion: 2,
    draftId: makeId('local-book'),
    ownerId,
    metadata,
    strategy: null,
    step: 1,
    structureJson: initialStructure,
    unitsJson: '{}',
    pageMappingJson: '{"units":[]}',
    validationState: 'pending',
    previewRevision: undefined,
    reviewedUnits: {},
    revision: 0,
    pdfs: [],
    submission: { state: 'idle' },
    updatedAt: now(),
  };
  await sessions.set(draftKey(ownerId, draft.draftId), { ...draft, blobs: {} });
  return draft;
};

export const loadLocalBookAuthoringDraft = async (
  ownerId: string,
  draftId: string,
): Promise<LocalBookAuthoringDraft | null> => {
  const stored = await loadStored(ownerId, draftId);
  if (!stored) return null;
  const { blobs: _blobs, ...draft } = stored;
  return draft;
};

export const saveLocalBookAuthoringDraft = async (
  draft: LocalBookAuthoringDraft,
  patch: Partial<LocalBookAuthoringDraft> = {},
): Promise<LocalBookAuthoringDraft> => {
  const key = draftKey(draft.ownerId, draft.draftId);
  return enqueue(key, async () => {
    const next = await sessions.update(key, (stored) => {
      if (!stored) throw new Error('local_book_authoring_not_found');
      assertOwner(stored, draft.ownerId);
      if (!Object.keys(patch).length && draft.revision < stored.revision) {
        throw new Error('local_book_authoring_stale_revision');
      }
      const reconciled = reconcileStored(stored).value;
      const { blobs: _blobs, ...base } = reconciled;
      return {
        ...(Object.keys(patch).length ? applyDraftPatch(base, patch) : { ...base, ...draft }),
        schemaVersion: 2,
        revision: stored.revision + 1,
        updatedAt: now(),
        blobs: reconciled.blobs,
      } as StoredDraft;
    });
    if (!next) throw new Error('local_book_authoring_not_found');
    const { blobs: _blobs, ...saved } = next;
    return saved;
  });
};

export const saveLocalBookAuthoringPdf = async (
  ownerId: string,
  draftId: string,
  file: File,
  sourceKey: string,
): Promise<LocalBookPdfDescriptor> => {
  return enqueue(draftKey(ownerId, draftId), async () => {
    if (!file || file.size < 1) {
      throw new Error('local_book_authoring_invalid_pdf');
    }
    const descriptor: LocalBookPdfDescriptor = {
      id: makeId('pdf'),
      sourceKey,
      name: file.name,
      size: file.size,
      type: file.type || 'application/pdf',
      lastModified: file.lastModified,
      blobKey: `${ownerId}:${draftId}:${makeId('blob')}`,
      storageState: 'ready',
    };
    const saved = await sessions.update(draftKey(ownerId, draftId), (stored) => {
      if (!stored) throw new Error('local_book_authoring_not_found');
      assertOwner(stored, ownerId);
      const reconciled = reconcileStored(stored).value;
      return {
        ...reconciled,
        revision: stored.revision + 1,
        updatedAt: now(),
        previewRevision: undefined,
        reviewedUnits: {},
        pdfs: [...reconciled.pdfs, descriptor],
        blobs: { ...reconciled.blobs, [descriptor.blobKey]: file },
      };
    });
    if (!saved) throw new Error('local_book_authoring_not_found');
    return descriptor;
  });
};

/** Replaces bytes while preserving the descriptor identity used by page mappings. */
export const replaceLocalBookAuthoringPdf = async (
  ownerId: string,
  draftId: string,
  descriptor: LocalBookPdfDescriptor,
  file: File,
): Promise<LocalBookPdfDescriptor> => enqueue(draftKey(ownerId, draftId), async () => {
  if (!file || file.size < 1) {
    throw new Error('local_book_authoring_invalid_pdf');
  }
  const replacement: LocalBookPdfDescriptor = {
    ...descriptor,
    name: file.name,
    size: file.size,
    type: file.type || 'application/pdf',
    lastModified: file.lastModified,
    blobKey: `${ownerId}:${draftId}:${makeId('blob')}`,
    storageState: 'ready',
  };
  const saved = await sessions.update(draftKey(ownerId, draftId), (stored) => {
    if (!stored) throw new Error('local_book_authoring_not_found');
    assertOwner(stored, ownerId);
    const reconciled = reconcileStored(stored).value;
    const index = reconciled.pdfs.findIndex((entry) => entry.id === descriptor.id);
    if (index < 0) throw new Error('local_book_authoring_pdf_not_found');
    const pdfs = [...reconciled.pdfs];
    pdfs[index] = replacement;
    const blobs = { ...reconciled.blobs };
    delete blobs[descriptor.blobKey];
    blobs[replacement.blobKey] = file;
    return {
      ...reconciled,
      revision: stored.revision + 1,
      updatedAt: now(),
      previewRevision: undefined,
      reviewedUnits: {},
      pdfs,
      blobs,
    };
  });
  if (!saved) throw new Error('local_book_authoring_not_found');
  return replacement;
});

export const removeLocalBookAuthoringPdf = async (
  ownerId: string,
  draftId: string,
  descriptor: Pick<LocalBookPdfDescriptor, 'id'>,
): Promise<void> => enqueue(draftKey(ownerId, draftId), async () => {
  const saved = await sessions.update(draftKey(ownerId, draftId), (stored) => {
    if (!stored) throw new Error('local_book_authoring_not_found');
    assertOwner(stored, ownerId);
    const reconciled = reconcileStored(stored).value;
    const removed = reconciled.pdfs.find((pdf) => pdf.id === descriptor.id);
    if (!removed) return stored;
    const blobs = { ...reconciled.blobs };
    delete blobs[removed.blobKey];
    return {
      ...reconciled,
      revision: stored.revision + 1,
      updatedAt: now(),
      previewRevision: undefined,
      reviewedUnits: {},
      pdfs: reconciled.pdfs.filter((pdf) => pdf.id !== descriptor.id),
      blobs,
    };
  });
  if (!saved) throw new Error('local_book_authoring_not_found');
});

export const loadLocalBookAuthoringPdf = async (
  ownerId: string,
  draftId: string,
  descriptor: LocalBookPdfDescriptor,
): Promise<File | null> => {
  const stored = await loadStored(ownerId, draftId);
  const blob = stored?.blobs[descriptor.blobKey];
  const current = stored?.pdfs.find((pdf) => pdf.id === descriptor.id);
  if (!stored || !current || current.blobKey !== descriptor.blobKey || current.storageState === 'needs-reselection'
    || !blobMatches(blob, current)) return null;
  return new File([blob], current.name, { type: current.type, lastModified: current.lastModified });
};

export const discardLocalBookAuthoringDraft = async (ownerId: string, draftId: string): Promise<void> => {
  await enqueue(draftKey(ownerId, draftId), () => sessions.remove(draftKey(ownerId, draftId)));
};

export const listLocalBookAuthoringDrafts = async (
  ownerId: string,
): Promise<readonly LocalBookAuthoringDraft[]> => {
  const keys = await sessions.keys();
  const result: LocalBookAuthoringDraft[] = [];
  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(`${ownerId}:`)) continue;
    try {
      const draft = await loadLocalBookAuthoringDraft(ownerId, key.slice(ownerId.length + 1));
      if (draft) result.push(draft);
    } catch {
      // Keep healthy drafts visible when one local record is corrupt.
    }
  }
  return result.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const LOCAL_BOOK_AUTHORING_STORAGE = { sessions };

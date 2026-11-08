import type { ReadingV2DraftId, ReadingV2DraftRecord } from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { normalizeReadingV2FirebaseDocument } from './readingV2FirebaseDocument.service';
import type { ReadingV2AuthoringContext, ReadingV2AuthoringSourceRecord } from './readingV2AuthoringQuality.service';
import {
  createReadingV2Repository,
  ReadingV2RepositoryConflictError,
  type ReadingV2DraftCreateInput,
  type ReadingV2DraftSaveInput,
} from './readingV2Repository.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2DraftFirebaseTransport {
  readonly read: (path: string) => Promise<unknown | null>;
  readonly set: (path: string, value: unknown) => Promise<void>;
  readonly getAuthenticatedUserId: () => Promise<string | null>;
}

const firebaseTransport: ReadingV2DraftFirebaseTransport = {
  read: async (path) => {
    const [{ get, ref }, { database }] = await Promise.all([import('firebase/database'), import('../firebase')]);
    const snapshot = await get(ref(database, path));
    return snapshot.exists() ? snapshot.val() : null;
  },
  set: async (path, value) => {
    const [{ set, ref }, { database }] = await Promise.all([import('firebase/database'), import('../firebase')]);
    await set(ref(database, path), value);
  },
  getAuthenticatedUserId: async () => (await import('../firebase')).auth.currentUser?.uid ?? null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const assertKey = (value: string): void => {
  if (!value || /[.#$\[\]/\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Reading V2 draft and source identities must be valid Firebase keys.');
  }
};

const serializable = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, entry: unknown) => {
  if ((typeof entry === 'number' && !Number.isFinite(entry))
    || typeof entry === 'bigint' || typeof entry === 'function' || typeof entry === 'symbol') {
    throw new Error('Reading V2 draft contains unsupported serialized data.');
  }
  return entry;
})) as T;

// RTDB omits empty containers and null-valued children, including inside arrays.
const comparableFirebaseValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  const entries = Object.entries(value).map(([key, entry]) => [key, comparableFirebaseValue(entry)] as const)
    .filter(([, entry]) => entry !== null).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? Object.fromEntries(entries) : null;
};

export const readingV2DraftContentEquals = (left: unknown, right: unknown): boolean =>
  JSON.stringify(comparableFirebaseValue(left)) === JSON.stringify(comparableFirebaseValue(right));

const conflict = (currentRevision: number): ReadingV2RepositoryConflictError =>
  new ReadingV2RepositoryConflictError({
    reason: 'stale-revision', currentRevision, recoveryOptions: ['reload-latest', 'duplicate-draft'],
  });

export const createFirebaseReadingV2DraftRepository = (
  actor: { readonly actorId: string; readonly role: 'teacher' | 'super_admin' },
  transport: ReadingV2DraftFirebaseTransport = firebaseTransport,
) => {
  const assertActor = async (): Promise<void> => {
    if (!actor.actorId || !['teacher', 'super_admin'].includes(actor.role)
      || await transport.getAuthenticatedUserId() !== actor.actorId) {
      throw new Error('Reading V2 draft access requires the authenticated teacher session.');
    }
  };

  const assertOwner = (ownerId: string): void => {
    if (!ownerId || (ownerId !== actor.actorId && actor.role !== 'super_admin')) {
      throw new Error('Reading V2 draft is owned by another teacher.');
    }
  };

  const loadSource = async (sourceId: string): Promise<ReadingV2AuthoringSourceRecord | null> => {
    assertKey(sourceId);
    await assertActor();
    const value = await transport.read(readingV2StoragePaths.provenance(sourceId));
    if (value === null) return null;
    if (!isRecord(value) || value.kind !== 'reading-v2-import-source' || value.schemaVersion !== 1
      || value.sourceId !== sourceId || typeof value.ownerId !== 'string' || typeof value.createdAt !== 'string'
      || typeof value.rawText !== 'string' || !['pasted-text', 'uploaded-file', 'auto-gemini'].includes(String(value.sourceKind))
      || (value.lineIndex !== undefined && !Array.isArray(value.lineIndex))) {
      throw new Error('Reading V2 stored authoring source is malformed.');
    }
    assertOwner(value.ownerId);
    return structuredClone({ ...value, lineIndex: value.lineIndex ?? [] }) as unknown as ReadingV2AuthoringSourceRecord;
  };

  const storeSource = async (record: ReadingV2AuthoringSourceRecord): Promise<ReadingV2AuthoringSourceRecord> => {
    assertKey(record.sourceId);
    await assertActor();
    assertOwner(record.ownerId);
    if (record.kind !== 'reading-v2-import-source' || record.schemaVersion !== 1
      || !record.createdAt || typeof record.rawText !== 'string' || !Array.isArray(record.lineIndex)
      || !['pasted-text', 'uploaded-file', 'auto-gemini'].includes(record.sourceKind)) {
      throw new Error('Reading V2 authoring source is malformed.');
    }
    const captured = serializable(record);
    const existing = await loadSource(captured.sourceId);
    if (existing) {
      if (readingV2DraftContentEquals(existing, captured)) return existing;
      throw new Error('Reading V2 authoring source is immutable.');
    }
    try {
      await transport.set(readingV2StoragePaths.provenance(captured.sourceId), captured);
      return structuredClone(captured);
    } catch (error) {
      let current: ReadingV2AuthoringSourceRecord | null;
      try { current = await loadSource(captured.sourceId); } catch { throw error; }
      if (current && readingV2DraftContentEquals(current, captured)) return current;
      throw error;
    }
  };

  const assertSource = async (context: ReadingV2AuthoringContext | undefined, ownerId: string): Promise<void> => {
    if (!context) return;
    const sourceIds = new Set<string>();
    if (context.origin.kind === 'import') sourceIds.add(context.origin.sourceId);
    context.requirements.forEach((requirement) => sourceIds.add(requirement.sourceId));
    for (const sourceId of sourceIds) {
      const source = await loadSource(sourceId);
      if (!source || source.ownerId !== ownerId) throw new Error('Reading V2 draft requires its owned immutable source.');
    }
  };

  const loadDraft = async (draftId: ReadingV2DraftId): Promise<ReadingV2DraftRecord | null> => {
    assertKey(draftId);
    await assertActor();
    const value = await transport.read(readingV2StoragePaths.drafts(draftId));
    if (value === null) return null;
    if (!isRecord(value) || value.draftId !== draftId || typeof value.ownerId !== 'string'
      || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
      || typeof value.lastOperationId !== 'string' || !value.lastOperationId
      || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
      || !['draft', 'needs-review', 'ready-to-publish', 'superseded', 'discarded'].includes(String(value.state))
      || !isRecord(value.document)
      || (value.authoringContext !== undefined && (!isRecord(value.authoringContext)
        || !isRecord(value.authoringContext.origin) || !isRecord(value.authoringContext.scope)
        || (value.authoringContext.requirements !== undefined && !Array.isArray(value.authoringContext.requirements))
        || (value.authoringContext.interpretations !== undefined && !Array.isArray(value.authoringContext.interpretations))
        || (value.authoringContext.unboundTargets !== undefined && !Array.isArray(value.authoringContext.unboundTargets))))) {
      throw new Error('Reading V2 stored draft is malformed.');
    }
    assertOwner(value.ownerId);
    const context = value.authoringContext as ReadingV2AuthoringContext | undefined;
    const draft = {
      ...value,
      document: normalizeReadingV2FirebaseDocument(value.document as unknown as ReadingV2DraftRecord['document']),
      ...(context ? { authoringContext: {
        ...context,
        scope: { ...context.scope, requirementIds: context.scope?.requirementIds ?? [] },
        requirements: (context.requirements ?? []).map((requirement) => ({ ...requirement, lineIds: requirement.lineIds ?? [] })),
        interpretations: context.interpretations ?? [], unboundTargets: context.unboundTargets ?? [],
      } } : {}),
    } as unknown as ReadingV2DraftRecord;
    assertValidReadingV2CanonicalDocument(draft.document);
    await assertSource(draft.authoringContext, draft.ownerId);
    return structuredClone(draft);
  };

  const writeCapturedDraft = async (draft: ReadingV2DraftRecord): Promise<ReadingV2DraftRecord> => {
    const captured = serializable(draft);
    await assertActor();
    await assertSource(captured.authoringContext, captured.ownerId);
    try {
      await transport.set(readingV2StoragePaths.drafts(captured.draftId), captured);
      return structuredClone(captured);
    } catch (error) {
      let current: ReadingV2DraftRecord | null;
      try { current = await loadDraft(captured.draftId); } catch { throw error; }
      if (current?.revision === captured.revision && current.lastOperationId === captured.lastOperationId
        && readingV2DraftContentEquals(current, captured)) return current;
      if (current && current.revision >= captured.revision) throw conflict(current.revision);
      throw error;
    }
  };

  const createDraft = async (input: ReadingV2DraftCreateInput & { readonly operationId: string }): Promise<ReadingV2DraftRecord> => {
    assertKey(input.draftId);
    assertKey(input.operationId);
    await assertActor();
    assertOwner(input.ownerId);
    const captured = createReadingV2Repository().createDraft(serializable(input));
    const current = await loadDraft(input.draftId);
    if (current) {
      if (readingV2DraftContentEquals(current, captured)) return current;
      throw conflict(current.revision);
    }
    return writeCapturedDraft(captured);
  };

  const saveDraft = async (input: ReadingV2DraftSaveInput & { readonly operationId: string }): Promise<ReadingV2DraftRecord> => {
    assertKey(input.operationId);
    const capturedInput = serializable(input);
    const current = await loadDraft(capturedInput.draftId);
    if (!current) throw new Error(`Reading V2 draft does not exist: ${capturedInput.draftId}`);
    if (current.authoringContext?.origin.kind === 'import') {
      const nextContext = capturedInput.authoringContext ?? current.authoringContext;
      if (nextContext.origin.kind !== 'import' || nextContext.origin.sourceId !== current.authoringContext.origin.sourceId
        || current.authoringContext.requirements.some((requirement) => !nextContext.requirements.some((entry) => entry.requirementId === requirement.requirementId))) {
        throw new Error('Keep the imported source and its requirements. Correct the affected content or its source interpretation.');
      }
    }
    if (current.lastOperationId === capturedInput.operationId) {
      if (current.revision === capturedInput.expectedRevision + 1
        && readingV2DraftContentEquals(current.document, capturedInput.document)
        && (capturedInput.studioMetadata === undefined || readingV2DraftContentEquals(current.studioMetadata, capturedInput.studioMetadata))
        && (capturedInput.authoringContext === undefined || readingV2DraftContentEquals(current.authoringContext, capturedInput.authoringContext))
        && (capturedInput.workflowOrigin === undefined || readingV2DraftContentEquals(current.workflowOrigin, capturedInput.workflowOrigin))
        && (capturedInput.state === undefined || current.state === capturedInput.state)) return current;
      throw new Error('Reading V2 operation identity was reused for changed draft content.');
    }
    const planner = createReadingV2Repository();
    planner.store.drafts.set(current.draftId, current);
    return writeCapturedDraft(planner.saveDraft(capturedInput));
  };

  return { createDraft, loadDraft, saveDraft, storeSource, loadSource };
};

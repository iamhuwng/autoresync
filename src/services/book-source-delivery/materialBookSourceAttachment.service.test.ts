import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import type { SourceSetCandidate } from '../../types/bookAssembly.types';
import {
  createMaterialBookSourceAttachmentService,
  type AttachMaterialBookSourceInput,
  type MaterialBookSourceAttachmentBook,
  type MaterialBookSourceAttachmentRepository,
  type MaterialBookSourceAttachmentScope,
  type MaterialBookSourceAttachmentTransaction,
} from './materialBookSourceAttachment.service';

const full = (sourceVersionId = 'source-v1'): SourceSetCandidate => ({
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId, sourceOrder: 1 }],
});

const component = (): SourceSetCandidate => ({
  sourceStrategy: 'component_pdfs',
  sources: [
    { sourceKey: 'unit-1', sourceVersionId: 'source-v2', sourceOrder: 1, ownerNodeKey: 'unit-1' },
    { sourceKey: 'unit-2', sourceVersionId: 'source-v3', sourceOrder: 2, ownerNodeKey: 'unit-1' },
  ],
});

const book = (overrides: Partial<MaterialBookSourceAttachmentBook> = {}): MaterialBookSourceAttachmentBook => ({
  bookId: 'book-1',
  bookMode: 'pdf',
  ownerId: 'teacher-1',
  title: 'PDF Book',
  authors: [],
  testTypeIds: [],
  tags: [],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  bookRevision: 0,
  sourceSetRevision: 0,
  sourceSet: null,
  ...overrides,
});

const projection = (
  sourceVersionId: string,
  verifiedUsable = true,
  purpose: 'book-source' | 'student-document' = 'book-source',
  studentSafeStatus: 'unreviewed' | 'review-required' | 'ready' | 'rejected' = 'ready',
) => ({
  sourceKey: sourceVersionId === 'source-v1' ? 'full' : sourceVersionId === 'source-v2' ? 'unit-1' : 'unit-2',
  sourceVersionId,
  bookId: 'book-1',
  checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
  purpose,
  studentSafeStatus,
  ...(studentSafeStatus === 'unreviewed' ? {} : {
    studentSafeDecision: {
      decidedBy: 'teacher-1',
      decidedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId,
      sha256Hex: 'a'.repeat(64),
      reasonCode: 'teacher-reviewed' as const,
    },
  }),
  physicalPageCount: 12,
  verifiedUsable,
});

class InMemoryAttachmentRepository implements MaterialBookSourceAttachmentRepository {
  constructor(public scope: MaterialBookSourceAttachmentScope) {}

  async transaction<T>(input: MaterialBookSourceAttachmentTransaction<T>): Promise<T> {
    const current = structuredClone(this.scope);
    // The service also checks these revisions in the callback. Keeping the
    // guard here models the repository's atomic CAS responsibility.
    const currentBook = current.book;
    if (currentBook
      && (currentBook.bookRevision !== input.expectedBookRevision
        || currentBook.sourceSetRevision !== input.expectedSourceSetRevision)) {
      // The callback returns the typed stale conflict without writing.
      return input.mutate(current).outcome;
    }
    const mutation = input.mutate(current);
    if (mutation.write) this.scope = structuredClone(mutation.next ?? current);
    return mutation.outcome;
  }
}

const input = (sourceSet: SourceSetCandidate = full()): AttachMaterialBookSourceInput => ({
  ownerId: 'teacher-1',
  bookId: 'book-1',
  operationId: 'operation-1',
  expectedBookRevision: 0,
  expectedSourceSetRevision: 0,
  sourceSet,
});

const repository = (overrides: Partial<MaterialBookSourceAttachmentScope> = {}) => new InMemoryAttachmentRepository({
  book: book(),
  sourceVersionProjections: {
    'source-v1': projection('source-v1'),
    'source-v2': projection('source-v2'),
    'source-v3': projection('source-v3'),
  },
  operations: {},
  ...overrides,
});

describe('Material Book source attachment', () => {
  it('replays the exact component activation after a lost response and conflicts changed input', async () => {
    const store = repository();
    const service = createMaterialBookSourceAttachmentService(store);
    const command: AttachMaterialBookSourceInput = {
      ...input(component()),
      operationId: 'component-activation-0000000000000001',
      activation: {
        unitCandidates: [{ unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 1, manifestFingerprint: 'a'.repeat(64) }],
        studentDocument: { sourceVersionId: 'student-v1', descriptorRevision: 1, descriptorFingerprint: 'b'.repeat(64) },
        activities: [],
        activatedAt: '2026-09-22T00:00:00.000Z',
      },
    };
    const committed = await service.replace(command);
    expect(committed).toMatchObject({ status: 'attached', bookRevision: 1, sourceSetRevision: 1 });
    await expect(service.replace(command)).resolves.toEqual({ ...committed, status: 'replayed' });
    await expect(service.replace({ ...command, activation: { ...command.activation!, activatedAt: '2026-09-22T00:00:01.000Z' } }))
      .resolves.toMatchObject({ status: 'conflict', reason: 'idempotency-conflict' });
    expect(store.scope.book).toMatchObject({ bookRevision: 1, sourceSetRevision: 1, setupActivations: [{ operationId: command.operationId }] });
  });

  it('attaches an exact trusted Source Set and increments both revisions atomically', async () => {
    const store = repository();
    const result = await createMaterialBookSourceAttachmentService(store).attach(input());

    expect(result.status).toBe('attached');
    expect(result.bookRevision).toBe(1);
    expect(result.sourceSetRevision).toBe(1);
    expect(store.scope.book).toEqual(expect.objectContaining({
      status: 'ready',
      sourceSet: full(),
      bookRevision: 1,
      sourceSetRevision: 1,
    }));
    expect(store.scope.operations?.['operation-1']).toEqual(expect.objectContaining({
      operationId: 'operation-1',
      fingerprint: result.fingerprint,
      status: 'attached',
    }));
  });

  it('rejects component replacement without the trusted activation payload', async () => {
    const store = repository({ book: book({ sourceSet: full(), bookRevision: 4, sourceSetRevision: 3 }) });
    const result = await createMaterialBookSourceAttachmentService(store).replace({
      ...input(component()),
      operationId: 'operation-replace',
      expectedBookRevision: 4,
      expectedSourceSetRevision: 3,
    });

    expect(result).toMatchObject({ status: 'forbidden', reason: 'activation-required' });
    expect(store.scope.book).toEqual(book({ sourceSet: full(), bookRevision: 4, sourceSetRevision: 3 }));
  });

  it('treats changed expected revisions as an idempotency conflict', async () => {
    const store = repository();
    const service = createMaterialBookSourceAttachmentService(store);
    const first = await service.attach(input());
    const replay = await service.attach({ ...input(), expectedBookRevision: 99, expectedSourceSetRevision: 99 });

    expect(first.status).toBe('attached');
    expect(replay).toMatchObject({ status: 'conflict', reason: 'idempotency-conflict' });
    expect(store.scope.book).toEqual(expect.objectContaining({
      status: 'ready',
      bookRevision: 1,
      sourceSetRevision: 1,
    }));
  });

  it('reconciles a same-source non-ready Book through the normal replacement mutation', async () => {
    const store = repository({
      book: book({ status: 'draft-in-progress', sourceSet: full(), bookRevision: 1, sourceSetRevision: 1 }),
    });
    const result = await createMaterialBookSourceAttachmentService(store).attach({
      ...input(),
      operationId: 'operation-reconcile',
      expectedBookRevision: 1,
      expectedSourceSetRevision: 1,
    });

    expect(result).toMatchObject({ status: 'replaced', bookRevision: 2, sourceSetRevision: 2 });
    expect(store.scope.book).toEqual(expect.objectContaining({
      status: 'ready',
      sourceSet: full(),
      bookRevision: 2,
      sourceSetRevision: 2,
    }));
  });

  it('returns idempotency conflict for the same operation id with a different payload', async () => {
    const store = repository();
    const service = createMaterialBookSourceAttachmentService(store);
    await service.attach(input());
    const result = await service.attach({ ...input(), ownerId: 'teacher-2', expectedBookRevision: 1, expectedSourceSetRevision: 1 });

    expect(result.status).toBe('conflict');
    expect(result.reason).toBe('idempotency-conflict');
  });

  it('returns stale conflict when either expected revision is no longer current', async () => {
    const store = repository({ book: book({ bookRevision: 2, sourceSetRevision: 7 }) });
    const result = await createMaterialBookSourceAttachmentService(store).attach(input());

    expect(result.status).toBe('conflict');
    expect(result.reason).toBe('stale-revision');
    expect(store.scope.book).toEqual(book({ bookRevision: 2, sourceSetRevision: 7 }));
  });

  it('forbids an owner mismatch without writing', async () => {
    const store = repository();
    const result = await createMaterialBookSourceAttachmentService(store).attach({
      ...input(),
      ownerId: 'other-teacher',
    });

    expect(result.status).toBe('forbidden');
    expect(result.reason).toBe('wrong-owner');
    expect(store.scope.book?.sourceSet).toBeNull();
  });

  it('rejects an unverified or provider-bearing projection', async () => {
    const unverified = repository({
      sourceVersionProjections: { 'source-v1': projection('source-v1', false) },
    });
    const unverifiedResult = await createMaterialBookSourceAttachmentService(unverified).attach(input());
    expect(unverifiedResult.status).toBe('conflict');
    expect(unverifiedResult.reason).toBe('unverified-source');

    const providerBearing = repository({
      sourceVersionProjections: {
        'source-v1': { ...projection('source-v1'), providerObjectKey: 'private.pdf' } as never,
      },
    });
    const providerResult = await createMaterialBookSourceAttachmentService(providerBearing).attach(input());
    expect(providerResult.status).toBe('conflict');
    expect(providerResult.reason).toBe('invalid-source-projection');
  });

  it('rejects a student-document projection from private Book attachment', async () => {
    const store = repository({
      sourceVersionProjections: {
        'source-v1': projection('source-v1', true, 'student-document'),
      },
    });
    const result = await createMaterialBookSourceAttachmentService(store).attach(input());
    expect(result).toMatchObject({ status: 'conflict', reason: 'unverified-source' });
    expect(store.scope.book?.sourceSet).toBeNull();
  });

  it('rejects a candidate source key that differs from trusted projection authority', async () => {
    const source = full();
    const result = await createMaterialBookSourceAttachmentService(repository()).attach({
      ...input(),
      sourceSet: {
        ...source,
        sources: [{ ...source.sources[0], sourceKey: 'alias' }],
      },
    });

    expect(result).toMatchObject({ status: 'conflict', reason: 'source-identity-mismatch' });
  });

  it.each([
    ['missing checksum', (value: Record<string, unknown>) => {
      const { checksum: _checksum, ...withoutChecksum } = value;
      return withoutChecksum;
    }],
    ['decision checksum mismatch', (value: Record<string, unknown>) => ({
      ...value,
      studentSafeDecision: {
        ...(value.studentSafeDecision as Record<string, unknown>),
        sha256Hex: 'b'.repeat(64),
      },
    })],
  ] as const)('rejects %s in a trusted projection', async (_label, mutate) => {
    const source = projection('source-v1') as Record<string, unknown>;
    const store = repository({
      sourceVersionProjections: { 'source-v1': mutate(source) },
    });
    const result = await createMaterialBookSourceAttachmentService(store).attach(input());
    expect(result).toMatchObject({ status: 'conflict', reason: 'invalid-source-projection' });
    expect(store.scope.book?.sourceSet).toBeNull();
  });

  it.each([
    ['one component', [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' }]],
    ['twenty-one components', Array.from({ length: 21 }, (_, index) => ({
      sourceKey: `source-${index + 1}`,
      sourceVersionId: `version-${index + 1}`,
      sourceOrder: index + 1,
      ownerNodeKey: 'unit-1',
    }))],
    ['a gap', [
      { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 3, ownerNodeKey: 'unit-1' },
    ]],
    ['duplicate source key', [
      { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'a', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
    ]],
    ['duplicate source version', [
      { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'b', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
    ]],
    ['reordered orders', [
      { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
      { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
    ]],
    ['full PDF with zero sources', []],
    ['full PDF with two sources', [
      { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1 },
      { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2 },
    ]],
    ['full PDF with non-one order', [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 2 }]],
  ] as const)('rejects %s Source Set at the attachment seam', async (_label, sources) => {
    const sourceStrategy = _label.startsWith('full PDF') ? 'full_pdf' : 'component_pdfs';
    const store = repository();
    const result = await createMaterialBookSourceAttachmentService(store).attach(input({
      sourceStrategy,
      sources,
    } as never));
    expect(result).toMatchObject({ status: 'invalid', reason: 'invalid-input' });
    expect(store.scope.book?.sourceSet).toBeNull();
  });
});

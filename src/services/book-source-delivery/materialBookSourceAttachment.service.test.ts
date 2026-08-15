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
  sources: [{
    sourceKey: 'unit-1', sourceVersionId: 'source-v2', sourceOrder: 1, ownerNodeKey: 'unit-1',
  }],
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

const projection = (sourceVersionId: string, verifiedUsable = true) => ({
  sourceVersionId,
  bookId: 'book-1',
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
  },
  operations: {},
  ...overrides,
});

describe('Material Book source attachment', () => {
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

  it('replaces the current Source Set and increments from the current revisions', async () => {
    const store = repository({ book: book({ sourceSet: full(), bookRevision: 4, sourceSetRevision: 3 }) });
    const result = await createMaterialBookSourceAttachmentService(store).replace({
      ...input(component()),
      operationId: 'operation-replace',
      expectedBookRevision: 4,
      expectedSourceSetRevision: 3,
    });

    expect(result.status).toBe('replaced');
    expect(result.bookRevision).toBe(5);
    expect(result.sourceSetRevision).toBe(4);
    expect(store.scope.book).toEqual(expect.objectContaining({
      status: 'ready',
      sourceSet: component(),
    }));
  });

  it('replays the same operation/fingerprint without requiring current revisions', async () => {
    const store = repository();
    const service = createMaterialBookSourceAttachmentService(store);
    const first = await service.attach(input());
    const replay = await service.attach({ ...input(), expectedBookRevision: 99, expectedSourceSetRevision: 99 });

    expect(replay.status).toBe('replayed');
    expect(replay.fingerprint).toBe(first.fingerprint);
    expect(replay.receipt).toEqual(first.receipt);
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
    const result = await service.attach({ ...input(component()), expectedBookRevision: 1, expectedSourceSetRevision: 1 });

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
});

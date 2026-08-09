import type {
  PublicBookEntitlementSnapshot,
  PublicBookReferenceForkStore,
  PublicBookReferencePlacementRecord,
  PublicBookReferenceRecord,
  PublicBookSelectionSnapshot,
  PublicBookTargetBookSnapshot,
} from './publicBookReferenceFork.types';

const clone = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

export interface InMemoryPublicBookReferenceForkState {
  readonly publicBooks?: Readonly<Record<string, PublicBookSelectionSnapshot>>;
  readonly targetBooks?: Readonly<Record<string, PublicBookTargetBookSnapshot>>;
  readonly entitlements?: Readonly<Record<string, PublicBookEntitlementSnapshot>>;
  readonly currentReferences?: Readonly<Record<string, PublicBookReferenceRecord>>;
  readonly referenceRevisions?: Readonly<Record<string, Readonly<Record<string, PublicBookReferenceRecord>>>>;
  readonly placements?: Readonly<Record<string, PublicBookReferencePlacementRecord>>;
}

export interface InMemoryPublicBookReferenceForkStore
  extends PublicBookReferenceForkStore {
  snapshot(): InMemoryPublicBookReferenceForkState;
  replacePublicBook(book: PublicBookSelectionSnapshot): void;
  replaceTargetBook(book: PublicBookTargetBookSnapshot): void;
}

export const createInMemoryPublicBookReferenceForkStore = (
  initial: InMemoryPublicBookReferenceForkState = {},
): InMemoryPublicBookReferenceForkStore => {
  const publicBooks = new Map(Object.entries(initial.publicBooks ?? {}).map(([key, value]) => [key, clone(value)]));
  const targetBooks = new Map(Object.entries(initial.targetBooks ?? {}).map(([key, value]) => [key, clone(value)]));
  const entitlements = new Map(Object.entries(initial.entitlements ?? {}).map(([key, value]) => [key, clone(value)]));
  const currentReferences = new Map(Object.entries(initial.currentReferences ?? {}).map(([key, value]) => [key, clone(value)]));
  const referenceRevisions = new Map<string, Map<number, PublicBookReferenceRecord>>();
  for (const [referenceId, revisions] of Object.entries(initial.referenceRevisions ?? {})) {
    referenceRevisions.set(
      referenceId,
      new Map(Object.entries(revisions).map(([revision, value]) => [Number(revision), clone(value)])),
    );
  }
  const placements = new Map(Object.entries(initial.placements ?? {}).map(([key, value]) => [key, clone(value)]));
  const operations = new Map<string, 'reference'>();

  const saveReference = (reference: PublicBookReferenceRecord): void => {
    const revisions = referenceRevisions.get(reference.referenceId) ?? new Map();
    const current = currentReferences.get(reference.referenceId);
    if (current && reference.revision !== current.revision + 1) {
      throw new Error('public_book_reference_revision_conflict');
    }
    if (!current && reference.revision !== 1) {
      throw new Error('public_book_reference_revision_conflict');
    }
    revisions.set(reference.revision, clone(reference));
    referenceRevisions.set(reference.referenceId, revisions);
    currentReferences.set(reference.referenceId, clone(reference));
  };

  return {
    async readPublicBook(bookId) {
      return clone(publicBooks.get(bookId) ?? null);
    },
    async readTargetBook(bookId) {
      return clone(targetBooks.get(bookId) ?? null);
    },
    async readEntitlement(input) {
      const entitlement = entitlements.get(input.studentId + ':' + input.entitlementId);
      return clone(entitlement ?? null);
    },
    async readCurrentReference(referenceId) {
      return clone(currentReferences.get(referenceId) ?? null);
    },
    async readReferenceRevision(referenceId, revision) {
      return clone(referenceRevisions.get(referenceId)?.get(revision) ?? null);
    },
    async writeReferenceMutation(input) {
      if (operations.has(input.operationId)) return;
      saveReference(input.reference);
      placements.set(
        input.placement.target.bookId + ':' + input.placement.target.nodeId + ':' + input.placement.target.placementId,
        clone(input.placement),
      );
      operations.set(input.operationId, 'reference');
    },
    snapshot: () => ({
      publicBooks: Object.fromEntries([...publicBooks.entries()].map(([key, value]) => [key, clone(value)])),
      targetBooks: Object.fromEntries([...targetBooks.entries()].map(([key, value]) => [key, clone(value)])),
      entitlements: Object.fromEntries([...entitlements.entries()].map(([key, value]) => [key, clone(value)])),
      currentReferences: Object.fromEntries([...currentReferences.entries()].map(([key, value]) => [key, clone(value)])),
      referenceRevisions: Object.fromEntries([...referenceRevisions.entries()].map(([key, values]) => [
        key,
        Object.fromEntries([...values.entries()].map(([revision, value]) => [String(revision), clone(value)])),
      ])),
      placements: Object.fromEntries([...placements.entries()].map(([key, value]) => [key, clone(value)])),
    }),
    replacePublicBook: (book) => {
      publicBooks.set(book.bookId, clone(book));
    },
    replaceTargetBook: (book) => {
      targetBooks.set(book.bookId, clone(book));
    },
  };
};

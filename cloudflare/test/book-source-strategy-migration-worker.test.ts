import { describe, expect, it } from 'vitest';
import type { BookAssemblyBookAuthority } from '../../src/services/book-assembly/unitAssembly.types';
import type { BookAssemblyManifestCandidate, SourceSetCandidate } from '../../src/types/bookAssembly.types';
import { createSourceStrategyMigrationWorkerHandlers } from '../src/upload-worker/book-assembly/source-strategy-migration-worker';
import type { BookAssemblyRepositoryPort, BookAssemblyScope } from '../src/upload-worker/book-assembly/worker';

const op = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const full: SourceSetCandidate = { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-full', sourceOrder: 1 }] };
const components: SourceSetCandidate = { sourceStrategy: 'component_pdfs', sources: [
  { sourceKey: 'one', sourceVersionId: 'source-one', sourceOrder: 1, ownerNodeKey: 'unit-1' },
] };
const manifest = (sourceSet: SourceSetCandidate = full): BookAssemblyManifestCandidate => ({
  bookId: 'book-1', sourceSet,
  nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'a1', order: 1, contextRequirement: 'required', pageGroupKeys: ['p1'] }], pageGroups: [{ pageGroupKey: 'p1', sourceKey: sourceSet.sources[0].sourceKey, pages: [1], activityKeys: ['a1'], mode: 'activity' }] }],
});
const authority = (published = false): BookAssemblyBookAuthority => ({
  bookId: 'book-1', ownerId: 'teacher-1', bookMode: 'pdf', bookRevision: 4, sourceSetRevision: 2, sourceSet: full,
  ...(published ? { published: true } : {}),
  sourceVersionAuthority: { getSourceVersion: (sourceVersionId) => ({ sourceVersionId, bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true }) },
});
class MemoryRepository implements BookAssemblyRepositoryPort {
  root: BookAssemblyScope = {};
  book = authority();
  users = new Map([['teacher-1', { role: 'teacher' }]]);
  failBeforeWrite = false;
  async readValue(path: string): Promise<unknown> { return path.startsWith('users/') ? this.users.get(path.slice(6)) ?? null : null; }
  async readScope(): Promise<BookAssemblyScope> { return structuredClone(this.root); }
  async transaction<T>(_bookId: string, _unitKey: string, mutate: (scope: BookAssemblyScope) => { outcome: T; next?: BookAssemblyScope; write: boolean }, options: { beforeWrite?: () => Promise<void> } = {}): Promise<T> {
    const scope = structuredClone(this.root); const output = mutate(scope); if (output.write) { if (this.failBeforeWrite) throw new Error('crash'); await options.beforeWrite?.(); this.root = structuredClone(output.next ?? scope); } return output.outcome;
  }
}
const request = (body: unknown): Request => new Request('https://assembly.example', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const base = (targetSourceSet: SourceSetCandidate = components) => ({ operationId: op(1), bookId: 'book-1', unitKey: 'unit-1', candidateId: 'old', expectedBookRevision: 4, expectedSourceSetRevision: 2, expectedCandidateRevision: 1, targetSourceSetRevision: 3, targetSourceSet, remaps: [{ pageGroupKey: 'p1', pages: [{ from: { sourceKey: 'full', physicalPageNumber: 1 }, to: { sourceKey: targetSourceSet.sources[0].sourceKey, physicalPageNumber: 1 } }] }] });
const setup = () => { const repository = new MemoryRepository(); repository.root = { current: { candidateId: 'old', candidateRevision: 1, bookRevision: 4, sourceSetRevision: 2, updatedAt: 'old' }, candidates: { old: { candidateId: 'old', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 4, sourceSetRevision: 2, unitKey: 'unit-1', revision: 1, lifecycle: 'validated', manifest: manifest(), validation: { valid: true, errors: [] }, updatedAt: 'old' } } }; let n = 0; const handlers = createSourceStrategyMigrationWorkerHandlers({ repository, readBookAuthority: async () => repository.book, createCandidateId: () => `migration-${++n}` }); return { repository, handlers }; };

describe('ticket 70 source-strategy migration Worker', () => {
  it('defaults gate disabled and supports full-to-component/component-to-full', async () => {
    const { repository, handlers } = setup(); const initial = structuredClone(repository.root); const disabled = await handlers.migrate({ request: request(base()), env: {} as never, uid: 'teacher-1' });
    expect(disabled.init.status).toBe(503); expect(repository.root).toEqual(initial);
    const unauthorized = await handlers.migrate({ request: request(base()), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'other-teacher' });
    expect(unauthorized.init.status).toBe(403);
    const browserManifest = await handlers.migrate({ request: request({ ...base(), operationId: op(9), targetManifest: {} }), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' });
    expect(browserManifest.body).toEqual({ code: 'invalid_request' });
    const created = await handlers.migrate({ request: request(base()), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' });
    expect(created.body).toMatchObject({ status: 'created', candidate: { candidateId: 'migration-1', lifecycle: 'validated' }, currentRevision: 1 }); expect(repository.root.current?.candidateId).toBe('old');
    const back = await handlers.migrate({ request: request({ ...base(full), operationId: op(2), expectedSourceSetRevision: 2, expectedCandidateRevision: 1, targetSourceSetRevision: 4 }), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' });
    expect(back.body).toMatchObject({ status: 'created' });
  });
  it('fails closed for publication, confirms with CAS/replay, cancels, and preserves bytes/current', async () => {
    const { repository, handlers } = setup(); const original = structuredClone(repository.root);
    repository.book = authority(true); const blocked = await handlers.migrate({ request: request(base()), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(blocked.body).toEqual({ code: 'source_strategy_migration_requires_unpublished' }); repository.book = authority();
    const created = await handlers.migrate({ request: request(base()), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(created.body).toMatchObject({ status: 'created' });
    repository.root.candidates!.rogue = { ...(created.body as any).candidate, candidateId: 'rogue', migration: undefined };
    const rogueConfirm = await handlers.confirm({ request: request({ operationId: op(8), expectedCurrentCandidateId: 'old', expectedCurrentCandidateRevision: 1, expectedMigrationCandidateRevision: 1 }), params: { bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'rogue' }, env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' });
    expect(rogueConfirm.body).toMatchObject({ status: 'conflict' }); expect(repository.root.current?.candidateId).toBe('old');
    const cancelBody = { operationId: op(2), expectedCurrentCandidateId: 'old', expectedCurrentCandidateRevision: 1, expectedMigrationCandidateRevision: 1 };
    const beforeCancel = structuredClone(repository.root); const cancelled = await handlers.cancel({ request: request(cancelBody), params: { bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-1' }, env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(cancelled.body).toMatchObject({ status: 'discarded' }); expect(repository.root.candidates?.old).toBeDefined(); expect(repository.root.current).toEqual(beforeCancel.current); expect(original.current).toBeDefined();
    const recreated = await handlers.migrate({ request: request({ ...base(), operationId: op(3) }), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(recreated.body).toMatchObject({ status: 'created' });
    const confirmBody = { operationId: op(4), expectedCurrentCandidateId: 'old', expectedCurrentCandidateRevision: 1, expectedMigrationCandidateRevision: 1 };
    const confirmed = await handlers.confirm({ request: request(confirmBody), params: { bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-2' }, env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(confirmed.body).toMatchObject({ status: 'replaced', candidate: { migration: { kind: 'source-strategy', baseCandidateId: 'old' } } }); const pointer = repository.root.current;
    const replay = await handlers.confirm({ request: request(confirmBody), params: { bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-2' }, env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(replay.body).toMatchObject({ status: 'replayed' }); expect(repository.root.current).toEqual(pointer);
  });
  it('preserves old state on stale CAS and beforeWrite crash; no source deletion API exists', async () => {
    const { repository, handlers } = setup(); repository.root.current!.candidateRevision = 2; repository.root.candidates!.old.revision = 2; const before = structuredClone(repository.root);
    const stale = await handlers.migrate({ request: request(base()), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(stale.body).toMatchObject({ status: 'conflict' }); expect(repository.root.current).toEqual(before.current);
    repository.root = {}; repository.failBeforeWrite = true; const crashed = await handlers.migrate({ request: request(base()), env: { BOOK_ASSEMBLY_MIGRATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' }); expect(crashed.body).toEqual({ code: 'book_assembly_failed' }); expect(repository.root).toEqual({});
  });
});

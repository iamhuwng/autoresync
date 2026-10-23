import { describe, expect, it } from 'vitest';
import type { BookAssemblyBookAuthority, BookAssemblyCandidateRecord } from '../../src/services/book-assembly/unitAssembly.types';
import type { BookAssemblyManifestCandidate } from '../../src/types/bookAssembly.types';
import {
  createBookAssemblyWorkerHandlers,
} from '../src/upload-worker/book-assembly/worker';
import type {
  BookAssemblyRepositoryPort,
  BookAssemblyScope,
} from '../src/upload-worker/book-assembly/worker';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';

const op = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-1',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-1'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-1',
      sourceKey: 'full',
      pages: [1],
      activityKeys: ['activity-1'],
      mode: 'activity',
    }],
  }],
});
const componentManifest = (): BookAssemblyManifestCandidate => {
  const value = manifest();
  value.sourceSet = {
    sourceStrategy: 'component_pdfs',
    sources: [
      { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'root' },
      { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'root' },
    ],
  };
  value.units[0]!.pageGroups[0]!.sourceKey = 'component-a';
  return value;
};
const trustedProjection = (sourceVersionId: string, sourceKey: string, physicalPageCount = 2) => ({
  sourceVersionId, sourceKey, bookId: 'book-1', physicalPageCount,
  verifiedUsable: true, purpose: 'book-source' as const,
  studentSafeStatus: 'unreviewed' as const,
  checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
});
const authority = (overrides: Partial<BookAssemblyBookAuthority> = {}): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 4,
  sourceSetRevision: 2,
  sourceSet: manifest().sourceSet,
  sourceVersionAuthority: {
    getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-1'
      ? trustedProjection(sourceVersionId, 'full')
      : undefined,
  },
  ...overrides,
});
const componentAuthority = (
  sourceVersionId: string,
  bookRevision: number,
  sourceSetRevision: number,
  physicalPageCount = 2,
): BookAssemblyBookAuthority => authority({
  bookRevision,
  sourceSetRevision,
  sourceSet: {
    ...componentManifest().sourceSet,
    sources: componentManifest().sourceSet.sources.map((source) => source.sourceKey === 'component-a'
      ? { ...source, sourceVersionId } : source),
  },
  sourceVersionAuthority: {
    getSourceVersion: (value) => value === sourceVersionId
      ? trustedProjection(value, 'component-a', physicalPageCount)
      : value === 'source-b-v1' ? trustedProjection(value, 'component-b')
      : undefined,
  },
});

class MemoryRepository implements BookAssemblyRepositoryPort {
  root: BookAssemblyScope = {};
  users = new Map<string, Record<string, unknown>>([
    ['teacher-1', { role: 'teacher', status: 'active' }],
    ['teacher-2', { role: 'teacher', status: 'active' }],
  ]);
  readScopeCalls = 0;
  transactionCalls = 0;
  unitKeys: readonly string[] = ['unit-1'];
  async listUnitKeys(): Promise<readonly string[]> { return this.unitKeys; }
  book = authority();
  async readValue(path: string): Promise<unknown> {
    if (path.startsWith('users/')) return this.users.get(path.slice(6)) ?? null;
    if (path.startsWith('books/')) return {
      bookMode: this.book.bookMode,
      ownerId: this.book.ownerId,
      revision: this.book.bookRevision,
      sourceSetRevision: this.book.sourceSetRevision,
      sourceSet: this.book.sourceSet,
      sourceVersions: {
        'source-1': {
          sourceVersionId: 'source-1', bookId: 'book-1', physicalPageCount: 2,
          verifiedUsable: true, status: 'verified_completed',
        },
      },
    };
    return null;
  }
  async readScope(): Promise<BookAssemblyScope> {
    this.readScopeCalls += 1;
    return structuredClone(this.root);
  }
  async transaction<T>(
    _bookId: string,
    _unitKey: string,
    mutate: (current: BookAssemblyScope) => { outcome: T; next?: BookAssemblyScope; write: boolean },
    options: { beforeWrite?: () => Promise<void> } = {},
  ): Promise<T> {
    this.transactionCalls += 1;
    const current = structuredClone(this.root);
    const output = mutate(current);
    if (output.write) await options.beforeWrite?.();
    if (output.write) this.root = structuredClone(output.next ?? current);
    return output.outcome;
  }
}

const request = (body: unknown): Request => new Request('https://assembly.example', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const mutationEnv = () => ({
  BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true',
});

describe('PRD0062 ticket 13A Assembly candidate Worker', () => {
  it('loads a committed full-PDF current candidate without component activation', async () => {
    const repository = new MemoryRepository();
    const candidateManifest = manifest();
    candidateManifest.nodes[1]!.nodeKey = 'qa-full-unit-1';
    candidateManifest.units[0]!.unitKey = 'qa-full-unit-1';
    repository.book = authority({ bookRevision: 5, sourceSetRevision: 3 });
    const candidate: BookAssemblyCandidateRecord = {
      candidateId: 'submission-book-1', ownerId: 'teacher-1', bookId: 'book-1',
      bookRevision: 5, sourceSetRevision: 3, unitKey: 'qa-full-unit-1', revision: 2,
      lifecycle: 'validated', manifest: candidateManifest,
      validation: { valid: true, errors: [] }, updatedAt: '2026-10-21T00:00:00.000Z',
    };
    repository.root = {
      current: {
        candidateId: candidate.candidateId, candidateRevision: candidate.revision,
        bookRevision: candidate.bookRevision, sourceSetRevision: candidate.sourceSetRevision,
        updatedAt: candidate.updatedAt,
      },
      candidates: { [candidate.candidateId]: candidate },
    };
    let verifiedCandidate: BookAssemblyCandidateRecord | undefined;
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      verifyDraftActivities: async ({ candidate: value }) => {
        verifiedCandidate = value;
        return ['activity-1'];
      },
    });

    await expect(handlers.loadCurrent({
      env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'qa-full-unit-1',
    })).resolves.toMatchObject({
      body: { status: 'loaded', candidate: { unitKey: 'qa-full-unit-1' },
        savedActivityKeysByUnit: { 'qa-full-unit-1': ['activity-1'] } },
      init: { status: 200 },
    });
    expect(verifiedCandidate).toEqual(candidate);
    repository.root.current = { ...repository.root.current!, candidateRevision: candidate.revision + 1 };
    await expect(handlers.loadCurrent({
      env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'qa-full-unit-1',
    })).resolves.toMatchObject({ body: { status: 'empty' } });
    repository.root.current = { ...repository.root.current!, candidateRevision: candidate.revision };
    repository.book = { ...repository.book, sourceSetRevision: 4 };
    await expect(handlers.loadCurrent({
      env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'qa-full-unit-1',
    })).resolves.toMatchObject({ body: { status: 'empty' } });
  });

  it('discovers only a qualified owner draft before the first Material activation', async () => {
    const repository = new MemoryRepository();
    repository.book = componentAuthority('source-a-v1', 0, 0);
    const handlers = createBookAssemblyWorkerHandlers({
      repository, readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-first',
      verifyDraftActivities: async () => ['activity-1', 'forged-slot'],
    });
    const created = await handlers.create({
      request: request({ operationId: op('901'), bookId: 'book-1', unitKey: 'unit-1',
        expectedBookRevision: 0, expectedSourceSetRevision: 0, manifest: componentManifest() }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(created.body).toMatchObject({ status: 'created' });
    const validated = await handlers.validate({
      request: request({ operationId: op('902'), bookId: 'book-1', unitKey: 'unit-1',
        candidateId: 'candidate-first', expectedCandidateRevision: 1 }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(validated.body).toMatchObject({ status: 'validated' });
    await expect(handlers.discoverDrafts({ env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' }))
      .resolves.toMatchObject({ body: { status: 'loaded', drafts: [
        { candidate: { candidateId: 'candidate-first', lifecycle: 'validated' },
          savedActivityKeysByUnit: { 'unit-1': ['activity-1'] } },
      ] } });
    await expect(handlers.loadCurrent({ env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1' }))
      .resolves.toMatchObject({ body: { status: 'empty' } });
    const beforeDiscovery = structuredClone(repository.root);
    const pointerRace = createBookAssemblyWorkerHandlers({ repository,
      readBookAuthority: async () => repository.book,
      verifyDraftActivities: async () => {
        repository.root.current = { ...repository.root.current!, candidateRevision: 99 };
        return ['activity-1'];
      },
    });
    await expect(pointerRace.discoverDrafts({ env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' }))
      .resolves.toMatchObject({ body: { code: 'draft_discovery_divergent' }, init: { status: 409 } });
    repository.root = beforeDiscovery;
    const sourceRace = createBookAssemblyWorkerHandlers({ repository,
      readBookAuthority: async () => repository.book,
      verifyDraftActivities: async () => {
        repository.book = componentAuthority('source-a-v2', 0, 0);
        return ['activity-1'];
      },
    });
    await expect(sourceRace.discoverDrafts({ env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' }))
      .resolves.toMatchObject({ body: { code: 'draft_discovery_unqualified' }, init: { status: 409 } });
    repository.book = componentAuthority('source-a-v1', 0, 0);
    await expect(handlers.discoverDrafts({ env: mutationEnv() as never, uid: 'teacher-2', bookId: 'book-1' }))
      .resolves.toMatchObject({ init: { status: 409 } });
    repository.book = componentAuthority('source-a-v2', 0, 0);
    await expect(handlers.discoverDrafts({ env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' }))
      .resolves.toMatchObject({ body: { code: 'draft_discovery_unqualified' }, init: { status: 409 } });
    repository.book = componentAuthority('source-a-v1', 0, 0);
    repository.unitKeys = Array.from({ length: 33 }, (_, index) => `unit-${index}`);
    await expect(handlers.discoverDrafts({ env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' }))
      .resolves.toMatchObject({ body: { code: 'draft_discovery_limit' }, init: { status: 409 } });
    repository.unitKeys = ['unit-1'];
    repository.root.current = { ...repository.root.current!, candidateRevision: 1 };
    await expect(handlers.discoverDrafts({ env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' }))
      .resolves.toMatchObject({ body: { code: 'draft_discovery_divergent' }, init: { status: 409 } });
  });

  it('uses the trusted canonical route Book subject for assembly mutations', async () => {
    const repository = new MemoryRepository();
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-scoped',
      bindingRepositoryFactory: () => ({
        read: async (key) => ({
          ...key,
          schemaVersion: 1,
          activityId: 'activity-target-1',
          candidateId: 'activity-candidate-1',
          candidateRevision: 3,
          candidateLifecycle: 'saved',
        }),
        bindCandidate: async () => 'created',
      }),
    });
    const scopedEnv = {
      BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true',
    };
    const routed = createBookRouteHandlers({ assemblyHandlers: handlers });
    const created = await routed['bookAssembly.create']!({
      request: request({
        operationId: op('126'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: scopedEnv as never,
      uid: 'teacher-1',
      params: { bookId: 'book-1', unitKey: 'unit-1' },
      descriptor: {
        id: 'book.assembly.create', methods: ['POST'],
        pathTemplate: '/book-assembly/books/:bookId/units/:unitKey/candidates',
        owner: '#59', domain: 'assembly', handler: 'bookAssembly.create',
        firebaseAuth: 'firebase-id-token', rateClass: 'book-control',
        gateEnv: 'BOOK_ASSEMBLY_ROUTES_ENABLED', gateDefault: 'disabled',
        requestBodyBytes: 1_200_000, responseLimitBytes: 256_000,
        source: 'contributor', contributorTicket: '#13A',
      },
    }) as { body: unknown; init: ResponseInit };

    expect(created).toMatchObject({ init: { status: 200 }, body: { status: 'created' } });
    const current = await routed['bookAssembly.loadCurrent']!({
      request: new Request('https://assembly.example/book-assembly/books/book-1/units/unit-1/current'),
      env: scopedEnv as never,
      uid: 'teacher-1',
      params: { bookId: 'book-1', unitKey: 'unit-1' },
      descriptor: {
        id: 'book.assembly.load-current', methods: ['GET'],
        pathTemplate: '/book-assembly/books/:bookId/units/:unitKey/current',
        owner: '#59', domain: 'assembly', handler: 'bookAssembly.loadCurrent',
        firebaseAuth: 'firebase-id-token', rateClass: 'book-control',
        gateEnv: 'BOOK_ASSEMBLY_ROUTES_ENABLED', gateDefault: 'disabled',
        requestBodyBytes: 0, responseLimitBytes: 256_000,
        source: 'contributor', contributorTicket: '#13A',
      },
    }) as { body: unknown; init: ResponseInit };
    expect(current).toMatchObject({
      init: { status: 200 },
      body: {
        status: 'empty',
      },
    });
  });

  it('requires the shared active authority profile before mutation or candidate reads', async () => {
    const cases: Array<{
      name: string;
      uid: string;
      profile: Record<string, unknown>;
      createStatus: number;
      createBody: Record<string, unknown>;
      loadBody: Record<string, unknown>;
      authorityReads: number;
      scopeReads: number;
      transactions: number;
    }> = [
      {
        name: 'active teacher', uid: 'teacher-1',
        profile: { role: 'teacher', status: 'active' },
        createStatus: 200, createBody: { status: 'created' }, loadBody: { status: 'empty' },
        authorityReads: 3, scopeReads: 2, transactions: 1,
      },
      {
        name: 'active super-admin', uid: 'teacher-1',
        profile: { role: 'super_admin', status: 'active' },
        createStatus: 200, createBody: { status: 'created' }, loadBody: { status: 'empty' },
        authorityReads: 3, scopeReads: 2, transactions: 1,
      },
      ...(['missing', 'unknown', 'pending'] as const).map((status) => ({
        name: `${status} status`, uid: 'teacher-1', profile: status === 'missing'
          ? { role: 'teacher' } : { role: 'teacher', status },
        createStatus: 403, createBody: { code: 'assembly_forbidden' },
        loadBody: { code: 'assembly_forbidden' }, authorityReads: 0, scopeReads: 0, transactions: 0,
      })),
      ...([
        ['disabled', { role: 'teacher', status: 'active', disabled: true }],
        ['forceReauth', { role: 'teacher', status: 'active', forceReauth: true }],
        ['revoked', { role: 'teacher', status: 'active', privilegedAuthorityRevokedAt: '2026-09-15T00:00:00.000Z' }],
        ['student', { role: 'student', status: 'active' }],
      ] as const).map(([name, profile]) => ({
        name, uid: 'teacher-1', profile,
        createStatus: 403, createBody: { code: 'assembly_forbidden' },
        loadBody: { code: 'assembly_forbidden' }, authorityReads: 0, scopeReads: 0, transactions: 0,
      })),
      {
        name: 'unrelated active teacher', uid: 'teacher-2',
        profile: { role: 'teacher', status: 'active' },
        createStatus: 403, createBody: { status: 'forbidden' },
        loadBody: { status: 'not-found' }, authorityReads: 2, scopeReads: 2, transactions: 0,
      },
    ];

    for (const [index, scenario] of cases.entries()) {
      const repository = new MemoryRepository();
      let authorityReads = 0;
      const handlers = createBookAssemblyWorkerHandlers({
        repository,
        readBookAuthority: async () => {
          authorityReads += 1;
          return repository.book;
        },
        createCandidateId: () => `candidate-boundary-${index}`,
      });
      repository.users.set(scenario.uid, scenario.profile);

      if (scenario.uid === 'teacher-2') {
        const seeded = await handlers.create({
          request: request({
            operationId: op(`90${index}`), bookId: 'book-1', expectedBookRevision: 4,
            expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
          }),
          env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
        });
        expect(seeded.body).toMatchObject({ status: 'created' });
        authorityReads = 0;
        repository.readScopeCalls = 0;
        repository.transactionCalls = 0;
      }

      const created = await handlers.create({
        request: request({
          operationId: op(`100${index}`), bookId: 'book-1', expectedBookRevision: 4,
          expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
        }),
        env: mutationEnv() as never, uid: scenario.uid, bookId: 'book-1',
      });
      expect(created.init).toEqual({ status: scenario.createStatus });
      expect(created.body).toMatchObject(scenario.createBody);

      const loaded = await handlers.loadCurrent({
        env: {} as never, uid: scenario.uid, bookId: 'book-1', unitKey: 'unit-1',
      });
      expect(loaded.body).toMatchObject(scenario.loadBody);
      expect(authorityReads).toBe(scenario.authorityReads);
      expect(repository.readScopeCalls).toBe(scenario.scopeReads);
      expect(repository.transactionCalls).toBe(scenario.transactions);
    }
  });

  it('creates, reloads, validates, and replaces one owner-scoped candidate with CAS revisions', async () => {
    const repository = new MemoryRepository();
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-1',
      now: () => '2026-07-26T00:00:00.000Z',
    });
    const created = await handlers.create({
      request: request({
        operationId: op('1'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(created.body).toMatchObject({ status: 'created', candidate: {
      candidateId: 'candidate-1', revision: 1, lifecycle: 'draft',
    } });
    const loaded = await handlers.load({ env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-1' });
    expect(loaded.body).toMatchObject({ status: 'loaded', conflict: null, candidate: { revision: 1 } });
    const current = await handlers.loadCurrent({ env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1' });
    expect(current.body).toMatchObject({ status: 'empty' });
    const validated = await handlers.validate({
      request: request({
        operationId: op('2'), bookId: 'book-1', unitKey: 'unit-1',
        candidateId: 'candidate-1', expectedCandidateRevision: 1,
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(validated.body).toMatchObject({ status: 'validated', candidate: { revision: 2, lifecycle: 'validated' } });
    const replacedManifest = manifest();
    replacedManifest.units[0]!.pageGroups[0]!.pages = [2];
    const replaced = await handlers.replace({
      request: request({
        operationId: op('3'), candidateId: 'candidate-1', expectedCandidateRevision: 2,
        bookId: 'book-1', expectedBookRevision: 4, expectedSourceSetRevision: 2,
        unitKey: 'unit-1', manifest: replacedManifest,
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(replaced.body).toMatchObject({ status: 'conflict', candidate: { revision: 2, lifecycle: 'validated' } });
  });

  it('rebases a same-topology component candidate onto trusted source replacement revisions', async () => {
    const repository = new MemoryRepository();
    repository.book = componentAuthority('source-a-v1', 4, 2);
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-component',
      now: () => '2026-07-26T00:00:00.000Z',
    });
    const created = await handlers.create({
      request: request({
        operationId: op('20'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: componentManifest(),
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(created.body).toMatchObject({ status: 'created', candidate: { revision: 1 } });

    repository.book = componentAuthority('source-a-v2', 5, 3);
    await expect(handlers.loadCurrent({
      env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1',
    })).resolves.toMatchObject({ body: { status: 'empty' }, init: { status: 200 } });

    const rebased = await handlers.rebase({
      request: request({
        operationId: op('21'), bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-component',
        expectedCandidateRevision: 1, expectedBookRevision: 5, expectedSourceSetRevision: 3,
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(rebased.body).toMatchObject({
      status: 'rebased',
      candidate: {
        candidateId: 'candidate-component', revision: 2, lifecycle: 'validated',
        bookRevision: 5, sourceSetRevision: 3,
        manifest: { sourceSet: { sources: [
          { sourceVersionId: 'source-a-v2' }, { sourceVersionId: 'source-b-v1' },
        ] } },
      },
    });

    const replayed = await handlers.rebase({
      request: request({
        operationId: op('21'), bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-component',
        expectedCandidateRevision: 1, expectedBookRevision: 5, expectedSourceSetRevision: 3,
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(replayed.body).toMatchObject({ status: 'replayed' });
  });

  it('does not rebase component mappings when the trusted replacement makes a page invalid', async () => {
    const repository = new MemoryRepository();
    repository.book = componentAuthority('source-a-v1', 4, 2);
    const handlers = createBookAssemblyWorkerHandlers({
      repository, readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-component', now: () => '2026-07-26T00:00:00.000Z',
    });
    await handlers.create({
      request: request({
        operationId: op('22'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: componentManifest(),
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    repository.book = componentAuthority('source-a-v2', 5, 3, 0);
    const rebased = await handlers.rebase({
      request: request({
        operationId: op('23'), bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-component',
        expectedCandidateRevision: 1, expectedBookRevision: 5, expectedSourceSetRevision: 3,
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(rebased.body).toMatchObject({ status: 'invalid', candidate: { revision: 1 } });
    await expect(repository.readScope('book-1', 'unit-1')).resolves.toMatchObject({
      candidates: { 'candidate-component': { revision: 1, sourceSetRevision: 2 } },
    });
  });

  it('rejects stale CAS, cross-owner access, Mode 1 books, and invalid source bindings fail-closed', async () => {
    const repository = new MemoryRepository();
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-1',
    });
    const stale = await handlers.create({
      request: request({
        operationId: op('4'), bookId: 'book-1', expectedBookRevision: 3,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(stale.body).toMatchObject({ status: 'conflict', currentBookRevision: 4 });
    expect(repository.root.candidates).toBeUndefined();

    const modeOne = { ...repository.book, bookMode: 'materials' as never };
    repository.book = modeOne;
    const notFound = await handlers.create({
      request: request({
        operationId: op('5'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(notFound.body).toEqual({ status: 'forbidden' });
    repository.book = authority();

    const created = await handlers.create({
      request: request({
        operationId: op('6'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(created.body).toMatchObject({ status: 'created' });
    const otherOwner = await handlers.load({ env: {} as never, uid: 'teacher-2', bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-1' });
    expect(otherOwner.body).toEqual({ status: 'not-found' });
    const invalid = manifest();
    (invalid.sourceSet.sources[0] as { sourceVersionId: string }).sourceVersionId = 'other-source';
    const bad = await handlers.replace({
      request: request({
        operationId: op('7'), candidateId: 'candidate-1', expectedCandidateRevision: 1,
        bookId: 'book-1', expectedBookRevision: 4, expectedSourceSetRevision: 2,
        unitKey: 'unit-1', manifest: invalid,
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(bad.body).toMatchObject({ status: 'invalid' });
  });

  it('replays exact operations and rejects conflicting replay without a second candidate write', async () => {
    const repository = new MemoryRepository();
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-1',
    });
    const payload = {
      operationId: op('8'), bookId: 'book-1', expectedBookRevision: 4,
      expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
    };
    const first = await handlers.create({ request: request(payload), env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' });
    const replay = await handlers.create({ request: request(payload), env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1' });
    expect(replay.body).toMatchObject({ status: 'replayed', candidate: { candidateId: 'candidate-1' } });
    const conflict = await handlers.create({
      request: request({ ...payload, manifest: { ...manifest(), units: [] } }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(conflict.body).toMatchObject({ status: 'idempotency-conflict' });
    expect(Object.keys(repository.root.candidates ?? {})).toHaveLength(1);
    expect(first.body).toMatchObject({ status: 'created' });
  });

  it('retains candidate history while creating above the legacy eight-candidate bound', async () => {
    const repository = new MemoryRepository();
    repository.root = {
      candidates: Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
        const candidateId = `candidate-history-${index + 1}`;
        return [candidateId, {
          candidateId,
          ownerId: 'teacher-1',
          bookId: 'book-1',
          bookRevision: 4,
          sourceSetRevision: 2,
          unitKey: 'unit-1',
          revision: 2,
          lifecycle: 'validated' as const,
          manifest: manifest(),
          validation: { valid: true, errors: [] },
          updatedAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        }];
      })),
      current: {
        candidateId: 'candidate-history-8',
        candidateRevision: 2,
        bookRevision: 4,
        sourceSetRevision: 2,
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    };
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-new',
      now: () => '2026-07-09T00:00:00.000Z',
    });

    const result = await handlers.create({
      request: request({
        operationId: op('10'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: mutationEnv() as never,
      uid: 'teacher-1',
      bookId: 'book-1',
    });

    expect(result).toMatchObject({ init: { status: 200 }, body: { status: 'created' } });
    expect(Object.keys(repository.root.candidates ?? {})).toHaveLength(9);
    expect(repository.root.candidates?.['candidate-history-1']).toBeDefined();
    expect(repository.root.candidates?.['candidate-history-8']).toBeDefined();
    expect(repository.root.candidates?.['candidate-new']).toBeDefined();
    expect(repository.root.current?.candidateId).toBe('candidate-new');
  });

  it('returns an explicit conflict without mutation at the durable candidate bound', async () => {
    const repository = new MemoryRepository();
    repository.root = {
      candidates: Object.fromEntries(Array.from({ length: 32 }, (_, index) => {
        const candidateId = `candidate-bound-${index + 1}`;
        return [candidateId, {
          candidateId,
          ownerId: 'teacher-1',
          bookId: 'book-1',
          bookRevision: 4,
          sourceSetRevision: 2,
          unitKey: 'unit-1',
          revision: 2,
          lifecycle: 'validated' as const,
          manifest: manifest(),
          validation: { valid: true, errors: [] },
          updatedAt: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        }];
      })),
      current: {
        candidateId: 'candidate-bound-32',
        candidateRevision: 2,
        bookRevision: 4,
        sourceSetRevision: 2,
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
    };
    const before = structuredClone(repository.root);
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-overflow',
    });

    const result = await handlers.create({
      request: request({
        operationId: op('11'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: mutationEnv() as never,
      uid: 'teacher-1',
      bookId: 'book-1',
    });

    expect(result).toEqual({
      body: { code: 'book_assembly_candidate_capacity_exceeded' },
      init: { status: 409 },
    });
    expect(repository.root).toEqual(before);
  });

  it('rejects authority changes before scoped CAS write and preserves prior state', async () => {
    const repository = new MemoryRepository();
    const original = structuredClone(repository.root);
    const originalReader = repository.book;
    let reads = 0;
    const guardedHandlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => {
        reads += 1;
        return reads > 1 ? { ...repository.book, bookRevision: 5 } : originalReader;
      },
      createCandidateId: () => 'candidate-2',
    });
    const result = await guardedHandlers.create({
      request: request({
        operationId: op('9'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: mutationEnv() as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(result).toEqual({ body: { code: 'assembly_authority_changed' }, init: { status: 409 } });
    expect(repository.root).toEqual(original);
    expect(reads).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import type { BookAssemblyBookAuthority } from '../../src/services/book-assembly/unitAssembly.types';
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
const authority = (overrides: Partial<BookAssemblyBookAuthority> = {}): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 4,
  sourceSetRevision: 2,
  sourceSet: manifest().sourceSet,
  sourceVersionAuthority: {
    getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-1'
      ? { sourceVersionId, bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true }
      : undefined,
  },
  ...overrides,
});

class MemoryRepository implements BookAssemblyRepositoryPort {
  root: BookAssemblyScope = {};
  users = new Map([['teacher-1', { role: 'teacher' }], ['teacher-2', { role: 'teacher' }]]);
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
    return structuredClone(this.root);
  }
  async transaction<T>(
    _bookId: string,
    _unitKey: string,
    mutate: (current: BookAssemblyScope) => { outcome: T; next?: BookAssemblyScope; write: boolean },
    options: { beforeWrite?: () => Promise<void> } = {},
  ): Promise<T> {
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

describe('PRD0062 ticket 13A Assembly candidate Worker', () => {
  it('uses the trusted canonical route Book subject for the mandatory pilot gate', async () => {
    const repository = new MemoryRepository();
    const handlers = createBookAssemblyWorkerHandlers({
      repository,
      readBookAuthority: async () => repository.book,
      createCandidateId: () => 'candidate-scoped',
    });
    const scopedEnv = {
      BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true',
      BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
      BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
      BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
        schemaVersion: 'v1', environment: 'test', revision: 'assembly-route-subject',
        issuedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        teacherId: 'teacher-1', bookId: 'book-1', assignmentId: 'assignment-1',
        studentIds: ['student-1'], maxStudents: 30,
      }),
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
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
    });
    expect(created.body).toMatchObject({ status: 'created', candidate: {
      candidateId: 'candidate-1', revision: 1, lifecycle: 'draft',
    } });
    const loaded = await handlers.load({ env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-1' });
    expect(loaded.body).toMatchObject({ status: 'loaded', conflict: null, candidate: { revision: 1 } });
    const validated = await handlers.validate({
      request: request({
        operationId: op('2'), bookId: 'book-1', unitKey: 'unit-1',
        candidateId: 'candidate-1', expectedCandidateRevision: 1,
      }),
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
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
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
    });
    expect(replaced.body).toMatchObject({ status: 'replaced', candidate: { revision: 3, lifecycle: 'validated' } });
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
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
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
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
    });
    expect(notFound.body).toEqual({ status: 'forbidden' });
    repository.book = authority();

    const created = await handlers.create({
      request: request({
        operationId: op('6'), bookId: 'book-1', expectedBookRevision: 4,
        expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest: manifest(),
      }),
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
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
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
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
    const first = await handlers.create({ request: request(payload), env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' });
    const replay = await handlers.create({ request: request(payload), env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1' });
    expect(replay.body).toMatchObject({ status: 'replayed', candidate: { candidateId: 'candidate-1' } });
    const conflict = await handlers.create({
      request: request({ ...payload, manifest: { ...manifest(), units: [] } }),
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
    });
    expect(conflict.body).toMatchObject({ status: 'idempotency-conflict' });
    expect(Object.keys(repository.root.candidates ?? {})).toHaveLength(1);
    expect(first.body).toMatchObject({ status: 'created' });
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
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1',
    });
    expect(result).toEqual({ body: { code: 'assembly_authority_changed' }, init: { status: 409 } });
    expect(repository.root).toEqual(original);
    expect(reads).toBe(2);
  });
});

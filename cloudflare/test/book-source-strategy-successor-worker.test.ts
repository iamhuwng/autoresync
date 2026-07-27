import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationPointer,
  BookSourceVersionAuthority,
  SourceSetCandidate,
} from '../../src/types/bookAssembly.types';
import type { BookAssemblyBookAuthority } from '../../src/services/book-assembly/unitAssembly.types';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../src/services/book-assembly/publicationRepository';
import {
  InMemoryBookAssemblyPublicationRepository,
} from '../../src/services/book-assembly/publicationRepository';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service';
import { createSourceStrategySuccessorWorkerHandlers } from '../src/upload-worker/book-assembly/source-strategy-successor-worker';
import fragment from '../src/upload-worker/book-rules/fragments/20C.json';

const NOW = '2026-07-28T00:00:00.000Z';
const OPERATION = '00000000-0000-4000-8000-000000000071';

const fullSources: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }],
};
const componentSources: SourceSetCandidate = {
  sourceStrategy: 'component_pdfs',
  sources: [{
    sourceKey: 'component-a',
    sourceVersionId: 'component-a-v1',
    sourceOrder: 1,
    ownerNodeKey: 'section-root',
  }],
};
const manifest: BookAssemblyManifestCandidate = {
  bookId: 'book-1',
  sourceSet: fullSources,
  nodes: [
    { nodeKey: 'section-root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'section-root', nodeType: 'unit', order: 1 },
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
      pages: [2],
      activityKeys: ['activity-1'],
      mode: 'activity',
    }],
  }],
};
const authority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => ({
    sourceVersionId,
    bookId: 'book-1',
    physicalPageCount: 10,
    verifiedUsable: true,
  }),
};
const bookAuthority: BookAssemblyBookAuthority = {
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 7,
  sourceSetRevision: 4,
  sourceSet: fullSources,
  sourceVersionAuthority: authority,
};
const predecessor: BookAssemblyImmutableManifestVersion = {
  schemaVersion: 1,
  manifestVersionId: 'manifest-1',
  publicationId: 'publication-1',
  publicationRevision: 1,
  lifecycle: 'published',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 7,
  sourceSetRevision: 4,
  candidateId: 'candidate-1',
  candidateRevision: 3,
  strategy: 'full_pdf',
  adapterTicket: '16',
  inputFingerprint: 'fnv1a64:predecessor',
  createdByCommandId: '00000000-0000-4000-8000-000000000065',
  createdAt: NOW,
  manifest,
  studentSafeProjection: {
    schemaVersion: 1,
    bookId: 'book-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    sourceStrategy: 'full_pdf',
    sourceSet: fullSources,
    units: manifest.units,
  },
};
const pointer: BookAssemblyPublicationPointer = {
  publicationId: predecessor.publicationId,
  publicationRevision: predecessor.publicationRevision,
  manifestVersionId: predecessor.manifestVersionId,
  bookRevision: predecessor.bookRevision,
  sourceSetRevision: predecessor.sourceSetRevision,
  inputFingerprint: predecessor.inputFingerprint,
  updatedAt: NOW,
  updatedByCommandId: predecessor.createdByCommandId,
};

const initialScope: BookAssemblyPublicationScope<BookAssemblyPublicationResult> = {
  versions: { [predecessor.manifestVersionId]: predecessor },
  current: pointer,
  activityVersions: {
    'activity-1-v1': {
      schemaVersion: 1,
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      activityVersion: 1,
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: predecessor.manifestVersionId,
      publicationId: predecessor.publicationId,
      publicationRevision: 1,
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      createdByCommandId: predecessor.createdByCommandId,
      createdAt: NOW,
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'full-v1', physicalPageNumber: 2 }],
      payloadFingerprint: 'fnv1a64:activity',
    },
  },
  placements: {
    'placement-1': {
      schemaVersion: 1,
      placementId: 'placement-1',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: predecessor.manifestVersionId,
      publicationId: predecessor.publicationId,
      publicationRevision: 1,
      unitKey: 'unit-1',
      nodeKey: 'unit-1',
      activityKey: 'activity-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      order: 1,
      pageGroupKeys: ['pages-1'],
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'full-v1', physicalPageNumber: 2 }],
    },
  },
};

const request = (body: unknown, operationId = OPERATION): Request => new Request('https://worker.test', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': operationId,
  },
  body: JSON.stringify(body),
});

const body = () => ({
  bookId: 'book-1',
  expectedCurrentPublicationId: 'publication-1',
  expectedBookRevision: 7,
  expectedSourceSetRevision: 4,
  targetSourceSetRevision: 5,
  targetSourceSet: componentSources,
  remaps: [{
    pageGroupKey: 'pages-1',
    pages: [{
      from: { sourceKey: 'full', physicalPageNumber: 2 },
      to: { sourceKey: 'component-a', physicalPageNumber: 1 },
    }],
  }],
  previewApproval: {
    approvalId: 'approval-1',
    approvalRevision: 1,
    approvedAt: '2026-07-27T23:00:00.000Z',
    expiresAt: '2026-07-28T01:00:00.000Z',
  },
});

const workerFixture = () => {
  const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>({
    'book-1': initialScope,
  });
  let sequence = 0;
  const handlers = createSourceStrategySuccessorWorkerHandlers({
    repository,
    readAuthority: async () => bookAuthority,
    now: () => NOW,
    allocateId: (kind, key) => `${kind}-${key.replaceAll(':', '-')}-${++sequence}`,
    allocateOperationId: () => OPERATION,
  });
  return { repository, handlers };
};

describe('Ticket 20C source-strategy successor Worker', () => {
  it('publishes a component successor through the common atomic transaction', async () => {
    const fixture = workerFixture();
    const response = await fixture.handlers.publish({
      request: request(body()),
      env: {
        BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED: 'true',
        readDatabaseValue: async () => ({ role: 'teacher' }),
      },
      uid: 'teacher-1',
    });

    expect(response.init.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'published',
      pointer: { publicationId: expect.any(String) },
      version: {
        successorLineage: {
          predecessorPublicationId: 'publication-1',
          successorStrategy: 'component_pdfs',
        },
      },
      impact: { fromStrategy: 'full_pdf', toStrategy: 'component_pdfs' },
    });
    const scope = await fixture.repository.readScope('book-1');
    expect(Object.keys(scope.versions ?? {})).toHaveLength(2);
    expect(scope.versions?.['manifest-1']).toEqual(predecessor);
    expect(scope.current?.publicationId).not.toBe('publication-1');
    expect(Object.values(scope.activityVersions ?? {}).some((record) =>
      record.activityId === 'activity-1' && record.activityVersion === 2
      && record.sourcePages[0]?.sourceKey === 'component-a')).toBe(true);
  });

  it('replays an exact idempotency key and leaves the predecessor immutable', async () => {
    const fixture = workerFixture();
    const input = {
      env: {
        BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED: 'true',
        readDatabaseValue: async () => ({ role: 'super_admin' }),
      },
      uid: 'teacher-1',
    };
    const first = await fixture.handlers.publish({ ...input, request: request(body()) });
    const replay = await fixture.handlers.publish({ ...input, request: request(body()) });
    expect(first.init.status).toBe(200);
    expect(replay.init.status).toBe(200);
    expect(replay.body).toMatchObject({ status: 'replayed' });
    const scope = await fixture.repository.readScope('book-1');
    expect(scope.versions?.['manifest-1']).toEqual(predecessor);
    expect(Object.values(scope.versions ?? {}).filter((version) => version.successorLineage)).toHaveLength(1);
  });

  it('rejects stale current-pointer writes and conflicting idempotency replay', async () => {
    const fixture = workerFixture();
    const env = {
      BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED: 'true',
      readDatabaseValue: async () => ({ role: 'teacher' }),
    };
    const first = await fixture.handlers.publish({ request: request(body()), env, uid: 'teacher-1' });
    expect(first.init.status).toBe(200);

    const stale = await fixture.handlers.publish({
      request: request(body(), '00000000-0000-4000-8000-000000000073'),
      env,
      uid: 'teacher-1',
    });
    expect(stale).toMatchObject({ init: { status: 409 }, body: { failureCode: 'stale-current-pointer' } });

    const conflictingTarget = {
      sourceStrategy: 'component_pdfs' as const,
      sources: [{
        ...componentSources.sources[0],
        sourceVersionId: 'component-a-v2',
      }],
    };
    const conflicting = await fixture.handlers.publish({
      request: request({ ...body(), targetSourceSet: conflictingTarget }),
      env,
      uid: 'teacher-1',
    });
    expect(conflicting).toMatchObject({ init: { status: 409 }, body: { failureCode: 'idempotency-conflict' } });
  });

  it('preserves the predecessor when the common transaction crashes before commit', async () => {
    const base = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>({
      'book-1': initialScope,
    });
    const crashingRepository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult> = {
      readScope: (bookId) => base.readScope(bookId),
      transaction: async (bookId, mutate) => {
        mutate(await base.readScope(bookId));
        throw new Error('simulated-crash-before-commit');
      },
    };
    const handlers = createSourceStrategySuccessorWorkerHandlers({
      repository: crashingRepository,
      readAuthority: async () => bookAuthority,
      now: () => NOW,
      allocateId: (kind, key) => `${kind}-${key.replaceAll(':', '-')}`,
      allocateOperationId: () => OPERATION,
    });
    const response = await handlers.publish({
      request: request(body()),
      env: {
        BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED: 'true',
        readDatabaseValue: async () => ({ role: 'teacher' }),
      },
      uid: 'teacher-1',
    });
    expect(response.init.status).toBe(422);
    await expect(base.readScope('book-1')).resolves.toMatchObject({
      current: pointer,
      versions: { 'manifest-1': predecessor },
    });
  });

  it('fails closed while the trusted successor capability is disabled or remaps are incomplete', async () => {
    const fixture = workerFixture();
    const base = {
      request: request(body()),
      env: {
        BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED: 'disabled',
        readDatabaseValue: async () => ({ role: 'teacher' }),
      },
      uid: 'teacher-1',
    };
    await expect(fixture.handlers.publish(base)).resolves.toMatchObject({ init: { status: 503 } });
    const invalid = { ...body(), remaps: [] };
    await expect(fixture.handlers.publish({
      ...base,
      request: request(invalid, '00000000-0000-4000-8000-000000000072'),
      env: { ...base.env, BOOK_SOURCE_STRATEGY_SUCCESSOR_ENABLED: 'true' },
    })).resolves.toMatchObject({ init: { status: 422 } });
    await expect(fixture.repository.readScope('book-1')).resolves.toMatchObject({ current: pointer });
  });

  it('keeps the 20C rules fragment disabled and browser-deny by default', () => {
    expect(fragment.owner).toMatchObject({ ticketId: '20C', issue: 71 });
    expect(fragment.operations.some((entry) => entry.path === 'book_assembly_publication_successors'
      && entry.rule === '.read' && entry.expression === 'false')).toBe(true);
    expect(fragment.operations.some((entry) => entry.path === 'book_assembly_publication_successors'
      && entry.rule === '.write' && entry.expression === 'false')).toBe(true);
  });
});

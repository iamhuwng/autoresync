import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationPointer,
  BookSourceVersionAuthority,
  SourceSetCandidate,
} from '../../src/types/bookAssembly.types';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../src/services/book-assembly/publicationRepository';
import { InMemoryBookAssemblyPublicationRepository } from '../../src/services/book-assembly/publicationRepository';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service';
import type { BookAssemblyBookAuthority } from '../../src/services/book-assembly/unitAssembly.types';
import { fingerprintMappingRevisionInput } from '../../src/services/book-assembly/mappingRevision.service';
import { createMappingRevisionWorkerHandlers } from '../src/upload-worker/book-assembly/mapping-revision-worker';
import fragment from '../src/upload-worker/book-rules/fragments/18.json';

const NOW = '2026-07-28T00:00:00.000Z';
const OPERATION = '00000000-0000-4000-8000-000000000018';
const fullSources: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }],
};
const authority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => ({
    sourceVersionId,
    bookId: 'book-1',
    physicalPageCount: 10,
    verifiedUsable: true,
  }),
};
const manifest = (): BookAssemblyManifestCandidate => ({
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
      pageGroupKeys: ['activity-pages'],
    }],
    pageGroups: [
      {
        pageGroupKey: 'activity-pages',
        sourceKey: 'full',
        pages: [2],
        activityKeys: ['activity-1'],
        mode: 'activity',
      },
      {
        pageGroupKey: 'reference-pages',
        sourceKey: 'full',
        pages: [3],
        activityKeys: [],
        mode: 'reference_only',
        defaultPhysicalPageNumber: 3,
      },
    ],
  }],
});
const predecessor = (): BookAssemblyImmutableManifestVersion => ({
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
  createdByCommandId: '00000000-0000-4000-8000-000000000016',
  createdAt: NOW,
  manifest: manifest(),
  studentSafeProjection: {
    schemaVersion: 1,
    bookId: 'book-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    sourceStrategy: 'full_pdf',
    sourceSet: fullSources,
    units: manifest().units,
  },
});
const pointer: BookAssemblyPublicationPointer = {
  publicationId: predecessor().publicationId,
  publicationRevision: predecessor().publicationRevision,
  manifestVersionId: predecessor().manifestVersionId,
  bookRevision: predecessor().bookRevision,
  sourceSetRevision: predecessor().sourceSetRevision,
  inputFingerprint: predecessor().inputFingerprint,
  updatedAt: NOW,
  updatedByCommandId: predecessor().createdByCommandId,
};
const initialScope: BookAssemblyPublicationScope<BookAssemblyPublicationResult> = {
  versions: { 'manifest-1': predecessor() },
  current: pointer,
  activityVersions: {
    'activity-1-v1': {
      schemaVersion: 1,
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      activityVersion: 1,
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      createdByCommandId: predecessor().createdByCommandId,
      createdAt: NOW,
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'full-v1', physicalPageNumber: 2 }],
      payloadFingerprint: 'activity-fingerprint',
    },
  },
  placements: {
    'placement-1': {
      schemaVersion: 1,
      placementId: 'placement-1',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      unitKey: 'unit-1',
      nodeKey: 'unit-1',
      activityKey: 'activity-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      order: 1,
      pageGroupKeys: ['activity-pages'],
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'full-v1', physicalPageNumber: 2 }],
    },
  },
};
const targetReordered = (): BookAssemblyManifestCandidate => ({
  ...manifest(),
  units: manifest().units.map((unit) => ({ ...unit, pageGroups: [...unit.pageGroups].reverse() })),
});
const targetSourceAssisted = (): BookAssemblyManifestCandidate => ({
  ...manifest(),
  units: manifest().units.map((unit) => ({
    ...unit,
    pageGroups: unit.pageGroups.map((group) => group.pageGroupKey === 'activity-pages'
      ? { ...group, pages: [4] }
      : group),
  })),
});
const request = (body: unknown, operationId = OPERATION): Request => new Request('https://worker.test', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': operationId,
  },
  body: JSON.stringify(body),
});
const body = (targetManifest: BookAssemblyManifestCandidate = targetReordered(), previewApproval?: unknown) => ({
  bookId: 'book-1',
  expectedCurrentPublicationId: 'publication-1',
  expectedBookRevision: 7,
  expectedSourceSetRevision: 4,
  targetManifest,
  ...(previewApproval === undefined ? {} : { previewApproval }),
});
const workerFixture = () => {
  const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>({ 'book-1': initialScope });
  let sequence = 0;
  const handlers = createMappingRevisionWorkerHandlers({
    repository,
    readAuthority: async (): Promise<BookAssemblyBookAuthority> => ({
      bookId: 'book-1',
      ownerId: 'teacher-1',
      bookMode: 'pdf',
      bookRevision: 7,
      sourceSetRevision: 4,
      sourceSet: fullSources,
      sourceVersionAuthority: authority,
    }),
    now: () => NOW,
    allocateId: (kind, key) => `${kind}-${key.replaceAll(':', '-')}-${++sequence}`,
    allocateOperationId: () => OPERATION,
  });
  return { repository, handlers };
};
const env = {
  BOOK_MAPPING_REVISION_ENABLED: 'true',
  readDatabaseValue: async () => ({ role: 'teacher' }),
};

describe('Ticket 18 mapping-revision Worker', () => {
  it('publishes a mapping revision while retaining Activity Version identity and predecessor', async () => {
    const fixture = workerFixture();
    const response = await fixture.handlers.publish({ request: request(body()), env, uid: 'teacher-1' });
    expect(response.init.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'published',
      version: {
        adapterTicket: '18',
        mappingRevisionLineage: {
          predecessorPublicationId: 'publication-1',
          preservedActivityVersionIds: ['activity-1-v1'],
        },
      },
      impact: { changedPageGroupKeys: ['unit-1:activity-pages', 'unit-1:reference-pages'] },
    });
    const scope = await fixture.repository.readScope('book-1');
    expect(scope.versions?.['manifest-1']).toEqual(predecessor());
    expect(scope.activityVersions?.['activity-1-v1']).toEqual(initialScope.activityVersions?.['activity-1-v1']);
    expect(Object.values(scope.placements ?? {}).some((placement) => placement.predecessorPlacementId === 'placement-1')).toBe(true);
  });

  it('requires an exact fresh preview for source-assisted mapping and rejects stale approval', async () => {
    const fixture = workerFixture();
    const targetManifest = targetSourceAssisted();
    const missing = await fixture.handlers.publish({
      request: request(body(targetManifest)),
      env,
      uid: 'teacher-1',
    });
    expect(missing.init.status).toBe(422);
    const previewApproval = {
      approvalId: 'approval-18',
      approvalRevision: 1,
      approvedAt: '2026-07-27T23:00:00.000Z',
      expiresAt: '2026-07-28T01:00:00.000Z',
      approvedInputFingerprint: fingerprintMappingRevisionInput({ predecessorManifestVersionId: 'manifest-1', targetManifest }),
    };
    const published = await fixture.handlers.publish({
      request: request(body(targetManifest, previewApproval), '00000000-0000-4000-8000-000000000019'),
      env,
      uid: 'teacher-1',
    });
    expect(published.init.status).toBe(200);
    const stale = await workerFixture().handlers.publish({
      request: request(body(targetManifest, { ...previewApproval, approvedInputFingerprint: 'fnv1a64:wrong' }), '00000000-0000-4000-8000-000000000020'),
      env,
      uid: 'teacher-1',
    });
    expect(stale.init.status).toBe(422);
  });

  it('replays exact operations, rejects conflicts, and preserves predecessor after a crash', async () => {
    const fixture = workerFixture();
    const first = await fixture.handlers.publish({ request: request(body()), env, uid: 'teacher-1' });
    const replay = await fixture.handlers.publish({ request: request(body()), env, uid: 'teacher-1' });
    expect(first.init.status).toBe(200);
    expect(replay.body).toMatchObject({ status: 'replayed' });
    const conflict = await fixture.handlers.publish({
      request: request(body(targetSourceAssisted()), OPERATION),
      env,
      uid: 'teacher-1',
    });
    expect(conflict).toMatchObject({ init: { status: 409 }, body: { failureCode: 'idempotency-conflict' } });

    const base = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>({ 'book-1': initialScope });
    const crashingRepository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult> = {
      readScope: (bookId) => base.readScope(bookId),
      transaction: async (bookId, mutate) => {
        mutate(await base.readScope(bookId));
        throw new Error('simulated-crash');
      },
    };
    const crashing = createMappingRevisionWorkerHandlers({
      repository: crashingRepository,
      readAuthority: async (): Promise<BookAssemblyBookAuthority> => ({
        bookId: 'book-1', ownerId: 'teacher-1', bookMode: 'pdf', bookRevision: 7,
        sourceSetRevision: 4, sourceSet: fullSources, sourceVersionAuthority: authority,
      }),
      now: () => NOW,
      allocateId: (kind, key) => `${kind}-${key}`,
      allocateOperationId: () => '00000000-0000-4000-8000-000000000021',
    });
    const crashed = await crashing.publish({
      request: request(body(), '00000000-0000-4000-8000-000000000021'),
      env,
      uid: 'teacher-1',
    });
    expect(crashed.init.status).toBe(422);
    await expect(base.readScope('book-1')).resolves.toMatchObject({ current: pointer, versions: { 'manifest-1': predecessor() } });
  });

  it('keeps the mapping capability disabled and its rule root browser-denied', async () => {
    const fixture = workerFixture();
    await expect(fixture.handlers.publish({
      request: request(body()),
      env: { ...env, BOOK_MAPPING_REVISION_ENABLED: 'disabled' },
      uid: 'teacher-1',
    })).resolves.toMatchObject({ init: { status: 503 } });
    expect(fragment.owner).toMatchObject({ ticketId: '18', issue: 67 });
    expect(fragment.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'book_assembly_mapping_revisions', rule: '.read', expression: 'false' }),
      expect.objectContaining({ path: 'book_assembly_mapping_revisions', rule: '.write', expression: 'false' }),
    ]));
  });
});

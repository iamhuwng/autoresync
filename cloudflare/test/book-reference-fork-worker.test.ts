import { describe, expect, it } from 'vitest';
import { createStudentSafeActivityProjection } from '../../src/services/book-activity/activityProjection.service';
import { normalizeActivityRevision } from '../../src/services/book-activity/activitySchema.service';
import { createInMemoryPublicBookReferenceForkStore } from '../../src/services/materialCatalog/publicBookReferenceFork.repository';
import { createPublicBookReferenceForkService } from '../../src/services/materialCatalog/publicBookReferenceFork.service';
import type { BookActivityVersionRecord } from '../../src/types/bookActivity.types';
import type { PublicBookSelectionSnapshot } from '../../src/services/materialCatalog/publicBookReferenceFork.types';
import { createPublicBookReferenceForkWorkerHandlers } from '../src/upload-worker/public-book-reference-fork/worker';

const timestamp = '2026-08-05T00:00:00.000Z';

const version: BookActivityVersionRecord = {
  activityId: 'source-activity',
  versionId: 'source-version-1',
  ownerId: 'source-owner',
  materialKind: 'interactive-activity',
  content: normalizeActivityRevision({
    schemaVersion: 1,
    title: 'Source activity',
    presentationMode: 'structured',
    contextRequirement: 'none',
    interactions: [{ family: 'choice', prompt: 'Prompt', choices: ['A', 'B'] }],
    answerRule: { type: 'single-choice', correctChoiceIndexes: [0] },
    teacherNotes: 'Private note.',
  }, { idFactory: (() => { let n = 0; return () => 'hidden-' + (++n); })() }),
  publishedAt: timestamp,
  publishedBy: 'source-owner',
};

const source: PublicBookSelectionSnapshot = {
  bookId: 'source-book',
  title: 'Source Book',
  publicTree: true,
  publication: { publicationId: 'publication-1', revision: 1, status: 'trusted', publishedAt: timestamp, updatedAt: timestamp },
  source: { sourceVersionId: 'source-pdf-1', lifecycleState: 'ready', studentSafeStatus: 'ready', documentDeliveryStatus: 'ready' },
  nodes: [{ nodeId: 'unit-1', nodeKind: 'unit', title: 'Unit', order: 0, selectionPath: ['unit-1'] }],
  activities: [{
    activityId: version.activityId,
    versionId: version.versionId,
    title: version.content.title,
    order: 0,
    selectionPath: ['unit-1'],
    projection: createStudentSafeActivityProjection(version, timestamp),
    canonicalVersion: version,
  }],
};

const selection = {
  sourceBookId: source.bookId,
  publicationId: source.publication.publicationId,
  publicationRevision: source.publication.revision,
  kind: 'activity' as const,
  selectionPath: ['unit-1'],
  activities: [{ activityId: version.activityId, activityVersionId: version.versionId, order: 0 }],
};

const target = { bookId: 'target-book', nodeId: 'target-unit', placementId: 'placement-1' };

const setup = () => {
  const store = createInMemoryPublicBookReferenceForkStore({
    publicBooks: { [source.bookId]: source },
    targetBooks: { [target.bookId]: { bookId: target.bookId, ownerId: 'teacher-1', revision: 1, status: 'draft' } },
    entitlements: {
      'student-1:entitlement-1': {
        entitlementId: 'entitlement-1',
        studentId: 'student-1',
        bookId: source.bookId,
        sourceVersionId: source.source.sourceVersionId,
        publicationId: source.publication.publicationId,
        publicationRevision: source.publication.revision,
        status: 'active',
        contextId: 'library-1',
      },
    },
  });
  const service = createPublicBookReferenceForkService({
    store,
    mutationsEnabled: true,
    now: () => timestamp,
    createId: (() => { let n = 0; return (kind: string) => kind + '-' + (++n); })(),
    documentIssuer: {
      issue: async () => ({
        resourcePath: '/v1/book-delivery/documents/opaque-1',
        expiresAt: '2026-08-05T00:05:00.000Z',
        byteSize: 10,
        contentType: 'application/pdf' as const,
      }),
    },
  });
  return { store, service };
};

const call = (
  handlers: ReturnType<typeof createPublicBookReferenceForkWorkerHandlers>,
  body: Record<string, unknown>,
  uid: string,
  role: 'student' | 'teacher' | 'super_admin',
  env: Record<string, string> = {},
) => handlers.handle({
  request: new Request('https://worker.test/v1/public-book-reference-fork', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  env,
  uid,
  role,
});

describe('public Book reference/fork Worker boundary', () => {
  it('is hard-disabled by default before it reads or mutates storage', async () => {
    const { store } = setup();
    const handlers = createPublicBookReferenceForkWorkerHandlers({ store });
    const result = await call(handlers, {
      action: 'reference',
      target,
      selection,
    }, 'teacher-1', 'teacher');
    expect(result.init.status).toBe(503);
    expect(result.body).toEqual({ code: 'feature-disabled' });
    expect(store.snapshot().currentReferences).toEqual({});
  });

  it('returns only the student-safe projection and opaque runtime document', async () => {
    const { service } = setup();
    const handlers = createPublicBookReferenceForkWorkerHandlers({ service, enabled: true });
    const resolved = await call(handlers, {
      action: 'resolve',
      selection,
      entitlementId: 'entitlement-1',
    }, 'student-1', 'student');
    expect(resolved.init.status).toBe(200);
    expect(resolved.body).toMatchObject({ projectionKind: 'public-book-student-safe', publicState: 'playable' });
    expect(JSON.stringify(resolved.body)).not.toMatch(/answerKey|teacherNotes|objectKey|provider|private/i);

    const runtime = await call(handlers, {
      action: 'prepare-runtime',
      selection,
      entitlementId: 'entitlement-1',
    }, 'student-1', 'student');
    expect(runtime.init.status).toBe(200);
    expect(runtime.body).toMatchObject({
      sourceVersionId: 'source-pdf-1',
      document: { resourcePath: '/v1/book-delivery/documents/opaque-1' },
    });
    expect(JSON.stringify(runtime.body)).not.toMatch(/objectKey|provider|privateAsset|bucketBinding/i);
  });

  it('enforces server-derived teacher ownership and creates fork identities only for the owner', async () => {
    const { service, store } = setup();
    const handlers = createPublicBookReferenceForkWorkerHandlers({ service, enabled: true });
    const wrongOwner = await call(handlers, {
      action: 'fork',
      target,
      selection,
    }, 'teacher-2', 'teacher');
    expect(wrongOwner.init.status).toBe(403);
    expect(wrongOwner.body).toEqual({ code: 'target-owner-denied' });

    const fork = await call(handlers, {
      action: 'fork',
      target,
      selection,
      operationId: 'fork-operation-1',
    }, 'teacher-1', 'teacher');
    expect(fork.init.status).toBe(200);
    expect(fork.body.activities[0].material.activityId).not.toBe(version.activityId);
    expect(fork.body.activities[0].material.provenance).toMatchObject({
      source: 'fork',
      forkedFromMaterialId: version.activityId,
      forkedFromVersionId: version.versionId,
    });
    expect(fork.body.activities[0].candidateVersionId).toBe('v1');
    expect(store.snapshot().histories).toBeDefined();

    const forged = await call(handlers, {
      action: 'reference',
      ownerId: 'teacher-1',
      target,
      selection,
    }, 'teacher-1', 'teacher');
    expect(forged.init.status).toBe(400);
    expect(forged.body).toEqual({ code: 'request-invalid' });
  });

  it('routes explicit migration and blocks new writes during deny-only rollback', async () => {
    const { service } = setup();
    const handlers = createPublicBookReferenceForkWorkerHandlers({ service, enabled: true });
    const migrated = await call(handlers, {
      action: 'migrate',
      legacyReferenceId: 'legacy-reference-1',
      target,
      selection,
      operationId: 'migration-operation-1',
      migratedAt: timestamp,
    }, 'teacher-1', 'teacher');
    expect(migrated.init.status).toBe(200);
    expect(migrated.body.reference).toMatchObject({
      origin: 'legacy-migration',
      legacyReferenceId: 'legacy-reference-1',
    });
    expect(migrated.body.receipt.mode).toBe('explicit-public-book-reference');

    const rolledBack = await call(handlers, {
      action: 'reference',
      target,
      selection,
    }, 'teacher-1', 'teacher', { PUBLIC_BOOK_REFERENCE_FORK_ROLLBACK: 'true' });
    expect(rolledBack.init.status).toBe(503);
    expect(rolledBack.body).toEqual({ code: 'feature-rollback' });
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeActivity } from '../../src/services/book-activity/activityCanonical.service';
import { projectStudentActivity } from '../../src/services/book-activity/activityProjection.service';
import { createInMemoryPublicBookReferenceForkStore } from '../../src/services/materialCatalog/publicBookReferenceFork.repository';
import { createPublicBookReferenceForkService } from '../../src/services/materialCatalog/publicBookReferenceFork.service';
import type { EditableActivity } from '../../src/types/bookActivity.types';
import type {
  PublicBookReferenceForkStore,
  PublicBookSelectionSnapshot,
} from '../../src/services/materialCatalog/publicBookReferenceFork.types';
import { FirebaseRestPublicBookReferenceForkRepository } from '../src/upload-worker/public-book-reference-fork/repository';
import { createPublicBookReferenceForkWorkerHandlers } from '../src/upload-worker/public-book-reference-fork/worker';

const timestamp = '2026-08-05T00:00:00.000Z';

const editable: EditableActivity = {
    schemaVersion: 1,
    title: 'Source activity',
    taskProfile: null,
    presentationMode: 'structured',
    contextRequirement: { mode: 'none', acceptedKinds: [] },
    instructions: [{ text: 'Choose the correct answer.' }],
    stimulus: null,
    assetRefs: [],
    interaction: { family: 'choice', variant: 'single-choice' },
    interactions: [{ prompt: 'Prompt', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
    answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
    scoring: { mode: 'auto-where-possible' },
};
let nextId = 0;
const activity = normalizeActivity(editable, { createId: () => 'hidden-' + (++nextId) });
const activityId = 'source-activity';
const versionId = 'source-version-1';

const source: PublicBookSelectionSnapshot = {
  bookId: 'source-book',
  title: 'Source Book',
  publicTree: true,
  publication: { publicationId: 'publication-1', revision: 1, status: 'trusted', publishedAt: timestamp, updatedAt: timestamp },
  source: { sourceVersionId: 'source-pdf-1', lifecycleState: 'ready', studentSafeStatus: 'ready', documentDeliveryStatus: 'ready' },
  nodes: [{ nodeId: 'unit-1', nodeKind: 'unit', title: 'Unit', order: 0, selectionPath: ['unit-1'] }],
  activities: [{
    activityId,
    versionId,
    title: activity.title,
    order: 0,
    selectionPath: ['unit-1'],
    projection: projectStudentActivity(activity),
  }],
};

const selection = {
  sourceBookId: source.bookId,
  publicationId: source.publication.publicationId,
  publicationRevision: source.publication.revision,
  kind: 'activity' as const,
  selectionPath: ['unit-1'],
  activities: [{ activityId, activityVersionId: versionId, order: 0 }],
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

const productionRepositoryFor = (content: unknown, reads: string[] = []) =>
  new FirebaseRestPublicBookReferenceForkRepository({
    env: {
      readDatabaseValue: async (path) => {
        reads.push(path);
        if (path === 'material_catalog/public_book_projections/' + source.bookId) {
          return {
            ...source,
            activities: source.activities.map(({ projection: _projection, ...entry }) => entry),
          };
        }
        if (path === 'book_activity/student_safe_projections/' + activityId + '/' + versionId) {
          return {
            schemaVersion: 1,
            projectionKind: 'student-safe',
            activityId,
            activityVersionId: versionId,
            ownerId: 'teacher-1',
            content,
            payloadFingerprint: 'fnv1a64:0123456789abcdef',
            createdByOperationId: 'operation-1',
            publishedAt: timestamp,
          };
        }
        throw new Error('unexpected read: ' + path);
      },
    },
  });

describe('public Book reference/fork Worker boundary', () => {
  it('loads the canonical student-safe record without reading the private Activity version', async () => {
    const reads: string[] = [];
    const projection = projectStudentActivity(activity);
    const repository = productionRepositoryFor(projection, reads);

    const loaded = await repository.readPublicBook(source.bookId);

    expect(loaded?.activities[0]?.projection.answerRule).toEqual(projection.answerRule);
    expect(reads).toEqual([
      'material_catalog/public_book_projections/' + source.bookId,
      'book_activity/student_safe_projections/' + activityId + '/' + versionId,
    ]);
    expect(reads.some((path) => path.includes('book_activity/versions/'))).toBe(false);
  });

  it('fails closed when a stored projection violates canonical runtime rules', async () => {
    const projection = projectStudentActivity(activity);
    const invalidLongResponse = {
      ...projection,
      interaction: { family: 'long-response', variant: 'draft-response' },
      interactions: projection.interactions.map(({ options: _options, ...entry }) => ({
        ...entry,
        family: 'long-response',
      })),
      answerRule: { defaultPoints: 0, normalization: 'exact' },
      scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
    };
    await expect(productionRepositoryFor(invalidLongResponse).readPublicBook(source.bookId))
      .resolves.toBeNull();

    const incompleteSourceAssisted = {
      ...projection,
      presentationMode: 'source-assisted',
      contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
      interactions: projection.interactions.map((entry) => ({
        ...entry,
        sourceAssisted: {
          questionLabel: 'Question 1',
          accessiblePrompt: 'Choose one answer.',
          responseShape: 'matching',
        },
      })),
    };
    await expect(productionRepositoryFor(incompleteSourceAssisted).readPublicBook(source.bookId))
      .resolves.toBeNull();
  });

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

  it('rejects fork before service construction or any store access', async () => {
    let storeAccesses = 0;
    let serviceAccesses = 0;
    const options = {
      // Keep composition enabled so this proves the action guard, rather than
      // the general rollout gate, prevents service construction.
      enabled: true,
      store: {
        readPublicBook: async () => { storeAccesses += 1; return null; },
        readTargetBook: async () => { storeAccesses += 1; return null; },
        readEntitlement: async () => { storeAccesses += 1; return null; },
        readCurrentReference: async () => { storeAccesses += 1; return null; },
        readReferenceRevision: async () => { storeAccesses += 1; return null; },
        writeReferenceMutation: async () => { storeAccesses += 1; },
      },
    };
    Object.defineProperty(options, 'service', {
      get: () => {
        serviceAccesses += 1;
        throw new Error('service must not be constructed for fork');
      },
    });
    const handlers = createPublicBookReferenceForkWorkerHandlers(options);
    const fork = await call(handlers, {
      action: 'fork',
      operationId: 'fork-operation-1',
      target,
      selection,
    }, 'teacher-1', 'teacher');
    expect(fork.init.status).toBe(503);
    expect(fork.body).toEqual({ code: 'fork-disabled' });
    expect(serviceAccesses).toBe(0);
    expect(storeAccesses).toBe(0);

    const { service } = setup();
    const referenceHandlers = createPublicBookReferenceForkWorkerHandlers({ service, enabled: true });

    const forged = await call(referenceHandlers, {
      action: 'reference',
      ownerId: 'teacher-1',
      target,
      selection,
    }, 'teacher-1', 'teacher');
    expect(forged.init.status).toBe(400);
    expect(forged.body).toEqual({ code: 'request-invalid' });
  });

  it('rejects path-unsafe fork IDs before writer or store access', async () => {
    let storeCalls = 0;
    let writerCalls = 0;
    let roleLookups = 0;
    const store: PublicBookReferenceForkStore = {
      readPublicBook: async () => { storeCalls += 1; return null; },
      readTargetBook: async () => { storeCalls += 1; return null; },
      readEntitlement: async () => { storeCalls += 1; return null; },
      readCurrentReference: async () => { storeCalls += 1; return null; },
      readReferenceRevision: async () => { storeCalls += 1; return null; },
      writeReferenceMutation: async () => { storeCalls += 1; },
    };
    const service = createPublicBookReferenceForkService({
      store,
      canonicalForkEnabled: true,
      canonicalForkMutationsEnabled: true,
      canonicalForkWriter: {
        fork: async () => {
          writerCalls += 1;
          throw new Error('canonical writer must not be called');
        },
      },
    });
    const handlers = createPublicBookReferenceForkWorkerHandlers({
      service,
      enabled: true,
      canonicalForkEnabled: true,
      canonicalForkMutationsEnabled: true,
      resolveCanonicalForkRole: async () => {
        roleLookups += 1;
        return 'teacher';
      },
    });

    for (const unsafeId of ['target.book', 'target:book']) {
      const result = await call(handlers, {
        action: 'fork',
        operationId: '00000000-0000-4000-8000-000000000001',
        target: { ...target, bookId: unsafeId },
        selection,
      }, 'teacher-1', 'teacher');
      expect(result.init.status).toBe(400);
      expect(result.body).toEqual({ code: 'request-invalid' });
    }
    expect(storeCalls).toBe(0);
    expect(writerCalls).toBe(0);
    expect(roleLookups).toBe(0);
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

import { describe, expect, it, vi } from 'vitest';
import { normalizeActivity } from '../../src/services/book-activity/activityCanonical.service.ts';
import { projectStudentActivity } from '../../src/services/book-activity/activityProjection.service.ts';
import {
  createCanonicalActivityVersionFingerprint,
} from '../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import { createBookRuntimeScheduleAuthority } from '../../src/services/book-activity/activityRuntimeAttempt.service.ts';
import type { BookRuntimeScheduleOperationKind } from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import { resolveBookScheduleWindow } from '../../src/services/book-delivery/bookScheduleWindow.service.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import {
  createBookRuntimeCanonicalHandlers,
  createBookRuntimeProductionDependencies,
  type BookRuntimeCanonicalDependencies,
} from '../src/upload-worker/book-runtime/canonical.ts';
import type { BookRuntimeRepository } from '../src/upload-worker/book-runtime/repository.ts';

const BOOK_HOMEWORK_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nredacted\n-----END PRIVATE KEY-----';
const pilotScopeEnv = {
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1',
    environment: 'test',
    revision: 'book-runtime-canonical-composition-pilot',
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    teacherId: 'teacher-1',
    bookId: 'book-1',
    assignmentId: 'context-1',
    studentIds: ['student-1'],
    maxStudents: 30,
  }),
} as const;

const normalizedActivity = () => ({
  schemaVersion: 1 as const,
  title: 'Runtime activity',
  taskProfile: null,
  presentationMode: 'structured' as const,
  contextRequirement: { mode: 'required' as const, acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'text-entry' as const, variant: 'generic' },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const },
  scoring: { mode: 'auto-where-possible' as const },
  interactions: [{
    family: 'text-entry' as const,
    interactionId: 'interaction-1',
    prompt: 'Answer',
    itemIdentities: { family: 'text-entry' as const, itemIds: [] as const },
    answerKey: { family: 'text-entry' as const, acceptedAnswers: ['draft'] },
  }],
});

const canonicalActivityVersion = () => {
  const activity = normalizeActivity({
    schemaVersion: 1,
    title: 'Runtime activity',
    taskProfile: null,
    presentationMode: 'structured',
    contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
    instructions: [{ text: 'Answer.' }],
    interaction: { family: 'text-entry', variant: 'generic' },
    answerRule: { defaultPoints: 1, normalization: 'exact' },
    stimulus: null,
    assetRefs: [],
    interactions: [{ prompt: 'Answer', acceptedAnswers: ['draft'] }],
    scoring: { mode: 'auto-where-possible' },
  }, {
    createId: () => 'interaction-1',
  });
  const record = {
    schemaVersion: 1 as const,
    lifecycle: 'published' as const,
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    ownerId: 'teacher-1',
    activity,
    projection: projectStudentActivity(activity),
    placementIds: ['placement-1'],
    evidenceRefs: [],
    sourceContextFingerprint: null,
    createdByOperationId: 'operation-1',
    publishedAt: '2026-07-30T00:00:00.000Z',
    provenance: {
      kind: 'initial-book-publication' as const,
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      sourcePages: [{
        sourceKey: 'source-1',
        sourceVersionId: 'source-version-1',
        physicalPageNumber: 1,
      }],
    },
  };
  return {
    ...record,
    payloadFingerprint: createCanonicalActivityVersionFingerprint(record),
  };
};

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  outline: [{
    nodeKey: 'unit-1',
    parentNodeKey: null,
    nodeType: 'unit',
    order: 1,
    titleSnapshot: 'Unit 1',
  }],
  context: {
    contextId: 'context-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-version-1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['page-group-1'],
    sourcePageScopes: [{ sourceKey: 'source-1', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-30T00:00:00.000Z',
});

const scheduleAuthority = (operation: BookRuntimeScheduleOperationKind) => {
  const evaluatedAt = new Date().toISOString();
  return createBookRuntimeScheduleAuthority(resolveBookScheduleWindow({
    assignmentId: 'context-1', recipientId: 'student-1', bindingId: 'binding-1',
    bindingRevision: 1, placementId: 'placement-1', activityId: 'activity-1',
    activityVersion: 1, nodeKey: 'unit-1', operation,
    schedule: {
      schemaVersion: 1, resolverVersion: 1,
      availableFrom: new Date(Date.now() - 60_000).toISOString(),
      finalDueAt: new Date(Date.now() + 3_600_000).toISOString(),
      scheduleRules: [],
    },
    outline: binding().outline, studentExtensions: {}, lateSubmissionAllowed: false,
    maxAttempts: 2, attemptsUsed: 0, policyRevision: 1, authorityRevision: 1,
    evaluatedAt,
  }));
};

const schedulePolicy = {
  authorize: ({ operation }: { operation: BookRuntimeScheduleOperationKind }) => ({
    outcome: 'allowed' as const,
    authority: scheduleAuthority(operation),
  }),
  revalidate: ({ operation }: { operation: BookRuntimeScheduleOperationKind }) => ({
    outcome: 'allowed' as const,
    authority: scheduleAuthority(operation),
  }),
};

const repository = (): BookRuntimeRepository => ({
  readDraft: vi.fn(async () => null),
  applyCommand: vi.fn(async () => ({
    status: 'accepted' as const,
    receipt: {
      operationId: '00000000-0000-4000-8000-000000000059',
      status: 'accepted' as const,
      bindingId: 'binding-1',
      draftRevision: 1,
      createdAt: '2026-07-30T00:00:00.000Z',
    },
  })),
  listAttempts: vi.fn(async () => []),
});

const dependencies = (runtimeRepository: BookRuntimeRepository): BookRuntimeCanonicalDependencies => ({
  repository: runtimeRepository,
  resolveBinding: vi.fn(async ({ bindingId, recipientId, contextId }) => (
    bindingId === 'binding-1' && recipientId === 'student-1' && contextId === 'context-1'
      ? binding()
      : null
  )),
  schedulePolicy: { authorize: () => ({ outcome: 'allowed' }) },
  resolveActivity: async () => normalizedActivity(),
});

const env = {
  ...pilotScopeEnv,
  BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
  BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
    client_email: 'runtime@example.test',
    private_key: BOOK_HOMEWORK_PRIVATE_KEY,
  }),
  BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@example.test',
  BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({
    client_email: 'delivery@example.test',
    private_key: BOOK_HOMEWORK_PRIVATE_KEY,
  }),
  FIREBASE_PROJECT_ID: 'project-test',
  FIREBASE_WEB_API_KEY: 'api-key-test',
  FIREBASE_DB_URL: 'https://database.example.test',
};

describe('Ticket #59 canonical Book Runtime composition', () => {
  it('registers runtime handlers through the default route composition', () => {
    const handlers = createBookRouteHandlers();
    expect(typeof handlers['bookRuntime.command']).toBe('function');
    expect(typeof handlers['bookRuntime.readDraft']).toBe('function');
  });

  it('injects the durable runtime repository and current Delivery binding resolver', async () => {
    const runtimeRepository = repository();
    const resolveBinding = vi.fn(async () => binding());
    const handlers = createBookRuntimeCanonicalHandlers({
      createDependencies: () => ({
        repository: runtimeRepository,
        resolveBinding,
        schedulePolicy,
        resolveActivity: async () => normalizedActivity(),
        resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      }),
      schedulePolicy,
    });

    const result = await handlers.command({
      request: new Request('https://worker.test/book-runtime/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId: '00000000-0000-4000-8000-000000000059',
          commandKind: 'autosave',
          bindingId: 'binding-1',
          bindingRevision: 1,
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          clientRevision: 0,
          response: 'draft',
        }),
      }),
      env,
      uid: 'student-1',
    });

    expect(result).toMatchObject({ init: { status: 200 } });
    expect(runtimeRepository.applyCommand).toHaveBeenCalledOnce();
    expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({
      bindingId: 'binding-1',
      recipientId: 'student-1',
      contextId: 'context-1',
    }));
  });

  it('fails closed when production repository credentials are absent', async () => {
    const handlers = createBookRuntimeCanonicalHandlers({
      schedulePolicy: { authorize: () => ({ outcome: 'allowed' }) },
    });
    const result = await handlers.command({
      request: new Request('https://worker.test/book-runtime/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      env: {},
      uid: 'student-1',
    });
    expect(result).toEqual({
      body: { code: 'book_runtime_dependencies_unavailable' },
      init: { status: 503 },
    });
  });

  it('keeps terminal submissions independent of completion credentials when projection is disabled', async () => {
    const runtimeEnv = {
      ...env,
      BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'runtime@example.test',
        private_key: BOOK_HOMEWORK_PRIVATE_KEY,
      }),
      BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'delivery@example.test',
        private_key: BOOK_HOMEWORK_PRIVATE_KEY,
      }),
      BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED: 'disabled',
    };
    const production = createBookRuntimeProductionDependencies(runtimeEnv, undefined, undefined);
    const homework = {
      ...binding(),
      context: {
        ...binding().context,
        kind: 'homework' as const,
        entitlementBasis: 'assignment' as const,
      },
    };

    await expect(production.projectHomeworkCompletion?.({
      binding: homework,
      result: {} as never,
      env: runtimeEnv,
    })).resolves.toBeUndefined();
  });

  it('uses the runtime identity to resolve an exact canonical Activity Version', async () => {
    const current = {
      bindingId: 'binding-1',
      bindingRevision: 1,
      recipientId: 'student-1',
      contextId: 'context-1',
      contextKind: 'solo',
      status: 'active',
      updatedAt: '2026-07-30T00:00:00.000Z',
    };
    const record = {
      binding: binding(),
      recordRevision: 1,
      status: 'active',
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    };
    const readDatabaseValue = vi.fn(async (path: string) => {
      if (path === 'book_delivery/scopes/student-1/context-1/current') return current;
      if (path === 'book_delivery/scopes/student-1/context-1/records/binding-1') return record;
      if (path === 'book_delivery/scopes/student-1/context-1/recovery/hold') return null;
      if (path === 'book_activity/versions/activity-1/activity-version-1') {
        return canonicalActivityVersion();
      }
      if (path === 'users/student-1') return null;
      if (path === 'book_runtime/scopes/student-1/context-1/placement-1/interaction-1') {
        return null;
      }
      if (path === 'book_runtime/scopes/student-1/context-1/recovery/hold') return null;
      throw new Error(`unexpected read: ${path}`);
    });
    const handlers = createBookRuntimeCanonicalHandlers({ schedulePolicy });
    const result = await handlers.readDraft({
      request: new Request('https://worker.test/book-runtime/drafts'),
      env: {
        ...env,
        BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({
          client_email: env.BOOK_RUNTIME_SERVICE_IDENTITY,
          private_key: BOOK_HOMEWORK_PRIVATE_KEY,
        }),
        BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({
          client_email: env.BOOK_DELIVERY_SERVICE_IDENTITY,
          private_key: BOOK_HOMEWORK_PRIVATE_KEY,
        }),
        FIREBASE_PROJECT_ID: 'project-test',
        FIREBASE_WEB_API_KEY: 'api-key-test',
        readDatabaseValue,
      },
      uid: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: '1',
      contextId: 'context-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: '1',
      interactionId: 'interaction-1',
    });

    expect(result).toEqual({ body: { draft: null }, init: { status: 200 } });
    expect(readDatabaseValue).toHaveBeenCalledWith(
      'book_activity/versions/activity-1/activity-version-1',
      undefined,
    );
  });
});

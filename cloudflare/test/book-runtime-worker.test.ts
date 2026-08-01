import { describe, expect, it, vi } from 'vitest';
import {
  createBookRuntimeWorkerHandlers,
} from '../src/upload-worker/book-runtime/worker.ts';
import {
  InMemoryBookRuntimeRepository,
} from '../src/upload-worker/book-runtime/repository.ts';
import {
  BOOK_DELIVERY_SCHEMA_VERSION,
  type BookDeliveryBinding,
} from '../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookRuntimeScheduleAuthority } from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import { createBookRuntimeScheduleAuthority } from '../../src/services/book-activity/activityRuntimeAttempt.service.ts';
import { resolveBookScheduleWindow } from '../../src/services/book-delivery/bookScheduleWindow.service.ts';

const operationId = '00000000-0000-4000-8000-000000000074';

const binding = (recipientId = 'student-1'): BookDeliveryBinding => ({
  schemaVersion: BOOK_DELIVERY_SCHEMA_VERSION,
  bindingId: 'binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId, recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: {
    kind: 'solo',
    contextId: 'context-1',
    recipientId,
    ownerId: 'teacher-1',
    entitlementBasis: 'solo',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full',
      sourceVersionId: 'source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-1-v1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['group-1'],
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'solo', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-07-27T00:00:00.000Z',
});

const body = (override: Record<string, unknown> = {}) => ({
  operationId,
  commandKind: 'autosave',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  clientRevision: 0,
  response: { text: 'draft' },
  ...override,
});

const request = (value: unknown) => new Request('https://worker.test/book-runtime/commands', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

const parse = async (result: Awaited<ReturnType<ReturnType<typeof createBookRuntimeWorkerHandlers>['command']>>) => ({
  status: result.init.status,
  body: result.body,
});

const scheduleAuthority = (
  authorityRevision = 1,
): BookRuntimeScheduleAuthority => ({
  ...createBookRuntimeScheduleAuthority(resolveBookScheduleWindow({
    assignmentId: 'context-1',
    recipientId: 'student-1',
    bindingId: 'binding-1',
    bindingRevision: 1,
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    operation: 'autosave',
    schedule: {
      schemaVersion: 1,
      resolverVersion: 1,
      availableFrom: '2026-07-26T00:00:00.000Z',
      finalDueAt: '2026-07-28T00:00:00.000Z',
      scheduleRules: [],
    },
    outline: binding().outline,
    studentExtensions: {},
    lateSubmissionAllowed: false,
    maxAttempts: 2,
    attemptsUsed: 0,
    policyRevision: 1,
    authorityRevision,
    evaluatedAt: '2026-07-27T00:00:00.000Z',
  })),
});

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

describe('Ticket 28A runtime Worker boundary', () => {
  it('revalidates binding, writes through repository, and returns privacy-safe receipt only', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const resolveBinding = vi.fn(async () => binding());
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding,
      resolveActivity: async () => normalizedActivity(),
      now: () => '2026-07-27T00:00:00.000Z',
      allocateAttemptId: () => 'attempt-1',
    });

    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toEqual({
      status: 200,
      body: {
        status: 'accepted',
        receipt: {
          operationId,
          status: 'accepted',
          bindingId: 'binding-1',
          draftRevision: 1,
          attemptId: undefined,
          createdAt: '2026-07-27T00:00:00.000Z',
        },
      },
    });
    expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({
      bindingId: 'binding-1',
      recipientId: 'student-1',
      contextId: 'context-1',
    }));
  });

  it('denies malformed command, disabled actor, and cross-user binding without repository mutation', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding('student-2'),
      readActor: async () => ({ uid: 'student-1', disabled: false }),
    });
    await expect(parse(await handlers.command({
      request: request({ ...body(), extra: true }),
      env: {},
      uid: 'student-1',
    }))).resolves.toMatchObject({
      status: 400,
      body: { code: 'runtime_command_unknown_field' },
    });
    await expect(parse(await createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      readActor: async () => ({ uid: 'student-1', disabled: true }),
    }).command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toMatchObject({
      status: 401,
      body: { code: 'runtime_actor_denied' },
    });
    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toMatchObject({
      status: 403,
      body: { code: 'runtime_recipient_forbidden' },
    });
    expect(repository.snapshot()).toMatchObject({ drafts: {}, attempts: {}, operations: {} });
  });

  it('reads only the authorized Activity draft through the Worker boundary', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const schedulePolicy = {
      authorize: vi.fn(() => ({ outcome: 'allowed' as const })),
    };
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedActivity(),
      schedulePolicy,
      now: () => '2026-07-27T00:00:00.000Z',
    });
    await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    });

    await expect(parse(await handlers.readDraft({
      request: new Request('https://worker.test/book-runtime/drafts/binding-1/1/context-1/placement-1/activity-1/1/interaction-1'),
      env: {},
      uid: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: '1',
      contextId: 'context-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: '1',
      interactionId: 'interaction-1',
    }))).resolves.toMatchObject({
      status: 200,
      body: {
        draft: expect.objectContaining({
          recipientId: 'student-1',
          response: { text: 'draft' },
          revision: 1,
        }),
      },
    });
    expect(schedulePolicy.authorize).toHaveBeenLastCalledWith(expect.objectContaining({
      operation: 'state',
      target: {
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
      },
    }));
  });

  it('revalidates versioned Homework schedule authority immediately before mutation', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const homework = {
      ...binding(),
      context: {
        ...binding().context,
        kind: 'homework' as const,
        entitlementBasis: 'assignment' as const,
      },
      schedulePolicy: {
        policyId: 'homework-policy',
        policyRevision: 1,
        basis: 'immutable-reference' as const,
      },
    };
    const schedulePolicy = {
      authorize: vi.fn(() => ({
        outcome: 'allowed' as const,
        authority: scheduleAuthority(1),
      })),
      revalidate: vi.fn(() => ({
        outcome: 'allowed' as const,
        authority: {
          ...scheduleAuthority(2),
          privateReleaseAt: '2026-07-27T01:00:00.000Z',
          privateExtensionOwner: 'student-1',
        },
      })),
    };
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => homework,
      resolveActivity: async () => normalizedActivity(),
      schedulePolicy,
      now: () => '2026-07-27T00:00:00.000Z',
    });

    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toEqual({
      status: 409,
      body: {
        code: 'runtime_schedule_authority_stale',
        currentScheduleAuthority: scheduleAuthority(2),
      },
    });
    expect(schedulePolicy.revalidate).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'autosave',
      previousAuthority: scheduleAuthority(1),
      target: expect.objectContaining({ placementId: 'placement-1' }),
    }));
    expect(repository.snapshot()).toMatchObject({
      drafts: {},
      attempts: {},
      operations: {},
    });
  });

  it('fails closed before schedule or mutation when the Interaction is not in the Activity', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const readDraft = vi.spyOn(repository, 'readDraft');
    const schedulePolicy = {
      authorize: vi.fn(() => ({ outcome: 'allowed' as const })),
    };
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => ({
        ...normalizedActivity(),
        interactions: [],
      }),
      schedulePolicy,
    });

    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toMatchObject({
      status: 404,
      body: { code: 'runtime_interaction_not_found' },
    });
    expect(schedulePolicy.authorize).not.toHaveBeenCalled();
    expect(repository.snapshot()).toMatchObject({ drafts: {}, operations: {} });

    await expect(parse(await handlers.readDraft({
      request: new Request('https://worker.test/book-runtime/drafts'),
      env: {},
      uid: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: '1',
      contextId: 'context-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: '1',
      interactionId: 'interaction-1',
    }))).resolves.toMatchObject({
      status: 404,
      body: { code: 'runtime_interaction_not_found' },
    });
    expect(schedulePolicy.authorize).not.toHaveBeenCalled();
    expect(readDraft).not.toHaveBeenCalled();
  });

  it('fails closed without a target resolver before policy or repository access', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const applyCommand = vi.spyOn(repository, 'applyCommand');
    const schedulePolicy = {
      authorize: vi.fn(() => ({ outcome: 'allowed' as const })),
    };
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      schedulePolicy,
    });

    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'student-1',
    }))).resolves.toEqual({
      status: 503,
      body: { code: 'runtime_target_resolver_unavailable' },
    });
    expect(schedulePolicy.authorize).not.toHaveBeenCalled();
    expect(applyCommand).not.toHaveBeenCalled();
  });

  it('does not expose a stale draft whose stored Activity identity differs', async () => {
    const repository = new InMemoryBookRuntimeRepository({
      drafts: {
        'student-1/context-1/placement-1/interaction-1': {
          schemaVersion: 1,
          bindingId: 'binding-1',
          bindingRevision: 2,
          recipientId: 'student-1',
          contextId: 'context-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          activityVersion: 1,
          interactionId: 'interaction-1',
          revision: 1,
          response: { text: 'stale' },
          updatedByOperationId: operationId,
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
      },
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedActivity(),
    });

    await expect(parse(await handlers.readDraft({
      request: new Request('https://worker.test/book-runtime/drafts'),
      env: {},
      uid: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: '1',
      contextId: 'context-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: '1',
      interactionId: 'interaction-1',
    }))).resolves.toEqual({
      status: 409,
      body: { code: 'runtime_draft_identity_stale' },
    });
  });
});

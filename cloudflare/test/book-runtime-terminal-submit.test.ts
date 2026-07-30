import { describe, expect, it, vi } from 'vitest';
import { createBookRuntimeWorkerHandlers } from '../src/upload-worker/book-runtime/worker.ts';
import { InMemoryBookRuntimeRepository } from '../src/upload-worker/book-runtime/repository.ts';

const operationId = '00000000-0000-4000-8000-000000000076';

const normalizedActivity = () => ({
  schemaVersion: 1 as const,
  title: 'Terminal activity',
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
    answerKey: { family: 'text-entry' as const, acceptedAnswers: ['final'] },
  }],
});

const binding = () => ({
  schemaVersion: 3 as const,
  bindingId: 'binding-1',
  revision: 1,
  status: 'active' as const,
  recipient: { recipientId: 'student-1', recipientKind: 'student' as const },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' as const },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf' as const,
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published' as const,
  },
  scope: { kind: 'placements' as const, nodeKeys: [], placementIds: ['placement-1'] },
  outline: [],
  context: {
    contextId: 'context-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    kind: 'solo' as const,
    entitlementBasis: 'solo' as const,
  },
  sourceSet: {
    strategy: 'full_pdf' as const,
    sources: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-version-1',
      lifecycle: 'verified-usable' as const,
      localPageScope: { kind: 'all' as const, pages: [] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required' as const,
    pageGroupKeys: ['page-group-1'],
    sourcePageScopes: [{ sourceKey: 'source-1', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' as const },
  createdAt: '2026-07-30T00:00:00.000Z',
});

const request = (body: Record<string, unknown>) => new Request(
  'https://worker.test/book-runtime/commands',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  },
);

const submit = (overrides: Record<string, unknown> = {}) => ({
  operationId,
  commandKind: 'submit',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextId: 'context-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  clientRevision: 1,
  response: [{
    interactionId: 'interaction-1',
    answer: 'final',
  }],
  ...overrides,
});

describe('Ticket 28C terminal submit Worker bridge', () => {
  it('returns immutable attempt status without exposing the stored response', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    await repository.applyCommand({
      command: {
        ...submit({
          commandKind: 'autosave',
          operationId: '00000000-0000-4000-8000-000000000077',
          clientRevision: 0,
        }),
      } as never,
      context: {
        actorUid: 'student-1',
        operationKind: 'autosave',
        binding: binding(),
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
        now: '2026-07-30T00:00:00.000Z',
      },
      attemptId: 'attempt-autosave',
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedActivity(),
      resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      now: () => '2026-07-30T00:00:01.000Z',
      allocateAttemptId: () => 'attempt-submit',
      requireCanonicalDraftForSubmit: true,
    });

    const result = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });

    expect(result).toEqual({
      body: {
         status: 'accepted',
         resultStatus: 'submitted',
        completionStatus: 'completed',
        receipt: {
          operationId,
          status: 'accepted',
          bindingId: 'binding-1',
          attemptId: 'attempt-submit',
          attemptNumber: 1,
          createdAt: '2026-07-30T00:00:01.000Z',
        },
      },
      init: { status: 200 },
    });
    expect(JSON.stringify(result)).not.toContain('final');
    expect(repository.snapshot()).toMatchObject({
      attempts: {
        'attempt-submit': {
          bindingRevision: 1,
          attemptNumber: 1,
          acknowledgedDraftRevision: 1,
          activityVersionId: 'activity-version-1',
          pageGroupKeys: ['page-group-1'],
          sourceProvenance: [{
            sourceKey: 'source-1',
            sourceVersionId: 'source-version-1',
            pages: [1],
          }],
          feedbackRelease: 'pending',
        },
      },
      results: {
          'attempt-submit:result': {
            bindingRevision: 1,
            attemptNumber: 1,
            feedbackRelease: 'pending',
            score: {
              status: 'scored',
              earnedScore: 1,
              maximumScore: 1,
              displayScore: '1.00 / 1.00',
            },
          },
      },
    });
  });

  it('rejects a submit whose response differs from the acknowledged canonical draft', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    await repository.applyCommand({
      command: {
        ...submit({
          commandKind: 'autosave',
          operationId: '00000000-0000-4000-8000-000000000077',
          clientRevision: 0,
          response: { text: 'draft' },
        }),
      } as never,
      context: {
        actorUid: 'student-1',
        operationKind: 'autosave',
        binding: binding(),
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
        now: '2026-07-30T00:00:00.000Z',
      },
      attemptId: 'attempt-autosave',
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedActivity(),
      requireCanonicalDraftForSubmit: true,
    });
    const result = await handlers.command({
      request: request(submit({ response: { text: 'forged' } })),
      env: {},
      uid: 'student-1',
    });

    expect(result).toEqual({
      body: { code: 'runtime_submit_draft_mismatch' },
      init: { status: 409 },
    });
    expect(repository.snapshot().attempts).toEqual({});
  });

  it('rejects a forged submit Interaction before reading the canonical draft', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const readDraft = vi.spyOn(repository, 'readDraft');
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => ({
        ...normalizedActivity(),
        interactions: [],
      }),
      resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      requireCanonicalDraftForSubmit: true,
    });

    const result = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });

    expect(result).toEqual({
      body: { code: 'runtime_interaction_not_found' },
      init: { status: 404 },
    });
    expect(readDraft).not.toHaveBeenCalled();
    expect(repository.snapshot().attempts).toEqual({});
  });

  it('fails closed when the authoritative attempt policy is unavailable', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    await repository.applyCommand({
      command: {
        ...submit({
          commandKind: 'autosave',
          operationId: '00000000-0000-4000-8000-000000000077',
          clientRevision: 0,
          response: [{ interactionId: 'interaction-1', answer: 'final' }],
        }),
      } as never,
      context: {
        actorUid: 'student-1',
        operationKind: 'autosave',
        binding: binding(),
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
        now: '2026-07-30T00:00:00.000Z',
      },
      attemptId: 'attempt-autosave',
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedActivity(),
      requireCanonicalDraftForSubmit: true,
    });

    const result = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });

    expect(result).toEqual({
      body: { code: 'runtime_attempt_policy_unavailable' },
      init: { status: 503 },
    });
    expect(repository.snapshot().attempts).toEqual({});
  });

  it('fails closed when the authoritative attempt policy resolver returns no policy', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    await repository.applyCommand({
      command: {
        ...submit({
          commandKind: 'autosave',
          operationId: '00000000-0000-4000-8000-000000000077',
          clientRevision: 0,
          response: [{ interactionId: 'interaction-1', answer: 'final' }],
        }),
      } as never,
      context: {
        actorUid: 'student-1',
        operationKind: 'autosave',
        binding: binding(),
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
        now: '2026-07-30T00:00:00.000Z',
      },
      attemptId: 'attempt-autosave',
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedActivity(),
      resolveAttemptPolicy: async () => null,
      requireCanonicalDraftForSubmit: true,
    });

    const result = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });

    expect(result).toEqual({
      body: { code: 'runtime_attempt_policy_unavailable' },
      init: { status: 503 },
    });
    expect(repository.snapshot().attempts).toEqual({});
  });
});

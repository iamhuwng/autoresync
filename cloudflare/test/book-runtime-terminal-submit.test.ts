import { describe, expect, it, vi } from 'vitest';
import { createBookRuntimeWorkerHandlers } from '../src/upload-worker/book-runtime/worker.ts';
import { InMemoryBookRuntimeRepository } from '../src/upload-worker/book-runtime/repository.ts';
import { createBookRuntimeScheduleAuthority } from '../../src/services/book-activity/activityRuntimeAttempt.service.ts';
import { resolveBookScheduleWindow } from '../../src/services/book-delivery/bookScheduleWindow.service.ts';

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

const normalizedMultiInteractionActivity = () => ({
  ...normalizedActivity(),
  interactions: [
    normalizedActivity().interactions[0]!,
    {
      family: 'text-entry' as const,
      interactionId: 'interaction-2',
      prompt: 'Answer two',
      itemIdentities: { family: 'text-entry' as const, itemIds: [] as const },
      answerKey: { family: 'text-entry' as const, acceptedAnswers: ['second'] },
    },
  ],
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

const homeworkBinding = () => ({
  ...binding(),
  outline: [{
    nodeKey: 'unit-1',
    parentNodeKey: null,
    nodeType: 'unit' as const,
    order: 1,
  }],
  context: {
    contextId: 'context-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    kind: 'homework' as const,
    entitlementBasis: 'assignment' as const,
  },
});

const homeworkScheduleAuthority = () => createBookRuntimeScheduleAuthority(
  resolveBookScheduleWindow({
    assignmentId: 'context-1',
    recipientId: 'student-1',
    bindingId: 'binding-1',
    bindingRevision: 1,
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    operation: 'submit',
    schedule: {
      schemaVersion: 1,
      resolverVersion: 1,
      availableFrom: '2026-07-29T00:00:00.000Z',
      finalDueAt: '2026-07-31T00:00:00.000Z',
      scheduleRules: [],
    },
    outline: homeworkBinding().outline,
    studentExtensions: {},
    lateSubmissionAllowed: false,
    maxAttempts: 2,
    attemptsUsed: 0,
    policyRevision: 1,
    authorityRevision: 1,
    evaluatedAt: '2026-07-30T00:00:01.000Z',
  }),
);

const homeworkSchedulePolicy = {
  authorize: () => ({
    outcome: 'allowed' as const,
    authority: homeworkScheduleAuthority(),
  }),
  revalidate: () => ({
    outcome: 'allowed' as const,
    authority: homeworkScheduleAuthority(),
  }),
};

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
  it('accepts one complete Activity draft boundary and rejects a non-anchor submit', async () => {
    const repository = new InMemoryBookRuntimeRepository();
    const baseContext = {
      actorUid: 'student-1',
      operationKind: 'autosave' as const,
      binding: binding(),
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 1,
      now: '2026-07-30T00:00:00.000Z',
    };
    const fullSubmission = [
      { interactionId: 'interaction-1', answer: 'final' },
      { interactionId: 'interaction-2', answer: 'second' },
    ];
    await repository.applyCommand({
      command: {
        ...submit({
          commandKind: 'autosave',
          operationId: '00000000-0000-4000-8000-000000000078',
          clientRevision: 0,
          response: fullSubmission,
        }),
      } as never,
      context: { ...baseContext, interactionId: 'interaction-1' },
      attemptId: 'attempt-autosave-activity',
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedMultiInteractionActivity(),
      resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      now: () => '2026-07-30T00:00:01.000Z',
      allocateAttemptId: () => 'attempt-multi',
      requireCanonicalDraftForSubmit: true,
    });
    const accepted = await handlers.command({
      request: request(submit({
        operationId: '00000000-0000-4000-8000-000000000080',
        response: fullSubmission,
      })),
      env: {},
      uid: 'student-1',
    });
    expect(accepted).toMatchObject({ body: { status: 'accepted', completionStatus: 'completed' } });
    expect(repository.snapshot().attempts?.['attempt-multi']).toMatchObject({
      submissionScope: 'activity',
      requiredInteractionIds: ['interaction-1', 'interaction-2'],
      submittedInteractionIds: ['interaction-1', 'interaction-2'],
    });
    const wrongAnchor = await handlers.command({
      request: request(submit({
        operationId: '00000000-0000-4000-8000-000000000081',
        interactionId: 'interaction-2',
        response: fullSubmission,
      })),
      env: {},
      uid: 'student-1',
    });
    expect(wrongAnchor).toEqual({
      body: { code: 'runtime_submission_anchor_invalid' },
      init: { status: 409 },
    });
  });

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

  it('projects an accepted Homework terminal submit and replays it without duplicate authority', async () => {
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
        binding: homeworkBinding(),
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
        now: '2026-07-30T00:00:00.000Z',
      },
      attemptId: 'attempt-autosave',
    });
    const projectHomeworkCompletion = vi.fn(async () => undefined);
    const linkIntegrityReport = vi.fn(async () => undefined);
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => homeworkBinding(),
      resolveActivity: async () => normalizedActivity(),
      resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      schedulePolicy: homeworkSchedulePolicy,
      projectHomeworkCompletion,
      linkIntegrityReport,
      now: () => '2026-07-30T00:00:01.000Z',
      allocateAttemptId: () => 'attempt-submit',
      requireCanonicalDraftForSubmit: true,
    });

    const accepted = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });
    const replayed = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });

    expect(accepted.body.status, JSON.stringify(accepted)).toBe('accepted');
    expect(replayed.body.status).toBe('replayed');
    expect(projectHomeworkCompletion).toHaveBeenCalledTimes(2);
    expect(linkIntegrityReport).toHaveBeenCalledTimes(2);
    expect(linkIntegrityReport).toHaveBeenLastCalledWith(expect.objectContaining({
      binding: expect.objectContaining({ context: expect.objectContaining({ kind: 'homework' }) }),
      result: expect.objectContaining({
        status: 'replayed',
        completion: expect.objectContaining({ status: 'completed' }),
      }),
    }));
    expect(projectHomeworkCompletion).toHaveBeenLastCalledWith(expect.objectContaining({
      binding: expect.objectContaining({ bindingId: 'binding-1' }),
      result: expect.objectContaining({
        status: 'replayed',
        completion: expect.objectContaining({ status: 'completed' }),
      }),
    }));
    expect(Object.keys(repository.snapshot().completions ?? {})).toEqual([
      'attempt-submit:completion',
    ]);
  });

  it('keeps accepted and replayed Homework submits available when linkage fails', async () => {
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
        binding: homeworkBinding(),
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
        now: '2026-07-30T00:00:00.000Z',
      },
      attemptId: 'attempt-autosave',
    });
    const linkIntegrityReport = vi.fn().mockRejectedValue(new Error('report unavailable'));
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => homeworkBinding(),
      resolveActivity: async () => normalizedActivity(),
      resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      schedulePolicy: homeworkSchedulePolicy,
      linkIntegrityReport,
      now: () => '2026-07-30T00:00:01.000Z',
      allocateAttemptId: () => 'attempt-submit',
      requireCanonicalDraftForSubmit: true,
    });

    const accepted = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });
    const replayed = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });

    expect(accepted).toMatchObject({ body: { status: 'accepted', completionStatus: 'completed' }, init: { status: 200 } });
    expect(replayed).toMatchObject({ body: { status: 'replayed', completionStatus: 'completed' }, init: { status: 200 } });
    expect(linkIntegrityReport).toHaveBeenCalledTimes(2);
    expect(repository.snapshot()).toMatchObject({
      attempts: { 'attempt-submit': { attemptId: 'attempt-submit' } },
      results: { 'attempt-submit:result': { attemptId: 'attempt-submit' } },
      completions: { 'attempt-submit:completion': { status: 'completed' } },
    });
  });

  it('never invokes Homework completion projection for a Solo terminal submit', async () => {
    const projectHomeworkCompletion = vi.fn(async () => undefined);
    const handlers = createBookRuntimeWorkerHandlers({
      repository: new InMemoryBookRuntimeRepository(),
      resolveBinding: async () => binding(),
      resolveActivity: async () => normalizedActivity(),
      resolveAttemptPolicy: async () => ({ maxAttempts: null }),
      projectHomeworkCompletion,
      now: () => '2026-07-30T00:00:01.000Z',
      allocateAttemptId: () => 'attempt-solo',
    });

    const accepted = await handlers.command({
      request: request(submit({ clientRevision: 0 })),
      env: {},
      uid: 'student-1',
    });

    expect(accepted.body.status, JSON.stringify(accepted)).toBe('accepted');
    expect(projectHomeworkCompletion).not.toHaveBeenCalled();
  });

  it('fails closed on projection outage and repairs through the same terminal replay', async () => {
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
        binding: homeworkBinding(),
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 1,
        interactionId: 'interaction-1',
        now: '2026-07-30T00:00:00.000Z',
      },
      attemptId: 'attempt-autosave',
    });
    const projectHomeworkCompletion = vi.fn()
      .mockRejectedValueOnce(new Error('projection unavailable'))
      .mockResolvedValue(undefined);
    const handlers = createBookRuntimeWorkerHandlers({
      repository,
      resolveBinding: async () => homeworkBinding(),
      resolveActivity: async () => normalizedActivity(),
      resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      schedulePolicy: homeworkSchedulePolicy,
      projectHomeworkCompletion,
      now: () => '2026-07-30T00:00:01.000Z',
      allocateAttemptId: () => 'attempt-submit',
      requireCanonicalDraftForSubmit: true,
    });

    const unavailable = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });
    expect(unavailable).toEqual({
      body: { code: 'book_homework_completion_projection_unavailable' },
      init: { status: 503 },
    });
    expect(Object.keys(repository.snapshot().completions ?? {})).toHaveLength(1);

    const repaired = await handlers.command({
      request: request(submit()),
      env: {},
      uid: 'student-1',
    });
    expect(repaired.body.status).toBe('replayed');
    expect(projectHomeworkCompletion).toHaveBeenCalledTimes(2);
    expect(Object.keys(repository.snapshot().completions ?? {})).toHaveLength(1);
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

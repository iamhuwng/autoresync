import { describe, expect, it, vi } from 'vitest';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types';
import type { BookHomeworkAuthorityRecord } from '../../src/services/book-homework/bookHomeworkAuthority.types';
import type { BookRuntimeAttemptRecord } from '../../src/services/book-activity/activityRuntimeAttempt.types';
import {
  createBookHomeworkActivitySchedulePolicyResolver,
  createBookHomeworkScheduleEnforcement,
} from '../src/upload-worker/book-homework/schedule-enforcement';
import {
  resolveBookHomeworkDocumentWindow,
  resolveBookHomeworkLaunchWindows,
} from '../src/upload-worker/book-delivery/schedule-authority';
import { createBookRuntimeWorkerHandlers } from '../src/upload-worker/book-runtime/worker';
import { InMemoryBookRuntimeRepository } from '../src/upload-worker/book-runtime/repository';

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'binding-1',
  revision: 2,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: {
    kind: 'homework',
    contextId: 'homework-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full',
      sourceVersionId: 'source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'full-source', pages: [1] },
    }],
  },
  placements: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersionId: 'activity-v1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['page-group-1'],
    sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 4, basis: 'immutable-reference' },
  createdAt: '2026-08-01T00:00:00.000Z',
});

const authority = (revision = 5): BookHomeworkAuthorityRecord => ({
  assignmentId: 'homework-1',
  assignmentKind: 'book_activity_bundle',
  schemaVersion: 1,
  ownerId: 'teacher-1',
  bookManifest: {
    schemaVersion: 1,
    assignmentKind: 'book_activity_bundle',
    manifestVersionId: 'manifest-1',
    ownerId: 'teacher-1',
    createdByCommandId: 'create-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    bindingRevision: 2,
    book: binding().book,
    context: {
      contextId: 'homework-1',
      recipientId: 'student-1',
      kind: 'homework',
      entitlementBasis: 'assignment',
    },
    selectedTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
    outline: binding().outline,
    scheduleRules: [],
    bindings: [{
      bindingId: 'activity-binding-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 1,
      activityVersionId: 'activity-v1',
      nodeKey: 'unit-1',
      order: 1,
      contextMode: 'required',
      pageGroupKeys: ['page-group-1'],
      sourceReadiness: 'ready',
      sourceContext: [{
        sourceKey: 'full',
        sourceVersionId: 'source-v1',
        physicalPageNumbers: [1],
      }],
      state: 'required',
    }],
    completion: {
      aggregation: 'required-activities-submitted-over-required-activities',
      requiredBindingCount: 1,
      excludedBindingCount: 0,
      legacyScoreFields: 'untouched',
    },
  },
  schedule: {
    schemaVersion: 1,
    resolverVersion: 1,
    availableFrom: '2026-08-05T00:00:00.000Z',
    finalDueAt: '2026-08-10T00:00:00.000Z',
    scheduleRules: [],
  },
  activityPolicies: {
    'placement-1': {
      schemaVersion: 1,
      policyId: 'policy-1',
      policyRevision: 4,
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-v1',
      activityVersion: 1,
      lateSubmissionAllowed: false,
      maxAttempts: 2,
    },
  },
  studentExtensions: {},
  saga: { sagaId: 'saga-1', state: 'committed', lastCommandId: 'commit-1' },
  visibility: {
    status: 'committed',
    pointerId: 'manifest-1',
    manifestVersionId: 'manifest-1',
    revision,
  },
  revision,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

const input = (operation: 'state' | 'autosave' | 'submit', now: string) => ({
  operation,
  actorUid: 'student-1',
  binding: binding(),
  target: {
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    interactionId: 'interaction-1',
  },
  now,
});

const runtimeActivity = () => ({
  schemaVersion: 1 as const,
  title: 'Retry-capable Activity',
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

const runtimeCommand = (
  commandKind: 'autosave' | 'submit',
  operationId: string,
  clientRevision: number,
) => new Request('https://worker.test/book-runtime/commands', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    operationId,
    commandKind,
    bindingId: 'binding-1',
    bindingRevision: 2,
    contextId: 'homework-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    interactionId: 'interaction-1',
    clientRevision,
    response: [{ interactionId: 'interaction-1', answer: 'final' }],
  }),
});

describe('trusted Book Homework schedule enforcement', () => {
  it('resolves frozen policy and completion from durable server repositories', async () => {
    const current = authority();
    const listAttempts = vi.fn(async () => [
      {
        attemptId: 'attempt-1',
        bindingId: 'binding-1',
        bindingRevision: 2,
        recipientId: 'student-1',
        contextId: 'homework-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-v1',
        activityVersion: 1,
      },
      {
        attemptId: 'attempt-1',
        bindingId: 'binding-1',
        bindingRevision: 2,
        recipientId: 'student-1',
        contextId: 'homework-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-v1',
        activityVersion: 1,
      },
      {
        attemptId: 'attempt-other-binding',
        bindingId: 'binding-other',
        bindingRevision: 2,
        recipientId: 'student-1',
        contextId: 'homework-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-v1',
        activityVersion: 1,
      },
      {
        attemptId: 'attempt-historical-revision',
        bindingId: 'binding-1',
        bindingRevision: 1,
        recipientId: 'student-1',
        contextId: 'homework-1',
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-v1',
        activityVersion: 1,
      },
    ] as BookRuntimeAttemptRecord[]);
    const resolver = createBookHomeworkActivitySchedulePolicyResolver({
      authorityStore: { read: async () => ({ value: current, updateTime: 'firestore-5' }) },
      runtimeRepository: { listAttempts },
    });
    await expect(resolver.resolve({
      assignmentId: 'homework-1',
      recipientId: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: 2,
      policyId: 'policy-1',
      policyRevision: 4,
      placementId: 'placement-1',
    })).resolves.toMatchObject({
      authorityRevision: 5,
      maxAttempts: 2,
      lateSubmissionAllowed: false,
      attemptsUsed: 1,
    });
    expect(listAttempts).toHaveBeenCalledWith({
      recipientId: 'student-1',
      contextId: 'homework-1',
      placementId: 'placement-1',
      bindingId: 'binding-1',
      bindingRevision: 2,
      limit: 50,
    });
  });

  it('keeps the canonical runtime retry-capable until the authoritative limit is exhausted', async () => {
    const runtimeRepository = new InMemoryBookRuntimeRepository();
    const authorityStore = {
      read: async () => ({ value: authority(), updateTime: 'firestore-5' }),
    };
    const activityPolicy = createBookHomeworkActivitySchedulePolicyResolver({
      authorityStore,
      runtimeRepository,
    });
    const schedule = createBookHomeworkScheduleEnforcement({
      authorityStore,
      activityPolicy,
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository: runtimeRepository,
      resolveBinding: async () => binding(),
      resolveActivity: async () => runtimeActivity(),
      resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
      schedulePolicy: schedule.policy,
      now: () => '2026-08-06T00:00:00.000Z',
      allocateAttemptId: ({ operationId }) => `attempt-${operationId.slice(-3)}`,
      requireCanonicalDraftForSubmit: true,
    });
    const run = (request: Request) => handlers.command({
      request,
      env: {},
      uid: 'student-1',
    });

    await expect(run(runtimeCommand(
      'autosave',
      '00000000-0000-4000-8000-000000000101',
      0,
    ))).resolves.toMatchObject({ body: { status: 'accepted' }, init: { status: 200 } });
    await expect(run(runtimeCommand(
      'submit',
      '00000000-0000-4000-8000-000000000102',
      1,
    ))).resolves.toMatchObject({
      body: { status: 'accepted', receipt: { attemptNumber: 1 } },
      init: { status: 200 },
    });

    await expect(activityPolicy.resolve({
      assignmentId: 'homework-1',
      recipientId: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: 2,
      policyId: 'policy-1',
      policyRevision: 4,
      placementId: 'placement-1',
    })).resolves.toMatchObject({ attemptsUsed: 1, maxAttempts: 2 });
    await expect(run(runtimeCommand(
      'autosave',
      '00000000-0000-4000-8000-000000000103',
      1,
    ))).resolves.toMatchObject({ body: { status: 'accepted' }, init: { status: 200 } });
    await expect(run(runtimeCommand(
      'submit',
      '00000000-0000-4000-8000-000000000104',
      2,
    ))).resolves.toMatchObject({
      body: { status: 'accepted', receipt: { attemptNumber: 2 } },
      init: { status: 200 },
    });

    await expect(run(runtimeCommand(
      'submit',
      '00000000-0000-4000-8000-000000000104',
      2,
    ))).resolves.toMatchObject({
      body: { status: 'replayed', receipt: { attemptNumber: 2 } },
      init: { status: 200 },
    });
    await expect(run(runtimeCommand(
      'submit',
      '00000000-0000-4000-8000-000000000105',
      2,
    ))).resolves.toMatchObject({
      body: {
        code: 'runtime_attempt_limit_reached',
        currentScheduleAuthority: {
          window: {
            completed: true,
            attemptsUsed: 2,
            attemptsRemaining: 0,
            attemptsExhausted: true,
            permissions: { canReview: true, canSubmit: false },
          },
        },
      },
      init: { status: 403 },
    });
    expect(Object.keys(runtimeRepository.snapshot().attempts)).toHaveLength(2);
  });

  it('fails closed when durable policy body is absent', async () => {
    const current = authority();
    const resolver = createBookHomeworkActivitySchedulePolicyResolver({
      authorityStore: {
        read: async () => ({ value: { ...current, activityPolicies: undefined }, updateTime: 'legacy' }),
      },
      runtimeRepository: { listAttempts: vi.fn(async () => []) },
    });
    await expect(resolver.resolve({
      assignmentId: 'homework-1',
      recipientId: 'student-1',
      bindingId: 'binding-1',
      bindingRevision: 2,
      policyId: 'policy-1',
      policyRevision: 4,
      placementId: 'placement-1',
    })).resolves.toBeNull();
  });

  it('uses nested schedules for Activity launch but assignment start only for PDF authorization', () => {
    const scheduleRules = [{
      nodeKey: 'unit-1',
      availableFrom: '2026-08-08T00:00:00.000Z',
      dueAt: '2026-08-10T00:00:00.000Z',
    }];
    const current: BookHomeworkAuthorityRecord = {
      ...authority(),
      bookManifest: { ...authority().bookManifest, scheduleRules },
      schedule: {
        ...authority().schedule,
        availableFrom: '2026-08-01T00:00:00.000Z',
        scheduleRules,
      },
    };
    expect(resolveBookHomeworkLaunchWindows({
      binding: binding(),
      authority: current,
      activityPolicies: {
        'placement-1': {
          policyId: 'policy-1',
          policyRevision: 4,
          authorityRevision: 5,
          placementId: 'placement-1',
          maxAttempts: 2,
          lateSubmissionAllowed: false,
          attemptsUsed: 0,
        },
      },
      evaluatedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      'placement-1': {
        operation: 'launch',
        outcome: 'denied',
        phase: 'unreleased',
        permissions: { canLaunch: false },
      },
    });
    expect(resolveBookHomeworkDocumentWindow({
      binding: binding(),
      authority: current,
      evaluatedAt: '2026-08-06T00:00:00.000Z',
    })).toMatchObject({
      operation: 'document',
      outcome: 'allowed',
      permissions: { canAccessDocument: true, canLaunch: false },
    });
  });

  it('keeps completed review visible when a later schedule revision moves release into the future', () => {
    const current = authority();
    const futureRelease = '2026-08-08T00:00:00.000Z';
    const changed: BookHomeworkAuthorityRecord = {
      ...current,
      schedule: { ...current.schedule, availableFrom: futureRelease },
    };
    expect(resolveBookHomeworkLaunchWindows({
      binding: binding(),
      authority: changed,
      activityPolicies: {
        'placement-1': {
          policyId: 'policy-1',
          policyRevision: 4,
          authorityRevision: changed.revision,
          placementId: 'placement-1',
          maxAttempts: 2,
          lateSubmissionAllowed: false,
          attemptsUsed: 1,
        },
      },
      evaluatedAt: '2026-08-06T00:00:00.000Z',
    })['placement-1']).toMatchObject({
      phase: 'unreleased',
      completed: true,
      attemptsRemaining: 1,
      permissions: {
        canLaunch: false,
        canReview: true,
        canAutosave: false,
        canSubmit: false,
      },
    });
  });

  it('projects the trusted late policy into an overdue launch decision', () => {
    expect(resolveBookHomeworkLaunchWindows({
      binding: binding(),
      authority: authority(),
      activityPolicies: {
        'placement-1': {
          policyId: 'policy-1',
          policyRevision: 4,
          authorityRevision: 5,
          placementId: 'placement-1',
          maxAttempts: 2,
          lateSubmissionAllowed: true,
          attemptsUsed: 0,
        },
      },
      evaluatedAt: '2026-08-11T00:00:00.000Z',
    })['placement-1']).toMatchObject({
      phase: 'overdue',
      lateSubmissionAllowed: true,
      permissions: { canLaunch: true, canReview: true, canSubmit: true },
    });
  });

  it('uses server input time and denies unreleased state/autosave/submit', async () => {
    const enforcement = createBookHomeworkScheduleEnforcement({
      authorityStore: { read: async () => ({ value: authority(), updateTime: 'firestore-1' }) },
      activityPolicy: {
        resolve: async () => ({
          policyId: 'policy-1',
          policyRevision: 4,
          authorityRevision: 5,
          placementId: 'placement-1',
          maxAttempts: 2,
          lateSubmissionAllowed: false,
          attemptsUsed: 0,
        }),
      },
    });
    for (const operation of ['state', 'autosave', 'submit'] as const) {
      await expect(enforcement.policy.authorize(
        input(operation, '2026-08-04T23:59:59.999Z'),
      )).resolves.toMatchObject({
        outcome: 'denied',
        code: 'runtime_activity_unreleased',
        authority: { window: { phase: 'unreleased', outcome: 'denied' } },
      });
    }
  });

  it('allows overdue autosave and applies late policy only to submit', async () => {
    let lateSubmissionAllowed = false;
    const enforcement = createBookHomeworkScheduleEnforcement({
      authorityStore: { read: async () => ({ value: authority(), updateTime: 'firestore-1' }) },
      activityPolicy: {
        resolve: async () => ({
          policyId: 'policy-1',
          policyRevision: 4,
          authorityRevision: 5,
          placementId: 'placement-1',
          maxAttempts: 2,
          lateSubmissionAllowed,
          attemptsUsed: 0,
        }),
      },
    });
    await expect(enforcement.policy.authorize(
      input('autosave', '2026-08-10T00:00:00.001Z'),
    )).resolves.toMatchObject({ outcome: 'allowed', authority: { window: { phase: 'overdue' } } });
    await expect(enforcement.policy.authorize(
      input('submit', '2026-08-10T00:00:00.001Z'),
    )).resolves.toMatchObject({ outcome: 'denied', code: 'runtime_late_submission_denied' });
    lateSubmissionAllowed = true;
    await expect(enforcement.policy.authorize(
      input('submit', '2026-08-10T00:00:00.001Z'),
    )).resolves.toMatchObject({ outcome: 'allowed' });
  });

  it('returns current authority and no stale allow when schedule changes during mutation', async () => {
    let current = authority();
    const read = vi.fn(async () => ({ value: current, updateTime: `firestore-${current.revision}` }));
    const enforcement = createBookHomeworkScheduleEnforcement({
      authorityStore: { read },
      activityPolicy: {
        resolve: async () => ({
          policyId: 'policy-1',
          policyRevision: 4,
          authorityRevision: current.revision,
          placementId: 'placement-1',
          maxAttempts: 2,
          lateSubmissionAllowed: false,
          attemptsUsed: 0,
        }),
      },
    });
    const first = await enforcement.policy.authorize(
      input('autosave', '2026-08-06T00:00:00.000Z'),
    );
    expect(first).toMatchObject({ outcome: 'allowed', authority: { authorityRevision: 5 } });
    current = {
      ...authority(6),
      schedule: {
        ...authority(6).schedule,
        availableFrom: '2026-08-20T00:00:00.000Z',
      },
      updatedAt: '2026-08-06T00:00:00.000Z',
    };
    await expect(enforcement.policy.revalidate!({
      ...input('autosave', '2026-08-06T00:00:00.001Z'),
      previousAuthority: first.outcome === 'allowed' ? first.authority! : (() => { throw new Error(); })(),
    })).resolves.toMatchObject({
      outcome: 'conflict',
      code: 'runtime_schedule_authority_stale',
      authority: {
        authorityRevision: 6,
        window: { phase: 'unreleased', outcome: 'denied' },
      },
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('fails closed for missing policy or forged binding/target identity', async () => {
    const enforcement = createBookHomeworkScheduleEnforcement({
      authorityStore: { read: async () => ({ value: authority(), updateTime: 'firestore-1' }) },
      activityPolicy: { resolve: async () => null },
    });
    await expect(enforcement.policy.authorize(
      input('autosave', '2026-08-06T00:00:00.000Z'),
    )).resolves.toEqual({
      outcome: 'unavailable',
      code: 'runtime_schedule_authority_unavailable',
    });
    await expect(enforcement.policy.authorize({
      ...input('autosave', '2026-08-06T00:00:00.000Z'),
      binding: { ...binding(), revision: 999 },
    })).resolves.toEqual({
      outcome: 'unavailable',
      code: 'runtime_schedule_authority_unavailable',
    });
  });

  it('retains completed state and review access after a later release edit', async () => {
    const enforcement = createBookHomeworkScheduleEnforcement({
      authorityStore: {
        read: async () => ({
          value: {
            ...authority(6),
            schedule: {
              ...authority(6).schedule,
              availableFrom: '2026-08-20T00:00:00.000Z',
            },
          },
          updateTime: 'firestore-6',
        }),
      },
      activityPolicy: {
        resolve: async () => ({
          policyId: 'policy-1',
          policyRevision: 4,
          authorityRevision: 6,
          placementId: 'placement-1',
          maxAttempts: 2,
          lateSubmissionAllowed: false,
          attemptsUsed: 1,
        }),
      },
    });
    await expect(enforcement.policy.authorize(
      input('state', '2026-08-06T00:00:00.000Z'),
    )).resolves.toMatchObject({
      outcome: 'allowed',
      authority: {
        window: {
          completed: true,
          attemptsRemaining: 1,
          attemptsExhausted: false,
          phase: 'unreleased',
          permissions: { canReadState: true, canReview: true, canAutosave: false },
        },
      },
    });
  });
});

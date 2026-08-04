import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookHomeworkAuthorityRecord } from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import { InMemoryBookRuntimeRepository } from '../book-runtime/repository.ts';
import { createBookRuntimeWorkerHandlers } from '../book-runtime/worker.ts';
import {
  createBookHomeworkActivitySchedulePolicyResolver,
  createBookHomeworkScheduleEnforcement,
} from './schedule-enforcement.ts';
import { resolveBookHomeworkDocumentWindow } from '../book-delivery/schedule-authority.ts';
import { createBookDocumentWorker } from '../book-delivery/document-worker.ts';

const iso = (value: number): string => new Date(value).toISOString();

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'ticket87-binding',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'ticket87-student', recipientKind: 'student' },
  issuer: { ownerId: 'ticket87-teacher', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'ticket87-book',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'ticket87-publication',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['ticket87-unit'], placementIds: [] },
  outline: [{
    nodeKey: 'ticket87-unit',
    parentNodeKey: null,
    nodeType: 'unit',
    order: 1,
  }],
  context: {
    kind: 'homework',
    contextId: 'ticket87-homework',
    recipientId: 'ticket87-student',
    ownerId: 'ticket87-teacher',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'ticket87-full',
      sourceVersionId: 'ticket87-source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: 'ticket87-placement',
    activityId: 'ticket87-activity',
    activityVersionId: 'ticket87-activity-v1',
    activityVersion: 1,
    nodeKey: 'ticket87-unit',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: ['ticket87-pages'],
    sourcePageScopes: [{ sourceKey: 'ticket87-full', pages: [1] }],
  }],
  schedulePolicy: {
    policyId: 'ticket87-policy',
    policyRevision: 1,
    basis: 'immutable-reference',
  },
  createdAt: '2026-08-01T00:00:00.000Z',
});

const authority = (
  serverNow: number,
  revision: number,
  nestedReleaseAt: string,
  assignmentReleaseAt = iso(serverNow - 60_000),
): BookHomeworkAuthorityRecord => {
  const scheduleRules = [{
    nodeKey: 'ticket87-unit',
    availableFrom: nestedReleaseAt,
    dueAt: iso(serverNow + 86_400_000),
  }];
  return {
    assignmentId: 'ticket87-homework',
    assignmentKind: 'book_activity_bundle',
    schemaVersion: 1,
    ownerId: 'ticket87-teacher',
    bookManifest: {
      schemaVersion: 1,
      assignmentKind: 'book_activity_bundle',
      manifestVersionId: 'ticket87-manifest',
      ownerId: 'ticket87-teacher',
      createdByCommandId: 'ticket87-create',
      createdAt: '2026-08-01T00:00:00.000Z',
      bindingRevision: 1,
      book: binding().book,
      context: {
        contextId: 'ticket87-homework',
        recipientId: 'ticket87-student',
        kind: 'homework',
        entitlementBasis: 'assignment',
      },
      selectedTarget: {
        kind: 'unit',
        bookId: 'ticket87-book',
        nodeKey: 'ticket87-unit',
      },
      outline: binding().outline,
      scheduleRules,
      bindings: [{
        bindingId: 'ticket87-activity-binding',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersionId: 'ticket87-activity-v1',
        activityVersion: 1,
        nodeKey: 'ticket87-unit',
        order: 1,
        contextMode: 'required',
        pageGroupKeys: ['ticket87-pages'],
        sourceReadiness: 'ready',
        sourceContext: [{
          sourceKey: 'ticket87-full',
          sourceVersionId: 'ticket87-source-v1',
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
      availableFrom: assignmentReleaseAt,
      finalDueAt: iso(serverNow + 86_400_000),
    scheduleRules,
    },
    activityPolicies: {
      'ticket87-placement': {
        schemaVersion: 1,
        policyId: 'ticket87-policy',
        policyRevision: 1,
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersionId: 'ticket87-activity-v1',
        activityVersion: 1,
        lateSubmissionAllowed: false,
        maxAttempts: 2,
      },
    },
    studentExtensions: {},
    saga: { sagaId: 'ticket87-saga', state: 'committed', lastCommandId: 'ticket87-commit' },
    visibility: {
      status: 'committed',
      pointerId: 'ticket87-manifest',
      manifestVersionId: 'ticket87-manifest',
      revision,
    },
    revision,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: iso(serverNow),
  };
};

const target = {
  operation: 'autosave' as const,
  actorUid: 'ticket87-student',
  binding: binding(),
  target: {
    placementId: 'ticket87-placement',
    activityId: 'ticket87-activity',
    activityVersion: 1,
    interactionId: 'ticket87-interaction',
  },
};

const source = {
  bookId: 'ticket87-book',
  sourceVersionId: 'ticket87-source-v1',
  storageLocationId: 'ticket87-location',
  providerKind: 'backblaze-b2-s3' as const,
  privateBucketId: 'ticket87-private',
  providerObjectKey: 'private/ticket87.pdf',
  providerFileId: 'ticket87-file',
  providerFileVersionId: 'ticket87-file-v1',
  checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
  byteSize: 8,
  provider: 'b2' as const,
  bucket: 'ticket87-private',
  objectKey: 'private/ticket87.pdf',
};

const documentDecision = {
  kind: 'book-document-authorized',
  uid: 'ticket87-student',
  bindingId: 'ticket87-binding',
  contextId: 'ticket87-homework',
  contextKind: 'homework',
  bookId: 'ticket87-book',
  bookRevision: 1,
  publicationId: 'ticket87-publication',
  publicationRevision: 1,
  sourceStrategy: 'full_pdf',
  sourceVersionIds: ['ticket87-source-v1'],
  sourceLocations: [source],
  scope: { kind: 'book' },
};

const runtimeActivity = {
  schemaVersion: 1 as const,
  title: 'Ticket 87 preview',
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
    interactionId: 'ticket87-interaction',
    prompt: 'Answer',
    itemIdentities: { family: 'text-entry' as const, itemIds: [] as const },
    answerKey: { family: 'text-entry' as const, acceptedAnswers: ['proof'] },
  }],
};

const proof = async (request: Request) => {
  const startedAt = Date.now();
  let current = authority(startedAt, 1, iso(startedAt + 3_600_000));
  const policyResolver = {
    resolve: async () => ({
      policyId: 'ticket87-policy',
      policyRevision: 1,
      authorityRevision: current.revision,
      placementId: 'ticket87-placement',
      maxAttempts: 2,
      lateSubmissionAllowed: false,
      attemptsUsed: 0,
    }),
  };
  const enforcement = createBookHomeworkScheduleEnforcement({
    authorityStore: { read: async () => ({ value: current, updateTime: `preview-${current.revision}` }) },
    activityPolicy: policyResolver,
  });
  const serverDecision = await enforcement.policy.authorize({
    ...target,
    now: iso(startedAt),
  });

  let documentAuthorizations = 0;
  const documentWorker = createBookDocumentWorker({
    authorize: async () => {
      documentAuthorizations += 1;
      const window = resolveBookHomeworkDocumentWindow({
        binding: binding(),
        authority: current,
        evaluatedAt: new Date().toISOString(),
      });
      return window.permissions.canAccessDocument
        ? { ok: true as const, decision: documentDecision as never, source }
        : { ok: false as const, status: 403 as const, code: 'forbidden' as const };
    },
    provider: {
      readObjectMetadata: async () => ({ identity: source, contentType: 'application/pdf' as const }),
      readBounded: async ({ range }) => ({
        bytes: Uint8Array.from({ length: range.length }, (_, index) => range.offset + index),
        totalByteSize: source.byteSize,
        offset: range.offset,
      }),
    },
  });
  const range = await documentWorker.fetch(new Request(
    'https://preview.invalid/document',
    { headers: { Range: 'bytes=0-3' } },
  ), {});
  await range.arrayBuffer();
  const head = await documentWorker.fetch(new Request(
    'https://preview.invalid/document',
    { method: 'HEAD' },
  ), {});

  current = authority(startedAt, 1, iso(startedAt - 60_000));
  const runtimeRepository = new InMemoryBookRuntimeRepository();
  const racePolicy = {
    authorize: async (input: Parameters<typeof enforcement.policy.authorize>[0]) => {
      const result = await enforcement.policy.authorize(input);
      current = authority(Date.now(), 2, iso(Date.now() + 3_600_000));
      return result;
    },
    revalidate: enforcement.policy.revalidate,
  };
  const runtime = createBookRuntimeWorkerHandlers({
    repository: runtimeRepository,
    resolveBinding: async () => binding(),
    resolveActivity: async () => runtimeActivity,
    schedulePolicy: racePolicy,
    now: () => new Date().toISOString(),
  });
  const race = await runtime.command({
    request: new Request('https://preview.invalid/book-runtime/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000087',
        commandKind: 'autosave',
        bindingId: 'ticket87-binding',
        bindingRevision: 1,
        contextId: 'ticket87-homework',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersion: 1,
        interactionId: 'ticket87-interaction',
        clientRevision: 0,
        response: { text: 'proof' },
      }),
    }),
    env: {},
    uid: 'ticket87-student',
  });

  current = authority(Date.now(), 3, iso(Date.now() - 60_000));
  const submitRepository = new InMemoryBookRuntimeRepository();
  const submitActivityPolicy = createBookHomeworkActivitySchedulePolicyResolver({
    authorityStore: {
      read: async () => ({ value: current, updateTime: `preview-${current.revision}` }),
    },
    runtimeRepository: submitRepository,
  });
  const submitEnforcement = createBookHomeworkScheduleEnforcement({
    authorityStore: {
      read: async () => ({ value: current, updateTime: `preview-${current.revision}` }),
    },
    activityPolicy: submitActivityPolicy,
  });
  const submitRuntime = createBookRuntimeWorkerHandlers({
    repository: submitRepository,
    resolveBinding: async () => binding(),
    resolveActivity: async () => runtimeActivity,
    resolveAttemptPolicy: async () => ({ maxAttempts: 2 }),
    schedulePolicy: submitEnforcement.policy,
    requireCanonicalDraftForSubmit: true,
    now: () => new Date().toISOString(),
  });
  const response = [{
    interactionId: 'ticket87-interaction',
    answer: 'proof',
  }];
  const saved = await submitRuntime.command({
    request: new Request('https://preview.invalid/book-runtime/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000088',
        commandKind: 'autosave',
        bindingId: 'ticket87-binding',
        bindingRevision: 1,
        contextId: 'ticket87-homework',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersion: 1,
        interactionId: 'ticket87-interaction',
        clientRevision: 0,
        response,
      }),
    }),
    env: {},
    uid: 'ticket87-student',
  });
  const submitted = await submitRuntime.command({
    request: new Request('https://preview.invalid/book-runtime/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000089',
        commandKind: 'submit',
        bindingId: 'ticket87-binding',
        bindingRevision: 1,
        contextId: 'ticket87-homework',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersion: 1,
        interactionId: 'ticket87-interaction',
        clientRevision: 1,
        response,
      }),
    }),
    env: {},
    uid: 'ticket87-student',
  });
  const savedRetry = await submitRuntime.command({
    request: new Request('https://preview.invalid/book-runtime/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000090',
        commandKind: 'autosave',
        bindingId: 'ticket87-binding',
        bindingRevision: 1,
        contextId: 'ticket87-homework',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersion: 1,
        interactionId: 'ticket87-interaction',
        clientRevision: 1,
        response,
      }),
    }),
    env: {},
    uid: 'ticket87-student',
  });
  const submittedRetry = await submitRuntime.command({
    request: new Request('https://preview.invalid/book-runtime/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000091',
        commandKind: 'submit',
        bindingId: 'ticket87-binding',
        bindingRevision: 1,
        contextId: 'ticket87-homework',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersion: 1,
        interactionId: 'ticket87-interaction',
        clientRevision: 2,
        response,
      }),
    }),
    env: {},
    uid: 'ticket87-student',
  });
  const exhausted = await submitRuntime.command({
    request: new Request('https://preview.invalid/book-runtime/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000092',
        commandKind: 'submit',
        bindingId: 'ticket87-binding',
        bindingRevision: 1,
        contextId: 'ticket87-homework',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersion: 1,
        interactionId: 'ticket87-interaction',
        clientRevision: 2,
        response,
      }),
    }),
    env: {},
    uid: 'ticket87-student',
  });
  const replayedAfterExhaustion = await submitRuntime.command({
    request: new Request('https://preview.invalid/book-runtime/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationId: '00000000-0000-4000-8000-000000000091',
        commandKind: 'submit',
        bindingId: 'ticket87-binding',
        bindingRevision: 1,
        contextId: 'ticket87-homework',
        placementId: 'ticket87-placement',
        activityId: 'ticket87-activity',
        activityVersion: 1,
        interactionId: 'ticket87-interaction',
        clientRevision: 2,
        response,
      }),
    }),
    env: {},
    uid: 'ticket87-student',
  });

  current = authority(Date.now(), 4, iso(Date.now() + 3_600_000), iso(Date.now() + 3_600_000));
  const refresh = await documentWorker.fetch(new Request('https://preview.invalid/document'), {});
  const forged = await enforcement.policy.authorize({
    ...target,
    binding: { ...binding(), revision: 99 },
    now: new Date().toISOString(),
  });
  const finishedAt = Date.now();
  return {
    proofKind: 'prd0062-ticket87-production-equivalent',
    serverTime: {
      startedAt: iso(startedAt),
      finishedAt: iso(finishedAt),
      clientNowIgnored: new URL(request.url).searchParams.get('clientNow'),
      evaluatedAt: serverDecision.outcome === 'allowed'
        ? serverDecision.authority?.evaluatedAt
        : serverDecision.authority?.evaluatedAt,
      phase: serverDecision.authority?.window.phase,
      outcome: serverDecision.outcome,
    },
    document: {
      nestedActivityUnreleased: serverDecision.authority?.window.phase === 'unreleased',
      rangeStatus: range.status,
      headStatus: head.status,
      refreshAfterAssignmentMutationStatus: refresh.status,
      authorizationCount: documentAuthorizations,
    },
    race: {
      status: race.init.status,
      body: race.body,
      noWrite: Object.keys(runtimeRepository.snapshot().drafts).length === 0,
    },
    submit: {
      saveStatus: saved.init.status,
      submitStatus: submitted.init.status,
      body: submitted.body,
      retrySaveStatus: savedRetry.init.status,
      retrySubmitStatus: submittedRetry.init.status,
      retryBody: submittedRetry.body,
      exhaustedStatus: exhausted.init.status,
      exhaustedBody: exhausted.body,
      replayAfterExhaustionStatus: replayedAfterExhaustion.init.status,
      replayAfterExhaustionBody: replayedAfterExhaustion.body,
      attemptCount: Object.keys(submitRepository.snapshot().attempts).length,
      completionCount: Object.keys(submitRepository.snapshot().completions).length,
    },
    forgedBinding: forged,
    pass: serverDecision.outcome === 'denied'
      && range.status === 206
      && head.status === 200
      && refresh.status === 403
      && documentAuthorizations === 3
      && race.init.status === 409
      && Object.keys(runtimeRepository.snapshot().drafts).length === 0
      && saved.init.status === 200
      && submitted.init.status === 200
      && savedRetry.init.status === 200
      && submittedRetry.init.status === 200
      && exhausted.init.status === 403
      && exhausted.body.code === 'runtime_attempt_limit_reached'
      && replayedAfterExhaustion.init.status === 200
      && replayedAfterExhaustion.body.status === 'replayed'
      && replayedAfterExhaustion.body.receipt?.attemptNumber === 2
      && Object.keys(submitRepository.snapshot().attempts).length === 2
      && Object.keys(submitRepository.snapshot().completions).length === 2
      && forged.outcome === 'unavailable'
      && finishedAt >= startedAt,
  };
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/proof') {
      return new Response(JSON.stringify({
        code: 'ticket87_preview_fail_closed',
        writable: false,
      }), {
        status: 503,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }
    try {
      const result = await proof(request);
      return new Response(JSON.stringify(result), {
        status: result.pass ? 200 : 500,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    } catch {
      return new Response(JSON.stringify({ code: 'ticket87_preview_proof_failed' }), {
        status: 500,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }
  },
} satisfies ExportedHandler;

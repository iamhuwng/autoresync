import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_HOMEWORK_ASSIGNMENT_KIND,
  BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
  type BookHomeworkManifest,
} from '../../src/types/homework.types.ts';
import type { BookHomeworkAuthoritySchedule } from '../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type { BookHomeworkSagaCanonicalState, BookHomeworkSagaCommand } from '../../src/services/book-homework/bookHomeworkSaga.types.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookDeliveryPublishedPublicationReference } from '../../src/services/book-delivery/bookDelivery.publication.ts';
import {
  BookHomeworkAssignmentSaga,
  type BookHomeworkSagaDependencies,
} from '../src/upload-worker/book-homework/saga.ts';
import {
  InMemoryBookHomeworkSagaRepository,
} from '../src/upload-worker/book-homework/sagaRepository.ts';
import {
  BookHomeworkAuthorityRepository,
  InMemoryBookHomeworkDocumentStore,
} from '../src/upload-worker/book-homework/repository.ts';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository.ts';
import {
  createBookHomeworkActivitySchedulePolicyResolver,
  createBookHomeworkScheduleEnforcement,
} from '../src/upload-worker/book-homework/schedule-enforcement.ts';
import { createBookRuntimeWorkerHandlers } from '../src/upload-worker/book-runtime/worker.ts';
import { InMemoryBookRuntimeRepository } from '../src/upload-worker/book-runtime/repository.ts';

const ROOT_CONTEXT_ID = 'assignment-terminal';
const RECIPIENT_ID = 'student-terminal';
const OWNER_ID = 'teacher-terminal';
const BINDING_REVISION = 7;
const PLACEMENT_ID = 'placement-terminal';
const ACTIVITY_ID = 'activity-terminal';
const ACTIVITY_VERSION_ID = 'activity-terminal-v4';
const ACTIVITY_VERSION = 4;
const INTERACTION_ID = 'interaction-terminal';
const SOURCE_KEY = 'source-terminal';
const SOURCE_VERSION_ID = 'source-terminal-v2';
const PAGE_GROUP_KEY = 'pages-terminal';
const CREATED_AT = '2026-08-01T00:00:00.000Z';
const RUNTIME_NOW = '2026-08-01T00:00:01.000Z';

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const publication = (): BookDeliveryPublishedPublicationReference => ({
  bookId: 'book-terminal',
  bookMode: 'pdf',
  bookRevision: 3,
  publicationId: 'publication-terminal',
  publicationRevision: 9,
  publicationStatus: 'published',
  ownerId: OWNER_ID,
  scope: { kind: 'subtree', nodeKeys: ['unit-terminal'], placementIds: [] },
  outline: [{
    nodeKey: 'unit-terminal',
    parentNodeKey: null,
    nodeType: 'unit',
    order: 1,
    titleSnapshot: 'Terminal Unit',
  }],
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: SOURCE_KEY,
      sourceVersionId: SOURCE_VERSION_ID,
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [{
    placementId: PLACEMENT_ID,
    activityId: ACTIVITY_ID,
    activityVersionId: ACTIVITY_VERSION_ID,
    activityVersion: ACTIVITY_VERSION,
    nodeKey: 'unit-terminal',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: [PAGE_GROUP_KEY],
    sourcePageScopes: [{ sourceKey: SOURCE_KEY, pages: [11] }],
  }],
  schedulePolicy: {
    policyId: 'policy-terminal',
    policyRevision: 3,
    basis: 'immutable-reference',
  },
});

const manifest = (): BookHomeworkManifest => ({
  schemaVersion: BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
  assignmentKind: BOOK_HOMEWORK_ASSIGNMENT_KIND,
  manifestVersionId: 'manifest-terminal',
  ownerId: OWNER_ID,
  createdByCommandId: 'manifest-terminal-command',
  createdAt: CREATED_AT,
  bindingRevision: BINDING_REVISION,
  book: {
    bookId: 'book-terminal',
    bookMode: 'pdf',
    bookRevision: 3,
    publicationId: 'publication-terminal',
    publicationRevision: 9,
    publicationStatus: 'published',
  },
  context: {
    contextId: ROOT_CONTEXT_ID,
    recipientId: RECIPIENT_ID,
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: { kind: 'unit', bookId: 'book-terminal', nodeKey: 'unit-terminal' },
  outline: [{
    nodeKey: 'unit-terminal',
    parentNodeKey: null,
    nodeType: 'unit',
    order: 1,
    titleSnapshot: 'Terminal Unit',
  }],
  scheduleRules: [{
    nodeKey: 'unit-terminal',
    availableFrom: '2026-07-31T00:00:00.000Z',
    dueAt: '2026-08-31T00:00:00.000Z',
  }],
  bindings: [{
    bindingId: 'activity-binding-terminal',
    placementId: PLACEMENT_ID,
    activityId: ACTIVITY_ID,
    nodeKey: 'unit-terminal',
    order: 1,
    contextMode: 'required',
    pageGroupKeys: [PAGE_GROUP_KEY],
    sourceReadiness: 'ready',
    state: 'required',
    activityVersion: ACTIVITY_VERSION,
    activityVersionId: ACTIVITY_VERSION_ID,
    sourceContext: [{
      sourceKey: SOURCE_KEY,
      sourceVersionId: SOURCE_VERSION_ID,
      physicalPageNumbers: [11],
    }],
  }],
  completion: {
    aggregation: 'required-activities-submitted-over-required-activities',
    requiredBindingCount: 1,
    excludedBindingCount: 0,
    legacyScoreFields: 'untouched',
  },
});

const schedule = (): BookHomeworkAuthoritySchedule => ({
  schemaVersion: 1,
  resolverVersion: 1,
  availableFrom: '2026-07-31T00:00:00.000Z',
  finalDueAt: '2026-08-31T00:00:00.000Z',
  scheduleRules: manifest().scheduleRules,
});

const canonical = (): BookHomeworkSagaCanonicalState => {
  const nextManifest = manifest();
  return {
    ownerId: OWNER_ID,
    manifest: nextManifest,
    schedule: schedule(),
    recipientIds: [RECIPIENT_ID],
    studentExtensions: {},
    publication: {
      bookId: 'book-terminal',
      publicationId: 'publication-terminal',
      publicationRevision: 9,
      manifestVersionId: 'manifest-terminal',
      fingerprint: 'publication-terminal-fingerprint',
    },
    deliveryPublication: publication(),
    sourceReadiness: 'ready',
    exposureApproval: { approved: true, fingerprint: 'exposure-terminal-fingerprint' },
    capabilities: { canAssignBookHomework: true },
    frozenPolicy: {
      policyId: 'policy-terminal',
      policyRevision: 3,
      fingerprint: 'policy-terminal-fingerprint',
      activityPolicies: {
        [PLACEMENT_ID]: { lateSubmissionAllowed: false, maxAttempts: 2 },
      },
    },
  };
};

const command = (
  value: BookHomeworkSagaCanonicalState = canonical(),
  overrides: Partial<BookHomeworkSagaCommand> = {},
): BookHomeworkSagaCommand => ({
  assignmentId: ROOT_CONTEXT_ID,
  ownerId: OWNER_ID,
  operationId: '00000000-0000-4000-8000-000000000185',
  idempotencyKey: 'idempotency-terminal',
  manifestVersionId: value.manifest.manifestVersionId,
  selectedRecipientIds: [RECIPIENT_ID],
  expectedManifestFingerprint: stable(value.manifest),
  expectedPublicationFingerprint: value.publication.fingerprint,
  expectedExposureApprovalFingerprint: value.exposureApproval.fingerprint,
  expectedPolicyFingerprint: value.frozenPolicy.fingerprint,
  createdAt: CREATED_AT,
  ...overrides,
});

const activity = () => ({
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
    interactionId: INTERACTION_ID,
    prompt: 'Answer',
    itemIdentities: { family: 'text-entry' as const, itemIds: [] as const },
    answerKey: { family: 'text-entry' as const, acceptedAnswers: ['terminal-answer'] },
  }],
});

const request = (body: Record<string, unknown>): Request => new Request(
  'https://runtime.test/book-runtime/commands',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  },
);

const createSagaHarness = (canonicalState = canonical()) => {
  const sagaRepository = new InMemoryBookHomeworkSagaRepository();
  const documentStore = new InMemoryBookHomeworkDocumentStore();
  const authorityRepository = new BookHomeworkAuthorityRepository(documentStore, {
    resolveAffectedStudentStates: async () => ['not-started'],
    resolveCommittedRoot: async (record) => {
      const root = await sagaRepository.read(ROOT_CONTEXT_ID);
      return root?.state === 'committed'
        && root.visibility === 'committed'
        && root.contextId === ROOT_CONTEXT_ID
        && root.recipients.some((entry) => entry.authorityId === record.assignmentId
          && entry.recipientId === record.bookManifest.context.recipientId
          && entry.state === 'committed');
    },
  });
  const deliveryRepository = new InMemoryBookDeliveryRepository();
  const dependencies: BookHomeworkSagaDependencies = {
    sagaRepository,
    authorityRepository,
    deliveryRepository,
    resolveCanonical: async () => canonicalState,
  };
  return {
    saga: new BookHomeworkAssignmentSaga(dependencies),
    sagaRepository,
    documentStore,
    authorityRepository,
    deliveryRepository,
    canonicalState,
  };
};

const setup = async () => {
  const harness = createSagaHarness();
  const {
    saga,
    sagaRepository,
    documentStore,
    authorityRepository,
    deliveryRepository,
    canonicalState,
  } = harness;
  const committed = await saga.execute(command(canonicalState));
  const entry = committed.record.recipients[0];
  if (!entry) throw new Error('missing_committed_recipient');
  const authority = await authorityRepository.read(entry.authorityId);
  const delivery = await deliveryRepository.resolveCurrent(RECIPIENT_ID, ROOT_CONTEXT_ID);
  if (!authority || !delivery) throw new Error('missing_committed_projection');

  const authorityReads: string[] = [];
  const authorityStore = {
    read: async (assignmentId: string) => {
      authorityReads.push(assignmentId);
      return documentStore.read(assignmentId);
    },
  };
  const policyResolver = createBookHomeworkActivitySchedulePolicyResolver({
    authorityStore,
    runtimeRepository: new InMemoryBookRuntimeRepository(),
  });
  const enforcement = createBookHomeworkScheduleEnforcement({
    authorityStore,
    activityPolicy: policyResolver,
  });
  return {
    saga,
    committed,
    entry,
    authority,
    binding: delivery.record.binding,
    delivery,
    authorityReads,
    enforcement,
    authorityRepository,
    deliveryRepository,
    sagaRepository,
    documentStore,
  };
};

describe('Book Homework saga to first terminal runtime submission', () => {
  it('commits recipient authority and Delivery, then accepts one exact terminal submit', async () => {
    const fixture = await setup();
    const runtimeRepository = new InMemoryBookRuntimeRepository();
    const resolveActivity = vi.fn(async (input: {
      readonly binding: BookDeliveryBinding;
      readonly placementId: string;
      readonly activityId: string;
      readonly activityVersion: number;
    }) => {
      expect(input.binding.context.contextId).toBe(ROOT_CONTEXT_ID);
      expect(input.binding.revision).toBe(BINDING_REVISION);
      expect(input.placementId).toBe(PLACEMENT_ID);
      expect(input.activityId).toBe(ACTIVITY_ID);
      expect(input.activityVersion).toBe(ACTIVITY_VERSION);
      return activity();
    });
    const handlers = createBookRuntimeWorkerHandlers({
      repository: runtimeRepository,
      resolveBinding: async ({ bindingId }) => (
        await fixture.deliveryRepository.readBinding(bindingId)
      )?.binding ?? null,
      resolveActivity,
      resolveAttemptPolicy: async ({ binding, placementId, activityId, activityVersion }) => {
        expect(binding.bindingId).toBe(fixture.binding.bindingId);
        expect(placementId).toBe(PLACEMENT_ID);
        expect(activityId).toBe(ACTIVITY_ID);
        expect(activityVersion).toBe(ACTIVITY_VERSION);
        return { maxAttempts: 2 };
      },
      schedulePolicy: fixture.enforcement.policy,
      requireCanonicalDraftForSubmit: true,
      allocateAttemptId: () => 'attempt-terminal-1',
      now: () => RUNTIME_NOW,
    });
    const response = [{ interactionId: INTERACTION_ID, answer: 'terminal-answer' }];
    const common = {
      bindingId: fixture.binding.bindingId,
      bindingRevision: BINDING_REVISION,
      contextId: ROOT_CONTEXT_ID,
      placementId: PLACEMENT_ID,
      activityId: ACTIVITY_ID,
      activityVersion: ACTIVITY_VERSION,
      interactionId: INTERACTION_ID,
      response,
    };
    const saved = await handlers.command({
      request: request({
        operationId: '00000000-0000-4000-8000-000000000186',
        commandKind: 'autosave',
        clientRevision: 0,
        ...common,
      }),
      env: {},
      uid: RECIPIENT_ID,
    });
    const submitted = await handlers.command({
      request: request({
        operationId: '00000000-0000-4000-8000-000000000187',
        commandKind: 'submit',
        clientRevision: 1,
        ...common,
      }),
      env: {},
      uid: RECIPIENT_ID,
    });

    expect(fixture.committed.status).toBe('committed');
    expect(fixture.committed.record.visibility).toBe('committed');
    expect(fixture.authority.assignmentId).toBe(fixture.entry.authorityId);
    expect(fixture.authority.saga.sagaId).toBe(ROOT_CONTEXT_ID);
    expect(fixture.authority.bookManifest.context).toEqual({
      contextId: ROOT_CONTEXT_ID,
      recipientId: RECIPIENT_ID,
      kind: 'homework',
      entitlementBasis: 'assignment',
    });
    expect(fixture.authority.bookManifest.bindingRevision).toBe(BINDING_REVISION);
    expect(fixture.delivery.record.status).toBe('active');
    expect(fixture.binding).toMatchObject({
      bindingId: fixture.entry.bindingId,
      revision: BINDING_REVISION,
      status: 'active',
      context: {
        contextId: ROOT_CONTEXT_ID,
        recipientId: RECIPIENT_ID,
      },
      placements: [{
        placementId: PLACEMENT_ID,
        activityId: ACTIVITY_ID,
        activityVersionId: ACTIVITY_VERSION_ID,
        activityVersion: ACTIVITY_VERSION,
        pageGroupKeys: [PAGE_GROUP_KEY],
        sourcePageScopes: [{ sourceKey: SOURCE_KEY, pages: [11] }],
      }],
    });
    expect(saved.init.status).toBe(200);
    expect(submitted).toMatchObject({
      init: { status: 200 },
      body: {
        status: 'accepted',
        resultStatus: 'submitted',
        completionStatus: 'completed',
        receipt: {
          bindingId: fixture.binding.bindingId,
          attemptId: 'attempt-terminal-1',
          attemptNumber: 1,
        },
      },
    });
    expect(resolveActivity).toHaveBeenCalled();
    expect(fixture.authorityReads).toContain(fixture.entry.authorityId);
    expect(runtimeRepository.snapshot()).toMatchObject({
      attempts: {
        'attempt-terminal-1': {
          bindingId: fixture.binding.bindingId,
          bindingRevision: BINDING_REVISION,
          recipientId: RECIPIENT_ID,
          contextId: ROOT_CONTEXT_ID,
          placementId: PLACEMENT_ID,
          activityId: ACTIVITY_ID,
          activityVersion: ACTIVITY_VERSION,
          activityVersionId: ACTIVITY_VERSION_ID,
          pageGroupKeys: [PAGE_GROUP_KEY],
          sourceProvenance: [{
            sourceKey: SOURCE_KEY,
            sourceVersionId: SOURCE_VERSION_ID,
            pages: [11],
          }],
        },
      },
    });
  });

  it('rejects a root-context or binding-revision mismatch before any terminal write', async () => {
    const fixture = await setup();
    const runtimeRepository = new InMemoryBookRuntimeRepository();
    const handlers = createBookRuntimeWorkerHandlers({
      repository: runtimeRepository,
      resolveBinding: async ({ bindingId }) => (
        await fixture.deliveryRepository.readBinding(bindingId)
      )?.binding ?? null,
      resolveActivity: async () => activity(),
      schedulePolicy: fixture.enforcement.policy,
      now: () => RUNTIME_NOW,
    });

    const result = await handlers.command({
      request: request({
        operationId: '00000000-0000-4000-8000-000000000188',
        commandKind: 'submit',
        bindingId: fixture.binding.bindingId,
        bindingRevision: BINDING_REVISION + 1,
        contextId: ROOT_CONTEXT_ID,
        placementId: PLACEMENT_ID,
        activityId: ACTIVITY_ID,
        activityVersion: ACTIVITY_VERSION,
        interactionId: INTERACTION_ID,
        clientRevision: 0,
        response: [{ interactionId: INTERACTION_ID, answer: 'terminal-answer' }],
      }),
      env: {},
      uid: RECIPIENT_ID,
    });

    expect(result).toEqual({
      body: { code: 'runtime_binding_stale' },
      init: { status: 409 },
    });
    expect(runtimeRepository.snapshot().attempts).toEqual({});
  });

  it('rejects a command root/context mismatch before creating a saga or child records', async () => {
    const harness = createSagaHarness();

    await expect(harness.saga.execute(command(harness.canonicalState, {
      assignmentId: 'different-root',
    }))).rejects.toMatchObject({ code: 'stale-input' });
    await expect(harness.sagaRepository.read(ROOT_CONTEXT_ID)).resolves.toBeNull();
    await expect(harness.sagaRepository.read('different-root')).resolves.toBeNull();
    await expect(harness.documentStore.read(
      `${ROOT_CONTEXT_ID}--${RECIPIENT_ID}--authority`,
    )).resolves.toBeNull();
    await expect(harness.deliveryRepository.readBinding(
      `${ROOT_CONTEXT_ID}--${RECIPIENT_ID}--delivery`,
    )).resolves.toBeNull();
  });

  it('rejects a Delivery Placement Activity Version mismatch before any saga mutation', async () => {
    const mismatched = canonical();
    const mismatchedCanonical: BookHomeworkSagaCanonicalState = {
      ...mismatched,
      deliveryPublication: {
        ...mismatched.deliveryPublication,
        placements: mismatched.deliveryPublication.placements.map((placement) => ({
          ...placement,
          activityVersion: placement.activityVersion + 1,
        })),
      },
    };
    const harness = createSagaHarness(mismatchedCanonical);

    await expect(harness.saga.execute(command(mismatchedCanonical)))
      .rejects.toMatchObject({ code: 'stale-publication' });
    await expect(harness.sagaRepository.read(ROOT_CONTEXT_ID)).resolves.toBeNull();
    await expect(harness.documentStore.read(
      `${ROOT_CONTEXT_ID}--${RECIPIENT_ID}--authority`,
    )).resolves.toBeNull();
    await expect(harness.deliveryRepository.readBinding(
      `${ROOT_CONTEXT_ID}--${RECIPIENT_ID}--delivery`,
    )).resolves.toBeNull();
  });
});

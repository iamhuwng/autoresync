import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  BookAssemblyPublicationAdapterPlan,
} from '../../types/bookAssembly.types';
import type { EditableActivity } from '../../types/bookActivity.types';
import { InMemoryBookAssemblyPublicationRepository } from '../../services/book-assembly/publicationRepository';
import { normalizeActivity } from '../../services/book-activity/activityCanonical.service';
import { projectStudentActivity } from '../../services/book-activity/activityProjection.service';
import {
  createCanonicalActivityVersionFingerprint,
  type CanonicalPublishedActivityVersionRecord,
} from '../../services/book-assembly/canonicalActivityVersion.service';
import {
  InMemoryCanonicalActivityVersionRepository,
} from '../../services/book-assembly/canonicalPublicationRepository';
import {
  bookAssemblyActivityVersionScopeKey,
} from '../../services/book-assembly/publicationTransaction.service';
import {
  createBookAssemblyPublicationWorkerHandlers,
  fingerprintBookAssemblyPublicationAuthorityPlan,
  type BookAssemblyPublicationAuthorityGate,
  type BookAssemblyPublicationAuthoritySnapshot,
} from '../../../cloudflare/src/upload-worker/book-assembly/publication-worker';

const op = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const request = (body: unknown): Request => new Request('https://worker.test/book-assembly/publications', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const previewApproval = (
  overrides: Partial<BookAssemblyPreviewApprovalReference> = {},
): BookAssemblyPreviewApprovalReference => ({
  approvalId: 'approval-1',
  approvalRevision: 1,
  approvedAt: '2026-07-27T00:00:00.000Z',
  expiresAt: '2026-07-28T00:00:00.000Z',
  ...overrides,
});

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-1',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-1'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-1',
      sourceKey: 'full',
      pages: [1],
      activityKeys: ['activity-1'],
      mode: 'activity',
    }],
  }],
});

const atomicWrites = (
  body: BookAssemblyManifestCandidate,
  publicationId: string,
  publicationRevision: number,
  operationId: string,
) => ({
  activityVersions: [{
    schemaVersion: 1 as const,
    activityId: 'activity-1',
    activityVersionId: `${publicationId}:activity-1:v${publicationRevision}`,
    activityVersion: publicationRevision,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    unitKey: 'unit-1',
    activityKey: 'activity-1',
    createdByCommandId: operationId,
    createdAt: '2026-07-27T00:00:00.000Z',
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
    payloadFingerprint: `fnv1a64:activity000${publicationRevision}`,
  }],
  activitySafeProjections: [{
    schemaVersion: 1 as const,
    projectionId: `${publicationId}:activity-1:safe`,
    activityId: 'activity-1',
    activityVersionId: `${publicationId}:activity-1:v${publicationRevision}`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    placementIds: [`${publicationId}:placement-1`],
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
    payloadFingerprint: `fnv1a64:safe0000000${publicationRevision}`,
  }],
  placements: [{
    schemaVersion: 1 as const,
    placementId: `${publicationId}:placement-1`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    unitKey: 'unit-1',
    nodeKey: 'unit-1',
    activityKey: 'activity-1',
    activityId: 'activity-1',
    activityVersionId: `${publicationId}:activity-1:v${publicationRevision}`,
    order: 1,
    pageGroupKeys: ['pages-1'],
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
  }],
  unitProjections: [{
    schemaVersion: 1 as const,
    unitProjectionId: `${publicationId}:unit-1`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    unitKey: 'unit-1',
    placementIds: [`${publicationId}:placement-1`],
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
    createdByCommandId: operationId,
    createdAt: '2026-07-27T00:00:00.000Z',
  }],
  deliveryPlans: [{
    schemaVersion: 1 as const,
    deliveryPlanId: `${publicationId}:delivery`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    sourceStrategy: 'full_pdf' as const,
    sourceSet: body.sourceSet,
    placementIds: [`${publicationId}:placement-1`],
    unitProjectionIds: [`${publicationId}:unit-1`],
    createdByCommandId: operationId,
    createdAt: '2026-07-27T00:00:00.000Z',
  }],
});

const plan = (
  publicationId = 'publication-1',
  publicationRevision = 1,
  operationId = op('1'),
): BookAssemblyPublicationAdapterPlan => {
  const body = manifest();
  return {
    strategy: 'full_pdf',
    planId: `plan-${publicationRevision}`,
    adapterTicket: 'fixture',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    candidateId: 'candidate-1',
    candidateRevision: 3,
    bookRevision: 4,
    sourceSetRevision: 2,
    sourceSet: body.sourceSet,
    manifest: body,
    previewApproval: previewApproval(),
    studentSafeProjection: {
      schemaVersion: 1,
      bookId: 'book-1',
      publicationId,
      publicationRevision,
      sourceStrategy: 'full_pdf',
      sourceSet: body.sourceSet,
      units: body.units,
    },
    atomicWrites: atomicWrites(body, publicationId, publicationRevision, operationId),
  };
};

const editableActivity = (): EditableActivity => ({
  schemaVersion: 1,
  title: 'Assembly fixture Activity',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Choose one answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single-choice' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{
    prompt: 'Which answer is correct?',
    options: ['A', 'B'],
    acceptedOptionIndexes: [0],
  }],
  scoring: { mode: 'auto-where-possible' },
});

const authorityGate = (
  overrides: Partial<BookAssemblyPublicationAuthoritySnapshot> = {},
): BookAssemblyPublicationAuthorityGate => async (input) => ({
  status: 'current',
  snapshot: {
    ownerId: input.ownerId,
    bookId: input.bookId,
    candidateId: input.candidateId,
    candidateRevision: input.candidateRevision,
    bookRevision: input.bookRevision,
    sourceSetRevision: input.sourceSetRevision,
    planFingerprint: input.planFingerprint,
    previewApproval: input.previewApproval
      ? { ...input.previewApproval, revoked: false }
      : null,
    ...overrides,
  },
});

const bindApprovalToPlan = (
  value: BookAssemblyPublicationAdapterPlan,
): BookAssemblyPublicationAdapterPlan => ({
  ...value,
  previewApproval: {
    ...value.previewApproval!,
    approvedInputFingerprint: fingerprintBookAssemblyPublicationAuthorityPlan(value),
  },
});

const createHandlers = (input: {
  readonly authorityGate?: BookAssemblyPublicationAuthorityGate;
  readonly now?: () => string;
}) => createBookAssemblyPublicationWorkerHandlers({
  repository: new InMemoryBookAssemblyPublicationRepository(),
  activityVersionWriter: new InMemoryCanonicalActivityVersionRepository(),
  authorityGate: input.authorityGate ?? authorityGate(),
  now: input.now ?? (() => '2026-07-27T12:00:00.000Z'),
});

const canonicalCommand = (
  publicationId: string,
  publicationRevision: number,
  operationId: string,
  predecessorOperationId = op('1'),
): {
  readonly plan: BookAssemblyPublicationAdapterPlan;
  readonly canonicalActivityVersions: readonly CanonicalPublishedActivityVersionRecord[];
} => {
  const basePlan = plan(publicationId, publicationRevision, operationId);
  if (publicationRevision > 1) {
    const activityVersionId = 'publication-1:activity-1:v1';
    const previousCanonical = canonicalCommand('publication-1', 1, predecessorOperationId).canonicalActivityVersions[0]!;
    return {
      plan: bindApprovalToPlan({
        ...basePlan,
        atomicWrites: {
          ...basePlan.atomicWrites,
          activityVersions: [],
          activityVersionRefs: [{
            activityId: 'activity-1',
            activityVersionId,
            activityVersion: 1,
            canonicalPayloadFingerprint: previousCanonical.payloadFingerprint,
          }],
          activitySafeProjections: basePlan.atomicWrites.activitySafeProjections.map((entry) => ({
            ...entry,
            activityVersionId,
          })),
          placements: basePlan.atomicWrites.placements.map((entry) => ({
            ...entry,
            activityVersionId,
          })),
        },
      }),
      canonicalActivityVersions: [],
    };
  }
  let nextId = 0;
  const activity = normalizeActivity(editableActivity(), {
    createId: () => `${publicationId}-runtime-id-${++nextId}`,
  });
  const metadata = basePlan.atomicWrites.activityVersions[0]!;
  const withoutFingerprint: Omit<CanonicalPublishedActivityVersionRecord, 'payloadFingerprint'> = {
    schemaVersion: 1,
    lifecycle: 'published',
    activityId: metadata.activityId,
    activityVersionId: metadata.activityVersionId,
    activityVersion: metadata.activityVersion,
    ownerId: metadata.ownerId,
    activity,
    projection: projectStudentActivity(activity),
    placementIds: basePlan.atomicWrites.placements.map((entry) => entry.placementId),
    evidenceRefs: [],
    sourceContextFingerprint: null,
    createdByOperationId: operationId,
    publishedAt: '2026-07-27T00:00:00.000Z',
    provenance: {
      kind: 'initial-book-publication',
      bookId: metadata.bookId,
      manifestVersionId: metadata.manifestVersionId,
      publicationId: metadata.publicationId,
      publicationRevision: metadata.publicationRevision,
      unitKey: metadata.unitKey,
      activityKey: metadata.activityKey,
      sourcePages: metadata.sourcePages,
    },
  };
  const canonical = {
    ...withoutFingerprint,
    payloadFingerprint: createCanonicalActivityVersionFingerprint(withoutFingerprint),
  };
  return {
    plan: bindApprovalToPlan({
      ...basePlan,
      atomicWrites: {
        ...basePlan.atomicWrites,
        activityVersions: [{
          ...metadata,
          canonicalPayloadFingerprint: canonical.payloadFingerprint,
        }],
      },
    }),
    canonicalActivityVersions: [canonical],
  };
};

const publishBody = (input: {
  readonly operationId: string;
  readonly expectedCurrentPublicationId: string | null;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly predecessorOperationId?: string;
}) => ({
  operationId: input.operationId,
  expectedCurrentPublicationId: input.expectedCurrentPublicationId,
  manifestVersionId: `manifest-v${input.publicationRevision}`,
  publicationId: input.publicationId,
  publicationRevision: input.publicationRevision,
  ...canonicalCommand(
    input.publicationId,
    input.publicationRevision,
    input.operationId,
    input.predecessorOperationId,
  ),
});

const env = {
  BOOK_ASSEMBLY_PUBLICATION_ENABLED: 'true',
  readDatabaseValue: async () => ({ role: 'teacher' }),
};

describe('PRD0062 ticket 16A Assembly publication Worker boundary', () => {
  it('publishes and rolls back through trusted owner commands without route integration claims', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersionWriter = new InMemoryCanonicalActivityVersionRepository();
    const handlers = createBookAssemblyPublicationWorkerHandlers({
      repository,
      activityVersionWriter,
      authorityGate: authorityGate(),
      now: () => '2026-07-27T00:00:00.000Z',
    });

    const published = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('1'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-1',
        publicationRevision: 1,
      })),
    });
    expect(published.init.status).toBe(200);
    expect(published.body).toMatchObject({ status: 'published', pointer: { publicationId: 'publication-1' } });

    const disabledReplay = await handlers.publish({
      env: { ...env, BOOK_ASSEMBLY_PUBLICATION_ENABLED: 'false' },
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('1'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-1',
        publicationRevision: 1,
      })),
    });
    expect(disabledReplay).toMatchObject({
      body: { status: 'replayed', pointer: { publicationId: 'publication-1' } },
      init: { status: 200 },
    });

    const unavailableAuthorityReplayHandlers = createBookAssemblyPublicationWorkerHandlers({
      repository,
      activityVersionWriter,
      authorityGate: async () => ({ status: 'unavailable' }),
      now: () => '2026-08-01T00:00:00.000Z',
    });
    const unavailableAuthorityReplay = await unavailableAuthorityReplayHandlers.publish({
      env,
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('1'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-1',
        publicationRevision: 1,
      })),
    });
    expect(unavailableAuthorityReplay).toMatchObject({
      body: { status: 'replayed', pointer: { publicationId: 'publication-1' } },
      init: { status: 200 },
    });

    const second = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('2'),
        expectedCurrentPublicationId: 'publication-1',
        publicationId: 'publication-2',
        publicationRevision: 2,
      })),
    });
    expect(second.init.status).toBe(200);

    const rollback = await handlers.rollback({
      env,
      uid: 'teacher-1',
      request: request({
        operationId: op('3'),
        ownerId: 'teacher-1',
        bookId: 'book-1',
        expectedCurrentPublicationId: 'publication-2',
        targetPublicationId: 'publication-1',
      }),
    });
    expect(rollback.init.status).toBe(200);
    expect(rollback.body).toMatchObject({ status: 'rolled-back', pointer: { publicationId: 'publication-1' } });

    const disabledRollbackReplay = await handlers.rollback({
      env: { ...env, BOOK_ASSEMBLY_PUBLICATION_ENABLED: 'false' },
      uid: 'teacher-1',
      request: request({
        operationId: op('3'),
        ownerId: 'teacher-1',
        bookId: 'book-1',
        expectedCurrentPublicationId: 'publication-2',
        targetPublicationId: 'publication-1',
      }),
    });
    expect(disabledRollbackReplay).toMatchObject({
      body: { status: 'replayed', pointer: { publicationId: 'publication-1' } },
      init: { status: 200 },
    });

    await expect(repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication-1' },
      activityVersions: {
        [bookAssemblyActivityVersionScopeKey('manifest-v1', 'publication-1:activity-1:v1')]: {
          activityVersionId: 'publication-1:activity-1:v1',
        },
      },
      deliveryPlans: {
        'publication-1:delivery': { deliveryPlanId: 'publication-1:delivery' },
        'publication-2:delivery': { deliveryPlanId: 'publication-2:delivery' },
      },
    });
  });

  it('denies disabled publication, cross-owner command, stale CAS, and sensitive payload', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersionWriter = new InMemoryCanonicalActivityVersionRepository();
    const handlers = createBookAssemblyPublicationWorkerHandlers({
      repository,
      activityVersionWriter,
      authorityGate: authorityGate(),
      now: () => '2026-07-27T00:00:00.000Z',
    });

    const disabled = await handlers.publish({
      env: { ...env, BOOK_ASSEMBLY_PUBLICATION_ENABLED: 'false' },
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('4'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-1',
        publicationRevision: 1,
      })),
    });
    expect(disabled).toEqual({
      body: { code: 'book_assembly_publication_disabled' },
      init: { status: 503 },
    });

    const crossOwner = await handlers.publish({
      env,
      uid: 'teacher-2',
      request: request(publishBody({
        operationId: op('5'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-1',
        publicationRevision: 1,
      })),
    });
    expect(crossOwner.init.status).toBe(403);

    await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('6'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-1',
        publicationRevision: 1,
      })),
    });
    const stale = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('7'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-2',
        publicationRevision: 2,
        predecessorOperationId: op('6'),
      })),
    });
    expect(stale).toMatchObject({
      body: { status: 'conflict', failureCode: 'stale-current-pointer' },
      init: { status: 409 },
    });

    const sensitiveCommand = publishBody({
      operationId: op('8'),
      expectedCurrentPublicationId: 'publication-1',
      publicationId: 'publication-2',
      publicationRevision: 2,
      predecessorOperationId: op('6'),
    });
    const sensitive = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        ...sensitiveCommand,
        plan: bindApprovalToPlan({ ...sensitiveCommand.plan, answerKey: 'leak' }),
      }),
    });
    expect(sensitive).toMatchObject({
      body: { status: 'invalid', failureCode: 'sensitive-payload' },
      init: { status: 422 },
    });
  });

  it('fails closed for stale authority and preview approval state before publication', async () => {
    const cases: readonly [string, BookAssemblyPublicationAuthorityGate, number, string][] = [
      ['stale candidate', authorityGate({ candidateRevision: 4 }), 409, 'book_assembly_publication_authority_stale'],
      ['stale source set', authorityGate({ sourceSetRevision: 3 }), 409, 'book_assembly_publication_authority_stale'],
      ['stale book', authorityGate({ bookRevision: 5 }), 409, 'book_assembly_publication_authority_stale'],
      ['revoked approval', authorityGate({
        previewApproval: { ...previewApproval(), revoked: true },
      }), 422, 'book_assembly_publication_preview_approval_invalid'],
      ['mismatched approval', authorityGate({
        previewApproval: { ...previewApproval(), approvalId: 'approval-2', revoked: false },
      }), 422, 'book_assembly_publication_preview_approval_invalid'],
    ];

    for (const [label, gate, status, code] of cases) {
      const handlers = createHandlers({ authorityGate: gate });
      const result = await handlers.publish({
        env,
        uid: 'teacher-1',
        request: request(publishBody({
          operationId: op(`${label.length + 10}`),
          expectedCurrentPublicationId: null,
          publicationId: `publication-${label.length + 10}`,
          publicationRevision: 1,
        })),
      });
      expect(result, label).toEqual({ body: { code }, init: { status } });
    }

    const missing = createHandlers({ authorityGate: authorityGate() });
    const missingBody = publishBody({
      operationId: op('30'),
      expectedCurrentPublicationId: null,
      publicationId: 'publication-30',
      publicationRevision: 1,
    });
    missingBody.plan = { ...missingBody.plan, previewApproval: undefined };
    await expect(missing.publish({
      env,
      uid: 'teacher-1',
      request: request(missingBody),
    })).resolves.toEqual({
      body: { code: 'book_assembly_publication_preview_approval_invalid' },
      init: { status: 422 },
    });

    const expired = createHandlers({ authorityGate: authorityGate() });
    const expiredBody = publishBody({
      operationId: op('31'),
      expectedCurrentPublicationId: null,
      publicationId: 'publication-31',
      publicationRevision: 1,
    });
    expiredBody.plan = {
      ...expiredBody.plan,
      previewApproval: previewApproval({ expiresAt: '2026-07-27T11:59:59.000Z' }),
    };
    await expect(expired.publish({
      env,
      uid: 'teacher-1',
      request: request(expiredBody),
    })).resolves.toEqual({
      body: { code: 'book_assembly_publication_preview_approval_invalid' },
      init: { status: 422 },
    });

    const mismatchedFingerprint = createHandlers({ authorityGate: authorityGate() });
    const mismatchedFingerprintBody = publishBody({
      operationId: op('33'),
      expectedCurrentPublicationId: null,
      publicationId: 'publication-33',
      publicationRevision: 1,
    });
    mismatchedFingerprintBody.plan = {
      ...mismatchedFingerprintBody.plan,
      previewApproval: {
        ...mismatchedFingerprintBody.plan.previewApproval!,
        approvedInputFingerprint: 'fnv1a64:0000000000000000',
      },
    };
    await expect(mismatchedFingerprint.publish({
      env,
      uid: 'teacher-1',
      request: request(mismatchedFingerprintBody),
    })).resolves.toEqual({
      body: { code: 'book_assembly_publication_preview_approval_invalid' },
      init: { status: 422 },
    });
  });

  it('fails closed when current publication authority is unavailable', async () => {
    const handlers = createHandlers({
      authorityGate: async () => ({ status: 'unavailable' }),
    });
    const result = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(publishBody({
        operationId: op('32'),
        expectedCurrentPublicationId: null,
        publicationId: 'publication-32',
        publicationRevision: 1,
      })),
    });
    expect(result).toEqual({
      body: { code: 'book_assembly_publication_authority_unavailable' },
      init: { status: 503 },
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../services/book-assembly/unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
} from '../../types/bookAssembly.types';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import { InMemoryBookAssemblyPublicationRepository } from '../../services/book-assembly/publicationRepository';
import { InMemoryCanonicalActivityVersionRepository } from '../../services/book-assembly/canonicalPublicationRepository';
import { createComponentPdfPublicationWorkerHandlers } from '../../../cloudflare/src/upload-worker/book-assembly/component-pdf-publication-worker';
import {
  createCandidateUnitPreview,
  createPreviewApproval,
} from '../../services/book-assembly/unitPreview.service';

const operationId = '00000000-0000-4000-8000-000000000265';
const headerOperationId = '00000000-0000-4000-8000-000000000266';
const now = '2026-07-27T13:00:00.000Z';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Choose from a component',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read the component page.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: 'component-choice-1',
    prompt: 'Choose A',
    options: ['A', 'B'],
    sourceAssisted: {
      questionLabel: '1',
      sourceExerciseLabel: 'Component exercise',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
    },
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const request = (body: unknown, idempotencyKey?: string): Request => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  return new Request('https://worker.test/book-assembly/component-pdf-publications', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
};

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'component_pdfs',
    sources: [
      { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'root' },
      { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'root' },
    ],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-2', parentNodeKey: 'root', nodeType: 'unit', order: 2 },
  ],
  units: [
    {
      unitKey: 'unit-1',
      activitySlots: [{
        activityKey: 'slot-a',
        order: 1,
        contextRequirement: 'required',
        pageGroupKeys: ['pages-a'],
      }],
      pageGroups: [{
        pageGroupKey: 'pages-a',
        sourceKey: 'component-a',
        pages: [1],
        activityKeys: ['slot-a'],
        mode: 'activity',
      }],
    },
    {
      unitKey: 'unit-2',
      activitySlots: [],
      pageGroups: [],
    },
  ],
});

const authority = (): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 9,
  sourceSetRevision: 3,
  sourceSet: manifest().sourceSet,
  sourceVersionAuthority: {
    getSourceVersion: (sourceVersionId) => ['source-a-v1', 'source-b-v1'].includes(sourceVersionId)
      ? {
          sourceVersionId,
          bookId: 'book-1',
          physicalPageCount: 12,
          verifiedUsable: true,
        }
      : undefined,
  },
});

const candidate = (): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 9,
  sourceSetRevision: 3,
  unitKey: 'unit-1',
  revision: 6,
  lifecycle: 'validated',
  manifest: manifest(),
  validation: { valid: true, errors: [] },
  updatedAt: now,
});

const body = () => ({
  bookId: 'book-1',
  unitKey: 'unit-1',
  candidateId: 'candidate-1',
  expectedCandidateRevision: 6,
  expectedCurrentPublicationId: null,
  expectedBookRevision: 9,
  expectedSourceSetRevision: 3,
  previewApproval: {
    approvalId: 'approval-1',
    approvalRevision: 1,
    approvedAt: '2026-07-27T12:00:00.000Z',
    expiresAt: '2026-07-27T14:00:00.000Z',
  },
});

const currentApproval = () => createPreviewApproval({
  approvalId: 'approval-1',
  approvalRevision: 1,
  actorId: 'teacher-1',
  approvedAt: '2026-07-27T12:00:00.000Z',
  expiresAt: '2026-07-27T14:00:00.000Z',
  preview: createCandidateUnitPreview({
    candidate: candidate(),
    sourceVersions: [
      {
        sourceVersionId: 'source-a-v1',
        bookId: 'book-1',
        physicalPageCount: 12,
        verifiedUsable: true,
      },
      {
        sourceVersionId: 'source-b-v1',
        bookId: 'book-1',
        physicalPageCount: 12,
        verifiedUsable: true,
      },
    ],
    sourceIsPreviewReady: () => true,
    activitiesByKey: { 'slot-a': activity() },
    registryVersion: 'registry-1',
  }),
  canonicalActivitiesByKey: { 'slot-a': activity() },
});

const env = {
  BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'true',
  readDatabaseValue: async () => ({ role: 'teacher' }),
};

const worker = (
  activitiesByKey: Readonly<Record<string, {
    activityKey: string;
    ownerId: string;
    revision: number;
    lifecycle: 'draft' | 'validated' | 'saved';
    activity: NormalizedActivity;
  }>> = {
    'slot-a': {
      activityKey: 'slot-a',
      ownerId: 'teacher-1',
      revision: 1,
      lifecycle: 'validated',
      activity: activity(),
    },
  },
  approvalRecord = currentApproval(),
  previewReady = true,
  useProductionIdAllocation = false,
) => {
  const repository = new InMemoryBookAssemblyPublicationRepository();
  const activityVersionWriter = new InMemoryCanonicalActivityVersionRepository();
  const readAuthority = vi.fn(async () => authority());
  const readCandidate = vi.fn(async (): Promise<BookAssemblyCandidateRecord | null> => candidate());
  const readPreviewApproval = vi.fn(
    async (): Promise<ReturnType<typeof currentApproval> | null> => approvalRecord,
  );
  const handlers = createComponentPdfPublicationWorkerHandlers({
    repository,
    activityVersionWriter,
    readAuthority,
    readCandidate,
    readActivities: vi.fn(async () => activitiesByKey),
    readPreviewApproval,
    sourceIsPreviewReady: vi.fn(async () => previewReady),
    allocateOperationId: () => operationId,
    ...(useProductionIdAllocation ? {} : {
      allocateId: (kind: string, key: string) => `${kind}:${key}`,
    }),
    now: () => now,
  });
  return {
    repository,
    activityVersionWriter,
    readAuthority,
    readCandidate,
    readPreviewApproval,
    handlers,
  };
};

describe('PRD0062 ticket 17 component-PDF publication Worker boundary', () => {
  it('publishes through trusted ID allocation without accepting client plan or IDs', async () => {
    const fixture = worker();
    const published = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    });

    expect(published.init.status).toBe(200);
    expect(published.body).toMatchObject({
      operationId,
      manifestVersionId: 'manifest-version:candidate-1',
      publicationId: 'publication:candidate-1',
      result: { status: 'published' },
    });
    await expect(fixture.repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication:candidate-1' },
      placements: {
        'placement:slot-a': { unitKey: 'unit-1' },
      },
      unitProjections: {
        'unit-projection:unit-1': { unitKey: 'unit-1' },
      },
      deliveryPlans: {
        'delivery-plan:unit-1': { sourceStrategy: 'component_pdfs' },
      },
    });
    const scope = await fixture.repository.readScope('book-1');
    const metadata = Object.values(scope.activityVersions ?? {})
      .find((entry) => entry.activityVersionId === 'activity-version:slot-a');
    expect(metadata).toMatchObject({
      activityId: 'activity:slot-a',
      sourcePages: [{
        sourceKey: 'component-a',
        sourceVersionId: 'source-a-v1',
        physicalPageNumber: 1,
      }],
    });
    expect(metadata?.canonicalPayloadFingerprint).toMatch(/^fnv1a64:/u);
    await expect(fixture.activityVersionWriter.readPrepared({
      activityId: 'activity:slot-a',
      activityVersionId: 'activity-version:slot-a',
      activityVersion: 1,
      canonicalPayloadFingerprint: metadata!.canonicalPayloadFingerprint,
    })).resolves.toMatchObject({
      activity: { interactions: [{ interactionId: 'component-choice-1' }] },
      projection: { interactions: [{ interactionId: 'component-choice-1' }] },
      provenance: {
        sourcePages: [{
          sourceKey: 'component-a',
          sourceVersionId: 'source-a-v1',
          physicalPageNumber: 1,
        }],
      },
    });

    const injected = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        ...body(),
        operationId: '00000000-0000-4000-8000-000000000999',
        publicationId: 'client-publication',
        plan: {},
      }),
    });
    expect(injected).toEqual({
      body: { code: 'invalid_request' },
      init: { status: 400 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body(), 'opaque-retry-token'),
    })).resolves.toEqual({
      body: { code: 'invalid_operation_id' },
      init: { status: 400 },
    });

    await expect(fixture.handlers.publish({
      env: { ...env, BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'false' },
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'book_component_pdfs_publication_disabled' },
      init: { status: 503 },
    });
    await expect(fixture.repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication:candidate-1' },
      versions: {
        'manifest-version:candidate-1': { lifecycle: 'published' },
      },
    });
  });

  it('replays the production ID-allocation path for the same HTTP idempotency key', async () => {
    const fixture = worker(undefined, currentApproval(), true, true);
    const first = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body(), headerOperationId),
    });
    fixture.readCandidate.mockResolvedValue(null);
    fixture.readPreviewApproval.mockResolvedValue(null);
    const replay = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body(), headerOperationId),
    });

    expect(first).toMatchObject({
      body: { operationId: headerOperationId, result: { status: 'published' } },
      init: { status: 200 },
    });
    expect(replay).toMatchObject({
      body: { operationId: headerOperationId, result: { status: 'replayed' } },
      init: { status: 200 },
    });
    expect((first.body as { publicationId: string }).publicationId)
      .toBe((replay.body as { publicationId: string }).publicationId);
    expect(fixture.readCandidate).toHaveBeenCalledTimes(1);
    expect(fixture.readPreviewApproval).toHaveBeenCalledTimes(1);

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({ ...body(), expectedCandidateRevision: 7 }, headerOperationId),
    })).resolves.toEqual({
      body: { code: 'idempotency_conflict' },
      init: { status: 409 },
    });
  });

  it('fails closed on disabled gate, unauthorized actor, stale revision, and expired approval', async () => {
    const fixture = worker();

    for (const disabledEnv of [
      { ...env, BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'false' },
      { readDatabaseValue: env.readDatabaseValue },
      { ...env, BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'enabled' },
    ]) {
      await expect(fixture.handlers.publish({
        env: disabledEnv,
        uid: 'teacher-1',
        request: request(body()),
      })).resolves.toEqual({
        body: { code: 'book_component_pdfs_publication_disabled' },
        init: { status: 503 },
      });
    }

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-2',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_publication_forbidden' },
      init: { status: 403 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({ ...body(), expectedCandidateRevision: 5 }),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_revision_conflict' },
      init: { status: 422 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        ...body(),
        previewApproval: {
          ...body().previewApproval,
          expiresAt: '2026-07-27T12:59:59.000Z',
        },
      }),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_preview_approval_invalid' },
      init: { status: 422 },
    });
  });

  it('binds duplicate HTTP retries to the caller idempotency key and replays #64 atomically', async () => {
    const fixture = worker();
    const first = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body(), headerOperationId),
    });
    const replay = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body(), headerOperationId),
    });

    expect(first.body).toMatchObject({
      operationId: headerOperationId,
      result: { status: 'published' },
    });
    expect(replay.body).toMatchObject({
      operationId: headerOperationId,
      result: { status: 'replayed' },
    });
    await expect(fixture.repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication:candidate-1' },
      operations: {
        [headerOperationId]: { result: { status: 'published' } },
      },
    });
  });

  it('rejects forged, revoked, post-preview, and metadata-only payloads before pointer visibility', async () => {
    const forged = worker();
    await expect(forged.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        ...body(),
        previewApproval: { ...body().previewApproval, approvalRevision: 2 },
      }),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(forged.repository.readScope('book-1')).resolves.toEqual({});

    const revoked = worker(undefined, { ...currentApproval(), revoked: true });
    await expect(revoked.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(revoked.repository.readScope('book-1')).resolves.toEqual({});

    const changed = activity();
    const changedAnswer: NormalizedActivity = {
      ...changed,
      interactions: changed.interactions.map((interaction) => (
        interaction.family === 'choice'
          ? {
              ...interaction,
              answerKey: { family: 'choice' as const, acceptedOptionItemIds: ['option-b'] },
            }
          : interaction
      )),
    };
    const mismatched = worker({
      'slot-a': {
        activityKey: 'slot-a',
        ownerId: 'teacher-1',
        revision: 2,
        lifecycle: 'draft',
        activity: changedAnswer,
      },
    });
    await expect(mismatched.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(mismatched.repository.readScope('book-1')).resolves.toEqual({});

    const missing = worker({});
    await expect(missing.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_activity_payload_missing' },
      init: { status: 422 },
    });
    await expect(missing.repository.readScope('book-1')).resolves.toEqual({});
    await expect(missing.activityVersionWriter.readPrepared({
      activityId: 'activity:slot-a',
      activityVersionId: 'activity-version:slot-a',
      activityVersion: 1,
    })).resolves.toBeNull();

    const sourceNotReady = worker(undefined, currentApproval(), false);
    await expect(sourceNotReady.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'component_pdfs_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(sourceNotReady.repository.readScope('book-1')).resolves.toEqual({});
  });
});

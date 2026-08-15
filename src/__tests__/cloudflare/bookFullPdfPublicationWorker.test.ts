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
import { createFullPdfPublicationWorkerHandlers } from '../../../cloudflare/src/upload-worker/book-assembly/full-pdf-publication-worker';
import {
  createCandidateUnitPreview,
  createPreviewApproval,
} from '../../services/book-assembly/unitPreview.service';

const operationId = '00000000-0000-4000-8000-000000000265';
const now = '2026-07-27T13:00:00.000Z';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Choose safely',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read source.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: 'choice-1',
    prompt: 'Choose A',
    options: ['A', 'B'],
    sourceAssisted: {
      questionLabel: '1',
      sourceExerciseLabel: 'Exercise 1',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
    },
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const request = (body: unknown): Request => new Request('https://worker.test/book-assembly/full-pdf-publications', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
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
        sourceKey: 'full',
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
    getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-v1'
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
    sourceVersions: [{
      sourceVersionId: 'source-v1',
      bookId: 'book-1',
      physicalPageCount: 12,
      verifiedUsable: true,
    }],
    sourceIsPreviewReady: () => true,
    activitiesByKey: { 'slot-a': activity() },
    registryVersion: 'registry-1',
  }),
  canonicalActivitiesByKey: { 'slot-a': activity() },
});

const env = {
  BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
  readDatabaseValue: async () => ({ role: 'teacher' }),
};

const worker = (
  activitiesByKey: Readonly<Record<string, {
    activityKey: string;
    ownerId: string;
    revision: number;
    lifecycle: 'draft';
    activity: NormalizedActivity;
  }>> = {
    'slot-a': {
      activityKey: 'slot-a',
      ownerId: 'teacher-1',
      revision: 1,
      lifecycle: 'draft',
      activity: activity(),
    },
  },
  approvalRecord = currentApproval(),
) => {
  const repository = new InMemoryBookAssemblyPublicationRepository();
  const activityVersionWriter = new InMemoryCanonicalActivityVersionRepository();
  const readAuthority = vi.fn(async () => authority());
  const readCandidate = vi.fn(async () => candidate());
  const handlers = createFullPdfPublicationWorkerHandlers({
    readUser: (uid) => env.readDatabaseValue(`users/${uid}`),
    repository,
    activityVersionWriter,
    readAuthority,
    readCandidate,
    readActivities: vi.fn(async () => activitiesByKey),
    readPreviewApproval: vi.fn(async () => approvalRecord),
    sourceIsPreviewReady: vi.fn(async () => true),
    allocateOperationId: () => operationId,
    allocateId: (kind, key) => `${kind}:${key}`,
    now: () => now,
  });
  return { repository, activityVersionWriter, readAuthority, readCandidate, handlers };
};

describe('PRD0062 ticket 16 full-PDF publication Worker boundary', () => {
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
        'delivery-plan:unit-1': { sourceStrategy: 'full_pdf' },
      },
    });
    const scope = await fixture.repository.readScope('book-1');
    const metadata = Object.values(scope.activityVersions ?? {})
      .find((entry) => entry.activityVersionId === 'activity-version:slot-a');
    expect(metadata).toMatchObject({ activityId: 'activity:slot-a' });
    expect(metadata?.canonicalPayloadFingerprint).toMatch(/^fnv1a64:/u);
    await expect(fixture.activityVersionWriter.readPrepared({
      activityId: 'activity:slot-a',
      activityVersionId: 'activity-version:slot-a',
      activityVersion: 1,
      canonicalPayloadFingerprint: metadata!.canonicalPayloadFingerprint,
    })).resolves.toMatchObject({
      activity: { interactions: [{ interactionId: 'choice-1' }] },
      projection: { interactions: [{ interactionId: 'choice-1' }] },
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
  });

  it('fails closed on disabled gate, unauthorized actor, stale revision, and expired approval', async () => {
    const fixture = worker();

    await expect(fixture.handlers.publish({
      env: { ...env, BOOK_FULL_PDF_PUBLICATION_ENABLED: 'false' },
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'book_full_pdf_publication_disabled' },
      init: { status: 503 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-2',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'full_pdf_publication_forbidden' },
      init: { status: 403 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({ ...body(), expectedCandidateRevision: 5 }),
    })).resolves.toEqual({
      body: { code: 'full_pdf_revision_conflict' },
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
      body: { code: 'full_pdf_preview_approval_invalid' },
      init: { status: 422 },
    });
  });

  it('rejects forged, revoked, and post-preview Activity payloads before pointer visibility', async () => {
    const forged = worker();
    await expect(forged.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        ...body(),
        previewApproval: { ...body().previewApproval, approvalRevision: 2 },
      }),
    })).resolves.toEqual({
      body: { code: 'full_pdf_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(forged.repository.readScope('book-1')).resolves.toEqual({});

    const mismatchedReadback = worker(undefined, { ...currentApproval(), approvalId: 'approval-2' });
    await expect(mismatchedReadback.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'full_pdf_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(mismatchedReadback.repository.readScope('book-1')).resolves.toEqual({});

    const revoked = worker(undefined, { ...currentApproval(), revoked: true });
    await expect(revoked.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'full_pdf_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(revoked.repository.readScope('book-1')).resolves.toEqual({});

    const changedActivity = activity();
    const changedAnswerActivity: NormalizedActivity = {
      ...changedActivity,
      interactions: changedActivity.interactions.map((interaction) => (
        interaction.family === 'choice'
          ? {
              ...interaction,
              answerKey: { family: 'choice' as const, acceptedOptionItemIds: ['option-b'] },
            }
          : interaction
      )),
    };
    const payloadMismatch = worker({
      'slot-a': {
        activityKey: 'slot-a',
        ownerId: 'teacher-1',
        revision: 2,
        lifecycle: 'draft',
        activity: changedAnswerActivity,
      },
    });
    await expect(payloadMismatch.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'full_pdf_preview_approval_invalid' },
      init: { status: 422 },
    });
    await expect(payloadMismatch.repository.readScope('book-1')).resolves.toEqual({});
    await expect(payloadMismatch.activityVersionWriter.readPrepared({
      activityId: 'activity:slot-a',
      activityVersionId: 'activity-version:slot-a',
      activityVersion: 1,
    })).resolves.toBeNull();
  });

  it('rejects metadata-only publication before canonical preparation or pointer visibility', async () => {
    const fixture = worker({});

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'full_pdf_activity_payload_missing' },
      init: { status: 422 },
    });

    await expect(fixture.repository.readScope('book-1')).resolves.toEqual({});
    await expect(fixture.activityVersionWriter.readPrepared({
      activityId: 'activity:slot-a',
      activityVersionId: 'activity-version:slot-a',
      activityVersion: 1,
    })).resolves.toBeNull();
  });
});

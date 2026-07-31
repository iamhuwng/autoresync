import { describe, expect, it } from 'vitest';

import { normalizeActivity } from '../../src/services/book-activity/activityCanonical.service';
import { projectStudentActivity } from '../../src/services/book-activity/activityProjection.service';
import { createActivityRevisionPublishService } from '../../src/services/book-activity/activityRevisionPublish.service';
import {
  createCanonicalActivityVersionFingerprint,
} from '../../src/services/book-assembly/canonicalActivityVersion.service';
import {
  ACTIVITY_REVISION_CONTROL_ROOT,
  FirebaseRestActivityRevisionRepository,
} from '../src/upload-worker/book-activity/activity-revision-repository';
import {
  createFirebaseActivityRevisionService,
} from '../src/upload-worker/book-activity/activity-revision-composition';

const dbUrl = 'https://firebase.test';
const ownerId = 'teacher-1';
const activityId = 'activity-1';
const oldVersionId = 'activity-v1';
const operationId = '00000000-0000-4000-8000-000000000681';
const rollbackOperationId = '00000000-0000-4000-8000-000000000682';
const secondOperationId = '00000000-0000-4000-8000-000000000683';
const sourceContextFingerprint = 'fnv1a64:1111111111111111';

const editable = (title = 'Original Activity') => ({
  schemaVersion: 1 as const,
  title,
  taskProfile: null,
  presentationMode: 'structured' as const,
  contextRequirement: { mode: 'none' as const, acceptedKinds: [] },
  instructions: [{ text: 'Complete the item.' }],
  interaction: { family: 'text-entry' as const, variant: 'fill-blank' },
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' as const },
  stimulus: null,
  assetRefs: [],
  interactions: [{ prompt: 'I _____ here.', acceptedAnswers: ['live'] }],
  scoring: { mode: 'auto-where-possible' as const },
});

const initialCanonical = () => {
  const activity = normalizeActivity(editable(), { createId: () => 'interaction-1' });
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    lifecycle: 'published' as const,
    activityId,
    activityVersionId: oldVersionId,
    activityVersion: 1,
    ownerId,
    activity,
    projection: projectStudentActivity(activity),
    placementIds: ['placement-1'],
    evidenceRefs: ['initial:activity-1'],
    sourceContextFingerprint,
    createdByOperationId: '00000000-0000-4000-8000-000000000680',
    publishedAt: '2026-07-31T00:00:00.000Z',
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
        physicalPageNumber: 4,
      }],
    },
  };
  return {
    ...withoutFingerprint,
    payloadFingerprint: createCanonicalActivityVersionFingerprint(withoutFingerprint),
  };
};

const pathFromInput = (input: RequestInfo | URL): string => {
  const url = new URL(String(input));
  return decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
};

const harness = (options: {
  rejectFirstControlWrite?: boolean;
  rejectFirstProjectionWrite?: boolean;
} = {}) => {
  const values = new Map<string, unknown>([
    [`book_activity/versions/${activityId}/${oldVersionId}`, initialCanonical()],
  ]);
  const etags = new Map<string, string>();
  const calls: string[] = [];
  let rejected = false;
  let projectionRejected = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = pathFromInput(input as RequestInfo | URL);
    const method = String(init?.method ?? 'GET');
    calls.push(`${method} ${path}`);
    if (method === 'GET') {
      const headers = new Headers(init?.headers);
      return new Response(JSON.stringify(values.get(path) ?? null), {
        status: 200,
        headers: headers.get('x-firebase-etag') === 'true'
          ? { etag: etags.get(path) ?? '"etag-1"' }
          : {},
      });
    }
    if (method === 'PUT') {
      if (options.rejectFirstProjectionWrite
        && path.startsWith('book_activity/student_safe_projections/')
        && !projectionRejected) {
        projectionRejected = true;
        return new Response('', { status: 500 });
      }
      if (options.rejectFirstControlWrite
        && path === `${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`
        && !rejected) {
        rejected = true;
        etags.set(path, '"etag-concurrent"');
        return new Response('', { status: 412 });
      }
      const headers = new Headers(init?.headers);
      if (headers.get('if-match') !== (etags.get(path) ?? '"etag-1"')) {
        return new Response('', { status: 412 });
      }
      values.set(path, JSON.parse(String(init?.body ?? 'null')) as unknown);
      etags.set(path, '"etag-written"');
      return new Response('', { status: 200 });
    }
    return new Response('', { status: 405 });
  };
  return { calls, fetchImpl, values };
};

const repositoryFor = (fetchImpl: typeof fetch) => new FirebaseRestActivityRevisionRepository({
  env: {
    FIREBASE_DB_URL: dbUrl,
    BOOK_ACTIVITY_REVISION_SERVICE_IDENTITY: 'revision@example.test',
    BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_SERVICE_IDENTITY:
      'revision@example.test',
  },
  activityId,
  expectedCurrentActivityVersionId: oldVersionId,
  expectedCurrentActivityVersion: 1,
  ownerId,
  fetchImpl,
  getAccessToken: async () => 'test-token',
});

describe('PRD0062 #68 durable canonical Activity revision repository', () => {
  it('prepares one canonical successor, CASes control, replays, and rolls back only the pointer', async () => {
    const runtime = harness({ rejectFirstControlWrite: true });
    const historicalAttempt = {
      activityId,
      activityVersionId: oldVersionId,
      sourceContextFingerprint,
      answer: 'historical answer',
    };
    const historicalResult = {
      activityId,
      activityVersionId: oldVersionId,
      sourceProvenance: {
        sourceVersionId: 'source-version-1',
        sourceContextFingerprint,
      },
      score: 1,
    };
    runtime.values.set('activity_attempts/attempt-before-revision', historicalAttempt);
    runtime.values.set('activity_results/result-before-revision', historicalResult);
    const repository = repositoryFor(runtime.fetchImpl);
    const service = createActivityRevisionPublishService(repository, {
      idProvider: { createId: () => 'interaction-2' },
      versionIdProvider: { createId: () => `revision-${operationId}` },
    });
    const sourceContext = {
      fingerprint: sourceContextFingerprint,
      sourceVersionId: 'source-version-1',
      mappedBookPageRefs: ['source-1:source-version-1:4'],
    };
    const preview = await service.preview({
      activityId,
      ownerId,
      candidateId: 'candidate-1',
      candidateRevision: 3,
      expectedCurrentVersionId: oldVersionId,
      expectedCurrentVersion: 1,
      expectedContextFingerprint: sourceContextFingerprint,
      sourceContext,
      placementIds: ['placement-1'],
      evidenceRefs: ['candidate:1'],
      sourceEvidenceRefs: ['source:1'],
      answerEvidenceRefs: ['answer:1'],
      replacement: editable('Revised Activity'),
    });
    expect(preview.status).toBe('ready');
    if (preview.status !== 'ready') throw new Error('preview failed');

    const approval = {
      approvalId: preview.candidate.fingerprint,
      approvedAt: '2026-07-31T00:01:00.000Z',
      expiresAt: '2026-07-31T00:10:00.000Z',
    };
    const first = await service.publish({
      operationId,
      ownerId,
      candidate: preview.candidate,
      previewApproval: approval,
      now: '2026-07-31T00:02:00.000Z',
    });
    expect(first).toMatchObject({
      status: 'revised',
      activityId,
      activityVersionId: `revision-${operationId}`,
      activityVersion: 2,
      predecessorActivityVersionId: oldVersionId,
      placementIds: ['placement-1'],
    });
    const successorPath = `book_activity/versions/${activityId}/revision-${operationId}`;
    const projectionPath = `book_activity/student_safe_projections/${activityId}/revision-${operationId}`;
    expect(runtime.values.get(successorPath)).toMatchObject({
      lifecycle: 'published',
      activityId,
      activityVersion: 2,
      ownerId,
      predecessorActivityVersionId: oldVersionId,
      placementIds: ['placement-1'],
      provenance: {
        kind: 'activity-revision',
        candidateId: 'candidate-1',
        candidateRevision: 3,
      },
    });
    expect(JSON.stringify(runtime.values.get(projectionPath))).not.toContain('live');
    expect(runtime.values.get(`${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`)).toMatchObject({
      current: {
        activityId,
        activityVersionId: `revision-${operationId}`,
        activityVersion: 2,
        ownerId,
      },
      history: {
        [oldVersionId]: { activityVersion: 1 },
        [`revision-${operationId}`]: { activityVersion: 2 },
      },
      operations: {
        [operationId]: { operationId, activityId, resultActivityVersionId: `revision-${operationId}` },
      },
    });
    expect(runtime.values.get('activity_attempts/attempt-before-revision')).toEqual(historicalAttempt);
    expect(runtime.values.get('activity_results/result-before-revision')).toEqual(historicalResult);

    await expect(service.publish({
      operationId,
      ownerId,
      candidate: preview.candidate,
      previewApproval: approval,
      now: '2026-07-31T00:03:00.000Z',
    })).resolves.toMatchObject({ status: 'replayed' });
    expect(runtime.calls.filter((call) => call === `PUT ${successorPath}`)).toHaveLength(1);

    await expect(service.rollback({
      operationId: rollbackOperationId,
      ownerId,
      activityId,
      expectedCurrentVersionId: `revision-${operationId}`,
      targetVersionId: oldVersionId,
      now: '2026-07-31T00:04:00.000Z',
    })).resolves.toMatchObject({ status: 'rolled-back' });
    expect(runtime.values.get(`${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`)).toMatchObject({
      current: { activityVersionId: oldVersionId, activityVersion: 1 },
      history: {
        [oldVersionId]: { activityVersion: 1 },
        [`revision-${operationId}`]: { activityVersion: 2 },
      },
      operations: {
        [operationId]: { expectedActivityVersion: 1 },
        [rollbackOperationId]: { expectedActivityVersion: 2 },
      },
    });
    expect(runtime.values.has(successorPath)).toBe(true);
    expect([...runtime.values.keys()].some((path) =>
      path.startsWith('book_assembly_publications/')
      || path.startsWith('homework')
      || path.startsWith('courses')
      || path.startsWith('classes'))).toBe(false);
  });

  it('restores non-null provenance and publishes a second successor', async () => {
    const runtime = harness();
    const sourceContext = {
      fingerprint: sourceContextFingerprint,
      sourceVersionId: 'source-version-1',
      mappedBookPageRefs: ['source-1:source-version-1:4'],
    };
    const firstRepository = repositoryFor(runtime.fetchImpl);
    const firstService = createActivityRevisionPublishService(firstRepository, {
      versionIdProvider: { createId: () => `revision-${operationId}` },
    });
    const firstPreview = await firstService.preview({
      activityId,
      ownerId,
      candidateId: 'candidate-first',
      candidateRevision: 1,
      expectedCurrentVersionId: oldVersionId,
      expectedCurrentVersion: 1,
      expectedContextFingerprint: sourceContextFingerprint,
      sourceContext,
      replacement: editable('First revision'),
    });
    if (firstPreview.status !== 'ready') throw new Error('first preview failed');
    await firstService.publish({
      operationId,
      ownerId,
      candidate: firstPreview.candidate,
      previewApproval: {
        approvalId: firstPreview.candidate.fingerprint,
        approvedAt: '2026-07-31T00:01:00.000Z',
        expiresAt: '2026-07-31T00:10:00.000Z',
      },
      now: '2026-07-31T00:02:00.000Z',
    });

    const secondRepository = new FirebaseRestActivityRevisionRepository({
      env: {
        FIREBASE_DB_URL: dbUrl,
        BOOK_ACTIVITY_REVISION_SERVICE_IDENTITY: 'revision@example.test',
        BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_SERVICE_IDENTITY:
          'revision@example.test',
      },
      activityId,
      expectedCurrentActivityVersionId: `revision-${operationId}`,
      expectedCurrentActivityVersion: 2,
      ownerId,
      fetchImpl: runtime.fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    const secondService = createActivityRevisionPublishService(secondRepository, {
      versionIdProvider: { createId: () => `revision-${secondOperationId}` },
    });
    const secondPreview = await secondService.preview({
      activityId,
      ownerId,
      candidateId: 'candidate-second',
      candidateRevision: 1,
      expectedCurrentVersionId: `revision-${operationId}`,
      expectedCurrentVersion: 2,
      expectedContextFingerprint: sourceContextFingerprint,
      sourceContext,
      replacement: editable('Second revision'),
    });
    expect(secondPreview.status).toBe('ready');
    if (secondPreview.status !== 'ready') throw new Error('second preview failed');
    await expect(secondService.publish({
      operationId: secondOperationId,
      ownerId,
      candidate: secondPreview.candidate,
      previewApproval: {
        approvalId: secondPreview.candidate.fingerprint,
        approvedAt: '2026-07-31T00:03:00.000Z',
        expiresAt: '2026-07-31T00:10:00.000Z',
      },
      now: '2026-07-31T00:04:00.000Z',
    })).resolves.toMatchObject({
      status: 'revised',
      activityVersionId: `revision-${secondOperationId}`,
      activityVersion: 3,
    });
    expect(runtime.values.get(`${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`)).toMatchObject({
      current: {
        activityVersionId: `revision-${secondOperationId}`,
        sourceContextFingerprint,
        sourceContext: { fingerprint: sourceContextFingerprint },
      },
      operations: {
        [operationId]: { expectedActivityVersion: 1 },
        [secondOperationId]: { expectedActivityVersion: 2 },
      },
    });
  });

  it('keeps a prepared canonical remnant invisible and completes it on retry after projection failure', async () => {
    const runtime = harness({ rejectFirstProjectionWrite: true });
    const repository = repositoryFor(runtime.fetchImpl);
    const service = createActivityRevisionPublishService(repository, {
      versionIdProvider: { createId: () => `revision-${operationId}` },
    });
    const sourceContext = {
      fingerprint: sourceContextFingerprint,
      sourceVersionId: 'source-version-1',
      mappedBookPageRefs: ['source-1:source-version-1:4'],
    };
    const preview = await service.preview({
      activityId,
      ownerId,
      candidateId: 'candidate-recovery',
      candidateRevision: 1,
      expectedCurrentVersionId: oldVersionId,
      expectedCurrentVersion: 1,
      expectedContextFingerprint: sourceContextFingerprint,
      sourceContext,
      replacement: editable('Recovered revision'),
    });
    if (preview.status !== 'ready') throw new Error('preview failed');
    const request = {
      operationId,
      ownerId,
      candidate: preview.candidate,
      previewApproval: {
        approvalId: preview.candidate.fingerprint,
        approvedAt: '2026-07-31T00:01:00.000Z',
        expiresAt: '2026-07-31T00:10:00.000Z',
      },
      now: '2026-07-31T00:02:00.000Z',
    };
    const successorPath = `book_activity/versions/${activityId}/revision-${operationId}`;
    const projectionPath =
      `book_activity/student_safe_projections/${activityId}/revision-${operationId}`;
    await expect(service.publish(request)).rejects.toThrow('firebase_rtdb_put_failed:500');
    expect(runtime.values.has(successorPath)).toBe(true);
    expect(runtime.values.has(projectionPath)).toBe(false);
    expect(runtime.values.has(`${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`)).toBe(false);

    await expect(service.publish(request)).resolves.toMatchObject({
      status: 'revised',
      activityVersionId: `revision-${operationId}`,
    });
    expect(runtime.values.has(projectionPath)).toBe(true);
    expect(runtime.values.has(`${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`)).toBe(true);
    expect(runtime.calls.filter((call) => call === `PUT ${successorPath}`)).toHaveLength(1);
    expect([...runtime.values.keys()].some((path) =>
      path.startsWith('book_assembly_publications/')
      || path.startsWith('delivery_contexts/')
      || path.startsWith('homework/')
      || path.startsWith('courses/')
      || path.startsWith('classes/'))).toBe(false);
  });

  it('fails before control visibility on immutable-version conflicts', async () => {
    const runtime = harness();
    runtime.values.set(`book_activity/versions/${activityId}/revision-${operationId}`, {
      lifecycle: 'published',
      activityId,
      activityVersionId: `revision-${operationId}`,
      ownerId: 'other-owner',
    });
    const repository = repositoryFor(runtime.fetchImpl);
    const service = createActivityRevisionPublishService(repository, {
      versionIdProvider: { createId: () => `revision-${operationId}` },
    });
    const context = {
      fingerprint: sourceContextFingerprint,
      sourceVersionId: 'source-version-1',
      mappedBookPageRefs: ['source-1:source-version-1:4'],
    };
    const preview = await service.preview({
      activityId,
      ownerId,
      candidateId: 'candidate-conflict',
      candidateRevision: 1,
      expectedCurrentVersionId: oldVersionId,
      expectedCurrentVersion: 1,
      expectedContextFingerprint: sourceContextFingerprint,
      sourceContext: context,
      replacement: editable('Conflict'),
    });
    if (preview.status !== 'ready') throw new Error('preview failed');
    await expect(service.publish({
      operationId,
      ownerId,
      candidate: preview.candidate,
      previewApproval: {
        approvalId: preview.candidate.fingerprint,
        approvedAt: '2026-07-31T00:01:00.000Z',
        expiresAt: '2026-07-31T00:10:00.000Z',
      },
      now: '2026-07-31T00:02:00.000Z',
    })).rejects.toThrow('activity_revision_canonical_conflict');
    expect(runtime.values.has(`${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`)).toBe(false);
  });

  it('composes the durable #35 candidate and #64 writer without an unavailable service port', async () => {
    const runtime = harness();
    const context = {
      fingerprint: sourceContextFingerprint,
      sourceVersionId: 'source-version-1',
      mappedBookPageRefs: ['source-1:source-version-1:4'],
    };
    const replacement = editable('Composed revision');
    const candidate = {
      candidateId: 'candidate-composed',
      targetActivityId: activityId,
      ownerId,
      targetRevision: 1,
      revision: 3,
      lifecycle: 'validated',
      content: replacement,
      validation: { valid: true, errors: [] },
      diff: { classification: 'display-only', reasons: ['display-content'], requiresRedo: false },
      evidenceRefs: ['candidate:composed'],
      sourceEvidenceRefs: ['source:composed'],
      answerEvidenceRefs: ['answer:composed'],
      updatedAt: 1,
    };
    runtime.values.set(`book_activity_authoring/owners/${ownerId}`, {
      candidates: { [candidate.candidateId]: candidate },
    });

    // Obtain the exact #63-compatible approval fingerprint from the same
    // canonical preview path; preview does not write revision control.
    const previewRepository = repositoryFor(runtime.fetchImpl);
    const previewService = createActivityRevisionPublishService(previewRepository);
    const preview = await previewService.preview({
      activityId,
      ownerId,
      candidateId: candidate.candidateId,
      candidateRevision: candidate.revision,
      expectedCurrentVersionId: oldVersionId,
      expectedCurrentVersion: 1,
      expectedContextFingerprint: sourceContextFingerprint,
      sourceContext: context,
      evidenceRefs: candidate.evidenceRefs,
      sourceEvidenceRefs: candidate.sourceEvidenceRefs,
      answerEvidenceRefs: candidate.answerEvidenceRefs,
      replacement,
    });
    if (preview.status !== 'ready') throw new Error('preview failed');

    const composed = createFirebaseActivityRevisionService({
      env: {
        FIREBASE_DB_URL: dbUrl,
        BOOK_ACTIVITY_REVISION_SERVICE_IDENTITY: 'revision@example.test',
        BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_SERVICE_IDENTITY:
          'revision@example.test',
        BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: 'authoring@example.test',
      },
      fetchImpl: runtime.fetchImpl,
      getAccessToken: async () => 'test-token',
      now: () => '2026-07-31T00:02:00.000Z',
    });
    await expect(composed.revalidateAndCommit({
      actorId: ownerId,
      operationId,
      activityId,
      candidateId: candidate.candidateId,
      expectedCandidateRevision: candidate.revision,
      expectedCurrentActivityVersionId: oldVersionId,
      expectedCurrentActivityVersion: 1,
      expectedSourceContext: context,
      replacementContent: replacement,
      evidenceRefs: candidate.evidenceRefs,
      sourceEvidenceRefs: candidate.sourceEvidenceRefs,
      answerEvidenceRefs: candidate.answerEvidenceRefs,
      previewApproval: {
        approvalId: preview.candidate.fingerprint,
        approvedAt: '2026-07-31T00:01:00.000Z',
        expiresAt: '2026-07-31T00:10:00.000Z',
      },
    })).resolves.toMatchObject({
      status: 'revised',
      activityId,
      activityVersionId: `revision-${operationId}`,
      predecessorActivityVersionId: oldVersionId,
      placementIds: ['placement-1'],
    });
  });

  it('publishes a structured context-free successor without inventing source context', async () => {
    const runtime = harness();
    const initial = initialCanonical();
    const { payloadFingerprint: _ignored, ...withoutFingerprint } = initial;
    const contextFree = { ...withoutFingerprint, sourceContextFingerprint: null };
    runtime.values.set(`book_activity/versions/${activityId}/${oldVersionId}`, {
      ...contextFree,
      payloadFingerprint: createCanonicalActivityVersionFingerprint(contextFree),
    });
    const repository = repositoryFor(runtime.fetchImpl);
    const service = createActivityRevisionPublishService(repository, {
      versionIdProvider: { createId: () => `revision-${operationId}` },
    });
    const preview = await service.preview({
      activityId,
      ownerId,
      candidateId: 'candidate-context-free',
      candidateRevision: 1,
      expectedCurrentVersionId: oldVersionId,
      expectedCurrentVersion: 1,
      expectedContextFingerprint: null,
      sourceContext: null,
      replacement: editable('Context-free revision'),
    });
    expect(preview.status).toBe('ready');
    if (preview.status !== 'ready') throw new Error('preview failed');
    await expect(service.publish({
      operationId,
      ownerId,
      candidate: preview.candidate,
      previewApproval: {
        approvalId: preview.candidate.fingerprint,
        approvedAt: '2026-07-31T00:01:00.000Z',
        expiresAt: '2026-07-31T00:10:00.000Z',
      },
      now: '2026-07-31T00:02:00.000Z',
    })).resolves.toMatchObject({ status: 'revised', activityId });
    expect(runtime.values.get(`${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`)).toMatchObject({
      current: {
        activityVersionId: `revision-${operationId}`,
        sourceContextFingerprint: null,
        sourceContext: null,
      },
    });
  });
});

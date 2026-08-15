import { describe, expect, it, vi } from 'vitest';
import type { NormalizedActivity } from '../../src/types/bookActivity.types';
import type { BookAssemblyBookAuthority, BookAssemblyCandidateRecord } from '../../src/services/book-assembly/unitAssembly.types';
import { createCandidatePreviewWorkerHandlers } from '../src/upload-worker/book-assembly/preview-worker';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1, title: 'Choose safely', taskProfile: null, presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Read source.' }],
  interaction: { family: 'choice', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null, assetRefs: [], scoring: { mode: 'auto-where-possible' },
  interactions: [{ family: 'choice', interactionId: 'choice-1', prompt: 'Choose A', options: ['A', 'B'],
    sourceAssisted: { questionLabel: '1', accessiblePrompt: 'Choose one answer.', responseShape: 'single-choice' },
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] }, answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] } }],
});

const candidate = (): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 3, sourceSetRevision: 4,
  unitKey: 'unit-1', revision: 5, lifecycle: 'validated', validation: { valid: true, errors: [] }, updatedAt: '2026-07-27T00:00:00.000Z',
  manifest: { bookId: 'book-1', sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }] },
    nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }], units: [{ unitKey: 'unit-1',
      activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
      pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [2], activityKeys: ['activity-1'], mode: 'activity' }] }] },
});

const authority = (): BookAssemblyBookAuthority => ({
  bookId: 'book-1', ownerId: 'teacher-1', bookMode: 'pdf', bookRevision: 3, sourceSetRevision: 4,
  sourceSet: candidate().manifest!.sourceSet,
  sourceVersionAuthority: { getSourceVersion: (id) => id === 'source-1'
    ? { sourceVersionId: id, bookId: 'book-1', physicalPageCount: 4, verifiedUsable: true } : undefined },
});
const body = { bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-1', expectedCandidateRevision: 5 };

describe('PRD0062 #63 candidate preview Worker', () => {
  it('rechecks authority, returns candidate-scoped answer-safe projection, and records trusted approval', async () => {
    const recordApproval = vi.fn(async () => undefined);
    const handlers = createCandidatePreviewWorkerHandlers({
      now: () => '2026-07-27T00:00:00.000Z', createApprovalId: () => 'approval-1', port: {
        readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(),
        readCandidate: async () => candidate(), readActivities: async () => [{ activityKey: 'activity-1', ownerId: 'teacher-1', lifecycle: 'validated', content: activity() }],
        sourceIsPreviewReady: async () => true, recordApproval,
      },
      registryVersion: 'registry-v1',
    });
    const preview = await handlers.preview({ uid: 'teacher-1', body });
    expect(preview.init.status).toBe(200);
    expect(JSON.stringify(preview.body)).not.toContain('answerKey');
    expect(JSON.stringify(preview.body)).not.toContain('source-1');
    const approval = await handlers.approve({ uid: 'teacher-1', body });
    expect(approval.body).toMatchObject({ approval: { candidateId: 'candidate-1', sourceSetRevision: 4, registryVersion: 'registry-v1', actorId: 'teacher-1' } });
    expect(JSON.stringify(approval.body)).not.toContain('canonicalActivityFingerprintsByKey');
    expect(recordApproval).toHaveBeenCalledWith(expect.objectContaining({
      approvalId: 'approval-1',
      canonicalActivityFingerprintsByKey: {
        'activity-1': expect.stringMatching(/^fnv1a64:/u),
      },
    }));
  });

  it('revokes only the current owner approval and replays an existing immutable marker', async () => {
    const durableApproval = {
      approvalId: 'approval-1', approvalRevision: 1, actorId: 'teacher-1', bookId: 'book-1', bookRevision: 3,
      unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 5, sourceSetRevision: 4,
      registryVersion: 'registry-v1', inputFingerprint: 'fnv1a64:0123456789abcdef',
      canonicalActivityFingerprintsByKey: { 'activity-1': 'fnv1a64:fedcba9876543210' },
      approvedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-27T01:00:00.000Z',
    };
    const marker = {
      approvalId: 'approval-1', bookId: 'book-1', unitKey: 'unit-1', actorId: 'teacher-1',
      revokedAt: '2026-07-27T00:30:00.000Z',
    };
    const readApproval = vi.fn(async () => ({ approval: durableApproval, revocation: null }));
    const recordRevocation = vi.fn(async () => 'revoked' as const);
    const handlers = createCandidatePreviewWorkerHandlers({
      now: () => marker.revokedAt,
      port: {
        readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(),
        readCandidate: async () => candidate(), readActivities: async () => [{ activityKey: 'activity-1', ownerId: 'teacher-1', lifecycle: 'validated', content: activity() }],
        sourceIsPreviewReady: async () => true, recordApproval: async () => undefined, readApproval, recordRevocation,
      },
      registryVersion: 'registry-v1',
    });
    await expect(handlers.revoke({ uid: 'teacher-1', body: { ...body, approvalId: 'approval-1' } })).resolves.toEqual({
      body: { revocation: marker, status: 'revoked' }, init: expect.objectContaining({ status: 200 }),
    });
    expect(recordRevocation).toHaveBeenCalledWith(marker);

    readApproval.mockResolvedValueOnce({ approval: durableApproval, revocation: marker });
    await expect(handlers.revoke({ uid: 'teacher-1', body: { ...body, approvalId: 'approval-1' } })).resolves.toEqual({
      body: { revocation: marker, status: 'replayed' }, init: expect.objectContaining({ status: 200 }),
    });
    expect(recordRevocation).toHaveBeenCalledTimes(1);
  });

  it('rejects a revoke when the approval is absent, foreign, stale, or the command carries extra body fields', async () => {
    const recordRevocation = vi.fn(async () => 'revoked' as const);
    const handlers = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(),
      readCandidate: async () => candidate(), readActivities: async () => [{ activityKey: 'activity-1', ownerId: 'teacher-1', lifecycle: 'validated', content: activity() }],
      sourceIsPreviewReady: async () => true, recordApproval: async () => undefined,
      readApproval: async () => ({ approval: null, revocation: null }), recordRevocation,
    }, registryVersion: 'registry-v1' });
    await expect(handlers.revoke({ uid: 'teacher-1', body: { ...body, approvalId: 'approval-1' } }))
      .resolves.toEqual({ body: { code: 'preview_approval_unavailable' }, init: expect.objectContaining({ status: 409 }) });
    await expect(handlers.revoke({ uid: 'teacher-1', body: { ...body, approvalId: 'approval-1', unexpected: true } }))
      .resolves.toEqual({ body: { code: 'invalid_request' }, init: expect.objectContaining({ status: 400 }) });
    expect(recordRevocation).not.toHaveBeenCalled();
  });

  it('fails before candidate/activity reads when teacher authority is absent', async () => {
    const readCandidate = vi.fn(async () => candidate());
    const handlers = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'student', status: 'active' }), readBookAuthority: async () => authority(), readCandidate,
      readActivities: async () => [], sourceIsPreviewReady: async () => true, recordApproval: async () => undefined,
    }, registryVersion: 'registry-v1' });
    await expect(handlers.preview({ uid: 'student-1', body })).resolves.toEqual({ body: { code: 'preview_forbidden' }, init: expect.objectContaining({ status: 403 }) });
    expect(readCandidate).not.toHaveBeenCalled();
  });

  it('fails closed before candidate reads when a formerly eligible teacher is revoked', async () => {
    const readCandidate = vi.fn(async () => candidate());
    const handlers = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'blocked' }), readBookAuthority: async () => authority(), readCandidate,
      readActivities: async () => [], sourceIsPreviewReady: async () => true, recordApproval: async () => undefined,
    }, registryVersion: 'registry-v1' });
    await expect(handlers.preview({ uid: 'teacher-1', body })).resolves.toEqual({ body: { code: 'preview_forbidden' }, init: expect.objectContaining({ status: 403 }) });
    expect(readCandidate).not.toHaveBeenCalled();
  });

  it('rejects malformed commands before reads or approval writes', async () => {
    const readCandidate = vi.fn(async () => candidate());
    const recordApproval = vi.fn(async () => undefined);
    const handlers = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(), readCandidate,
      readActivities: async () => [], sourceIsPreviewReady: async () => true, recordApproval,
    }, registryVersion: 'registry-v1' });
    await expect(handlers.approve({ uid: 'teacher-1', body: { ...body, unexpected: true } }))
      .resolves.toEqual({ body: { code: 'invalid_request' }, init: expect.objectContaining({ status: 400 }) });
    await expect(handlers.approve({ uid: 'teacher-1', body: { ...body, registryVersion: 'registry-client-forbidden' } }))
      .resolves.toEqual({ body: { code: 'invalid_request' }, init: expect.objectContaining({ status: 400 }) });
    expect(readCandidate).not.toHaveBeenCalled();
    expect(recordApproval).not.toHaveBeenCalled();
  });

  it('fails closed when the renderer registry is not server-configured', async () => {
    const readUser = vi.fn(async () => ({ role: 'teacher', status: 'active' }));
    const handlers = createCandidatePreviewWorkerHandlers({ port: {
      readUser, readBookAuthority: async () => authority(), readCandidate: async () => candidate(),
      readActivities: async () => [], sourceIsPreviewReady: async () => true, recordApproval: async () => undefined,
    } });
    await expect(handlers.preview({ uid: 'teacher-1', body })).resolves.toEqual({
      body: { code: 'preview_registry_unavailable' },
      init: expect.objectContaining({ status: 503 }),
    });
    expect(readUser).not.toHaveBeenCalled();
  });

  it('rejects stale or source-unready candidates without approval write', async () => {
    const recordApproval = vi.fn(async () => undefined);
    const staleHandlers = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(),
      readCandidate: async () => ({ ...candidate(), revision: 6 }), readActivities: async () => [],
      sourceIsPreviewReady: async () => true, recordApproval,
    }, registryVersion: 'registry-v1' });
    await expect(staleHandlers.approve({ uid: 'teacher-1', body }))
      .resolves.toEqual({ body: { code: 'preview_candidate_stale' }, init: expect.objectContaining({ status: 409 }) });

    const sourceHandlers = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(),
      readCandidate: async () => candidate(), readActivities: async () => [{ activityKey: 'activity-1', ownerId: 'teacher-1', lifecycle: 'validated', content: activity() }],
      sourceIsPreviewReady: async () => false, recordApproval,
    }, registryVersion: 'registry-v1' });
    await expect(sourceHandlers.approve({ uid: 'teacher-1', body }))
      .resolves.toEqual({ body: { code: 'source-not-previewable' }, init: expect.objectContaining({ status: 409 }) });
    expect(recordApproval).not.toHaveBeenCalled();
  });

  it('rejects cross-owner Book, candidate, and Activity inputs without approval write', async () => {
    const recordApproval = vi.fn(async () => undefined);
    const readCandidate = vi.fn(async () => candidate());
    const foreignBook = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'active' }),
      readBookAuthority: async () => ({ ...authority(), ownerId: 'teacher-2' }), readCandidate,
      readActivities: async () => [], sourceIsPreviewReady: async () => true, recordApproval,
    }, registryVersion: 'registry-v1' });
    await expect(foreignBook.approve({ uid: 'teacher-1', body }))
      .resolves.toEqual({ body: { code: 'preview_forbidden' }, init: expect.objectContaining({ status: 403 }) });
    expect(readCandidate).not.toHaveBeenCalled();

    const foreignCandidate = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(),
      readCandidate: async () => ({ ...candidate(), ownerId: 'teacher-2' }), readActivities: async () => [],
      sourceIsPreviewReady: async () => true, recordApproval,
    }, registryVersion: 'registry-v1' });
    await expect(foreignCandidate.approve({ uid: 'teacher-1', body }))
      .resolves.toEqual({ body: { code: 'preview_candidate_stale' }, init: expect.objectContaining({ status: 409 }) });

    const foreignActivity = createCandidatePreviewWorkerHandlers({ port: {
      readUser: async () => ({ role: 'teacher', status: 'active' }), readBookAuthority: async () => authority(),
      readCandidate: async () => candidate(), readActivities: async () => [{ activityKey: 'activity-1', ownerId: 'teacher-2', lifecycle: 'validated', content: activity() }],
      sourceIsPreviewReady: async () => true, recordApproval,
    }, registryVersion: 'registry-v1' });
    await expect(foreignActivity.approve({ uid: 'teacher-1', body }))
      .resolves.toEqual({ body: { code: 'preview_activity_unavailable' }, init: expect.objectContaining({ status: 409 }) });
    expect(recordApproval).not.toHaveBeenCalled();
  });
});

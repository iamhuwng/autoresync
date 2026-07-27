import { describe, expect, it } from 'vitest';

import { normalizeActivity } from './activityCanonical.service';
import type {
  ActivityRevisionRepository,
  ActivityRevisionScope,
  ActivityRevisionVersionRecord,
} from './activityRevisionPublish.service';
import { createActivityRevisionPublishService } from './activityRevisionPublish.service';
import type { EditableActivity, NormalizedActivity } from '../../types/bookActivity.types';

const context = {
  fingerprint: 'context-1',
  sourceVersionId: 'source-1',
  pageGroupId: 'page-group-1',
  mappedBookPageRefs: ['book-page-1'],
} as const;

const content = (interactionCount = 2): EditableActivity => ({
  schemaVersion: 1,
  title: 'Vocabulary practice',
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Complete each item.' }],
  interaction: { family: 'text-entry', variant: 'fill-blank' },
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
  stimulus: null,
  assetRefs: [],
  interactions: Array.from({ length: interactionCount }, (_, index) => ({
    prompt: `Prompt ${index + 1}`,
    acceptedAnswers: [`answer-${index + 1}`],
  })),
  scoring: { mode: 'auto-where-possible' },
});

const idProvider = (ids: string[]) => ({
  createId: () => {
    const id = ids.shift();
    if (!id) throw new Error('test ID provider exhausted');
    return id;
  },
});

const approval = (fingerprint: string, approvedAt = '2026-07-28T00:00:00.000Z') => ({
  approvalId: fingerprint,
  approvedAt,
  expiresAt: '2026-07-28T00:10:00.000Z',
});

const version = (activity: NormalizedActivity, editable: EditableActivity = content(), placementIds: readonly string[] = ['placement-1']): ActivityRevisionVersionRecord => ({
  schemaVersion: 1,
  activityId: 'activity-1',
  versionId: 'activity-1-v1',
  version: 1,
  ownerId: 'teacher-1',
  editable,
  activity,
  projection: {
    schemaVersion: 1,
    title: activity.title,
    taskProfile: null,
    presentationMode: activity.presentationMode,
    contextRequirement: activity.contextRequirement,
    instructions: activity.instructions,
    stimulus: activity.stimulus,
    assetRefs: activity.assetRefs,
    interaction: activity.interaction,
    answerRule: activity.answerRule,
    interactions: activity.interactions.map((entry) => ({
      family: 'text-entry' as const,
      interactionId: entry.interactionId,
      prompt: entry.prompt,
    })),
    scoring: { mode: activity.scoring.mode, feedbackVisibility: 'none' },
  },
  semanticImpact: { classification: 'added', reasons: ['initial'], requiresRedo: false },
  sourceContextFingerprint: null,
  placementIds,
  evidenceRefs: [],
  sourceEvidenceRefs: [],
  answerEvidenceRefs: [],
  createdByOperationId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-28T00:00:00.000Z',
});

class FakeRepository implements ActivityRevisionRepository {
  constructor(private scope: ActivityRevisionScope) {}

  async readScope(): Promise<ActivityRevisionScope> {
    return structuredClone(this.scope);
  }

  async transaction<T>(
    _activityId: string,
    mutate: (scope: ActivityRevisionScope) => {
      outcome: T;
      next?: ActivityRevisionScope;
      write: boolean;
    },
  ): Promise<T> {
    const result = mutate(structuredClone(this.scope));
    if (result.write) this.scope = structuredClone(result.next ?? this.scope);
    return result.outcome;
  }
}

describe('Activity revision publish service', () => {
  it('preserves hidden identities only for an exact canonical topology', async () => {
    const currentActivity = normalizeActivity(content(), idProvider(['interaction-1', 'interaction-2']));
    const repository = new FakeRepository({
      current: { activityId: 'activity-1', versionId: 'activity-1-v1', version: 1, contextFingerprint: context.fingerprint },
      currentContext: context,
      versions: { 'activity-1-v1': version(currentActivity) },
    });
    const service = createActivityRevisionPublishService(repository, { idProvider: idProvider([]) });
    const result = await service.preview({
      activityId: 'activity-1',
      ownerId: 'teacher-1',
      expectedCurrentVersionId: 'activity-1-v1',
      expectedContextFingerprint: context.fingerprint,
      replacement: { ...content(), title: 'Display-only replacement' },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.candidate.normalized.interactions.map((entry) => entry.interactionId)).toEqual([
      'interaction-1',
      'interaction-2',
    ]);
  });

  it('rejects caller source-context or Placement lineage that differs from trusted current state', async () => {
    const currentActivity = normalizeActivity(content(), idProvider(['interaction-1', 'interaction-2']));
    const repository = new FakeRepository({
      current: { activityId: 'activity-1', versionId: 'activity-1-v1', version: 1, contextFingerprint: context.fingerprint },
      currentContext: context,
      versions: { 'activity-1-v1': version(currentActivity) },
    });
    const service = createActivityRevisionPublishService(repository, { idProvider: idProvider([]) });
    await expect(service.preview({
      activityId: 'activity-1',
      ownerId: 'teacher-1',
      expectedCurrentVersionId: 'activity-1-v1',
      expectedContextFingerprint: context.fingerprint,
      sourceContext: { ...context, pageGroupId: 'forged-page-group' },
      placementIds: ['forged-placement'],
      replacement: content(),
    })).resolves.toEqual({ status: 'conflict', failureCode: 'stale-source-context' });
  });

  it('previews full replacement, remints identities when topology changes, and keeps projection answer-safe', async () => {
    const currentActivity = normalizeActivity(content(), idProvider(['interaction-1', 'interaction-2']));
    const repository = new FakeRepository({
      current: {
        activityId: 'activity-1',
        versionId: 'activity-1-v1',
        version: 1,
        contextFingerprint: context.fingerprint,
      },
      currentContext: context,
      versions: { 'activity-1-v1': version(currentActivity) },
    });
    const service = createActivityRevisionPublishService(repository, {
      idProvider: idProvider(['interaction-3', 'interaction-4', 'interaction-5']),
    });

    const result = await service.preview({
      activityId: 'activity-1',
      ownerId: 'teacher-1',
      expectedCurrentVersionId: 'activity-1-v1',
      expectedContextFingerprint: context.fingerprint,
      replacement: content(3),
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.candidate.activityId).toBe('activity-1');
    expect(result.candidate.semanticImpact.classification).toBe('redo-required');
    expect(result.candidate.normalized.interactions.map((entry) => entry.interactionId)).toEqual([
      'interaction-3',
      'interaction-4',
      'interaction-5',
    ]);
    expect(result.candidate.projection.interactions).toEqual([
      { family: 'text-entry', interactionId: 'interaction-3', prompt: 'Prompt 1' },
      { family: 'text-entry', interactionId: 'interaction-4', prompt: 'Prompt 2' },
      { family: 'text-entry', interactionId: 'interaction-5', prompt: 'Prompt 3' },
    ]);
    expect(JSON.stringify(result.candidate.projection)).not.toContain('answerKey');
    expect(JSON.stringify(result.candidate.projection)).not.toContain('acceptedAnswers');
  });

  it('publishes one immutable successor, advances the pointer, preserves candidates, and replays idempotently', async () => {
    const currentActivity = normalizeActivity(content(), idProvider(['interaction-1', 'interaction-2']));
    const repository = new FakeRepository({
      current: {
        activityId: 'activity-1',
        versionId: 'activity-1-v1',
        version: 1,
        contextFingerprint: context.fingerprint,
      },
      currentContext: context,
      candidates: {},
      versions: { 'activity-1-v1': version(currentActivity) },
    });
    const service = createActivityRevisionPublishService(repository, {
      idProvider: idProvider(['interaction-3', 'interaction-4', 'interaction-5']),
      versionIdProvider: idProvider(['activity-1-v2']),
    });
    const preview = await service.preview({
      activityId: 'activity-1',
      ownerId: 'teacher-1',
      candidateId: 'candidate-1',
      candidateRevision: 2,
      expectedCurrentVersionId: 'activity-1-v1',
      expectedContextFingerprint: context.fingerprint,
      placementIds: ['placement-1'],
      evidenceRefs: ['import:activity-1'],
      sourceEvidenceRefs: ['source:full:page:4'],
      answerEvidenceRefs: ['answer:activity-1:v1'],
      replacement: content(3),
    });
    expect(preview.status).toBe('ready');
    if (preview.status !== 'ready') return;

    const invalidApproval = await service.publish({
      operationId: 'operation-68-invalid-approval',
      ownerId: 'teacher-1',
      candidate: preview.candidate,
      previewApproval: approval('fnv1a64:0000000000000000'),
      now: '2026-07-28T00:01:00.000Z',
    });
    expect(invalidApproval).toEqual({ status: 'invalid', failureCode: 'preview-approval-invalid' });

    const first = await service.publish({
      operationId: 'operation-68-1',
      ownerId: 'teacher-1',
      candidate: preview.candidate,
      previewApproval: approval(preview.candidate.fingerprint),
      now: '2026-07-28T00:01:00.000Z',
    });
    expect(first).toMatchObject({
      status: 'revised',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v2',
      activityVersion: 2,
      predecessorActivityVersionId: 'activity-1-v1',
      candidateId: 'candidate-1',
      candidateRevision: 2,
      placementIds: ['placement-1'],
    });
    expect(JSON.stringify(first)).not.toContain('acceptedAnswers');

    const replay = await service.publish({
      operationId: 'operation-68-1',
      ownerId: 'teacher-1',
      candidate: preview.candidate,
      previewApproval: approval(preview.candidate.fingerprint),
      now: '2026-07-28T00:02:00.000Z',
    });
    expect(replay).toMatchObject({ status: 'replayed', activityVersionId: 'activity-1-v2' });

    const scope = await repository.readScope();
    expect(scope.current).toMatchObject({ activityId: 'activity-1', versionId: 'activity-1-v2', version: 2 });
    expect(Object.keys(scope.versions)).toEqual(['activity-1-v1', 'activity-1-v2']);
    expect(scope.candidates?.['candidate-1']).toMatchObject({
      ownerId: 'teacher-1',
      candidateRevision: 2,
      evidenceRefs: ['import:activity-1'],
      sourceEvidenceRefs: ['source:full:page:4'],
      answerEvidenceRefs: ['answer:activity-1:v1'],
    });
  });

  it('rejects stale publication without writing and rolls back by pointer while retaining immutable history', async () => {
    const currentActivity = normalizeActivity(content(), idProvider(['interaction-1', 'interaction-2']));
    const repository = new FakeRepository({
      current: { activityId: 'activity-1', versionId: 'activity-1-v1', version: 1, contextFingerprint: context.fingerprint },
      currentContext: context,
      candidates: {},
      versions: { 'activity-1-v1': version(currentActivity) },
    });
    const service = createActivityRevisionPublishService(repository, {
      idProvider: idProvider(['interaction-3', 'interaction-4', 'interaction-5']),
      versionIdProvider: idProvider(['activity-1-v2']),
    });
    const preview = await service.preview({
      activityId: 'activity-1',
      ownerId: 'teacher-1',
      candidateId: 'candidate-1',
      candidateRevision: 1,
      expectedCurrentVersionId: 'activity-1-v1',
      expectedContextFingerprint: context.fingerprint,
      replacement: content(3),
    });
    expect(preview.status).toBe('ready');
    if (preview.status !== 'ready') return;
    const published = await service.publish({ operationId: 'operation-68-2', ownerId: 'teacher-1', candidate: preview.candidate, previewApproval: approval(preview.candidate.fingerprint), now: '2026-07-28T00:03:00.000Z' });
    expect(published.status).toBe('revised');
    const stale = await service.publish({ operationId: 'operation-68-stale', ownerId: 'teacher-1', candidate: preview.candidate, previewApproval: approval(preview.candidate.fingerprint), now: '2026-07-28T00:04:00.000Z' });
    expect(stale).toEqual({ status: 'conflict', failureCode: 'stale-current-activity-version' });
    const rolledBack = await service.rollback({
      operationId: 'operation-68-rollback',
      ownerId: 'teacher-1',
      activityId: 'activity-1',
      expectedCurrentVersionId: 'activity-1-v2',
      targetVersionId: 'activity-1-v1',
      now: '2026-07-28T00:05:00.000Z',
    });
    expect(rolledBack).toMatchObject({ status: 'rolled-back' });
    const scope = await repository.readScope();
    expect(scope.current).toMatchObject({ versionId: 'activity-1-v1', version: 1 });
    expect(Object.keys(scope.versions)).toEqual(['activity-1-v1', 'activity-1-v2']);
    expect(scope.candidates?.['candidate-1']).toBeDefined();
  });

  it('keeps current pointer, versions, and operation ledger unchanged when version allocation crashes', async () => {
    const currentActivity = normalizeActivity(content(), idProvider(['interaction-1', 'interaction-2']));
    const repository = new FakeRepository({
      current: { activityId: 'activity-1', versionId: 'activity-1-v1', version: 1, contextFingerprint: context.fingerprint },
      currentContext: context,
      versions: { 'activity-1-v1': version(currentActivity) },
    });
    const service = createActivityRevisionPublishService(repository, {
      idProvider: idProvider(['interaction-3', 'interaction-4', 'interaction-5']),
      versionIdProvider: { createId: () => { throw new Error('test ID provider exhausted'); } },
    });
    const preview = await service.preview({
      activityId: 'activity-1',
      ownerId: 'teacher-1',
      candidateId: 'candidate-crash',
      expectedCurrentVersionId: 'activity-1-v1',
      expectedContextFingerprint: context.fingerprint,
      replacement: content(3),
    });
    expect(preview.status).toBe('ready');
    if (preview.status !== 'ready') return;
    await expect(service.publish({
      operationId: 'operation-68-crash',
      ownerId: 'teacher-1',
      candidate: preview.candidate,
      previewApproval: approval(preview.candidate.fingerprint),
      now: '2026-07-28T00:06:00.000Z',
    })).rejects.toThrow('test ID provider exhausted');
    const scope = await repository.readScope();
    expect(scope.current).toMatchObject({ versionId: 'activity-1-v1', version: 1 });
    expect(Object.keys(scope.versions)).toEqual(['activity-1-v1']);
    expect(scope.operations?.['operation-68-crash']).toBeUndefined();
    expect(scope.candidates?.['candidate-crash']).toBeDefined();
  });
});

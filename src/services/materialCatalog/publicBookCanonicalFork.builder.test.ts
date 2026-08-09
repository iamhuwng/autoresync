import { describe, expect, it } from 'vitest';
import type { EditableActivity, NormalizedActivity } from '../../types/bookActivity.types';
import { normalizeActivity } from '../book-activity/activityCanonical.service';
import { projectStudentActivity } from '../book-activity/activityProjection.service';
import {
  createCanonicalActivityVersionFingerprint,
  createCanonicalPublicBookForkPlacementSetFingerprint,
  type CanonicalPublishedActivityVersionRecord,
} from '../book-assembly/canonicalActivityVersion.service';
import { buildPublicBookCanonicalFork } from './publicBookCanonicalFork.builder';

const sourcePage = {
  sourceKey: 'full',
  sourceVersionId: 'source-v1',
  physicalPageNumber: 4,
} as const;

const sourceActivity = (): NormalizedActivity => {
  const editable: EditableActivity = {
    schemaVersion: 1,
    title: 'Choose the correct answer',
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
  };
  let nextId = 0;
  return normalizeActivity(editable, { createId: () => `identity-${++nextId}` });
};

const sourceRecord = (): CanonicalPublishedActivityVersionRecord => {
  const activity = sourceActivity();
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    lifecycle: 'published' as const,
    activityId: 'activity-source-1',
    activityVersionId: 'activity-source-1-v1',
    activityVersion: 1,
    ownerId: 'teacher-source',
    activity,
    projection: projectStudentActivity(activity),
    placementIds: ['placement-source-1', 'placement-source-2'],
    evidenceRefs: ['import:activity-source-1'],
    sourceContextFingerprint: null,
    createdByOperationId: '00000000-0000-4000-8000-000000000001',
    publishedAt: '2026-08-09T00:00:00.000Z',
    provenance: {
      kind: 'initial-book-publication' as const,
      bookId: 'book-source-1',
      manifestVersionId: 'manifest-source-1',
      publicationId: 'publication-source-1',
      publicationRevision: 4,
      unitKey: 'unit-source-1',
      activityKey: 'activity-key-source-1',
      sourcePages: [sourcePage],
    },
  };
  return {
    ...withoutFingerprint,
    payloadFingerprint: createCanonicalActivityVersionFingerprint(withoutFingerprint),
  };
};

const sourcePins = () => ({
  sourceBookId: 'book-source-1',
  sourceOwnerId: 'teacher-source',
  sourceManifestVersionId: 'manifest-source-1',
  sourcePublicationId: 'publication-source-1',
  sourcePublicationRevision: 4,
  sourceVersionId: 'source-v1',
  sourceActivityId: 'activity-source-1',
  sourceActivityVersionId: 'activity-source-1-v1',
  sourceActivityVersion: 1,
  sourcePayloadFingerprint: sourceRecord().payloadFingerprint,
  sourcePlacementIds: ['placement-source-1', 'placement-source-2'],
  sourcePlacementSetFingerprint: createCanonicalPublicBookForkPlacementSetFingerprint([
    'placement-source-1',
    'placement-source-2',
  ]),
  sourceNodeKey: 'node-source-1',
  sourcePlacementId: 'placement-source-1',
  sourceUnitKey: 'unit-source-1',
  sourceActivityKey: 'activity-key-source-1',
  selectionPath: ['unit-source-1'],
  selectionOrder: 2,
  sourcePages: [sourcePage],
  sourcePageGroupKeys: ['group-source-1'],
  sourceContextFingerprint: null,
});

describe('publicBookCanonicalFork.builder', () => {
  it('clones the private semantic unit and derives an answer-free safe sibling', async () => {
    const source = sourceRecord();
    const sourceBefore = structuredClone(source);
    const result = await buildPublicBookCanonicalFork({
      actorId: 'teacher-target',
      operationId: '00000000-0000-4000-8000-000000000101',
      now: '2026-08-09T00:01:00.000Z',
      source,
      sourcePins: sourcePins(),
      targetPins: {
        targetBookId: 'book-target-1',
        targetOwnerId: 'teacher-target',
        targetOriginalNodeId: 'node-target-1',
        targetPlacementId: 'placement-target-1',
        targetAppendOrder: 3,
        targetBookUpdatedAt: '2026-08-09T00:00:30.000Z',
      },
      selection: {
        sourceBookId: 'book-source-1',
        publicationId: 'publication-source-1',
        publicationRevision: 4,
        kind: 'activity',
        selectionPath: ['unit-source-1'],
        activities: [{
          activityId: 'activity-source-1',
          activityVersionId: 'activity-source-1-v1',
          order: 2,
        }],
      },
    });

    expect(source).toEqual(sourceBefore);
    expect(result.record.activity).toEqual(source.activity);
    expect(result.record.activity).not.toBe(source.activity);
    expect(result.record.activity.interactions[0]!.answerKey).toEqual(
      source.activity.interactions[0]!.answerKey,
    );
    expect(result.record.activityId).not.toBe(source.activityId);
    expect(result.record.activityVersionId).not.toBe(source.activityVersionId);
    expect(result.record.activityVersion).toBe(1);
    expect(result.record.predecessorActivityVersionId).toBeUndefined();
    expect(result.record.projection).toEqual(projectStudentActivity(result.record.activity));
    expect(JSON.stringify(result.record.projection)).not.toContain('answerKey');
    expect(result.record.provenance.kind).toBe('public-book-fork');
  });

  it('rejects a source placement set that is not the exact sorted canonical set', async () => {
    await expect(buildPublicBookCanonicalFork({
      actorId: 'teacher-target',
      operationId: '00000000-0000-4000-8000-000000000102',
      now: '2026-08-09T00:01:00.000Z',
      source: sourceRecord(),
      sourcePins: { ...sourcePins(), sourcePlacementIds: ['placement-source-2', 'placement-source-1'] },
      targetPins: {
        targetBookId: 'book-target-1',
        targetOwnerId: 'teacher-target',
        targetOriginalNodeId: 'node-target-1',
        targetPlacementId: 'placement-target-2',
        targetAppendOrder: 3,
        targetBookUpdatedAt: '2026-08-09T00:00:30.000Z',
      },
      selection: {
        sourceBookId: 'book-source-1',
        publicationId: 'publication-source-1',
        publicationRevision: 4,
        kind: 'activity',
        selectionPath: ['unit-source-1'],
        activities: [{ activityId: 'activity-source-1', activityVersionId: 'activity-source-1-v1', order: 2 }],
      },
    })).rejects.toThrow('public_book_fork_source_placement_set_unsorted');
  });
});

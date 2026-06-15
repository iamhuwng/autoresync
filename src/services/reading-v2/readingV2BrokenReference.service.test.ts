import { describe, expect, it } from 'vitest';
import {
  assertReadingV2MasterHasNoBrokenRefs,
  detectReadingV2BrokenReferences,
} from './readingV2BrokenReference.service';

const ref = (overrides: Record<string, unknown> = {}) => ({
  refId: 'ref-1',
  passageMaterialId: 'passage-1',
  materialId: 'passage-1',
  snapshotVersionId: 'snapshot-1',
  order: 1,
  titleSnapshot: 'Passage 1',
  questionCountSnapshot: 13,
  testTypeIdsSnapshot: ['ielts'],
  ...overrides,
});

const composition = (passageRefs = [ref()]) => ({
  compositionId: 'composition-1',
  testMaterialId: 'master-1',
  ownerId: 'teacher-1',
  title: 'Master test',
  passageRefs,
});

describe('readingV2BrokenReference.service', () => {
  it('detects archived, missing, missing-version, missing-projection, and inaccessible refs', () => {
    const summary = detectReadingV2BrokenReferences({
      composition: composition([
        ref({ refId: 'ref-archived', passageMaterialId: 'passage-archived' }),
        ref({ refId: 'ref-deleted', passageMaterialId: 'passage-deleted' }),
        ref({ refId: 'ref-missing-version', passageMaterialId: 'passage-version' }),
        ref({ refId: 'ref-missing-projection', passageMaterialId: 'passage-projection' }),
        ref({ refId: 'ref-inaccessible', passageMaterialId: 'passage-inaccessible' }),
      ]) as any,
      passageStates: {
        'passage-archived': {
          materialId: 'passage-archived',
          ownerId: 'teacher-1',
          state: 'archived',
          currentVersionId: 'snapshot-1',
          versionExists: true,
          projectionExists: true,
          accessible: true,
        },
        'passage-version': {
          materialId: 'passage-version',
          ownerId: 'teacher-1',
          state: 'published',
          currentVersionId: 'snapshot-1',
          versionExists: false,
          projectionExists: true,
          accessible: true,
        },
        'passage-projection': {
          materialId: 'passage-projection',
          ownerId: 'teacher-1',
          state: 'published',
          currentVersionId: 'snapshot-1',
          versionExists: true,
          projectionExists: false,
          accessible: true,
        },
        'passage-inaccessible': {
          materialId: 'passage-inaccessible',
          ownerId: 'teacher-2',
          state: 'published',
          currentVersionId: 'snapshot-1',
          versionExists: true,
          projectionExists: true,
          accessible: false,
        },
      },
      actorUserId: 'teacher-1',
    });

    expect(summary).toMatchObject({
      hasBrokenRefs: true,
      brokenRefCount: 5,
      brokenRefReasons: [
        'archived',
        'deleted',
        'missing-version',
        'missing-projection',
        'inaccessible',
      ],
    });
    expect(summary.brokenRefs.map((entry) => ({
      refId: entry.refId,
      reason: entry.reason,
      affordances: entry.affordances,
    }))).toEqual([
      {
        refId: 'ref-archived',
        reason: 'archived',
        affordances: ['restore', 'choose-existing', 'remove-ref', 'clone-remake'],
      },
      {
        refId: 'ref-deleted',
        reason: 'deleted',
        affordances: ['choose-existing', 'remove-ref', 'clone-remake'],
      },
      {
        refId: 'ref-missing-version',
        reason: 'missing-version',
        affordances: ['choose-existing', 'remove-ref', 'clone-remake'],
      },
      {
        refId: 'ref-missing-projection',
        reason: 'missing-projection',
        affordances: ['choose-existing', 'remove-ref', 'clone-remake'],
      },
      {
        refId: 'ref-inaccessible',
        reason: 'inaccessible',
        affordances: ['choose-existing', 'remove-ref', 'clone-remake'],
      },
    ]);
  });

  it('treats healthy refs as publishable and fails closed for unresolved broken refs', () => {
    const healthy = detectReadingV2BrokenReferences({
      composition: composition() as any,
      passageStates: {
        'passage-1': {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          state: 'published',
          currentVersionId: 'snapshot-1',
          versionExists: true,
          projectionExists: true,
          accessible: true,
        },
      },
      actorUserId: 'teacher-1',
    });

    expect(healthy).toMatchObject({
      hasBrokenRefs: false,
      brokenRefCount: 0,
      brokenRefs: [],
    });
    expect(() => assertReadingV2MasterHasNoBrokenRefs(healthy)).not.toThrow();

    expect(() => assertReadingV2MasterHasNoBrokenRefs({
      hasBrokenRefs: true,
      brokenRefCount: 1,
      brokenRefReasons: ['archived'],
      brokenRefs: [{
        refId: 'ref-1',
        passageMaterialId: 'passage-1',
        snapshotVersionId: 'snapshot-1',
        reason: 'archived',
        affordances: ['restore'],
      }],
    })).toThrow(/unresolved broken Reading Passage refs/);
  });
});

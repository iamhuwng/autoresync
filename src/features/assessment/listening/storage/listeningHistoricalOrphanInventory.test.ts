import { describe, expect, it, vi } from 'vitest';

import {
  LISTENING_HISTORICAL_ORPHAN_INVENTORY_BUDGET,
  planListeningHistoricalOrphanInventoryDryRun,
  runListeningHistoricalOrphanInventoryDryRun,
  type ListeningHistoricalOrphanEvidence,
  type ListeningHistoricalOrphanObject,
} from './listeningHistoricalOrphanInventory';

const now = 1_700_000_000_000;

const object = (key: string, sizeBytes: number): ListeningHistoricalOrphanObject => ({
  key,
  sizeBytes,
  uploadedAt: now - 90_000,
});

const evidence = (
  key: string,
  overrides: Partial<ListeningHistoricalOrphanEvidence> = {},
): ListeningHistoricalOrphanEvidence => ({
  key,
  ownerId: 'teacher-1',
  liveProductReferences: [],
  ...overrides,
});

describe('Listening historical orphan inventory dry-run', () => {
  it('classifies historical orphan categories and excludes retained references from candidates', () => {
    const retainedReference = {
      kind: 'versions' as const,
      id: 'version-1',
      sourcePath: 'listening_authoring/versions/version-1/audioSections/0',
    };
    const plan = planListeningHistoricalOrphanInventoryDryRun({
      runId: 'historical-1',
      now,
      objects: [
        object('audio/deleted-test.mp3', 100),
        object('audio/pre-registry.mp3', 200),
        object('assessment-assets/listening-interim/asset-1/audio.mp3', 300),
        object('audio/missing-owner.mp3', 400),
        object('audio/ambiguous-owner.mp3', 500),
        object('assessment-assets/listening/teacher-1/asset-retained/audio.mp3', 600),
      ],
      evidenceByKey: {
        'audio/deleted-test.mp3': evidence('audio/deleted-test.mp3', {
          deletedTestIds: ['test-deleted'],
        }),
        'audio/pre-registry.mp3': evidence('audio/pre-registry.mp3', {
          preRegistryPermanent: true,
        }),
        'assessment-assets/listening-interim/asset-1/audio.mp3': evidence('assessment-assets/listening-interim/asset-1/audio.mp3', {
          interimRolloutScheme: 'failed-task-4-rollout',
        }),
        'audio/missing-owner.mp3': evidence('audio/missing-owner.mp3', {
          ownerId: undefined,
        }),
        'audio/ambiguous-owner.mp3': evidence('audio/ambiguous-owner.mp3', {
          ownerCandidates: ['teacher-1', 'teacher-2'],
        }),
        'assessment-assets/listening/teacher-1/asset-retained/audio.mp3': evidence('assessment-assets/listening/teacher-1/asset-retained/audio.mp3', {
          assetId: 'asset-retained',
          liveProductReferences: [retainedReference],
        }),
      },
    });

    expect(plan.report).toMatchObject({
      status: 'planned',
      totalObjectCount: 6,
      totalBytes: 2_100,
      candidateCount: 5,
      candidateBytes: 1_500,
      retainedReferenceExclusionCount: 1,
      retainedReferenceExclusionBytes: 600,
      categoryCounts: {
        'deleted-test-leftover': 1,
        'pre-registry-permanent-audio': 1,
        'interim-rollout-object': 1,
        'missing-owner-evidence': 1,
        'ambiguous-owner-evidence': 1,
      },
      categoryBytes: {
        'deleted-test-leftover': 100,
        'pre-registry-permanent-audio': 200,
        'interim-rollout-object': 300,
        'missing-owner-evidence': 400,
        'ambiguous-owner-evidence': 500,
      },
    });
    expect(plan.candidates.map((candidate) => candidate.category)).toEqual([
      'interim-rollout-object',
      'deleted-test-leftover',
      'ambiguous-owner-evidence',
      'missing-owner-evidence',
      'pre-registry-permanent-audio',
    ]);
    expect(plan.candidates.every((candidate) => (
      candidate.executionAuthorized === false
      && candidate.deletionAuthorized === false
    ))).toBe(true);
    expect(plan.exclusions).toEqual([{
      key: 'assessment-assets/listening/teacher-1/asset-retained/audio.mp3',
      sizeBytes: 600,
      reasonCode: 'retained-reference-present',
      retainedReferenceCount: 1,
      observedAt: now,
    }]);
  });

  it('writes only dry-run report/checkpoint and never invokes copy or delete side effects', async () => {
    const deleteObject = vi.fn(async () => undefined);
    const copyObject = vi.fn(async () => undefined);
    const reports: unknown[] = [];
    const checkpoints: unknown[] = [];
    const plan = await runListeningHistoricalOrphanInventoryDryRun({
      repository: {
        listObjects: vi.fn(async () => ({
          objects: [object('audio/deleted-test.mp3', 100)],
        })),
        readEvidenceForObject: vi.fn(async ({ key }) => evidence(key, {
          deletedTestIds: ['test-deleted'],
        })),
        deleteObject,
        copyObject,
      },
      reportSink: {
        writeCheckpoint: vi.fn(async (checkpoint) => { checkpoints.push(checkpoint); }),
        writeReport: vi.fn(async (report) => { reports.push(report); }),
      },
      runId: 'historical-repo',
      now,
    });

    expect(plan.candidates).toHaveLength(1);
    expect(plan.report.budgetUse.r2CopyOperations).toBe(0);
    expect(plan.report.budgetUse.r2DeleteOperations).toBe(0);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(copyObject).not.toHaveBeenCalled();
    expect(reports).toHaveLength(1);
    expect(checkpoints).toHaveLength(1);
  });

  it.each([
    ['object_operation_budget_exceeded', { maxObjectOperations: 1 }],
    ['r2_list_operation_budget_exceeded', { maxR2ListOperations: 0 }],
    ['estimated_wall_clock_budget_exceeded', { maxEstimatedWallClockMs: 1 }],
    ['estimated_cost_budget_exceeded', { maxEstimatedR2CostUsd: 0 }],
  ] as const)('aborts and reports %s before deletion authority', (reason, budgetOverride) => {
    const plan = planListeningHistoricalOrphanInventoryDryRun({
      runId: `historical-${reason}`,
      now,
      objects: [
        object('audio/deleted-test-a.mp3', 100),
        object('audio/deleted-test-b.mp3', 200),
      ],
      evidenceByKey: {
        'audio/deleted-test-a.mp3': evidence('audio/deleted-test-a.mp3', {
          deletedTestIds: ['test-a'],
        }),
        'audio/deleted-test-b.mp3': evidence('audio/deleted-test-b.mp3', {
          deletedTestIds: ['test-b'],
        }),
      },
      budget: {
        ...LISTENING_HISTORICAL_ORPHAN_INVENTORY_BUDGET,
        ...budgetOverride,
      },
    });

    expect(plan.report.status).toBe('aborted');
    expect(plan.report.abortReason).toBe(reason);
    expect(plan.candidates).toEqual([]);
    expect(plan.report.budgetUse.r2CopyOperations).toBe(0);
    expect(plan.report.budgetUse.r2DeleteOperations).toBe(0);
  });

  it('records accepted-risk-required evidence for unresolved orphan classes', () => {
    const plan = planListeningHistoricalOrphanInventoryDryRun({
      runId: 'historical-risk',
      now,
      objects: [
        object('audio/missing-owner.mp3', 400),
        object('audio/ambiguous-owner.mp3', 500),
      ],
      evidenceByKey: {
        'audio/missing-owner.mp3': evidence('audio/missing-owner.mp3', {
          ownerId: undefined,
        }),
        'audio/ambiguous-owner.mp3': evidence('audio/ambiguous-owner.mp3', {
          ownerCandidates: ['teacher-1', 'teacher-2'],
        }),
      },
    });

    expect(plan.acceptedRiskRecords).toEqual([
      {
        category: 'ambiguous-owner-evidence',
        status: 'accepted-risk-record-required-before-deletion',
        candidateCount: 1,
        candidateBytes: 500,
        deletionAuthorized: false,
      },
      {
        category: 'missing-owner-evidence',
        status: 'accepted-risk-record-required-before-deletion',
        candidateCount: 1,
        candidateBytes: 400,
        deletionAuthorized: false,
      },
    ]);
  });
});

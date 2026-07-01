import { describe, expect, it } from 'vitest';

import { LISTENING_PENDING_DELETE_GRACE_MS } from './listeningAssetLifecycle';
import {
  LISTENING_RECONCILIATION_BUDGETS,
  LISTENING_RECONCILIATION_R2_PRICING,
  estimateListeningReconciliationR2CostUsd,
  planListeningDailyPendingDeleteReconciliation,
  planListeningHourlyTempReconciliation,
  runListeningDailyPendingDeleteReconciliationDryRun,
  runListeningHourlyTempReconciliationDryRun,
  type ListeningReconciliationReport,
  type ListeningReconciliationRepository,
  type ListeningSelectedTeacherReconciliationProof,
} from './listeningAssetReconciliationPlanner';
import { LISTENING_STORAGE_ROLLBACK_CONTROLS } from './listeningAssetRollback';
import type { ListeningMediaAssetRecord } from './listeningAssetRegistry';

const now = 1_700_000_000_000;
const dayMs = 24 * 60 * 60 * 1000;

const selectedTeacherProof: ListeningSelectedTeacherReconciliationProof = {
  proofId: 'prd0055-selected-teacher-1782727843357',
  passed: true,
  selectedTeacherRollout: 'single selected-teacher proof window',
  deployedWorkerVersionId: '34970bd6-feb7-4520-87f1-fa6341dc0ba0',
  completedAt: '2026-06-29T10:11:39.527Z',
  stopConditions: {
    unexplainedPermanentObjectGrowth: false,
    failedCleanup: false,
    wrongAudio: false,
    legacyIncompatibility: false,
    productionData: true,
    remoteMutation: true,
  },
};

const asset = (overrides: Partial<ListeningMediaAssetRecord> = {}): ListeningMediaAssetRecord => ({
  assetId: 'asset-1',
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  state: 'temp',
  tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 12_345,
  checksum: 'sha256:proof',
  checksumAlgorithm: 'sha256',
  createdAt: now - dayMs,
  updatedAt: now - dayMs,
  createdBy: 'teacher-1',
  lastReferencedAt: now - dayMs,
  references: {},
  ...overrides,
});

describe('Listening asset reconciliation planner', () => {
  it('aborts with report/checkpoint when selected-teacher Worker proof is missing, failed, or synthetic-only', () => {
    const missingProof = planListeningHourlyTempReconciliation({
      runId: 'run-1',
      now,
      assets: [],
    });

    expect(missingProof.report).toMatchObject({
      status: 'aborted',
      abortReason: 'selected_teacher_proof_missing',
      stopAction: 'stop Task 6.3; rerun selected-teacher Worker proof before reconciliation',
    });
    expect(missingProof.checkpoint).toMatchObject({
      proofId: 'missing-selected-teacher-proof',
      processedAssetIds: [],
      abortReason: 'selected_teacher_proof_missing',
    });
    expect(missingProof.candidates).toEqual([]);

    const failedProof = planListeningDailyPendingDeleteReconciliation({
      runId: 'run-1',
      now,
      assets: [],
      referenceRechecks: {},
      selectedTeacherProof: {
        ...selectedTeacherProof,
        passed: false,
      },
    });
    expect(failedProof.report.abortReason).toBe('selected_teacher_proof_missing');
    expect(failedProof.candidates).toEqual([]);

    const syntheticOnlyProof = planListeningHourlyTempReconciliation({
      runId: 'run-synthetic-only',
      now,
      assets: [asset()],
      selectedTeacherProof: {
        ...selectedTeacherProof,
        proofId: 'internal-fixture-only',
        stopConditions: {
          ...selectedTeacherProof.stopConditions,
          productionData: false,
          remoteMutation: false,
        },
      },
    });
    expect(syntheticOnlyProof.report.abortReason).toBe('selected_teacher_proof_missing');
    expect(syntheticOnlyProof.candidates).toEqual([]);
  });

  it('plans hourly temp reconciliation as report-only with checkpoint, budgets, and no delete authority', () => {
    const plan = planListeningHourlyTempReconciliation({
      runId: 'hourly-1',
      now,
      assets: [
        asset({ assetId: 'asset-fresh', createdAt: now - dayMs + 1 }),
        asset({ assetId: 'asset-old', createdAt: now - dayMs }),
        asset({ assetId: 'asset-committed', state: 'committed' }),
      ],
      selectedTeacherProof,
    });

    expect(plan.report).toMatchObject({
      runId: 'hourly-1',
      runKind: 'hourly-temp',
      status: 'planned',
      proofId: selectedTeacherProof.proofId,
      budget: LISTENING_RECONCILIATION_BUDGETS.hourlyTemp,
    });
    expect(plan.candidates).toEqual([{
      operation: 'report-only-temp-delete-candidate',
      assetId: 'asset-old',
      ownerId: 'teacher-1',
      tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
      reasonCode: 'temp-fallback-24h',
      uploadedAt: now - dayMs,
      observedAt: now,
      executionAuthorized: false,
    }]);
    expect(plan.report.budgetUse.r2DeleteOperations).toBe(0);
    expect(plan.report.budgetUse.firebaseWriteOperations).toBe(0);
    expect(plan.report.blockedCandidateCount).toBe(0);
    expect(plan.checkpoint.processedAssetIds).toEqual(['asset-old']);
  });

  it('plans daily pending-delete reconciliation only after same-tick zero-reference recheck', () => {
    const eligible = asset({
      assetId: 'asset-eligible',
      state: 'pending-delete',
      createdAt: now - (10 * dayMs),
      updatedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      deleteAfter: now,
      references: {},
    });
    const staleRecheck = asset({
      ...eligible,
      assetId: 'asset-stale-recheck',
    });
    const retained = asset({
      ...eligible,
      assetId: 'asset-retained',
      references: {},
    });

    const plan = planListeningDailyPendingDeleteReconciliation({
      runId: 'daily-1',
      now,
      assets: [eligible, staleRecheck, retained],
      referenceRechecks: {
        'asset-eligible': { assetId: 'asset-eligible', ownerId: 'teacher-1', checkedAt: now, references: {} },
        'asset-stale-recheck': { assetId: 'asset-stale-recheck', checkedAt: now - 1, references: {} },
        'asset-retained': { assetId: 'asset-retained', checkedAt: now, references: { versions: { 'v1': true } } },
      },
      selectedTeacherProof,
      cleanupGate: { cleanupEnabled: true, restoreVerifiedAt: now, integrityVerified: true },
    });

    expect(plan.report).toMatchObject({
      runKind: 'daily-pending-delete',
      status: 'planned',
      budget: LISTENING_RECONCILIATION_BUDGETS.dailyPendingDelete,
    });
    expect(plan.candidates).toEqual([{
      operation: 'report-only-durable-delete-candidate',
      assetId: 'asset-eligible',
      ownerId: 'teacher-1',
      stateBefore: 'pending-delete',
      reasonCode: 'pending-delete-grace-elapsed',
      retainedReferenceCount: 0,
      referencesCheckedAt: now,
      observedAt: now,
      executionAuthorized: false,
    }]);
    expect(plan.report.budgetUse.r2DeleteOperations).toBe(0);
    expect(plan.report.budgetUse.firebaseWriteOperations).toBe(0);
    expect(plan.blockedCandidates).toEqual([
      {
        assetId: 'asset-retained',
        ownerId: 'teacher-1',
        reasonCode: 'retained_references_present',
        observedAt: now,
        executionAuthorized: false,
      },
      {
        assetId: 'asset-stale-recheck',
        ownerId: 'teacher-1',
        reasonCode: 'reference_recheck_not_immediate',
        observedAt: now,
        executionAuthorized: false,
      },
    ]);
  });

  it('denies pending-delete candidates when same-tick reference recheck is missing', () => {
    const eligible = asset({
      assetId: 'asset-missing-recheck',
      state: 'pending-delete',
      createdAt: now - (10 * dayMs),
      updatedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      deleteAfter: now,
      references: {},
    });

    const plan = planListeningDailyPendingDeleteReconciliation({
      runId: 'daily-missing-recheck',
      now,
      assets: [eligible],
      referenceRechecks: {},
      selectedTeacherProof,
      cleanupGate: { cleanupEnabled: true, restoreVerifiedAt: now, integrityVerified: true },
    });

    expect(plan.candidates).toEqual([]);
    expect(plan.blockedCandidates).toEqual([{
      assetId: 'asset-missing-recheck',
      ownerId: 'teacher-1',
      reasonCode: 'reference_recheck_required',
      observedAt: now,
      executionAuthorized: false,
    }]);
  });

  it('aborts and preserves checkpoint intent without candidates when capacity budget is exceeded', () => {
    const plan = planListeningHourlyTempReconciliation({
      runId: 'hourly-budget-stop',
      now,
      assets: [
        asset({ assetId: 'asset-1' }),
        asset({ assetId: 'asset-2' }),
      ],
      selectedTeacherProof,
      budget: {
        ...LISTENING_RECONCILIATION_BUDGETS.hourlyTemp,
        maxObjectOperations: 1,
      },
    });

    expect(plan.report.status).toBe('aborted');
    expect(plan.report.abortReason).toBe('object_operation_budget_exceeded');
    expect(plan.report.stopAction).toBe('abort run, preserve checkpoint, report object-operation capacity stop');
    expect(plan.candidates).toEqual([]);
    expect(plan.checkpoint).toMatchObject({
      abortReason: 'object_operation_budget_exceeded',
      nextCursorAssetId: 'asset-2',
      processedAssetIds: ['asset-1'],
    });
  });

  it.each([
    ['r2_operation_budget_exceeded', { maxR2ReadOperations: 0 }],
    ['firebase_operation_budget_exceeded', { maxFirebaseReadOperations: 1 }],
    ['estimated_cost_budget_exceeded', { maxEstimatedR2CostUsd: 0 }],
    ['estimated_wall_clock_budget_exceeded', { maxEstimatedWallClockMs: 1 }],
  ] as const)('aborts and reports %s without continuing candidates', (reason, budgetOverride) => {
    const plan = planListeningHourlyTempReconciliation({
      runId: `hourly-${reason}`,
      now,
      assets: [
        asset({ assetId: 'asset-1' }),
        asset({ assetId: 'asset-2' }),
        asset({ assetId: 'asset-3' }),
      ],
      selectedTeacherProof,
      budget: {
        ...LISTENING_RECONCILIATION_BUDGETS.hourlyTemp,
        ...budgetOverride,
      },
    });

    expect(plan.report.status).toBe('aborted');
    expect(plan.report.abortReason).toBe(reason);
    expect(plan.candidates).toEqual([]);
    expect(plan.checkpoint.processedAssetIds).not.toContain('asset-3');
  });

  it('fails closed for missing owner, cross-owner ambiguity, rollback stop-delete, and backup uncertainty', () => {
    const eligible = (id: string, overrides: Partial<ListeningMediaAssetRecord> = {}) => asset({
      assetId: id,
      state: 'pending-delete',
      createdAt: now - (10 * dayMs),
      updatedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      deleteAfter: now,
      references: {},
      ...overrides,
    });

    const backupUncertain = planListeningDailyPendingDeleteReconciliation({
      runId: 'daily-backup-uncertain',
      now,
      assets: [eligible('asset-backup-uncertain')],
      referenceRechecks: {
        'asset-backup-uncertain': {
          assetId: 'asset-backup-uncertain',
          ownerId: 'teacher-1',
          checkedAt: now,
          references: {},
        },
      },
      selectedTeacherProof,
    });
    expect(backupUncertain.candidates).toEqual([]);
    expect(backupUncertain.blockedCandidates[0]?.reasonCode).toBe('backup_restore_uncertain');

    const failClosed = planListeningDailyPendingDeleteReconciliation({
      runId: 'daily-fail-closed',
      now,
      assets: [
        eligible('asset-missing-owner', { ownerId: '', createdBy: '' }),
        eligible('asset-cross-owner', { createdBy: 'teacher-2' }),
        eligible('asset-rollback'),
      ],
      referenceRechecks: {
        'asset-missing-owner': { assetId: 'asset-missing-owner', checkedAt: now, references: {} },
        'asset-cross-owner': { assetId: 'asset-cross-owner', checkedAt: now, references: {} },
        'asset-rollback': { assetId: 'asset-rollback', ownerId: 'teacher-1', checkedAt: now, references: {} },
      },
      selectedTeacherProof,
      cleanupGate: { cleanupEnabled: true, restoreVerifiedAt: now, integrityVerified: true },
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    });

    expect(failClosed.candidates).toEqual([]);
    expect(failClosed.blockedCandidates.map((candidate) => candidate.reasonCode)).toEqual([
      'asset_owner_ambiguous',
      'asset_owner_missing',
      'rollback_stop_delete',
    ]);
  });

  it('fails closed when same-tick recheck belongs to another owner', () => {
    const eligible = asset({
      assetId: 'asset-owner-mismatch',
      state: 'pending-delete',
      createdAt: now - (10 * dayMs),
      updatedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      deleteAfter: now,
      references: {},
    });

    const plan = planListeningDailyPendingDeleteReconciliation({
      runId: 'daily-owner-mismatch',
      now,
      assets: [eligible],
      referenceRechecks: {
        'asset-owner-mismatch': {
          assetId: 'asset-owner-mismatch',
          ownerId: 'teacher-2',
          checkedAt: now,
          references: {},
        },
      },
      selectedTeacherProof,
      cleanupGate: { cleanupEnabled: true, restoreVerifiedAt: now, integrityVerified: true },
    });

    expect(plan.candidates).toEqual([]);
    expect(plan.blockedCandidates[0]?.reasonCode).toBe('reference_recheck_owner_mismatch');
  });

  it('runs repository-backed dry-run boundaries and writes only report/checkpoint through the injected sink', async () => {
    const reports: ListeningReconciliationReport[] = [];
    const checkpoints: unknown[] = [];
    const repository: ListeningReconciliationRepository = {
      readSelectedTeacherProof: async () => selectedTeacherProof,
      listHourlyTempAssets: async () => ({ assets: [asset({ assetId: 'asset-hourly' })] }),
      listDailyPendingDeleteAssets: async () => ({
        assets: [asset({
          assetId: 'asset-daily',
          state: 'pending-delete',
          createdAt: now - (10 * dayMs),
          updatedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
          pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
          deleteAfter: now,
          references: {},
        })],
      }),
      recheckAssetReferences: async ({ assetId, ownerId }) => ({
        assetId,
        ownerId,
        checkedAt: now,
        references: {},
      }),
    };
    const reportSink = {
      writeCheckpoint: async (checkpoint: unknown) => { checkpoints.push(checkpoint); },
      writeReport: async (report: ListeningReconciliationReport) => { reports.push(report); },
    };

    const hourly = await runListeningHourlyTempReconciliationDryRun({
      repository,
      reportSink,
      runId: 'hourly-repo',
      now,
    });
    const daily = await runListeningDailyPendingDeleteReconciliationDryRun({
      repository,
      reportSink,
      runId: 'daily-repo',
      now,
      cleanupGate: { cleanupEnabled: true, restoreVerifiedAt: now, integrityVerified: true },
    });

    expect(hourly.candidates).toHaveLength(1);
    expect(daily.candidates).toHaveLength(1);
    expect(reports.map((report) => report.runKind)).toEqual(['hourly-temp', 'daily-pending-delete']);
    expect(checkpoints).toHaveLength(2);
    expect(JSON.stringify({ hourly, daily })).not.toContain('historical');
    expect(JSON.stringify({ hourly, daily })).not.toContain('orphan');
  });

  it('does not fetch same-tick reference rechecks after a daily capacity stop', async () => {
    const rechecked: string[] = [];
    const pendingAsset = (id: string) => asset({
      assetId: id,
      state: 'pending-delete',
      createdAt: now - (10 * dayMs),
      updatedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
      deleteAfter: now,
      references: {},
    });
    const repository: ListeningReconciliationRepository = {
      readSelectedTeacherProof: async () => selectedTeacherProof,
      listHourlyTempAssets: async () => ({ assets: [] }),
      listDailyPendingDeleteAssets: async () => ({
        assets: [pendingAsset('asset-1'), pendingAsset('asset-2'), pendingAsset('asset-3')],
      }),
      recheckAssetReferences: async ({ assetId, ownerId }) => {
        rechecked.push(assetId);
        return { assetId, ownerId, checkedAt: now, references: {} };
      },
    };
    const reportSink = {
      writeCheckpoint: async () => undefined,
      writeReport: async () => undefined,
    };

    const plan = await runListeningDailyPendingDeleteReconciliationDryRun({
      repository,
      reportSink,
      runId: 'daily-capacity-recheck',
      now,
      cleanupGate: { cleanupEnabled: true, restoreVerifiedAt: now, integrityVerified: true },
      budget: {
        ...LISTENING_RECONCILIATION_BUDGETS.dailyPendingDelete,
        maxObjectOperations: 1,
      },
    });

    expect(rechecked).toEqual(['asset-1']);
    expect(plan.report.status).toBe('aborted');
    expect(plan.report.abortReason).toBe('object_operation_budget_exceeded');
    expect(plan.candidates).toEqual([]);
    expect(plan.checkpoint.nextCursorAssetId).toBe('asset-2');
  });

  it('dry-run wrappers abort before listing assets or rechecking references when selected-teacher proof fails', async () => {
    const calls: string[] = [];
    const repository: ListeningReconciliationRepository = {
      readSelectedTeacherProof: async () => {
        calls.push('readSelectedTeacherProof');
        return { ...selectedTeacherProof, passed: false };
      },
      listHourlyTempAssets: async () => {
        calls.push('listHourlyTempAssets');
        return { assets: [asset()] };
      },
      listDailyPendingDeleteAssets: async () => {
        calls.push('listDailyPendingDeleteAssets');
        return { assets: [asset({ state: 'pending-delete' })] };
      },
      recheckAssetReferences: async ({ assetId, ownerId }) => {
        calls.push('recheckAssetReferences');
        return { assetId, ownerId, checkedAt: now, references: {} };
      },
    };
    const reports: ListeningReconciliationReport[] = [];
    const reportSink = {
      writeCheckpoint: async () => undefined,
      writeReport: async (report: ListeningReconciliationReport) => { reports.push(report); },
    };

    await runListeningHourlyTempReconciliationDryRun({
      repository,
      reportSink,
      runId: 'hourly-proof-fail',
      now,
    });
    await runListeningDailyPendingDeleteReconciliationDryRun({
      repository,
      reportSink,
      runId: 'daily-proof-fail',
      now,
    });

    expect(calls).toEqual(['readSelectedTeacherProof', 'readSelectedTeacherProof']);
    expect(reports.map((report) => report.abortReason)).toEqual([
      'selected_teacher_proof_missing',
      'selected_teacher_proof_missing',
    ]);
  });

  it('sets R2 cost ceilings from current Cloudflare public pricing constants', () => {
    expect(LISTENING_RECONCILIATION_R2_PRICING).toMatchObject({
      sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
      classAUsdPerMillion: 4.50,
      classBUsdPerMillion: 0.36,
      deleteObjectOperationsFree: true,
    });
    expect(estimateListeningReconciliationR2CostUsd({
      classAOperations: 1,
      classBOperations: 25,
    })).toBeCloseTo(0.0000135, 10);
    expect(LISTENING_RECONCILIATION_BUDGETS.hourlyTemp.maxEstimatedR2CostUsd).toBeLessThan(0.00013);
    expect(LISTENING_RECONCILIATION_BUDGETS.dailyPendingDelete.maxEstimatedR2CostUsd).toBeLessThan(0.00013);
  });
});

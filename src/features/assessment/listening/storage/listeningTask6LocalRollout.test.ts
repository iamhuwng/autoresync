import { describe, expect, it } from 'vitest';

import { createListeningTask6LifecycleMetric } from './listeningAssetMetrics';
import {
  evaluateListeningTask6LocalRollout,
  type ListeningTask6ResultReviewProofRow,
} from './listeningTask6LocalRollout';

const now = 1_700_000_000_000;

const selectedTeacherProof = {
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

const resultReviewRows: ListeningTask6ResultReviewProofRow[] = [
  { requirement: 'Chrome result review', status: 'passed', evidence: 'report.json chrome-result-review' },
  { requirement: 'Edge result review', status: 'passed', evidence: 'report.json edge-result-review' },
  { requirement: 'desktop Safari result review', status: 'passed', evidence: 'report.json desktop-safari-result-review' },
  { requirement: 'iOS Safari result review', status: 'passed', evidence: 'report.json ios-safari-result-review' },
  { requirement: 'legacy result records', status: 'passed', evidence: 'legacy public-r2 resolver proof' },
  { requirement: 'new result records', status: 'passed', evidence: 'authorized result-review proof' },
  { requirement: 'authorized issuance', status: 'passed', evidence: 'authorized delivery service proof' },
  { requirement: 'cross-user and cross-owner issuance denied', status: 'passed', evidence: 'cross-owner denial proof' },
];

const metric = (operation: Parameters<typeof createListeningTask6LifecycleMetric>[0]['operation'], observedValue = 0) =>
  createListeningTask6LifecycleMetric({
    metricEventId: `metric-${operation}`,
    createdAt: now,
    ownerScope: 'teacher-1',
    assetId: 'aggregate',
    operation,
    observedValue,
    reasonCode: `${operation}-fixture`,
    stateBefore: 'observed',
    stateAfter: 'reported',
    sizeBytes: operation === 'reclaimed-bytes' ? observedValue : 0,
    durationMs: 10,
    attemptCount: 1,
    runId: 'task-6.9-local-rollout',
  });

describe('PRD-0055 Task 6 local rollout evaluator', () => {
  it('accepts local rollout only when selected-teacher proof, result-review proof, metrics, and boundaries are clean', () => {
    const result = evaluateListeningTask6LocalRollout({
      rolloutId: 'task-6.9-local-rollout',
      observedAt: now,
      selectedTeacherProof,
      reconciliationReports: [
        {
          runKind: 'hourly-temp',
          status: 'planned',
          r2WriteOperations: 0,
          r2DeleteOperations: 0,
          firebaseWriteOperations: 0,
          blockedCandidateCount: 0,
        },
        {
          runKind: 'daily-pending-delete',
          status: 'planned',
          r2WriteOperations: 0,
          r2DeleteOperations: 0,
          firebaseWriteOperations: 0,
          blockedCandidateCount: 0,
        },
      ],
      resultReviewRows,
      metrics: [
        metric('temp-age'),
        metric('reconciliation'),
        metric('delete-failure'),
        metric('issuance-failure'),
        metric('refresh-failure'),
        metric('reclaimed-bytes', 2048),
        metric('auth-denial'),
        metric('assets-blocked-by-references'),
        metric('result-playback-failure'),
      ],
      boundaries: {
        cleanupExecuted: false,
        soloTrafficSwitched: false,
        liveTrafficSwitched: false,
        remoteMutationPerformedInThisPacket: false,
        productionDataReadInThisPacket: false,
      },
    });

    expect(result).toMatchObject({
      status: 'passed',
      selectedTeacherTraffic: 'accepted-prior-worker-proof',
      resultReviewTraffic: 'local-browser-proof',
      soloLiveTraffic: 'public-delivery-preserved',
      cleanupExecution: 'not-run',
    });
    expect(result.stopReasons).toEqual([]);
    expect(result.metricOperationsObserved).toEqual([
      'assets-blocked-by-references',
      'auth-denial',
      'delete-failure',
      'issuance-failure',
      'reclaimed-bytes',
      'reconciliation',
      'refresh-failure',
      'result-playback-failure',
      'temp-age',
    ]);
  });

  it('blocks rollout on missing references, premature deletion, result audio failure, or backup policy conflict', () => {
    const result = evaluateListeningTask6LocalRollout({
      rolloutId: 'task-6.9-local-rollout',
      observedAt: now,
      selectedTeacherProof,
      reconciliationReports: [
        {
          runKind: 'daily-pending-delete',
          status: 'planned',
          r2WriteOperations: 0,
          r2DeleteOperations: 0,
          firebaseWriteOperations: 0,
          blockedCandidateCount: 2,
        },
      ],
      resultReviewRows,
      metrics: [
        metric('temp-age'),
        metric('reconciliation'),
        metric('delete-failure'),
        metric('issuance-failure'),
        metric('refresh-failure'),
        metric('reclaimed-bytes', 2048),
        metric('auth-denial'),
        metric('result-playback-failure', 1),
        metric('assets-blocked-by-references', 2),
      ],
      boundaries: {
        cleanupExecuted: false,
        soloTrafficSwitched: false,
        liveTrafficSwitched: false,
        remoteMutationPerformedInThisPacket: false,
        productionDataReadInThisPacket: false,
      },
      backupPolicyConflict: true,
    });

    expect(result.status).toBe('blocked');
    expect(result.stopReasons).toEqual([
      'missing_references_or_blocked_candidates',
      'result_audio_failure',
      'backup_policy_conflict',
    ]);
  });
});

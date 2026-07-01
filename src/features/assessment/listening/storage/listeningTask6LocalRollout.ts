import type { ListeningAssetMetricEvent } from './listeningAssetMetrics';
import {
  hasSelectedTeacherProofForListeningReconciliation,
  type ListeningReconciliationRunKind,
  type ListeningSelectedTeacherReconciliationProof,
} from './listeningAssetReconciliationPlanner';

export interface ListeningTask6ResultReviewProofRow {
  readonly requirement: string;
  readonly status: 'passed' | 'failed' | 'blocked' | string;
  readonly evidence: string;
}

export interface ListeningTask6RolloutReconciliationReport {
  readonly runKind: ListeningReconciliationRunKind;
  readonly status: 'planned' | 'aborted' | string;
  readonly r2WriteOperations: number;
  readonly r2DeleteOperations: number;
  readonly firebaseWriteOperations: number;
  readonly blockedCandidateCount: number;
}

export interface ListeningTask6LocalRolloutInput {
  readonly rolloutId: string;
  readonly observedAt: number;
  readonly selectedTeacherProof?: ListeningSelectedTeacherReconciliationProof;
  readonly reconciliationReports: readonly ListeningTask6RolloutReconciliationReport[];
  readonly resultReviewRows: readonly ListeningTask6ResultReviewProofRow[];
  readonly metrics: readonly ListeningAssetMetricEvent[];
  readonly boundaries: {
    readonly cleanupExecuted: boolean;
    readonly soloTrafficSwitched: boolean;
    readonly liveTrafficSwitched: boolean;
    readonly remoteMutationPerformedInThisPacket: boolean;
    readonly productionDataReadInThisPacket: boolean;
  };
  readonly backupPolicyConflict?: boolean;
}

export interface ListeningTask6LocalRolloutEvaluation {
  readonly rolloutId: string;
  readonly observedAt: number;
  readonly status: 'passed' | 'blocked';
  readonly selectedTeacherTraffic: 'accepted-prior-worker-proof' | 'missing-or-stale';
  readonly resultReviewTraffic: 'local-browser-proof' | 'missing-or-failed';
  readonly soloLiveTraffic: 'public-delivery-preserved' | 'traffic-switched';
  readonly cleanupExecution: 'not-run' | 'cleanup-or-delete-ran';
  readonly metricOperationsObserved: readonly string[];
  readonly stopReasons: readonly string[];
}

const requiredResultReviewEvidence = [
  'chrome result review',
  'edge result review',
  'desktop safari result review',
  'ios safari result review',
  'legacy result records',
  'new result records',
  'authorized issuance',
  'cross-user and cross-owner issuance denied',
] as const;

const requiredMetricOperations = [
  'assets-blocked-by-references',
  'auth-denial',
  'delete-failure',
  'issuance-failure',
  'reclaimed-bytes',
  'reconciliation',
  'refresh-failure',
  'result-playback-failure',
  'temp-age',
] as const;

const hasPassedRequirement = (
  rows: readonly ListeningTask6ResultReviewProofRow[],
  requirement: string,
): boolean => rows.some((row) =>
  row.status === 'passed'
  && row.requirement.toLowerCase().includes(requirement),
);

const uniqueSortedMetricOperations = (metrics: readonly ListeningAssetMetricEvent[]): readonly string[] =>
  [...new Set(metrics.map((metric) => metric.operation))].sort();

export function evaluateListeningTask6LocalRollout(
  input: ListeningTask6LocalRolloutInput,
): ListeningTask6LocalRolloutEvaluation {
  const stopReasons: string[] = [];
  const selectedTeacherReady = hasSelectedTeacherProofForListeningReconciliation(input.selectedTeacherProof);
  if (!selectedTeacherReady) stopReasons.push('selected_teacher_proof_missing_or_stale');

  const resultReviewReady = requiredResultReviewEvidence.every((requirement) =>
    hasPassedRequirement(input.resultReviewRows, requirement),
  );
  if (!resultReviewReady) stopReasons.push('result_review_proof_missing_or_failed');

  const metricOperations = uniqueSortedMetricOperations(input.metrics);
  for (const operation of requiredMetricOperations) {
    if (!metricOperations.includes(operation)) {
      stopReasons.push(`metric_missing_${operation}`);
    }
  }

  if (input.reconciliationReports.some((report) => report.blockedCandidateCount > 0)) {
    stopReasons.push('missing_references_or_blocked_candidates');
  }
  if (input.reconciliationReports.some((report) =>
    report.r2WriteOperations > 0 || report.r2DeleteOperations > 0 || report.firebaseWriteOperations > 0,
  )) {
    stopReasons.push('premature_deletion_or_mutation');
  }
  if (input.metrics.some((metric) =>
    metric.operation === 'result-playback-failure' && metric.outcome === 'threshold-exceeded',
  )) {
    stopReasons.push('result_audio_failure');
  }
  if (input.backupPolicyConflict) stopReasons.push('backup_policy_conflict');
  if (input.boundaries.cleanupExecuted) stopReasons.push('premature_deletion_or_mutation');
  if (input.boundaries.remoteMutationPerformedInThisPacket) stopReasons.push('remote_mutation_in_packet');
  if (input.boundaries.productionDataReadInThisPacket) stopReasons.push('production_data_read_in_packet');
  if (input.boundaries.soloTrafficSwitched || input.boundaries.liveTrafficSwitched) {
    stopReasons.push('solo_or_live_traffic_switched');
  }

  return {
    rolloutId: input.rolloutId,
    observedAt: input.observedAt,
    status: stopReasons.length === 0 ? 'passed' : 'blocked',
    selectedTeacherTraffic: selectedTeacherReady ? 'accepted-prior-worker-proof' : 'missing-or-stale',
    resultReviewTraffic: resultReviewReady ? 'local-browser-proof' : 'missing-or-failed',
    soloLiveTraffic: input.boundaries.soloTrafficSwitched || input.boundaries.liveTrafficSwitched
      ? 'traffic-switched'
      : 'public-delivery-preserved',
    cleanupExecution: input.boundaries.cleanupExecuted ? 'cleanup-or-delete-ran' : 'not-run',
    metricOperationsObserved: metricOperations,
    stopReasons,
  };
}

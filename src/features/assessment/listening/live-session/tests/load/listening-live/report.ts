import type { ListeningLiveLoadHarnessConfig } from './config';
import type {
  ListeningLiveLoadMetricsSummary,
  ListeningLiveThresholdEvaluation,
} from './metrics';
import type { ListeningLiveLoadScenario } from './scenarios';

export interface ListeningLiveLoadReport {
  readonly runId: string;
  readonly status: ListeningLiveThresholdEvaluation['status'];
  readonly executionMode: ListeningLiveLoadHarnessConfig['executionMode'];
  readonly createdAt: number;
  readonly durationMs: number;
  readonly totals: ListeningLiveLoadScenario['totals'];
  readonly metrics: ListeningLiveLoadMetricsSummary;
  readonly stopReasons: readonly string[];
  readonly productionTrafficChanged: false;
  readonly remoteMutationPerformed: boolean;
  readonly approvalReference?: string;
  readonly methodology: {
    readonly localDryRunDefault: boolean;
    readonly clientFidelity: ListeningLiveLoadScenario['fidelity'];
    readonly networkProfiles: ListeningLiveLoadScenario['networkProfiles'];
    readonly passFailCriteria: readonly string[];
  };
}

export function buildListeningLiveLoadReport({
  config,
  scenario,
  summary,
  evaluation,
}: {
  readonly config: ListeningLiveLoadHarnessConfig;
  readonly scenario: ListeningLiveLoadScenario;
  readonly summary: ListeningLiveLoadMetricsSummary;
  readonly evaluation: ListeningLiveThresholdEvaluation;
}): ListeningLiveLoadReport {
  return {
    runId: config.runId,
    status: evaluation.status,
    executionMode: config.executionMode,
    createdAt: config.createdAt,
    durationMs: scenario.durationMs,
    totals: scenario.totals,
    metrics: summary,
    stopReasons: evaluation.stopReasons,
    productionTrafficChanged: false,
    remoteMutationPerformed: config.executionMode === 'isolated-non-production-project',
    approvalReference: config.remoteApproval?.approvalReference,
    methodology: {
      localDryRunDefault: config.executionMode === 'local-dry-run',
      clientFidelity: scenario.fidelity,
      networkProfiles: scenario.networkProfiles,
      passFailCriteria: [
        '20 sessions and 2,000 students complete steady-state phase',
        '99.5 percent clients connected outside fault windows',
        'write/event latency p95 and p99 stay under PRD-0060 planning thresholds',
        'drift, reconnect, headphone, source handoff, duplicate result, leakage, and quota thresholds pass',
      ],
    },
  };
}

export function serializeListeningLiveLoadReport(
  report: ListeningLiveLoadReport,
): string {
  return JSON.stringify(report);
}

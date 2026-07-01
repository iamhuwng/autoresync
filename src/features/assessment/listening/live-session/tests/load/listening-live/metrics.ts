import type { ListeningLiveLoadMetricName } from './config';
import type { ListeningLiveLoadScenario } from './scenarios';
import type { ListeningLiveLoadHarnessConfig } from './config';

export interface ListeningLiveMetricStats {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly p95: number;
  readonly p99: number;
}

export interface ListeningLiveLoadMetricsSummary {
  readonly counters: Partial<Record<ListeningLiveLoadMetricName, number>>;
  readonly samples: Partial<Record<ListeningLiveLoadMetricName, ListeningLiveMetricStats>>;
  readonly quotaUtilization: Record<string, number>;
}

export interface ListeningLiveThresholdEvaluation {
  readonly status: 'passed' | 'failed';
  readonly stopReasons: readonly string[];
}

export interface ListeningLiveLoadMetricsCollector {
  increment(name: ListeningLiveLoadMetricName, amount?: number): void;
  sample(name: ListeningLiveLoadMetricName, value: number): void;
  setQuotaUtilization(service: string, ratio: number): void;
  snapshot(): {
    readonly counters: ReadonlyMap<ListeningLiveLoadMetricName, number>;
    readonly samples: ReadonlyMap<ListeningLiveLoadMetricName, readonly number[]>;
    readonly quotaUtilization: ReadonlyMap<string, number>;
  };
}

export function createListeningLiveLoadMetrics(): ListeningLiveLoadMetricsCollector {
  const counters = new Map<ListeningLiveLoadMetricName, number>();
  const samples = new Map<ListeningLiveLoadMetricName, number[]>();
  const quotaUtilization = new Map<string, number>();

  return {
    increment(name, amount = 1) {
      counters.set(name, (counters.get(name) ?? 0) + amount);
    },
    sample(name, value) {
      if (!Number.isFinite(value)) return;
      const values = samples.get(name) ?? [];
      values.push(value);
      samples.set(name, values);
    },
    setQuotaUtilization(service, ratio) {
      quotaUtilization.set(service, ratio);
    },
    snapshot() {
      return { counters, samples, quotaUtilization };
    },
  };
}

export function summarizeListeningLiveLoadMetrics(
  metrics: ListeningLiveLoadMetricsCollector,
): ListeningLiveLoadMetricsSummary {
  const snapshot = metrics.snapshot();
  const counters = Object.fromEntries(snapshot.counters) as Partial<Record<ListeningLiveLoadMetricName, number>>;
  const samples = Object.fromEntries(
    Array.from(snapshot.samples.entries()).map(([name, values]) => [name, summarizeValues(values)]),
  ) as Partial<Record<ListeningLiveLoadMetricName, ListeningLiveMetricStats>>;
  const quotaUtilization = Object.fromEntries(snapshot.quotaUtilization);
  return { counters, samples, quotaUtilization };
}

export function evaluateListeningLiveLoadThresholds({
  config,
  scenario,
  summary,
  capturedLogText = '',
}: {
  readonly config: ListeningLiveLoadHarnessConfig;
  readonly scenario: ListeningLiveLoadScenario;
  readonly summary: ListeningLiveLoadMetricsSummary;
  readonly capturedLogText?: string;
}): ListeningLiveThresholdEvaluation {
  const stopReasons: string[] = [];
  const expectedStudents = config.sessions * config.studentsPerSession;
  const connected = summary.counters.load_client_connected ?? 0;

  if (scenario.totals.sessions !== 20) stopReasons.push('steady_state_requires_20_sessions');
  if (connected / expectedStudents < 0.995) stopReasons.push('connected_clients_below_99_5_percent');
  requireSampleAtMost(summary, 'authority_write_latency_ms', 'p95', 750, 'authority_write_p95_above_750_ms', stopReasons);
  requireSampleAtMost(summary, 'authority_write_latency_ms', 'p99', 1_500, 'authority_write_p99_above_1500_ms', stopReasons);
  requireSampleAtMost(summary, 'authority_event_delivery_latency_ms', 'p95', 1_000, 'event_delivery_p95_above_1000_ms', stopReasons);
  requireSampleAtMost(summary, 'authority_event_delivery_latency_ms', 'p99', 2_000, 'event_delivery_p99_above_2000_ms', stopReasons);
  requireZeroCounter(summary, 'duplicate_result_total', 'duplicate_result_total_nonzero', stopReasons);
  requireZeroCounter(summary, 'source_refresh_failure_total', 'source_refresh_failure_total_nonzero', stopReasons);
  requireSampleAtMost(summary, 'student_drift_ms', 'p95', 500, 'student_drift_p95_above_500_ms', stopReasons);
  requireSampleAtMost(summary, 'student_drift_ms', 'max', 2_000, 'student_drift_max_at_or_above_2000_ms', stopReasons);
  requireSampleAtMost(summary, 'reconnect_hydration_ms', 'p95', 5_000, 'reconnect_hydration_p95_above_5000_ms', stopReasons);
  requireSampleAtMost(summary, 'headphone_transition_latency_ms', 'p95', 2_000, 'headphone_transition_p95_above_2000_ms', stopReasons);
  requireSampleAtMost(summary, 'source_handoff_gap_ms', 'p95', 250, 'source_handoff_gap_p95_above_250_ms', stopReasons);

  if (Object.values(summary.quotaUtilization).some((ratio) => ratio > 0.8)) {
    stopReasons.push('quota_utilization_above_80_percent');
  }
  if (containsForbiddenLoadReportLeak(capturedLogText)) {
    stopReasons.push('forbidden_secret_or_media_leakage');
  }

  return { status: stopReasons.length === 0 ? 'passed' : 'failed', stopReasons };
}

function summarizeValues(values: readonly number[]): ListeningLiveMetricStats {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count,
    min: sorted[0] ?? 0,
    max: sorted[count - 1] ?? 0,
    avg: count === 0 ? 0 : total / count,
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index] ?? 0;
}

function requireZeroCounter(
  summary: ListeningLiveLoadMetricsSummary,
  name: ListeningLiveLoadMetricName,
  reason: string,
  stopReasons: string[],
): void {
  if ((summary.counters[name] ?? 0) !== 0) stopReasons.push(reason);
}

function requireSampleAtMost(
  summary: ListeningLiveLoadMetricsSummary,
  name: ListeningLiveLoadMetricName,
  field: keyof ListeningLiveMetricStats,
  max: number,
  reason: string,
  stopReasons: string[],
): void {
  const value = summary.samples[name]?.[field] ?? 0;
  if (value > max) stopReasons.push(reason);
}

function containsForbiddenLoadReportLeak(value: string): boolean {
  return /X-Amz-|Signature=|signedUrl|rawAudio|Bearer\s+|token=|secret/i.test(value);
}

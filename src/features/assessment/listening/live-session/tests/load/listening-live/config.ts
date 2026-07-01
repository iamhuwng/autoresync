export const REQUIRED_LISTENING_LIVE_LOAD_METRICS = [
  'authority_write_latency_ms',
  'authority_event_delivery_latency_ms',
  'authority_revision_conflict_total',
  'authority_retry_total',
  'authority_writer_contention_total',
  'stale_command_ignored_total',
  'student_drift_ms',
  'soft_correction_total',
  'hard_seek_total',
  'reconnect_hydration_ms',
  'source_refresh_latency_ms',
  'source_handoff_gap_ms',
  'source_refresh_failure_total',
  'audio_waiting_duration_ms',
  'headphone_transition_latency_ms',
  'submit_session_end_race_total',
  'duplicate_result_total',
  'load_client_connected',
  'firebase_permission_denied_total',
  'firebase_transaction_rejected_total',
  'quota_utilization_ratio',
] as const;

export type ListeningLiveLoadMetricName = typeof REQUIRED_LISTENING_LIVE_LOAD_METRICS[number];

export type ListeningLiveLoadExecutionMode =
  | 'local-dry-run'
  | 'emulator'
  | 'isolated-non-production-project'
  | 'production';

export interface ListeningLiveLoadRemoteApproval {
  readonly approved: boolean;
  readonly approvalReference: string;
  readonly isolatedProjectId: string;
  readonly cleanupPlan: string;
  readonly allowRemoteMutation: boolean;
}

export interface ListeningLiveLoadHarnessConfig {
  readonly runId: string;
  readonly createdAt: number;
  readonly executionMode: ListeningLiveLoadExecutionMode;
  readonly sessions: number;
  readonly studentsPerSession: number;
  readonly teacherWriters: number;
  readonly collisionMonitorSessions: number;
  readonly heartbeatMs: number;
  readonly rampMs: number;
  readonly steadyStateMs: number;
  readonly recoveryDrainMs: number;
  readonly sessionCodePrefix: string;
  readonly remoteApproval?: ListeningLiveLoadRemoteApproval;
}

export interface ListeningLiveLoadConfigValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function createDefaultListeningLiveLoadHarnessConfig(
  overrides: Partial<ListeningLiveLoadHarnessConfig> = {},
): ListeningLiveLoadHarnessConfig {
  return {
    runId: 'prd0055-task811-local',
    createdAt: 1_700_000_000_000,
    executionMode: 'local-dry-run',
    sessions: 20,
    studentsPerSession: 100,
    teacherWriters: 20,
    collisionMonitorSessions: 5,
    heartbeatMs: 2_000,
    rampMs: 10 * 60 * 1000,
    steadyStateMs: 30 * 60 * 1000,
    recoveryDrainMs: 10 * 60 * 1000,
    sessionCodePrefix: 'prd0055-task811',
    ...overrides,
  };
}

export function validateListeningLiveLoadHarnessConfig(
  config: ListeningLiveLoadHarnessConfig,
): ListeningLiveLoadConfigValidation {
  const errors: string[] = [];

  if (!config.runId.trim()) errors.push('missing_run_id');
  if (!Number.isFinite(config.createdAt) || config.createdAt <= 0) errors.push('invalid_created_at');
  if (config.sessions !== 20) errors.push('requires_20_concurrent_sessions');
  if (config.studentsPerSession !== 100) errors.push('requires_100_students_per_session');
  if (config.teacherWriters !== 20) errors.push('requires_20_teacher_writers');
  if (config.collisionMonitorSessions !== 5) errors.push('requires_five_collision_monitor_sessions');
  if (config.heartbeatMs !== 2_000) errors.push('requires_two_second_heartbeats');
  if (config.rampMs !== 10 * 60 * 1000) errors.push('requires_ten_minute_ramp');
  if (config.steadyStateMs !== 30 * 60 * 1000) errors.push('requires_thirty_minute_steady_state');
  if (config.recoveryDrainMs !== 10 * 60 * 1000) errors.push('requires_ten_minute_recovery_drain');
  if (config.executionMode === 'production') errors.push('production_execution_forbidden');

  if (config.executionMode === 'isolated-non-production-project') {
    const approval = config.remoteApproval;
    if (!approval?.approved || !approval.allowRemoteMutation || !approval.approvalReference.trim()) {
      errors.push('remote_execution_requires_explicit_approval_gate');
    }
    if (!approval?.isolatedProjectId.trim()) {
      errors.push('remote_execution_requires_isolated_project_id');
    }
    if (!approval?.cleanupPlan.trim()) {
      errors.push('remote_execution_requires_cleanup_acknowledgement');
    }
    if (approval?.isolatedProjectId.toLowerCase().includes('prod')) {
      errors.push('isolated_project_must_not_be_production_named');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertListeningLiveLoadHarnessCanRun(
  config: ListeningLiveLoadHarnessConfig,
): void {
  const result = validateListeningLiveLoadHarnessConfig(config);
  if (!result.valid) {
    throw new Error(`Listening live load harness blocked: ${result.errors.join(', ')}`);
  }
}

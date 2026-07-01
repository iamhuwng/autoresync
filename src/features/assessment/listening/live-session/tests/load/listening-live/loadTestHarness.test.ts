import { describe, expect, it } from 'vitest';

import {
  REQUIRED_LISTENING_LIVE_LOAD_METRICS,
  assertListeningLiveLoadHarnessCanRun,
  createDefaultListeningLiveLoadHarnessConfig,
  validateListeningLiveLoadHarnessConfig,
} from './config';
import {
  LISTENING_LIVE_LOAD_NETWORK_PROFILES,
  generateListeningLiveLoadScenario,
} from './scenarios';
import {
  createListeningLiveLoadMetrics,
  evaluateListeningLiveLoadThresholds,
  summarizeListeningLiveLoadMetrics,
} from './metrics';
import {
  buildListeningLiveLoadReport,
  serializeListeningLiveLoadReport,
} from './report';
import {
  createInMemoryListeningLiveLoadSession,
  issueVirtualTeacherAction,
} from './virtualTeacher';
import {
  calculateListeningLiveNetworkDelayMs,
  createVirtualStudentClient,
} from './virtualStudent';

describe('PRD-0055 Task 8.11 listening live-session load-test harness', () => {
  it('validates the default local dry-run config and required PRD-0060 metrics', () => {
    const config = createDefaultListeningLiveLoadHarnessConfig({
      runId: 'prd0055-task811-local',
      createdAt: 1_700_000_000_000,
    });

    expect(config).toMatchObject({
      executionMode: 'local-dry-run',
      sessions: 20,
      studentsPerSession: 100,
      teacherWriters: 20,
      heartbeatMs: 2_000,
      rampMs: 10 * 60 * 1000,
      steadyStateMs: 30 * 60 * 1000,
      recoveryDrainMs: 10 * 60 * 1000,
    });
    expect(validateListeningLiveLoadHarnessConfig(config)).toEqual({ valid: true, errors: [] });
    expect(REQUIRED_LISTENING_LIVE_LOAD_METRICS).toEqual(expect.arrayContaining([
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
    ]));
  });

  it('blocks production and remote execution unless an isolated-project approval gate is explicit', () => {
    const productionConfig = createDefaultListeningLiveLoadHarnessConfig({
      executionMode: 'production',
    });
    expect(validateListeningLiveLoadHarnessConfig(productionConfig).errors).toContain(
      'production_execution_forbidden',
    );
    expect(() => assertListeningLiveLoadHarnessCanRun(productionConfig)).toThrow(/production/i);

    const remoteWithoutGate = createDefaultListeningLiveLoadHarnessConfig({
      executionMode: 'isolated-non-production-project',
    });
    expect(validateListeningLiveLoadHarnessConfig(remoteWithoutGate).errors).toEqual(expect.arrayContaining([
      'remote_execution_requires_explicit_approval_gate',
      'remote_execution_requires_isolated_project_id',
      'remote_execution_requires_cleanup_acknowledgement',
    ]));

    const approvedRemote = createDefaultListeningLiveLoadHarnessConfig({
      executionMode: 'isolated-non-production-project',
      remoteApproval: {
        approved: true,
        approvalReference: 'isolated-project-load-approval-001',
        isolatedProjectId: 'isolated-listening-load-001',
        cleanupPlan: 'test-owned-fixtures-only',
        allowRemoteMutation: true,
      },
    });
    expect(validateListeningLiveLoadHarnessConfig(approvedRemote)).toEqual({ valid: true, errors: [] });
  });

  it('generates the 20-session, 2,000-student methodology with network and fidelity coverage', () => {
    const config = createDefaultListeningLiveLoadHarnessConfig({
      runId: 'prd0055-task811-scenario',
      createdAt: 1_700_000_000_000,
    });
    const scenario = generateListeningLiveLoadScenario(config);

    expect(scenario.totals).toEqual({
      sessions: 20,
      students: 2_000,
      teacherWriters: 20,
      collisionMonitorSessions: 5,
    });
    expect(new Set(scenario.sessions.map((session) => session.sessionCode)).size).toBe(20);
    expect(scenario.sessions.every((session) => session.sessionCode.startsWith('prd0055-task811-'))).toBe(true);
    expect(scenario.sessions.every((session) => session.students.length === 100)).toBe(true);
    expect(scenario.sessions.flatMap((session) => session.students).length).toBe(2_000);
    expect(scenario.sessions.filter((session) => session.collisionTeacherClientId).length).toBe(5);
    expect(scenario.networkProfiles).toEqual(LISTENING_LIVE_LOAD_NETWORK_PROFILES);
    expect(new Set(scenario.sessions.flatMap((session) => session.students.map((student) => student.networkProfile)))).toEqual(
      new Set(LISTENING_LIVE_LOAD_NETWORK_PROFILES),
    );
    expect(Array.from(new Set(scenario.sessions.flatMap((session) => session.teacherActions.map((action) => action.action))))).toEqual(
      expect.arrayContaining(['pause', 'resume', 'seek', 'speed', 'section']),
    );
    expect(Array.from(new Set(scenario.sessions.flatMap((session) => session.studentEvents.map((event) => event.type))))).toEqual(
      expect.arrayContaining(['join', 'reload', 'student-partition', 'media-buffering', 'refresh-delay']),
    );
    expect(scenario.fidelity).toEqual(expect.objectContaining({
      virtualFirebaseSdkClients: true,
      syntheticTeacherAuthorityWriter: true,
      syntheticStudentAuthorityListeners: true,
      browserMediaTierDefined: true,
      studentAuthorityWritesForbidden: true,
    }));
  });

  it('simulates synthetic teacher writes, compare-and-set collisions, and student listener drift locally', () => {
    const metrics = createListeningLiveLoadMetrics();
    const session = createInMemoryListeningLiveLoadSession({
      sessionCode: 'prd0055-task811-001',
      teacherUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
      now: 1_700_000_000_000,
      metrics,
    });

    const resume = issueVirtualTeacherAction({
      session,
      teacherUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
      intent: { action: 'resume' },
      now: 1_700_000_001_000,
      expectedRevision: 1,
      metrics,
    });
    expect(resume.status).toBe('accepted');
    expect(session.state).toEqual(expect.objectContaining({
      revision: 2,
      isPlaying: true,
      lastAction: 'resume',
    }));

    const collision = issueVirtualTeacherAction({
      session,
      teacherUid: 'teacher-1',
      writerClientId: 'teacher-tab-2',
      intent: { action: 'seek', position: 42 },
      now: 1_700_000_002_000,
      expectedRevision: 1,
      retryOnConflict: true,
      metrics,
    });
    expect(collision.status).toBe('retried-after-conflict');
    expect(session.state).toEqual(expect.objectContaining({
      revision: 3,
      position: 42,
      lastAction: 'seek',
    }));

    const student = createVirtualStudentClient({
      studentClientId: 'student-1',
      networkProfile: 'latency-150-jitter-30',
      metrics,
    });
    const receipt = student.receiveCanonicalState({
      masterState: session.state,
      audioSections: [{ number: 1 }, { number: 2 }],
      now: 1_700_000_003_000,
      localAudioIndex: 0,
      localPosition: 41.25,
      sequence: 3,
    });
    expect(receipt).toEqual(expect.objectContaining({
      accepted: true,
      correction: 'soft-correction',
      networkDelayMs: 150,
    }));
    expect(student.attemptAuthorityWrite()).toEqual({
      allowed: false,
      reason: 'student_clients_never_write_authority',
    });

    const summary = summarizeListeningLiveLoadMetrics(metrics);
    expect(summary.counters.authority_revision_conflict_total).toBe(1);
    expect(summary.counters.firebase_transaction_rejected_total).toBe(1);
    expect(summary.counters.authority_retry_total).toBe(1);
    expect(summary.counters.load_client_connected).toBe(1);
    expect(summary.samples.student_drift_ms.count).toBe(1);
  });

  it('models network conditions, audio failures, metrics thresholds, and report output', () => {
    expect(calculateListeningLiveNetworkDelayMs('normal-broadband', 0)).toBe(35);
    expect(calculateListeningLiveNetworkDelayMs('latency-400-jitter-100', 1)).toBeGreaterThanOrEqual(300);
    expect(calculateListeningLiveNetworkDelayMs('teacher-offline-10s', 0)).toBe(10_000);
    expect(calculateListeningLiveNetworkDelayMs('student-offline-15s', 0)).toBe(15_000);

    const config = createDefaultListeningLiveLoadHarnessConfig({
      runId: 'prd0055-task811-thresholds',
      createdAt: 1_700_000_000_000,
    });
    const scenario = generateListeningLiveLoadScenario(config);
    const metrics = createListeningLiveLoadMetrics();

    for (let index = 0; index < 2_000; index += 1) {
      metrics.increment('load_client_connected');
      metrics.sample('authority_write_latency_ms', 400);
      metrics.sample('authority_event_delivery_latency_ms', 500);
      metrics.sample('student_drift_ms', 250);
      metrics.sample('reconnect_hydration_ms', 2_000);
      metrics.sample('source_handoff_gap_ms', 125);
      metrics.sample('headphone_transition_latency_ms', 1_000);
    }
    metrics.setQuotaUtilization('firebase-rtdb-connections', 0.42);
    metrics.setQuotaUtilization('worker-delivery-requests', 0.51);

    const passingSummary = summarizeListeningLiveLoadMetrics(metrics);
    const passing = evaluateListeningLiveLoadThresholds({
      config,
      scenario,
      summary: passingSummary,
    });
    expect(passing.status).toBe('passed');
    expect(passing.stopReasons).toEqual([]);

    metrics.increment('source_refresh_failure_total');
    for (let index = 0; index < 120; index += 1) {
      metrics.sample('source_handoff_gap_ms', 900);
    }
    metrics.setQuotaUtilization('firebase-rtdb-connections', 0.91);
    const failingSummary = summarizeListeningLiveLoadMetrics(metrics);
    const failing = evaluateListeningLiveLoadThresholds({
      config,
      scenario,
      summary: failingSummary,
      capturedLogText: 'safe sanitized log only',
    });
    expect(failing.status).toBe('failed');
    expect(failing.stopReasons).toEqual(expect.arrayContaining([
      'source_refresh_failure_total_nonzero',
      'source_handoff_gap_p95_above_250_ms',
      'quota_utilization_above_80_percent',
    ]));

    const leaked = evaluateListeningLiveLoadThresholds({
      config,
      scenario,
      summary: failingSummary,
      capturedLogText: 'https://example.test/audio.mp3?X-Amz-Signature=secret',
    });
    expect(leaked.stopReasons).toContain('forbidden_secret_or_media_leakage');

    const report = buildListeningLiveLoadReport({
      config,
      scenario,
      summary: failingSummary,
      evaluation: failing,
    });
    const serialized = serializeListeningLiveLoadReport(report);

    expect(report).toEqual(expect.objectContaining({
      runId: 'prd0055-task811-thresholds',
      status: 'failed',
      executionMode: 'local-dry-run',
      productionTrafficChanged: false,
      remoteMutationPerformed: false,
    }));
    expect(serialized).toContain('"sessions":20');
    expect(serialized).toContain('"students":2000');
    expect(serialized).not.toContain('X-Amz-Signature');
    expect(serialized).not.toContain('rawAudio');
    expect(serialized).not.toContain('token');
  });
});

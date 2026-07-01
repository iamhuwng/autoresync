import { describe, expect, it } from 'vitest';

import {
  LISTENING_ASSET_METRIC_REVIEW_RUNBOOK,
  LISTENING_ASSET_METRIC_SINK,
  LISTENING_ASSET_METRIC_THRESHOLDS,
  LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK,
  createListeningAssetCommitFailureMetric,
  createListeningOrphanGrowthMetric,
  createListeningTask6LifecycleMetric,
  getListeningKnownUntrackedPermanentAudioRiskStatus,
  summarizeListeningAssetBaseline,
} from './listeningAssetMetrics';

describe('Listening asset lifecycle metrics', () => {
  it('names the secured PRD-0058 metric sink and required event schema', () => {
    const event = createListeningOrphanGrowthMetric({
      metricEventId: 'metric-1',
      createdAt: 1_700_000_000_000,
      ownerScope: 'teacher-1',
      runId: 'task-4.15-local-baseline',
      newUntrackedDraftAudioCount: 1,
      newUntrackedDraftAudioBytes: 4_096,
      knownUntrackedPermanentAudioCount: 2,
      knownUntrackedPermanentAudioBytes: 8_192,
    });

    expect(LISTENING_ASSET_METRIC_SINK).toBe('media_asset_metrics/{metricEventId}');
    expect(event).toEqual({
      schemaVersion: 1,
      metricEventId: 'metric-1',
      createdAt: 1_700_000_000_000,
      ownerScope: 'teacher-1',
      assetId: 'aggregate',
      operation: 'orphan-growth',
      outcome: 'threshold-exceeded',
      reasonCode: 'new_untracked_draft_audio',
      stateBefore: 'unknown',
      stateAfter: 'reported',
      sizeBytes: 4_096,
      durationMs: 0,
      attemptCount: 1,
      runId: 'task-4.15-local-baseline',
      budgetName: 'new-untracked-draft-audio-count',
      budgetValue: 0,
      thresholdName: 'new-untracked-draft-audio-count',
      thresholdValue: 0,
      stopAction: 'stop Task 5.21 storage-write rollout before cohort expansion; keep Task 9.9 final rollout stopped until unexplained growth is resolved',
    });
    expect(Object.keys(event).join(' ')).not.toMatch(/signedUrl|rawKey|rawAudio|audioContent|token|secret/i);
  });

  it('stores commit-failure events with the Task 5.21 and Task 9.9 stop action', () => {
    expect(createListeningAssetCommitFailureMetric({
      metricEventId: 'metric-commit-1',
      createdAt: 1_700_000_060_000,
      ownerScope: 'teacher-1',
      assetId: 'asset-1',
      reasonCode: 'durable_verification_failed',
      stateBefore: 'committing',
      stateAfter: 'committing',
      sizeBytes: 65_536,
      durationMs: 1200,
      attemptCount: 2,
      runId: 'task-4.15-commit-fixture',
    })).toMatchObject({
      operation: 'commit-failure',
      outcome: 'threshold-exceeded',
      thresholdName: 'commit-failure-count',
      thresholdValue: 0,
      stopAction: 'disable new registry writes for Task 5.21; stop Task 9.9 rollout on any unresolved commit failure that risks data loss or legacy incompatibility',
    });
  });

  it('summarizes deterministic local baseline counts and bytes without remote inventory', () => {
    expect(summarizeListeningAssetBaseline([
      { kind: 'tracked-registry-audio', sizeBytes: 10 },
      { kind: 'known-untracked-permanent-audio', sizeBytes: 20 },
      { kind: 'known-untracked-permanent-audio', sizeBytes: 30 },
    ])).toEqual({
      trackedRegistryAudioCount: 1,
      trackedRegistryAudioBytes: 10,
      knownUntrackedPermanentAudioCount: 2,
      knownUntrackedPermanentAudioBytes: 50,
      newUntrackedDraftAudioCount: 0,
      newUntrackedDraftAudioBytes: 0,
    });
  });

  it('records product-owner accepted-risk text for known untracked permanent audio', () => {
    expect(getListeningKnownUntrackedPermanentAudioRiskStatus()).toEqual({
      status: 'accepted',
      acceptedRiskStatement: LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.statement,
      acceptedAt: '2026-06-27',
      evidenceLocation: 'Codex thread user message, PRD-0055 Task 4.15 accepted-risk approval',
      defaultAcceptableNewUntrackedDraftAudioCount: 0,
    });
    expect(LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.statement).toContain(
      'known untracked permanent audio: 2 objects / 50 bytes',
    );
    expect(LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.statement).toContain(
      'does not permit any new untracked draft audio',
    );
  });

  it('declares human dashboard review, owner, cadence, evidence, and stop-runbook thresholds', () => {
    expect(LISTENING_ASSET_METRIC_REVIEW_RUNBOOK).toEqual({
      detectionMode: 'human-dashboard-review',
      responsibleRole: 'Frontend Platform / IELTS Assessment storage owner',
      cadence: 'daily during internal and selected-teacher rollout; before each cohort expansion',
      evidenceLocation: 'media_asset_metrics/{metricEventId} plus Task 4.15/5.21 findings evidence',
      escalationRunbook: [
        'commit-failure-count: disable new registry writes and block Task 5.21 cohort expansion',
        'new-untracked-draft-audio-count: stop Task 5.21 storage-write rollout and investigate unexplained growth',
        'new-untracked-draft-audio-bytes: stop Task 9.9 final rollout until growth is classified',
      ],
    });
    expect(LISTENING_ASSET_METRIC_THRESHOLDS.newUntrackedDraftAudioCount.thresholdValue).toBe(0);
    expect(LISTENING_ASSET_METRIC_THRESHOLDS.commitFailureCount.owner).toBe('Frontend Platform / IELTS Assessment storage owner');
  });

  it('extends Task 6 metrics without removing Task 4 orphan metrics', () => {
    const operations = [
      'temp-age',
      'reconciliation',
      'delete-failure',
      'issuance-failure',
      'refresh-failure',
      'reclaimed-bytes',
      'auth-denial',
      'assets-blocked-by-references',
      'result-playback-failure',
    ] as const;

    expect(operations.map((operation) =>
      createListeningTask6LifecycleMetric({
        metricEventId: `metric-${operation}`,
        createdAt: 1_700_000_120_000,
        ownerScope: 'teacher-1',
        assetId: operation === 'reconciliation' ? 'aggregate' : 'asset-1',
        operation,
        observedValue: operation === 'reclaimed-bytes' ? 2048 : 0,
        reasonCode: `${operation}-observed`,
        stateBefore: 'observed',
        stateAfter: 'reported',
        sizeBytes: operation === 'reclaimed-bytes' ? 2048 : 0,
        durationMs: 25,
        attemptCount: 1,
        runId: 'task-6.10-local-metrics',
      }).operation,
    )).toEqual(operations);

    expect(createListeningTask6LifecycleMetric({
      metricEventId: 'metric-refresh-failure',
      createdAt: 1_700_000_120_000,
      ownerScope: 'teacher-1',
      assetId: 'asset-1',
      operation: 'refresh-failure',
      observedValue: 1,
      reasonCode: 'refresh_failed',
      stateBefore: 'authorized',
      stateAfter: 'public-fallback-required',
      sizeBytes: 0,
      durationMs: 50,
      attemptCount: 1,
      runId: 'task-6.10-local-metrics',
    })).toMatchObject({
      operation: 'refresh-failure',
      outcome: 'threshold-exceeded',
      thresholdName: 'issuance-refresh-failure-count',
      thresholdValue: 0,
      stopAction: 'keep public delivery, block private cutover, and investigate authorized delivery issuance/refresh',
    });

    expect(createListeningOrphanGrowthMetric({
      metricEventId: 'metric-orphan-still-supported',
      createdAt: 1_700_000_120_000,
      ownerScope: 'teacher-1',
      runId: 'task-6.10-preserve-task-4-orphan-metrics',
      newUntrackedDraftAudioCount: 0,
      newUntrackedDraftAudioBytes: 0,
      knownUntrackedPermanentAudioCount: 2,
      knownUntrackedPermanentAudioBytes: 50,
    })).toMatchObject({
      operation: 'orphan-growth',
      outcome: 'within-threshold',
    });
  });

  it('maps each Task 6 metric to its threshold and rollout stop action', () => {
    const cases = [
      {
        operation: 'temp-age' as const,
        observedValue: 24 * 60 * 60 * 1000 + 1,
        thresholdName: 'temp-object-age-ms',
        stopAction: 'abort reconciliation rollout, preserve checkpoint, and inspect stale temp ownership before cleanup',
      },
      {
        operation: 'reconciliation' as const,
        observedValue: 1,
        thresholdName: 'reconciliation-failure-count',
        stopAction: 'abort reconciliation rollout, preserve checkpoint, and inspect report before continuing',
      },
      {
        operation: 'delete-failure' as const,
        observedValue: 1,
        thresholdName: 'delete-failure-count',
        stopAction: 'stop cleanup, preserve objects, and investigate delete failure before any cleanup execution',
      },
      {
        operation: 'issuance-failure' as const,
        observedValue: 1,
        thresholdName: 'issuance-refresh-failure-count',
        stopAction: 'keep public delivery, block private cutover, and investigate authorized delivery issuance/refresh',
      },
      {
        operation: 'refresh-failure' as const,
        observedValue: 1,
        thresholdName: 'issuance-refresh-failure-count',
        stopAction: 'keep public delivery, block private cutover, and investigate authorized delivery issuance/refresh',
      },
      {
        operation: 'reclaimed-bytes' as const,
        observedValue: 2048,
        thresholdName: 'reclaimed-bytes-observed',
        stopAction: 'report reclaimed bytes only; deletion remains disabled unless separately authorized',
      },
      {
        operation: 'auth-denial' as const,
        observedValue: 1,
        thresholdName: 'auth-denial-count',
        stopAction: 'stop rollout immediately on unexpected auth denial pattern or any cross-owner access',
      },
      {
        operation: 'assets-blocked-by-references' as const,
        observedValue: 1,
        thresholdName: 'assets-blocked-by-references-count',
        stopAction: 'stop durable cleanup and inspect reference indexes before deletion planning continues',
      },
      {
        operation: 'result-playback-failure' as const,
        observedValue: 1,
        thresholdName: 'result-playback-failure-count',
        stopAction: 'return result review to public R2 and block private result-review rollout',
      },
    ];

    expect(cases.map((item) => createListeningTask6LifecycleMetric({
      metricEventId: `metric-${item.operation}`,
      createdAt: 1_700_000_180_000,
      ownerScope: 'teacher-1',
      assetId: 'asset-1',
      operation: item.operation,
      observedValue: item.observedValue,
      reasonCode: `${item.operation}-observed`,
      stateBefore: 'observed',
      stateAfter: 'reported',
      sizeBytes: item.operation === 'reclaimed-bytes' ? item.observedValue : 0,
      durationMs: 25,
      attemptCount: 1,
      runId: 'task-6.10-threshold-table',
    }))).toEqual(cases.map((item) => expect.objectContaining({
      operation: item.operation,
      thresholdName: item.thresholdName,
      stopAction: item.stopAction,
      outcome: item.operation === 'reclaimed-bytes' ? 'within-threshold' : 'threshold-exceeded',
    })));
  });
});

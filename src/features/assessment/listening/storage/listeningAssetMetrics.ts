export const LISTENING_ASSET_METRIC_SINK = 'media_asset_metrics/{metricEventId}' as const;

type ListeningAssetTask6LifecycleMetricOperation =
  | 'temp-age'
  | 'reconciliation'
  | 'delete-failure'
  | 'issuance-failure'
  | 'refresh-failure'
  | 'reclaimed-bytes'
  | 'auth-denial'
  | 'assets-blocked-by-references'
  | 'result-playback-failure';
type ListeningAssetMetricOperation =
  | 'orphan-growth'
  | 'commit-failure'
  | ListeningAssetTask6LifecycleMetricOperation;
type ListeningAssetMetricOutcome = 'within-threshold' | 'threshold-exceeded';

export interface ListeningAssetMetricEvent {
  readonly schemaVersion: 1;
  readonly metricEventId: string;
  readonly createdAt: number;
  readonly ownerScope: string;
  readonly assetId: string;
  readonly operation: ListeningAssetMetricOperation;
  readonly outcome: ListeningAssetMetricOutcome;
  readonly reasonCode: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly attemptCount: number;
  readonly runId: string;
  readonly budgetName: string;
  readonly budgetValue: number;
  readonly thresholdName: string;
  readonly thresholdValue: number;
  readonly stopAction: string;
}

export const LISTENING_ASSET_METRIC_THRESHOLDS = {
  commitFailureCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'commit-failure-count',
    thresholdValue: 0,
    stopAction: 'disable new registry writes for Task 5.21; stop Task 9.9 rollout on any unresolved commit failure that risks data loss or legacy incompatibility',
  },
  newUntrackedDraftAudioCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'new-untracked-draft-audio-count',
    thresholdValue: 0,
    stopAction: 'stop Task 5.21 storage-write rollout before cohort expansion; keep Task 9.9 final rollout stopped until unexplained growth is resolved',
  },
  newUntrackedDraftAudioBytes: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'new-untracked-draft-audio-bytes',
    thresholdValue: 0,
    stopAction: 'stop Task 9.9 final rollout until growth is classified',
  },
  tempAgeMs: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'temp-object-age-ms',
    thresholdValue: 24 * 60 * 60 * 1000,
    stopAction: 'abort reconciliation rollout, preserve checkpoint, and inspect stale temp ownership before cleanup',
  },
  reconciliationFailureCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'reconciliation-failure-count',
    thresholdValue: 0,
    stopAction: 'abort reconciliation rollout, preserve checkpoint, and inspect report before continuing',
  },
  deleteFailureCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'delete-failure-count',
    thresholdValue: 0,
    stopAction: 'stop cleanup, preserve objects, and investigate delete failure before any cleanup execution',
  },
  issuanceRefreshFailureCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'issuance-refresh-failure-count',
    thresholdValue: 0,
    stopAction: 'keep public delivery, block private cutover, and investigate authorized delivery issuance/refresh',
  },
  reclaimedBytes: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'reclaimed-bytes-observed',
    thresholdValue: 0,
    stopAction: 'report reclaimed bytes only; deletion remains disabled unless separately authorized',
  },
  authDenialCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'auth-denial-count',
    thresholdValue: 0,
    stopAction: 'stop rollout immediately on unexpected auth denial pattern or any cross-owner access',
  },
  blockedByReferencesCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'assets-blocked-by-references-count',
    thresholdValue: 0,
    stopAction: 'stop durable cleanup and inspect reference indexes before deletion planning continues',
  },
  resultPlaybackFailureCount: {
    owner: 'Frontend Platform / IELTS Assessment storage owner',
    thresholdName: 'result-playback-failure-count',
    thresholdValue: 0,
    stopAction: 'return result review to public R2 and block private result-review rollout',
  },
} as const;

export const LISTENING_ASSET_METRIC_REVIEW_RUNBOOK = {
  detectionMode: 'human-dashboard-review',
  responsibleRole: 'Frontend Platform / IELTS Assessment storage owner',
  cadence: 'daily during internal and selected-teacher rollout; before each cohort expansion',
  evidenceLocation: 'media_asset_metrics/{metricEventId} plus Task 4.15/5.21 findings evidence',
  escalationRunbook: [
    'commit-failure-count: disable new registry writes and block Task 5.21 cohort expansion',
    'new-untracked-draft-audio-count: stop Task 5.21 storage-write rollout and investigate unexplained growth',
    'new-untracked-draft-audio-bytes: stop Task 9.9 final rollout until growth is classified',
  ],
} as const;

export type ListeningAssetBaselineKind =
  | 'tracked-registry-audio'
  | 'known-untracked-permanent-audio';

export interface ListeningAssetBaselineItem {
  readonly kind: ListeningAssetBaselineKind;
  readonly sizeBytes: number;
}

export interface ListeningAssetBaselineSummary {
  readonly trackedRegistryAudioCount: number;
  readonly trackedRegistryAudioBytes: number;
  readonly knownUntrackedPermanentAudioCount: number;
  readonly knownUntrackedPermanentAudioBytes: number;
  readonly newUntrackedDraftAudioCount: 0;
  readonly newUntrackedDraftAudioBytes: 0;
}

export const LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK = {
  statement: [
    'Product-owner accepted risk for PRD-0055 Task 4.15:',
    '',
    'I accept the current known untracked permanent Listening audio baseline as legacy risk only:',
    '- tracked registry audio: 1 object / 10 bytes',
    '- known untracked permanent audio: 2 objects / 50 bytes',
    '- new untracked draft audio: 0 objects / 0 bytes',
    '',
    'This approval does not permit any new untracked draft audio. The default acceptable new untracked-draft-audio count remains zero. Any unexplained orphan growth or commit failure triggers the Task 5.21 and Task 9.9 stop actions recorded in PRD-0058.',
  ].join('\n'),
  acceptedAt: '2026-06-27',
  evidenceLocation: 'Codex thread user message, PRD-0055 Task 4.15 accepted-risk approval',
} as const;

export function summarizeListeningAssetBaseline(
  items: readonly ListeningAssetBaselineItem[],
): ListeningAssetBaselineSummary {
  return items.reduce<ListeningAssetBaselineSummary>((summary, item) => {
    if (item.kind === 'tracked-registry-audio') {
      return {
        ...summary,
        trackedRegistryAudioCount: summary.trackedRegistryAudioCount + 1,
        trackedRegistryAudioBytes: summary.trackedRegistryAudioBytes + item.sizeBytes,
      };
    }
    return {
      ...summary,
      knownUntrackedPermanentAudioCount: summary.knownUntrackedPermanentAudioCount + 1,
      knownUntrackedPermanentAudioBytes: summary.knownUntrackedPermanentAudioBytes + item.sizeBytes,
    };
  }, {
    trackedRegistryAudioCount: 0,
    trackedRegistryAudioBytes: 0,
    knownUntrackedPermanentAudioCount: 0,
    knownUntrackedPermanentAudioBytes: 0,
    newUntrackedDraftAudioCount: 0,
    newUntrackedDraftAudioBytes: 0,
  });
}

export function createListeningOrphanGrowthMetric(input: {
  readonly metricEventId: string;
  readonly createdAt: number;
  readonly ownerScope: string;
  readonly runId: string;
  readonly newUntrackedDraftAudioCount: number;
  readonly newUntrackedDraftAudioBytes: number;
  readonly knownUntrackedPermanentAudioCount: number;
  readonly knownUntrackedPermanentAudioBytes: number;
}): ListeningAssetMetricEvent {
  const threshold = LISTENING_ASSET_METRIC_THRESHOLDS.newUntrackedDraftAudioCount;
  return {
    schemaVersion: 1,
    metricEventId: input.metricEventId,
    createdAt: input.createdAt,
    ownerScope: input.ownerScope,
    assetId: 'aggregate',
    operation: 'orphan-growth',
    outcome: input.newUntrackedDraftAudioCount > threshold.thresholdValue
      ? 'threshold-exceeded'
      : 'within-threshold',
    reasonCode: input.newUntrackedDraftAudioCount > threshold.thresholdValue
      ? 'new_untracked_draft_audio'
      : 'baseline_recorded',
    stateBefore: 'unknown',
    stateAfter: 'reported',
    sizeBytes: input.newUntrackedDraftAudioBytes,
    durationMs: 0,
    attemptCount: 1,
    runId: input.runId,
    budgetName: threshold.thresholdName,
    budgetValue: threshold.thresholdValue,
    thresholdName: threshold.thresholdName,
    thresholdValue: threshold.thresholdValue,
    stopAction: threshold.stopAction,
  };
}

export function createListeningAssetCommitFailureMetric(input: {
  readonly metricEventId: string;
  readonly createdAt: number;
  readonly ownerScope: string;
  readonly assetId: string;
  readonly reasonCode: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly attemptCount: number;
  readonly runId: string;
}): ListeningAssetMetricEvent {
  const threshold = LISTENING_ASSET_METRIC_THRESHOLDS.commitFailureCount;
  return {
    schemaVersion: 1,
    metricEventId: input.metricEventId,
    createdAt: input.createdAt,
    ownerScope: input.ownerScope,
    assetId: input.assetId,
    operation: 'commit-failure',
    outcome: 'threshold-exceeded',
    reasonCode: input.reasonCode,
    stateBefore: input.stateBefore,
    stateAfter: input.stateAfter,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs,
    attemptCount: input.attemptCount,
    runId: input.runId,
    budgetName: threshold.thresholdName,
    budgetValue: threshold.thresholdValue,
    thresholdName: threshold.thresholdName,
    thresholdValue: threshold.thresholdValue,
    stopAction: threshold.stopAction,
  };
}

const task6MetricThreshold = (
  operation: ListeningAssetTask6LifecycleMetricOperation,
): typeof LISTENING_ASSET_METRIC_THRESHOLDS[keyof typeof LISTENING_ASSET_METRIC_THRESHOLDS] => {
  switch (operation) {
    case 'temp-age':
      return LISTENING_ASSET_METRIC_THRESHOLDS.tempAgeMs;
    case 'reconciliation':
      return LISTENING_ASSET_METRIC_THRESHOLDS.reconciliationFailureCount;
    case 'delete-failure':
      return LISTENING_ASSET_METRIC_THRESHOLDS.deleteFailureCount;
    case 'issuance-failure':
    case 'refresh-failure':
      return LISTENING_ASSET_METRIC_THRESHOLDS.issuanceRefreshFailureCount;
    case 'reclaimed-bytes':
      return LISTENING_ASSET_METRIC_THRESHOLDS.reclaimedBytes;
    case 'auth-denial':
      return LISTENING_ASSET_METRIC_THRESHOLDS.authDenialCount;
    case 'assets-blocked-by-references':
      return LISTENING_ASSET_METRIC_THRESHOLDS.blockedByReferencesCount;
    case 'result-playback-failure':
      return LISTENING_ASSET_METRIC_THRESHOLDS.resultPlaybackFailureCount;
  }
};

export function createListeningTask6LifecycleMetric(input: {
  readonly metricEventId: string;
  readonly createdAt: number;
  readonly ownerScope: string;
  readonly assetId: string;
  readonly operation: ListeningAssetTask6LifecycleMetricOperation;
  readonly observedValue: number;
  readonly reasonCode: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly attemptCount: number;
  readonly runId: string;
}): ListeningAssetMetricEvent {
  const threshold = task6MetricThreshold(input.operation);
  const exceeded = input.operation === 'reclaimed-bytes'
    ? false
    : input.observedValue > threshold.thresholdValue;
  return {
    schemaVersion: 1,
    metricEventId: input.metricEventId,
    createdAt: input.createdAt,
    ownerScope: input.ownerScope,
    assetId: input.assetId,
    operation: input.operation,
    outcome: exceeded ? 'threshold-exceeded' : 'within-threshold',
    reasonCode: input.reasonCode,
    stateBefore: input.stateBefore,
    stateAfter: input.stateAfter,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs,
    attemptCount: input.attemptCount,
    runId: input.runId,
    budgetName: threshold.thresholdName,
    budgetValue: threshold.thresholdValue,
    thresholdName: threshold.thresholdName,
    thresholdValue: threshold.thresholdValue,
    stopAction: threshold.stopAction,
  };
}

export function getListeningKnownUntrackedPermanentAudioRiskStatus(): {
  readonly status: 'accepted';
  readonly acceptedRiskStatement: string;
  readonly acceptedAt: typeof LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.acceptedAt;
  readonly evidenceLocation: typeof LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.evidenceLocation;
  readonly defaultAcceptableNewUntrackedDraftAudioCount: 0;
} {
  return {
    status: 'accepted',
    acceptedRiskStatement: LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.statement,
    acceptedAt: LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.acceptedAt,
    evidenceLocation: LISTENING_KNOWN_UNTRACKED_PERMANENT_AUDIO_ACCEPTED_RISK.evidenceLocation,
    defaultAcceptableNewUntrackedDraftAudioCount: 0,
  };
}

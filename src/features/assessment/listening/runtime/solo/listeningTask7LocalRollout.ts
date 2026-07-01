export interface ListeningTask7LocalRolloutProofRow {
  readonly requirement: string;
  readonly status: 'passed' | 'failed' | 'blocked' | string;
  readonly evidence: string;
}

export interface ListeningTask7LocalRolloutInput {
  readonly rolloutId: string;
  readonly observedAt: number;
  readonly internalFixtureRows: readonly ListeningTask7LocalRolloutProofRow[];
  readonly selectedTraffic: {
    readonly claimed: boolean;
    readonly authorized: boolean;
    readonly rows: readonly ListeningTask7LocalRolloutProofRow[];
  };
  readonly percentageRollout: {
    readonly claimed: boolean;
    readonly healthyPlaybackResumeMetrics: boolean;
  };
  readonly stopSignals: Partial<Record<ListeningTask7StopSignal, boolean>>;
  readonly boundaries: ListeningTask7ProtectedBoundaries;
}

export interface ListeningTask7ProtectedBoundaries {
  readonly liveTrafficSwitchedPrivate: boolean;
  readonly audioPlayerSourceChanged: boolean;
  readonly audioCommandWritten: boolean;
  readonly masterAudioStateWritten: boolean;
  readonly readingV2RuntimeTouched: boolean;
  readonly task8Started: boolean;
  readonly deployPerformed: boolean;
  readonly remoteMutationPerformed: boolean;
  readonly cleanupOrObjectDeletionPerformed: boolean;
}

export type ListeningTask7StopSignal =
  | 'reloadRegression'
  | 'seekRegression'
  | 'refreshRegression'
  | 'resumeRegression'
  | 'mobileRegression'
  | 'legacyPlaybackRegression';

export interface ListeningTask7LocalRolloutEvaluation {
  readonly rolloutId: string;
  readonly observedAt: number;
  readonly status: 'passed' | 'blocked';
  readonly internalFixtureTraffic: 'passed' | 'missing-or-failed';
  readonly selectedTraffic: 'not-run-not-authorized' | 'claimed-without-authorization' | 'authorized-proof-passed' | 'missing-or-failed';
  readonly percentageRollout: 'not-run-metrics-required' | 'healthy-metrics-present' | 'claimed-without-healthy-metrics';
  readonly liveTraffic: 'public-preserved' | 'private-switched';
  readonly audioPlayerBoundary: 'source-untouched' | 'source-changed';
  readonly stopReasons: readonly string[];
}

const requiredInternalFixtureEvidence = [
  { phrase: 'legacy public playback', slug: 'legacy_public_playback' },
  { phrase: 'new asset-ID private solo delivery', slug: 'new_asset_id_private_solo_delivery' },
  { phrase: 'resume', slug: 'resume' },
  { phrase: 'reload', slug: 'reload' },
  { phrase: 'seek', slug: 'seek' },
  { phrase: 'URL refresh delegation', slug: 'url_refresh_delegation' },
  { phrase: 'time-up submit', slug: 'time_up_submit' },
  { phrase: 'mobile state', slug: 'mobile_state' },
  { phrase: 'accessibility/touch targets', slug: 'accessibility_touch_targets' },
] as const;

const requiredSelectedTrafficEvidence = [
  { phrase: 'selected student solo playback', slug: 'selected_student_solo_playback' },
  { phrase: 'selected homework playback', slug: 'selected_homework_playback' },
] as const;

const stopSignalReasons: Record<ListeningTask7StopSignal, string> = {
  reloadRegression: 'reload_regression',
  seekRegression: 'seek_regression',
  refreshRegression: 'refresh_regression',
  resumeRegression: 'resume_regression',
  mobileRegression: 'mobile_regression',
  legacyPlaybackRegression: 'legacy_playback_regression',
};

const boundaryReasons: Record<keyof ListeningTask7ProtectedBoundaries, string> = {
  liveTrafficSwitchedPrivate: 'live_traffic_switched_private',
  audioPlayerSourceChanged: 'audio_player_source_changed',
  audioCommandWritten: 'audio_command_written',
  masterAudioStateWritten: 'master_audio_state_written',
  readingV2RuntimeTouched: 'reading_v2_runtime_touched',
  task8Started: 'task8_started',
  deployPerformed: 'deploy_performed',
  remoteMutationPerformed: 'remote_mutation_performed',
  cleanupOrObjectDeletionPerformed: 'cleanup_or_object_deletion_performed',
};

const normalizeRequirement = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const hasPassedRequirement = (
  rows: readonly ListeningTask7LocalRolloutProofRow[],
  phrase: string,
): boolean => {
  const normalizedPhrase = normalizeRequirement(phrase);
  return rows.some((row) =>
    row.status === 'passed'
    && normalizeRequirement(row.requirement).includes(normalizedPhrase),
  );
};

export function evaluateListeningTask7LocalSoloRollout(
  input: ListeningTask7LocalRolloutInput,
): ListeningTask7LocalRolloutEvaluation {
  const stopReasons: string[] = [];

  const missingInternal = requiredInternalFixtureEvidence.filter((requirement) =>
    !hasPassedRequirement(input.internalFixtureRows, requirement.phrase),
  );
  for (const requirement of missingInternal) {
    stopReasons.push(`internal_fixture_missing_${requirement.slug}`);
  }

  let selectedTraffic: ListeningTask7LocalRolloutEvaluation['selectedTraffic'] = 'not-run-not-authorized';
  if (input.selectedTraffic.claimed) {
    if (!input.selectedTraffic.authorized) {
      selectedTraffic = 'claimed-without-authorization';
      stopReasons.push('selected_traffic_claimed_without_authorization');
    } else {
      const missingSelected = requiredSelectedTrafficEvidence.filter((requirement) =>
        !hasPassedRequirement(input.selectedTraffic.rows, requirement.phrase),
      );
      if (missingSelected.length > 0) {
        selectedTraffic = 'missing-or-failed';
        for (const requirement of missingSelected) {
          stopReasons.push(`selected_traffic_missing_${requirement.slug}`);
        }
      } else {
        selectedTraffic = 'authorized-proof-passed';
      }
    }
  }

  let percentageRollout: ListeningTask7LocalRolloutEvaluation['percentageRollout'] = 'not-run-metrics-required';
  if (input.percentageRollout.claimed) {
    if (input.percentageRollout.healthyPlaybackResumeMetrics) {
      percentageRollout = 'healthy-metrics-present';
    } else {
      percentageRollout = 'claimed-without-healthy-metrics';
      stopReasons.push('percentage_rollout_claimed_without_healthy_metrics');
    }
  }

  for (const [signal, reason] of Object.entries(stopSignalReasons) as Array<[ListeningTask7StopSignal, string]>) {
    if (input.stopSignals[signal]) {
      stopReasons.push(reason);
    }
  }

  for (const [boundary, reason] of Object.entries(boundaryReasons) as Array<[keyof ListeningTask7ProtectedBoundaries, string]>) {
    if (input.boundaries[boundary]) {
      stopReasons.push(reason);
    }
  }

  return {
    rolloutId: input.rolloutId,
    observedAt: input.observedAt,
    status: stopReasons.length === 0 ? 'passed' : 'blocked',
    internalFixtureTraffic: missingInternal.length === 0 ? 'passed' : 'missing-or-failed',
    selectedTraffic,
    percentageRollout,
    liveTraffic: input.boundaries.liveTrafficSwitchedPrivate ? 'private-switched' : 'public-preserved',
    audioPlayerBoundary: input.boundaries.audioPlayerSourceChanged ? 'source-changed' : 'source-untouched',
    stopReasons,
  };
}

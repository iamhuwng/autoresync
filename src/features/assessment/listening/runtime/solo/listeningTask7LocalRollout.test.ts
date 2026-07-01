import { describe, expect, it } from 'vitest';

import {
  evaluateListeningTask7LocalSoloRollout,
  type ListeningTask7LocalRolloutProofRow,
} from './listeningTask7LocalRollout';

const now = 1_700_000_000_000;

const internalFixtureRows: ListeningTask7LocalRolloutProofRow[] = [
  { requirement: 'legacy public playback', status: 'passed', evidence: 'batch-d browser report legacy-public-playback' },
  { requirement: 'new asset-ID private solo delivery', status: 'passed', evidence: 'batch-d authorized solo delivery proof' },
  { requirement: 'resume', status: 'passed', evidence: 'batch-d resume checkpoint proof' },
  { requirement: 'reload', status: 'passed', evidence: 'batch-d reload/resume proof' },
  { requirement: 'seek', status: 'passed', evidence: 'batch-d byte-range seek proof' },
  { requirement: 'URL refresh delegation', status: 'passed', evidence: 'batch-d refresh delegation proof' },
  { requirement: 'time-up submit', status: 'passed', evidence: 'batch-c time-up one-submit proof' },
  { requirement: 'mobile state', status: 'passed', evidence: 'batch-b/c mobile state proof' },
  { requirement: 'accessibility/touch targets', status: 'passed', evidence: 'batch-c a11y touch proof' },
];

const selectedTrafficRows: ListeningTask7LocalRolloutProofRow[] = [
  { requirement: 'selected student solo playback', status: 'passed', evidence: 'authorized selected-student fixture' },
  { requirement: 'selected homework playback', status: 'passed', evidence: 'authorized selected-homework fixture' },
];

const cleanBoundaries = {
  liveTrafficSwitchedPrivate: false,
  audioPlayerSourceChanged: false,
  audioCommandWritten: false,
  masterAudioStateWritten: false,
  readingV2RuntimeTouched: false,
  task8Started: false,
  deployPerformed: false,
  remoteMutationPerformed: false,
  cleanupOrObjectDeletionPerformed: false,
};

describe('PRD-0055 Task 7 local solo rollout evaluator', () => {
  it('accepts internal-fixture rollout while leaving selected and percentage traffic unclaimed', () => {
    const result = evaluateListeningTask7LocalSoloRollout({
      rolloutId: 'task-7.13-local-solo-rollout',
      observedAt: now,
      internalFixtureRows,
      selectedTraffic: {
        claimed: false,
        authorized: false,
        rows: [],
      },
      percentageRollout: {
        claimed: false,
        healthyPlaybackResumeMetrics: false,
      },
      stopSignals: {},
      boundaries: cleanBoundaries,
    });

    expect(result).toMatchObject({
      status: 'passed',
      internalFixtureTraffic: 'passed',
      selectedTraffic: 'not-run-not-authorized',
      percentageRollout: 'not-run-metrics-required',
      liveTraffic: 'public-preserved',
      audioPlayerBoundary: 'source-untouched',
    });
    expect(result.stopReasons).toEqual([]);
  });

  it('blocks on missing proof, unauthorized selected traffic, missing metrics, regressions, or protected drift', () => {
    const result = evaluateListeningTask7LocalSoloRollout({
      rolloutId: 'task-7.13-local-solo-rollout',
      observedAt: now,
      internalFixtureRows: internalFixtureRows.filter((row) => row.requirement !== 'URL refresh delegation'),
      selectedTraffic: {
        claimed: true,
        authorized: false,
        rows: [],
      },
      percentageRollout: {
        claimed: true,
        healthyPlaybackResumeMetrics: false,
      },
      stopSignals: {
        reloadRegression: true,
        legacyPlaybackRegression: true,
      },
      boundaries: {
        ...cleanBoundaries,
        liveTrafficSwitchedPrivate: true,
        audioPlayerSourceChanged: true,
        remoteMutationPerformed: true,
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.stopReasons).toEqual(expect.arrayContaining([
      'internal_fixture_missing_url_refresh_delegation',
      'selected_traffic_claimed_without_authorization',
      'percentage_rollout_claimed_without_healthy_metrics',
      'reload_regression',
      'legacy_playback_regression',
      'live_traffic_switched_private',
      'audio_player_source_changed',
      'remote_mutation_performed',
    ]));
  });

  it('allows authorized selected traffic and percentage rollout only with clean proof and healthy metrics', () => {
    const result = evaluateListeningTask7LocalSoloRollout({
      rolloutId: 'task-7.13-selected-rollout',
      observedAt: now,
      internalFixtureRows,
      selectedTraffic: {
        claimed: true,
        authorized: true,
        rows: selectedTrafficRows,
      },
      percentageRollout: {
        claimed: true,
        healthyPlaybackResumeMetrics: true,
      },
      stopSignals: {},
      boundaries: cleanBoundaries,
    });

    expect(result.status).toBe('passed');
    expect(result.selectedTraffic).toBe('authorized-proof-passed');
    expect(result.percentageRollout).toBe('healthy-metrics-present');
    expect(result.stopReasons).toEqual([]);
  });
});

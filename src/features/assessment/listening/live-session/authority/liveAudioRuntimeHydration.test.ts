import { describe, expect, it } from 'vitest';

import type { MasterAudioStateV2 } from './masterAudioState.types';
import {
  resolveLiveAudioHydration,
  shouldAcceptCanonicalAudioState,
} from './liveAudioRuntimeHydration';

const baseState: MasterAudioStateV2 = {
  schemaVersion: 2,
  revision: 8,
  section: 2,
  position: 45,
  isPlaying: true,
  speed: 1.25,
  timestamp: 1_700_000_000_000,
  updateKind: 'command',
  lastAction: 'resume',
  lastActionRevision: 8,
  lastActionTimestamp: 1_700_000_000_000,
  actionId: 'resume-8',
  writerUid: 'teacher-1',
  writerClientId: 'teacher-tab-1',
};

describe('live audio runtime hydration', () => {
  it('hydrates late joiners from canonical authority and accounts elapsed trusted time', () => {
    const hydration = resolveLiveAudioHydration({
      masterState: baseState,
      audioSections: [{ number: 1 }, { number: 2 }, { number: 3 }],
      now: baseState.timestamp + 4_000,
      localAudioIndex: 0,
      localPosition: 3,
    });

    expect(hydration).toEqual(expect.objectContaining({
      source: 'canonical',
      sectionNumber: 2,
      audioIndex: 1,
      expectedPosition: 50,
      playbackSpeed: 1.25,
      isPlaying: true,
      shouldSwitchSection: true,
      ignoredLocalAuthority: true,
    }));
  });

  it('uses canonical section and position on reload instead of restoring local playback authority', () => {
    const hydration = resolveLiveAudioHydration({
      masterState: {
        ...baseState,
        revision: 9,
        section: 3,
        position: 12,
        isPlaying: false,
        speed: 1,
        lastAction: 'pause',
        lastActionRevision: 9,
      },
      audioSections: [{ number: 1 }, { number: 2 }, { number: 3 }],
      now: baseState.timestamp + 4_000,
      localAudioIndex: 0,
      localPosition: 120,
    });

    expect(hydration).toEqual(expect.objectContaining({
      sectionNumber: 3,
      audioIndex: 2,
      expectedPosition: 12,
      isPlaying: false,
      shouldSwitchSection: true,
      ignoredLocalAuthority: true,
    }));
  });

  it('accepts only newer canonical revisions once v2 authority is present', () => {
    expect(shouldAcceptCanonicalAudioState({
      currentState: baseState,
      nextState: { ...baseState, revision: 9, actionId: 'seek-9' },
    })).toEqual({ accept: true, reason: 'newer_revision' });

    expect(shouldAcceptCanonicalAudioState({
      currentState: baseState,
      nextState: { ...baseState, revision: 7, actionId: 'stale-7' },
    })).toEqual({ accept: false, reason: 'stale_revision' });

    expect(shouldAcceptCanonicalAudioState({
      currentState: baseState,
      nextState: { ...baseState, revision: 8, actionId: 'conflict-8', position: 99 },
    })).toEqual({ accept: false, reason: 'equal_revision_conflict' });
  });
});

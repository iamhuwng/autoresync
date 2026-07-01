import type { MasterAudioStateV2 } from './masterAudioState.types';
import { calculateExpectedLiveAudioPosition } from './liveAudioSyncPolicy';

export interface LiveAudioHydrationSection {
  number: number;
}

export interface LiveAudioHydrationInput {
  masterState: MasterAudioStateV2;
  audioSections: readonly LiveAudioHydrationSection[];
  now: number;
  localAudioIndex?: number;
  localPosition?: number;
}

export interface LiveAudioHydrationResult {
  source: 'canonical';
  sectionNumber: number;
  audioIndex: number;
  expectedPosition: number;
  playbackSpeed: number;
  isPlaying: boolean;
  shouldSwitchSection: boolean;
  ignoredLocalAuthority: boolean;
  revision: number;
}

export interface CanonicalAcceptInput {
  currentState: Partial<MasterAudioStateV2> | null;
  nextState: Partial<MasterAudioStateV2> | null;
}

export type CanonicalAcceptReason =
  | 'no_state'
  | 'newer_revision'
  | 'duplicate_revision'
  | 'equal_revision_conflict'
  | 'stale_revision'
  | 'newer_timestamp'
  | 'stale_timestamp'
  | 'missing_next_state';

export interface CanonicalAcceptDecision {
  accept: boolean;
  reason: CanonicalAcceptReason;
}

export function resolveLiveAudioHydration({
  masterState,
  audioSections,
  now,
  localAudioIndex,
  localPosition,
}: LiveAudioHydrationInput): LiveAudioHydrationResult | null {
  const audioIndex = audioSections.findIndex((section) => section.number === masterState.section);
  if (audioIndex < 0) {
    return null;
  }

  const expectedPosition = calculateExpectedLiveAudioPosition({
    position: masterState.position,
    speed: masterState.speed,
    isPlaying: masterState.isPlaying,
    timestamp: masterState.timestamp,
    now,
  });

  const shouldSwitchSection = localAudioIndex !== undefined && localAudioIndex !== audioIndex;
  const localPositionDiffers = localPosition !== undefined && Math.abs(localPosition - expectedPosition) > 0.001;

  return {
    source: 'canonical',
    sectionNumber: masterState.section,
    audioIndex,
    expectedPosition,
    playbackSpeed: masterState.speed,
    isPlaying: masterState.isPlaying,
    shouldSwitchSection,
    ignoredLocalAuthority: shouldSwitchSection || localPositionDiffers,
    revision: masterState.revision,
  };
}

export function shouldAcceptCanonicalAudioState({
  currentState,
  nextState,
}: CanonicalAcceptInput): CanonicalAcceptDecision {
  if (!nextState) {
    return { accept: false, reason: 'missing_next_state' };
  }

  if (!currentState) {
    return { accept: true, reason: 'no_state' };
  }

  if (Number.isInteger(currentState.revision) && Number.isInteger(nextState.revision)) {
    if ((nextState.revision ?? -1) > (currentState.revision ?? -1)) {
      return { accept: true, reason: 'newer_revision' };
    }
    if ((nextState.revision ?? -1) < (currentState.revision ?? -1)) {
      return { accept: false, reason: 'stale_revision' };
    }

    return canonicalAuthorityFieldsEqual(currentState, nextState)
      ? { accept: false, reason: 'duplicate_revision' }
      : { accept: false, reason: 'equal_revision_conflict' };
  }

  const currentTimestamp = typeof currentState.timestamp === 'number' ? currentState.timestamp : -1;
  const nextTimestamp = typeof nextState.timestamp === 'number' ? nextState.timestamp : -1;
  return nextTimestamp > currentTimestamp
    ? { accept: true, reason: 'newer_timestamp' }
    : { accept: false, reason: 'stale_timestamp' };
}

function canonicalAuthorityFieldsEqual(
  currentState: Partial<MasterAudioStateV2>,
  nextState: Partial<MasterAudioStateV2>,
): boolean {
  const fields: (keyof MasterAudioStateV2)[] = [
    'schemaVersion',
    'revision',
    'section',
    'position',
    'isPlaying',
    'speed',
    'timestamp',
    'updateKind',
    'lastAction',
    'lastActionRevision',
    'lastActionTimestamp',
    'actionId',
    'writerUid',
    'writerClientId',
  ];

  return fields.every((field) => currentState[field] === nextState[field]);
}

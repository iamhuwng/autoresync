import {
  LIVE_AUDIO_ALLOWED_SPEEDS,
  MASTER_AUDIO_STATE_SCHEMA_VERSION,
  type LiveAudioAction,
  type MasterAudioStateV2,
} from './masterAudioState.types';
import {
  createAudioCommandProjection,
  type AudioCommandV2,
} from './audioCommandCompatibility';
import { validateMasterAudioState } from './masterAudioState.validation';

export interface LiveAudioAuthoritySnapshot {
  section?: number;
  position?: number;
  speed?: number;
  isPlaying?: boolean;
}

export interface LiveAudioAuthorityIntent extends LiveAudioAuthoritySnapshot {
  action: LiveAudioAction;
  actionId?: string;
}

export interface LiveAudioAuthorityContext {
  sessionCode: string;
  previousState: Partial<MasterAudioStateV2> | null | undefined;
  intent: LiveAudioAuthorityIntent;
  teacherUid: string;
  writerClientId: string;
  now: number;
  serverTimestampValue?: unknown;
}

export interface InitialMasterAudioStateInput {
  teacherUid: string;
  writerClientId: string;
  now: number;
  section?: number;
  actionId?: string;
}

export interface LiveAudioAuthorityTransaction {
  state: MasterAudioStateV2;
  command: AudioCommandV2;
  updates: Record<string, unknown>;
}

export function createInitialMasterAudioState({
  teacherUid,
  writerClientId,
  now,
  section = 1,
  actionId = `initialize-1-${now}`,
}: InitialMasterAudioStateInput): MasterAudioStateV2 {
  return {
    schemaVersion: MASTER_AUDIO_STATE_SCHEMA_VERSION,
    revision: 1,
    section,
    position: 0,
    isPlaying: false,
    speed: 1,
    timestamp: now,
    updateKind: 'command',
    lastAction: 'initialize',
    lastActionRevision: 1,
    lastActionTimestamp: now,
    actionId,
    writerUid: teacherUid,
    writerClientId,
  };
}

export function buildLiveAudioAuthorityTransaction({
  sessionCode,
  previousState,
  intent,
  teacherUid,
  writerClientId,
  now,
  serverTimestampValue,
}: LiveAudioAuthorityContext): LiveAudioAuthorityTransaction {
  if (intent.action === 'initialize') {
    throw new Error('initialize does not project an audioCommand');
  }

  const previous = normalizeMasterAudioState(previousState, {
    teacherUid,
    writerClientId,
  });

  if (!previous) {
    throw new Error('Canonical audio authority must be hydrated before command writes');
  }

  const nextRevision = previous.revision + 1;
  const state: MasterAudioStateV2 = {
    schemaVersion: MASTER_AUDIO_STATE_SCHEMA_VERSION,
    revision: nextRevision,
    section: resolveSection(previous, intent),
    position: resolvePosition(previous, intent),
    isPlaying: resolvePlaying(previous, intent),
    speed: resolveSpeed(previous, intent),
    timestamp: now,
    updateKind: 'command',
    lastAction: intent.action,
    lastActionRevision: nextRevision,
    lastActionTimestamp: now,
    actionId: intent.actionId ?? `${intent.action}-${nextRevision}-${now}`,
    writerUid: teacherUid,
    writerClientId,
  };

  validateNextStateOrThrow(state, previous, teacherUid);

  const command = createAudioCommandProjection(state);
  const stateWrite = serverTimestampValue === undefined
    ? state
    : {
        ...state,
        timestamp: serverTimestampValue,
        lastActionTimestamp: serverTimestampValue,
      };

  return {
    state,
    command,
    updates: {
      [`game_sessions/${sessionCode}/masterAudioState`]: stateWrite,
      [`game_sessions/${sessionCode}/audioCommand`]: command,
    },
  };
}

export function normalizeMasterAudioState(
  candidate: Partial<MasterAudioStateV2> | null | undefined,
  context: { teacherUid: string; writerClientId: string },
): MasterAudioStateV2 | null {
  if (!candidate) {
    return null;
  }

  const section = Number(candidate.section);
  const position = Number(candidate.position);
  const speed = Number(candidate.speed);
  const timestamp = Number(candidate.timestamp);
  const lastActionTimestamp = Number(candidate.lastActionTimestamp ?? candidate.timestamp);
  const lastAction = candidate.lastAction;

  if (
    !Number.isInteger(section)
    || !Number.isFinite(position)
    || !Number.isFinite(speed)
    || !Number.isFinite(timestamp)
    || !lastAction
    || typeof candidate.isPlaying !== 'boolean'
  ) {
    return null;
  }

  const revision = Number.isInteger(candidate.revision) ? Number(candidate.revision) : 0;

  return {
    schemaVersion: MASTER_AUDIO_STATE_SCHEMA_VERSION,
    revision,
    section,
    position,
    isPlaying: candidate.isPlaying,
    speed,
    timestamp,
    updateKind: candidate.updateKind === 'heartbeat' ? 'heartbeat' : 'command',
    lastAction,
    lastActionRevision: Number.isInteger(candidate.lastActionRevision)
      ? Number(candidate.lastActionRevision)
      : revision,
    lastActionTimestamp,
    actionId: typeof candidate.actionId === 'string' && candidate.actionId.trim()
      ? candidate.actionId
      : `legacy-${revision}-${lastAction}-${timestamp}`,
    writerUid: typeof candidate.writerUid === 'string' && candidate.writerUid.trim()
      ? candidate.writerUid
      : context.teacherUid,
    writerClientId: typeof candidate.writerClientId === 'string' && candidate.writerClientId.trim()
      ? candidate.writerClientId
      : context.writerClientId,
    actionMetadata: candidate.actionMetadata,
  };
}

export function buildLiveAudioHeartbeatState({
  previousState,
  position,
  now,
  teacherUid,
  writerClientId,
}: {
  previousState: Partial<MasterAudioStateV2> | null | undefined;
  position: number;
  now: number;
  teacherUid: string;
  writerClientId: string;
}): MasterAudioStateV2 {
  const previous = normalizeMasterAudioState(previousState, { teacherUid, writerClientId });
  if (!previous) {
    throw new Error('Canonical audio authority must be hydrated before heartbeat writes');
  }

  const state: MasterAudioStateV2 = {
    ...previous,
    revision: previous.revision + 1,
    position,
    timestamp: now,
    updateKind: 'heartbeat',
  };

  validateNextStateOrThrow(state, previous, teacherUid);
  return state;
}

function resolveSection(
  previous: MasterAudioStateV2,
  intent: LiveAudioAuthorityIntent,
): number {
  if (intent.action === 'section') {
    return requireInteger(intent.section, 'section');
  }
  return intent.section ?? previous.section;
}

function resolvePosition(
  previous: MasterAudioStateV2,
  intent: LiveAudioAuthorityIntent,
): number {
  if (intent.action === 'seek') {
    return requireFinite(intent.position, 'position');
  }
  if (intent.action === 'section') {
    return intent.position ?? 0;
  }
  return intent.position ?? previous.position;
}

function resolvePlaying(
  previous: MasterAudioStateV2,
  intent: LiveAudioAuthorityIntent,
): boolean {
  if (intent.action === 'pause') return false;
  if (intent.action === 'resume' || intent.action === 'play') return true;
  return intent.isPlaying ?? previous.isPlaying;
}

function resolveSpeed(
  previous: MasterAudioStateV2,
  intent: LiveAudioAuthorityIntent,
): number {
  const speed = intent.action === 'speed'
    ? requireFinite(intent.speed, 'speed')
    : intent.speed ?? previous.speed;

  if (!LIVE_AUDIO_ALLOWED_SPEEDS.includes(speed as any)) {
    throw new Error(`Invalid playback speed: ${speed}`);
  }

  return speed;
}

function requireInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`Invalid ${label}`);
  }
  return Number(value);
}

function requireFinite(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return Number(value);
}

function validateNextStateOrThrow(
  state: MasterAudioStateV2,
  previous: MasterAudioStateV2,
  teacherUid: string,
): void {
  const allowedSections = Array.from({ length: Math.max(40, state.section, previous.section) }, (_, index) => index + 1);
  const result = validateMasterAudioState(state, {
    teacherUid,
    authoritySource: 'trusted-server',
    timestampTrust: {
      timestamp: 'trusted-server',
      lastActionTimestamp: 'trusted-server',
    },
    allowedSections,
    previousState: previous,
  });

  if (!result.valid) {
    throw new Error(`Invalid canonical audio authority: ${result.errors.join(', ')}`);
  }
}

import {
  LIVE_AUDIO_ALLOWED_SPEEDS,
  MASTER_AUDIO_STATE_SCHEMA_VERSION,
  type LiveAudioAction,
  type LiveAudioTimestampTrust,
  type MasterAudioStateV2,
  type MasterAudioStateValidationError,
  type MasterAudioStateValidationResult,
} from './masterAudioState.types';

export type { MasterAudioStateV2 };

export interface MasterAudioStateValidationContext {
  teacherUid: string;
  authoritySource: 'trusted-server' | 'browser-client';
  timestampTrust: {
    timestamp: LiveAudioTimestampTrust;
    lastActionTimestamp: LiveAudioTimestampTrust;
  };
  allowedSections: readonly number[];
  previousState?: MasterAudioStateV2 | null;
  sectionDurationsSeconds?: Readonly<Record<number, number>>;
  allowedSpeeds?: readonly number[];
}

const commandActions = new Set<LiveAudioAction>(['initialize', 'play', 'pause', 'resume', 'seek', 'section', 'speed']);

export function validateMasterAudioState(
  candidate: Partial<MasterAudioStateV2>,
  context: MasterAudioStateValidationContext,
): MasterAudioStateValidationResult {
  const errors = new Set<MasterAudioStateValidationError>();

  validateRequiredFields(candidate, errors);
  validateSchemaAndFields(candidate, context, errors);
  validateRevision(candidate, context.previousState, errors);
  validateActionState(candidate, errors);
  validateMetadata(candidate.actionMetadata, errors);

  if (context.authoritySource === 'browser-client') {
    errors.add('browser_client_authority');
  }

  if (context.timestampTrust.timestamp !== 'trusted-server') {
    errors.add('timestamp_not_trusted_server');
  }

  if (context.timestampTrust.lastActionTimestamp !== 'trusted-server') {
    errors.add('last_action_timestamp_not_trusted_server');
  }

  return {
    valid: errors.size === 0,
    authority: context.authoritySource === 'trusted-server' ? 'canonical' : 'non-authoritative',
    errors: Array.from(errors),
  };
}

function validateRequiredFields(
  candidate: Partial<MasterAudioStateV2>,
  errors: Set<MasterAudioStateValidationError>,
): void {
  const requiredFields: (keyof MasterAudioStateV2)[] = [
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

  for (const field of requiredFields) {
    if (candidate[field] === undefined || candidate[field] === null) {
      errors.add('missing_required_field');
    }
  }
}

function validateSchemaAndFields(
  candidate: Partial<MasterAudioStateV2>,
  context: MasterAudioStateValidationContext,
  errors: Set<MasterAudioStateValidationError>,
): void {
  if (candidate.schemaVersion !== MASTER_AUDIO_STATE_SCHEMA_VERSION) {
    errors.add('unknown_schema_version');
  }

  if (!Number.isInteger(candidate.revision) || (candidate.revision ?? -1) < 0) {
    errors.add('invalid_revision');
  }

  if (!Number.isInteger(candidate.section) || !context.allowedSections.includes(candidate.section ?? -1)) {
    errors.add('invalid_section');
  }

  if (!Number.isFinite(candidate.position) || (candidate.position ?? -1) < 0) {
    errors.add('invalid_position');
  }

  const sectionDuration = candidate.section === undefined
    ? undefined
    : context.sectionDurationsSeconds?.[candidate.section];
  if (
    sectionDuration !== undefined
    && Number.isFinite(candidate.position)
    && (candidate.position ?? 0) > sectionDuration
  ) {
    errors.add('position_exceeds_duration');
  }

  const allowedSpeeds = context.allowedSpeeds ?? LIVE_AUDIO_ALLOWED_SPEEDS;
  if (!Number.isFinite(candidate.speed) || !allowedSpeeds.includes(candidate.speed ?? Number.NaN)) {
    errors.add('invalid_speed');
  }

  if (candidate.updateKind !== 'command' && candidate.updateKind !== 'heartbeat') {
    errors.add('invalid_update_kind');
  }

  if (!candidate.lastAction || !commandActions.has(candidate.lastAction)) {
    errors.add('invalid_last_action');
  }

  if ((candidate.lastActionRevision ?? 0) > (candidate.revision ?? -1)) {
    errors.add('last_action_revision_exceeds_revision');
  }

  if (candidate.updateKind === 'command' && candidate.lastActionRevision !== candidate.revision) {
    errors.add('command_action_revision_mismatch');
  }

  if (candidate.updateKind === 'heartbeat' && candidate.lastActionRevision === candidate.revision) {
    errors.add('heartbeat_action_revision_mismatch');
  }

  if (!candidate.actionId) {
    errors.add('missing_action_id');
  }

  if (candidate.writerUid !== context.teacherUid) {
    errors.add('wrong_writer');
  }

  if (!candidate.writerClientId) {
    errors.add('missing_writer_client_id');
  }
}

function validateRevision(
  candidate: Partial<MasterAudioStateV2>,
  previousState: MasterAudioStateV2 | null | undefined,
  errors: Set<MasterAudioStateValidationError>,
): void {
  if (!previousState || !Number.isInteger(candidate.revision)) {
    return;
  }

  if ((candidate.revision ?? 0) < previousState.revision) {
    errors.add('revision_regression');
    return;
  }

  if (candidate.revision === previousState.revision) {
    if (!authorityFieldsEqual(candidate, previousState)) {
      errors.add('equal_revision_conflict');
    }
    return;
  }

  if (candidate.revision !== previousState.revision + 1) {
    errors.add('revision_gap');
  }
}

function authorityFieldsEqual(
  candidate: Partial<MasterAudioStateV2>,
  previousState: MasterAudioStateV2,
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

  return fields.every((field) => candidate[field] === previousState[field]);
}

function validateActionState(
  candidate: Partial<MasterAudioStateV2>,
  errors: Set<MasterAudioStateValidationError>,
): void {
  if ((candidate.lastAction === 'play' || candidate.lastAction === 'resume') && candidate.isPlaying !== true) {
    errors.add(candidate.lastAction === 'play' ? 'play_requires_playing_state' : 'resume_requires_playing_state');
  }

  if (candidate.lastAction === 'pause' && candidate.isPlaying !== false) {
    errors.add('pause_requires_paused_state');
  }
}

function validateMetadata(
  metadata: unknown,
  errors: Set<MasterAudioStateValidationError>,
): void {
  if (!metadata || typeof metadata !== 'object') {
    return;
  }

  const flattened = flattenMetadata(metadata);
  for (const { key, value } of flattened) {
    const lowerKey = key.toLowerCase();
    const lowerValue = String(value).toLowerCase();

    if (lowerKey.includes('signedurl') || lowerValue.includes('x-amz-signature')) {
      errors.add('metadata_contains_signed_url');
    }
    if (lowerKey.includes('rawkey') || lowerKey.includes('objectkey') || lowerValue.includes('assessment-assets/')) {
      errors.add('metadata_contains_raw_key');
    }
    if (lowerKey.includes('token') || lowerKey.includes('secret')) {
      errors.add('metadata_contains_secret');
    }
    if (lowerKey.includes('student') || lowerKey.includes('answer')) {
      errors.add('metadata_contains_student_data');
    }
    if (lowerKey.includes('result')) {
      errors.add('metadata_contains_result_data');
    }
    if (lowerKey.includes('audiocontent') || lowerKey.includes('rawaudio')) {
      errors.add('metadata_contains_audio_content');
    }
  }
}

function flattenMetadata(metadata: object, prefix = ''): { key: string; value: unknown }[] {
  return Object.entries(metadata).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenMetadata(value, path);
    }
    return [{ key: path, value }];
  });
}

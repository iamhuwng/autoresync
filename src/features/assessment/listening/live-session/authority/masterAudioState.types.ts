export const MASTER_AUDIO_STATE_SCHEMA_VERSION = 2 as const;

export const LIVE_AUDIO_ALLOWED_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export type LiveAudioAction =
  | 'initialize'
  | 'play'
  | 'pause'
  | 'resume'
  | 'seek'
  | 'section'
  | 'speed';

export type LiveAudioUpdateKind = 'command' | 'heartbeat';

export type LiveAudioAuthoritySource = 'trusted-server' | 'browser-client';

export type LiveAudioTimestampTrust = 'trusted-server' | 'client' | 'unknown';

export type LiveAudioActionMetadata = Record<string, unknown>;

export interface MasterAudioStateV2 {
  schemaVersion: typeof MASTER_AUDIO_STATE_SCHEMA_VERSION;
  revision: number;
  section: number;
  position: number;
  isPlaying: boolean;
  speed: number;
  timestamp: number;
  updateKind: LiveAudioUpdateKind;
  lastAction: LiveAudioAction;
  lastActionRevision: number;
  lastActionTimestamp: number;
  actionId: string;
  writerUid: string;
  writerClientId: string;
  actionMetadata?: LiveAudioActionMetadata;
}

export type MasterAudioStateValidationError =
  | 'missing_required_field'
  | 'unknown_schema_version'
  | 'invalid_revision'
  | 'revision_regression'
  | 'revision_gap'
  | 'equal_revision_conflict'
  | 'invalid_section'
  | 'invalid_position'
  | 'position_exceeds_duration'
  | 'invalid_speed'
  | 'timestamp_not_trusted_server'
  | 'last_action_timestamp_not_trusted_server'
  | 'invalid_update_kind'
  | 'invalid_last_action'
  | 'last_action_revision_exceeds_revision'
  | 'command_action_revision_mismatch'
  | 'heartbeat_action_revision_mismatch'
  | 'missing_action_id'
  | 'wrong_writer'
  | 'missing_writer_client_id'
  | 'play_requires_playing_state'
  | 'resume_requires_playing_state'
  | 'pause_requires_paused_state'
  | 'browser_client_authority'
  | 'metadata_contains_signed_url'
  | 'metadata_contains_raw_key'
  | 'metadata_contains_secret'
  | 'metadata_contains_student_data'
  | 'metadata_contains_result_data'
  | 'metadata_contains_audio_content';

export interface MasterAudioStateValidationResult {
  valid: boolean;
  authority: 'canonical' | 'non-authoritative';
  errors: MasterAudioStateValidationError[];
}

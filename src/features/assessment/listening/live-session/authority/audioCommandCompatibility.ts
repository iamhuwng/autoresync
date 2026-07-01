import type { LiveAudioAction, MasterAudioStateV2 } from './masterAudioState.types';

export type AudioCommandType =
  | 'pause'
  | 'resume'
  | 'skipToSection'
  | 'seekToPosition'
  | 'setSpeed';

export interface AudioCommandV2 {
  schemaVersion: 2;
  commandId: string;
  canonicalRevision: number;
  type: AudioCommandType;
  sectionNumber: number;
  position: number;
  speed: number;
  isPlaying: boolean;
  timestamp: number;
  writerUid: string;
}

export type AudioCommandCompatibilityInput = AudioCommandV2 | {
  type?: string;
  sectionNumber?: number;
  position?: number;
  speed?: number;
  isPlaying?: boolean;
  timestamp?: number;
  writerUid?: string;
};

export interface AudioCommandDecisionContext {
  acceptedCanonicalRevision: number;
  clientAcceptedV2Canonical: boolean;
}

export interface AudioCommandDecision {
  decision: 'telemetry-only' | 'ignore-stale' | 'request-canonical-reread' | 'ignore-legacy-after-v2' | 'legacy-compatibility';
  applyState: boolean;
  reason: string;
}

export function createAudioCommandProjection(state: MasterAudioStateV2): AudioCommandV2 {
  return {
    schemaVersion: 2,
    commandId: state.actionId,
    canonicalRevision: state.lastActionRevision,
    type: commandTypeForAction(state.lastAction),
    sectionNumber: state.section,
    position: state.position,
    speed: state.speed,
    isPlaying: state.isPlaying,
    timestamp: state.lastActionTimestamp,
    writerUid: state.writerUid,
  };
}

export function validateAudioCommandProjection(
  command: AudioCommandV2,
  state: MasterAudioStateV2,
): { valid: boolean; errors: string[] } {
  const expected = createAudioCommandProjection(state);
  const errors: string[] = [];

  if (command.commandId !== expected.commandId) errors.push('command_id_mismatch');
  if (command.canonicalRevision !== expected.canonicalRevision) errors.push('canonical_revision_mismatch');
  if (command.type !== expected.type) errors.push('type_mismatch');
  if (command.sectionNumber !== expected.sectionNumber) errors.push('section_mismatch');
  if (command.position !== expected.position) errors.push('position_mismatch');
  if (command.speed !== expected.speed) errors.push('speed_mismatch');
  if (command.isPlaying !== expected.isPlaying) errors.push('playing_mismatch');
  if (command.timestamp !== expected.timestamp) errors.push('timestamp_mismatch');
  if (command.writerUid !== expected.writerUid) errors.push('writer_mismatch');

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function evaluateAudioCommandAgainstCanonical(
  command: AudioCommandCompatibilityInput,
  context: AudioCommandDecisionContext,
): AudioCommandDecision {
  if (!isAudioCommandV2(command)) {
    return context.clientAcceptedV2Canonical
      ? {
          decision: 'ignore-legacy-after-v2',
          applyState: false,
          reason: 'legacy_command_cannot_override_v2_canonical',
        }
      : {
          decision: 'legacy-compatibility',
          applyState: true,
          reason: 'legacy_client_before_v2_acceptance',
        };
  }

  if (command.canonicalRevision < context.acceptedCanonicalRevision) {
    return {
      decision: 'ignore-stale',
      applyState: false,
      reason: 'command_revision_older_than_canonical',
    };
  }

  if (command.canonicalRevision > context.acceptedCanonicalRevision) {
    return {
      decision: 'request-canonical-reread',
      applyState: false,
      reason: 'command_revision_newer_than_canonical',
    };
  }

  return {
    decision: 'telemetry-only',
    applyState: false,
    reason: 'new_clients_do_not_mutate_from_audio_command',
  };
}

export function listAudioCommandRetirementCriteria(): string[] {
  return [
    'repository_reader_writer_inventory_complete',
    'deployed_client_inventory_or_approved_compatibility_assumption',
    'zero_direct_writers_outside_authority_writer',
    'zero_new_client_command_state_mutations',
    'focused_stale_duplicate_reordered_missing_conflicting_command_tests',
    'internal_selected_and_percentage_rollout_success',
    'two_full_release_windows_without_required_legacy_fallback',
    'teacher_and_multi_student_browser_reload_late_join_partition_disagreement_proof',
    'product_owner_and_architecture_security_approval',
    'independently_reversible_removal_packet',
  ];
}

function commandTypeForAction(action: LiveAudioAction): AudioCommandType {
  if (action === 'pause') return 'pause';
  if (action === 'seek') return 'seekToPosition';
  if (action === 'section') return 'skipToSection';
  if (action === 'speed') return 'setSpeed';
  if (action === 'play' || action === 'resume') return 'resume';
  throw new Error('initialize_does_not_project_audio_command');
}

function isAudioCommandV2(command: AudioCommandCompatibilityInput): command is AudioCommandV2 {
  return 'schemaVersion' in command && command.schemaVersion === 2 && typeof command.canonicalRevision === 'number';
}

import { describe, expect, it } from 'vitest';

import {
  createAudioCommandProjection,
  evaluateAudioCommandAgainstCanonical,
  listAudioCommandRetirementCriteria,
  validateAudioCommandProjection,
  type AudioCommandV2,
} from './audioCommandCompatibility';
import type { MasterAudioStateV2 } from './masterAudioState.types';

const canonicalState: MasterAudioStateV2 = {
  schemaVersion: 2,
  revision: 7,
  section: 2,
  position: 45,
  isPlaying: false,
  speed: 1.25,
  timestamp: 1_700_000_000_000,
  updateKind: 'command',
  lastAction: 'pause',
  lastActionRevision: 7,
  lastActionTimestamp: 1_700_000_000_000,
  actionId: 'action-7',
  writerUid: 'teacher-1',
  writerClientId: 'teacher-tab-1',
};

describe('audioCommand compatibility contract', () => {
  it('projects accepted canonical command transactions without inventing default state', () => {
    const command = createAudioCommandProjection(canonicalState);

    expect(command).toEqual({
      schemaVersion: 2,
      commandId: 'action-7',
      canonicalRevision: 7,
      type: 'pause',
      sectionNumber: 2,
      position: 45,
      speed: 1.25,
      isPlaying: false,
      timestamp: 1_700_000_000_000,
      writerUid: 'teacher-1',
    });
  });

  it('validates command-to-canonical identity, revision, and complete mirrored fields', () => {
    const command = createAudioCommandProjection(canonicalState);

    expect(validateAudioCommandProjection(command, canonicalState)).toEqual({
      valid: true,
      errors: [],
    });

    expect(validateAudioCommandProjection({
      ...command,
      canonicalRevision: 6,
      sectionNumber: 1,
      position: 0,
      speed: 1,
    }, canonicalState).errors).toEqual(expect.arrayContaining([
      'canonical_revision_mismatch',
      'section_mismatch',
      'position_mismatch',
      'speed_mismatch',
    ]));
  });

  it('rejects stale commands and requests canonical reread for future revisions without applying command state', () => {
    const staleCommand: AudioCommandV2 = {
      ...createAudioCommandProjection(canonicalState),
      canonicalRevision: 6,
    };
    const futureCommand: AudioCommandV2 = {
      ...createAudioCommandProjection(canonicalState),
      canonicalRevision: 8,
    };

    expect(evaluateAudioCommandAgainstCanonical(staleCommand, {
      acceptedCanonicalRevision: 7,
      clientAcceptedV2Canonical: true,
    })).toEqual({
      decision: 'ignore-stale',
      applyState: false,
      reason: 'command_revision_older_than_canonical',
    });

    expect(evaluateAudioCommandAgainstCanonical(futureCommand, {
      acceptedCanonicalRevision: 7,
      clientAcceptedV2Canonical: true,
    })).toEqual({
      decision: 'request-canonical-reread',
      applyState: false,
      reason: 'command_revision_newer_than_canonical',
    });
  });

  it('prevents legacy commands from overriding a client that accepted v2 canonical state', () => {
    expect(evaluateAudioCommandAgainstCanonical({
      type: 'skipToSection',
      sectionNumber: 1,
      position: 0,
      speed: 1,
      isPlaying: true,
      timestamp: 1_700_000_000_500,
      writerUid: 'teacher-1',
    }, {
      acceptedCanonicalRevision: 7,
      clientAcceptedV2Canonical: true,
    })).toEqual({
      decision: 'ignore-legacy-after-v2',
      applyState: false,
      reason: 'legacy_command_cannot_override_v2_canonical',
    });
  });

  it('defines retirement criteria before audioCommand removal can be claimed', () => {
    expect(listAudioCommandRetirementCriteria()).toEqual([
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
    ]);
  });
});

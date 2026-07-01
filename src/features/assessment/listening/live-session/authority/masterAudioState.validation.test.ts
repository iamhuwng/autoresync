import { describe, expect, it } from 'vitest';

import {
  validateMasterAudioState,
  type MasterAudioStateV2,
  type MasterAudioStateValidationContext,
} from './masterAudioState.validation';

const baseContext: MasterAudioStateValidationContext = {
  teacherUid: 'teacher-1',
  authoritySource: 'trusted-server',
  timestampTrust: {
    timestamp: 'trusted-server',
    lastActionTimestamp: 'trusted-server',
  },
  allowedSections: [1, 2, 3],
  sectionDurationsSeconds: {
    1: 120,
    2: 90,
    3: 60,
  },
};

const state = (overrides: Partial<MasterAudioStateV2> = {}): MasterAudioStateV2 => ({
  schemaVersion: 2,
  revision: 1,
  section: 1,
  position: 30,
  isPlaying: false,
  speed: 1,
  timestamp: 1_700_000_000_000,
  updateKind: 'command',
  lastAction: 'pause',
  lastActionRevision: 1,
  lastActionTimestamp: 1_700_000_000_000,
  actionId: 'action-1',
  writerUid: 'teacher-1',
  writerClientId: 'teacher-tab-1',
  ...overrides,
});

describe('masterAudioState v2 validation contract', () => {
  it('accepts canonical teacher state with monotonic revision and trusted server timestamps', () => {
    const result = validateMasterAudioState(state(), {
      ...baseContext,
      previousState: state({ revision: 0, lastActionRevision: 0, actionId: 'action-0' }),
    });

    expect(result).toEqual({
      valid: true,
      authority: 'canonical',
      errors: [],
    });
  });

  it('rejects revision regression, skipped revision, and equal-revision conflicting payloads', () => {
    const previous = state({
      revision: 4,
      lastActionRevision: 4,
      actionId: 'action-4',
      position: 40,
    });

    expect(validateMasterAudioState(state({
      revision: 3,
      lastActionRevision: 3,
      actionId: 'action-3',
    }), { ...baseContext, previousState: previous }).errors).toContain('revision_regression');

    expect(validateMasterAudioState(state({
      revision: 6,
      lastActionRevision: 6,
      actionId: 'action-6',
    }), { ...baseContext, previousState: previous }).errors).toContain('revision_gap');

    expect(validateMasterAudioState(state({
      revision: 4,
      lastActionRevision: 4,
      actionId: 'action-4',
      position: 41,
    }), { ...baseContext, previousState: previous }).errors).toContain('equal_revision_conflict');
  });

  it('rejects browser/client authority and client-provided timestamps', () => {
    const result = validateMasterAudioState(state(), {
      ...baseContext,
      authoritySource: 'browser-client',
      timestampTrust: {
        timestamp: 'client',
        lastActionTimestamp: 'client',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.authority).toBe('non-authoritative');
    expect(result.errors).toEqual(expect.arrayContaining([
      'browser_client_authority',
      'timestamp_not_trusted_server',
      'last_action_timestamp_not_trusted_server',
    ]));
  });

  it('rejects invalid section, position, speed, writer, and action-state pairs', () => {
    const result = validateMasterAudioState(state({
      section: 4,
      speed: 1.75,
      writerUid: 'student-1',
      lastAction: 'resume',
      isPlaying: false,
    }), baseContext);

    expect(result.errors).toEqual(expect.arrayContaining([
      'invalid_section',
      'invalid_speed',
      'wrong_writer',
      'resume_requires_playing_state',
    ]));

    expect(validateMasterAudioState(state({
      section: 1,
      position: 121,
    }), baseContext).errors).toContain('position_exceeds_duration');
  });

  it('rejects signed URLs, raw keys, secrets, audio content, and student/result data in action metadata', () => {
    const result = validateMasterAudioState(state({
      actionMetadata: {
        signedUrl: 'https://media.example/audio.mp3?X-Amz-Signature=abc',
        rawKey: 'assessment-assets/listening/teacher-1/raw.mp3',
        token: 'secret-token',
        studentId: 'student-1',
        resultId: 'result-1',
        audioContent: 'base64-audio',
      },
    }), baseContext);

    expect(result.errors).toEqual(expect.arrayContaining([
      'metadata_contains_signed_url',
      'metadata_contains_raw_key',
      'metadata_contains_secret',
      'metadata_contains_student_data',
      'metadata_contains_result_data',
      'metadata_contains_audio_content',
    ]));
  });
});

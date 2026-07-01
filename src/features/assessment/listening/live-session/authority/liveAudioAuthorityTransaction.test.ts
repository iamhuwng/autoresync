import { describe, expect, it } from 'vitest';

import { validateAudioCommandProjection } from './audioCommandCompatibility';
import type { MasterAudioStateV2 } from './masterAudioState.types';
import {
  buildLiveAudioAuthorityTransaction,
  createInitialMasterAudioState,
} from './liveAudioAuthorityTransaction';

const now = 1_700_000_000_000;
const serverTimestampValue = { '.sv': 'timestamp' };

const previousState: MasterAudioStateV2 = {
  schemaVersion: 2,
  revision: 11,
  section: 3,
  position: 127.5,
  isPlaying: true,
  speed: 1.25,
  timestamp: now - 2_000,
  updateKind: 'command',
  lastAction: 'resume',
  lastActionRevision: 11,
  lastActionTimestamp: now - 2_000,
  actionId: 'resume-11',
  writerUid: 'teacher-1',
  writerClientId: 'teacher-tab-1',
};

describe('live audio authority transactions', () => {
  it('writes pause through one canonical root transaction without defaulting rich state away', () => {
    const transaction = buildLiveAudioAuthorityTransaction({
      sessionCode: 'LIVE123',
      previousState,
      intent: { action: 'pause' },
      teacherUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
      now,
      serverTimestampValue,
    });

    expect(transaction.state).toEqual(expect.objectContaining({
      revision: 12,
      section: 3,
      position: 127.5,
      isPlaying: false,
      speed: 1.25,
      lastAction: 'pause',
      lastActionRevision: 12,
      writerUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
    }));
    expect(transaction.updates[`game_sessions/LIVE123/masterAudioState`]).toEqual(expect.objectContaining({
      ...transaction.state,
      timestamp: serverTimestampValue,
      lastActionTimestamp: serverTimestampValue,
    }));
    expect(transaction.updates[`game_sessions/LIVE123/audioCommand`]).toEqual(expect.objectContaining({
      schemaVersion: 2,
      canonicalRevision: 12,
      type: 'pause',
      sectionNumber: 3,
      position: 127.5,
      speed: 1.25,
      isPlaying: false,
      writerUid: 'teacher-1',
    }));
    expect(validateAudioCommandProjection(transaction.command, transaction.state)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('preserves canonical section, position, and play state when changing speed', () => {
    const transaction = buildLiveAudioAuthorityTransaction({
      sessionCode: 'LIVE123',
      previousState,
      intent: { action: 'speed', speed: 1.5 },
      teacherUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
      now,
      serverTimestampValue,
    });

    expect(transaction.state).toEqual(expect.objectContaining({
      revision: 12,
      section: 3,
      position: 127.5,
      isPlaying: true,
      speed: 1.5,
      lastAction: 'speed',
    }));
    expect(transaction.command).toEqual(expect.objectContaining({
      canonicalRevision: 12,
      type: 'setSpeed',
      sectionNumber: 3,
      position: 127.5,
      speed: 1.5,
      isPlaying: true,
    }));
  });

  it('requires hydrated canonical state before command writes can proceed', () => {
    expect(() => buildLiveAudioAuthorityTransaction({
      sessionCode: 'LIVE123',
      previousState: null,
      intent: { action: 'pause' },
      teacherUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
      now,
      serverTimestampValue,
    })).toThrow(/canonical audio authority/i);
  });

  it('creates initial authority without projecting an audioCommand', () => {
    const initialState = createInitialMasterAudioState({
      teacherUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
      now,
      section: 1,
      actionId: 'initialize-1',
    });

    expect(initialState).toEqual(expect.objectContaining({
      schemaVersion: 2,
      revision: 1,
      section: 1,
      position: 0,
      isPlaying: false,
      speed: 1,
      updateKind: 'command',
      lastAction: 'initialize',
      lastActionRevision: 1,
      actionId: 'initialize-1',
      writerUid: 'teacher-1',
      writerClientId: 'teacher-tab-1',
    }));
  });
});

import { describe, expect, it } from 'vitest';

import {
  cancelListeningAssetReplacement,
  completeListeningAssetReplacement,
  startListeningAssetReplacement,
} from './listeningAssetReplacement';
import { LISTENING_STORAGE_ROLLBACK_CONTROLS } from './listeningAssetRollback';

const oldReference = {
  assetId: 'asset-old',
  audioUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-old/audio.mp3',
  streamUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-old/audio.mp3',
  reference: {
    kind: 'tests' as const,
    id: 'test-1',
    sourcePath: 'tests/test-1/audioSections/1',
  },
};

const replacementUpload = {
  assetId: 'asset-new',
  uploadSessionId: 'session-new',
  tempKey: 'temp/listening/teacher-1/session-new/asset-new-audio.mp3',
  audioUrl: 'https://public.example/temp/listening/teacher-1/session-new/asset-new-audio.mp3',
  streamUrl: 'https://public.example/temp/listening/teacher-1/session-new/asset-new-audio.mp3',
};

describe('Listening asset replacement safety', () => {
  it('starts replacement with a new assetId while old reference remains authoritative', () => {
    const state = startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: replacementUpload,
      now: 1_700_000_000_000,
    });

    expect(state.authoritativeReference).toBe(oldReference);
    expect(state.pendingReplacement).toMatchObject({
      assetId: 'asset-new',
      status: 'commit-unresolved',
      cleanupQueued: false,
    });
  });

  it('blocks second replacement while first commit remains unresolved', () => {
    const state = startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: replacementUpload,
      now: 1_700_000_000_000,
    });

    expect(() => startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: {
        ...replacementUpload,
        assetId: 'asset-third',
        tempKey: 'temp/listening/teacher-1/session-new/asset-third-audio.mp3',
      },
      existing: state,
      now: 1_700_000_001_000,
    })).toThrow('replacement_commit_unresolved');
  });

  it('swaps new reference and removes old reference only after surrounding save succeeds', () => {
    const state = startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: replacementUpload,
      now: 1_700_000_000_000,
    });

    const completed = completeListeningAssetReplacement({
      state,
      committedReplacement: {
        assetId: 'asset-new',
        audioUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-new/audio.mp3',
        streamUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-new/audio.mp3',
        reference: oldReference.reference,
      },
      surroundingSaveSucceeded: true,
      now: 1_700_000_002_000,
    });

    expect(completed.authoritativeReference.assetId).toBe('asset-new');
    expect(completed.referenceOperations).toEqual([
      {
        operation: 'remove-reference',
        assetId: 'asset-old',
        reference: oldReference.reference,
      },
    ]);
    expect(completed.cleanupOperations).toEqual([]);
    expect(completed.nextState.pendingReplacement).toBeUndefined();
    expect(() => startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: completed.authoritativeReference,
      replacement: {
        ...replacementUpload,
        assetId: 'asset-third',
        tempKey: 'temp/listening/teacher-1/session-new/asset-third-audio.mp3',
      },
      existing: completed.nextState,
      now: 1_700_000_003_000,
    })).not.toThrow();
  });

  it('preserves old playback and queues new temp cleanup when replacement save fails', () => {
    const state = startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: replacementUpload,
      now: 1_700_000_000_000,
    });

    const completed = completeListeningAssetReplacement({
      state,
      committedReplacement: {
        assetId: 'asset-new',
        audioUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-new/audio.mp3',
        streamUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-new/audio.mp3',
        reference: oldReference.reference,
      },
      surroundingSaveSucceeded: false,
      now: 1_700_000_002_000,
    });

    expect(completed.authoritativeReference).toBe(oldReference);
    expect(completed.referenceOperations).toEqual([]);
    expect(completed.cleanupOperations).toEqual([
      {
        operation: 'cleanup-temp',
        assetId: 'asset-new',
        tempKey: replacementUpload.tempKey,
        reason: 'failed-save-publish',
      },
    ]);
    expect(completed.nextState.pendingReplacement).toMatchObject({
      assetId: 'asset-new',
      cleanupQueued: true,
    });
    expect(() => startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: completed.authoritativeReference,
      replacement: {
        ...replacementUpload,
        assetId: 'asset-third',
        tempKey: 'temp/listening/teacher-1/session-new/asset-third-audio.mp3',
      },
      existing: completed.nextState,
      now: 1_700_000_003_000,
    })).not.toThrow();
  });

  it('preserves old playback and stops replacement cleanup while rollback is active', () => {
    const state = startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: replacementUpload,
      now: 1_700_000_000_000,
    });

    const completed = completeListeningAssetReplacement({
      state,
      committedReplacement: {
        assetId: 'asset-new',
        audioUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-new/audio.mp3',
        streamUrl: 'https://public.example/assessment-assets/listening/teacher-1/asset-new/audio.mp3',
        reference: oldReference.reference,
      },
      surroundingSaveSucceeded: false,
      now: 1_700_000_002_000,
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    });

    expect(completed.authoritativeReference).toBe(oldReference);
    expect(completed.referenceOperations).toEqual([]);
    expect(completed.cleanupOperations).toEqual([
      {
        operation: 'cleanup-stopped',
        assetId: 'asset-new',
        reason: 'failed-save-publish',
      },
    ]);
  });

  it('queues cleanup for cancelled replacement without removing old reference', () => {
    const state = startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: replacementUpload,
      now: 1_700_000_000_000,
    });

    expect(cancelListeningAssetReplacement({
      state,
      now: 1_700_000_001_000,
    })).toMatchObject({
      authoritativeReference: oldReference,
      nextState: {
        pendingReplacement: {
          assetId: 'asset-new',
          cleanupQueued: true,
        },
      },
      cleanupOperations: [
        {
          operation: 'cleanup-temp',
          assetId: 'asset-new',
          tempKey: replacementUpload.tempKey,
          reason: 'replacement-cancelled',
        },
      ],
    });
  });

  it('stops cancelled replacement cleanup while rollback is active', () => {
    const state = startListeningAssetReplacement({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      current: oldReference,
      replacement: replacementUpload,
      now: 1_700_000_000_000,
    });

    expect(cancelListeningAssetReplacement({
      state,
      now: 1_700_000_001_000,
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    })).toMatchObject({
      authoritativeReference: oldReference,
      referenceOperations: [],
      cleanupOperations: [
        {
          operation: 'cleanup-stopped',
          assetId: 'asset-new',
          reason: 'replacement-cancelled',
        },
      ],
    });
  });
});

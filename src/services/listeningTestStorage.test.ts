import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedQuestion } from '../types/document.types';

const mocks = vi.hoisted(() => ({
  ref: vi.fn((_database: unknown, path: string) => ({ path })),
  set: vi.fn(),
  get: vi.fn(),
  database: { app: 'test-db' },
  r2StorageService: {
    isTempFile: vi.fn(),
    getKeyFromUrl: vi.fn(),
    moveToPermanent: vi.fn(),
  },
}));

vi.mock('firebase/database', () => ({
  ref: mocks.ref,
  set: mocks.set,
  get: mocks.get,
}));

vi.mock('./firebase', () => ({
  database: mocks.database,
}));

vi.mock('./r2Storage', () => ({
  default: mocks.r2StorageService,
  R2_PUBLIC_URL: 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev',
}));

import {
  deleteListeningTestFromFirebase,
  saveListeningTestToFirebase,
  type AudioSection,
  type ListeningAssetCommitter,
  type ListeningTestMetadata,
} from './listeningTestStorage';

describe('saveListeningTestToFirebase baseline compatibility', () => {
  const metadata: ListeningTestMetadata = {
    title: 'Baseline Listening Test',
    type: 'IELTS',
    skill: 'Listening',
    duration: 30,
  };

  const questions = [
    {
      number: 1,
      type: 'multiple-choice',
      question: 'Choose the correct answer.',
      options: ['A', 'B', 'C'],
      answer: 'A',
      points: 1,
    },
  ] as ParsedQuestion[];

  const audioSection = (overrides: Partial<AudioSection> = {}): AudioSection => ({
    number: 1,
    name: 'Section 1',
    audioUrl: 'https://pub.example.r2.dev/listening-audio/source.mp3',
    streamUrl: 'https://pub.example.r2.dev/listening-audio/source.mp3',
    startQuestion: 1,
    endQuestion: 1,
    ...overrides,
  });

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mocks.ref.mockClear();
    mocks.set.mockReset();
    mocks.get.mockReset();
    mocks.r2StorageService.isTempFile.mockReset();
    mocks.r2StorageService.getKeyFromUrl.mockReset();
    mocks.r2StorageService.moveToPermanent.mockReset();

    mocks.set.mockResolvedValue(undefined);
    mocks.r2StorageService.isTempFile.mockReturnValue(false);
    mocks.r2StorageService.getKeyFromUrl.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing audio before moving or writing test data', async () => {
    const result = await saveListeningTestToFirebase(
      metadata,
      [audioSection({ audioUrl: '', streamUrl: '' })],
      questions,
      'teacher-1'
    );

    expect(result).toEqual({
      success: false,
      error: 'Missing audio for section(s): 1',
    });
    expect(mocks.r2StorageService.moveToPermanent).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('fails closed for temp audio without registry commit metadata', async () => {
    const tempUrl = 'https://pub.example.r2.dev/temp/listening-audio/teacher-1/source.mp3';
    mocks.r2StorageService.isTempFile.mockImplementation((url: string) => url.includes('/temp/'));

    const result = await saveListeningTestToFirebase(
      metadata,
      [audioSection({ audioUrl: tempUrl, streamUrl: tempUrl })],
      questions,
      'teacher-1',
      'transcript',
      'text',
      undefined,
      'teacher-1',
      false
    );

    expect(result).toEqual({
      success: false,
      error: 'Section 1 audio requires registry commit metadata before save',
    });
    expect(mocks.r2StorageService.moveToPermanent).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('fails closed for distinct temp stream URL before Firebase write', async () => {
    const tempAudioUrl = 'https://pub.example.r2.dev/temp/listening-audio/teacher-1/audio.mp3';
    const tempStreamUrl = 'https://pub.example.r2.dev/temp/listening-audio/teacher-1/stream.mp3';
    mocks.r2StorageService.isTempFile.mockImplementation((url: string) => url.includes('/temp/'));

    const result = await saveListeningTestToFirebase(
      metadata,
      [audioSection({ audioUrl: tempAudioUrl, streamUrl: tempStreamUrl })],
      questions,
      'teacher-1'
    );

    expect(result).toEqual({
      success: false,
      error: 'Section 1 audio requires registry commit metadata before save',
    });
    expect(mocks.r2StorageService.moveToPermanent).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('does not save temp audio if legacy promotion would fail', async () => {
    const tempUrl = 'https://pub.example.r2.dev/temp/listening-audio/teacher-1/source.mp3';
    mocks.r2StorageService.isTempFile.mockImplementation((url: string) => url.includes('/temp/'));
    mocks.r2StorageService.moveToPermanent.mockRejectedValue(new Error('move unavailable'));

    const result = await saveListeningTestToFirebase(
      metadata,
      [audioSection({ audioUrl: tempUrl, streamUrl: tempUrl })],
      questions,
      'teacher-1'
    );

    expect(result).toEqual({
      success: false,
      error: 'Section 1 audio requires registry commit metadata before save',
    });
    expect(mocks.r2StorageService.moveToPermanent).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('maps Firebase permission and network failures without changing save semantics', async () => {
    mocks.set.mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      saveListeningTestToFirebase(metadata, [audioSection()], questions, 'teacher-1')
    ).resolves.toEqual({
      success: false,
      error: 'Permission denied. Please check Firebase database rules.',
    });

    mocks.set.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(
      saveListeningTestToFirebase(metadata, [audioSection()], questions, 'teacher-1')
    ).resolves.toEqual({
      success: false,
      error: 'Network error. Please check your connection.',
    });
  });

  it('commits canonical registry-backed audio before saving and preserves assetId plus public reader URLs', async () => {
    const tempUrl = 'https://pub.example.r2.dev/temp/listening/teacher-1/session-1/asset-1-audio.mp3';
    const committer: ListeningAssetCommitter = vi.fn(async () => ({
      assetId: 'asset-1',
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      streamUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      state: 'committed',
    }));

    const result = await saveListeningTestToFirebase(
      metadata,
      [audioSection({
        audioUrl: tempUrl,
        streamUrl: tempUrl,
        assetId: 'asset-1',
        uploadSessionId: 'session-1',
        tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
        checksum: 'sha256:proof',
        contentType: 'audio/mpeg',
        sizeBytes: 6,
        fileName: 'audio.mp3',
      })],
      questions,
      'teacher-1',
      undefined,
      'text',
      undefined,
      'teacher-1',
      false,
      undefined,
      false,
      1,
      committer
    );

    expect(result).toEqual({
      success: true,
      testId: 'listening-1700000000000-4fzzzxj',
    });
    expect(committer).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'teacher-1',
      uploadSessionId: 'session-1',
      assetId: 'asset-1',
      activeAudioFileCount: 1,
      reference: expect.objectContaining({
        kind: 'tests',
        id: 'listening-1700000000000-4fzzzxj',
      }),
    }));
    expect(mocks.r2StorageService.moveToPermanent).not.toHaveBeenCalled();

    const savedTest = mocks.set.mock.calls[0][1];
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(savedTest.isPublished).toBe(true);
    expect(savedTest.audioSections[0]).toMatchObject({
      assetId: 'asset-1',
      audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      streamUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
    });
  });

  it('preflights all sections before committing so mixed temp payloads cannot partially commit', async () => {
    const committer: ListeningAssetCommitter = vi.fn(async () => ({
      assetId: 'asset-1',
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      streamUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      state: 'committed',
    }));
    mocks.r2StorageService.isTempFile.mockImplementation((url: string) => url.includes('/temp/'));

    const result = await saveListeningTestToFirebase(
      metadata,
      [
        audioSection({
          assetId: 'asset-1',
          uploadSessionId: 'session-1',
          tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
          checksum: 'sha256:proof',
          contentType: 'audio/mpeg',
          sizeBytes: 6,
          fileName: 'audio.mp3',
        }),
        audioSection({
          number: 2,
          name: 'Section 2',
          audioUrl: 'https://pub.example.r2.dev/temp/listening/teacher-1/session-2/asset-2-audio.mp3',
          streamUrl: 'https://pub.example.r2.dev/temp/listening/teacher-1/session-2/asset-2-audio.mp3',
          startQuestion: 2,
          endQuestion: 2,
        }),
      ],
      questions,
      'teacher-1',
      undefined,
      'text',
      undefined,
      'teacher-1',
      false,
      undefined,
      false,
      1,
      committer
    );

    expect(result).toEqual({
      success: false,
      error: 'Section 2 audio requires registry commit metadata before save',
    });
    expect(committer).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('uses trusted public R2 origin for registry-backed commits instead of draft audio URL origin', async () => {
    const committer: ListeningAssetCommitter = vi.fn(async () => ({
      assetId: 'asset-1',
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      audioUrl: 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      streamUrl: 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      state: 'committed',
    }));

    await expect(saveListeningTestToFirebase(
      metadata,
      [audioSection({
        audioUrl: 'https://attacker.example/temp/listening/teacher-1/session-1/asset-1-audio.mp3',
        streamUrl: 'https://attacker.example/temp/listening/teacher-1/session-1/asset-1-audio.mp3',
        assetId: 'asset-1',
        uploadSessionId: 'session-1',
        tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
        checksum: 'sha256:proof',
        contentType: 'audio/mpeg',
        sizeBytes: 6,
        fileName: 'audio.mp3',
      })],
      questions,
      'teacher-1',
      undefined,
      'text',
      undefined,
      'teacher-1',
      false,
      undefined,
      false,
      1,
      committer
    )).resolves.toEqual({
      success: true,
      testId: 'listening-1700000000000-4fzzzxj',
    });

    expect(committer).toHaveBeenCalledWith(expect.objectContaining({
      publicBaseUrl: 'https://pub-9785039d4a7e4f76b2446f9fae6b2ca1.r2.dev',
    }));
  });

  it('blocks legacy public hard delete until Task 6 audited deletion operation exists', async () => {
    const result = await deleteListeningTestFromFirebase('listening-test-1');

    expect(result).toEqual({
      success: false,
      error: 'Published Listening test physical deletion is blocked until the approved Task 6 audited deletion operation exists.',
    });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

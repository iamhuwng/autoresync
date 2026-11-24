import { describe, expect, expectTypeOf, it } from 'vitest';
import { resolveListeningLegacyAudioReference } from '../features/assessment/listening/adapters/listeningLegacyAudioResolver';
import type { ListeningMediaAssetRecord } from '../features/assessment/listening/storage/listeningAssetRegistry';
import type {
  AudioAssetRecord,
  AudioResourceRef,
  ExistingR2AudioRef,
  PublishedAudioResourceRef,
  ReadableAudioResourceRef,
} from './assessmentAudio.types';
import type { AudioSection } from './listening.types';

const existingSection: AudioSection = {
  number: 1,
  name: 'Part 1',
  startQuestion: 1,
  endQuestion: 10,
  audioUrl: 'https://pub.example.r2.dev/listening-audio/part-1.mp3',
  streamUrl: 'https://pub.example.r2.dev/listening-audio/part-1.mp3',
};

describe('assessment audio references', () => {
  it('supports section and question attachments with the same provider-neutral fields', () => {
    expectTypeOf<AudioResourceRef['scope']>().toEqualTypeOf<'section' | 'question'>();
    expectTypeOf<AudioResourceRef<'question'>>().not.toExtend<AudioResourceRef<'section'>>();
    expectTypeOf<keyof AudioResourceRef>().toEqualTypeOf<'assetId' | 'scope'>();
    expectTypeOf<AudioResourceRef<'question'>>().toExtend<ReadableAudioResourceRef>();
  });

  it('requires an exact B2 version in the trusted record and keeps it out of the published attachment', () => {
    type B2Asset = Extract<AudioAssetRecord, { storageProvider: 'b2' }>;

    expectTypeOf<AudioAssetRecord['storageProvider']>().toEqualTypeOf<'r2' | 'b2' | undefined>();
    expectTypeOf<AudioAssetRecord['ownerId']>().toEqualTypeOf<string>();
    expectTypeOf<B2Asset['providerVersionId']>().toEqualTypeOf<string>();
    expectTypeOf<Omit<B2Asset, 'providerVersionId'>>().not.toExtend<AudioAssetRecord>();
    expectTypeOf<B2Asset>().not.toHaveProperty('durableKey');
    expectTypeOf<PublishedAudioResourceRef['versionId']>().toEqualTypeOf<string>();
    expectTypeOf<PublishedAudioResourceRef<'question'>['audio']>().toEqualTypeOf<AudioResourceRef<'question'>>();
    expectTypeOf<PublishedAudioResourceRef>().not.toHaveProperty('durableKey');
    expectTypeOf<PublishedAudioResourceRef>().not.toHaveProperty('providerVersionId');
  });

  it('accepts and resolves an existing URL-only R2 section in its original shape', () => {
    expectTypeOf<AudioSection>().toExtend<ReadableAudioResourceRef>();
    expectTypeOf<ExistingR2AudioRef>().toExtend<Parameters<typeof resolveListeningLegacyAudioReference>[0]>();
    expect(resolveListeningLegacyAudioReference(existingSection)).toEqual({
      kind: 'legacy-raw-r2-url',
      readOnly: true,
      audioUrl: existingSection.audioUrl,
      streamUrl: existingSection.streamUrl,
    });
  });

  it('preserves the existing R2 asset ID in the shared reference', () => {
    expectTypeOf<ListeningMediaAssetRecord & { durableKey: string }>().toExtend<AudioAssetRecord>();

    const existingManagedSection = { ...existingSection, assetId: 'asset-1' };
    const asset: AudioAssetRecord = {
      assetId: existingManagedSection.assetId,
      ownerId: 'teacher-1',
      contentType: 'audio/mpeg',
      sizeBytes: 32_000,
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
    };
    const published: PublishedAudioResourceRef<'section'> = {
      testId: 'test-1',
      versionId: 'version-1',
      audio: { assetId: asset.assetId, scope: 'section' },
    };
    const existing = resolveListeningLegacyAudioReference(existingManagedSection);

    expect(existing).toEqual({
      kind: 'canonical-asset',
      readOnly: true,
      assetId: published.audio.assetId,
      audioUrl: existingManagedSection.audioUrl,
      streamUrl: existingManagedSection.streamUrl,
    });
  });
});

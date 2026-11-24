export type AudioScope = 'section' | 'question';

/** Draft authoring stores only the opaque section reference. */
export type DraftSectionAudio = AudioResourceRef<'section'>;

export const DRAFT_AUDIO_ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const EXTERNAL_AUDIO_DRAFT_ONLY = 'External audio is available in drafts only. Remove it or use uploaded audio before publishing.';
export const EXTERNAL_AUDIO_PRIVATE_ONLY = 'Publish this test privately for homework, or replace the external recording with uploaded audio.';
export const EXTERNAL_AUDIO_REPLACEMENT_REQUIRED = 'Choose your own recording for this section before publishing.';

/** Attach to the enclosing section or question. The asset ID identifies the recording independently of its storage location. */
export interface AudioResourceRef<Scope extends AudioScope = AudioScope> {
  readonly assetId: string;
  readonly scope: Scope;
}

interface AudioAssetMetadata {
  readonly assetId: AudioResourceRef['assetId'];
  readonly ownerId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly durationSeconds?: number;
  readonly health?: 'healthy' | 'missing' | 'changed' | 'needs-attention';
}

interface R2AudioAssetRecord extends AudioAssetMetadata {
  /** Existing committed R2 records predate the discriminator. */
  readonly storageProvider?: 'r2';
  readonly durableKey: string;
}

interface B2AudioAssetRecord extends AudioAssetMetadata {
  readonly storageProvider: 'b2';
  readonly connectionId: string;
  readonly bucketId: string;
  readonly objectKey: string;
  readonly lastModifiedAt?: number;
  /** The B2 file ID used to retrieve the exact object version. */
  readonly providerVersionId: string;
}

/** Trusted storage metadata. Test attachments expose only the opaque audio reference. */
export type AudioAssetRecord = R2AudioAssetRecord | B2AudioAssetRecord;
export type AudioStorageProvider = NonNullable<AudioAssetRecord['storageProvider']>;

/** Pins an attachment to an immutable published test version. */
export interface PublishedAudioResourceRef<Scope extends AudioScope = AudioScope> {
  readonly testId: string;
  readonly versionId: string;
  readonly audio: AudioResourceRef<Scope>;
}

/** Existing Listening section audio. Older R2 records can contain only a URL. */
export interface ExistingR2AudioRef {
  readonly audioUrl: string;
  readonly streamUrl?: string;
  readonly assetId?: string;
}

/** Section readers can accept the original R2 fields without rewriting their documents. */
export type ReadableAudioResourceRef = AudioResourceRef | ExistingR2AudioRef;

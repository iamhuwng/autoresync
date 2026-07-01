export interface ListeningLegacyAudioResolution {
  readonly kind: 'legacy-raw-r2-url' | 'canonical-asset';
  readonly readOnly: true;
  readonly audioUrl: string;
  readonly streamUrl?: string;
  readonly assetId?: string;
}

export function resolveListeningLegacyAudioReference(input: {
  readonly ownerId?: string;
  readonly audioUrl: string;
  readonly streamUrl?: string;
  readonly assetId?: string;
}): ListeningLegacyAudioResolution {
  if (input.assetId) {
    return {
      kind: 'canonical-asset',
      readOnly: true,
      audioUrl: input.audioUrl,
      streamUrl: input.streamUrl,
      assetId: input.assetId,
    };
  }
  return {
    kind: 'legacy-raw-r2-url',
    readOnly: true,
    audioUrl: input.audioUrl,
    streamUrl: input.streamUrl,
  };
}

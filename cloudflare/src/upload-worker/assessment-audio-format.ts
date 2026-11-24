const AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
]);

export const isSupportedAssessmentAudioMimeType = (mimeType: string): boolean => AUDIO_MIME_TYPES.has(mimeType);

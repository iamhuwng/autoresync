export interface AudioSection {
  number: number;
  name: string;
  audioUrl: string;
  streamUrl?: string;
  assetId?: string;
  uploadSessionId?: string;
  startQuestion: number;
  endQuestion: number;
  playLimit?: number;
  waitTimeBefore?: number;
  duration?: number;
}

export type ListeningDisplayMode = 'text' | 'image';

export interface QuestionImage {
  sectionNumber: number;
  imageUrl: string;
  imageCaption?: string;
  questionRange?: { start: number; end: number };
}

export { AUDIO_CONTROLS_PRESETS } from './audio.types';
export type { AudioControlsConfig } from './audio.types';

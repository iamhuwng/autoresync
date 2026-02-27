/**
 * Listening Types Barrel Export
 * Exports all Listening-specific TypeScript interfaces and types
 */

// Audio and playback types
export interface AudioTrack {
  id: string;
  url: string;
  duration: number; // seconds
  sectionNumber: number;
  sectionName: string;
}

export interface ListeningSection {
  id: string;
  number: number;
  name: string;
  audioTrackId: string;
  questionRange: {
    start: number;
    end: number;
  };
  duration: number; // seconds
  playbackRule: 'once' | 'replay' | 'unlimited';
}

export interface PlaybackRules {
  allowPause: boolean;
  allowRewind: boolean;
  allowSpeedControl: boolean;
  maxReplays?: number;
  replayDelay?: number; // seconds
}

export interface ListeningTestConfig {
  sections: ListeningSection[];
  audioTracks: AudioTrack[];
  playbackRules: PlaybackRules;
  totalDuration: number; // seconds
}

// Playback state
export interface PlaybackState {
  currentSection: number;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  playbackSpeed: number;
  replaysRemaining?: number;
}

// Section progress
export interface SectionProgress {
  sectionId: string;
  status: 'not-started' | 'in-progress' | 'completed';
  playCount: number;
  questionsAnswered: number;
  totalQuestions: number;
}

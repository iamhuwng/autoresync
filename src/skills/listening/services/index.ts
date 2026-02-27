/**
 * Listening Services Barrel Export
 * Exports all Listening-specific business logic and utilities
 */

// Listening scoring service
export { 
  ListeningScoringService,
  listeningScoring,
  calculateListeningScore,
  getBandDescriptor,
  getMinCorrectForBand,
  getNextBandRequirement,
  generateDetailedFeedback,
  LISTENING_BAND_DESCRIPTORS
} from './listeningScoring';

export type {
  ListeningScoreResult,
  ListeningBandDescriptor
} from './listeningScoring';

// Audio section detection
// export { AudioSectionDetector } from './audioSectionDetector';
// export * from './audioSectionDetector';

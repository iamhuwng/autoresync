/**
 * Reading Skill Services
 * Barrel export file for all Reading-specific services
 */

// Passage Detection
export {
  detectPassages,
  associatePassagesWithQuestions,
  getPassageById,
  PassageDetectorService,
  passageDetectorService,
  type DetectedPassage,
  type Question as PassageQuestion
} from './passageDetector';

// Reading Scoring
export {
  calculateReadingScore,
  getBandDescriptor,
  getMinCorrectForBand,
  getPercentageForBand,
  generateReadingFeedback,
  getNextBand,
  getQuestionsToNextBand,
  ReadingScoringService,
  readingScoringService,
  READING_BAND_DESCRIPTORS,
  type ReadingScoreResult,
  type ReadingBandDescriptor
} from './readingScoring';

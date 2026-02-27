/**
 * Reading Scoring Service
 * Reading-specific IELTS band score calculation and performance feedback
 * 
 * Wraps and extends scoring functionality from src/config/scoring.config.ts
 * Created during Phase 2 Step 2.5
 */

import { calculateIELTSReadingBandScore } from '../../../config/scoring.config';

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface ReadingScoreResult {
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  bandScore: number;
  feedback: string;
  performanceLevel: 'excellent' | 'very-good' | 'good' | 'fair' | 'needs-improvement';
}

export interface ReadingBandDescriptor {
  band: number;
  minCorrect: number; // For 40-question test
  description: string;
  level: string;
}

// ═══════════════════════════════════════════════════════════════
// IELTS READING BAND DESCRIPTORS
// ═══════════════════════════════════════════════════════════════

/**
 * Official IELTS Reading band score descriptors
 * Based on standard 40-question IELTS Reading test
 */
export const READING_BAND_DESCRIPTORS: ReadingBandDescriptor[] = [
  { band: 9.0, minCorrect: 40, description: 'Expert user - full operational command', level: 'Expert' },
  { band: 8.5, minCorrect: 39, description: 'Very good user - fully operational command with rare inaccuracies', level: 'Very Good' },
  { band: 8.0, minCorrect: 37, description: 'Very good user - fully operational command with occasional inaccuracies', level: 'Very Good' },
  { band: 7.5, minCorrect: 36, description: 'Good user - operational command with occasional inaccuracies', level: 'Good' },
  { band: 7.0, minCorrect: 34, description: 'Good user - operational command with some inaccuracies', level: 'Good' },
  { band: 6.5, minCorrect: 32, description: 'Competent user - generally effective command', level: 'Competent' },
  { band: 6.0, minCorrect: 30, description: 'Competent user - generally effective command with inaccuracies', level: 'Competent' },
  { band: 5.5, minCorrect: 27, description: 'Modest user - partial command', level: 'Modest' },
  { band: 5.0, minCorrect: 23, description: 'Modest user - partial command with frequent problems', level: 'Modest' },
  { band: 4.5, minCorrect: 19, description: 'Limited user - basic competence in familiar situations', level: 'Limited' },
  { band: 4.0, minCorrect: 15, description: 'Limited user - frequent problems in understanding', level: 'Limited' },
  { band: 3.5, minCorrect: 12, description: 'Extremely limited user', level: 'Extremely Limited' },
  { band: 3.0, minCorrect: 9, description: 'Extremely limited user', level: 'Extremely Limited' },
  { band: 2.5, minCorrect: 6, description: 'Intermittent user', level: 'Intermittent' },
  { band: 2.0, minCorrect: 4, description: 'Intermittent user', level: 'Intermittent' },
  { band: 1.5, minCorrect: 2, description: 'Non-user', level: 'Non-user' },
  { band: 1.0, minCorrect: 1, description: 'Non-user', level: 'Non-user' },
  { band: 0.5, minCorrect: 0, description: 'Did not attempt', level: 'Did not attempt' },
];

// ═══════════════════════════════════════════════════════════════
// CORE SCORING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate comprehensive Reading test score with band score and feedback
 * @param correctCount - Number of correct answers
 * @param totalQuestions - Total number of questions
 * @returns Complete score result with band score and feedback
 */
export function calculateReadingScore(
  correctCount: number,
  totalQuestions: number
): ReadingScoreResult {
  // Calculate percentage
  const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
  
  // Calculate IELTS band score using official table
  const bandScore = calculateIELTSReadingBandScore(correctCount, totalQuestions);
  
  // Generate feedback based on percentage
  const feedback = generateReadingFeedback(percentage);
  
  // Determine performance level
  const performanceLevel = getPerformanceLevel(percentage);
  
  return {
    correctCount,
    totalQuestions,
    percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    bandScore,
    feedback,
    performanceLevel,
  };
}

/**
 * Get band score descriptor for a given band score
 * @param bandScore - IELTS band score (0.5 to 9.0)
 * @returns Band descriptor with description and level
 */
export function getBandDescriptor(bandScore: number): ReadingBandDescriptor | null {
  return READING_BAND_DESCRIPTORS.find(d => d.band === bandScore) || null;
}

/**
 * Get minimum correct answers needed for target band score
 * @param targetBand - Target IELTS band score
 * @param totalQuestions - Total number of questions (defaults to 40)
 * @returns Minimum number of correct answers needed
 */
export function getMinCorrectForBand(
  targetBand: number,
  totalQuestions: number = 40
): number {
  const descriptor = READING_BAND_DESCRIPTORS.find(d => d.band === targetBand);
  
  if (!descriptor) {
    return 0;
  }
  
  // If test has 40 questions, use official value
  if (totalQuestions === 40) {
    return descriptor.minCorrect;
  }
  
  // Scale proportionally for different question counts
  return Math.ceil((descriptor.minCorrect / 40) * totalQuestions);
}

/**
 * Generate detailed Reading feedback based on percentage
 * @param percentage - Percentage score (0-100)
 * @returns Performance feedback message
 */
export function generateReadingFeedback(percentage: number): string {
  if (percentage >= 95) {
    return 'Outstanding! Excellent comprehension and attention to detail. You demonstrate expert-level reading skills.';
  }
  if (percentage >= 90) {
    return 'Excellent work! Very strong reading comprehension. You\'ve shown mastery of complex texts.';
  }
  if (percentage >= 80) {
    return 'Very good! Strong understanding of the passages. Your reading skills are well-developed.';
  }
  if (percentage >= 70) {
    return 'Good performance! Solid comprehension of the main ideas and details. Keep up the good work.';
  }
  if (percentage >= 60) {
    return 'Fair performance. You understand the basic content but may need to work on detail comprehension.';
  }
  if (percentage >= 50) {
    return 'You passed, but there\'s significant room for improvement. Focus on understanding both main ideas and supporting details.';
  }
  return 'Needs substantial improvement. Consider reviewing reading strategies, vocabulary building, and practicing with more texts.';
}

/**
 * Get performance level category
 * @param percentage - Percentage score (0-100)
 * @returns Performance level category
 */
function getPerformanceLevel(percentage: number): ReadingScoreResult['performanceLevel'] {
  if (percentage >= 90) return 'excellent';
  if (percentage >= 80) return 'very-good';
  if (percentage >= 70) return 'good';
  if (percentage >= 50) return 'fair';
  return 'needs-improvement';
}

/**
 * Calculate percentage needed for target band score
 * @param targetBand - Target IELTS band score
 * @param totalQuestions - Total number of questions (defaults to 40)
 * @returns Percentage score needed (0-100)
 */
export function getPercentageForBand(
  targetBand: number,
  totalQuestions: number = 40
): number {
  const minCorrect = getMinCorrectForBand(targetBand, totalQuestions);
  return (minCorrect / totalQuestions) * 100;
}

/**
 * Get next achievable band score
 * @param currentBand - Current IELTS band score
 * @returns Next band score or null if already at maximum
 */
export function getNextBand(currentBand: number): number | null {
  const currentIndex = READING_BAND_DESCRIPTORS.findIndex(d => d.band === currentBand);
  
  if (currentIndex === -1 || currentIndex === 0) {
    return null; // Already at maximum or invalid band
  }
  
  const nextDescriptor = READING_BAND_DESCRIPTORS[currentIndex - 1];
  return nextDescriptor ? nextDescriptor.band : null;
}

/**
 * Calculate questions needed to improve to next band
 * @param correctCount - Current correct answer count
 * @param currentBand - Current IELTS band score
 * @param totalQuestions - Total number of questions (defaults to 40)
 * @returns Number of additional correct answers needed, or null if at maximum
 */
export function getQuestionsToNextBand(
  correctCount: number,
  currentBand: number,
  totalQuestions: number = 40
): number | null {
  const nextBand = getNextBand(currentBand);
  
  if (!nextBand) {
    return null; // Already at maximum
  }
  
  const minCorrectForNext = getMinCorrectForBand(nextBand, totalQuestions);
  const additionalNeeded = minCorrectForNext - correctCount;
  
  return additionalNeeded > 0 ? additionalNeeded : 0;
}

// ═══════════════════════════════════════════════════════════════
// READING SCORING SERVICE CLASS
// ═══════════════════════════════════════════════════════════════

/**
 * Reading Scoring Service
 * Singleton service for Reading test scoring operations
 */
export class ReadingScoringService {
  private static instance: ReadingScoringService;

  private constructor() {}

  static getInstance(): ReadingScoringService {
    if (!ReadingScoringService.instance) {
      ReadingScoringService.instance = new ReadingScoringService();
    }
    return ReadingScoringService.instance;
  }

  /**
   * Calculate complete Reading test score
   */
  calculateScore(correctCount: number, totalQuestions: number): ReadingScoreResult {
    return calculateReadingScore(correctCount, totalQuestions);
  }

  /**
   * Get band descriptor
   */
  getBandDescriptor(bandScore: number): ReadingBandDescriptor | null {
    return getBandDescriptor(bandScore);
  }

  /**
   * Get minimum correct for target band
   */
  getMinCorrect(targetBand: number, totalQuestions?: number): number {
    return getMinCorrectForBand(targetBand, totalQuestions);
  }

  /**
   * Get percentage for target band
   */
  getPercentage(targetBand: number, totalQuestions?: number): number {
    return getPercentageForBand(targetBand, totalQuestions);
  }

  /**
   * Get next achievable band
   */
  getNextBand(currentBand: number): number | null {
    return getNextBand(currentBand);
  }

  /**
   * Get questions needed for next band
   */
  getQuestionsToNext(
    correctCount: number,
    currentBand: number,
    totalQuestions?: number
  ): number | null {
    return getQuestionsToNextBand(correctCount, currentBand, totalQuestions);
  }

  /**
   * Get all band descriptors
   */
  getAllDescriptors(): ReadingBandDescriptor[] {
    return READING_BAND_DESCRIPTORS;
  }
}

// Export singleton instance
export const readingScoringService = ReadingScoringService.getInstance();

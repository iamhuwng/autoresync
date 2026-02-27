/**
 * Listening Scoring Service
 * Listening-specific IELTS band score calculation and performance feedback
 * 
 * Based on Reading scoring service pattern from Phase 2
 * Created during Phase 3 Step 6
 */

import { calculateIELTSReadingBandScore } from '../../../config/scoring.config';

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface ListeningScoreResult {
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  bandScore: number;
  feedback: string;
  performanceLevel: 'excellent' | 'very-good' | 'good' | 'fair' | 'needs-improvement';
}

export interface ListeningBandDescriptor {
  band: number;
  minCorrect: number; // For 40-question test
  description: string;
  level: string;
}

// ═══════════════════════════════════════════════════════════════
// IELTS LISTENING BAND DESCRIPTORS
// ═══════════════════════════════════════════════════════════════

/**
 * Official IELTS Listening band score descriptors
 * Based on standard 40-question IELTS Listening test
 * 
 * NOTE: Listening and Reading have IDENTICAL band score tables
 */
export const LISTENING_BAND_DESCRIPTORS: ListeningBandDescriptor[] = [
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
 * Calculate comprehensive Listening test score with band score and feedback
 * @param correctCount - Number of correct answers
 * @param totalQuestions - Total number of questions
 * @returns Complete score result with band score and feedback
 */
export function calculateListeningScore(
  correctCount: number,
  totalQuestions: number
): ListeningScoreResult {
  // Calculate percentage
  const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
  
  // Calculate IELTS band score using official table
  // NOTE: Listening and Reading use the same calculation formula
  const bandScore = calculateIELTSReadingBandScore(correctCount, totalQuestions);
  
  // Generate feedback based on percentage
  let feedback = '';
  let performanceLevel: ListeningScoreResult['performanceLevel'] = 'needs-improvement';
  
  if (percentage >= 90) {
    feedback = 'Excellent listening comprehension! You demonstrate expert-level ability.';
    performanceLevel = 'excellent';
  } else if (percentage >= 75) {
    feedback = 'Very good listening skills! You show strong comprehension of spoken English.';
    performanceLevel = 'very-good';
  } else if (percentage >= 60) {
    feedback = 'Good listening ability. Continue practicing to improve further.';
    performanceLevel = 'good';
  } else if (percentage >= 50) {
    feedback = 'Fair listening comprehension. Focus on understanding different accents and contexts.';
    performanceLevel = 'fair';
  } else {
    feedback = 'Listening skills need improvement. Practice with various audio materials and focus on key information.';
    performanceLevel = 'needs-improvement';
  }
  
  return {
    correctCount,
    totalQuestions,
    percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
    bandScore,
    feedback,
    performanceLevel,
  };
}

/**
 * Get band descriptor for a specific band score
 * @param bandScore - IELTS band score (0.5 to 9.0)
 * @returns Band descriptor with level and description
 */
export function getBandDescriptor(bandScore: number): ListeningBandDescriptor | null {
  return LISTENING_BAND_DESCRIPTORS.find(d => d.band === bandScore) || null;
}

/**
 * Get minimum correct answers needed for a target band
 * @param targetBand - Target IELTS band score
 * @returns Minimum number of correct answers needed
 */
export function getMinCorrectForBand(targetBand: number): number {
  const descriptor = getBandDescriptor(targetBand);
  return descriptor ? descriptor.minCorrect : 0;
}

/**
 * Calculate how many more correct answers needed for next band level
 * @param currentCorrect - Current number of correct answers
 * @param currentBand - Current band score
 * @returns Object with next band info and answers needed
 */
export function getNextBandRequirement(
  currentCorrect: number,
  currentBand: number
): {
  nextBand: number | null;
  answersNeeded: number;
  nextBandDescription: string;
} {
  // Find next higher band
  const sortedBands = [...LISTENING_BAND_DESCRIPTORS].sort((a, b) => a.band - b.band);
  const nextBandDescriptor = sortedBands.find(d => d.band > currentBand);
  
  if (!nextBandDescriptor) {
    return {
      nextBand: null,
      answersNeeded: 0,
      nextBandDescription: 'You are at the highest band level!',
    };
  }
  
  const answersNeeded = nextBandDescriptor.minCorrect - currentCorrect;
  
  return {
    nextBand: nextBandDescriptor.band,
    answersNeeded: Math.max(0, answersNeeded),
    nextBandDescription: nextBandDescriptor.description,
  };
}

/**
 * Generate detailed performance feedback with actionable tips
 * @param result - Listening score result
 * @returns Detailed feedback message
 */
export function generateDetailedFeedback(result: ListeningScoreResult): string {
  const { bandScore, correctCount, totalQuestions } = result;
  const descriptor = getBandDescriptor(bandScore);
  const nextBand = getNextBandRequirement(correctCount, bandScore);
  
  let feedback = `You scored ${correctCount}/${totalQuestions} (${result.percentage}%), achieving band ${bandScore}.\n\n`;
  
  if (descriptor) {
    feedback += `**${descriptor.level}**: ${descriptor.description}\n\n`;
  }
  
  if (nextBand.nextBand) {
    feedback += `**Next Goal**: Get ${nextBand.answersNeeded} more correct answer(s) to reach band ${nextBand.nextBand}.\n`;
    feedback += `(${nextBand.nextBandDescription})\n\n`;
  }
  
  // Add skill-specific tips based on performance
  feedback += '**Tips for Improvement:**\n';
  
  if (result.performanceLevel === 'excellent') {
    feedback += '- Maintain your skills by listening to authentic English materials\n';
    feedback += '- Focus on different accents (British, American, Australian)\n';
    feedback += '- Try advanced materials like academic lectures and debates\n';
  } else if (result.performanceLevel === 'very-good') {
    feedback += '- Practice listening for specific details and main ideas\n';
    feedback += '- Work on understanding different accents and speaking speeds\n';
    feedback += '- Practice note-taking while listening\n';
  } else if (result.performanceLevel === 'good') {
    feedback += '- Listen to a variety of English audio (podcasts, news, conversations)\n';
    feedback += '- Focus on understanding context and implied meaning\n';
    feedback += '- Practice predicting what comes next\n';
  } else if (result.performanceLevel === 'fair') {
    feedback += '- Start with slower, clearer audio materials\n';
    feedback += '- Focus on understanding main ideas first\n';
    feedback += '- Practice listening for key words and phrases\n';
  } else {
    feedback += '- Begin with basic conversations and familiar topics\n';
    feedback += '- Use subtitles initially, then try without\n';
    feedback += '- Focus on understanding one idea at a time\n';
    feedback += '- Practice daily for 15-20 minutes\n';
  }
  
  return feedback;
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON SERVICE CLASS (Optional)
// ═══════════════════════════════════════════════════════════════

/**
 * Listening Scoring Service (Singleton)
 * Provides a centralized service for all Listening scoring operations
 */
export class ListeningScoringService {
  private static instance: ListeningScoringService;
  
  private constructor() {}
  
  public static getInstance(): ListeningScoringService {
    if (!ListeningScoringService.instance) {
      ListeningScoringService.instance = new ListeningScoringService();
    }
    return ListeningScoringService.instance;
  }
  
  /**
   * Calculate score for a Listening test
   */
  public calculateScore(correctCount: number, totalQuestions: number): ListeningScoreResult {
    return calculateListeningScore(correctCount, totalQuestions);
  }
  
  /**
   * Get band descriptor
   */
  public getBandDescriptor(bandScore: number): ListeningBandDescriptor | null {
    return getBandDescriptor(bandScore);
  }
  
  /**
   * Get all band descriptors
   */
  public getAllBandDescriptors(): ListeningBandDescriptor[] {
    return LISTENING_BAND_DESCRIPTORS;
  }
  
  /**
   * Get next band requirement
   */
  public getNextBandRequirement(currentCorrect: number, currentBand: number) {
    return getNextBandRequirement(currentCorrect, currentBand);
  }
  
  /**
   * Generate detailed feedback
   */
  public generateDetailedFeedback(result: ListeningScoreResult): string {
    return generateDetailedFeedback(result);
  }
}

// Export singleton instance
export const listeningScoring = ListeningScoringService.getInstance();

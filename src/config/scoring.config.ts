/**
 * Scoring Configuration
 * Centralized configuration for test scoring system
 * 
 * Features:
 * - Configurable point values per question type
 * - Partial credit percentages
 * - Band score thresholds (IELTS-style)
 * - Custom scoring rules
 */

/**
 * Default point values for each question type
 */
export interface QuestionTypePoints {
  'multiple-choice': number;
  'multiple-select': number;
  'completion': number;
  'matching': number;
  'diagram-labeling': number;
  'true-false-not-given': number;
  'yes-no-not-given': number;
}

/**
 * Partial credit configuration
 */
export interface PartialCreditConfig {
  'multiple-select': {
    correctWeight: number;      // Weight for each correct answer (0-1)
    incorrectPenalty: number;    // Penalty for each incorrect answer (0-1)
    minScore: number;            // Minimum score (0-1)
  };
  'diagram-labeling': {
    perLabelWeight: number;      // Weight per correct label (0-1)
    minScore: number;
  };
}

/**
 * IELTS Band Score thresholds (percentage to band score mapping)
 */
export interface BandScoreThresholds {
  [key: number]: number; // percentage -> band score
}

/**
 * Complete scoring configuration
 */
export interface ScoringConfig {
  defaultPoints: QuestionTypePoints;
  partialCredit: PartialCreditConfig;
  bandScoreThresholds: BandScoreThresholds;
  passPercentage: number;
  maxBandScore: number;
  roundingPrecision: number;
}

/**
 * Default scoring configuration
 * Can be overridden per test or globally
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  // Default points per question type
  defaultPoints: {
    'multiple-choice': 10,
    'multiple-select': 10,
    'completion': 10,
    'matching': 10,
    'diagram-labeling': 10,
    'true-false-not-given': 10,
    'yes-no-not-given': 10,
  },
  
  // Partial credit rules
  partialCredit: {
    'multiple-select': {
      correctWeight: 1.0,      // Full credit for each correct answer
      incorrectPenalty: 0.5,   // Half point penalty for each wrong answer
      minScore: 0,             // No negative scores
    },
    'diagram-labeling': {
      perLabelWeight: 1.0,     // Equal weight per label
      minScore: 0,
    },
  },
  
  // IELTS Band Score thresholds
  bandScoreThresholds: {
    97: 9.0,
    94: 8.5,
    90: 8.0,
    87: 7.5,
    83: 7.0,
    79: 6.5,
    75: 6.0,
    70: 5.5,
    65: 5.0,
    60: 4.5,
    55: 4.0,
    50: 3.5,
    45: 3.0,
    40: 2.5,
    35: 2.0,
    30: 1.5,
    25: 1.0,
    0: 0.5,
  },
  
  // General settings
  passPercentage: 60,
  maxBandScore: 9.0,
  roundingPrecision: 2,
};

/**
 * Get scoring configuration for a specific test
 * Can be customized per test by loading from database
 */
export function getScoringConfig(_testId?: string): ScoringConfig {
  // In the future, this could load custom config from Firebase based on testId
  // For now, return default config
  return DEFAULT_SCORING_CONFIG;
}

/**
 * Calculate points for a question based on config
 */
export function getQuestionPoints(
  questionType: keyof QuestionTypePoints,
  customPoints?: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number {
  // Use custom points if provided, otherwise use default for type
  return customPoints !== undefined 
    ? customPoints 
    : config.defaultPoints[questionType];
}

/**
 * Calculate IELTS Reading band score from correct answer count
 * Uses official IELTS Reading scoring table (for 40 questions)
 * 
 * @param correctCount - Number of correct answers
 * @param totalQuestions - Total number of questions (defaults to 40)
 * @returns Band score (0.5 to 9.0)
 */
export function calculateIELTSReadingBandScore(
  correctCount: number,
  totalQuestions: number = 40
): number {
  // If test has 40 questions, use official IELTS Reading table
  if (totalQuestions === 40) {
    if (correctCount >= 40) return 9.0;
    if (correctCount >= 39) return 8.5;
    if (correctCount >= 37) return 8.0;
    if (correctCount >= 36) return 7.5;
    if (correctCount >= 34) return 7.0;
    if (correctCount >= 32) return 6.5;
    if (correctCount >= 30) return 6.0;
    if (correctCount >= 27) return 5.5;
    if (correctCount >= 23) return 5.0;
    if (correctCount >= 19) return 4.5;
    if (correctCount >= 15) return 4.0;
    if (correctCount >= 12) return 3.5;
    if (correctCount >= 9) return 3.0;
    if (correctCount >= 6) return 2.5;
    if (correctCount >= 4) return 2.0;
    if (correctCount >= 2) return 1.5;
    if (correctCount >= 1) return 1.0;
    return 0.5;
  }
  
  // For non-40 question tests, scale proportionally
  // Convert to equivalent 40-question score, then use IELTS table
  const scaledScore = Math.round((correctCount / totalQuestions) * 40);
  return calculateIELTSReadingBandScore(scaledScore, 40);
}

/**
 * Calculate band score from percentage using configured thresholds
 * @deprecated Use calculateIELTSReadingBandScore for accurate IELTS scoring
 */
export function calculateBandScoreFromConfig(
  percentage: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number {
  const thresholds = config.bandScoreThresholds;
  
  // Sort thresholds in descending order
  const sortedThresholds = Object.entries(thresholds)
    .map(([perc, band]) => ({ percentage: Number(perc), band: Number(band) }))
    .sort((a, b) => b.percentage - a.percentage);
  
  // Find the appropriate band score
  for (const { percentage: threshold, band } of sortedThresholds) {
    if (percentage >= threshold) {
      return band;
    }
  }
  
  // Default to lowest band
  return 0.5;
}

/**
 * Check if a score passes based on config
 */
export function isPassingScore(
  percentage: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): boolean {
  return percentage >= config.passPercentage;
}

/**
 * Get partial credit config for a question type
 */
export function getPartialCreditConfig(
  questionType: 'multiple-select' | 'diagram-labeling',
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
) {
  return config.partialCredit[questionType];
}

/**
 * Custom scoring configuration builder
 * Allows creating custom configs for specific tests
 */
export class ScoringConfigBuilder {
  private config: ScoringConfig;
  
  constructor(baseConfig: ScoringConfig = DEFAULT_SCORING_CONFIG) {
    this.config = JSON.parse(JSON.stringify(baseConfig)); // Deep copy
  }
  
  /**
   * Set points for a specific question type
   */
  setQuestionTypePoints(type: keyof QuestionTypePoints, points: number): this {
    this.config.defaultPoints[type] = points;
    return this;
  }
  
  /**
   * Set pass percentage
   */
  setPassPercentage(percentage: number): this {
    this.config.passPercentage = percentage;
    return this;
  }
  
  /**
   * Set partial credit weight for multiple-select
   */
  setMultipleSelectWeights(correct: number, penalty: number): this {
    this.config.partialCredit['multiple-select'].correctWeight = correct;
    this.config.partialCredit['multiple-select'].incorrectPenalty = penalty;
    return this;
  }
  
  /**
   * Set custom band score threshold
   */
  setBandScoreThreshold(percentage: number, bandScore: number): this {
    this.config.bandScoreThresholds[percentage] = bandScore;
    return this;
  }
  
  /**
   * Build and return the configuration
   */
  build(): ScoringConfig {
    return this.config;
  }
}

/**
 * Example: Create a custom scoring config for a difficult test
 */
export function createHardTestConfig(): ScoringConfig {
  return new ScoringConfigBuilder()
    .setPassPercentage(50) // Lower pass threshold
    .setBandScoreThreshold(80, 7.0) // More generous band scores
    .setBandScoreThreshold(70, 6.0)
    .setBandScoreThreshold(60, 5.0)
    .build();
}

/**
 * Example: Create a custom scoring config for an easy test
 */
export function createEasyTestConfig(): ScoringConfig {
  return new ScoringConfigBuilder()
    .setPassPercentage(70) // Higher pass threshold
    .setBandScoreThreshold(95, 7.0) // Stricter band scores
    .setBandScoreThreshold(85, 6.0)
    .setBandScoreThreshold(75, 5.0)
    .build();
}

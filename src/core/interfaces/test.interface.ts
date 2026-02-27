/**
 * Core Test Interfaces
 * Extensible base interfaces for multi-skill test system
 */

// Base test types that can be extended
export type TestType = 'IELTS' | 'TOEFL' | 'SAT' | 'GRE' | 'GMAT' | 'Custom';
export type TestSkill = 'Reading' | 'Listening' | 'Writing' | 'Speaking' | 'Mixed';
export type Difficulty = 'Beginner' | 'Elementary' | 'Intermediate' | 'Upper-Intermediate' | 'Advanced' | 'Expert';

// Tag system for test organization
export interface TestTag {
  id: string;
  name: string;
  color?: string;
  category?: 'topic' | 'skill' | 'level' | 'format' | 'custom';
  parentId?: string; // For hierarchical tags
}

// Base test interface - all test types implement this
export interface BaseTest {
  id: string;
  title: string;
  type: TestType;
  skills: TestSkill[]; // Array to support mixed-skill tests
  primarySkill: TestSkill;
  duration: number; // Total duration in minutes
  difficulty: Difficulty;
  questionCount: number;
  
  // Metadata
  metadata: TestMetadata;
  
  // Organization
  tags: string[]; // Tag IDs
  categories?: string[];
  
  // Timestamps
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  lastModifiedBy?: string;
  
  // Status
  isPublished: boolean;
  isDraft?: boolean;
  isTemplate?: boolean;
  
  // Composite test support
  isComposite?: boolean;
  componentTests?: string[]; // IDs of component tests
  
  // Settings
  settings: TestSettings;
  
  // Statistics
  statistics: TestStatistics;
}

export interface TestMetadata {
  description: string;
  instructions: string;
  tags: string[];
  targetScore?: string;
  estimatedScore?: string;
  objectives?: string[];
  prerequisites?: string[];
  resources?: TestResource[];
  version?: string;
}

export interface TestResource {
  type: 'audio' | 'video' | 'document' | 'image' | 'external-link';
  url: string;
  title?: string;
  duration?: number; // For audio/video
  required?: boolean;
}

export interface TestSettings {
  // Timing
  allowPause: boolean;
  showTimer: boolean;
  timePerSection?: number[]; // For multi-section tests
  
  // Question flow
  shuffleQuestions: boolean;
  shuffleSections?: boolean;
  allowNavigation: boolean; // Can go back to previous questions
  allowSkipping: boolean;
  
  // Results
  showResults: 'immediate' | 'after-submission' | 'after-review' | 'never';
  showCorrectAnswers: boolean;
  allowReview: boolean;
  showExplanations: boolean;
  
  // Scoring
  passingScore: number;
  scoringMethod: 'standard' | 'weighted' | 'adaptive' | 'custom';
  partialCredit?: boolean;
  negativePenalty?: boolean; // For incorrect answers
  
  // Attempts
  maxAttempts?: number;
  retakeDelay?: number; // Hours between attempts
  
  // Accessibility
  enableTextToSpeech?: boolean;
  highContrast?: boolean;
  fontSize?: 'small' | 'medium' | 'large' | 'extra-large';
}

export interface TestStatistics {
  attempts: number;
  averageScore: number;
  averageTime: number;
  completionRate: number;
  passRate?: number;
  medianScore?: number;
  scoreDistribution?: Record<string, number>;
  difficultyIndex?: number; // 0-1, calculated from results
  lastAttemptDate?: number;
}

// Skill-specific test extensions
export interface ReadingTest extends BaseTest {
  primarySkill: 'Reading';
  passages: ReadingPassage[];
  questions: ReadingQuestion[];
  readingSpeed?: number; // Words per minute recommendation
}

export interface ListeningTest extends BaseTest {
  primarySkill: 'Listening';
  audioTracks: AudioTrack[];
  sections: ListeningSection[];
  questions: ListeningQuestion[];
  playbackRules: PlaybackRules;
}

export interface WritingTest extends BaseTest {
  primarySkill: 'Writing';
  tasks: WritingTask[];
  rubric: WritingRubric;
  wordLimits: { min: number; max: number }[];
  allowedTools?: ('spellcheck' | 'grammar' | 'dictionary')[];
}

export interface SpeakingTest extends BaseTest {
  primarySkill: 'Speaking';
  parts: SpeakingPart[];
  recordingSettings: RecordingSettings;
  rubric: SpeakingRubric;
}

// Composite test for mixed skills
export interface CompositeTest extends BaseTest {
  skills: TestSkill[];
  sections: TestSection[];
  transitionRules?: TransitionRules;
  overallScoring: CompositeScoring;
}

export interface TestSection {
  id: string;
  skill: TestSkill;
  testId?: string; // Reference to existing test
  duration: number;
  questionCount: number;
  weight: number; // For scoring
  order: number;
  isOptional?: boolean;
  unlockCondition?: string; // Expression to evaluate
}

export interface TransitionRules {
  autoAdvance: boolean;
  breakBetweenSections?: number; // Minutes
  showProgress: boolean;
  allowSectionReview: boolean;
}

export interface CompositeScoring {
  method: 'average' | 'weighted' | 'minimum' | 'custom';
  weights?: Record<TestSkill, number>;
  minimumPerSection?: number;
  customFormula?: string;
}

// Template system for reusable test structures
export interface TestTemplate {
  id: string;
  name: string;
  description: string;
  type: TestType;
  skills: TestSkill[];
  structure: TemplateStructure;
  defaultSettings: Partial<TestSettings>;
  tags: string[];
  isPublic: boolean;
  usageCount: number;
}

export interface TemplateStructure {
  sections: TemplateSection[];
  totalDuration: number;
  totalQuestions: number;
  difficultyProgression?: 'flat' | 'ascending' | 'descending' | 'adaptive';
}

export interface TemplateSection {
  name: string;
  skill: TestSkill;
  questionTypes: string[];
  questionCount: number | { min: number; max: number };
  duration: number | { min: number; max: number };
  difficulty?: Difficulty;
}

// Session extensions for different test types
export interface TestSession {
  id: string;
  code: string;
  testId: string;
  testType: TestType;
  skills: TestSkill[];
  mode: 'practice' | 'exam' | 'diagnostic';
  status: 'waiting' | 'in-progress' | 'paused' | 'completed' | 'expired';
  
  // Participant management
  participants: TestParticipant[];
  maxParticipants?: number;
  
  // Timing
  scheduledStart?: number;
  actualStart?: number;
  endTime?: number;
  
  // Proctoring
  proctoring?: ProctoringSettings;
}

export interface TestParticipant {
  id: string;
  name: string;
  email?: string;
  status: 'waiting' | 'active' | 'submitted' | 'disconnected';
  currentSection?: string;
  currentQuestion?: number;
  progress: Record<TestSkill, number>; // Progress per skill
  startTime: number;
  lastActivity: number;
  answers: Record<string, any>; // Flexible for different answer types
}

export interface ProctoringSettings {
  enabled: boolean;
  requireCamera?: boolean;
  requireScreenShare?: boolean;
  lockBrowser?: boolean;
  detectTabSwitch?: boolean;
  aiMonitoring?: boolean;
}

// Export type guards for runtime checking
export const isReadingTest = (test: BaseTest): test is ReadingTest => 
  test.primarySkill === 'Reading';

export const isListeningTest = (test: BaseTest): test is ListeningTest => 
  test.primarySkill === 'Listening';

export const isWritingTest = (test: BaseTest): test is WritingTest => 
  test.primarySkill === 'Writing';

export const isSpeakingTest = (test: BaseTest): test is SpeakingTest => 
  test.primarySkill === 'Speaking';

export const isCompositeTest = (test: BaseTest): test is CompositeTest => 
  test.isComposite === true;

// Re-export specific interfaces from skill modules
export type { ReadingPassage, ReadingQuestion } from '../../skills/reading/types';
export type { AudioTrack, ListeningSection, ListeningQuestion, PlaybackRules } from '../../skills/listening/types';
export type { WritingTask, WritingRubric } from '../../skills/writing/types';
export type { SpeakingPart, RecordingSettings, SpeakingRubric } from '../../skills/speaking/types';

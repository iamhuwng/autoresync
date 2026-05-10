/**
 * Text chunk for processing
 */
export interface Chunk {
  id: string;
  number: number;
  text: string;
  wordCount: number;
  startIndex: number;
  endIndex: number;
  isLast: boolean;
}

/**
 * Chunk processing progress
 */
export interface ChunkProgress {
  current: number;
  total: number;
  percentage: number;
}

/**
 * Detected passage from document
 */
export interface Passage {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'image' | 'both';
  imageUrl?: string;
  caption?: string;
  questionStart: number;
  questionEnd: number;
  wordCount: number;
  createdAt: string;
  questionRange?: {
    start: number;
    end: number;
  };
}

/**
 * Supported question types (all 16 IELTS task types)
 */
export type QuestionType =
  | 'multiple-choice'
  | 'multiple-select'
  | 'sentence-completion'
  | 'summary-completion-text'
  | 'summary-completion-list'
  | 'note-completion'
  | 'table-completion'
  | 'flowchart-completion'
  | 'diagram-labeling'
  | 'true-false-not-given'
  | 'yes-no-not-given'
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'matching-sentence-endings'
  | 'short-answer'
  | 'completion'  // Legacy fallback
  | 'matching';   // Legacy fallback

/** Canonical label formats used by Reading option lists */
export type ReadingOptionLabelFormat = 'letter' | 'roman' | 'number';

/** Structured option used by canonical Reading questions */
export interface ReadingLabeledOption {
  label: string;
  text: string;
}

/** Section reference used by matching-information questions */
export interface ReadingSectionReference {
  label: string;
  title?: string;
  paragraph?: string;
}

/**
 * Answer source tracking for parity
 */
export type AnswerSource = 'answer-key' | 'ai-suggestion';

/**
 * Parsed question structure
 */
export interface ParsedQuestion {
  id: string;
  number: number;
  questionNumber: number;
  questionText: string;
  question: string;
  type: QuestionType;
  options?: string[];
  labeledOptions?: ReadingLabeledOption[];
  optionLabelFormat?: ReadingOptionLabelFormat;
  sectionReferences?: ReadingSectionReference[];
  answer: string | string[];
  answerSource: AnswerSource;
  originalAIAnswer?: string | string[];
  resourceId?: string;
  passageId?: string;
  confidence: number;
  timer?: number;
  points?: number;
  context?: {
    sectionHeading?: string;
    subsectionLabel?: string;
    contextLines?: string[];
    currentLineIndex?: number;
  };

  // Metadata
  wordLimit?: number;
  acceptableAnswers?: string[];
  includesNumber?: boolean;
  sectionInstructionId?: string;
  groupId?: string;
  blankId?: string;
  anchorId?: string;
  groupTaskType?: 'table-completion';
  tableGroupSchemaVersion?: number;
  pendingTableReclassification?: boolean;

  // Matching question formats (both individual and grouped)
  items?: any[];        // For grouped matching (items to match)
  answers?: any;        // For grouped matching (item-to-option mappings)

  // Diagram labeling
  imageUrl?: string;    // Image URL for diagram questions
  labels?: Array<{      // Label definitions
    id: string;
    answer: string;
    x?: number;
    y?: number;
  }>;
}

/**
 * Complete parsed document
 */
export interface ParsedDocument {
  passages: Passage[];
  questions: ParsedQuestion[];
  answerKey: Record<number, string | string[]>;
  metadata: {
    totalWords: number;
    passageCount: number;
    questionCount: number;
    parsedAt: Date;
  };
}

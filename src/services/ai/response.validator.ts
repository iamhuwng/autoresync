import { z } from 'zod';
import type { Result } from '../../types/result.types';
import type { AIParseResult } from './ai.service';

/**
 * Zod schema for AI passage
 * Made more lenient to handle AI responses
 */
const AIPassageSchema = z.object({
  id: z.string().default('passage-1'),
  title: z.string().default('Untitled Passage'),
  content: z.string(),
  type: z.enum(['text', 'image', 'both']).default('text'),
  imageUrl: z.string().nullable().optional(),
  questionStart: z.coerce.number().int().min(1).nullable().default(1),
  questionEnd: z.coerce.number().int().min(1).nullable().default(1),
  wordCount: z.coerce.number().int().min(0).nullable().default(0),
});

/**
 * Zod schema for AI question context (IELTS)
 * DEFENSE IN DEPTH: Accept string (section heading), object, null, or undefined
 * This handles cases where AI returns "Questions 1-6" instead of structured object
 */
const QuestionContextSchema = z.union([
  z.string(),  // Accept plain string like "Questions 1-6"
  z.object({   // Or structured object
    sectionHeading: z.string().nullable().optional(),
    subsectionLabel: z.string().nullable().optional(),
    contextLines: z.array(z.string()).nullable().optional(),
    currentLineIndex: z.number().int().min(0).nullable().optional(),
  }),
  z.null(),      // Or explicit null
  z.undefined(), // Or missing
]).nullable().optional();

/**
 * Zod schema for AI question
 */
const AIQuestionSchema = z.object({
  questionNumber: z.number().int().min(1),
  questionText: z.string().min(0),  // Allow empty for summary-completion-list (full paragraph in 1st question)
  type: z.enum([
    // Completion types (7)
    'sentence-completion',
    'summary-completion-text',
    'summary-completion-list',
    'note-completion',
    'table-completion',
    'flowchart-completion',
    'diagram-labeling',
    // True/False types (2)
    'true-false-not-given',
    'yes-no-not-given',
    // Matching types (4)
    'matching-headings',
    'matching-information',
    'matching-features',
    'matching-sentence-endings',
    // Choice types (2)
    'multiple-choice',
    'multiple-select',
    // Short answer (1)
    'short-answer',
    // Legacy generic types (for backward compatibility with older AI responses)
    'completion',
    'matching',
  ]),
  options: z.array(z.string()).nullable().optional(),
  summaryGroupId: z.string().optional(),
  answer: z.union([z.string(), z.array(z.string())]),
  passageId: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100).optional().default(0),
  sectionInstruction: z.string().nullable().optional(),
  context: QuestionContextSchema,
  originalAIAnswer: z.union([z.string(), z.array(z.string())]).nullable().optional(),
});

/**
 * Zod schema for answer key
 */
const AnswerKeySchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())])
);

/**
 * Zod schema for AI parse result (combined)
 */
const AIParseResultSchema = z.object({
  passages: z.array(AIPassageSchema),
  questions: z.array(AIQuestionSchema),
  answerKey: AnswerKeySchema.optional().default({}),
  confidence: z.number().min(0).max(100).optional().default(0),
});

/**
 * Zod schema for passages-only response (2-call split parsing - Call 1)
 */
const AIPassagesOnlySchema = z.object({
  passages: z.array(AIPassageSchema),
  confidence: z.number().min(0).max(100).optional().default(0),
});

/**
 * Zod schema for questions+answers response (2-call split parsing - Call 2)
 */
const AIQuestionsAndAnswersSchema = z.object({
  questions: z.array(AIQuestionSchema),
  answerKey: AnswerKeySchema.optional().default({}),
  confidence: z.number().min(0).max(100).optional().default(0),
});

/**
 * Validate AI response (combined passages + questions + answers)
 */
export const validateAIResponse = (data: unknown): Result<AIParseResult> => {
  try {
    const result = AIParseResultSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) =>
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');

      return {
        success: false,
        error: `Validation failed: ${issues}`,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
};

/**
 * Validate passages-only response (2-call split parsing - Call 1)
 */
export const validatePassagesOnly = (data: unknown): Result<{
  passages: AIParseResult['passages'];
  confidence: number;
}> => {
  try {
    const result = AIPassagesOnlySchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) =>
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');

      return {
        success: false,
        error: `Passages validation failed: ${issues}`,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
};

/**
 * Validate questions+answers response (2-call split parsing - Call 2)
 */
export const validateQuestionsAndAnswers = (data: unknown): Result<{
  questions: AIParseResult['questions'];
  answerKey: AIParseResult['answerKey'];
  confidence: number;
}> => {
  try {
    const result = AIQuestionsAndAnswersSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) =>
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');

      return {
        success: false,
        error: `Questions+Answers validation failed: ${issues}`,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
};

/**
 * Validate and normalize question type
 * Maps AI outputs to canonical QuestionSchema types
 * 
 * IMPORTANT: This function preserves specific essence-based types!
 * It only normalizes variations/typos, NOT collapsing to generic types.
 */
export const normalizeQuestionType = (type: string): string => {
  const typeMap: Record<string, string> = {
    // === TRUE/FALSE VARIATIONS ===
    'true-false': 'true-false-not-given',
    'tfng': 'true-false-not-given',
    'true/false/not given': 'true-false-not-given',
    'yes-no': 'yes-no-not-given',
    'ynng': 'yes-no-not-given',
    'yes/no/not given': 'yes-no-not-given',

    // === COMPLETION VARIATIONS (preserve specific types) ===
    // Only map generic "completion" to sentence-completion as default
    'completion': 'sentence-completion',
    'fill-in-blank': 'sentence-completion',
    'fill-blank': 'sentence-completion',
    'gap-fill': 'sentence-completion',
    'fill-in-the-blank': 'sentence-completion',
    // Summary completion variations
    'summary-completion': 'summary-completion-text',  // Default to text version
    'summary completion': 'summary-completion-text',
    'summary-text': 'summary-completion-text',
    'summary-list': 'summary-completion-list',
    'summary-box': 'summary-completion-list',
    // Note completion variations  
    'note completion': 'note-completion',
    // Table completion variations
    'table completion': 'table-completion',
    // Flowchart variations
    'flowchart': 'flowchart-completion',
    'flow-chart': 'flowchart-completion',
    'flow chart': 'flowchart-completion',
    // Diagram variations
    'diagram': 'diagram-labeling',
    'labeling': 'diagram-labeling',
    'labelling': 'diagram-labeling',
    'diagram-label': 'diagram-labeling',
    'map-labeling': 'diagram-labeling',
    'plan-labeling': 'diagram-labeling',

    // === MATCHING VARIATIONS (preserve specific types) ===
    // Only map generic "matching" to matching-information as default
    'matching': 'matching-information',
    'match': 'matching-information',
    // Matching headings variations
    'matching-heading': 'matching-headings',
    'match-headings': 'matching-headings',
    'paragraph-headings': 'matching-headings',
    // Matching information variations
    'matching-info': 'matching-information',
    'paragraph-matching': 'matching-information',
    'locate-information': 'matching-information',
    // Matching features variations
    'matching-feature': 'matching-features',
    'match-features': 'matching-features',
    'matching-names': 'matching-features',
    'matching-people': 'matching-features',
    // Matching sentence endings variations
    'matching-endings': 'matching-sentence-endings',
    'sentence-endings': 'matching-sentence-endings',
    'matching-sentences': 'matching-sentence-endings',
    'complete-sentences': 'matching-sentence-endings',

    // === CHOICE VARIATIONS ===
    'mcq': 'multiple-choice',
    'mc': 'multiple-choice',
    'single-choice': 'multiple-choice',
    'multi-select': 'multiple-select',
    'multiple-answer': 'multiple-select',

    // === SHORT ANSWER VARIATIONS ===
    'short-answer-question': 'short-answer',
    'saq': 'short-answer',
  };

  const normalized = typeMap[type.toLowerCase()];
  return normalized || type;
};

/**
 * Normalize answer case for True/False/Not Given questions
 * Handles various case formats from AI/answer keys
 */
export const normalizeAnswer = (answer: string | string[], questionType: string): string | string[] => {
  if (questionType === 'true-false-not-given') {
    if (typeof answer === 'string') {
      const lower = answer.toLowerCase();
      if (lower === 'true' || lower === 't') return 'True';
      if (lower === 'false' || lower === 'f') return 'False';
      if (lower === 'not given' || lower === 'ng') return 'Not Given';
    }
  }

  if (questionType === 'yes-no-not-given') {
    if (typeof answer === 'string') {
      const lower = answer.toLowerCase();
      if (lower === 'yes' || lower === 'y') return 'Yes';
      if (lower === 'no' || lower === 'n') return 'No';
      if (lower === 'not given' || lower === 'ng') return 'Not Given';
    }
  }

  return answer;
};

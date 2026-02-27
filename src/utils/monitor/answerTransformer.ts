/**
 * Answer Transformer
 * 
 * Pure utility functions for transforming raw Firebase answer data
 * into the format expected by the student detail modal.
 * 
 * @module utils/monitor/answerTransformer
 */

export interface TransformedAnswer {
  questionNumber: number;
  answer: string | string[];
  timeSpent?: number;
  timestamp?: number;
}

/**
 * Transforms raw Firebase answer data into a structured format for the student detail modal.
 * 
 * Handles multiple answer formats from Firebase:
 * 1. Simple format: Just the answer value (string or array)
 * 2. Complex format: Object with answer, timeSpent, and timestamp metadata
 * 
 * @param rawAnswers - The raw answer data from Firebase
 * @returns Record mapping question numbers to TransformedAnswer objects
 * 
 * @example
 * ```typescript
 * // Simple format
 * const answers1 = transformAnswersForModal({ 1: "Answer text", 2: ["A", "B"] });
 * 
 * // Complex format
 * const answers2 = transformAnswersForModal({
 *   1: { answer: "Answer", timestamp: 1234567890, timeSpent: 5000 }
 * });
 * ```
 */
export function transformAnswersForModal(
  rawAnswers?: Record<string, any>
): Record<number, TransformedAnswer> {
  const transformedAnswers: Record<number, TransformedAnswer> = {};
  
  if (!rawAnswers || typeof rawAnswers !== 'object') {
    console.log('⚠️ [AnswerTransformer] No answers or invalid format');
    return transformedAnswers;
  }
  
  console.log('🔍 [AnswerTransformer] Processing raw answers:', rawAnswers);
  console.log('🔍 [AnswerTransformer] Answer count:', Object.keys(rawAnswers).length);
  
  Object.entries(rawAnswers).forEach(([qNum, answerData]) => {
    const questionNumber = parseInt(qNum);
    
    // Handle different answer formats from Firebase
    if (typeof answerData === 'string' || Array.isArray(answerData)) {
      // Simple answer format (just the answer value)
      transformedAnswers[questionNumber] = {
        questionNumber,
        answer: answerData,
        timeSpent: undefined,
        timestamp: undefined,
      };
    } else if (answerData && typeof answerData === 'object') {
      // Complex answer format (with metadata)
      transformedAnswers[questionNumber] = {
        questionNumber,
        answer: answerData.answer !== undefined ? answerData.answer : answerData,
        timeSpent: answerData.timeSpent,
        timestamp: answerData.timestamp,
      };
    }
  });
  
  console.log('✅ [AnswerTransformer] Transformed answers:', transformedAnswers);
  
  return transformedAnswers;
}

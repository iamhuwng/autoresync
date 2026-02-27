import type { Result } from '../types/result.types';

/**
 * Input Validation Utilities
 * Client-side validation for all user inputs
 */

export const validators = {
  /**
   * Validate quiz title
   */
  quizTitle: (title: string): Result<string> => {
    const trimmed = title.trim();
    
    if (!trimmed) {
      return { success: false, error: 'Quiz title is required' };
    }
    
    if (trimmed.length < 3) {
      return { success: false, error: 'Quiz title must be at least 3 characters' };
    }
    
    if (trimmed.length > 100) {
      return { success: false, error: 'Quiz title must be under 100 characters' };
    }
    
    return { success: true, data: trimmed };
  },

  /**
   * Validate passage content
   */
  passageContent: (content: string): Result<string> => {
    const trimmed = content.trim();
    
    if (!trimmed) {
      return { success: false, error: 'Passage content is required' };
    }
    
    if (trimmed.length < 50) {
      return { success: false, error: 'Passage must be at least 50 characters long' };
    }
    
    if (trimmed.length > 10000) {
      return { success: false, error: 'Passage is too long (max 10,000 characters)' };
    }
    
    return { success: true, data: trimmed };
  },

  /**
   * Validate passage title
   */
  passageTitle: (title: string): Result<string> => {
    const trimmed = title.trim();
    
    if (!trimmed) {
      return { success: false, error: 'Passage title is required' };
    }
    
    if (trimmed.length > 200) {
      return { success: false, error: 'Passage title must be under 200 characters' };
    }
    
    return { success: true, data: trimmed };
  },

  /**
   * Validate question range
   */
  questionRange: (start: number, end: number, maxQuestions: number = 100): Result<void> => {
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return { success: false, error: 'Question numbers must be integers' };
    }
    
    if (start < 1) {
      return { success: false, error: 'Start question must be at least 1' };
    }
    
    if (end < start) {
      return { success: false, error: 'End question must be greater than or equal to start' };
    }
    
    if (end - start + 1 > maxQuestions) {
      return { success: false, error: `Cannot have more than ${maxQuestions} questions per passage` };
    }
    
    return { success: true, data: undefined };
  },

  /**
   * Validate question text
   */
  questionText: (text: string): Result<string> => {
    const trimmed = text.trim();
    
    if (!trimmed) {
      return { success: false, error: 'Question text is required' };
    }
    
    if (trimmed.length < 10) {
      return { success: false, error: 'Question text is too short (min 10 characters)' };
    }
    
    // Check if text has any questions (look for numbers or question marks)
    const hasQuestionIndicators = /\d+\.|Question \d+|\?/.test(trimmed);
    if (!hasQuestionIndicators) {
      return {
        success: false,
        error: 'Text should contain numbered questions (e.g., "1. Question text?")',
      };
    }
    
    return { success: true, data: trimmed };
  },

  /**
   * Validate answer key text
   */
  answerKeyText: (text: string): Result<string> => {
    const trimmed = text.trim();
    
    if (!trimmed) {
      return { success: false, error: 'Answer key text is required' };
    }
    
    if (trimmed.length < 5) {
      return { success: false, error: 'Answer key text is too short' };
    }
    
    // Check if text has answer indicators
    const hasAnswerIndicators = /\d+\s*[\.\:\|\-]|Question \d+/.test(trimmed);
    if (!hasAnswerIndicators) {
      return {
        success: false,
        error: 'Text should contain numbered answers (e.g., "1. A" or "1 | A")',
      };
    }
    
    return { success: true, data: trimmed };
  },

  /**
   * Validate file size
   */
  fileSize: (size: number, maxSizeMB: number = 10): Result<void> => {
    const maxBytes = maxSizeMB * 1024 * 1024;
    
    if (size === 0) {
      return { success: false, error: 'File is empty' };
    }
    
    if (size > maxBytes) {
      return {
        success: false,
        error: `File is too large (max ${maxSizeMB}MB). Current size: ${(size / 1024 / 1024).toFixed(2)}MB`,
      };
    }
    
    return { success: true, data: undefined };
  },

  /**
   * Validate file type
   */
  fileType: (filename: string, allowedExtensions: string[]): Result<void> => {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    if (!extension) {
      return { success: false, error: 'File has no extension' };
    }
    
    if (!allowedExtensions.includes(extension)) {
      return {
        success: false,
        error: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`,
      };
    }
    
    return { success: true, data: undefined };
  },

  /**
   * Validate email
   */
  email: (email: string): Result<string> => {
    const trimmed = email.trim();
    
    if (!trimmed) {
      return { success: false, error: 'Email is required' };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { success: false, error: 'Invalid email format' };
    }
    
    return { success: true, data: trimmed };
  },

  /**
   * Validate URL
   */
  url: (url: string): Result<string> => {
    const trimmed = url.trim();
    
    if (!trimmed) {
      return { success: false, error: 'URL is required' };
    }
    
    try {
      new URL(trimmed);
      return { success: true, data: trimmed };
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }
  },

  /**
   * Validate non-empty array
   */
  nonEmptyArray: <T>(array: T[], itemName: string): Result<T[]> => {
    if (!Array.isArray(array)) {
      return { success: false, error: `${itemName} must be an array` };
    }
    
    if (array.length === 0) {
      return { success: false, error: `At least one ${itemName} is required` };
    }
    
    return { success: true, data: array };
  },

  /**
   * Validate confidence score
   */
  confidence: (score: number): Result<number> => {
    if (typeof score !== 'number') {
      return { success: false, error: 'Confidence must be a number' };
    }
    
    if (score < 0 || score > 100) {
      return { success: false, error: 'Confidence must be between 0 and 100' };
    }
    
    return { success: true, data: score };
  },
};

/**
 * Batch validation helper
 * Validates multiple fields and returns all errors
 */
export function validateMultiple(
  validations: Array<{ field: string; result: Result<any> }>
): Result<void> {
  const errors: string[] = [];

  for (const validation of validations) {
    if (!validation.result.success) {
      errors.push(`${validation.field}: ${validation.result.error}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join(', ') };
  }

  return { success: true, data: undefined };
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  const temp = document.createElement('div');
  temp.textContent = html;
  return temp.innerHTML;
}

/**
 * Validate and sanitize user input
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  return input.trim().slice(0, maxLength);
}

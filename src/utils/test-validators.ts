
import { TestMetadata } from '../config/test.config';
import { Passage, ParsedQuestion } from '../types/document.types';

export const validateMetadata = (metadata: TestMetadata): { isValid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};

    if (!metadata.title.trim()) {
        errors.title = 'Test title is required';
    }

    if (metadata.duration < 1 || metadata.duration > 180) {
        errors.duration = 'Duration must be between 1 and 180 minutes';
    }

    // Add more specific validations if needed (e.g. valid bands)

    return {
        isValid: Object.keys(errors).length === 0,
        errors,
    };
};

export const validateTestContent = (
    passages: Passage[],
    questions: ParsedQuestion[],
    metadata: TestMetadata // Pass metadata for type-specific validation
): { valid: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const questionCount = questions.length;
    const passageCount = passages.length;

    // General Validation
    if (questionCount === 0) {
        errors.push('No questions found in the document');
    }

    // IELTS Validation Rules
    if (metadata.type === 'IELTS') {
        if (metadata.skill === 'Reading') {
            if (questionCount !== 40) warnings.push(`IELTS Reading typically requires exactly 40 questions (found ${questionCount})`);
            if (passageCount !== 3) warnings.push(`IELTS Reading typically has 3 passages (found ${passageCount})`);
        } else if (metadata.skill === 'Listening') {
            if (questionCount !== 40) warnings.push(`IELTS Listening typically requires exactly 40 questions (found ${questionCount})`);
            if (passageCount !== 4) warnings.push(`IELTS Listening typically has 4 sections (found ${passageCount})`);
        }
    }

    // Basic Sanity Checks
    const questionNumbers = questions.map(q => q.number).filter(n => n !== undefined);
    if (questionNumbers.length > 0) {
        if (Math.min(...questionNumbers) !== 1) warnings.push('Question numbering should start at 1');
        if (Math.max(...questionNumbers) !== questionCount) warnings.push('Question numbering mismatch with count');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
};

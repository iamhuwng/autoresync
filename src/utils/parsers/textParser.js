/**
 * textParser.js - Stub Implementation
 * 
 * @deprecated This file is a stub. The original textParser was deleted in PRD-0020.
 * Legacy components that still import this file will get a basic implementation.
 * 
 * For new development, use:
 * - src/services/test-creation/type-classifier.service.ts (rule-based parsing)
 * - src/services/test-creation/ai-extractor.service.ts (AI parsing)
 */

/**
 * Parse text into quiz format
 * @deprecated Use new test-creation services instead
 * @param {string} text - Text to parse
 * @returns {Object} Parsed quiz result
 */
export function parseTextToQuiz(text) {
    console.warn('[textParser] Using deprecated stub. Migrate to new test-creation services.');

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return {
            success: false,
            error: 'No text provided',
            confidence: 0,
            quiz: { questions: [] }
        };
    }

    // Basic regex parsing for questions
    const questions = [];
    const questionPattern = /(\d+)\.\s*(.+?)(?=\n\d+\.|$)/gs;
    let match;

    while ((match = questionPattern.exec(text)) !== null) {
        const questionNum = parseInt(match[1], 10);
        const questionContent = match[2].trim();

        questions.push({
            id: `q-${Date.now()}-${questionNum}`,
            number: questionNum,
            questionNumber: questionNum,
            question: questionContent,
            questionText: questionContent,
            type: 'short-answer',
            answer: '',
            options: [],
            confidence: 0.5
        });
    }

    return {
        success: questions.length > 0,
        confidence: questions.length > 0 ? 50 : 0,
        quiz: {
            questions,
            metadata: {
                source: 'textParser-stub',
                deprecated: true
            }
        },
        error: questions.length === 0 ? 'No questions detected. Please check the format.' : undefined
    };
}

export default { parseTextToQuiz };

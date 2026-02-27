/**
 * Listening Router
 * 
 * Dedicated router for IELTS Listening test parsing.
 * Extracted from parser.router.ts to preserve listening functionality
 * while the main parser system is being replaced.
 * 
 * @module listening.router
 * @date 2026-02-05
 * @see PRD-0020 Task 0.9
 */

import { listeningParser } from './listening.parser';
import type { ParsedQuestion } from '../../types/document.types';
import type { Result } from '../../types/result.types';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Test format hints for parser selection
 */
export type TestFormat = 'IELTS' | 'TOEFL' | 'Cambridge' | 'Custom' | 'unknown';

/**
 * Progress callback type
 */
export type ProgressCallback = (stage: string, progress: number) => void;

/**
 * Unified parse result for listening tests
 * Uses 'any' for validation and metadata to match listeningParser's return type
 */
export interface ListeningParseResult {
    questions: ParsedQuestion[];
    sections: any[];
    totalQuestions: number;
    parseConfidence: number;
    parserUsed: 'listening';
    validation?: any;
    metadata?: any;
}

// ═══════════════════════════════════════════════════════════════
// LISTENING ROUTER
// ═══════════════════════════════════════════════════════════════

class ListeningRouter {

    /**
     * Parse Listening test text
     * 
     * @param text - Raw listening test text
     * @param format - Test format (IELTS, TOEFL, etc.)
     * @param onProgress - Optional progress callback
     * @returns Parsed listening test result
     */
    async parseListening(
        text: string,
        format: TestFormat = 'IELTS',
        onProgress?: ProgressCallback
    ): Promise<Result<ListeningParseResult>> {
        try {
            console.log(`🎧 [ListeningRouter] Parsing ${format} listening test...`);
            console.log('🎧 [ListeningRouter] Text preview:', text.substring(0, 200));

            const result = await listeningParser.parseListeningText(text, onProgress);

            console.log('🎧 [ListeningRouter] Parse complete:', {
                sections: result.sections.length,
                questions: result.questions.length,
                sectionTypes: result.sections.map(s => s.type),
                confidence: result.parseConfidence,
            });

            // Check if parser found questions
            if (result.questions.length === 0) {
                return {
                    success: false,
                    error: 'No questions detected in the listening text. Please check the format.',
                };
            }

            return {
                success: true,
                data: {
                    questions: result.questions,
                    sections: result.sections,
                    totalQuestions: result.totalQuestions,
                    parseConfidence: result.parseConfidence,
                    parserUsed: 'listening',
                    validation: result.validation,
                    metadata: result.metadata,
                },
            };
        } catch (error) {
            console.error('❌ [ListeningRouter] Parsing error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Listening parsing failed',
            };
        }
    }

    /**
     * Check if text appears to be IELTS Listening format
     * 
     * @param text - Text to check
     * @returns Whether this router can handle the text
     */
    canHandle(text: string): { canHandle: boolean; confidence: number; reason?: string } {
        return listeningParser.canHandle(text);
    }

    /**
     * Parse answer key text to number/answer map
     * 
     * Uses regex-based extraction from various formats:
     * - "1. A" style
     * - "1-10: A, B, C..." style
     * - Tabular formats
     * 
     * @param text - Answer key text
     * @returns Map of question number to answer
     */
    async parseAnswerKey(text: string): Promise<Record<number, string | string[]>> {
        console.log('🔑 [ListeningRouter] Parsing answer key...');

        // Use a simple regex-based parser for answer keys
        const answerMap: Record<number, string | string[]> = {};

        // Pattern: "1. A" or "1) A" or "1 A" or "1: A"
        const singlePattern = /^(\d+)[.)\s:]+([A-Za-z0-9]+(?:\s*[,/]\s*[A-Za-z0-9]+)*)$/gm;

        let match: RegExpExecArray | null;
        while ((match = singlePattern.exec(text)) !== null) {
            const questionNum = parseInt(match[1]!, 10);
            const answer = match[2]!.trim();

            // Check if multiple answers (comma or slash separated)
            if (answer.includes(',') || answer.includes('/')) {
                answerMap[questionNum] = answer.split(/[,/]/).map(a => a.trim());
            } else {
                answerMap[questionNum] = answer;
            }
        }

        // Pattern: "1-5: A, B, C, D, E" (range format)
        const rangePattern = /(\d+)\s*[-–]\s*(\d+)[:\s]+(.+)/gm;

        while ((match = rangePattern.exec(text)) !== null) {
            const start = parseInt(match[1]!, 10);
            const end = parseInt(match[2]!, 10);
            const answers = match[3]!.split(/[,\s]+/).filter(a => a.trim());

            for (let i = start; i <= end && i - start < answers.length; i++) {
                answerMap[i] = answers[i - start]!.trim();
            }
        }

        console.log(`🔑 [ListeningRouter] Extracted ${Object.keys(answerMap).length} answers`);
        return answerMap;
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

/**
 * Singleton instance of ListeningRouter
 * 
 * Usage:
 * ```typescript
 * import { listeningRouter } from '../services/parser/listening.router';
 * 
 * const result = await listeningRouter.parseListening(text);
 * const answerKey = await listeningRouter.parseAnswerKey(answerText);
 * ```
 */
export const listeningRouter = new ListeningRouter();


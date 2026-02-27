/**
 * THCS Question Text Parser (Phase 3, Task 8.3)
 *
 * Parses plain text into structured questions for bulk import.
 * Supports MCQ and fill-in-the-blank formats.
 */

import type { THCSQuestionType } from '../types/thcs-test.types';

export interface ParsedQuestion {
    text: string;
    type: THCSQuestionType;
    options?: string[];
    correctAnswer?: string;
    blankCount?: number;
    blankAnswers?: string[][];
}

export interface ParseError {
    line: number;
    message: string;
}

export interface ParseResult {
    questions: ParsedQuestion[];
    errors: ParseError[];
}

// ── MCQ Format Parsing ──
// Detects patterns like:
// 1. Question text
// A. Option A
// B. Option B
// C. Option C
// D. Option D
// Answer: A
// Also supports: "Câu 1:", "Question 1:", numbered with ")" etc.
function parseMCQ(text: string): ParseResult {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const questions: ParsedQuestion[] = [];
    const errors: ParseError[] = [];

    // Regex patterns
    const questionPattern = /^(?:Câu\s*|Question\s*|Q\s*)?(\d+)[.):\s]+(.+)/i;
    const optionPattern = /^([A-H])[.):\s]+(.+)/i;
    const answerPattern = /^(?:Answer|Đáp án|Key|Đáp Án)[:\s]+([A-H])/i;

    let currentQuestion: { text: string; options: string[]; lineNum: number } | null = null;
    let currentAnswer: string | undefined;

    const flushQuestion = () => {
        if (currentQuestion) {
            if (currentQuestion.options.length >= 2) {
                questions.push({
                    text: currentQuestion.text,
                    type: 'mcq-grammar',
                    options: currentQuestion.options,
                    correctAnswer: currentAnswer,
                });
            } else {
                errors.push({
                    line: currentQuestion.lineNum,
                    message: `Question has fewer than 2 options: "${currentQuestion.text.substring(0, 50)}..."`,
                });
            }
            currentQuestion = null;
            currentAnswer = undefined;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        // Check for answer line
        const answerMatch = line.match(answerPattern);
        if (answerMatch) {
            currentAnswer = answerMatch[1]!.toUpperCase();
            continue;
        }

        // Check for option line
        const optionMatch = line.match(optionPattern);
        if (optionMatch && currentQuestion) {
            currentQuestion.options.push(optionMatch[2]!.trim());
            continue;
        }

        // Check for question line
        const questionMatch = line.match(questionPattern);
        if (questionMatch) {
            flushQuestion(); // Flush previous
            currentQuestion = {
                text: questionMatch[2]!.trim(),
                options: [],
                lineNum,
            };
            continue;
        }

        // Unrecognized line — if we have a current question, append to question text
        if (currentQuestion && currentQuestion.options.length === 0) {
            currentQuestion.text += ' ' + line;
        }
    }

    flushQuestion(); // Flush last question

    return { questions, errors };
}

// ── Fill-in Format Parsing ──
// Detects patterns like:
// 1. The cat ___ on the mat.
// Answer: sat
// Also detects multiple blanks: He ___ the ___ to school.
function parseFillIn(text: string): ParseResult {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const questions: ParsedQuestion[] = [];
    const errors: ParseError[] = [];

    const questionPattern = /^(?:Câu\s*|Question\s*|Q\s*)?(\d+)[.):\s]+(.+)/i;
    const answerPattern = /^(?:Answer|Đáp án|Key|Đáp Án)[:\s]+(.+)/i;
    const blankPattern = /_{2,}|\.{3,}|\(?\s*\.\.\.\s*\)?/g;

    let currentQuestion: { text: string; lineNum: number; blankCount: number } | null = null;

    const flushQuestion = (answerText?: string) => {
        if (currentQuestion) {
            const blankAnswers: string[][] = [];
            if (answerText) {
                // Split multiple answers by "/" or "," or ";"
                const parts = answerText.split(/[/,;]/).map(s => s.trim()).filter(Boolean);
                // Each blank gets its own answer(s)
                for (let i = 0; i < currentQuestion.blankCount; i++) {
                    if (parts[i]) {
                        blankAnswers.push([parts[i] as string]);
                    }
                }
            }

            questions.push({
                text: currentQuestion.text,
                type: 'verb-form', // Closest THCSQuestionType for fill-in-blank
                blankCount: currentQuestion.blankCount || 1,
                blankAnswers: blankAnswers.length > 0 ? blankAnswers : undefined,
            });
            currentQuestion = null;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        // Check for answer line
        const answerMatch = line.match(answerPattern);
        if (answerMatch) {
            flushQuestion(answerMatch[1]?.trim());
            continue;
        }

        // Check for question line
        const questionMatch = line.match(questionPattern);
        if (questionMatch) {
            flushQuestion(); // Flush previous without answer
            const questionText = questionMatch[2]!.trim();
            const blanks = questionText.match(blankPattern);
            currentQuestion = {
                text: questionText,
                lineNum,
                blankCount: blanks ? blanks.length : 1,
            };
            continue;
        }

        // Unrecognized
        if (currentQuestion) {
            currentQuestion.text += ' ' + line;
            // Recount blanks
            const blanks = currentQuestion.text.match(blankPattern);
            currentQuestion.blankCount = blanks ? blanks.length : 1;
        } else {
            errors.push({ line: lineNum, message: `Unrecognized line: "${line.substring(0, 60)}"` });
        }
    }

    flushQuestion(); // Flush last

    return { questions, errors };
}

// ── Main Export ──
export function parseQuestionText(text: string, format: 'mcq' | 'fill-in'): ParseResult {
    if (format === 'mcq') {
        return parseMCQ(text);
    }
    return parseFillIn(text);
}

export default parseQuestionText;

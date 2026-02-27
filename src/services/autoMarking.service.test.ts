import { describe, it, expect } from 'vitest';
import { scoreQuestion, QuestionType } from './autoMarking.service';

describe('autoMarking.service', () => {
    describe('answersMatch and normalizations', () => {
        it('handles exact matches', () => {
            const result = scoreQuestion(
                { id: '1', type: 'true-false-not-given' as QuestionType, question: '', answer: 'True' },
                'True'
            );
            expect(result.isCorrect).toBe(true);
        });

        it('matches despite different cases and spacing', () => {
            const result = scoreQuestion(
                { id: '1', type: 'short-answer' as QuestionType, question: '', answer: 'industrial revolution' },
                '  Industrial    Revolution '
            );
            expect(result.isCorrect).toBe(true);
        });

        it('handles IELTS alternative answers with slashes and bars (using acceptableAnswers compiled data)', () => {
            const q = { id: '1', type: 'short-answer' as QuestionType, question: '', answer: 'internal regulation / self-regulation', acceptableAnswers: ['internal regulation', 'self-regulation'] };
            expect(scoreQuestion(q, 'internal regulation').isCorrect).toBe(true);
            expect(scoreQuestion(q, 'self-regulation').isCorrect).toBe(true);
            expect(scoreQuestion(q, 'external regulation').isCorrect).toBe(false);
        });

        it('handles optional words in parentheses (using acceptableAnswers compiled data)', () => {
            const q = { id: '1', type: 'short-answer' as QuestionType, question: '', answer: 'books (and) activities', acceptableAnswers: ['books activities', 'books and activities'] };
            expect(scoreQuestion(q, 'books and activities').isCorrect).toBe(true);
            expect(scoreQuestion(q, 'books activities').isCorrect).toBe(true);
            expect(scoreQuestion(q, 'books  activities').isCorrect).toBe(true); // spaced
        });

        it('ignores strict punctuation from student answers like books]activities (combining with acceptableAnswers)', () => {
            const q = { id: '1', type: 'short-answer' as QuestionType, question: '', answer: 'books (and) activities', acceptableAnswers: ['books activities', 'books and activities'] };
            expect(scoreQuestion(q, 'books]activities').isCorrect).toBe(true);
        });

        it('extracts keys from verbose student answers for matching questions', () => {
            const q = { id: '1', type: 'matching-headings' as QuestionType, question: '', answer: 'iv' };
            expect(scoreQuestion(q, 'iv').isCorrect).toBe(true);
            expect(scoreQuestion(q, 'iv. The time and place of the Industrial Revolution').isCorrect).toBe(true);
            expect(scoreQuestion(q, 'iv) Time and place').isCorrect).toBe(true);
            expect(scoreQuestion(q, 'vi. The time').isCorrect).toBe(false);
        });
    });

    describe('single string fallbacks', () => {
        it('scores matching correctly when student provides string instead of object', () => {
            const q = { id: '1', type: 'matching-headings' as QuestionType, question: '', answer: 'viii' };
            const result = scoreQuestion(q, 'viii. Conditions required for industrialization');
            expect(result.isCorrect).toBe(true);
            expect(result.feedback).not.toBe('Invalid answer format.');
        });

        it('scores diagram labeling correctly when student provides string', () => {
            const q = { id: '1', type: 'diagram-labeling' as QuestionType, question: '', answer: 'pump', labels: [] };
            const result = scoreQuestion(q, 'Pump');
            expect(result.isCorrect).toBe(true);
            expect(result.feedback).not.toBe('Invalid answer format.');
        });

        it('scores multiple-select correctly when student provides string', () => {
            const q = { id: '1', type: 'multiple-select' as QuestionType, question: '', answer: ['A', 'C'] };
            const result = scoreQuestion(q, 'A');
            expect(result.feedback).not.toBe('Invalid answer format.');
        });
    });
});

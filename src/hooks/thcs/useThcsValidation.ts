/**
 * useThcsValidation — Validation hook for THCS-THPT editor (PRD-0027 Task 4.11)
 */
import { useMemo } from 'react';
import type { THCSTestMetadata, THCSSection } from '../../types/thcs-test.types';

interface ValidationResult {
    errors: string[];
    warnings: string[];
    isValid: boolean;
}

export function useThcsValidation({
    metadata,
    sections,
}: {
    metadata: THCSTestMetadata;
    sections: THCSSection[];
}): ValidationResult {
    return useMemo(() => {
        const errors: string[] = [];
        const warnings: string[] = [];

        // === ERRORS (block publish) ===
        if (!metadata.title?.trim()) {
            errors.push('Test title is required.');
        }
        if (!metadata.duration || metadata.duration <= 0) {
            errors.push('Test duration must be greater than 0.');
        }
        if (!metadata.gradeLevel) {
            errors.push('Grade level is required.');
        }
        if (!metadata.examType?.trim()) {
            errors.push('Exam type is required.');
        }

        // Section-level
        sections.forEach((section) => {
            if (section.questions.length === 0) {
                errors.push(`Section "${section.name}" has no questions.`);
            }

            section.questions.forEach((q) => {
                // Phase 1: MCQ — correctAnswer required
                if (q.type.startsWith('mcq-') || q.type.startsWith('reading-cloze-mcq') || q.type === 'reading-comprehension') {
                    if (!q.correctAnswer) {
                        errors.push(`Question ${q.questionNumber} in "${section.name}" has no correct answer.`);
                    }
                }

                // ── Task 11.3: Phase 2 validation rules ──

                // (a) Fill-in (verb-form / word-form): sentence must have ___ markers
                if (q.type === 'verb-form' || q.type === 'word-form') {
                    if (!q.questionText?.includes('___')) {
                        errors.push(`Question ${q.questionNumber}: Fill-in question has no ___ blank markers.`);
                    }
                    // (b) Fill-in: each blank must have at least 1 correct answer
                    if (q.blankAnswers) {
                        q.blankAnswers.forEach((blank, bi) => {
                            if (!blank.acceptedAnswers || blank.acceptedAnswers.length === 0) {
                                errors.push(`Question ${q.questionNumber}: Blank ${bi + 1} has no correct answers.`);
                            }
                        });
                    }
                    // (c) Fill-in: AI suggestions not reviewed → warning
                    if (q.blankAnswers?.some(b => (b as any)._aiSuggested && !(b as any)._aiReviewed)) {
                        warnings.push(`Question ${q.questionNumber}: AI-suggested answers not reviewed.`);
                    }
                }

                // (d) Writing: no original sentence → block
                if (q.type === 'sentence-rewrite' || q.type === 'sentence-rewrite-keyword') {
                    if (!q.questionText?.trim()) {
                        errors.push(`Question ${q.questionNumber}: Writing question has no original sentence.`);
                    }
                    // (e) Writing E1 (sentence-rewrite): should have sentence starter
                    if (q.type === 'sentence-rewrite' && !q.sentenceStarter?.trim()) {
                        errors.push(`Question ${q.questionNumber}: Sentence rewrite has no sentence starter.`);
                    }
                    // (f) Writing E2 (sentence-rewrite-keyword): must have keyword
                    if (q.type === 'sentence-rewrite-keyword' && !q.keyword?.trim()) {
                        errors.push(`Question ${q.questionNumber}: Keyword rewrite has no keyword.`);
                    }
                    // (g) Writing: no model answers → block
                    if (!q.modelAnswers || q.modelAnswers.length === 0 || q.modelAnswers.every(a => !a?.trim())) {
                        errors.push(`Question ${q.questionNumber}: Writing question has no model answers.`);
                    }
                }

                // (h) Cloze: each blank must have a correct word
                if (q.type === 'reading-cloze-wordbank') {
                    if (q.blankMapping) {
                        const blankCount = q.questionText?.match(/___/g)?.length || 0;
                        for (let b = 1; b <= blankCount; b++) {
                            if (!q.blankMapping[b]?.trim()) {
                                errors.push(`Question ${q.questionNumber}: Cloze blank ${b} has no correct word.`);
                            }
                        }
                    }
                    // (i) Cloze: word bank has no distractors → warning
                    if (q.wordBank && q.blankMapping) {
                        const correctWords = Object.values(q.blankMapping).map(w => w?.toLowerCase().trim());
                        const distractors = q.wordBank.filter((w: string) => !correctWords.includes(w.toLowerCase().trim()));
                        if (distractors.length === 0) {
                            warnings.push(`Question ${q.questionNumber}: Cloze word bank has no distractors.`);
                        }
                    }
                    // (j) Cloze: more blanks than words → block
                    if (q.wordBank && q.blankMapping) {
                        const blankCount = Object.keys(q.blankMapping).length;
                        if (blankCount > q.wordBank.length) {
                            errors.push(`Question ${q.questionNumber}: More blanks (${blankCount}) than words in word bank (${q.wordBank.length}).`);
                        }
                    }
                }

                // Phase 1 warning: pronunciation without underlines
                // NOTE: word-stress questions do NOT need underlines — they show
                // full words and the student identifies different stress patterns.
                if (
                    q.intent === 'pronunciation' &&
                    (!q.optionUnderlines || q.optionUnderlines.every(u => !u))
                ) {
                    warnings.push(`Question ${q.questionNumber}: Pronunciation question without underlines.`);
                }
            });

            // Task 11.2 validation: Mixed question types → warning
            const uniqueTypes = new Set(section.questions.map(q => q.type));
            if (uniqueTypes.size > 1) {
                warnings.push(`Section "${section.name}" has mixed question types — consider splitting into separate sections.`);
            }
        });

        // === WARNINGS (allow publish) ===
        const totalPoints = sections.reduce((sum, s) => sum + s.totalPoints, 0);
        if (totalPoints !== 10 && totalPoints !== 0) {
            warnings.push(`Total points is ${totalPoints} (standard is 10).`);
        }

        sections.forEach((section) => {
            if (section.totalPoints === 0 && section.questions.length > 0) {
                warnings.push(`⚠️ Section "${section.name}" has 0 points — questions will earn 0 regardless of answers.`);
            }
        });

        return {
            errors,
            warnings,
            isValid: errors.length === 0,
        };
    }, [metadata, sections]);
}

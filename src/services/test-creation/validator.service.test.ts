/**
 * Unit Tests for Validator Service
 * 
 * Tests for AI vs Rules comparison, answer key validation,
 * completeness detection, and uncertain item generation.
 * 
 * @module validator.service.test
 * @see validator.service.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    ValidatorService,
    validatorService,
    VALIDATION_CONSTANTS,
    AIQuestionResult,
    RulesQuestionResult,
    MergedQuestion,
} from './validator.service';

describe('ValidatorService', () => {
    let validator: ValidatorService;

    beforeEach(() => {
        validator = new ValidatorService();
    });

    // ═══════════════════════════════════════════════════════════════
    // AI vs RULES COMPARISON
    // ═══════════════════════════════════════════════════════════════

    describe('compareAIvsRules', () => {
        describe('Perfect Match Scenarios', () => {
            it('should return 100% confidence when AI and rules fully agree', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'true-false-not-given', confidence: 95 },
                    { questionNumber: 2, questionText: 'Q2', type: 'multiple-choice', confidence: 90 },
                    { questionNumber: 3, questionText: 'Q3', type: 'matching-information', confidence: 85 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'true-false-not-given', confidence: 100 },
                    { questionNumber: 2, type: 'multiple-choice', confidence: 95 },
                    { questionNumber: 3, type: 'matching-information', confidence: 90 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.confidence).toBe(100);
                expect(result.matchedCount).toBe(3);
                expect(result.discrepancyCount).toBe(0);
                expect(result.discrepancies).toHaveLength(0);
            });

            it('should mark typeSource as consensus when types match', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'yes-no-not-given', confidence: 90 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'yes-no-not-given', confidence: 95 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.mergedQuestions[0].typeSource).toBe('consensus');
            });
        });

        describe('Discrepancy Detection', () => {
            it('should detect type mismatch and create discrepancy', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'true-false-not-given', confidence: 85 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'yes-no-not-given', confidence: 90 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.discrepancyCount).toBe(1);
                expect(result.discrepancies[0]).toMatchObject({
                    questionNumber: 1,
                    field: 'type',
                    aiValue: 'true-false-not-given',
                    rulesValue: 'yes-no-not-given',
                });
            });

            it('should mark TFNG/YNNG confusion as medium severity', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'true-false-not-given', confidence: 85 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'yes-no-not-given', confidence: 90 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.discrepancies[0].severity).toBe('medium');
            });

            it('should mark different category mismatch as high severity', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'multiple-choice', confidence: 85 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'matching-headings', confidence: 90 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.discrepancies[0].severity).toBe('high');
            });

            it('should mark same category mismatch as low severity', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'matching-information', confidence: 85 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'matching-features', confidence: 90 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.discrepancies[0].severity).toBe('low');
            });
        });

        describe('Weighted Confidence Calculation', () => {
            it('should apply 50/50 weighting (rules/AI)', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'true-false-not-given', confidence: 100 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'true-false-not-given', confidence: 100 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                // 100 * 0.5 + 100 * 0.5 = 100
                expect(result.mergedQuestions[0].confidence).toBe(100);
            });

            it('should calculate weighted confidence correctly', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'multiple-choice', confidence: 80 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'multiple-choice', confidence: 90 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                // 90 * 0.5 + 80 * 0.5 = 45 + 40 = 85
                expect(result.mergedQuestions[0].confidence).toBe(85);
            });
        });

        describe('Uncertainty Flagging', () => {
            it('should mark question as uncertain when confidence < 90', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'completion', confidence: 70 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'completion', confidence: 80 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                // 80 * 0.5 + 70 * 0.5 = 40 + 35 = 75 < 90
                expect(result.mergedQuestions[0].uncertain).toBe(true);
                expect(result.mergedQuestions[0].uncertainReason).toContain('Low confidence');
            });

            it('should mark question as uncertain when types mismatch', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'completion', confidence: 95 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'short-answer', confidence: 95 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.mergedQuestions[0].uncertain).toBe(true);
                expect(result.mergedQuestions[0].uncertainReason).toContain('Type mismatch');
            });
        });

        describe('Metadata Preservation', () => {
            it('should preserve wordLimit from rules result', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'completion', confidence: 90 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    {
                        questionNumber: 1,
                        type: 'completion',
                        confidence: 95,
                        wordLimit: { max: 3, includesNumber: true },
                    },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.mergedQuestions[0].wordLimit).toEqual({ max: 3, includesNumber: true });
            });

            it('should preserve optionLabelFormat from rules result', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'matching-headings', confidence: 90 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    {
                        questionNumber: 1,
                        type: 'matching-headings',
                        confidence: 95,
                        optionLabelFormat: 'roman',
                    },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.mergedQuestions[0].optionLabelFormat).toBe('roman');
            });
        });

        describe('Type Normalization', () => {
            it('should normalize common AI type variations', () => {
                const aiResults: AIQuestionResult[] = [
                    { questionNumber: 1, questionText: 'Q1', type: 'TFNG', confidence: 90 },
                    { questionNumber: 2, questionText: 'Q2', type: 'MCQ', confidence: 90 },
                    { questionNumber: 3, questionText: 'Q3', type: 'gap-fill', confidence: 90 },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 1, type: 'true-false-not-given', confidence: 95 },
                    { questionNumber: 2, type: 'multiple-choice', confidence: 95 },
                    { questionNumber: 3, type: 'sentence-completion', confidence: 95 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.matchedCount).toBe(3);
                expect(result.discrepancyCount).toBe(0);
            });
        });

        describe('Canonical Table Completion Pipeline', () => {
            it('should preserve source order and emit table linkage metadata with questionGroups', () => {
                const sectionInstruction =
                    'TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below. Choose NO MORE THAN TWO WORDS.';
                const aiResults: AIQuestionResult[] = [
                    {
                        questionNumber: 19,
                        questionText: 'Echinacea | ___ | Supports immunity',
                        type: 'table-completion',
                        confidence: 93,
                        answer: 'North America',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                    {
                        questionNumber: 18,
                        questionText: 'Gingko Biloba | ___ | Improves cognitive function',
                        type: 'table-completion',
                        confidence: 94,
                        answer: 'China',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 18, type: 'table-completion', confidence: 95 },
                    { questionNumber: 19, type: 'table-completion', confidence: 95 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);
                const tableQuestions = result.mergedQuestions.filter(
                    (question) => question.type === 'table-completion',
                );

                expect(result.questionGroups).toHaveLength(1);
                expect(result.questionGroups[0]).toMatchObject({
                    taskType: 'table-completion',
                    passageId: 'passage-1',
                    questionRange: { start: 18, end: 19 },
                });
                expect(result.tableCompletionDiagnostics).toEqual([
                    expect.objectContaining({
                        groupId: result.questionGroups[0].groupId,
                        parseMode: 'deterministic',
                        sourceWorkflow: 'in-app-parse',
                        hasCanonicalGroup: true,
                    }),
                ]);

                expect(tableQuestions.map((question) => question.questionNumber)).toEqual([18, 19]);
                expect(tableQuestions).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            questionNumber: 18,
                            sectionInstructionId: result.questionGroups[0].groupId,
                            groupId: result.questionGroups[0].groupId,
                            groupTaskType: 'table-completion',
                            blankId: expect.any(String),
                            anchorId: expect.any(String),
                        }),
                        expect.objectContaining({
                            questionNumber: 19,
                            sectionInstructionId: result.questionGroups[0].groupId,
                            groupId: result.questionGroups[0].groupId,
                            groupTaskType: 'table-completion',
                            blankId: expect.any(String),
                            anchorId: expect.any(String),
                        }),
                    ]),
                );
            });

            it('prefers source-derived table question text when the raw excerpt contains informative blank cells', () => {
                const sectionInstruction =
                    'TABLE_HEADERS: Method | Detail. Complete the table below. Choose ONE WORD ONLY.';
                const aiResults: AIQuestionResult[] = [
                    {
                        questionNumber: 7,
                        questionText: 'Incorrect AI rewrite for question 7',
                        type: 'table-completion',
                        confidence: 94,
                        answer: 'droppings',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                    {
                        questionNumber: 8,
                        questionText: 'Incorrect AI rewrite for question 8',
                        type: 'table-completion',
                        confidence: 94,
                        answer: 'coffee',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 7, type: 'table-completion', confidence: 95 },
                    { questionNumber: 8, type: 'table-completion', confidence: 95 },
                ];

                const documentText = `
Questions 7-8
Complete the table below.
<table>
  <tr><th>Method</th><th>Detail</th></tr>
  <tr><td>Research</td><td>DNA analysis of bat [[7]]</td></tr>
  <tr><td>Findings</td><td>ate pests of rice, [[8]], sugarcane</td></tr>
</table>
                `;

                const result = validator.compareAIvsRules(aiResults, rulesResults, { documentText });
                const tableQuestions = result.mergedQuestions.filter(
                    (question) => question.type === 'table-completion',
                );

                expect(result.questionGroups).toHaveLength(1);
                expect(result.tableCompletionDiagnostics).toEqual([
                    expect.objectContaining({
                        parseMode: 'deterministic',
                        sourceShape: 'html-table',
                        hasCanonicalGroup: true,
                    }),
                ]);
                expect(tableQuestions.map((question) => question.questionText)).toEqual([
                    'DNA analysis of bat ___',
                    'ate pests of rice, ___, sugarcane',
                ]);
            });

            it('groups contiguous table questions by source question range even when AI section instructions drift', () => {
                const aiResults: AIQuestionResult[] = [
                    {
                        questionNumber: 7,
                        questionText: '● DNA analysis of bat ______',
                        type: 'table-completion',
                        confidence: 94,
                        answer: 'droppings',
                        passageId: 'passage-1',
                        sectionInstruction: 'Complete the table below.',
                    },
                    {
                        questionNumber: 8,
                        questionText: '– ate pests of rice, ______, sugarcane, nuts and fruit',
                        type: 'table-completion',
                        confidence: 94,
                        answer: 'coffee',
                        passageId: 'passage-1',
                        sectionInstruction:
                            'TABLE_HEADERS: Findings | Detail. Complete the table below. Choose ONE WORD ONLY.',
                    },
                    {
                        questionNumber: 9,
                        questionText: '– prevent the spread of disease by eating ______ and blackflies',
                        type: 'table-completion',
                        confidence: 94,
                        answer: 'mosquitoes',
                        passageId: 'passage-1',
                        sectionInstruction: 'Choose ONE WORD ONLY from the passage for each answer.',
                    },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 7, type: 'table-completion', confidence: 95 },
                    { questionNumber: 8, type: 'table-completion', confidence: 95 },
                    { questionNumber: 9, type: 'table-completion', confidence: 95 },
                ];

                const documentText = `
Questions 7-13
Complete the table below.
Choose ONE WORD ONLY from the passage for each answer.
<table>
  <tr><th>Section</th><th>Detail</th></tr>
  <tr><td>Method</td><td>DNA analysis of bat [[7]]</td></tr>
  <tr><td>Findings</td><td>ate pests of rice, [[8]], sugarcane, nuts and fruit</td></tr>
  <tr><td>Findings</td><td>prevent the spread of disease by eating [[9]] and blackflies</td></tr>
</table>
                `;

                const result = validator.compareAIvsRules(aiResults, rulesResults, { documentText });

                expect(result.questionGroups).toHaveLength(1);
                expect(result.questionGroups[0]).toMatchObject({
                    taskType: 'table-completion',
                    passageId: 'passage-1',
                    questionRange: { start: 7, end: 9 },
                });
                expect(result.tableCompletionDiagnostics).toEqual([
                    expect.objectContaining({
                        groupId: 'table-group-passage-1-7-13',
                        parseMode: 'deterministic',
                        hasCanonicalGroup: true,
                    }),
                ]);
                expect(
                    result.mergedQuestions
                        .filter((question) => question.type === 'table-completion')
                        .map((question) => question.questionNumber),
                ).toEqual([7, 8, 9]);
            });

            it('keeps unresolved table questions visible but marks them for reclassification', () => {
                const sectionInstruction = 'Complete the table below.';
                const aiResults: AIQuestionResult[] = [
                    {
                        questionNumber: 7,
                        questionText: 'The bats were most active in rice fields located on ______.',
                        type: 'table-completion',
                        confidence: 88,
                        answer: 'coffee',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                    {
                        questionNumber: 8,
                        questionText: 'Another flattened prose row ______.',
                        type: 'table-completion',
                        confidence: 86,
                        answer: 'forest',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 7, type: 'table-completion', confidence: 95 },
                    { questionNumber: 8, type: 'table-completion', confidence: 95 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);
                const unresolvedDiagnostic = result.tableCompletionDiagnostics[0];
                const unresolvedQuestions = result.mergedQuestions.filter(
                    (question) => question.type === 'table-completion',
                );

                expect(result.questionGroups).toHaveLength(0);
                expect(unresolvedDiagnostic).toMatchObject({
                    hasCanonicalGroup: false,
                    validationSeverity: 'blocking',
                    unsupportedRepairState: 're-run-or-reclassify-required',
                });
                expect(unresolvedQuestions).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            questionNumber: 7,
                            questionText: 'The bats were most active in rice fields located on ______.',
                            sectionInstructionId: unresolvedDiagnostic.groupId,
                            pendingTableReclassification: true,
                        }),
                        expect.objectContaining({
                            questionNumber: 8,
                            questionText: 'Another flattened prose row ______.',
                            sectionInstructionId: unresolvedDiagnostic.groupId,
                            pendingTableReclassification: true,
                        }),
                    ]),
                );
            });

            it('should surface blocking blank-count-mismatch issues from grouped canonical validation', () => {
                const sectionInstruction =
                    'TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below. Choose NO MORE THAN TWO WORDS.';
                const aiResults: AIQuestionResult[] = [
                    {
                        questionNumber: 18,
                        questionText: 'Gingko Biloba | ___ | Improves cognitive function',
                        type: 'table-completion',
                        confidence: 94,
                        answer: 'China',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                    {
                        questionNumber: 19,
                        questionText: 'Echinacea | North America | Supports immunity',
                        type: 'table-completion',
                        confidence: 93,
                        answer: 'North America',
                        passageId: 'passage-1',
                        sectionInstruction,
                    },
                ];

                const rulesResults: RulesQuestionResult[] = [
                    { questionNumber: 18, type: 'table-completion', confidence: 95 },
                    { questionNumber: 19, type: 'table-completion', confidence: 95 },
                ];

                const result = validator.compareAIvsRules(aiResults, rulesResults);

                expect(result.tableCompletionIssues).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            code: 'blank-count-mismatch',
                            severity: 'blocking',
                        }),
                    ]),
                );
                expect(result.tableCompletionDiagnostics).toEqual([
                    expect.objectContaining({
                        parseMode: 'deterministic',
                        validationSeverity: 'blocking',
                        issueCodes: expect.arrayContaining(['blank-count-mismatch']),
                        hasCanonicalGroup: true,
                    }),
                ]);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // ANSWER KEY VALIDATION
    // ═══════════════════════════════════════════════════════════════

    describe('validateAnswerKey', () => {
        describe('Valid Answer Keys', () => {
            it('should validate correct TFNG answers', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'true-false-not-given'),
                    createMergedQuestion(2, 'true-false-not-given'),
                    createMergedQuestion(3, 'true-false-not-given'),
                ];

                const answerKey = {
                    1: 'TRUE',
                    2: 'FALSE',
                    3: 'NOT GIVEN',
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            it('should validate correct YNNG answers', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'yes-no-not-given'),
                    createMergedQuestion(2, 'yes-no-not-given'),
                ];

                const answerKey = {
                    1: 'YES',
                    2: 'NOT GIVEN',
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.valid).toBe(true);
            });

            it('should validate MCQ single letter answers', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'multiple-choice'),
                    createMergedQuestion(2, 'multiple-choice'),
                ];

                const answerKey = {
                    1: 'A',
                    2: 'C',
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.valid).toBe(true);
            });
        });

        describe('Invalid Answer Keys', () => {
            it('should error on invalid TFNG answer', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'true-false-not-given'),
                ];

                const answerKey = {
                    1: 'YES', // Invalid for TFNG
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.errors).toHaveLength(1);
                expect(result.errors[0].questionNumber).toBe(1);
                expect(result.errors[0].error).toContain('Invalid answer format');
            });

            it('should error on invalid YNNG answer', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'yes-no-not-given'),
                ];

                const answerKey = {
                    1: 'TRUE', // Invalid for YNNG
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.errors).toHaveLength(1);
            });
        });

        describe('Missing Answers', () => {
            it('should detect missing answers', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'multiple-choice'),
                    createMergedQuestion(2, 'multiple-choice'),
                    createMergedQuestion(3, 'multiple-choice'),
                ];

                const answerKey = {
                    1: 'A',
                    // 2 is missing
                    3: 'C',
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.valid).toBe(false);
                expect(result.coverage.missing).toContain(2);
                expect(result.coverage.answered).toBe(2);
            });

            it('should calculate coverage correctly', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'completion'),
                    createMergedQuestion(2, 'completion'),
                    createMergedQuestion(3, 'completion'),
                    createMergedQuestion(4, 'completion'),
                ];

                const answerKey = {
                    1: 'answer1',
                    3: 'answer3',
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.coverage.total).toBe(4);
                expect(result.coverage.answered).toBe(2);
                expect(result.coverage.missing).toEqual([2, 4]);
            });
        });

        describe('Ambiguous Answers', () => {
            it('should warn on ambiguous A/B format', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'multiple-choice'),
                ];

                const answerKey = {
                    1: 'A/B', // Ambiguous
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.warnings).toHaveLength(1);
                expect(result.warnings[0].warning).toContain('Ambiguous');
            });

            it('should warn on TRUE/FALSE ambiguous format', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'true-false-not-given'),
                ];

                const answerKey = {
                    1: 'TRUE/FALSE',
                };

                const result = validator.validateAnswerKey(questions, answerKey);

                expect(result.warnings.some(w => w.warning.includes('Ambiguous'))).toBe(true);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // COMPLETENESS DETECTION
    // ═══════════════════════════════════════════════════════════════

    describe('detectIncomplete', () => {
        describe('Complete Tests', () => {
            it('should return complete=true with no issues for valid test', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'true-false-not-given'),
                    createMergedQuestion(2, 'multiple-choice', ['A', 'B', 'C', 'D']),
                ];

                const passages = [
                    { id: 'passage-1', title: 'Test Passage', content: 'Content...' },
                ];

                const answerKey = {
                    1: 'TRUE',
                    2: 'A',
                };

                const result = validator.detectIncomplete(questions, passages, answerKey);

                expect(result.complete).toBe(true);
                expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
            });
        });

        describe('Missing Passages', () => {
            it('should detect missing passages', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'completion'),
                ];

                const passages: { id: string; title: string; content: string }[] = [];

                const answerKey = { 1: 'answer' };

                const result = validator.detectIncomplete(questions, passages, answerKey);

                expect(result.complete).toBe(false);
                expect(result.issues.some(i => i.type === 'missing_passage')).toBe(true);
            });
        });

        describe('Missing Options', () => {
            it('should warn when MCQ has no options', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'multiple-choice'), // No options
                ];

                const passages = [{ id: 'p1', title: 'P1', content: 'C1' }];
                const answerKey = { 1: 'A' };

                const result = validator.detectIncomplete(questions, passages, answerKey);

                expect(result.issues.some(i => i.type === 'missing_options')).toBe(true);
            });

            it('should warn when matching-headings has no options', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'matching-headings'),
                ];

                const passages = [{ id: 'p1', title: 'P1', content: 'C1' }];
                const answerKey = { 1: 'i' };

                const result = validator.detectIncomplete(questions, passages, answerKey);

                expect(result.issues.some(i => i.type === 'missing_options')).toBe(true);
            });
        });

        describe('Diagram Questions', () => {
            it('should flag diagram-labeling for image upload', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'diagram-labeling', ['A', 'B', 'C']),
                ];

                const passages = [{ id: 'p1', title: 'P1', content: 'C1' }];
                const answerKey = { 1: 'A' };

                const result = validator.detectIncomplete(questions, passages, answerKey);

                expect(result.issues.some(i => i.type === 'diagram_needs_image')).toBe(true);
            });

            it('should flag flowchart-completion for image upload', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'flowchart-completion'),
                ];

                const passages = [{ id: 'p1', title: 'P1', content: 'C1' }];
                const answerKey = { 1: 'answer' };

                const result = validator.detectIncomplete(questions, passages, answerKey);

                expect(result.issues.some(i => i.type === 'diagram_needs_image')).toBe(true);
            });
        });

        describe('Completeness Score', () => {
            it('should return score 100 for perfect test', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'short-answer'),
                ];

                const passages = [{ id: 'p1', title: 'P1', content: 'C1' }];
                const answerKey = { 1: 'answer' };

                const result = validator.detectIncomplete(questions, passages, answerKey);

                expect(result.score).toBe(100);
            });

            it('should reduce score for errors and warnings', () => {
                const questions: MergedQuestion[] = [
                    createMergedQuestion(1, 'multiple-choice'), // No options (warning)
                    createMergedQuestion(2, 'completion'),
                ];

                const passages = [{ id: 'p1', title: 'P1', content: 'C1' }];
                const answerKey = { 1: 'A' }; // Q2 missing (error)

                const result = validator.detectIncomplete(questions, passages, answerKey);

                // Error: -20, Warning: -5 = 100 - 25 = 75
                expect(result.score).toBeLessThan(100);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // UNCERTAIN ITEMS GENERATION
    // ═══════════════════════════════════════════════════════════════

    describe('generateUncertainItems', () => {
        it('should generate items for type mismatches', () => {
            const comparisonResult = {
                confidence: 50,
                matchedCount: 0,
                discrepancyCount: 1,
                discrepancies: [{
                    questionNumber: 1,
                    field: 'type' as const,
                    aiValue: 'completion',
                    rulesValue: 'short-answer',
                    severity: 'high' as const,
                    recommendation: 'manual_review' as const,
                }],
                mergedQuestions: [createMergedQuestion(1, 'completion')],
            };

            const completenessResult = { complete: true, score: 100, issues: [] };

            const items = validator.generateUncertainItems(comparisonResult, completenessResult);

            expect(items.some(i => i.type === 'type_mismatch')).toBe(true);
            expect(items[0].aiSuggestion).toBe('completion');
            expect(items[0].rulesSuggestion).toBe('short-answer');
        });

        it('should generate items for low confidence questions', () => {
            const comparisonResult = {
                confidence: 70,
                matchedCount: 1,
                discrepancyCount: 0,
                discrepancies: [],
                mergedQuestions: [
                    { ...createMergedQuestion(1, 'completion'), confidence: 65 },
                ],
            };

            const completenessResult = { complete: true, score: 100, issues: [] };

            const items = validator.generateUncertainItems(comparisonResult, completenessResult);

            expect(items.some(i => i.type === 'low_confidence')).toBe(true);
        });

        it('should generate items for missing answers', () => {
            const comparisonResult = {
                confidence: 100,
                matchedCount: 1,
                discrepancyCount: 0,
                discrepancies: [],
                mergedQuestions: [createMergedQuestion(1, 'completion')],
            };

            const completenessResult = {
                complete: false,
                score: 80,
                issues: [{
                    type: 'missing_answer' as const,
                    questionNumber: 1,
                    severity: 'error' as const,
                    message: 'Question 1 has no answer',
                }],
            };

            const items = validator.generateUncertainItems(comparisonResult, completenessResult);

            expect(items.some(i => i.type === 'missing_answer')).toBe(true);
        });

        it('should sort items by severity then question number', () => {
            const comparisonResult = {
                confidence: 50,
                matchedCount: 0,
                discrepancyCount: 2,
                discrepancies: [
                    { questionNumber: 5, field: 'type' as const, aiValue: 'a', rulesValue: 'b', severity: 'low' as const, recommendation: 'manual_review' as const },
                    { questionNumber: 2, field: 'type' as const, aiValue: 'a', rulesValue: 'b', severity: 'high' as const, recommendation: 'manual_review' as const },
                ],
                mergedQuestions: [],
            };

            const completenessResult = { complete: true, score: 100, issues: [] };

            const items = validator.generateUncertainItems(comparisonResult, completenessResult);

            expect(items[0].severity).toBe('high');
            expect(items[0].questionNumber).toBe(2);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════

    describe('Utility Methods', () => {
        it('isValid should return true when no issues', () => {
            const comparisonResult = {
                confidence: 100,
                matchedCount: 1,
                discrepancyCount: 0,
                discrepancies: [],
                mergedQuestions: [],
            };

            const completenessResult = { complete: true, score: 100, issues: [] };

            expect(validator.isValid(comparisonResult, completenessResult)).toBe(true);
        });

        it('isValid should return false when discrepancies exist', () => {
            const comparisonResult = {
                confidence: 50,
                matchedCount: 0,
                discrepancyCount: 1,
                discrepancies: [{ questionNumber: 1, field: 'type' as const, aiValue: 'a', rulesValue: 'b', severity: 'high' as const, recommendation: 'manual_review' as const }],
                mergedQuestions: [],
            };

            const completenessResult = { complete: true, score: 100, issues: [] };

            expect(validator.isValid(comparisonResult, completenessResult)).toBe(false);
        });

        it('getOverallScore should calculate weighted score', () => {
            const comparisonResult = {
                confidence: 80,
                matchedCount: 4,
                discrepancyCount: 1,
                discrepancies: [],
                mergedQuestions: [],
            };

            const completenessResult = { complete: true, score: 100, issues: [] };

            // 80 * 0.6 + 100 * 0.4 = 48 + 40 = 88
            expect(validator.getOverallScore(comparisonResult, completenessResult)).toBe(88);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // SINGLETON AND CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    describe('Exports', () => {
        it('should export singleton instance', () => {
            expect(validatorService).toBeDefined();
            expect(validatorService).toBeInstanceOf(ValidatorService);
        });

        it('should export validation constants', () => {
            expect(VALIDATION_CONSTANTS.UNCERTAINTY_THRESHOLD).toBe(90);
            expect(VALIDATION_CONSTANTS.RULES_WEIGHT).toBe(0.5);
            expect(VALIDATION_CONSTANTS.AI_WEIGHT).toBe(0.5);
            expect(VALIDATION_CONSTANTS.TYPES_REQUIRING_OPTIONS).toContain('multiple-choice');
            expect(VALIDATION_CONSTANTS.TYPES_REQUIRING_IMAGES).toContain('diagram-labeling');
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function createMergedQuestion(
    questionNumber: number,
    type: string,
    options?: string[]
): MergedQuestion {
    return {
        questionNumber,
        questionText: `Question ${questionNumber}`,
        type: type as any,
        options: options || null,
        answer: undefined,
        passageId: 'passage-1',
        confidence: 95,
        typeSource: 'consensus',
        uncertain: false,
    };
}

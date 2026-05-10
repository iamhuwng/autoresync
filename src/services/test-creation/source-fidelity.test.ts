import { describe, expect, it } from 'vitest';
import {
    createBlastRadiusRepairRequest,
    createRawSourceArtifact,
    repairFormattedTest,
    verifyFormattedTest,
    type FormattedTestArtifact,
} from './source-fidelity';

describe('source-fidelity', () => {
    it('preserves raw source text and indexes passages, questions, and answer keys', () => {
        const rawText = [
            'READING PASSAGE 1',
            'A Sample Title',
            'Paragraph one.',
            '',
            'Questions 1-2',
            '1. First answer',
            '2. Second answer',
            '',
            'Answer Key',
            '1 Alpha',
            '2 North America',
        ].join('\r\n');

        const artifact = createRawSourceArtifact(rawText);

        expect(artifact.rawText).toBe(rawText);
        expect(artifact.normalizedText).toContain('\nQuestions 1-2\n');
        expect(artifact.lines[0]?.text).toBe('READING PASSAGE 1');
        expect(artifact.passageBlocks).toHaveLength(1);
        expect(artifact.passageBlocks[0]).toMatchObject({
            title: 'A Sample Title',
            content: 'Paragraph one.',
            questionRange: { start: 1, end: 2 },
        });
        expect(artifact.questionBlocks.map((question) => question.questionNumber)).toEqual([1, 2]);
        expect(artifact.answerKeyBlock?.answers).toEqual({
            1: 'Alpha',
            2: 'North America',
        });
    });

    it('indexes inline html table rows as raw question blocks', () => {
        const rawText = [
            'READING PASSAGE 1',
            'The return of the huarango',
            'Its leaves and bark were used for herbal remedies, while its branches were used for charcoal and its trunk was used to build houses.',
            '',
            'Questions 6-8',
            'Complete the table below.',
            'Choose NO MORE THAN TWO WORDS from the passage for each answer.',
            '<table><tbody><tr><td colspan="2"><h4>Traditional uses of the huarango tree</h4></td></tr><tr><td><p>Part of tree</p></td><td><p>Traditional use</p></td></tr><tr><td><p><strong>6</strong> ............</p></td><td><p>Fuel</p></td></tr><tr><td><p><strong>7</strong> ............ and ............</p></td><td><p>Medicine</p></td></tr><tr><td><p><strong>8</strong> ............</p></td><td><p>construction</p></td></tr></tbody></table>',
            '',
            'Answer Key',
            '6 branches',
            '7 leaves and bark',
            '8 trunk',
        ].join('\n');

        const artifact = createRawSourceArtifact(rawText);

        expect(artifact.questionBlocks.map((question) => question.questionNumber)).toEqual([6, 7, 8]);
        expect(artifact.questionBlocks.map((question) => question.questionText)).toEqual([
            'Part of tree: Fuel',
            'Part of tree: Medicine',
            'Part of tree: construction',
        ]);
        expect(artifact.questionBlocks[0]?.instructionText).toBe(
            'Complete the table below.\nChoose NO MORE THAN TWO WORDS from the passage for each answer.',
        );
        expect(artifact.questionBlocks[0]?.instructionText).not.toContain('<table>');
        expect(artifact.answerKeyBlock?.answers).toEqual({
            6: 'branches',
            7: 'leaves and bark',
            8: 'trunk',
        });
    });

    it('detects passage loss, missing questions, and numbering drift during verification', () => {
        const rawSource = createRawSourceArtifact([
            'READING PASSAGE 1',
            'A Sample Title',
            'Paragraph one.',
            '',
            'Questions 1-2',
            '1. First complete question text',
            '2. Second complete question text',
        ].join('\n'));

        const formattedTest: FormattedTestArtifact = {
            passages: [
                {
                    id: 'passage-1',
                    title: 'A Sample Title',
                    content: 'Paragraph',
                    order: 1,
                    questionRange: { start: 1, end: 2 },
                    sourceAnchors: [],
                },
            ],
            questions: [
                {
                    id: 'question-1',
                    questionNumber: 1,
                    questionText: 'First question',
                    confidence: 90,
                    sourceAnchors: [],
                },
            ],
            answerKey: null,
            metadata: {
                source: 'ai',
                repaired: false,
            },
        };

        const verification = verifyFormattedTest(rawSource, formattedTest);
        const issueCodes = verification.damageRegions.map((damage) => damage.issueCode);

        expect(verification.hasBlockingDamage).toBe(true);
        expect(issueCodes).toEqual(
            expect.arrayContaining([
                'passage-text-loss',
                'missing-question',
                'question-numbering-drift',
            ]),
        );
    });

    it('builds passage blast-radius requests with surrounding paragraph context', () => {
        const rawSource = createRawSourceArtifact([
            'READING PASSAGE 1',
            'Climate Repair',
            '',
            'Opening paragraph.',
            '',
            'Middle paragraph.',
            '',
            'Closing paragraph.',
            '',
            'Questions 1-2',
            '1. First question',
            '2. Second question',
        ].join('\n'));

        const formattedTest: FormattedTestArtifact = {
            passages: [
                {
                    id: 'passage-1',
                    title: 'Climate Repair',
                    content: 'Opening paragraph.',
                    order: 1,
                    questionRange: { start: 1, end: 2 },
                    sourceAnchors: [],
                },
            ],
            questions: rawSource.questionBlocks.map((question) => ({
                id: `question-${question.questionNumber}`,
                questionNumber: question.questionNumber,
                questionText: question.questionText,
                confidence: 90,
                sourceAnchors: [],
            })),
            answerKey: null,
            metadata: {
                source: 'ai',
                repaired: false,
            },
        };

        const verification = verifyFormattedTest(rawSource, formattedTest);
        const request = createBlastRadiusRepairRequest(rawSource, formattedTest, verification);
        const passageRegion = request.regions.find((region) => region.kind === 'passage');

        expect(passageRegion).toBeDefined();
        expect(passageRegion?.stableBoundaries.before).toContain('Climate Repair');
        expect(passageRegion?.stableBoundaries.after).toContain('Questions 1-2');
    });

    it('repairs damaged passage and question regions in a single bounded pass', () => {
        const rawSource = createRawSourceArtifact([
            'READING PASSAGE 1',
            'Climate Repair',
            'Opening paragraph.',
            '',
            'Questions 1-2',
            '1. First complete question text',
            '2. Second complete question text',
            '',
            'Answer Key',
            '1 TRUE',
            '2 FALSE',
        ].join('\n'));

        const formattedTest: FormattedTestArtifact = {
            passages: [
                {
                    id: 'passage-1',
                    title: 'Climate Repair',
                    content: 'Opening',
                    order: 1,
                    questionRange: { start: 1, end: 2 },
                    sourceAnchors: [],
                },
            ],
            questions: [
                {
                    id: 'question-1',
                    questionNumber: 1,
                    questionText: 'First question',
                    confidence: 75,
                    answer: 'TRUE',
                    sourceAnchors: [],
                },
            ],
            answerKey: {
                id: 'answer-key',
                answers: { 1: 'TRUE' },
                sourceAnchors: [],
            },
            metadata: {
                source: 'ai',
                repaired: false,
            },
        };

        const verification = verifyFormattedTest(rawSource, formattedTest);
        const repair = repairFormattedTest(rawSource, formattedTest, verification);

        expect(repair.attempted).toBe(true);
        expect(repair.request.regions.map((region) => region.kind)).toEqual(
            expect.arrayContaining(['passage', 'question', 'answer-key']),
        );
        expect(repair.repairedFormattedTest.questions.map((question) => question.questionNumber)).toEqual([1, 2]);
        expect(repair.repairedFormattedTest.passages[0]?.content).toBe('Opening paragraph.');
        expect(repair.verification.sourceFidelityPass).toBe(true);
    });

    it('discards unverifiable AI answer keys when the raw source has none', () => {
        const rawSource = createRawSourceArtifact([
            'READING PASSAGE 1',
            'A Sample Title',
            'Paragraph one.',
            '',
            'Questions 1-1',
            '1. First answer',
        ].join('\n'));

        const formattedTest: FormattedTestArtifact = {
            passages: [
                {
                    id: 'passage-1',
                    title: 'A Sample Title',
                    content: 'Paragraph one.',
                    order: 1,
                    questionRange: { start: 1, end: 1 },
                    sourceAnchors: [],
                },
            ],
            questions: [
                {
                    id: 'question-1',
                    questionNumber: 1,
                    questionText: 'First answer',
                    answer: 'Invented answer',
                    confidence: 90,
                    sourceAnchors: [],
                },
            ],
            answerKey: {
                id: 'answer-key',
                answers: { 1: 'Invented answer' },
                sourceAnchors: [],
            },
            metadata: {
                source: 'ai',
                repaired: false,
            },
        };

        const verification = verifyFormattedTest(rawSource, formattedTest);

        expect(verification.damageRegions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    issueCode: 'unverified-answer-key-discarded',
                    severity: 'warning',
                }),
            ]),
        );
        expect(verification.verifiedTest.answerKey).toEqual({});
        expect(verification.verifiedTest.questions[0]?.answer).toBeUndefined();
    });
});

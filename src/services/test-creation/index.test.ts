import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    convertToText: vi.fn(),
    extractReadingTest: vi.fn(),
    detectFromSectionContext: vi.fn(),
    compareAIvsRules: vi.fn(),
    parseOffline: vi.fn(),
    isOnline: vi.fn(),
    hashDocument: vi.fn(),
    saveCheckpoint: vi.fn(),
    deleteCheckpoint: vi.fn(),
    getCheckpoint: vi.fn(),
    logCorrection: vi.fn(),
    getTypeStats: vi.fn(),
}));

vi.mock('./document-converter.service', () => ({
    documentConverter: {
        convertToText: mocks.convertToText,
    },
    DocumentConverterService: class DocumentConverterService {},
}));

vi.mock('./ai-extractor.service', () => ({
    aiExtractor: {
        extractReadingTest: mocks.extractReadingTest,
    },
    AIExtractorService: class AIExtractorService {},
}));

vi.mock('./type-classifier.service', () => ({
    typeClassifierService: {
        detectFromSectionContext: mocks.detectFromSectionContext,
    },
    TypeClassifierService: class TypeClassifierService {},
}));

vi.mock('./validator.service', () => ({
    validatorService: {
        compareAIvsRules: mocks.compareAIvsRules,
    },
    ValidatorService: class ValidatorService {},
}));

vi.mock('./learning.service', () => ({
    learningService: {
        logCorrection: mocks.logCorrection,
        getTypeStats: mocks.getTypeStats,
    },
    LearningService: class LearningService {},
}));

vi.mock('./offline-parser.service', () => ({
    offlineParserService: {
        parseOffline: mocks.parseOffline,
        isOnline: mocks.isOnline,
        hashDocument: mocks.hashDocument,
        saveCheckpoint: mocks.saveCheckpoint,
        deleteCheckpoint: mocks.deleteCheckpoint,
        getCheckpoint: mocks.getCheckpoint,
    },
    OfflineParserService: class OfflineParserService {},
}));

import { testCreationService } from './index';

const SOURCE_DOCUMENT_TEXT = `READING PASSAGE 1
Engineering a solution to climate change
Paragraph A text. Paragraph B text.

Questions 30-35
30. Paragraph B
35. removes carbon dioxide as soon as it is produced`;

function createOfflineParseResult() {
    return {
        id: 'offline-1',
        documentText: SOURCE_DOCUMENT_TEXT,
        parsedAt: Date.now(),
        isOfflineParse: true,
        pendingAIComparison: false,
        passages: [
            {
                id: 'passage_1',
                title: 'Engineering a solution to climate change',
                content: 'Paragraph A text. Paragraph B text.',
                order: 1,
            },
        ],
        questions: [
            {
                questionNumber: 30,
                questionText: 'Paragraph B',
                type: 'matching-headings',
                confidence: 91,
                answer: 'vii',
                passageId: 'passage_1',
                classificationDetails: {
                    type: 'matching-headings',
                    confidence: 91,
                    uncertain: false,
                    optionLabelFormat: 'roman',
                    detectionSource: 'instruction',
                    matchedPattern: 'list of headings',
                    wordLimit: null,
                },
            },
            {
                questionNumber: 35,
                questionText: 'removes carbon dioxide as soon as it is produced',
                type: 'matching-information',
                confidence: 88,
                answer: 'C',
                passageId: 'passage_1',
                classificationDetails: {
                    type: 'matching-information',
                    confidence: 88,
                    uncertain: false,
                    optionLabelFormat: 'letter',
                    detectionSource: 'instruction',
                    matchedPattern: 'classify the following',
                    wordLimit: null,
                },
            },
        ],
    };
}

function createValidationResult(aiQuestions: Array<Record<string, unknown>>) {
    return {
        confidence: aiQuestions.length > 0 ? 100 : 0,
        matchedCount: aiQuestions.length,
        discrepancyCount: 0,
        discrepancies: [],
        questionGroups: [],
        tableCompletionIssues: [],
        tableCompletionDiagnostics: [],
        mergedQuestions: aiQuestions.map((question) => ({
            ...question,
            typeSource: 'ai',
            uncertain: false,
        })),
    };
}

describe('testCreationService.parseText', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.convertToText.mockResolvedValue({
            success: true,
            data: {
                text: SOURCE_DOCUMENT_TEXT,
            },
        });

        mocks.isOnline.mockReturnValue(true);
        mocks.parseOffline.mockResolvedValue(createOfflineParseResult());
        mocks.detectFromSectionContext.mockReturnValue({
            type: 'matching-information',
            confidence: 90,
        });
        mocks.compareAIvsRules.mockImplementation((aiQuestions) => createValidationResult(aiQuestions));
    });

    it('falls back to offline parsing when AI extraction returns an error result', async () => {
        mocks.extractReadingTest.mockResolvedValue({
            success: false,
            error: 'Questions+Answers parsing failed',
        });

        const result = await testCreationService.parseText('Pasted IELTS reading content');

        expect(result.success).toBe(true);
        expect(mocks.extractReadingTest).toHaveBeenCalledOnce();
        expect(mocks.parseOffline).toHaveBeenCalledOnce();
        expect(result.metadata.usedOfflineFallback).toBe(true);
        expect(result.metadata.extractionSource).toBe('offline');
        expect(result.metadata.stageTimesMs).toMatchObject({
            converting: expect.any(Number),
            extracting: expect.any(Number),
            classifying: expect.any(Number),
            validating: expect.any(Number),
            assembling: expect.any(Number),
        });
        expect(result.passages).toHaveLength(1);
        expect(result.passages?.[0]).toMatchObject({
            id: 'passage_1',
            title: 'Engineering a solution to climate change',
            content: 'Paragraph A text. Paragraph B text.',
            wordCount: 6,
        });
        expect(result.validationResult?.mergedQuestions).toHaveLength(2);
        expect(result.parseJob?.strategy).toBe('reading-staged-v1');
        expect(result.parseJob?.artifacts.normalizedSource.data.documentText).toBe(SOURCE_DOCUMENT_TEXT);
        expect(result.parseJob?.artifacts.extraction.data.extractionSource).toBe('offline');
        expect(result.parseJob?.artifacts.reviewDraft.data.questions).toHaveLength(2);
        expect(result.validationResult?.mergedQuestions[0]).toMatchObject({
            questionNumber: 30,
            questionText: 'Paragraph B',
            passageId: 'passage_1',
        });
        expect(mocks.compareAIvsRules).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    questionNumber: 30,
                    questionText: 'Paragraph B',
                    type: 'matching-headings',
                }),
            ]),
            expect.any(Array),
            expect.objectContaining({
                documentText: SOURCE_DOCUMENT_TEXT,
            }),
        );
    });

    it('returns offline passages and questions in rules-only mode', async () => {
        const result = await testCreationService.parseText('Pasted IELTS reading content', {
            rulesOnly: true,
        });

        expect(result.success).toBe(true);
        expect(mocks.extractReadingTest).not.toHaveBeenCalled();
        expect(mocks.parseOffline).toHaveBeenCalledOnce();
        expect(result.metadata.usedOfflineFallback).toBe(false);
        expect(result.metadata.extractionSource).toBe('rules');
        expect(result.parseJob?.artifacts.extraction.data.extractionSource).toBe('rules');
        expect(result.passages).toHaveLength(1);
        expect(result.validationResult?.mergedQuestions).toHaveLength(2);
        expect(result.validationResult?.mergedQuestions[1]).toMatchObject({
            questionNumber: 35,
            questionText: 'removes carbon dioxide as soon as it is produced',
            passageId: 'passage_1',
        });
    });

    it('fails instead of returning a blank result when no questions are parsed', async () => {
        mocks.extractReadingTest.mockResolvedValue({
            success: false,
            error: 'Questions+Answers parsing failed',
        });
        mocks.parseOffline.mockResolvedValue({
            ...createOfflineParseResult(),
            questions: [],
        });
        mocks.compareAIvsRules.mockImplementation(() => createValidationResult([]));

        const result = await testCreationService.parseText('Pasted IELTS reading content');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Parsing produced no questions');
    });

    it('preserves table-completion review-draft group linkage and section instruction mapping', async () => {
        const canonicalGroupId = 'tcg-passage_1-37-38';
        const sectionInstructionText = 'Complete the table below.\n\nWrite NO MORE THAN TWO WORDS.';
        const questionGroups = [
            {
                schemaVersion: 1,
                groupId: canonicalGroupId,
                taskType: 'table-completion',
                passageId: 'passage_1',
                questionRange: { start: 37, end: 38 },
                sharedContent: {
                    instructionText: 'Complete the table below.',
                    answerRuleText: 'Write NO MORE THAN TWO WORDS.',
                    constraints: { maxWords: 2, includesNumber: false },
                },
                columns: [
                    { columnId: 'column-label', order: 0 },
                    { columnId: 'column-detail', order: 1 },
                ],
                rows: [
                    { rowId: 'row-1', order: 0, cellIds: ['cell-1', 'cell-2'] },
                    { rowId: 'row-2', order: 1, cellIds: ['cell-3', 'cell-4'] },
                ],
                cells: [
                    {
                        cellId: 'cell-1',
                        rowId: 'row-1',
                        columnId: 'column-label',
                        rowSpan: 1,
                        colSpan: 1,
                        role: 'row-header',
                        segments: [{ kind: 'text', text: 'CO2 capture rate' }],
                    },
                    {
                        cellId: 'cell-2',
                        rowId: 'row-1',
                        columnId: 'column-detail',
                        rowSpan: 1,
                        colSpan: 1,
                        role: 'body',
                        segments: [
                            { kind: 'text', text: 'CO2 capture rate ' },
                            { kind: 'blank-anchor', anchorId: 'anchor-1' },
                        ],
                    },
                    {
                        cellId: 'cell-3',
                        rowId: 'row-2',
                        columnId: 'column-label',
                        rowSpan: 1,
                        colSpan: 1,
                        role: 'row-header',
                        segments: [{ kind: 'text', text: 'Storage condition' }],
                    },
                    {
                        cellId: 'cell-4',
                        rowId: 'row-2',
                        columnId: 'column-detail',
                        rowSpan: 1,
                        colSpan: 1,
                        role: 'body',
                        segments: [
                            { kind: 'text', text: 'Storage condition ' },
                            { kind: 'blank-anchor', anchorId: 'anchor-2' },
                        ],
                    },
                ],
                blanks: [
                    {
                        blankId: 'blank-1',
                        questionNumber: 37,
                        anchorId: 'anchor-1',
                        cellId: 'cell-2',
                        canonicalOrder: 1,
                        acceptedAnswers: ['absorption'],
                        constraints: { maxWords: 2, includesNumber: false },
                        breadcrumb: {
                            rowHeaders: ['CO2 capture rate'],
                            columnHeaders: ['Detail'],
                        },
                    },
                    {
                        blankId: 'blank-2',
                        questionNumber: 38,
                        anchorId: 'anchor-2',
                        cellId: 'cell-4',
                        canonicalOrder: 0,
                        acceptedAnswers: ['sealed'],
                        constraints: { maxWords: 2, includesNumber: false },
                        breadcrumb: {
                            rowHeaders: ['Storage condition'],
                            columnHeaders: ['Detail'],
                        },
                    },
                ],
                provenance: {
                    sourceWorkflow: 'in-app-parse',
                    sourceShape: 'markdown-table',
                    rawExcerpt: '| Metric | Detail |',
                    normalizationVersion: 1,
                    confidence: 0.94,
                    warnings: [],
                    canonicalRevisionHash: 'rev-1',
                },
                canonicalReadingOrder: ['blank-2', 'blank-1'],
                visualOrderConflict: true,
            },
        ];
        mocks.compareAIvsRules.mockImplementation(() => ({
            confidence: 100,
            matchedCount: 2,
            discrepancyCount: 0,
            discrepancies: [],
            questionGroups,
            tableCompletionIssues: [],
            tableCompletionDiagnostics: [
                {
                    groupId: canonicalGroupId,
                    questionRange: { start: 37, end: 38 },
                    parseMode: 'deterministic',
                    sourceWorkflow: 'in-app-parse',
                    sourceShape: 'markdown-table',
                    validationSeverity: 'none',
                    issueCodes: [],
                    issues: [],
                    unsupportedRepairState: 'none',
                    missingSemanticBreadcrumbs: false,
                    canonicalRevisionHash: 'rev-1',
                    hasCanonicalGroup: true,
                },
            ],
            mergedQuestions: [
                {
                    questionNumber: 37,
                    questionText: 'stale flat question text for 37',
                    type: 'table-completion',
                    answer: 'absorption',
                    passageId: 'passage_1',
                    confidence: 95,
                    typeSource: 'ai',
                    uncertain: false,
                    sectionInstruction: sectionInstructionText,
                    sectionInstructionId: canonicalGroupId,
                    groupId: canonicalGroupId,
                    blankId: 'blank-1',
                    anchorId: 'anchor-1',
                    groupTaskType: 'table-completion',
                    tableGroupSchemaVersion: 1,
                },
                {
                    questionNumber: 38,
                    questionText: 'stale flat question text for 38',
                    type: 'table-completion',
                    answer: 'sealed',
                    passageId: 'passage_1',
                    confidence: 95,
                    typeSource: 'ai',
                    uncertain: false,
                    sectionInstruction: sectionInstructionText,
                    sectionInstructionId: canonicalGroupId,
                    groupId: canonicalGroupId,
                    blankId: 'blank-2',
                    anchorId: 'anchor-2',
                    groupTaskType: 'table-completion',
                    tableGroupSchemaVersion: 1,
                },
            ],
        }));

        const result = await testCreationService.parseText('Pasted IELTS reading content');

        expect(result.success).toBe(true);
        expect(result.validationResult?.questionGroups).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    groupId: canonicalGroupId,
                    taskType: 'table-completion',
                }),
            ])
        );

        const reviewDraftData = result.parseJob?.artifacts.reviewDraft.data as Record<string, unknown>;
        expect(reviewDraftData).toHaveProperty('questionGroups');
        expect(reviewDraftData).toHaveProperty('sectionInstructions');
        expect(reviewDraftData).toHaveProperty('tableCompletionDiagnostics');
        expect(reviewDraftData.questionGroups).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    groupId: canonicalGroupId,
                    canonicalReadingOrder: ['blank-2', 'blank-1'],
                    visualOrderConflict: true,
                }),
            ]),
        );

        const reviewSectionInstructions = reviewDraftData.sectionInstructions as Record<string, string>;
        expect(Object.keys(reviewSectionInstructions)).toContain(canonicalGroupId);
        expect(reviewSectionInstructions[canonicalGroupId]).toBe(sectionInstructionText);
        expect(reviewDraftData.tableCompletionDiagnostics).toEqual([
            expect.objectContaining({
                groupId: canonicalGroupId,
                parseMode: 'deterministic',
                sourceWorkflow: 'in-app-parse',
            }),
        ]);

        const reviewQuestions = reviewDraftData.questions as Array<Record<string, unknown>>;
        const reviewTableQuestions = reviewQuestions.filter((question) => question.type === 'table-completion');
        expect(reviewTableQuestions).toHaveLength(2);
        expect(reviewTableQuestions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    questionNumber: 37,
                    questionText: 'CO2 capture rate ___',
                    sectionInstructionId: canonicalGroupId,
                    groupId: canonicalGroupId,
                    groupTaskType: 'table-completion',
                }),
                expect.objectContaining({
                    questionNumber: 38,
                    questionText: 'Storage condition ___',
                    sectionInstructionId: canonicalGroupId,
                    groupId: canonicalGroupId,
                    groupTaskType: 'table-completion',
                }),
            ])
        );
    });

    it('keeps inline html table-completion questions through source verification', async () => {
        const documentText = [
            'READING PASSAGE 1',
            'The return of the huarango',
            'Its leaves and bark were used for herbal remedies, while its branches were used for charcoal for cooking and heating, and its trunk was used to build houses.',
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
        mocks.convertToText.mockResolvedValue({
            success: true,
            data: {
                text: documentText,
            },
        });

        mocks.extractReadingTest.mockResolvedValue({
            success: true,
            data: {
                passages: [
                    {
                        id: 'passage-1',
                        title: 'The return of the huarango',
                        content: 'Its leaves and bark were used for herbal remedies, while its branches were used for charcoal for cooking and heating, and its trunk was used to build houses.',
                        wordCount: 27,
                        questionRange: { start: 6, end: 8 },
                    },
                ],
                questions: [
                    {
                        number: 6,
                        text: 'Part of tree: Fuel',
                        instructions: 'Complete the table below. Choose NO MORE THAN TWO WORDS from the passage for each answer.',
                        suggestedAnswer: 'branches',
                        suggestedType: 'table-completion',
                        passageId: 'passage-1',
                        confidence: 95,
                    },
                    {
                        number: 7,
                        text: 'Part of tree: Medicine',
                        instructions: 'Complete the table below. Choose NO MORE THAN TWO WORDS from the passage for each answer.',
                        suggestedAnswer: 'leaves and bark',
                        suggestedType: 'table-completion',
                        passageId: 'passage-1',
                        confidence: 95,
                    },
                    {
                        number: 8,
                        text: 'Part of tree: construction',
                        instructions: 'Complete the table below. Choose NO MORE THAN TWO WORDS from the passage for each answer.',
                        suggestedAnswer: 'trunk',
                        suggestedType: 'table-completion',
                        passageId: 'passage-1',
                        confidence: 95,
                    },
                ],
                answerKey: {
                    6: 'branches',
                    7: 'leaves and bark',
                    8: 'trunk',
                },
            },
        });
        mocks.detectFromSectionContext.mockReturnValue({
            type: 'table-completion',
            confidence: 92,
            wordLimit: {
                maxWords: 2,
                allowNumber: false,
            },
        });
        mocks.compareAIvsRules.mockImplementation((aiQuestions) => createValidationResult(aiQuestions));

        const result = await testCreationService.parseText(documentText);

        expect(result.success).toBe(true);
        expect(result.metadata.extractionSource).toBe('hybrid');
        expect(result.parseJob?.artifacts.extraction.data.formattedTest.questions.map((question) => question.questionNumber)).toEqual([6, 7, 8]);
        expect(result.parseJob?.artifacts.extraction.data.verification.verifiedTest.questions.map((question) => question.questionText)).toEqual([
            'Part of tree: Fuel',
            'Part of tree: Medicine',
            'Part of tree: construction',
        ]);
        expect(result.parseJob?.artifacts.reviewDraft.data.questions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    questionNumber: 6,
                    questionText: 'Part of tree: Fuel',
                    type: 'table-completion',
                    answer: 'branches',
                }),
                expect.objectContaining({
                    questionNumber: 7,
                    questionText: 'Part of tree: Medicine',
                    type: 'table-completion',
                    answer: 'leaves and bark',
                }),
                expect.objectContaining({
                    questionNumber: 8,
                    questionText: 'Part of tree: construction',
                    type: 'table-completion',
                    answer: 'trunk',
                }),
            ]),
        );
    });
});

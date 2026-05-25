import { describe, expect, it } from 'vitest';
import {
  buildReadingV2AutoLedgerPromptSummary,
  buildReadingV2ImportSourceArtifact,
  buildReadingV2AutoSourceLedger,
  verifyReadingV2AutoPayloadAgainstLedger,
} from './readingV2AutoImportSourceLedger.service';

const passageText = (number: number): string => [
  `READING PASSAGE ${number}`,
  `Synthetic passage ${number} paragraph A has enough stable text for ledger scanning.`,
  `Synthetic passage ${number} paragraph B keeps the fixture non-empty without copying real source.`,
].join('\n');

const questionLines = (start: number, end: number): string => [
  `Questions ${start}-${end}`,
  'Choose the correct answer or complete the sentence.',
  ...Array.from({ length: end - start + 1 }, (_, index) => `${start + index} Synthetic question text ${start + index}.`),
].join('\n');

const answerRows = (start: number, end: number): string =>
  Array.from({ length: end - start + 1 }, (_, index) => `${start + index} answer-${start + index}`).join('\n');

const fullSyntheticSource = [
  '# Synthetic Reading Test',
  passageText(1),
  questionLines(1, 13),
  passageText(2),
  questionLines(14, 26),
  passageText(3),
  questionLines(27, 40),
  'Answers',
  answerRows(1, 40),
].join('\n\n');

describe('readingV2AutoImportSourceLedger.service', () => {
  it('builds a draft-scoped raw source artifact with hashes and line index', async () => {
    const rawText = [
      'READING PASSAGE 1',
      '  Synthetic passage content with extra spacing.  ',
      'Questions 1-1',
      '1 Synthetic question text.',
      'Answers',
      '1 answer',
    ].join('\n');
    const artifact = await buildReadingV2ImportSourceArtifact({
      rawTextOriginal: rawText,
      sourceName: 'source-artifact.md',
    });

    expect(artifact.sourceKind).toBe('teacher-paste');
    expect(artifact.rawTextOriginal).toBe(rawText);
    expect(artifact.rawTextSha256).toBeTruthy();
    expect(artifact.normalizedTextSha256).toBeTruthy();
    expect(artifact.lineIndex[0]).toMatchObject({
      lineId: 'line-0001',
      lineNumber: 1,
      rawText: 'READING PASSAGE 1',
    });
    expect(artifact.retention).toEqual({
      scope: 'draft-author-only',
      includeInStudentProjection: false,
      includeInSessionProjection: false,
      includeInPublicPayload: false,
    });
  });

  it('builds a redacted topology ledger for a full three-passage source', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: fullSyntheticSource,
      sourceName: 'synthetic-full-test.md',
    });

    expect(ledger.category).toBe('full-test-with-answer-key');
    expect(ledger.passages.map((passage) => passage.passageNumber)).toEqual([1, 2, 3]);
    expect(ledger.questionRanges.map((range) => `${range.start}-${range.end}`)).toEqual(['1-13', '14-26', '27-40']);
    expect(ledger.questionNumbers).toHaveLength(40);
    expect(ledger.questionNumbers[0]).toBe(1);
    expect(ledger.questionNumbers[39]).toBe(40);
    expect(ledger.answerKeyRows).toHaveLength(40);
    expect(ledger.answerKeyRows[0]).toMatchObject({ questionNumber: 1 });
    expect(ledger.answerKeyRows[0]).not.toHaveProperty('rawAnswerText');
    expect(ledger.issues.map((issue) => issue.code)).not.toContain('source-answer-key-missing');
  });

  it('keeps short slash answer-key rows bindable without treating slash as the alternative separator', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        questionLines(1, 2),
        'Answers',
        '1 spread',
        '2\\. 10/ ten times',
      ].join('\n\n'),
      sourceName: 'slash-answer-key.md',
    });

    expect(ledger.answerKeyRows.map((row) => row.questionNumber)).toEqual([1, 2]);
    expect(ledger.answerKeyRows[1]).toMatchObject({
      questionNumber: 2,
    });
    expect(ledger.answerKeyRows[1]?.normalizedAnswerHash).toBeDefined();
  });

  it('detects bold markdown question ranges with unicode and mojibake dashes', () => {
    const enDash = '\u2013';
    const mojibakeDash = '\u00e2\u20ac\u201c';
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        `### Questions 1${enDash}7`,
        '*Complete the notes below.*',
        '1 Synthetic note question ___.',
        `**Questions 8${mojibakeDash}13**`,
        'Do the following statements agree with the information given in Reading Passage 1?',
        '8 Synthetic judgement question.',
      ].join('\n\n'),
      sourceName: 'bold-ranges.md',
    });

    expect(ledger.questionRanges.map((range) => `${range.start}-${range.end}`)).toEqual(['1-7', '8-13']);
  });

  it('treats paired question headings as a range for multiple-select topology', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        '#### Questions 12 and 13',
        'Choose TWO letters, A-E.',
        'A first option',
        'B second option',
        'C third option',
        'Answers',
        '12 B',
        '13 C',
      ].join('\n\n'),
      sourceName: 'paired-question-heading.md',
    });

    expect(ledger.questionRanges.map((range) => `${range.start}-${range.end}`)).toContain('12-13');
    expect(ledger.questionNumbers).toEqual([12, 13]);
    expect(ledger.issues.map((issue) => issue.code)).not.toContain('source-question-coverage-gap');
  });

  it('uses strict passage headings and ignores loose prose mentions', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        'This note says Reading Passage 2 has six paragraphs, but it is not a heading.',
        '',
        questionLines(1, 2),
      ].join('\n'),
      sourceName: 'loose-prose.md',
    });

    expect(ledger.passages).toHaveLength(0);
    expect(ledger.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-passage-boundary-missing', severity: 'error' }),
    ]));
  });

  it('marks web-clip pollution without writing polluted text into the summary', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        questionLines(1, 2),
        'Advertisements',
        'Next post IELTS Reading Practice Test',
      ].join('\n\n'),
      sourceName: 'polluted.md',
    });

    expect(ledger.pollutionMarkers.map((marker) => marker.code)).toEqual(['advertisement', 'navigation']);
    expect(ledger.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-pollution-detected', severity: 'warning' }),
    ]));
  });

  it('does not mark passage sentences about advertisements as pollution', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        'READING PASSAGE 1',
        'The advertisement changed how visitors interpreted the museum display.',
        'A second source sentence keeps this passage body substantial.',
        questionLines(1, 2),
      ].join('\n'),
      sourceName: 'advertising-passage.md',
    });

    expect(ledger.pollutionMarkers).toEqual([]);
  });

  it('marks clipped sibling test headings as repeated-title pollution', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        '### Cam 13 ReadingTest 04',
        '### Practice Cam 14 Reading Test 02',
        questionLines(1, 2),
      ].join('\n\n'),
      sourceName: 'clipped-sibling-tests.md',
    });

    expect(ledger.pollutionMarkers.map((marker) => marker.code)).toEqual(['repeated-title', 'repeated-title']);
    expect(ledger.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-pollution-detected', severity: 'warning' }),
    ]));
  });

  it('detects redacted section reference banks without storing bank text', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        'Questions 1-4',
        'Which paragraph contains the following information? Write the correct letter, A-F, in boxes 1-4.',
        '1 Synthetic paragraph matching question.',
        'Questions 5-8',
        'List of Headings',
        'i Hidden source heading one',
        'ii Hidden source heading two',
        'iii Hidden source heading three',
        'Questions 9-10',
        'Look at the following statements and the list of people below.',
        'A Dr Hidden Person One',
        'B Professor Hidden Person Two',
        'Questions 11-12',
        'Choose the correct letter, A-D.',
        'A Hidden option one',
        'B Hidden option two',
        'C Hidden option three',
        'D Hidden option four',
        'Questions 13-14',
        'Complete each sentence with the correct ending, A-C.',
        'A Hidden ending one',
        'B Hidden ending two',
        'C Hidden ending three',
        'Answers',
        answerRows(1, 14),
      ].join('\n\n'),
      sourceName: 'reference-banks.md',
    });

    expect(ledger.referenceBanks.map((bank) => bank.kind)).toEqual([
      'paragraph-labels',
      'headings-list',
      'people-list',
      'option-set',
      'matching-endings',
    ]);
    expect(ledger.referenceBanks.map((bank) => bank.labelSummary)).toEqual(['A-F', 'I-III', 'A-B', 'A-D', 'A-C']);
    expect(ledger.referenceBanks[0]).toMatchObject({
      itemCount: 6,
      questionRange: { start: 1, end: 4 },
    });
    expect(JSON.stringify(ledger.referenceBanks)).not.toContain('Hidden source heading');
    expect(JSON.stringify(ledger.referenceBanks)).not.toContain('Hidden Person');
    expect(JSON.stringify(ledger.referenceBanks)).not.toContain('Hidden option');
  });

  it('prefers sentence-ending bank ownership over generic choose-the-correct-letter wording', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        'Questions 13-14',
        'Choose the correct letter, A-C.',
        '13 Synthetic sentence stem one',
        '14 Synthetic sentence stem two',
        'List of endings below.',
        'A Hidden ending one',
        'B Hidden ending two',
        'C Hidden ending three',
        'Answers',
        answerRows(1, 14),
      ].join('\n\n'),
      sourceName: 'matching-endings-task-type.md',
    });

    const issues = verifyReadingV2AutoPayloadAgainstLedger({
      answerKeyText: answerRows(1, 14),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content with enough text.' }],
          sectionInstructions: [
            {
              questionRange: { start: 13, end: 14 },
              taskType: 'matching-sentence-endings',
              optionLabelRange: 'A-C',
            },
          ],
          questions: [{ questionNumber: 13 }, { questionNumber: 14 }],
        },
      ],
    }, ledger);

    expect(issues.map((issue) => issue.code)).not.toContain('source-instruction-task-type-mismatch');

    const mismatchedIssues = verifyReadingV2AutoPayloadAgainstLedger({
      answerKeyText: answerRows(1, 14),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content with enough text.' }],
          sectionInstructions: [
            {
              questionRange: { start: 13, end: 14 },
              taskType: 'multiple-choice',
              optionLabelRange: 'A-C',
            },
          ],
          questions: [{ questionNumber: 13 }, { questionNumber: 14 }],
        },
      ],
    }, ledger);

    expect(mismatchedIssues.map((issue) => issue.code)).toContain('source-instruction-task-type-mismatch');
  });

  it('recognizes summary completion with a printed word list as summary-completion-list', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        'Questions 18-22',
        'Complete the summary using the list of words, A-H, below.',
        '18 Synthetic summary blank.',
        'A fast B isolated C emotional D worrying',
        'Answers',
        answerRows(18, 22),
      ].join('\n\n'),
      sourceName: 'summary-list-task-type.md',
    });

    const issues = verifyReadingV2AutoPayloadAgainstLedger({
      answerKeyText: answerRows(18, 22),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content with enough text.' }],
          sectionInstructions: [
            {
              questionRange: { start: 18, end: 22 },
              taskType: 'summary-completion-list',
              optionLabelRange: 'A-H',
            },
          ],
          questions: Array.from({ length: 5 }, (_, index) => ({ questionNumber: 18 + index })),
        },
      ],
    }, ledger);

    expect(issues.map((issue) => issue.code)).not.toContain('source-instruction-task-type-mismatch');
  });

  it('verifies missing Gemini question ranges before Studio handoff', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: fullSyntheticSource,
      sourceName: 'synthetic-full-test.md',
    });
    const issues = verifyReadingV2AutoPayloadAgainstLedger({
      answerKeyText: answerRows(1, 40),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content.' }],
          sectionInstructions: [{ questionRange: { start: 1, end: 13 } }],
          questions: Array.from({ length: 13 }, (_, index) => ({ questionNumber: index + 1 })),
        },
      ],
    }, ledger);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-passage-missing', severity: 'error' }),
      expect.objectContaining({ code: 'source-question-missing', severity: 'error' }),
      expect.objectContaining({ code: 'source-answer-row-unbound', severity: 'error' }),
    ]));
    expect(issues.find((issue) => issue.code === 'source-question-missing')?.message).toContain('14-40');
  });

  it('verifies option and reference bank labels before Studio handoff', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        'Questions 1-2',
        'Choose the correct letter, A-C.',
        'A Hidden option one',
        'B Hidden option two',
        'C Hidden option three',
        '1 Synthetic choice question.',
        '2 Synthetic choice question.',
        'Answers',
        answerRows(1, 2),
      ].join('\n\n'),
      sourceName: 'option-bank.md',
    });
    const payloadWithoutBank = {
      answerKeyText: answerRows(1, 2),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content with enough text.' }],
          sectionInstructions: [{ questionRange: { start: 1, end: 2 } }],
          questions: [{ questionNumber: 1 }, { questionNumber: 2 }],
        },
      ],
    };

    expect(verifyReadingV2AutoPayloadAgainstLedger(payloadWithoutBank, ledger)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-reference-bank-missing', severity: 'error' }),
    ]));

    const payloadWithBank = {
      ...payloadWithoutBank,
      materials: [
        {
          ...payloadWithoutBank.materials[0],
          sectionInstructions: [{
            questionRange: { start: 1, end: 2 },
            optionLabelRange: 'A-C',
            labeledOptions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
          }],
        },
      ],
    };

    expect(verifyReadingV2AutoPayloadAgainstLedger(payloadWithBank, ledger).map((issue) => issue.code))
      .not.toContain('source-reference-bank-missing');

    const payloadWithChangedBankLabel = {
      ...payloadWithBank,
      materials: [
        {
          ...payloadWithBank.materials[0],
          sectionInstructions: [{
            questionRange: { start: 1, end: 2 },
            optionLabelRange: 'A-B',
            labeledOptions: [{ label: 'A' }, { label: 'B' }],
          }],
        },
      ],
    };

    expect(verifyReadingV2AutoPayloadAgainstLedger(payloadWithChangedBankLabel, ledger)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-reference-bank-mismatch', severity: 'error' }),
    ]));
  });

  it('verifies instruction word limits, judgement vocabulary, and reuse rules before Studio handoff', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        'Questions 1-3',
        'Do the following statements agree with the information given in Reading Passage 1? Write TRUE, FALSE or NOT GIVEN.',
        '1 Synthetic judgement question.',
        '2 Synthetic judgement question.',
        '3 Synthetic judgement question.',
        'Questions 4-5',
        'Complete the notes below. Write NO MORE THAN TWO WORDS for each answer.',
        '4 Synthetic completion question ___.',
        '5 Synthetic completion question ___.',
        'Questions 6-7',
        'Which paragraph contains the following information? Choose the correct letter, A-C. You may use any letter more than once.',
        '6 Synthetic matching information question.',
        '7 Synthetic matching information question.',
        'Answers',
        answerRows(1, 7),
      ].join('\n\n'),
      sourceName: 'instruction-coverage.md',
    });
    const basePayload = {
      answerKeyText: answerRows(1, 7),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content with enough text.' }],
          sectionInstructions: [
            { questionRange: { start: 1, end: 3 } },
            { questionRange: { start: 4, end: 5 } },
            { questionRange: { start: 6, end: 7 }, referenceLabelRange: 'A-C' },
          ],
          questions: Array.from({ length: 7 }, (_, index) => ({ questionNumber: index + 1 })),
        },
      ],
    };

    expect(verifyReadingV2AutoPayloadAgainstLedger(basePayload, ledger)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-instruction-vocabulary-mismatch', severity: 'error' }),
      expect.objectContaining({ code: 'source-instruction-word-limit-mismatch', severity: 'error' }),
      expect.objectContaining({ code: 'source-instruction-reuse-mismatch', severity: 'error' }),
    ]));

    const fixedPayload = {
      ...basePayload,
      materials: [
        {
          ...basePayload.materials[0],
          sectionInstructions: [
            { questionRange: { start: 1, end: 3 }, vocabulary: 'TFNG' },
            { questionRange: { start: 4, end: 5 }, wordLimit: 2 },
            { questionRange: { start: 6, end: 7 }, referenceLabelRange: 'A-C', optionReuse: 'allowed' },
          ],
        },
      ],
    };

    expect(verifyReadingV2AutoPayloadAgainstLedger(fixedPayload, ledger).map((issue) => issue.code))
      .not.toEqual(expect.arrayContaining([
        'source-instruction-vocabulary-mismatch',
        'source-instruction-word-limit-mismatch',
        'source-instruction-reuse-mismatch',
      ]));
  });

  it('cross-checks task types from source instructions before Studio handoff', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        'Questions 1-2',
        'Which paragraph contains the following information? Choose the correct letter, A-C.',
        '1 Synthetic paragraph matching question.',
        '2 Synthetic paragraph matching question.',
        'Questions 3-4',
        'Look at the following statements and the list of people below.',
        'A Dr Hidden Person One',
        'B Dr Hidden Person Two',
        '3 Synthetic feature matching question.',
        '4 Synthetic feature matching question.',
        'Questions 5-6',
        'Complete the table below.',
        '5 Synthetic table question ___.',
        '6 Synthetic table question ___.',
        'Answers',
        answerRows(1, 6),
      ].join('\n\n'),
      sourceName: 'task-type-cross-check.md',
    });
    const payload = {
      answerKeyText: answerRows(1, 6),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content with enough text.' }],
          sectionInstructions: [
            { questionRange: { start: 1, end: 2 }, taskType: 'matching-features', referenceLabelRange: 'A-C' },
            { questionRange: { start: 3, end: 4 }, taskType: 'matching-information', referenceLabelRange: 'A-B' },
            { questionRange: { start: 5, end: 6 }, taskType: 'sentence-completion' },
          ],
          questions: Array.from({ length: 6 }, (_, index) => ({ questionNumber: index + 1 })),
        },
      ],
    };

    expect(verifyReadingV2AutoPayloadAgainstLedger(payload, ledger)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-instruction-task-type-mismatch', severity: 'error' }),
    ]));

    const fixedPayload = {
      ...payload,
      materials: [
        {
          ...payload.materials[0],
          sectionInstructions: [
            { questionRange: { start: 1, end: 2 }, taskType: 'matching-information', referenceLabelRange: 'A-C' },
            { questionRange: { start: 3, end: 4 }, taskType: 'matching-features', referenceLabelRange: 'A-B' },
            { questionRange: { start: 5, end: 6 }, taskType: 'table-completion' },
          ],
        },
      ],
    };

    expect(verifyReadingV2AutoPayloadAgainstLedger(fixedPayload, ledger).map((issue) => issue.code))
      .not.toContain('source-instruction-task-type-mismatch');
  });

  it('blocks extra Gemini materials when source has fewer strict passage headings', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: [
        passageText(1),
        questionLines(1, 2),
        'This prose says Reading Passage 2 has six paragraphs, but it is not a strict source heading.',
        'Answers',
        answerRows(1, 2),
      ].join('\n\n'),
      sourceName: 'extra-material-source.md',
    });
    const issues = verifyReadingV2AutoPayloadAgainstLedger({
      answerKeyText: answerRows(1, 2),
      materials: [
        {
          passageNumber: 1,
          passages: [{ content: 'Synthetic passage content.' }],
          sectionInstructions: [{ questionRange: { start: 1, end: 2 } }],
          questions: [{ questionNumber: 1 }, { questionNumber: 2 }],
        },
        {
          passageNumber: 2,
          passages: [{ content: 'Invented passage content.' }],
          sectionInstructions: [],
          questions: [],
        },
      ],
    }, ledger);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-passage-extra', severity: 'error' }),
    ]));
  });

  it('serializes ledger constraints for the Gemini prompt without raw source', () => {
    const ledger = buildReadingV2AutoSourceLedger({
      rawText: fullSyntheticSource,
      sourceName: 'synthetic-full-test.md',
    });
    const summary = buildReadingV2AutoLedgerPromptSummary(ledger, 2);

    expect(summary).toContain('SOURCE_LEDGER_EXPECTATIONS');
    expect(summary).toContain('current passage number: 2');
    expect(summary).toContain('expected question numbers: 14-26');
    expect(summary).toContain('detected reference banks: none');
    expect(summary).toContain('visible answer-key row count: 40');
    expect(summary).not.toContain('answer-14');
  });
});

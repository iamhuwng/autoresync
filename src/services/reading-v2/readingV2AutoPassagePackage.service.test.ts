import { describe, expect, it } from 'vitest';
import { buildReadingV2AutoSourceLedger } from './readingV2AutoImportSourceLedger.service';
import { buildReadingV2AutoLineIndex, type ReadingV2AutoTopologyMarker } from './readingV2AutoTopologyMarker.service';
import { buildReadingV2AutoPassagePackages } from './readingV2AutoPassagePackage.service';

const sourceLines = [
  'READING PASSAGE 1',
  'Passage One',
  'Local passage body line A must stay out of Groq.',
  'Local passage body line B must also stay local.',
  'Questions 1-2',
  'Choose ONE WORD ONLY from the passage.',
  '1 First source question ___.',
  '2 Second source question ___.',
  'READING PASSAGE 2',
  'Passage Two',
  'Second body line stays local.',
  'Questions 3-4',
  'Choose the correct letter, A or B.',
  'A First option',
  'B Second option',
  '3 Third source question.',
  '4 Fourth source question.',
  'Answers',
  '1 alpha',
  '2 beta',
  '3 A',
  '4 B',
];

const marker: ReadingV2AutoTopologyMarker = {
  packages: [
    {
      passageNumber: 1,
      passageTitleLines: { startLine: 1, endLine: 2 },
      passageBodyLines: { startLine: 1, endLine: 4 },
      questionAreaLines: { startLine: 5, endLine: 8 },
      expectedQuestionRange: { start: 1, end: 2 },
      groups: [{
        questionRange: { start: 1, end: 2 },
        lines: { startLine: 5, endLine: 8 },
        taskTypeHint: 'sentence-completion',
      }],
      referenceBankLineSpans: [],
      excludedLineSpans: [],
      uncertaintyDiagnostics: [],
    },
    {
      passageNumber: 2,
      passageTitleLines: { startLine: 9, endLine: 10 },
      passageBodyLines: { startLine: 9, endLine: 11 },
      questionAreaLines: { startLine: 12, endLine: 17 },
      expectedQuestionRange: { start: 3, end: 4 },
      groups: [{
        questionRange: { start: 3, end: 4 },
        lines: { startLine: 12, endLine: 17 },
        taskTypeHint: 'multiple-choice',
      }],
      referenceBankLineSpans: [{ startLine: 14, endLine: 15 }],
      excludedLineSpans: [],
      uncertaintyDiagnostics: [],
    },
  ],
  answerKeyRows: [
    { questionNumber: 1, answer: 'alpha', sourceLine: 19 },
    { questionNumber: 2, answer: 'beta', sourceLine: 20 },
    { questionNumber: 3, answer: 'A', sourceLine: 21 },
    { questionNumber: 4, answer: 'B', sourceLine: 22 },
  ],
  diagnostics: [],
};

describe('readingV2AutoPassagePackage.service', () => {
  it('builds exact local passage packages and retains passage body locally', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: sourceLines.join('\n'), sourceName: 'packages.md' });
    const packages = buildReadingV2AutoPassagePackages({
      marker,
      lineIndex: buildReadingV2AutoLineIndex(ledger),
      ledger,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]?.passageBodyText).toContain('Local passage body line A must stay out of Groq.');
    expect(packages[0]?.questionAreaText).toContain('1 First source question ___.');
    expect(packages[0]?.answerKeyRows.map((row) => row.questionNumber)).toEqual([1, 2]);
  });

  it('sends full question area to Groq without passage body text', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: sourceLines.join('\n'), sourceName: 'groq-input.md' });
    const packages = buildReadingV2AutoPassagePackages({
      marker,
      lineIndex: buildReadingV2AutoLineIndex(ledger),
      ledger,
    });
    const packageOne = packages[0]!;
    const packageTwo = packages[1]!;

    expect(packageOne.groqInputText).toContain('Questions 1-2');
    expect(packageOne.groqInputText).toContain('2 Second source question ___.');
    expect(packageOne.groqInputText).not.toContain('Local passage body line A must stay out of Groq.');
    expect(packageTwo.groqInputText).toContain('A First option');
    expect(packageTwo.referenceBankLineSpans).toEqual([{ startLine: 14, endLine: 15 }]);
  });

  it('sends reference-bank span text to Groq while keeping passage prose local', () => {
    const bankSourceLines = [
      'READING PASSAGE 1',
      'A Chapter 1',
      'B Chapter 2',
      'Local body prose must stay out of Groq.',
      'Questions 1-2',
      'Which chapter contains the following information?',
      '1 First chapter-matching prompt.',
      '2 Second chapter-matching prompt.',
      'Answers',
      '1 A',
      '2 B',
    ];
    const bankMarker: ReadingV2AutoTopologyMarker = {
      packages: [{
        passageNumber: 1,
        passageTitleLines: { startLine: 1, endLine: 1 },
        passageBodyLines: { startLine: 1, endLine: 4 },
        questionAreaLines: { startLine: 5, endLine: 8 },
        expectedQuestionRange: { start: 1, end: 2 },
        groups: [{
          questionRange: { start: 1, end: 2 },
          lines: { startLine: 5, endLine: 8 },
          taskTypeHint: 'matching-information',
          referenceBankLines: [{ startLine: 2, endLine: 3 }],
        }],
        referenceBankLineSpans: [{ startLine: 2, endLine: 3 }],
        excludedLineSpans: [],
        uncertaintyDiagnostics: [],
      }],
      answerKeyRows: [
        { questionNumber: 1, answer: 'A', sourceLine: 10 },
        { questionNumber: 2, answer: 'B', sourceLine: 11 },
      ],
      diagnostics: [],
    };
    const ledger = buildReadingV2AutoSourceLedger({ rawText: bankSourceLines.join('\n'), sourceName: 'chapter-bank.md' });
    const [passagePackage] = buildReadingV2AutoPassagePackages({
      marker: bankMarker,
      lineIndex: buildReadingV2AutoLineIndex(ledger),
      ledger,
    });

    expect(passagePackage?.referenceBankLines.map((line) => line.text)).toEqual(['A Chapter 1', 'B Chapter 2']);
    expect(passagePackage?.groqInputText).toContain('REFERENCE_BANK_LINES_ONLY:');
    expect(passagePackage?.groqInputText).toContain('A Chapter 1');
    expect(passagePackage?.groqInputText).toContain('B Chapter 2');
    expect(passagePackage?.groqInputText).not.toContain('Local body prose must stay out of Groq.');
  });

  it('falls back to passage body bank lines when spans are missing', () => {
    const fallbackSourceLines = [
      'READING PASSAGE 1',
      'A',
      'B',
      'C',
      'D',
      'Local body prose must stay out of Groq.',
      '',
      'Questions 1-2',
      'Which paragraph contains the following information?',
      '1 First chapter-matching prompt.',
      '2 Second chapter-matching prompt.',
      '',
      'Answers',
      '1 A',
      '2 B',
    ];
    const fallbackMarker: ReadingV2AutoTopologyMarker = {
      packages: [{
        passageNumber: 1,
        passageTitleLines: { startLine: 1, endLine: 1 },
        passageBodyLines: { startLine: 1, endLine: 6 },
        questionAreaLines: { startLine: 8, endLine: 11 },
        expectedQuestionRange: { start: 1, end: 2 },
        groups: [{
          questionRange: { start: 1, end: 2 },
          lines: { startLine: 8, endLine: 11 },
          taskTypeHint: 'matching-information',
        }],
        referenceBankLineSpans: [],
        excludedLineSpans: [],
        uncertaintyDiagnostics: [],
      }],
      answerKeyRows: [
        { questionNumber: 1, answer: 'A', sourceLine: 14 },
        { questionNumber: 2, answer: 'B', sourceLine: 15 },
      ],
      diagnostics: [],
    };
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fallbackSourceLines.join('\n'), sourceName: 'fallback-bank.md' });
    const [passagePackage] = buildReadingV2AutoPassagePackages({
      marker: fallbackMarker,
      lineIndex: buildReadingV2AutoLineIndex(ledger),
      ledger,
    });

    expect(passagePackage?.referenceBankLines.map((line) => line.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(passagePackage?.groqInputText).toContain('REFERENCE_BANK_LINES_ONLY:');
    expect(passagePackage?.groqInputText).toContain('A');
    expect(passagePackage?.groqInputText).toContain('D');
    expect(passagePackage?.groqInputText).not.toContain('Local body prose must stay out of Groq.');
  });
});

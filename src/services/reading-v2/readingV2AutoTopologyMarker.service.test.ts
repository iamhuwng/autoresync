import { describe, expect, it } from 'vitest';
import { buildReadingV2AutoSourceLedger } from './readingV2AutoImportSourceLedger.service';
import {
  buildReadingV2AutoLineIndex,
  validateReadingV2AutoTopologyMarker,
  type ReadingV2AutoTopologyMarker,
} from './readingV2AutoTopologyMarker.service';

const syntheticPassage = (passageNumber: number, start: number, end: number): readonly string[] => [
  `READING PASSAGE ${passageNumber}`,
  `Synthetic passage ${passageNumber} title`,
  `Synthetic passage ${passageNumber} paragraph A contains enough local text for the package splitter.`,
  `Synthetic passage ${passageNumber} paragraph B stays local and must never be sent to Groq.`,
  `Questions ${start}-${end}`,
  'Complete the synthetic IELTS Reading task.',
  ...Array.from({ length: end - start + 1 }, (_, index) => {
    const questionNumber = start + index;
    return `${questionNumber} Synthetic question ${questionNumber} ___.`;
  }),
];

const fullSourceLines = [
  ...syntheticPassage(1, 1, 13),
  ...syntheticPassage(2, 14, 26),
  ...syntheticPassage(3, 27, 40),
  'Answers',
  ...Array.from({ length: 40 }, (_, index) => `${index + 1} answer${index + 1}`),
];

const fullSource = fullSourceLines.join('\n');

const lineNumberOf = (needle: string): number => {
  const index = fullSourceLines.findIndex((line) => line === needle);
  if (index < 0) {
    throw new Error(`Missing source line ${needle}`);
  }
  return index + 1;
};

const packageMarker = (
  passageNumber: 1 | 2 | 3,
  start: number,
  end: number,
) => {
  const heading = lineNumberOf(`READING PASSAGE ${passageNumber}`);
  const questionHeading = lineNumberOf(`Questions ${start}-${end}`);

  return {
    passageNumber,
    passageTitleLines: { startLine: heading, endLine: heading + 1 },
    passageBodyLines: { startLine: heading, endLine: questionHeading - 1 },
    questionAreaLines: { startLine: questionHeading, endLine: questionHeading + (end - start) + 2 },
    expectedQuestionRange: { start, end },
    groups: [{
      questionRange: { start, end },
      lines: { startLine: questionHeading, endLine: questionHeading + (end - start) + 2 },
      taskTypeHint: 'sentence-completion',
    }],
    referenceBankLineSpans: [],
    excludedLineSpans: [],
    uncertaintyDiagnostics: [],
  };
};

const cleanMarker = (): ReadingV2AutoTopologyMarker => ({
  packages: [
    packageMarker(1, 1, 13),
    packageMarker(2, 14, 26),
    packageMarker(3, 27, 40),
  ],
  answerKeyRows: Array.from({ length: 40 }, (_, index) => ({
    questionNumber: index + 1,
    answer: `answer${index + 1}`,
    sourceLine: lineNumberOf(`${index + 1} answer${index + 1}`),
  })),
  diagnostics: [],
});

describe('readingV2AutoTopologyMarker.service', () => {
  it('accepts a clean full-test topology marker with three packages and 40 answer rows', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'clean-full.md' });
    const diagnostics = validateReadingV2AutoTopologyMarker(cleanMarker(), ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics).toEqual([]);
  });

  it('accepts a polluted clip when pollution is outside package spans', () => {
    const rawText = `${fullSource}\nAdvertisement\nNext post`;
    const ledger = buildReadingV2AutoSourceLedger({ rawText, sourceName: 'polluted.md' });
    const marker = {
      ...cleanMarker(),
      packages: cleanMarker().packages.map((item) => ({
        ...item,
        excludedLineSpans: [{ startLine: fullSourceLines.length + 1, endLine: fullSourceLines.length + 2 }],
      })),
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(ledger.issues.map((issue) => issue.code)).toContain('source-pollution-detected');
    expect(diagnostics).toEqual([]);
  });

  it('accepts body spans anchored after the strict heading when Gemini omits title lines', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'heading-anchor.md' });
    const marker = {
      ...cleanMarker(),
      packages: cleanMarker().packages.map((item) => {
        const { passageTitleLines: _passageTitleLines, ...rest } = item;
        return {
          ...rest,
          passageBodyLines: {
            startLine: item.passageBodyLines.startLine + 2,
            endLine: item.passageBodyLines.endLine,
          },
        };
      }),
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics).toEqual([]);
  });

  it('rejects a marker that omits one passage package', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'missing-passage.md' });
    const marker = {
      ...cleanMarker(),
      packages: cleanMarker().packages.slice(0, 2),
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'topology-marker-package-count-mismatch',
      'topology-marker-question-coverage-missing',
    ]));
  });

  it('rejects duplicated passage headings/packages', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'duplicate.md' });
    const marker = {
      ...cleanMarker(),
      packages: [packageMarker(1, 1, 13), packageMarker(1, 14, 26), packageMarker(3, 27, 40)],
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('topology-marker-duplicate-passage');
  });

  it('rejects answer-key rows that cannot be proven from the source line', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'bad-answer.md' });
    const marker = {
      ...cleanMarker(),
      answerKeyRows: [
        ...cleanMarker().answerKeyRows.slice(0, 1).map((row) => ({ ...row, answer: 'not-on-source-line' })),
        ...cleanMarker().answerKeyRows.slice(1),
      ],
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('topology-marker-answer-row-source-mismatch');
  });

  it('rejects answer-key rows that are not bound to the ledger answer row', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'unbound-answer.md' });
    const marker = {
      ...cleanMarker(),
      answerKeyRows: [
        {
          questionNumber: 1,
          answer: '1',
          sourceLine: lineNumberOf('1 Synthetic question 1 ___.'),
        },
        ...cleanMarker().answerKeyRows.slice(1),
      ],
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('topology-marker-answer-row-source-mismatch');
  });

  it('rejects passage body spans that overlap question areas', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'overlap.md' });
    const questionHeading = lineNumberOf('Questions 1-13');
    const marker = {
      ...cleanMarker(),
      packages: [{
        ...packageMarker(1, 1, 13),
        passageBodyLines: { startLine: questionHeading - 2, endLine: questionHeading + 1 },
      }, packageMarker(2, 14, 26), packageMarker(3, 27, 40)],
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('topology-marker-package-span-overlap');
  });

  it('rejects impossible line spans', () => {
    const ledger = buildReadingV2AutoSourceLedger({ rawText: fullSource, sourceName: 'impossible.md' });
    const marker = {
      ...cleanMarker(),
      packages: [{
        ...packageMarker(1, 1, 13),
        questionAreaLines: { startLine: 999, endLine: 1000 },
      }, packageMarker(2, 14, 26), packageMarker(3, 27, 40)],
    };
    const diagnostics = validateReadingV2AutoTopologyMarker(marker, ledger, buildReadingV2AutoLineIndex(ledger));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('topology-marker-impossible-span');
  });
});

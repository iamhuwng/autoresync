import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildReadingV2AutoSourceLedger,
  verifyReadingV2AutoPayloadAgainstLedger,
  type ReadingV2AutoLedgerPayload,
  type ReadingV2AutoSourceLedger,
} from '../src/services/reading-v2/readingV2AutoImportSourceLedger.service';
import {
  generateReadingV2AutoImportCandidate,
  type ReadingV2AutoImportDiagnostic,
} from '../src/services/reading-v2/readingV2AutoImport.service';
import {
  buildReadingV2AutoLineIndex,
  validateReadingV2AutoTopologyMarker,
  type ReadingV2AutoLineIndex,
  type ReadingV2AutoTopologyGroupHint,
  type ReadingV2AutoTopologyMarker,
} from '../src/services/reading-v2/readingV2AutoTopologyMarker.service';
import {
  buildReadingV2AutoPassagePackage,
  type ReadingV2AutoPassagePackage,
} from '../src/services/reading-v2/readingV2AutoPassagePackage.service';
import {
  buildReadingV2AutoMaterialFromTranscript,
  verifyReadingV2AutoQuestionTranscript,
  type ReadingV2AutoQuestionTranscript,
} from '../src/services/reading-v2/readingV2AutoQuestionTranscript.service';

const DEFAULT_ROOT = 'C:\\Users\\The Lord\\Desktop\\luyentap\\Clippings';
const MAX_LIVE_GEMINI_PROBES = 5;
type HarnessMode =
  | 'ledger-only-offline'
  | 'ledger-only'
  | 'mocked-intermediate'
  | 'gemini-marker-mocked'
  | 'groq-transcript-mocked'
  | 'full-mocked-v3'
  | 'provider-preflight'
  | 'live-gemini'
  | 'live-v3-gemini-groq';

interface HarnessArgs {
  readonly root: string;
  readonly out: string;
  readonly mode: HarnessMode;
  readonly allowLiveGemini: boolean;
  readonly allowLiveV3Providers: boolean;
  readonly liveLimit: number;
  readonly liveTags: readonly string[];
  readonly liveFile?: string;
}

interface HarnessItem {
  readonly path: string;
  readonly title: string | null;
  readonly hash: string;
  readonly category: string;
  readonly passageCount: number;
  readonly questionNumbers: readonly number[];
  readonly answerKeyRowCount: number;
  readonly generatedInteractionCount: number;
  readonly boundAnswerCount: number;
  readonly issueCodes: readonly string[];
  readonly verifierIssueCodes: readonly string[];
  readonly markerDiagnosticCodes: readonly string[];
  readonly packageDiagnosticCodes: readonly string[];
  readonly transcriptDiagnosticCodes: readonly string[];
  readonly v3Stage: 'not-run' | 'marker' | 'package' | 'transcript' | 'assembled';
  readonly status: 'accepted' | 'repaired' | 'reviewable' | 'rejected' | 'unsupported';
  readonly representativeTags: readonly string[];
}

interface HarnessRepresentative {
  readonly tag: string;
  readonly path: string;
  readonly hash: string;
  readonly category: string;
  readonly status: HarnessItem['status'];
  readonly passageCount: number;
  readonly questionCount: number;
  readonly answerKeyRowCount: number;
}

interface HarnessLiveProbe {
  readonly tag: string;
  readonly path: string;
  readonly hash: string;
  readonly success: boolean;
  readonly status: 'accepted' | 'repaired' | 'reviewable' | 'rejected';
  readonly passageCount: number;
  readonly questionCount: number;
  readonly diagnosticCodes: readonly string[];
  readonly diagnostics: readonly HarnessLiveProbeDiagnostic[];
  readonly errorCode: string | null;
  readonly quotaStopSignal: boolean;
  readonly stopReason: 'quota-or-rate-limit' | null;
}

interface HarnessLiveProbeDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
  readonly sourceRange?: unknown;
  readonly providerResult?: string;
  readonly verifierResult?: string;
}

interface HarnessProviderPreflight {
  readonly checkedAt: string;
  readonly providerCallsMade: false;
  readonly clippingsContentSent: false;
  readonly aiAvailable: boolean;
  readonly geminiAvailable: boolean;
  readonly groqAvailable: boolean;
  readonly totalKeys: number;
  readonly benchedKeys: number;
  readonly shortestCooldownRemaining?: number;
  readonly keyRegistryReadable: boolean;
  readonly keyRegistryErrorCode: string | null;
  readonly groqStructuredJsonSlotCount: number;
  readonly groqDistinctPackageFanoutReady: boolean;
  readonly groqSlotFingerprints: readonly string[];
  readonly warnings: readonly string[];
  readonly errorCode: string | null;
}

interface HarnessProviderPreflightDependencies {
  readonly getAIAvailability?: () => Promise<{
    readonly available: boolean;
    readonly geminiAvailable: boolean;
    readonly groqAvailable: boolean;
    readonly totalKeys: number;
    readonly benchedKeys: number;
    readonly shortestCooldownRemaining?: number;
  }>;
  readonly getGroqSlots?: () => Promise<readonly {
    readonly index: number;
    readonly fingerprint: string;
    readonly available: boolean;
  }[]>;
  readonly getAPIKeys?: () => Promise<unknown>;
}

interface HarnessLiveProbeDependencies {
  readonly readSourceText?: (filePath: string) => Promise<string>;
  readonly generateCandidate?: typeof generateReadingV2AutoImportCandidate;
}

const parseArgs = (argv: readonly string[]): HarnessArgs => {
  let root = DEFAULT_ROOT;
  let out = path.resolve('output', 'reading-v2-clippings-ledger-report.json');
  let mode: HarnessMode = 'ledger-only-offline';
  let allowLiveGemini = false;
  let allowLiveV3Providers = false;
  let liveLimit = 1;
  let liveTags: readonly string[] = ['clean-full-test'];
  let liveFile: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--root') {
      root = argv[index + 1] ?? root;
      index += 1;
      continue;
    }

    if (token === '--out') {
      out = path.resolve(argv[index + 1] ?? out);
      index += 1;
      continue;
    }

    if (token === '--mode') {
      const requestedMode = argv[index + 1];
      if (
        requestedMode === 'ledger-only-offline'
        || requestedMode === 'ledger-only'
        || requestedMode === 'mocked-intermediate'
        || requestedMode === 'gemini-marker-mocked'
        || requestedMode === 'groq-transcript-mocked'
        || requestedMode === 'full-mocked-v3'
        || requestedMode === 'provider-preflight'
        || requestedMode === 'live-gemini'
        || requestedMode === 'live-v3-gemini-groq'
      ) {
        mode = requestedMode;
      }
      index += 1;
      continue;
    }

    if (token === '--allow-live-gemini') {
      allowLiveGemini = true;
      continue;
    }

    if (token === '--allow-live-v3-providers') {
      allowLiveV3Providers = true;
      continue;
    }

    if (token === '--live-limit') {
      const requestedLimit = Number(argv[index + 1] ?? liveLimit);
      liveLimit = Number.isFinite(requestedLimit)
        ? Math.min(MAX_LIVE_GEMINI_PROBES, Math.max(0, Math.floor(requestedLimit)))
        : liveLimit;
      index += 1;
      continue;
    }

    if (token === '--live-tags') {
      liveTags = (argv[index + 1] ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (token === '--live-file') {
      const requestedLiveFile = argv[index + 1]?.trim();
      if (requestedLiveFile) {
        liveFile = requestedLiveFile;
      }
      index += 1;
    }
  }

  return { root: path.resolve(root), out, mode, allowLiveGemini, allowLiveV3Providers, liveLimit, liveTags, liveFile };
};

const collectMarkdownFiles = async (root: string): Promise<readonly string[]> => {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownFiles(fullPath);
    }

    return entry.isFile() && entry.name.toLowerCase().endsWith('.md')
      ? [fullPath]
      : [];
  }));

  return nested.flat().sort((left, right) => left.localeCompare(right));
};

const statusFor = (input: {
  readonly category: string;
  readonly issueCodes: readonly string[];
  readonly issueSeverities: readonly string[];
  readonly verifierIssueCodes?: readonly string[];
  readonly markerDiagnosticCodes?: readonly string[];
  readonly packageDiagnosticCodes?: readonly string[];
  readonly transcriptDiagnosticCodes?: readonly string[];
}): HarnessItem['status'] => {
  if (input.category === 'unsupported-or-ambiguous-source') {
    return 'unsupported';
  }

  if (
    (input.verifierIssueCodes ?? []).length > 0
    || (input.markerDiagnosticCodes ?? []).length > 0
    || (input.packageDiagnosticCodes ?? []).length > 0
    || (input.transcriptDiagnosticCodes ?? []).length > 0
  ) {
    return 'rejected';
  }

  const blockingIssueCodes = input.issueCodes.filter((code) => code !== 'source-pollution-detected');
  if (blockingIssueCodes.length === 0) {
    return 'accepted';
  }

  if (input.issueSeverities.includes('error')) {
    return 'rejected';
  }

  return input.issueSeverities.includes('warning') ? 'reviewable' : 'accepted';
};

const answerKeyTextFromLedger = (ledger: ReadingV2AutoSourceLedger): string | undefined =>
  ledger.answerKeyRows.length > 0
    ? ledger.answerKeyRows.map((row) => `${row.questionNumber} TRUE`).join('\n')
    : undefined;

const redactedPassageContentFor = (
  ledger: ReadingV2AutoSourceLedger,
  passageIndex: number,
): string => {
  const passage = ledger.passages[passageIndex];
  if (!passage) {
    return 'redacted passage content';
  }

  const nextPassage = ledger.passages[passageIndex + 1];
  const sourceLength = ledger.normalizedText.slice(
    passage.charStart,
    nextPassage?.charStart ?? ledger.normalizedText.length,
  ).length;
  const targetLength = Math.max(120, Math.ceil(sourceLength * 0.4));
  const unit = `redacted passage ${passage.passageNumber} content `;
  return unit.repeat(Math.ceil(targetLength / unit.length)).slice(0, targetLength);
};

const rangeOverlaps = (
  left: { readonly start: number; readonly end: number },
  right: { readonly start: number; readonly end: number } | undefined,
): boolean =>
  !right || (left.start <= right.end && right.start <= left.end);

const WORD_NUMBER_BY_TEXT = new Map<string, number>([
  ['ONE', 1],
  ['TWO', 2],
  ['THREE', 3],
  ['FOUR', 4],
  ['FIVE', 5],
]);

const wordLimitFromInstructionText = (value: string | undefined): number | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim().toUpperCase() ?? '';
  const wordOnlyMatch = text.match(/\b(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORD(?:S)?\s+ONLY\b/);
  const noMoreThanMatch = text.match(/\bNO\s+MORE\s+THAN\s+(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORD(?:S)?\b/);
  const raw = (wordOnlyMatch ?? noMoreThanMatch)?.[1];

  if (!raw) {
    return undefined;
  }

  const parsed = WORD_NUMBER_BY_TEXT.get(raw) ?? Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const judgementVocabularyFromInstructionText = (value: string | undefined): 'TFNG' | 'YNNG' | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim().toUpperCase() ?? '';

  if (/\bTRUE\b/.test(text) && /\bFALSE\b/.test(text) && /\bNOT\s+GIVEN\b/.test(text)) {
    return 'TFNG';
  }

  if (/\bYES\b/.test(text) && /\bNO\b/.test(text) && /\bNOT\s+GIVEN\b/.test(text)) {
    return 'YNNG';
  }

  return undefined;
};

const taskTypeHintFromInstructionText = (value: string | undefined): string | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';

  if (/\blist\s+of\s+headings\b/.test(text)) {
    return 'matching-headings';
  }
  if (/\b(?:list\s+of\s+people|people\s+below|researchers\s+below|scientists\s+below|experts\s+below|writers\s+below)\b/.test(text)) {
    return 'matching-features';
  }
  if (/\bwhich\s+paragraph\b|\bparagraph\s+contains\b|\bcontains\s+the\s+following\s+information\b/.test(text)) {
    return 'matching-information';
  }
  if (/\btable\b/.test(text) && /\bcomplete\b/.test(text)) {
    return 'table-completion';
  }
  if (/\bflow\s*-?\s*chart\b|\bflowchart\b/.test(text)) {
    return 'flowchart-completion';
  }
  if (/\bdiagram\b/.test(text) && /\b(?:label|labelling|labeling)\b/.test(text)) {
    return 'diagram-labeling';
  }
  if (/\bcomplete\b/.test(text) && /\bnotes?\b/.test(text)) {
    return 'note-completion';
  }
  if (/\bcomplete\b/.test(text) && /\bsummary\b/.test(text)) {
    return 'summary-completion-text';
  }
  if (/\bcomplete\b/.test(text) && /\bsentences?\b/.test(text)) {
    return 'sentence-completion';
  }
  if (judgementVocabularyFromInstructionText(text) === 'TFNG') {
    return 'true-false-not-given';
  }
  if (judgementVocabularyFromInstructionText(text) === 'YNNG') {
    return 'yes-no-not-given';
  }
  if (/\bchoose\s+the\s+correct\s+letter\b|\bmultiple\s+choice\b/.test(text)) {
    return 'multiple-choice';
  }

  return undefined;
};

const instructionAllowsReuse = (value: string | undefined): boolean =>
  /\b(?:letter|letters|option|options|heading|headings)\b.{0,40}\b(?:used|use)\b.{0,30}\bmore\s+than\s+once\b/i.test(value ?? '')
  || /\b(?:used|use)\b.{0,30}\bmore\s+than\s+once\b.{0,40}\b(?:letter|letters|option|options|heading|headings)\b/i.test(value ?? '');

const redactedInstructionSemanticsFor = (
  range: { readonly instructionPreview?: string },
) => {
  const wordLimit = wordLimitFromInstructionText(range.instructionPreview);
  const vocabulary = judgementVocabularyFromInstructionText(range.instructionPreview);
  const optionReuse = instructionAllowsReuse(range.instructionPreview) ? 'allowed' : undefined;
  const taskType = taskTypeHintFromInstructionText(range.instructionPreview);

  return {
    ...(taskType ? { taskType } : {}),
    ...(wordLimit ? { wordLimit } : {}),
    ...(vocabulary ? { vocabulary } : {}),
    ...(optionReuse ? { optionReuse } : {}),
  };
};

const redactedInstructionBanksFor = (
  ledger: ReadingV2AutoSourceLedger,
  range: { readonly start: number; readonly end: number },
) => {
  const banks = ledger.referenceBanks.filter((bank) => rangeOverlaps(range, bank.questionRange));
  const optionLabels = banks
    .filter((bank) => bank.kind === 'option-set')
    .flatMap((bank) => bank.labels);
  const referenceLabels = banks
    .filter((bank) => bank.kind !== 'option-set')
    .flatMap((bank) => bank.labels);

  return {
    ...(optionLabels.length > 0
      ? {
          optionLabelRange: `${optionLabels[0]}-${optionLabels[optionLabels.length - 1]}`,
          labeledOptions: optionLabels.map((label) => ({
            label,
            text: `redacted option ${label}`,
          })),
        }
      : {}),
    ...(referenceLabels.length > 0
      ? {
          referenceLabelRange: `${referenceLabels[0]}-${referenceLabels[referenceLabels.length - 1]}`,
          sectionReferences: referenceLabels.map((label) => ({
            label,
            text: `redacted reference ${label}`,
          })),
        }
      : {}),
  };
};

const buildMockedIntermediatePayload = (ledger: ReadingV2AutoSourceLedger): ReadingV2AutoLedgerPayload => ({
  answerKeyText: answerKeyTextFromLedger(ledger),
  materials: ledger.passages.map((passage, passageIndex) => {
    const ranges = ledger.questionRanges.filter((range) => range.passageNumber === passage.passageNumber);
    const questionNumbers = ranges.length > 0
      ? ranges.flatMap((range) =>
          Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index),
        )
      : ledger.questionNumbers.filter((questionNumber) => questionNumber >= 1 && questionNumber <= 40);

    return {
      passageNumber: passage.passageNumber,
      passages: [{ content: redactedPassageContentFor(ledger, passageIndex) }],
      sectionInstructions: ranges.map((range) => ({
        questionRange: { start: range.start, end: range.end },
        ...redactedInstructionSemanticsFor(range),
        ...redactedInstructionBanksFor(ledger, range),
      })),
      questions: questionNumbers.map((questionNumber) => ({ questionNumber })),
    };
  }),
});

const sourceLinesForLedger = (ledger: ReadingV2AutoSourceLedger): readonly string[] =>
  ledger.normalizedText.split('\n');

const answerTextFromSourceLine = (
  ledger: ReadingV2AutoSourceLedger,
  sourceLine: number,
): string | undefined => {
  const text = sourceLinesForLedger(ledger)[sourceLine - 1]?.trim();
  const match = text?.match(/^(?:Q(?:uestion)?\s*)?\d{1,3}(?:\\?[\).:\-=])?\s+(.+)$/i);
  return match?.[1]?.trim();
};

const rangesForPassage = (
  ledger: ReadingV2AutoSourceLedger,
  passageNumber: number,
) => ledger.questionRanges.filter((range) => range.passageNumber === passageNumber);

const taskTypeHintForRange = (
  range: { readonly instructionPreview?: string },
): string =>
  redactedInstructionSemanticsFor(range).taskType ?? 'sentence-completion';

const questionAreaEndLine = (
  ledger: ReadingV2AutoSourceLedger,
  passageIndex: number,
): number => {
  const nextPassageLine = ledger.passages[passageIndex + 1]?.lineNumber;
  const firstAnswerLine = ledger.answerKeyRows[0]?.sourceLine;
  const boundary = nextPassageLine ?? firstAnswerLine ?? (ledger.lineCount + 1);
  return Math.max(1, boundary - 1);
};

const markerFromLedger = (ledger: ReadingV2AutoSourceLedger): ReadingV2AutoTopologyMarker => ({
  sourceHash: ledger.sourceHash,
  packages: ledger.passages.flatMap((passage, passageIndex) => {
    const ranges = rangesForPassage(ledger, passage.passageNumber);
    const firstRange = ranges[0];
    if (!firstRange) {
      return [];
    }

    const questionAreaEnd = questionAreaEndLine(ledger, passageIndex);
    const expectedQuestionRange = {
      start: Math.min(...ranges.map((range) => range.start)),
      end: Math.max(...ranges.map((range) => range.end)),
    };
    const groups: readonly ReadingV2AutoTopologyGroupHint[] = ranges.map((range) => ({
      questionRange: { start: range.start, end: range.end },
      lines: { startLine: range.lineNumber, endLine: questionAreaEnd },
      taskTypeHint: taskTypeHintForRange(range),
      referenceBankLines: ledger.referenceBanks
        .filter((bank) => bank.passageNumber === passage.passageNumber || rangeOverlaps(range, bank.questionRange))
        .map((bank) => ({ startLine: bank.lineNumber, endLine: bank.lineNumber })),
    }));

    return [{
      passageNumber: passage.passageNumber,
      passageTitleLines: { startLine: passage.lineNumber, endLine: passage.lineNumber },
      passageBodyLines: {
        startLine: passage.lineNumber,
        endLine: Math.max(passage.lineNumber, firstRange.lineNumber - 1),
      },
      questionAreaLines: { startLine: firstRange.lineNumber, endLine: questionAreaEnd },
      expectedQuestionRange,
      groups,
      referenceBankLineSpans: groups.flatMap((group) => group.referenceBankLines ?? []),
      excludedLineSpans: ledger.pollutionMarkers
        .filter((marker) => marker.lineNumber < passage.lineNumber || marker.lineNumber > questionAreaEnd)
        .map((marker) => ({
          startLine: marker.lineNumber,
          endLine: marker.lineNumber,
        })),
      uncertaintyDiagnostics: [],
    }];
  }),
  answerKeyRows: ledger.answerKeyRows.flatMap((row) => {
    const answer = answerTextFromSourceLine(ledger, row.sourceLine);
    return answer
      ? [{ questionNumber: row.questionNumber, answer, sourceLine: row.sourceLine }]
      : [];
  }),
  diagnostics: [],
});

const buildMockedV3Packages = (input: {
  readonly ledger: ReadingV2AutoSourceLedger;
  readonly marker: ReadingV2AutoTopologyMarker;
  readonly lineIndex: ReadingV2AutoLineIndex;
}): readonly ReadingV2AutoPassagePackage[] =>
  input.marker.packages.map((packageMarker) =>
    buildReadingV2AutoPassagePackage({
      marker: packageMarker,
      lineIndex: input.lineIndex,
      ledger: input.ledger,
      answerKeyRows: input.marker.answerKeyRows,
    }),
  );

const questionPromptFromPackage = (
  passagePackage: ReadingV2AutoPassagePackage,
  questionNumber: number,
): string => {
  const pattern = new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${questionNumber}(?:\\*\\*)?(?:\\\\?[).])?(?:\\*\\*)?\\s+(.+)$`);
  const line = passagePackage.questionAreaLines.find((candidate) => pattern.test(candidate.text));
  const match = line?.text.match(pattern);
  return match?.[1]?.trim() ?? `Question ${questionNumber}`;
};

const sourceInstructionFromPackage = (
  passagePackage: ReadingV2AutoPassagePackage,
  group: ReadingV2AutoTopologyGroupHint,
): string | undefined =>
  passagePackage.questionAreaLines.find((line) =>
    line.lineNumber >= group.lines.startLine
    && line.lineNumber <= group.lines.endLine
    && !/^\s*(?:[-*]\s*)?\d{1,3}(?:\\?[\).])?\s+/.test(line.text)
    && !/^\s*Questions?\s+\d+/.test(line.text)
    && line.text.trim().length > 0,
  )?.text.trim();

const mockedTranscriptFromPackage = (
  passagePackage: ReadingV2AutoPassagePackage,
): ReadingV2AutoQuestionTranscript => ({
  passageNumber: passagePackage.passageNumber,
  groups: passagePackage.groupHints.map((group) => {
    const questionNumbers = Array.from(
      { length: group.questionRange.end - group.questionRange.start + 1 },
      (_, index) => group.questionRange.start + index,
    );

    return {
      questionRange: group.questionRange,
      taskType: (group.taskTypeHint ?? 'sentence-completion') as never,
      sourceInstructionText: sourceInstructionFromPackage(passagePackage, group),
      instructionMeta: {},
      questions: questionNumbers.map((questionNumber) => ({
        number: questionNumber,
        promptText: questionPromptFromPackage(passagePackage, questionNumber),
      })),
      diagnostics: [],
    };
  }),
  diagnostics: [],
});

const buildMockedV3Payload = (
  packages: readonly ReadingV2AutoPassagePackage[],
): ReadingV2AutoLedgerPayload => ({
  answerKeyText: packages
    .flatMap((passagePackage) => passagePackage.answerKeyRows)
    .map((row) => `${row.questionNumber} ${row.answer}`)
    .join('\n'),
  materials: packages.map((passagePackage) =>
    buildReadingV2AutoMaterialFromTranscript({
      passagePackage,
      transcript: mockedTranscriptFromPackage(passagePackage),
    }),
  ),
});

const mockedV3DiagnosticsFor = (input: {
  readonly ledger: ReadingV2AutoSourceLedger;
  readonly mode: HarnessMode;
}) => {
  const lineIndex = buildReadingV2AutoLineIndex(input.ledger);
  const marker = markerFromLedger(input.ledger);
  const markerDiagnosticCodes = validateReadingV2AutoTopologyMarker(marker, input.ledger, lineIndex)
    .map((diagnostic) => diagnostic.code);

  if (input.mode === 'gemini-marker-mocked') {
    return {
      markerDiagnosticCodes,
      packageDiagnosticCodes: [] as string[],
      transcriptDiagnosticCodes: [] as string[],
      verifierIssueCodes: [] as string[],
      generatedInteractionCount: 0,
      boundAnswerCount: 0,
      v3Stage: 'marker' as const,
    };
  }

  const packages = markerDiagnosticCodes.length === 0
    ? buildMockedV3Packages({ ledger: input.ledger, marker, lineIndex })
    : [];
  const packageDiagnosticCodes = packages.flatMap((passagePackage) =>
    passagePackage.diagnostics.map((diagnostic) => diagnostic.code),
  );

  if (input.mode === 'groq-transcript-mocked') {
    const transcriptDiagnosticCodes = packages.flatMap((passagePackage) =>
      verifyReadingV2AutoQuestionTranscript({
        passagePackage,
        transcript: mockedTranscriptFromPackage(passagePackage),
      }).map((diagnostic) => diagnostic.code),
    );

    return {
      markerDiagnosticCodes,
      packageDiagnosticCodes,
      transcriptDiagnosticCodes,
      verifierIssueCodes: [] as string[],
      generatedInteractionCount: packages.reduce((total, passagePackage) =>
        total + (passagePackage.expectedQuestionRange.end - passagePackage.expectedQuestionRange.start + 1), 0),
      boundAnswerCount: 0,
      v3Stage: 'transcript' as const,
    };
  }

  const payload = buildMockedV3Payload(packages);
  const verifierIssueCodes = verifyReadingV2AutoPayloadAgainstLedger(payload, input.ledger)
    .map((issue) => issue.code);
  const generatedInteractionCount = (payload.materials ?? [])
    .reduce((total, material) => total + (material.questions?.length ?? 0), 0);
  const boundAnswerCount = payload.answerKeyText
    ? Math.min(input.ledger.answerKeyRows.length, generatedInteractionCount)
    : 0;

  return {
    markerDiagnosticCodes,
    packageDiagnosticCodes,
    transcriptDiagnosticCodes: [] as string[],
    verifierIssueCodes,
    generatedInteractionCount,
    boundAnswerCount,
    v3Stage: 'assembled' as const,
  };
};

const representativeTagsFor = (item: Omit<HarnessItem, 'representativeTags'>): readonly string[] => {
  const tags: string[] = [];

  if (
    item.category === 'full-test-with-answer-key'
    && item.status === 'accepted'
    && item.passageCount === 3
    && item.questionNumbers.length >= 40
    && item.answerKeyRowCount >= 40
  ) {
    tags.push('clean-full-test');
  }

  if (item.category === 'full-test-missing-answer-key') {
    tags.push('missing-answer-key');
  }

  if (item.category === 'single-passage-or-partial-extract') {
    tags.push('partial-extract');
  }

  if (item.category !== 'unsupported-or-ambiguous-source' && item.issueCodes.includes('source-pollution-detected')) {
    tags.push('polluted-web-clip');
  }

  if (item.status === 'rejected' || item.status === 'reviewable') {
    tags.push('known-difficult');
  }

  if (item.status === 'unsupported') {
    tags.push('unsupported');
  }

  return tags;
};

const isMockedV3Mode = (mode: HarnessMode): boolean =>
  mode === 'gemini-marker-mocked'
  || mode === 'groq-transcript-mocked'
  || mode === 'full-mocked-v3';

const scanFile = async (filePath: string, root: string, mode: HarnessMode): Promise<HarnessItem> => {
  const rawText = await readFile(filePath, 'utf8');
  const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
  const ledger = buildReadingV2AutoSourceLedger({
    rawText,
    sourceName: relativePath,
  });
  const isListeningNote = /(?:^|\/)IELTS Cambridge Listening Test\/|listening\s+test/i.test(relativePath)
    || /listening\s+test/i.test(ledger.title ?? '');
  const category = isListeningNote ? 'unsupported-or-ambiguous-source' : ledger.category;
  const issueCodes = ledger.issues.map((issue) => issue.code);
  const issueSeverities = ledger.issues.map((issue) => issue.severity);
  const mockedPayload = mode === 'mocked-intermediate' && category !== 'unsupported-or-ambiguous-source'
    ? buildMockedIntermediatePayload(ledger)
    : null;
  const v3Diagnostics = isMockedV3Mode(mode) && category !== 'unsupported-or-ambiguous-source'
    ? mockedV3DiagnosticsFor({ ledger, mode })
    : null;
  const verifierIssueCodes = v3Diagnostics
    ? v3Diagnostics.verifierIssueCodes
    : mockedPayload
    ? verifyReadingV2AutoPayloadAgainstLedger(mockedPayload, ledger).map((issue) => issue.code)
    : [];
  const generatedInteractionCount = v3Diagnostics
    ? v3Diagnostics.generatedInteractionCount
    : mockedPayload
    ? (mockedPayload.materials ?? []).reduce((total, material) => total + (material.questions?.length ?? 0), 0)
    : 0;
  const boundAnswerCount = v3Diagnostics
    ? v3Diagnostics.boundAnswerCount
    : mockedPayload && mockedPayload.answerKeyText
    ? Math.min(ledger.answerKeyRows.length, generatedInteractionCount)
    : 0;
  const itemWithoutTags = {
    path: relativePath,
    title: ledger.title ?? null,
    hash: ledger.sourceHash,
    category,
    passageCount: ledger.passages.length,
    questionNumbers: ledger.questionNumbers,
    answerKeyRowCount: ledger.answerKeyRows.length,
    generatedInteractionCount,
    boundAnswerCount,
    issueCodes,
    verifierIssueCodes,
    markerDiagnosticCodes: v3Diagnostics?.markerDiagnosticCodes ?? [],
    packageDiagnosticCodes: v3Diagnostics?.packageDiagnosticCodes ?? [],
    transcriptDiagnosticCodes: v3Diagnostics?.transcriptDiagnosticCodes ?? [],
    v3Stage: v3Diagnostics?.v3Stage ?? 'not-run',
    status: statusFor({
      category,
      issueCodes,
      issueSeverities,
      verifierIssueCodes,
      markerDiagnosticCodes: v3Diagnostics?.markerDiagnosticCodes,
      packageDiagnosticCodes: v3Diagnostics?.packageDiagnosticCodes,
      transcriptDiagnosticCodes: v3Diagnostics?.transcriptDiagnosticCodes,
    }),
  };

  return {
    ...itemWithoutTags,
    representativeTags: representativeTagsFor(itemWithoutTags),
  };
};

const summarize = (items: readonly HarnessItem[]) => {
  const count = (predicate: (item: HarnessItem) => boolean): number =>
    items.filter(predicate).length;
  const diagnosticCountFor = (codes: readonly string[], family: 'source-proof' | 'group-coverage' | 'repair' | 'bank-heuristic'): number =>
    codes.filter((code) => (
      family === 'source-proof'
        ? ['source-proof-format-mismatch', 'source-text-exact-missing', 'normalized-text-source-drift'].includes(code)
        : family === 'group-coverage'
          ? code === 'group-coverage-mismatch'
          : family === 'repair'
            ? ['repair-applied', 'repair-skipped', 'repair-failed', 'source-repair-succeeded', 'source-repair-failed'].includes(code)
            : code === 'bank-ownership-heuristic-used'
    )).length;

  return {
    totalFilesScanned: items.length,
    supportedFullTests: count((item) =>
      item.category === 'full-test-with-answer-key' || item.category === 'full-test-missing-answer-key',
    ),
    accepted: count((item) => item.status === 'accepted'),
    repaired: count((item) => item.status === 'repaired'),
    reviewable: count((item) => item.status === 'reviewable'),
    rejected: count((item) => item.status === 'rejected'),
    unsupported: count((item) => item.status === 'unsupported'),
    generatedInteractionCount: items.reduce((total, item) => total + item.generatedInteractionCount, 0),
    boundAnswerCount: items.reduce((total, item) => total + item.boundAnswerCount, 0),
    markerDiagnosticCount: items.reduce((total, item) => total + item.markerDiagnosticCodes.length, 0),
    packageDiagnosticCount: items.reduce((total, item) => total + item.packageDiagnosticCodes.length, 0),
    transcriptDiagnosticCount: items.reduce((total, item) => total + item.transcriptDiagnosticCodes.length, 0),
    sourceProofMismatchCount: items.reduce((total, item) => total + diagnosticCountFor(item.transcriptDiagnosticCodes, 'source-proof'), 0),
    groupCoverageMismatchCount: items.reduce((total, item) => total + diagnosticCountFor(item.transcriptDiagnosticCodes, 'group-coverage'), 0),
    repairOutcomeCount: items.reduce((total, item) => total + diagnosticCountFor(item.transcriptDiagnosticCodes, 'repair'), 0),
    bankHeuristicUsageCount: items.reduce((total, item) => total + diagnosticCountFor(item.transcriptDiagnosticCodes, 'bank-heuristic'), 0),
  };
};

const selectRepresentatives = (items: readonly HarnessItem[]) => {
  const wantedTags = [
    'clean-full-test',
    'missing-answer-key',
    'partial-extract',
    'polluted-web-clip',
    'known-difficult',
    'unsupported',
  ];

  return wantedTags.flatMap((tag) => {
    const item = items.find((candidate) => candidate.representativeTags.includes(tag));
    return item
      ? [{
          tag,
          path: item.path,
          hash: item.hash,
          category: item.category,
          status: item.status,
          passageCount: item.passageCount,
          questionCount: item.questionNumbers.length,
          answerKeyRowCount: item.answerKeyRowCount,
        }]
      : [];
  });
};

const statusFromLiveResult = (
  success: boolean,
  diagnosticCodes: readonly string[],
): HarnessLiveProbe['status'] => {
  if (!success) {
    return 'rejected';
  }

  if (diagnosticCodes.includes('source-repair-succeeded') || diagnosticCodes.includes('repair-applied')) {
    return 'repaired';
  }

  return diagnosticCodes.length > 0 ? 'reviewable' : 'accepted';
};

const selectLiveProbeRepresentatives = (
  representatives: readonly HarnessRepresentative[],
  args: HarnessArgs,
): readonly HarnessRepresentative[] => {
  if (args.liveFile) {
    return representatives.slice(0, args.liveLimit);
  }

  const tagSet = new Set(args.liveTags);
  const selected = representatives.filter((representative) => tagSet.has(representative.tag));
  return selected.slice(0, args.liveLimit);
};

const representativeForLiveFile = (
  items: readonly HarnessItem[],
  requestedPath: string | undefined,
): HarnessRepresentative | undefined => {
  if (!requestedPath) {
    return undefined;
  }

  const normalizedRequest = requestedPath.replace(/\\/g, '/').toLowerCase();
  const item = items.find((candidate) => {
    const normalizedCandidate = candidate.path.replace(/\\/g, '/').toLowerCase();
    return normalizedCandidate === normalizedRequest
      || normalizedCandidate.endsWith(`/${normalizedRequest}`);
  });

  return item
    ? {
        tag: 'exact-file',
        path: item.path,
        hash: item.hash,
        category: item.category,
        status: item.status,
        passageCount: item.passageCount,
        questionCount: item.questionNumbers.length,
        answerKeyRowCount: item.answerKeyRowCount,
      }
    : undefined;
};

const sanitizeLiveError = (error: string): string =>
  error
    .replace(/AIza[0-9A-Za-z_-]+/g, '[redacted-api-key]')
    .replace(/gsk_[0-9A-Za-z]+/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]+/g, '[redacted-api-key]')
    .replace(/org_[0-9A-Za-z_]+/g, '[redacted-org]')
    .replace(/key=([^&;,\s]+)/gi, 'key=[redacted]')
    .replace(/[A-Z]:\\[^:\n\r"]+/g, '[redacted-windows-path]')
    .slice(0, 240);

const liveProbeDiagnosticFor = (
  diagnostic: ReadingV2AutoImportDiagnostic,
): HarnessLiveProbeDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: sanitizeLiveError(diagnostic.message),
  ...(typeof diagnostic.passageNumber === 'number' ? { passageNumber: diagnostic.passageNumber } : {}),
  ...(typeof diagnostic.questionNumber === 'number' ? { questionNumber: diagnostic.questionNumber } : {}),
  ...(diagnostic.sourceRange ? { sourceRange: diagnostic.sourceRange } : {}),
  ...(diagnostic.providerResult ? { providerResult: diagnostic.providerResult } : {}),
  ...(diagnostic.verifierResult ? { verifierResult: diagnostic.verifierResult } : {}),
});

const isProviderQuotaStopSignal = (value: string | null | undefined): boolean => {
  const text = String(value ?? '').toLowerCase();
  if (!text) {
    return false;
  }

  return (
    text.includes('429')
    || text.includes('rate limit')
    || text.includes('rate-limit')
    || text.includes('quota')
    || text.includes('all gemini api keys exhausted')
    || text.includes('all groq api keys exhausted')
    || text.includes('all ai api keys exhausted')
    || text.includes('all keys exhausted')
    || text.includes('requests_per_day')
    || text.includes('per day')
    || text.includes('per_day')
    || text.includes('perday')
    || text.includes('limit: 0')
    || text.includes('retrydelay')
  );
};

const buildProviderPreflight = async (
  dependencies: HarnessProviderPreflightDependencies = {},
): Promise<HarnessProviderPreflight> => {
  const checkedAt = new Date().toISOString();
  const warnings: string[] = [];

  try {
    const getAIAvailability = dependencies.getAIAvailability
      ?? (await import('../src/services/ai-status.service')).getAIAvailability;
    const getAPIKeys = dependencies.getAPIKeys
      ?? (await import('../src/services/api-keys.service')).getAPIKeys;
    const getGroqSlots = dependencies.getGroqSlots
      ?? (await import('../src/services/ai/groq.provider')).groqProvider.getAvailableStructuredJsonKeySlots.bind(
        (await import('../src/services/ai/groq.provider')).groqProvider,
      );

    let keyRegistryReadable = true;
    let keyRegistryErrorCode: string | null = null;
    try {
      await getAPIKeys();
    } catch (error) {
      keyRegistryReadable = false;
      keyRegistryErrorCode = sanitizeLiveError(error instanceof Error ? error.message : String(error));
      warnings.push('firestore-key-registry-unreadable');
    }

    const [availability, groqSlots] = await Promise.all([
      getAIAvailability(),
      getGroqSlots(),
    ]);
    const availableGroqSlots = groqSlots.filter((slot) => slot.available);

    if (!availability.geminiAvailable) {
      warnings.push('gemini-unavailable');
    }

    if (!availability.groqAvailable || availableGroqSlots.length === 0) {
      warnings.push('groq-unavailable');
    }

    if (availableGroqSlots.length > 0 && availableGroqSlots.length < 3) {
      warnings.push('groq-distinct-package-fanout-degraded');
    }

    return {
      checkedAt,
      providerCallsMade: false,
      clippingsContentSent: false,
      aiAvailable: availability.available,
      geminiAvailable: availability.geminiAvailable,
      groqAvailable: availability.groqAvailable,
      totalKeys: availability.totalKeys,
      benchedKeys: availability.benchedKeys,
      shortestCooldownRemaining: availability.shortestCooldownRemaining,
      keyRegistryReadable,
      keyRegistryErrorCode,
      groqStructuredJsonSlotCount: availableGroqSlots.length,
      groqDistinctPackageFanoutReady: availableGroqSlots.length >= 3,
      groqSlotFingerprints: availableGroqSlots.map((slot) => slot.fingerprint),
      warnings,
      errorCode: null,
    };
  } catch (error) {
    return {
      checkedAt,
      providerCallsMade: false,
      clippingsContentSent: false,
      aiAvailable: false,
      geminiAvailable: false,
      groqAvailable: false,
      totalKeys: 0,
      benchedKeys: 0,
      keyRegistryReadable: false,
      keyRegistryErrorCode: sanitizeLiveError(error instanceof Error ? error.message : String(error)),
      groqStructuredJsonSlotCount: 0,
      groqDistinctPackageFanoutReady: false,
      groqSlotFingerprints: [],
      warnings: ['provider-preflight-failed'],
      errorCode: sanitizeLiveError(error instanceof Error ? error.message : String(error)),
    };
  }
};

const runLiveGeminiProbes = async (
  args: HarnessArgs,
  representatives: readonly HarnessRepresentative[],
  dependencies: HarnessLiveProbeDependencies = {},
): Promise<readonly HarnessLiveProbe[]> => {
  if (args.mode === 'live-gemini' && !args.allowLiveGemini) {
    throw new Error('Live Gemini harness mode requires --allow-live-gemini. This intentionally prevents accidental provider calls with local Clippings content.');
  }

  if (args.mode === 'live-v3-gemini-groq' && !args.allowLiveV3Providers) {
    throw new Error('Live V3 Gemini plus Groq harness mode requires --allow-live-v3-providers. This intentionally prevents accidental provider calls with local Clippings content.');
  }

  const probes = selectLiveProbeRepresentatives(representatives, args);
  const results: HarnessLiveProbe[] = [];
  const readSourceText = dependencies.readSourceText
    ?? ((filePath: string) => readFile(filePath, 'utf8'));
  const generateCandidate = dependencies.generateCandidate ?? generateReadingV2AutoImportCandidate;

  for (const representative of probes) {
    const rawText = await readSourceText(path.join(args.root, representative.path));
    const result = await generateCandidate({
      rawTestText: rawText,
      sourceName: representative.path,
    }, {
      waitBetweenChunksMs: 0,
      maxRepairAttempts: 1,
      forceV3Pipeline: args.mode === 'live-v3-gemini-groq',
    });
    const diagnosticCodes = result.diagnostics.map((diagnostic) => diagnostic.code);
    const diagnostics = result.diagnostics.map(liveProbeDiagnosticFor);
    const errorCode = result.success ? null : sanitizeLiveError(result.error);
    const quotaStopSignal = isProviderQuotaStopSignal(errorCode)
      || diagnostics.some((diagnostic) =>
        isProviderQuotaStopSignal(diagnostic.code)
        || isProviderQuotaStopSignal(diagnostic.message),
      );

    results.push({
      tag: representative.tag,
      path: representative.path,
      hash: representative.hash,
      success: result.success,
      status: statusFromLiveResult(result.success, diagnosticCodes),
      passageCount: result.success ? result.passageCount : 0,
      questionCount: result.success ? result.questionCount : 0,
      diagnosticCodes,
      diagnostics,
      errorCode,
      quotaStopSignal,
      stopReason: quotaStopSignal ? 'quota-or-rate-limit' : null,
    });

    if (quotaStopSignal) {
      break;
    }
  }

  return results;
};

const buildReport = async (args: HarnessArgs) => {
  if (args.mode === 'provider-preflight') {
    return {
      generatedAt: new Date().toISOString(),
      rootPath: args.root,
      mode: args.mode,
      summary: summarize([]),
      representatives: [],
      providerPreflight: await buildProviderPreflight(),
      liveProbes: [],
      items: [],
    };
  }

  const files = await collectMarkdownFiles(args.root);
  const items = await Promise.all(files.map((filePath) => scanFile(filePath, args.root, args.mode)));
  const representatives = selectRepresentatives(items);
  const exactLiveRepresentative = representativeForLiveFile(items, args.liveFile);
  if ((args.mode === 'live-gemini' || args.mode === 'live-v3-gemini-groq') && args.liveFile && !exactLiveRepresentative) {
    throw new Error(`Requested live Clippings file was not found in harness items: ${args.liveFile}`);
  }
  const liveProbeRepresentatives = exactLiveRepresentative ? [exactLiveRepresentative] : representatives;
  const providerPreflight = args.mode === 'live-v3-gemini-groq' && args.allowLiveV3Providers
    ? await buildProviderPreflight()
    : undefined;
  const liveProbes = args.mode === 'live-gemini' || args.mode === 'live-v3-gemini-groq'
    ? await runLiveGeminiProbes(args, liveProbeRepresentatives)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    rootPath: args.root,
    mode: args.mode,
    summary: summarize(items),
    representatives,
    liveProbeConfig: args.mode === 'live-gemini' || args.mode === 'live-v3-gemini-groq'
      ? {
          allowLiveGemini: args.allowLiveGemini,
          allowLiveV3Providers: args.allowLiveV3Providers,
          liveLimit: args.liveLimit,
          liveTags: args.liveTags,
          liveFile: args.liveFile,
        }
      : undefined,
    providerPreflight,
    liveProbes,
    items,
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport(args);

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Reading V2 clippings ledger report written: ${args.out}`);
  console.log(JSON.stringify(report.summary, null, 2));
};

if (process.env.VITEST !== 'true') {
  main().then(() => {
    process.exit(0);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[reading-v2-clippings-harness] failed');
    console.error(message);
    process.exitCode = 1;
  });
}

export {
  buildMockedIntermediatePayload,
  buildProviderPreflight,
  buildReport,
  isProviderQuotaStopSignal,
  parseArgs,
  representativeTagsFor,
  representativeForLiveFile,
  runLiveGeminiProbes,
  sanitizeLiveError,
  summarize,
};

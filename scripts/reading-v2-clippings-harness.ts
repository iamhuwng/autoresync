import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildReadingV2AutoSourceLedger,
  verifyReadingV2AutoPayloadAgainstLedger,
  type ReadingV2AutoLedgerPayload,
  type ReadingV2AutoSourceLedger,
} from '../src/services/reading-v2/readingV2AutoImportSourceLedger.service';
import { generateReadingV2AutoImportCandidate } from '../src/services/reading-v2/readingV2AutoImport.service';

const DEFAULT_ROOT = 'C:\\Users\\The Lord\\Desktop\\luyentap\\Clippings';
const MAX_LIVE_GEMINI_PROBES = 5;

interface HarnessArgs {
  readonly root: string;
  readonly out: string;
  readonly mode: 'ledger-only-offline' | 'mocked-intermediate' | 'live-gemini';
  readonly allowLiveGemini: boolean;
  readonly liveLimit: number;
  readonly liveTags: readonly string[];
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
  readonly errorCode: string | null;
}

const parseArgs = (argv: readonly string[]): HarnessArgs => {
  let root = DEFAULT_ROOT;
  let out = path.resolve('output', 'reading-v2-clippings-ledger-report.json');
  let mode: HarnessArgs['mode'] = 'ledger-only-offline';
  let allowLiveGemini = false;
  let liveLimit = 1;
  let liveTags: readonly string[] = ['clean-full-test'];

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
        || requestedMode === 'mocked-intermediate'
        || requestedMode === 'live-gemini'
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
    }
  }

  return { root: path.resolve(root), out, mode, allowLiveGemini, liveLimit, liveTags };
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
}): HarnessItem['status'] => {
  if (input.category === 'unsupported-or-ambiguous-source') {
    return 'unsupported';
  }

  if ((input.verifierIssueCodes ?? []).length > 0) {
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

const scanFile = async (filePath: string, root: string, mode: HarnessArgs['mode']): Promise<HarnessItem> => {
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
  const verifierIssueCodes = mockedPayload
    ? verifyReadingV2AutoPayloadAgainstLedger(mockedPayload, ledger).map((issue) => issue.code)
    : [];
  const generatedInteractionCount = mockedPayload
    ? (mockedPayload.materials ?? []).reduce((total, material) => total + (material.questions?.length ?? 0), 0)
    : 0;
  const boundAnswerCount = mockedPayload && mockedPayload.answerKeyText
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
    status: statusFor({ category, issueCodes, issueSeverities, verifierIssueCodes }),
  };

  return {
    ...itemWithoutTags,
    representativeTags: representativeTagsFor(itemWithoutTags),
  };
};

const summarize = (items: readonly HarnessItem[]) => {
  const count = (predicate: (item: HarnessItem) => boolean): number =>
    items.filter(predicate).length;

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

  if (diagnosticCodes.includes('source-repair-succeeded')) {
    return 'repaired';
  }

  return diagnosticCodes.length > 0 ? 'reviewable' : 'accepted';
};

const selectLiveProbeRepresentatives = (
  representatives: readonly HarnessRepresentative[],
  args: HarnessArgs,
): readonly HarnessRepresentative[] => {
  const tagSet = new Set(args.liveTags);
  const selected = representatives.filter((representative) => tagSet.has(representative.tag));
  return selected.slice(0, args.liveLimit);
};

const sanitizeLiveError = (error: string): string =>
  error
    .replace(/AIza[0-9A-Za-z_-]+/g, '[redacted-api-key]')
    .replace(/key=([^&\s]+)/gi, 'key=[redacted]')
    .replace(/[A-Z]:\\[^:\n\r"]+/g, '[redacted-windows-path]')
    .slice(0, 240);

const runLiveGeminiProbes = async (
  args: HarnessArgs,
  representatives: readonly HarnessRepresentative[],
): Promise<readonly HarnessLiveProbe[]> => {
  if (!args.allowLiveGemini) {
    throw new Error('Live Gemini harness mode requires --allow-live-gemini. This intentionally prevents accidental provider calls with local Clippings content.');
  }

  const probes = selectLiveProbeRepresentatives(representatives, args);

  return Promise.all(probes.map(async (representative) => {
    const rawText = await readFile(path.join(args.root, representative.path), 'utf8');
    const result = await generateReadingV2AutoImportCandidate({
      rawTestText: rawText,
      sourceName: representative.path,
    }, {
      waitBetweenChunksMs: 0,
      maxRepairAttempts: 1,
    });
    const diagnosticCodes = result.diagnostics.map((diagnostic) => diagnostic.code);

    return {
      tag: representative.tag,
      path: representative.path,
      hash: representative.hash,
      success: result.success,
      status: statusFromLiveResult(result.success, diagnosticCodes),
      passageCount: result.success ? result.passageCount : 0,
      questionCount: result.success ? result.questionCount : 0,
      diagnosticCodes,
      errorCode: result.success ? null : sanitizeLiveError(result.error),
    };
  }));
};

const buildReport = async (args: HarnessArgs) => {
  const files = await collectMarkdownFiles(args.root);
  const items = await Promise.all(files.map((filePath) => scanFile(filePath, args.root, args.mode)));
  const representatives = selectRepresentatives(items);
  const liveProbes = args.mode === 'live-gemini'
    ? await runLiveGeminiProbes(args, representatives)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    rootPath: args.root,
    mode: args.mode,
    summary: summarize(items),
    representatives,
    liveProbeConfig: args.mode === 'live-gemini'
      ? {
          allowLiveGemini: args.allowLiveGemini,
          liveLimit: args.liveLimit,
          liveTags: args.liveTags,
        }
      : undefined,
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
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[reading-v2-clippings-harness] failed');
    console.error(message);
    process.exitCode = 1;
  });
}

export {
  buildMockedIntermediatePayload,
  buildReport,
  parseArgs,
  representativeTagsFor,
  sanitizeLiveError,
  summarize,
};

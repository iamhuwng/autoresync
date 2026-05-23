import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildReadingV2AutoSourceLedger,
  type ReadingV2AutoSourceLedger,
} from '../src/services/reading-v2/readingV2AutoImportSourceLedger.service';
import type {
  ReadingV2AutoImportDiagnostic,
  ReadingV2AutoImportResult,
} from '../src/services/reading-v2/readingV2AutoImport.service';
import {
  normalizeReadingV2ImportCandidate,
  parseReadingV2TeacherAnswerKey,
} from '../src/services/reading-v2/readingV2ImportNormalization.service';
import { deriveReadingV2VisibleNumbers } from '../src/services/reading-v2/readingV2Numbering.service';
import { validateReadingV2Draft } from '../src/services/reading-v2/readingV2Validation.service';
import type { ReadingV2Document, ReadingV2TaskGroup } from '../src/types/readingV2.types';

interface GoldGroup {
  readonly passage: number;
  readonly range: string;
  readonly start: number;
  readonly end: number;
  readonly taskType: string;
  readonly answerRule?: string;
  readonly sourceLines: string;
}

interface GoldBaseline {
  readonly sourceName: string;
  readonly sourcePath: string;
  readonly passages: readonly {
    readonly passage: number;
    readonly title: string;
    readonly sourceLines: string;
    readonly questionRange: string;
  }[];
  readonly groups: readonly GoldGroup[];
  readonly answers: readonly {
    readonly question: number;
    readonly answer: string;
  }[];
}

interface Args {
  readonly source: string;
  readonly out: string;
  readonly allowLiveV4Provider: boolean;
}

const DEFAULT_SOURCE = 'C:\\Users\\The Lord\\Desktop\\luyentap\\Clippings\\Practice Cam 10 Reading Test 04.md';
const DEFAULT_OUT = 'output/reading-v2-auto-v4-clippings-e2e/report.json';

const enableTrustedAdminKeyLookup = (): void => {
  process.env.READING_V2_TRUSTED_ADMIN_KEYS ??= 'true';
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() || process.env.GCLOUD_ACCESS_TOKEN?.trim()) {
    return;
  }

  try {
    const token = execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLOUDSDK_CORE_DISABLE_PROMPTS: '1',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 90000,
      windowsHide: true,
    }).trim();

    if (token) {
      process.env.GOOGLE_OAUTH_ACCESS_TOKEN = token;
    }
  } catch {
    // The provider key registry will still use authenticated Firestore or .env keys.
  }
};

const parseArgs = (argv: readonly string[]): Args => {
  let source = DEFAULT_SOURCE;
  let out = DEFAULT_OUT;
  let allowLiveV4Provider = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source') {
      source = argv[index + 1] ?? source;
      index += 1;
      continue;
    }
    if (token === '--out') {
      out = argv[index + 1] ?? out;
      index += 1;
      continue;
    }
    if (token === '--allow-live-v4-provider') {
      allowLiveV4Provider = true;
    }
  }

  return {
    source: path.resolve(source),
    out: path.resolve(out),
    allowLiveV4Provider,
  };
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const numberRange = (numbers: readonly number[]): string => {
  if (numbers.length === 0) {
    return '';
  }
  const sorted = [...new Set(numbers)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start = sorted[0]!;
  let previous = sorted[0]!;

  for (const current of sorted.slice(1)) {
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }

  ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  return ranges.join(', ');
};

const normalizeAnswerForCompare = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

const splitAnswerAlternatesForCompare = (value: string): readonly string[] => {
  const variants = new Set<string>();
  for (const segment of value.split('|')) {
    const slashParts = segment.split('/').map((part) => part.trim()).filter(Boolean);
    if (slashParts.length <= 1) {
      variants.add(normalizeAnswerForCompare(segment));
      continue;
    }

    const firstWords = slashParts[0].split(/\s+/).filter(Boolean);
    const lastWords = slashParts[slashParts.length - 1].split(/\s+/).filter(Boolean);
    const sharedPrefix = firstWords.length > 1 ? firstWords.slice(0, -1).join(' ') : '';
    const sharedSuffix = lastWords.length > 1 ? lastWords.slice(1).join(' ') : '';

    slashParts.forEach((part, index) => {
      const words = part.split(/\s+/).filter(Boolean);
      if (index === 0 && sharedSuffix && words.length === 1) {
        variants.add(normalizeAnswerForCompare(`${part} ${sharedSuffix}`));
        return;
      }
      if (index > 0 && sharedPrefix && words.length === 1) {
        variants.add(normalizeAnswerForCompare(`${sharedPrefix} ${part}`));
        return;
      }
      variants.add(normalizeAnswerForCompare(part));
    });
  }

  return [...variants].filter(Boolean).sort();
};

const answersEquivalentForCompare = (expected: string, actual: string): boolean => {
  const expectedAlternates = splitAnswerAlternatesForCompare(expected);
  const actualAlternates = splitAnswerAlternatesForCompare(actual);
  return expectedAlternates.length === actualAlternates.length
    && expectedAlternates.every((value, index) => value === actualAlternates[index]);
};

const goldBaselineFor = (sourcePath: string): GoldBaseline => ({
  sourceName: 'Practice Cam 10 Reading Test 04',
  sourcePath,
  passages: [
    { passage: 1, title: 'The megafires of California', sourceLines: '53-143', questionRange: '1-13' },
    { passage: 2, title: 'Second nature', sourceLines: '145-247', questionRange: '14-26' },
    { passage: 3, title: 'When evolution runs backwards', sourceLines: '251-385', questionRange: '27-40' },
  ],
  groups: [
    { passage: 1, range: '1-6', start: 1, end: 6, taskType: 'notes-completion', answerRule: 'ONE WORD AND/OR A NUMBER', sourceLines: '85-117' },
    { passage: 1, range: '7-13', start: 7, end: 13, taskType: 'true-false-not-given', sourceLines: '119-143' },
    { passage: 2, range: '14-18', start: 14, end: 18, taskType: 'summary-completion', answerRule: 'NO MORE THAN TWO WORDS', sourceLines: '191-199' },
    { passage: 2, range: '19-22', start: 19, end: 22, taskType: 'matching-features', answerRule: 'A-G people list', sourceLines: '201-231' },
    { passage: 2, range: '23-26', start: 23, end: 26, taskType: 'matching-information', answerRule: 'A-H sections', sourceLines: '233-247' },
    { passage: 3, range: '27-31', start: 27, end: 31, taskType: 'multiple-choice', answerRule: 'A-D per question', sourceLines: '281-335' },
    { passage: 3, range: '32-36', start: 32, end: 36, taskType: 'matching-sentence-endings', answerRule: 'A-G endings list', sourceLines: '337-365' },
    { passage: 3, range: '37-40', start: 37, end: 40, taskType: 'yes-no-not-given', sourceLines: '367-385' },
  ],
  answers: [
    { question: 1, answer: 'spread' },
    { question: 2, answer: '10/ten times' },
    { question: 3, answer: 'below' },
    { question: 4, answer: 'fuel' },
    { question: 5, answer: 'seasons' },
    { question: 6, answer: 'homes/housing' },
    { question: 7, answer: 'TRUE' },
    { question: 8, answer: 'FALSE' },
    { question: 9, answer: 'TRUE' },
    { question: 10, answer: 'TRUE' },
    { question: 11, answer: 'NOT GIVEN' },
    { question: 12, answer: 'FALSE' },
    { question: 13, answer: 'FALSE' },
    { question: 14, answer: 'transformation/change' },
    { question: 15, answer: 'young age' },
    { question: 16, answer: 'optimism' },
    { question: 17, answer: 'skills/techniques' },
    { question: 18, answer: 'negative emotions/feelings' },
    { question: 19, answer: 'E' },
    { question: 20, answer: 'C' },
    { question: 21, answer: 'G' },
    { question: 22, answer: 'A' },
    { question: 23, answer: 'E' },
    { question: 24, answer: 'C' },
    { question: 25, answer: 'G' },
    { question: 26, answer: 'H' },
    { question: 27, answer: 'C' },
    { question: 28, answer: 'D' },
    { question: 29, answer: 'C' },
    { question: 30, answer: 'B' },
    { question: 31, answer: 'A' },
    { question: 32, answer: 'F' },
    { question: 33, answer: 'G' },
    { question: 34, answer: 'A' },
    { question: 35, answer: 'B' },
    { question: 36, answer: 'D' },
    { question: 37, answer: 'NOT GIVEN' },
    { question: 38, answer: 'YES' },
    { question: 39, answer: 'NO' },
    { question: 40, answer: 'YES' },
  ],
});

const sanitize = (value: string): string =>
  value
    .replace(/(^|[^0-9A-Za-z])AIza[0-9A-Za-z_-]+/g, '$1[redacted-api-key]')
    .replace(/(^|[^0-9A-Za-z])gsk_[0-9A-Za-z]+/g, '$1[redacted-api-key]')
    .replace(/(^|[^0-9A-Za-z])sk-[0-9A-Za-z_-]+/g, '$1[redacted-api-key]')
    .replace(/[A-Z]:\\[^:\n\r"]+/g, '[redacted-windows-path]')
    .slice(0, 500);

const safeDiagnostics = (
  diagnostics: readonly ReadingV2AutoImportDiagnostic[],
): readonly Record<string, unknown>[] =>
  diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: sanitize(diagnostic.message),
    passageNumber: diagnostic.passageNumber,
    questionNumber: diagnostic.questionNumber,
    stage: diagnostic.stage,
    groupRange: diagnostic.groupRange,
    sourceRange: diagnostic.sourceRange,
    verifierIssueCodes: diagnostic.verifierIssueCodes,
    repairScopes: diagnostic.repairScopes,
    providerResult: diagnostic.providerResult,
    verifierResult: diagnostic.verifierResult,
  }));

const orderedTaskGroupsFor = (document: ReadingV2Document): readonly ReadingV2TaskGroup[] =>
  document.sectionIds.flatMap((sectionId) => {
    const section = document.sections[sectionId];
    return (section?.taskGroupIds ?? [])
      .map((taskGroupId) => document.taskGroups[taskGroupId])
      .filter((taskGroup): taskGroup is ReadingV2TaskGroup => Boolean(taskGroup));
  });

const appStructureFor = (result: ReadingV2AutoImportResult) => {
  if (!result.success) {
    return null;
  }

  const normalized = normalizeReadingV2ImportCandidate(result.candidate);
  const document = normalized.document;
  const orderedTaskGroups = orderedTaskGroupsFor(document);
  const visibleNumbers = deriveReadingV2VisibleNumbers(orderedTaskGroups, document.interactions);
  const numberByInteraction = new Map(visibleNumbers.map((entry) => [entry.interactionId, entry.displayNumber]));
  const answerKey = parseReadingV2TeacherAnswerKey(result.candidate.answerKeyText);
  const validation = validateReadingV2Draft(document);

  return {
    sectionCount: document.sectionIds.length,
    taskGroupCount: orderedTaskGroups.length,
    interactionCount: Object.keys(document.interactions).length,
    visibleQuestionRange: numberRange(visibleNumbers.map((entry) => entry.displayNumber)),
    taskGroups: orderedTaskGroups.map((taskGroup) => {
      const numbers = taskGroup.interactionIds
        .map((interactionId) => numberByInteraction.get(interactionId))
        .filter((value): value is number => typeof value === 'number');
      return {
        taskGroupId: taskGroup.taskGroupId,
        officialTaskType: taskGroup.officialTaskType,
        range: numberRange(numbers),
        interactionCount: numbers.length,
        publishValidationState: taskGroup.validationState.status,
      };
    }),
    answerKey: {
      rowCount: answerKey.rows.length,
      questionRange: numberRange(answerKey.rows.map((row) => row.questionNumber)),
      unparsedLineCount: answerKey.diagnostics.filter((diagnostic) => diagnostic.code === 'unparsed-answer-key-line').length,
      duplicateQuestionNumbers: answerKey.rows
        .filter((row) => row.bindingStatus === 'duplicate')
        .map((row) => row.questionNumber),
      answers: answerKey.rows.map((row) => ({
        question: row.questionNumber,
        answer: row.rawAnswerText,
        parsedAnswerValues: row.parsedAnswerValues,
        bindingStatus: row.bindingStatus,
      })),
    },
    validation: {
      blockingIssueCount: validation.blockingIssues.length,
      warningIssueCount: validation.warningIssues.length,
      blockingMessages: validation.blockingIssues.map((issue) => sanitize(issue.message)),
      warningMessages: validation.warningIssues.map((issue) => sanitize(issue.message)),
    },
  };
};

const ledgerSummaryFor = (ledger: ReadingV2AutoSourceLedger) => ({
  category: ledger.category,
  expectedFullTest: ledger.expectedFullTest,
  passageCount: ledger.passages.length,
  passageNumbers: ledger.passages.map((passage) => passage.passageNumber),
  questionCount: ledger.questionNumbers.length,
  questionRange: numberRange(ledger.questionNumbers),
  questionRanges: ledger.questionRanges.map((range) => ({
    passageNumber: range.passageNumber,
    range: `${range.start}-${range.end}`,
    lineNumber: range.lineNumber,
  })),
  answerKeyRowCount: ledger.answerKeyRows.length,
  answerKeyQuestionRange: numberRange(ledger.answerKeyRows.map((row) => row.questionNumber)),
  referenceBankCount: ledger.referenceBanks.length,
  pollutionMarkerCount: ledger.pollutionMarkers.length,
  issues: ledger.issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    message: sanitize(issue.message),
  })),
});

const ledgerAdvisoryFor = (gold: GoldBaseline, ledger: ReadingV2AutoSourceLedger) => {
  const expectedAnswerQuestions = gold.answers.map((answer) => answer.question);
  const detectedAnswerQuestions = new Set(ledger.answerKeyRows.map((row) => row.questionNumber));
  const missingAnswerRows = expectedAnswerQuestions.filter((question) => !detectedAnswerQuestions.has(question));

  return {
    localPreflightCoverageIsAdvisory: true,
    expectedGoldAnswerRows: expectedAnswerQuestions.length,
    detectedLedgerAnswerRows: ledger.answerKeyRows.length,
    missingByLocalLedgerOnly: missingAnswerRows,
    interpretation: missingAnswerRows.length > 0
      ? 'Local preflight did not classify every visible source answer row. This is a measurement limitation, not a product blocker. The same philosophy applies to messy question areas, task groups, reference banks, passage boundaries, and clipped source clutter: Auto V4 provider output and Studio diagnostics remain the authoritative user-facing parse contract.'
      : 'Local preflight answer-key coverage matched the gold baseline. Auto V4 provider output and Studio diagnostics remain the authoritative user-facing parse contract across source structure, question areas, task groups, and answer-key areas.',
  };
};

const compareGoldToApp = (
  gold: GoldBaseline,
  result: ReadingV2AutoImportResult | null,
  appStructure: ReturnType<typeof appStructureFor>,
) => {
  const expectedQuestions = gold.answers.map((answer) => answer.question);
  const appQuestionNumbers = appStructure?.taskGroups.flatMap((group) => {
    const match = group.range.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
      return [];
    }
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }) ?? [];
  const appQuestionSet = new Set(appQuestionNumbers);
  const missingQuestions = expectedQuestions.filter((question) => !appQuestionSet.has(question));
  const extraQuestions = appQuestionNumbers.filter((question) => !expectedQuestions.includes(question));
  const warningDiagnostics = result?.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning') ?? [];
  const errorDiagnostics = result?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error') ?? [];
  const hasPublishBlockers = result?.success ? result.candidate.publishBlockingPlaceholders.length > 0 : false;
  const goldAnswerByQuestion = new Map(gold.answers.map((answer) => [answer.question, answer.answer]));
  const appAnswerByQuestion = new Map(appStructure?.answerKey.answers.map((answer) => [answer.question, answer.answer]) ?? []);
  const missingAnswerValues = expectedQuestions.filter((question) => !appAnswerByQuestion.has(question));
  const mismatchedAnswerValues = expectedQuestions.flatMap((question) => {
    const expected = goldAnswerByQuestion.get(question);
    const actual = appAnswerByQuestion.get(question);
    if (
      typeof expected !== 'string'
      || typeof actual !== 'string'
      || answersEquivalentForCompare(expected, actual)
    ) {
      return [];
    }

    return [{ question, expected, actual }];
  });
  const hasSilentQuestionLoss = missingQuestions.length > 0
    && warningDiagnostics.length === 0
    && errorDiagnostics.length === 0
    && !hasPublishBlockers;

  const verdict = !result
    ? 'not-run'
    : !result.success
      ? 'blocked'
    : hasSilentQuestionLoss
      ? 'needs-code-fix'
      : missingQuestions.length > 0
        ? 'provider-weakness-caught'
        : 'acceptable';

  return {
    expectedPassageCount: gold.passages.length,
    appPassageCount: result?.success ? result.passageCount : 0,
    expectedQuestionCount: expectedQuestions.length,
    appQuestionCount: result?.success ? result.questionCount : 0,
    expectedAnswerCount: gold.answers.length,
    appAnswerCount: appStructure?.answerKey.rowCount ?? 0,
    missingQuestions,
    extraQuestions,
    missingAnswerValues,
    mismatchedAnswerValues,
    expectedTaskGroups: gold.groups.map((group) => ({
      passage: group.passage,
      range: group.range,
      taskType: group.taskType,
    })),
    appTaskGroups: appStructure?.taskGroups.map((group) => ({
      range: group.range,
      taskType: group.officialTaskType,
      interactionCount: group.interactionCount,
      publishValidationState: group.publishValidationState,
    })) ?? [],
    hasPublishBlockers,
    hasSilentQuestionLoss,
    verdict,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const rawText = await readFile(args.source, 'utf8');
  const gold = goldBaselineFor(args.source);
  const ledger = buildReadingV2AutoSourceLedger({
    rawText,
    sourceName: args.source,
  });
  const diagnosticEvents: Record<string, unknown>[] = [];
  let liveResult: ReadingV2AutoImportResult | null = null;

  if (args.allowLiveV4Provider) {
    enableTrustedAdminKeyLookup();
    const { generateReadingV2AutoImportCandidate } = await import('../src/services/reading-v2/readingV2AutoImport.service');
    liveResult = await generateReadingV2AutoImportCandidate({
      rawTestText: rawText,
      sourceName: path.basename(args.source),
    }, {
      waitBetweenChunksMs: 0,
      maxRepairAttempts: 1,
      captureRawProviderDebug: false,
      onDiagnosticEvent: (event, payload) => {
        diagnosticEvents.push({
          event,
          payload: JSON.parse(JSON.stringify(payload, (_key, value) =>
            typeof value === 'string' ? sanitize(value) : value,
          )),
        });
      },
    });
  }

  const appStructure = liveResult ? appStructureFor(liveResult) : null;
  const comparison = compareGoldToApp(gold, liveResult, appStructure);
  const report = {
    generatedAt: new Date().toISOString(),
    verdict: comparison.verdict,
    source: {
      path: args.source,
      byteLength: Buffer.byteLength(rawText, 'utf8'),
      charLength: rawText.length,
      lineCount: rawText.split(/\r?\n/).length,
      sha256: sha256(rawText),
      fullTextIncluded: false,
    },
    method: {
      goldParse: [
        'Read source frontmatter and passage/question headings.',
        'Used source line coordinates for passage and group boundaries.',
        'Classified task groups by explicit instruction text and option banks.',
        'Copied answer-key values from visible answer section only.',
        'Compared app output by coverage, task group shape, answer-key binding, diagnostics, and publish safety.',
      ],
      appParse: args.allowLiveV4Provider
        ? 'Live Auto V4 provider path via generateReadingV2AutoImportCandidate.'
        : 'Not run; rerun with --allow-live-v4-provider to send this Clippings content to configured providers.',
    },
    gold,
    ledger: ledgerSummaryFor(ledger),
    ledgerAdvisory: ledgerAdvisoryFor(gold, ledger),
    appResult: liveResult
      ? {
          success: liveResult.success,
          reviewStatus: liveResult.reviewStatus ?? (liveResult.success ? 'ready' : 'blocked'),
          provider: liveResult.provider,
          model: liveResult.model,
          passageCount: liveResult.success ? liveResult.passageCount : 0,
          questionCount: liveResult.success ? liveResult.questionCount : 0,
          error: liveResult.success ? null : sanitize(liveResult.error),
          diagnostics: safeDiagnostics(liveResult.diagnostics),
          publishBlockingPlaceholders: liveResult.success
            ? liveResult.candidate.publishBlockingPlaceholders.map(sanitize)
            : [],
          uncertaintyMarkers: liveResult.success
            ? liveResult.candidate.uncertaintyMarkers.map(sanitize)
            : [],
        }
      : null,
    appStructure,
    diagnosticEvents,
    comparison,
    advice: [
      'Keep Auto V4 as assistant, not judge: open editable drafts when safe, but block publish until repair items are handled.',
      'Do not turn local preflight into a second brittle source parser; it is an advisory guardrail before the provider-owned parse across passage structure, question areas, task groups, option/reference banks, and answer keys.',
      'Treat missing answer-key bindings, question coverage, task-group coverage, and ambiguous source areas as review diagnostics unless normalization cannot build an editable draft.',
      'Improve provider prompts only after report proves which task group or answer range is consistently lost.',
      'Never accept silent coverage loss: missing questions require diagnostics and publish blockers.',
    ],
  };

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Reading V2 Auto V4 Clippings E2E report written: ${args.out}`);
  console.log(`Verdict: ${comparison.verdict}`);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[reading-v2-auto-v4-clippings-e2e] failed');
    console.error(error);
    process.exit(1);
  });

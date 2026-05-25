import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReadingV2AutoImportCandidate, type ReadingV2AutoImportDiagnostic, type ReadingV2AutoImportResult } from '../src/services/reading-v2/readingV2AutoImport.service';
import { normalizeReadingV2ImportCandidate, parseReadingV2TeacherAnswerKey } from '../src/services/reading-v2/readingV2ImportNormalization.service';
import { deriveReadingV2VisibleNumbers } from '../src/services/reading-v2/readingV2Numbering.service';
import { validateReadingV2Draft } from '../src/services/reading-v2/readingV2Validation.service';
import type { ReadingV2Document, ReadingV2TaskGroup } from '../src/types/readingV2.types';

interface GoldGroup {
  readonly passage: number;
  readonly range: string;
  readonly taskType: string;
  readonly strict?: boolean;
  readonly expectedOptionLabels?: readonly string[];
  readonly expectedParagraphLabels?: readonly string[];
  readonly expectedBlankCount?: number;
  readonly expectedImageCount?: number;
  readonly vocabulary?: readonly string[];
  readonly selectionCount?: number;
  readonly answerRule?: string;
  readonly sourceConflict?: string;
}

interface GoldFixture {
  readonly fixtureId: string;
  readonly title: string;
  readonly groups: readonly GoldGroup[];
  readonly answers: readonly { readonly question: number; readonly answer: string }[];
}

interface FixtureEntry {
  readonly fixtureId: string;
  readonly rawPath: string;
  readonly goldPath: string;
}

interface Manifest {
  readonly fixtures: readonly FixtureEntry[];
}

const repoRoot = 'C:/Users/The Lord/Desktop/luyentap-writing-import-rebased';
const outputRoot = path.join(repoRoot, 'output/reading-v2-auto-v4-task-type-fixtures');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const fixtureFilter = new Set<string>();
  let manifestPath = path.join(outputRoot, 'manifest.json');
  let outDir = path.join(outputRoot, 'runs');

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--manifest') {
      manifestPath = path.resolve(args[index + 1] ?? manifestPath);
      index += 1;
      continue;
    }
    if (token === '--fixture') {
      const fixtureId = args[index + 1];
      if (fixtureId) {
        fixtureFilter.add(fixtureId);
      }
      index += 1;
      continue;
    }
    if (token === '--out-dir') {
      outDir = path.resolve(args[index + 1] ?? outDir);
      index += 1;
    }
  }

  return { fixtureFilter, manifestPath, outDir };
};

const enableTrustedAdminKeyLookup = (): void => {
  process.env.READING_V2_TRUSTED_ADMIN_KEYS ??= 'true';
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim() || process.env.GCLOUD_ACCESS_TOKEN?.trim()) {
    return;
  }

  try {
    const token = execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], {
      encoding: 'utf8',
      env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 90_000,
      windowsHide: true,
    }).trim();
    if (token) {
      process.env.GOOGLE_OAUTH_ACCESS_TOKEN = token;
    }
  } catch {
    // Provider registry can still use configured local keys.
  }
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const numberRange = (numbers: readonly number[]): string => {
  const sorted = [...new Set(numbers)].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return '';
  }

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

const normalizeAnswer = (value: string): string =>
  value.replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const expandOptionalAnswerText = (value: string): readonly string[] => {
  const match = value.match(/\(([^)]*)\)/);
  if (!match || match.index === undefined) {
    return [value];
  }

  const before = value.slice(0, match.index);
  const optional = match[1] ?? '';
  const after = value.slice(match.index + match[0].length);
  return [
    ...expandOptionalAnswerText(`${before}${after}`),
    ...expandOptionalAnswerText(`${before}${optional}${after}`),
  ];
};

const answerVariants = (value: string): readonly string[] => {
  const variants = new Set<string>();
  for (const expandedValue of expandOptionalAnswerText(value)) {
    for (const pipeSegment of expandedValue.split('|')) {
      const slashParts = pipeSegment.split('/').map((part) => part.trim()).filter(Boolean);
      if (slashParts.length <= 1) {
        variants.add(normalizeAnswer(pipeSegment));
        continue;
      }

      const firstWords = slashParts[0]!.split(/\s+/).filter(Boolean);
      const lastWords = slashParts[slashParts.length - 1]!.split(/\s+/).filter(Boolean);
      const sharedPrefix = firstWords.length > 1 ? firstWords.slice(0, -1).join(' ') : '';
      const sharedSuffix = lastWords.length > 1 ? lastWords.slice(1).join(' ') : '';
      slashParts.forEach((part, index) => {
        const words = part.split(/\s+/).filter(Boolean);
        if (index === 0 && sharedSuffix && words.length === 1) {
          variants.add(normalizeAnswer(`${part} ${sharedSuffix}`));
          return;
        }
        if (index > 0 && sharedPrefix && words.length === 1) {
          variants.add(normalizeAnswer(`${sharedPrefix} ${part}`));
          return;
        }
        variants.add(normalizeAnswer(part));
      });
    }
  }
  return [...variants].filter(Boolean).sort();
};

const answersEquivalent = (expected: string, actual: string): boolean => {
  const expectedVariants = new Set(answerVariants(expected));
  const actualVariants = answerVariants(actual);
  return actualVariants.some((value) => expectedVariants.has(value));
};

const safeDiagnostic = (diagnostic: ReadingV2AutoImportDiagnostic): Record<string, unknown> => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  passageNumber: diagnostic.passageNumber,
  questionNumber: diagnostic.questionNumber,
  stage: diagnostic.stage,
  groupRange: diagnostic.groupRange,
  sourceRange: diagnostic.sourceRange,
  verifierIssueCodes: diagnostic.verifierIssueCodes,
  repairScopes: diagnostic.repairScopes,
  providerResult: diagnostic.providerResult,
  verifierResult: diagnostic.verifierResult,
});

const orderedTaskGroupsFor = (document: ReadingV2Document): readonly ReadingV2TaskGroup[] =>
  document.sectionIds.flatMap((sectionId) => {
    const section = document.sections[sectionId];
    return (section?.taskGroupIds ?? [])
      .map((taskGroupId) => document.taskGroups[taskGroupId])
      .filter((taskGroup): taskGroup is ReadingV2TaskGroup => Boolean(taskGroup));
  });

const appStructureFor = (document: ReadingV2Document, answerKeyText: string | undefined) => {
  const taskGroups = orderedTaskGroupsFor(document);
  const visibleNumbers = deriveReadingV2VisibleNumbers(taskGroups, document.interactions);
  const numberByInteraction = new Map(visibleNumbers.map((entry) => [entry.interactionId, entry.displayNumber]));
  const answerKey = parseReadingV2TeacherAnswerKey(answerKeyText);
  const validation = validateReadingV2Draft(document);

  return {
    sectionCount: document.sectionIds.length,
    interactionCount: Object.keys(document.interactions).length,
    visibleQuestionRange: numberRange(visibleNumbers.map((entry) => entry.displayNumber)),
    taskGroups: taskGroups.map((taskGroup) => {
      const numbers = taskGroup.interactionIds
        .map((interactionId) => numberByInteraction.get(interactionId))
        .filter((value): value is number => typeof value === 'number');
      const optionSets = taskGroup.optionSetRefs
        .map((optionSetId) => document.optionSets[optionSetId])
        .filter(Boolean)
        .map((optionSet) => ({
          optionSetId: optionSet.optionSetId,
          optionCount: optionSet.options.length,
          labels: optionSet.options.map((option) => option.label),
          distinctLabels: [...new Set(optionSet.options.map((option) => option.label))],
          sampleText: optionSet.options.slice(0, 6).map((option) => ({ label: option.label, text: option.text })),
        }));
      const stimulusKinds = taskGroup.stimulusRefs
        .map((ref) => document.stimuli[ref.stimulusId])
        .filter(Boolean)
        .map((stimulus) => ({
          kind: stimulus.content.kind,
          title: stimulus.title ?? '',
          anchorCount: stimulus.anchorIds.length,
          imageUrl: stimulus.content.kind === 'diagram-content' ? stimulus.content.imageUrl : undefined,
          mediaUrl: stimulus.content.kind === 'media-content' ? stimulus.content.mediaUrl : undefined,
          hotspotCount: stimulus.content.kind === 'diagram-content' ? stimulus.content.hotspots.length : undefined,
          tableRowCount: stimulus.content.kind === 'table-content' ? stimulus.content.rows.length : undefined,
          flowStepCount: stimulus.content.kind === 'flowchart-content' ? stimulus.content.steps.length : undefined,
        }));

      return {
        taskGroupId: taskGroup.taskGroupId,
        sectionId: taskGroup.sectionId,
        range: numberRange(numbers),
        numbers,
        officialTaskType: taskGroup.officialTaskType,
        engineeringFamily: taskGroup.engineeringFamily,
        answerRule: taskGroup.answerRule,
        responseShape: taskGroup.answerRule.responseShape,
        instructionText: taskGroup.instructionBlocks.map((block) => block.text).join('\n'),
        interactionCount: numbers.length,
        validationStatus: taskGroup.validationState.status,
        optionSets,
        optionLabels: optionSets.flatMap((optionSet) => optionSet.labels),
        distinctOptionLabels: [...new Set(optionSets.flatMap((optionSet) => optionSet.labels))],
        stimulusKinds,
        prompts: taskGroup.interactionIds.map((interactionId) => ({
          number: numberByInteraction.get(interactionId),
          prompt: document.interactions[interactionId]?.promptText ?? '',
          responseShape: document.interactions[interactionId]?.responseShape,
          acceptableAnswers: document.interactions[interactionId]?.scoringRule.acceptableAnswers ?? [],
        })),
      };
    }),
    answerKey: {
      rowCount: answerKey.rows.length,
      questionRange: numberRange(answerKey.rows.map((row) => row.questionNumber)),
      diagnostics: answerKey.diagnostics,
      answers: answerKey.rows.map((row) => ({
        question: row.questionNumber,
        answer: row.rawAnswerText,
        parsedAnswerValues: row.parsedAnswerValues,
        bindingStatus: row.bindingStatus,
      })),
    },
    validation: {
      canPublish: validation.blockingIssues.length === 0,
      blockingIssueCount: validation.blockingIssues.length,
      warningIssueCount: validation.warningIssues.length,
      blockingIssues: validation.blockingIssues,
      warningIssues: validation.warningIssues,
    },
  };
};

const compare = (gold: GoldFixture, result: ReadingV2AutoImportResult, appStructure: ReturnType<typeof appStructureFor> | null) => {
  const goldAnswerByQuestion = new Map(gold.answers.map((answer) => [answer.question, answer.answer]));
  const appAnswerByQuestion = new Map(appStructure?.answerKey.answers.map((answer) => [answer.question, answer.answer]) ?? []);
  const expectedQuestions = gold.answers.map((answer) => answer.question);
  const appQuestions = appStructure?.taskGroups.flatMap((group) => group.numbers) ?? [];
  const appGroupByRange = new Map((appStructure?.taskGroups ?? []).map((group) => [group.range, group]));

  const groupComparisons = gold.groups.map((expected) => {
    const actual = appGroupByRange.get(expected.range);
    const actualLabels = actual?.distinctOptionLabels ?? [];
    const responseShape = actual?.responseShape;
    const issues: string[] = [];

    if (!actual) {
      issues.push('missing-group');
    } else {
      if (actual.officialTaskType !== expected.taskType) {
        issues.push(`task-type:${actual.officialTaskType}`);
      }
      if (typeof expected.expectedBlankCount === 'number' && actual.interactionCount !== expected.expectedBlankCount) {
        issues.push(`interaction-count:${actual.interactionCount}`);
      }
      if (expected.expectedOptionLabels) {
        const expectedLabels = [...expected.expectedOptionLabels].sort();
        const gotLabels = [...actualLabels].sort();
        if (expectedLabels.join('|') !== gotLabels.join('|')) {
          issues.push(`option-labels:${gotLabels.join(',') || 'none'}`);
        }
      }
      if (!expected.expectedOptionLabels && actualLabels.length > 0 && !['multiple-choice'].includes(expected.taskType)) {
        issues.push(`unexpected-option-bank:${actualLabels.join(',')}`);
      }
      if (expected.vocabulary) {
        const expectedVocabulary = expected.vocabulary.includes('YES') ? 'YNNG' : 'TFNG';
        if (responseShape?.kind !== 'binary-judgement' || responseShape.vocabulary !== expectedVocabulary) {
          issues.push(`vocabulary:${responseShape?.kind === 'binary-judgement' ? responseShape.vocabulary : responseShape?.kind ?? 'none'}`);
        }
      }
      if (typeof expected.selectionCount === 'number') {
        if (responseShape?.kind !== 'multi-select' || responseShape.selectionLimit !== expected.selectionCount) {
          issues.push(`selection-limit:${responseShape?.kind === 'multi-select' ? responseShape.selectionLimit : responseShape?.kind ?? 'none'}`);
        }
      }
      if (expected.taskType === 'table-completion') {
        if (responseShape?.kind !== 'structured-entry' || responseShape.structure !== 'table') {
          issues.push(`structure:${responseShape?.kind === 'structured-entry' ? responseShape.structure : responseShape?.kind ?? 'none'}`);
        }
      }
      if (expected.taskType === 'flowchart-completion') {
        if (responseShape?.kind !== 'structured-entry' || responseShape.structure !== 'flowchart') {
          issues.push(`structure:${responseShape?.kind === 'structured-entry' ? responseShape.structure : responseShape?.kind ?? 'none'}`);
        }
      }
      if (expected.taskType === 'diagram-labeling') {
        if (responseShape?.kind !== 'structured-entry' || responseShape.structure !== 'diagram') {
          issues.push(`structure:${responseShape?.kind === 'structured-entry' ? responseShape.structure : responseShape?.kind ?? 'none'}`);
        }
        const imageCount = actual.stimulusKinds.filter((stimulus) =>
          (stimulus.kind === 'diagram-content' && stimulus.imageUrl)
          || (stimulus.kind === 'media-content' && stimulus.mediaUrl),
        ).length;
        if (typeof expected.expectedImageCount === 'number' && imageCount < expected.expectedImageCount) {
          issues.push(imageCount < 1
            ? 'diagram-image-missing'
            : `diagram-image-count:${imageCount}/${expected.expectedImageCount}`);
        }
      }
    }

    return {
      expectedRange: expected.range,
      expectedTaskType: expected.taskType,
      actualTaskType: actual?.officialTaskType ?? null,
      actualRange: actual?.range ?? null,
      actualInteractionCount: actual?.interactionCount ?? 0,
      expectedOptionLabels: expected.expectedOptionLabels ?? null,
      actualOptionLabels: actualLabels,
      responseShape: actual?.responseShape ?? null,
      stimulusKinds: actual?.stimulusKinds ?? [],
      strict: expected.strict ?? false,
      sourceConflict: expected.sourceConflict,
      ok: issues.length === 0,
      issues,
    };
  });

  const answerMismatches = expectedQuestions.flatMap((question) => {
    const expected = goldAnswerByQuestion.get(question);
    const actual = appAnswerByQuestion.get(question);
    if (typeof expected !== 'string') {
      return [];
    }
    if (typeof actual !== 'string') {
      return [{ question, expected, actual: null, issue: 'missing-answer' }];
    }
    return answersEquivalent(expected, actual) ? [] : [{ question, expected, actual, issue: 'answer-mismatch' }];
  });

  const missingQuestions = expectedQuestions.filter((question) => !appQuestions.includes(question));
  const extraQuestions = appQuestions.filter((question) => !expectedQuestions.includes(question));
  const strictGroupFailures = groupComparisons.filter((group) => group.strict && !group.ok);
  const softGroupFailures = groupComparisons.filter((group) => !group.strict && !group.ok);
  const diagnostics = result.diagnostics.map((diagnostic) => diagnostic.code);
  const publishBlockers = result.success ? result.candidate.publishBlockingPlaceholders : [];
  const canPublish = Boolean(result.success && appStructure?.validation.canPublish && publishBlockers.length === 0);
  const repairSignals = diagnostics.filter((code) => String(code).includes('repair') || String(code).includes('mismatch') || String(code).includes('missing'));

  const acceptableRepair = result.success
    && canPublish
    && missingQuestions.length === 0
    && extraQuestions.length === 0
    && answerMismatches.length === 0
    && strictGroupFailures.length === 0;

  return {
    expectedQuestionCount: expectedQuestions.length,
    appQuestionCount: appQuestions.length,
    missingQuestions,
    extraQuestions,
    expectedAnswerCount: gold.answers.length,
    appAnswerCount: appStructure?.answerKey.rowCount ?? 0,
    answerMismatches,
    groupComparisons,
    strictGroupFailures,
    softGroupFailures,
    canPublish,
    publishBlockers,
    validation: appStructure?.validation ?? null,
    repairSignals,
    acceptableRepair,
    verdict: !result.success
      ? 'blocked'
      : acceptableRepair
      ? 'acceptable-minimal-teacher-edit'
      : canPublish
      ? 'publishable-but-needs-review'
      : 'blocked-or-not-publishable',
  };
};

const runFixture = async (fixture: FixtureEntry, outDir: string) => {
  const rawText = await readFile(fixture.rawPath, 'utf8');
  const gold = JSON.parse(await readFile(fixture.goldPath, 'utf8')) as GoldFixture;
  const fixtureOut = path.join(outDir, fixture.fixtureId);
  await mkdir(fixtureOut, { recursive: true });

  const diagnosticEvents: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  const result = await generateReadingV2AutoImportCandidate({
    rawTestText: rawText,
    sourceName: path.basename(fixture.rawPath),
  }, {
    forceV4Pipeline: true,
    waitBetweenChunksMs: 0,
    maxRepairAttempts: 1,
    captureRawProviderDebug: false,
    onDiagnosticEvent: (event, payload) => {
      diagnosticEvents.push({ event, payload });
    },
  });
  const finishedAt = new Date().toISOString();

  let normalizedDocument: unknown = null;
  let appStructure: ReturnType<typeof appStructureFor> | null = null;
  if (result.success) {
    const normalized = normalizeReadingV2ImportCandidate(result.candidate);
    normalizedDocument = normalized.document;
    appStructure = appStructureFor(normalized.document, result.candidate.answerKeyText);
    await writeFile(path.join(fixtureOut, 'candidate.json'), JSON.stringify(result.candidate, null, 2), 'utf8');
    await writeFile(path.join(fixtureOut, 'normalized-document.json'), JSON.stringify(normalized.document, null, 2), 'utf8');
  }

  const comparison = compare(gold, result, appStructure);
  const report = {
    fixtureId: fixture.fixtureId,
    title: gold.title,
    startedAt,
    finishedAt,
    rawInput: {
      path: fixture.rawPath,
      charLength: rawText.length,
      lineCount: rawText.split(/\r?\n/).length,
      sha256: sha256(rawText),
      fullTextIncluded: false,
    },
    goldPath: fixture.goldPath,
    appResult: {
      success: result.success,
      reviewStatus: result.reviewStatus ?? (result.success ? 'ready' : 'blocked'),
      provider: result.provider,
      model: result.model,
      passageCount: result.success ? result.passageCount : 0,
      questionCount: result.success ? result.questionCount : 0,
      error: result.success ? null : result.error,
      diagnostics: result.diagnostics.map(safeDiagnostic),
      publishBlockingPlaceholders: result.success ? result.candidate.publishBlockingPlaceholders : [],
      uncertaintyMarkers: result.success ? result.candidate.uncertaintyMarkers : [],
    },
    appStructure,
    comparison,
    normalizedDocumentWritten: Boolean(normalizedDocument),
  };

  await writeFile(path.join(fixtureOut, 'auto-result.json'), JSON.stringify(report.appResult, null, 2), 'utf8');
  await writeFile(path.join(fixtureOut, 'app-structure.json'), JSON.stringify(appStructure, null, 2), 'utf8');
  await writeFile(path.join(fixtureOut, 'comparison.json'), JSON.stringify(comparison, null, 2), 'utf8');
  await writeFile(path.join(fixtureOut, 'diagnostic-events.json'), JSON.stringify(diagnosticEvents, null, 2), 'utf8');
  await writeFile(path.join(fixtureOut, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  return {
    fixtureId: fixture.fixtureId,
    verdict: comparison.verdict,
    acceptableRepair: comparison.acceptableRepair,
    success: result.success,
    appQuestionCount: comparison.appQuestionCount,
    appAnswerCount: comparison.appAnswerCount,
    strictGroupFailures: comparison.strictGroupFailures.map((group) => ({
      range: group.expectedRange,
      expectedTaskType: group.expectedTaskType,
      actualTaskType: group.actualTaskType,
      issues: group.issues,
    })),
    answerMismatchCount: comparison.answerMismatches.length,
    missingQuestions: comparison.missingQuestions,
    diagnosticCodes: report.appResult.diagnostics.map((diagnostic) => diagnostic.code),
    outDir: fixtureOut,
  };
};

const main = async () => {
  const args = parseArgs();
  const manifest = JSON.parse(await readFile(args.manifestPath, 'utf8')) as Manifest;
  const fixtures = manifest.fixtures.filter((fixture) =>
    args.fixtureFilter.size === 0 || args.fixtureFilter.has(fixture.fixtureId),
  );
  if (fixtures.length === 0) {
    throw new Error('No fixtures selected.');
  }

  enableTrustedAdminKeyLookup();
  await mkdir(args.outDir, { recursive: true });
  const summaries = [];
  for (const fixture of fixtures) {
    console.log(`[reading-v2-fixture-e2e] running ${fixture.fixtureId}`);
    summaries.push(await runFixture(fixture, args.outDir));
  }

  await writeFile(path.join(args.outDir, 'summary.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    fixtureCount: summaries.length,
    summaries,
  }, null, 2), 'utf8');
  console.log(`[reading-v2-fixture-e2e] wrote ${path.join(args.outDir, 'summary.json')}`);
  for (const summary of summaries) {
    console.log(`${summary.fixtureId}: ${summary.verdict}; questions=${summary.appQuestionCount}; answers=${summary.appAnswerCount}; strictFailures=${summary.strictGroupFailures.length}; answerMismatches=${summary.answerMismatchCount}`);
  }
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[reading-v2-fixture-e2e] failed');
    console.error(error);
    process.exit(1);
  });

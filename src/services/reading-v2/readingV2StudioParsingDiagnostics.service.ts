import type {
  ReadingV2Document,
  ReadingV2Interaction,
  ReadingV2OptionSet,
  ReadingV2ResponseShape,
  ReadingV2StimulusNode,
  ReadingV2TaskGroup,
  ReadingV2ValidationIssue,
} from '../../types/readingV2.types';
import { deriveReadingV2VisibleNumbers } from './readingV2Numbering.service';
import type { ReadingV2ImportCandidate } from './readingV2ImportNormalization.service';
import { READING_V2_STRUCTURED_MATERIALS_START } from './readingV2ExternalAiPrompt.service';
import type { ReadingV2ValidationResult } from './readingV2Validation.service';

export interface ReadingV2StudioParsingDiagnosticsInput {
  readonly document: ReadingV2Document;
  readonly metadata: {
    readonly title?: string;
    readonly materialKind?: string;
    readonly durationMinutes?: number;
    readonly difficulty?: string;
    readonly targetBand?: string;
    readonly visibility?: string;
    readonly ownerId?: string;
  };
  readonly importCandidate?: ReadingV2ImportCandidate;
  readonly validationResult: ReadingV2ValidationResult;
  readonly mode: string;
  readonly activeStep: string;
  readonly draftId: string;
  readonly materialId?: string;
  readonly revisionToken: string;
  readonly generatedAt?: string;
}

interface AnswerKeyRowDiagnostic {
  readonly lineNumber: number;
  readonly questionNumber: number;
  readonly answers: readonly string[];
  readonly rawLine: string;
}

export type ReadingV2TeacherImportDiagnosticSeverity = 'success' | 'info' | 'warning' | 'error';

export type ReadingV2TeacherImportDiagnosticGroupId =
  | 'source-structure'
  | 'answer-key'
  | 'question-binding'
  | 'task-type'
  | 'option-bank'
  | 'structured-layout'
  | 'projection-safety'
  | 'publish-readiness';

export interface ReadingV2TeacherImportDiagnosticTarget {
  readonly kind:
    | 'source'
    | 'answer-key-line'
    | 'section'
    | 'stimulus'
    | 'task-group'
    | 'interaction'
    | 'option-set'
    | 'anchor'
    | 'publish';
  readonly objectId?: string;
  readonly questionNumber?: number;
  readonly sourceLine?: number;
  readonly step: 'Passages' | 'Questions' | 'Publish';
}

export interface ReadingV2TeacherImportDiagnosticItem {
  readonly id: string;
  readonly severity: ReadingV2TeacherImportDiagnosticSeverity;
  readonly message: string;
  readonly detail?: string;
  readonly target: ReadingV2TeacherImportDiagnosticTarget;
}

export interface ReadingV2TeacherImportDiagnosticGroup {
  readonly id: ReadingV2TeacherImportDiagnosticGroupId;
  readonly title: string;
  readonly summary: string;
  readonly severity: ReadingV2TeacherImportDiagnosticSeverity;
  readonly items: readonly ReadingV2TeacherImportDiagnosticItem[];
}

export type ReadingV2TeacherAnswerKeyAuthorityStatus =
  | 'missing'
  | 'malformed'
  | 'partial'
  | 'authoritative';

export interface ReadingV2TeacherAnswerKeyAuthority {
  readonly status: ReadingV2TeacherAnswerKeyAuthorityStatus;
  readonly label: string;
  readonly message: string;
  readonly boundQuestionCount: number;
  readonly totalQuestionCount: number;
  readonly blocking: boolean;
}

export interface ReadingV2TeacherImportDiagnostics {
  readonly authority: ReadingV2TeacherAnswerKeyAuthority;
  readonly groups: readonly ReadingV2TeacherImportDiagnosticGroup[];
}

const countLines = (value: string | undefined): number =>
  value?.trim() ? value.split(/\r?\n/).length : 0;

const stimulusText = (stimulus: ReadingV2StimulusNode | undefined): string => {
  if (!stimulus) {
    return '';
  }

  switch (stimulus.content.kind) {
    case 'passage-content':
      return stimulus.content.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
    case 'table-content':
      return stimulus.content.rows.map((row) => row.map((cell) => cell.text).join(' | ')).join('\n');
    case 'flowchart-content':
      return stimulus.content.steps.map((step) => step.text).join('\n');
    case 'diagram-content':
      return [stimulus.content.imageAlt, ...stimulus.content.hotspots.map((hotspot) => hotspot.label)].join('\n');
    case 'media-content':
      return stimulus.content.alt;
    default:
      return '';
  }
};

const isAnswerKeyHeadingLine = (line: string): boolean =>
  /^(?:answers?|answer\s+key|reading\s+passage\s+\d+|passage\s+\d+|section\s+\d+)\s*:?\s*$/i.test(
    line.replace(/^#+\s*/, '').trim(),
  );

const parseAnswerKeyRows = (answerKeyText: string | undefined): {
  readonly rows: readonly AnswerKeyRowDiagnostic[];
  readonly unparsedLines: readonly { readonly lineNumber: number; readonly rawLine: string }[];
  readonly duplicateQuestionNumbers: readonly number[];
} => {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  const rows: AnswerKeyRowDiagnostic[] = [];
  const unparsedLines: { readonly lineNumber: number; readonly rawLine: string }[] = [];

  (answerKeyText ?? '').split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    if (isAnswerKeyHeadingLine(line)) {
      return;
    }

    const match = line.match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-=]?\s+(.+)$/i);
    const questionNumber = match?.[1] ? Number(match[1]) : NaN;
    const answerText = match?.[2]?.trim();

    if (!Number.isFinite(questionNumber) || !answerText) {
      unparsedLines.push({ lineNumber: index + 1, rawLine });
      return;
    }

    if (seen.has(questionNumber)) {
      duplicates.add(questionNumber);
    }
    seen.add(questionNumber);
    rows.push({
      lineNumber: index + 1,
      questionNumber,
      answers: answerText.split('|').map((answer) => answer.trim()).filter(Boolean),
      rawLine,
    });
  });

  return {
    rows,
    unparsedLines,
    duplicateQuestionNumbers: [...duplicates].sort((left, right) => left - right),
  };
};

const responseShapeSummary = (responseShape: ReadingV2ResponseShape): Record<string, unknown> => {
  switch (responseShape.kind) {
    case 'free-text':
      return { kind: responseShape.kind, wordLimit: responseShape.wordLimit };
    case 'single-choice':
    case 'multi-select':
    case 'matching':
      return { ...responseShape };
    case 'binary-judgement':
      return { kind: responseShape.kind, vocabulary: responseShape.vocabulary };
    case 'structured-entry':
      return { kind: responseShape.kind, structure: responseShape.structure };
    default:
      return { kind: 'unknown' };
  }
};

const issuesFor = (
  issues: readonly ReadingV2ValidationIssue[],
  objectId: string,
): readonly ReadingV2ValidationIssue[] =>
  issues.filter((issue) => issue.objectId === objectId);

const optionSetSummary = (
  taskGroup: ReadingV2TaskGroup,
  optionSets: Readonly<Record<string, ReadingV2OptionSet>>,
) =>
  taskGroup.optionSetRefs.map((optionSetId) => {
    const optionSet = optionSets[optionSetId];
    return {
      optionSetId,
      optionCount: optionSet?.options.length ?? 0,
      emptyOptionCount: optionSet?.options.filter((option) => option.text.trim().length === 0).length ?? 0,
      labels: optionSet?.options.map((option) => option.label) ?? [],
    };
  });

const answerCount = (interaction: ReadingV2Interaction): number =>
  interaction.scoringRule.acceptableAnswers?.filter((answer) => answer.trim().length > 0).length ?? 0;

const byCode = (issues: readonly ReadingV2ValidationIssue[]): Record<string, number> =>
  issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});

const severityWeight: Record<ReadingV2TeacherImportDiagnosticSeverity, number> = {
  success: 0,
  info: 1,
  warning: 2,
  error: 3,
};

const maxSeverity = (
  items: readonly ReadingV2TeacherImportDiagnosticItem[],
  fallback: ReadingV2TeacherImportDiagnosticSeverity = 'info',
): ReadingV2TeacherImportDiagnosticSeverity =>
  items.length === 0
    ? fallback
    : items.slice(1).reduce<ReadingV2TeacherImportDiagnosticSeverity>(
        (current, item) => (severityWeight[item.severity] > severityWeight[current] ? item.severity : current),
        items[0]?.severity ?? fallback,
      );

const answerKeyTarget = (
  sourceLine?: number,
  questionNumber?: number,
): ReadingV2TeacherImportDiagnosticTarget => ({
  kind: 'answer-key-line',
  sourceLine,
  questionNumber,
  step: 'Questions',
});

const issueTarget = (
  issue: ReadingV2ValidationIssue,
  document: ReadingV2Document,
): ReadingV2TeacherImportDiagnosticTarget => {
  const objectId = issue.objectId;

  if (objectId?.startsWith('teacher-answer-key-line-')) {
    return {
      kind: 'answer-key-line',
      objectId,
      sourceLine: Number(objectId.replace('teacher-answer-key-line-', '')) || undefined,
      step: 'Questions',
    };
  }

  if (objectId && document.interactions[objectId]) {
    const interaction = document.interactions[objectId];
    return {
      kind: 'interaction',
      objectId,
      questionNumber: interaction.reviewLabel.displayNumber,
      step: 'Questions',
    };
  }

  if (objectId && document.taskGroups[objectId]) {
    return { kind: 'task-group', objectId, step: 'Questions' };
  }

  if (objectId && document.optionSets[objectId]) {
    return { kind: 'option-set', objectId, step: 'Questions' };
  }

  if (objectId && document.anchors[objectId]) {
    return { kind: 'anchor', objectId, step: 'Passages' };
  }

  if (objectId && document.stimuli[objectId]) {
    return { kind: 'stimulus', objectId, step: 'Passages' };
  }

  if (objectId && document.sections[objectId]) {
    return { kind: 'section', objectId, step: 'Passages' };
  }

  return { kind: 'publish', objectId, step: 'Publish' };
};

const diagnosticGroupForIssue = (issue: ReadingV2ValidationIssue): ReadingV2TeacherImportDiagnosticGroupId => {
  const message = issue.message.toLowerCase();

  if (issue.code === 'teacher-answer-key-parse' || issue.code === 'unbound-teacher-answer-key-row') {
    return 'answer-key';
  }

  if (
    message.includes('option list')
    || message.includes('option bank')
    || message.includes('answer options')
    || message.includes('matching answer')
  ) {
    return 'option-bank';
  }

  if (
    message.includes('table')
    || message.includes('flowchart')
    || message.includes('diagram')
    || message.includes('structured-entry')
    || message.includes('visible blank marker')
  ) {
    return 'structured-layout';
  }

  if (
    message.includes('answer key')
    || issue.code === 'missing-scoring-response-shape'
    || issue.code === 'unresolved-draft-placeholder'
  ) {
    return 'question-binding';
  }

  if (issue.code === 'unsupported-import-structure' || issue.code === 'unresolved-import-uncertainty') {
    return 'source-structure';
  }

  if (issue.code === 'invalid-packaged-material-assembly') {
    return 'task-type';
  }

  return 'publish-readiness';
};

const diagnosticGroupForAutoCode = (code: string): ReadingV2TeacherImportDiagnosticGroupId => {
  if (code.startsWith('answer-key')) {
    return 'answer-key';
  }

  if (
    code.includes('answer-row')
    || code.includes('question-missing')
    || code.includes('question-extra')
    || code.includes('question-range')
  ) {
    return 'question-binding';
  }

  if (code.includes('reference-bank')) {
    return 'option-bank';
  }

  if (code.includes('instruction')) {
    return 'task-type';
  }

  if (code.includes('trim') || code.includes('passage') || code.includes('source-repair') || code.includes('source-ledger')) {
    return 'source-structure';
  }

  if (code.includes('canonical-validation')) {
    return 'publish-readiness';
  }

  return 'source-structure';
};

const autoDiagnosticTarget = (diagnostic: {
  readonly passageNumber?: number;
  readonly questionNumber?: number;
}): ReadingV2TeacherImportDiagnosticTarget => {
  if (diagnostic.questionNumber) {
    return {
      kind: 'interaction',
      questionNumber: diagnostic.questionNumber,
      step: 'Questions',
    };
  }

  if (diagnostic.passageNumber) {
    return {
      kind: 'section',
      questionNumber: diagnostic.passageNumber,
      step: 'Passages',
    };
  }

  return { kind: 'source', step: 'Passages' };
};

const groupTitle: Record<ReadingV2TeacherImportDiagnosticGroupId, string> = {
  'source-structure': 'Source Structure',
  'answer-key': 'Teacher Answer Key',
  'question-binding': 'Question Binding',
  'task-type': 'Task Type Compatibility',
  'option-bank': 'Option Banks',
  'structured-layout': 'Tables, Flowcharts, And Diagrams',
  'projection-safety': 'Projection Safety',
  'publish-readiness': 'Publish Readiness',
};

const groupSummary = (
  itemCount: number,
  severity: ReadingV2TeacherImportDiagnosticSeverity,
): string => {
  if (itemCount === 0) {
    return 'No issues found.';
  }

  const noun = itemCount === 1 ? 'item' : 'items';
  if (severity === 'error') {
    return `${itemCount} blocking ${noun}.`;
  }
  if (severity === 'warning') {
    return `${itemCount} ${noun} need review.`;
  }
  return `${itemCount} ${noun} recorded.`;
};

const createGroup = (
  groupId: ReadingV2TeacherImportDiagnosticGroupId,
  items: readonly ReadingV2TeacherImportDiagnosticItem[],
): ReadingV2TeacherImportDiagnosticGroup => {
  const severity = maxSeverity(items, items.length === 0 ? 'success' : 'info');

  return {
    id: groupId,
    title: groupTitle[groupId],
    summary: groupSummary(items.length, severity),
    severity,
    items,
  };
};

const normalizeAnswerKeyLineDetail = (row: AnswerKeyRowDiagnostic): string =>
  `Line ${row.lineNumber}: ${row.rawLine}`;

export const buildReadingV2TeacherImportDiagnostics = (
  input: ReadingV2StudioParsingDiagnosticsInput,
): ReadingV2TeacherImportDiagnostics => {
  const answerKey = parseAnswerKeyRows(input.importCandidate?.answerKeyText);
  const visibleNumbers = deriveReadingV2VisibleNumbers(
    input.document.sectionIds.flatMap((sectionId) => {
      const section = input.document.sections[sectionId];
      return section
        ? section.taskGroupIds
            .map((taskGroupId) => input.document.taskGroups[taskGroupId])
            .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
        : [];
    }),
    input.document.interactions,
  );
  const visibleQuestionNumbers = new Set(visibleNumbers.map((entry) => entry.displayNumber));
  const boundTeacherKeyQuestionNumbers = new Set(
    answerKey.rows
      .filter((row) =>
        visibleQuestionNumbers.has(row.questionNumber)
        && row.answers.some((answer) => answer.trim().length > 0)
        && !answerKey.duplicateQuestionNumbers.includes(row.questionNumber),
      )
      .map((row) => row.questionNumber),
  );
  const missingAnswerRows = [...visibleQuestionNumbers]
    .filter((questionNumber) => !boundTeacherKeyQuestionNumbers.has(questionNumber))
    .sort((left, right) => left - right);
  const extraRows = answerKey.rows
    .filter((row) => !visibleQuestionNumbers.has(row.questionNumber))
    .map((row) => row.questionNumber);
  const malformed = answerKey.unparsedLines.length > 0 || answerKey.duplicateQuestionNumbers.length > 0;
  const hasAnswerKeyText = (input.importCandidate?.answerKeyText ?? '').trim().length > 0;
  const keyBlocking = !hasAnswerKeyText || malformed || missingAnswerRows.length > 0 || extraRows.length > 0;
  const authorityStatus: ReadingV2TeacherAnswerKeyAuthorityStatus = !hasAnswerKeyText
    ? 'missing'
    : malformed
      ? 'malformed'
      : keyBlocking
        ? 'partial'
        : 'authoritative';
  const authority: ReadingV2TeacherAnswerKeyAuthority = {
    status: authorityStatus,
    label:
      authorityStatus === 'authoritative'
        ? 'Teacher key authoritative'
        : authorityStatus === 'partial'
          ? 'Teacher key partially bound'
          : authorityStatus === 'malformed'
            ? 'Teacher key needs repair'
            : 'Teacher key missing',
    message:
      authorityStatus === 'authoritative'
        ? `All ${visibleQuestionNumbers.size} visible questions have valid teacher-key answers.`
        : authorityStatus === 'partial'
          ? `${boundTeacherKeyQuestionNumbers.size} of ${visibleQuestionNumbers.size} visible questions have bound teacher-key answers.`
          : authorityStatus === 'malformed'
          ? 'Some answer-key rows cannot be read safely.'
          : 'Paste the teacher answer key before publishing.',
    boundQuestionCount: boundTeacherKeyQuestionNumbers.size,
    totalQuestionCount: visibleQuestionNumbers.size,
    blocking: keyBlocking,
  };

  const grouped = new Map<ReadingV2TeacherImportDiagnosticGroupId, ReadingV2TeacherImportDiagnosticItem[]>();
  const pushItem = (
    groupId: ReadingV2TeacherImportDiagnosticGroupId,
    item: ReadingV2TeacherImportDiagnosticItem,
  ) => {
    grouped.set(groupId, [...(grouped.get(groupId) ?? []), item]);
  };

  if (!hasAnswerKeyText) {
    pushItem('answer-key', {
      id: 'answer-key-missing',
      severity: 'error',
      message: 'Teacher answer key is missing.',
      target: { kind: 'answer-key-line', step: 'Questions' },
    });
  }

  answerKey.unparsedLines.forEach((line) => {
    pushItem('answer-key', {
      id: `answer-key-unparsed-${line.lineNumber}`,
      severity: 'error',
      message: `Answer key line ${line.lineNumber} must start with a question number.`,
      detail: `Line ${line.lineNumber}: ${line.rawLine}`,
      target: answerKeyTarget(line.lineNumber),
    });
  });

  answerKey.rows
    .filter((row) => answerKey.duplicateQuestionNumbers.includes(row.questionNumber))
    .forEach((row) => {
      pushItem('answer-key', {
        id: `answer-key-duplicate-${row.lineNumber}`,
        severity: 'error',
        message: `Question ${row.questionNumber} appears more than once in the teacher answer key.`,
        detail: normalizeAnswerKeyLineDetail(row),
        target: answerKeyTarget(row.lineNumber, row.questionNumber),
      });
    });

  missingAnswerRows.forEach((questionNumber) => {
    pushItem('question-binding', {
      id: `missing-answer-row-${questionNumber}`,
      severity: 'error',
      message: `Question ${questionNumber} has no bound teacher-key answer.`,
      target: { kind: 'interaction', questionNumber, step: 'Questions' },
    });
  });

  extraRows.forEach((questionNumber) => {
    const row = answerKey.rows.find((candidate) => candidate.questionNumber === questionNumber);
    pushItem('question-binding', {
      id: `extra-answer-row-${questionNumber}`,
      severity: 'error',
      message: `Answer key row ${questionNumber} has no matching visible question.`,
      detail: row ? normalizeAnswerKeyLineDetail(row) : undefined,
      target: answerKeyTarget(row?.lineNumber, questionNumber),
    });
  });

  input.importCandidate?.publishBlockingPlaceholders.forEach((message, index) => {
    pushItem('source-structure', {
      id: `candidate-blocker-${index + 1}`,
      severity: 'error',
      message,
      target: { kind: 'source', step: 'Passages' },
    });
  });

  input.importCandidate?.uncertaintyMarkers.forEach((message, index) => {
    pushItem('source-structure', {
      id: `candidate-uncertainty-${index + 1}`,
      severity: 'warning',
      message,
      target: { kind: 'source', step: 'Passages' },
    });
  });

  input.importCandidate?.autoImportDiagnostics?.forEach((diagnostic, index) => {
    pushItem(diagnosticGroupForAutoCode(diagnostic.code), {
      id: `auto-import-${index + 1}-${diagnostic.code}`,
      severity: diagnostic.severity,
      message: diagnostic.message,
      detail: [
        diagnostic.code,
        diagnostic.sourceRange ? `source: ${diagnostic.sourceRange}` : undefined,
        diagnostic.repairScopes?.length ? `scope: ${diagnostic.repairScopes.join(', ')}` : undefined,
      ].filter(Boolean).join(' | '),
      target: autoDiagnosticTarget(diagnostic),
    });
  });

  input.validationResult.blockingIssues.forEach((issue, index) => {
    const groupId = diagnosticGroupForIssue(issue);
    pushItem(groupId, {
      id: `validation-${index + 1}-${issue.code}-${issue.objectId ?? 'draft'}`,
      severity: issue.severity === 'error' ? 'error' : issue.severity,
      message: issue.message,
      target: issueTarget(issue, input.document),
    });
  });

  pushItem('projection-safety', {
    id: 'projection-author-only',
    severity: 'success',
    message: 'Raw key text, scoring rules, import evidence, and diagnostics remain author-only.',
    target: { kind: 'publish', step: 'Publish' },
  });

  pushItem('publish-readiness', {
    id: 'publish-readiness-state',
    severity: input.validationResult.canPublish && !authority.blocking ? 'success' : 'error',
    message: input.validationResult.canPublish && !authority.blocking
      ? 'Publish gate is clear.'
      : authority.blocking
        ? 'Publish is blocked by teacher answer-key binding.'
        : 'Publish is blocked by validation.',
    target: { kind: 'publish', step: 'Publish' },
  });

  return {
    authority,
    groups: ([
      'source-structure',
      'answer-key',
      'question-binding',
      'task-type',
      'option-bank',
      'structured-layout',
      'projection-safety',
      'publish-readiness',
    ] satisfies readonly ReadingV2TeacherImportDiagnosticGroupId[]).map((groupId) =>
      createGroup(groupId, grouped.get(groupId) ?? []),
    ),
  };
};

export const buildReadingV2StudioParsingDiagnostics = (
  input: ReadingV2StudioParsingDiagnosticsInput,
): Record<string, unknown> => {
  const orderedTaskGroups = input.document.sectionIds.flatMap((sectionId) => {
    const section = input.document.sections[sectionId];
    return section
      ? section.taskGroupIds
          .map((taskGroupId) => input.document.taskGroups[taskGroupId])
          .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
      : [];
  });
  const visibleNumbers = deriveReadingV2VisibleNumbers(orderedTaskGroups, input.document.interactions);
  const visibleNumberByInteractionId = new Map(
    visibleNumbers.map((entry) => [entry.interactionId, entry.displayNumber]),
  );
  const answerKey = parseAnswerKeyRows(input.importCandidate?.answerKeyText);
  const allInteractions = orderedTaskGroups.flatMap((taskGroup) =>
    taskGroup.interactionIds
      .map((interactionId) => input.document.interactions[interactionId])
      .filter((interaction): interaction is ReadingV2Interaction => interaction !== undefined),
  );
  const parsedQuestionNumbers = new Set(
    allInteractions
      .map((interaction) => visibleNumberByInteractionId.get(interaction.interactionId))
      .filter((displayNumber): displayNumber is number => displayNumber !== undefined),
  );
  const extraAnswerKeyRows = answerKey.rows
    .filter((row) => !parsedQuestionNumbers.has(row.questionNumber))
    .map((row) => row.questionNumber);
  const missingAnswerKeyRows = [...parsedQuestionNumbers]
    .filter((questionNumber) => !answerKey.rows.some((row) => row.questionNumber === questionNumber))
    .sort((left, right) => left - right);
  const sourceText = input.importCandidate?.rawText ?? '';
  const answerKeyText = input.importCandidate?.answerKeyText ?? '';
  const sourceFormat = sourceText.includes(READING_V2_STRUCTURED_MATERIALS_START)
    ? 'structured-json'
    : sourceText.trim()
      ? 'plain-text'
      : 'none';
  const structuredSource = sourceFormat === 'structured-json';
  const questionRangeHeadingCount = (sourceText.match(/####\s+Questions\s+\d+\s*[-\u2013\u2014]\s*\d+/gi) ?? []).length;
  const numberedQuestionLineCount = (sourceText.match(/^\s*(?:\*\*)?\d{1,3}(?:\*\*)?[\).]?\s+\S+/gm) ?? []).length;
  const taskTypeCounts = orderedTaskGroups.reduce<Record<string, number>>((counts, taskGroup) => {
    counts[taskGroup.officialTaskType] = (counts[taskGroup.officialTaskType] ?? 0) + 1;
    return counts;
  }, {});
  const placeholderCount = allInteractions.filter((interaction) => interaction.placeholder === true).length;
  const answeredQuestionCount = allInteractions.filter((interaction) => answerCount(interaction) > 0).length;
  const inputQualityFlags = [
    ...(sourceText.trim() ? [] : ['source_text_missing']),
    ...(structuredSource ? ['structured_json_payload_detected'] : []),
    ...(answerKeyText.trim() ? [] : ['answer_key_missing']),
    ...(structuredSource || questionRangeHeadingCount > 0 ? [] : ['question_range_headings_missing']),
    ...(structuredSource || numberedQuestionLineCount >= allInteractions.length ? [] : ['numbered_question_lines_below_parsed_questions']),
    ...(answerKey.rows.length >= allInteractions.length ? [] : ['answer_key_rows_below_parsed_questions']),
    ...(extraAnswerKeyRows.length === 0 ? [] : ['answer_key_has_rows_without_questions']),
    ...(answerKey.unparsedLines.length === 0 ? [] : ['answer_key_has_unparsed_lines']),
    ...(placeholderCount === 0 ? [] : ['parsed_questions_still_have_placeholders']),
    ...(input.validationResult.canPublish ? [] : ['publish_blocked_after_parse']),
  ];

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    purpose: 'Reading V2 Studio parsing diagnostics for prompt/input improvement and parser-state review.',
    context: {
      mode: input.mode,
      activeStep: input.activeStep,
      draftId: input.draftId,
      materialId: input.materialId,
      revisionToken: input.revisionToken,
      schemaVersion: input.document.schemaVersion,
      deliveryEngine: input.document.deliveryEngine,
      documentId: input.document.documentId,
      title: input.metadata.title || input.document.title,
      materialKind: input.metadata.materialKind,
      durationMinutes: input.metadata.durationMinutes,
      difficulty: input.metadata.difficulty,
      targetBand: input.metadata.targetBand,
      visibility: input.metadata.visibility,
      ownerId: input.metadata.ownerId,
    },
    sourceInput: {
      sourceKind: input.importCandidate?.sourceKind ?? 'none',
      sourceFormat,
      fileName: input.importCandidate?.fileName,
      supportedFileType: input.importCandidate?.supportedFileType,
      rawTextIncluded: Boolean(sourceText),
      rawText: sourceText,
      rawTextCharCount: sourceText.length,
      rawTextLineCount: countLines(sourceText),
      questionRangeHeadingCount,
      numberedQuestionLineCount,
      answerKey: {
        rawTextIncluded: Boolean(answerKeyText),
        rawText: answerKeyText,
        rawTextCharCount: answerKeyText.length,
        rawTextLineCount: countLines(answerKeyText),
        rowCount: answerKey.rows.length,
        rows: answerKey.rows,
        unparsedLines: answerKey.unparsedLines,
        duplicateQuestionNumbers: answerKey.duplicateQuestionNumbers,
      },
      candidateEvidence: input.importCandidate?.evidence ?? [],
      candidateUncertainty: input.importCandidate?.uncertaintyMarkers ?? [],
      candidatePublishBlockers: input.importCandidate?.publishBlockingPlaceholders ?? [],
      candidateAutoDiagnostics: input.importCandidate?.autoImportDiagnostics ?? [],
    },
    parseState: {
      inputQualityFlags,
      promptImprovementHints: [
        ...(structuredSource ? ['For structured JSON, preserve sectionInstructions.sectionReferences and per-question labeledOptions exactly.'] : []),
        ...(structuredSource ? ['For table-completion JSON, emit a real table structure with one stable blank target per question.'] : []),
        ...(structuredSource || questionRangeHeadingCount > 0 ? [] : ['Ask external AI to preserve headings exactly as #### Questions 1-5.']),
        ...(structuredSource || numberedQuestionLineCount >= allInteractions.length ? [] : ['Ask external AI to keep every question on its own numbered line.']),
        ...(answerKey.rows.length >= allInteractions.length ? [] : ['Ask external AI or teacher workflow to provide one answer-key row per visible question number.']),
        ...(extraAnswerKeyRows.length === 0 ? [] : ['Check whether source text dropped questions for some answer-key rows.']),
        ...(answerKey.unparsedLines.length === 0 ? [] : ['Use answer-key rows like 1 answer or Q1 answer, with alternatives separated by |.']),
      ],
      passages: input.document.sectionIds.map((sectionId, index) => {
        const section = input.document.sections[sectionId];
        const firstStimulusId = section?.stimulusIds[0];
        const stimulus = firstStimulusId ? input.document.stimuli[firstStimulusId] : undefined;
        const text = stimulusText(stimulus);
        const taskGroups = section
          ? section.taskGroupIds
              .map((taskGroupId) => input.document.taskGroups[taskGroupId])
              .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
          : [];

        return {
          passageNumber: index + 1,
          sectionId,
          stimulusId: firstStimulusId,
          title: stimulus?.title ?? section?.title ?? '',
          stimulusKind: stimulus?.kind,
          textCharCount: text.length,
          textLineCount: countLines(text),
          paragraphCount: stimulus?.content.kind === 'passage-content' ? stimulus.content.paragraphs.length : 0,
          taskGroupCount: taskGroups.length,
          questionCount: taskGroups.reduce((total, taskGroup) => total + taskGroup.interactionIds.length, 0),
          taskTypes: taskGroups.map((taskGroup) => taskGroup.officialTaskType),
          validationIssues: [
            ...issuesFor(input.validationResult.issues, sectionId),
            ...(firstStimulusId ? issuesFor(input.validationResult.issues, firstStimulusId) : []),
          ],
        };
      }),
      taskGroups: orderedTaskGroups.map((taskGroup) => {
        const interactions = taskGroup.interactionIds
          .map((interactionId) => input.document.interactions[interactionId])
          .filter((interaction): interaction is ReadingV2Interaction => interaction !== undefined);

        return {
          taskGroupId: taskGroup.taskGroupId,
          sectionId: taskGroup.sectionId,
          groupTitle: taskGroup.groupTitle,
          officialTaskType: taskGroup.officialTaskType,
          engineeringFamily: taskGroup.engineeringFamily,
          instructionText: taskGroup.instructionBlocks.map((block) => block.text).join('\n'),
          responseShape: responseShapeSummary(taskGroup.answerRule.responseShape),
          interactionCount: interactions.length,
          answeredQuestionCount: interactions.filter((interaction) => answerCount(interaction) > 0).length,
          placeholderQuestionCount: interactions.filter((interaction) => interaction.placeholder === true).length,
          missingPromptCount: interactions.filter((interaction) => !(interaction.promptText ?? '').trim()).length,
          optionSets: optionSetSummary(taskGroup, input.document.optionSets),
          stimulusRefs: taskGroup.stimulusRefs,
          importEvidenceRefs: taskGroup.importEvidenceRefs ?? [],
          validationStateIssues: taskGroup.validationState.issues,
          validationIssues: issuesFor(input.validationResult.issues, taskGroup.taskGroupId),
        };
      }),
      questions: allInteractions.map((interaction) => ({
        displayNumber: visibleNumberByInteractionId.get(interaction.interactionId),
        interactionId: interaction.interactionId,
        taskGroupId: interaction.taskGroupId,
        taskType: input.document.taskGroups[interaction.taskGroupId]?.officialTaskType,
        responseShape: responseShapeSummary(interaction.responseShape),
        promptText: interaction.promptText ?? '',
        promptCharCount: (interaction.promptText ?? '').length,
        answerCount: answerCount(interaction),
        acceptableAnswers: interaction.scoringRule.acceptableAnswers ?? [],
        placeholder: interaction.placeholder === true,
        primaryAnchorId: interaction.primaryAnchorId,
        validationIssues: issuesFor(input.validationResult.issues, interaction.interactionId),
      })),
      answerKeyBinding: {
        parsedQuestionCount: allInteractions.length,
        visibleQuestionNumbers: [...parsedQuestionNumbers].sort((left, right) => left - right),
        answerKeyRowCount: answerKey.rows.length,
        answeredQuestionCount,
        placeholderQuestionCount: placeholderCount,
        missingAnswerKeyRows,
        extraAnswerKeyRows,
        unparsedAnswerKeyLines: answerKey.unparsedLines,
        duplicateAnswerKeyRows: answerKey.duplicateQuestionNumbers,
      },
      taskTypeCounts,
    },
    validation: {
      canPublish: input.validationResult.canPublish,
      issueCount: input.validationResult.issues.length,
      blockingIssueCount: input.validationResult.blockingIssues.length,
      warningIssueCount: input.validationResult.warningIssues.length,
      informationalIssueCount: input.validationResult.informationalIssues.length,
      issueCountsByCode: byCode(input.validationResult.issues),
      blockingIssues: input.validationResult.blockingIssues,
      allIssues: input.validationResult.issues,
    },
  };
};

export const formatReadingV2StudioParsingDiagnostics = (
  diagnostics: Record<string, unknown>,
): string =>
  [
    'READING V2 STUDIO PARSING DIAGNOSTICS',
    '',
    'Use this to analyze whether pasted input and answer key were good enough, and how to improve the external-AI prompt/parser.',
    '',
    JSON.stringify(diagnostics, null, 2),
  ].join('\n');

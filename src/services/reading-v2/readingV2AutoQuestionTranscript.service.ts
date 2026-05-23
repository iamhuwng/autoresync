import {
  normalizeReadingV2TaskType,
  type ReadingV2CanonicalTaskType,
} from '../../types/readingV2Taxonomy';
import { getReadingV2InstructionText } from './readingV2InstructionTemplates.service';
import type {
  ReadingV2AutoPassagePackage,
  ReadingV2AutoPassagePackageLine,
} from './readingV2AutoPassagePackage.service';
import {
  countReadingV2AutoCompletionBlanks,
  normalizeReadingV2AutoSourceProofText,
} from './readingV2AutoTextGuards.service';

export interface ReadingV2AutoTranscriptQuestionRange {
  readonly start: number;
  readonly end: number;
}

export interface ReadingV2AutoTranscriptOption {
  readonly label: string;
  readonly text: string;
  readonly sourceTextExact?: string;
  readonly normalizedText?: string;
  readonly sourceLines?: readonly number[];
}

export interface ReadingV2AutoTranscriptQuestion {
  readonly number: number;
  readonly promptText: string;
  readonly sourceTextExact?: string;
  readonly normalizedPromptText?: string;
  readonly sourceLines?: readonly number[];
  readonly labeledOptions?: readonly ReadingV2AutoTranscriptOption[];
  readonly sectionReferences?: readonly ReadingV2AutoTranscriptOption[];
}

export interface ReadingV2AutoTranscriptInstructionMeta {
  readonly wordLimit?: number;
  readonly wordLimitText?: string;
  readonly vocabulary?: 'TFNG' | 'YNNG' | string;
  readonly selectionLimit?: number;
  readonly answerSource?: string;
  readonly optionLabelRange?: string;
  readonly referenceLabelRange?: string;
  readonly reuseAllowed?: boolean;
  readonly summaryAnswerMode?: 'text' | 'list';
}

export interface ReadingV2AutoTranscriptNoteLine {
  readonly text: string;
  readonly sourceTextExact?: string;
  readonly normalizedText?: string;
  readonly sourceLines?: readonly number[];
  readonly questionNumber?: number;
  readonly questionNumbers?: readonly number[];
}

export interface ReadingV2AutoTranscriptNoteSection {
  readonly heading?: string;
  readonly questionNumbers?: readonly number[];
  readonly lines?: readonly ReadingV2AutoTranscriptNoteLine[];
}

export interface ReadingV2AutoTranscriptNote {
  readonly title?: string;
  readonly subheading?: string;
  readonly sections?: readonly ReadingV2AutoTranscriptNoteSection[];
  readonly lines?: readonly ReadingV2AutoTranscriptNoteLine[];
}

export interface ReadingV2AutoTranscriptTableCell {
  readonly text: string;
  readonly sourceTextExact?: string;
  readonly normalizedText?: string;
  readonly role?: string;
  readonly questionNumber?: number;
  readonly questionNumbers?: readonly number[];
}

export interface ReadingV2AutoTranscriptTable {
  readonly rows: readonly (readonly ReadingV2AutoTranscriptTableCell[])[];
}

export interface ReadingV2AutoTranscriptFlowStep {
  readonly stepId?: string;
  readonly text: string;
  readonly sourceTextExact?: string;
  readonly normalizedText?: string;
  readonly questionNumber?: number;
  readonly nextStepIds?: readonly string[];
}

export interface ReadingV2AutoTranscriptFlowchart {
  readonly steps: readonly ReadingV2AutoTranscriptFlowStep[];
}

export interface ReadingV2AutoTranscriptDiagramTarget {
  readonly label: string;
  readonly sourceLabelExact?: string;
  readonly normalizedLabel?: string;
  readonly questionNumber: number;
}

export interface ReadingV2AutoTranscriptDiagram {
  readonly imageUrl?: string;
  readonly imageAlt?: string;
  readonly targets: readonly ReadingV2AutoTranscriptDiagramTarget[];
}

export interface ReadingV2AutoQuestionTranscriptGroup {
  readonly questionRange: ReadingV2AutoTranscriptQuestionRange;
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly sourceInstructionText?: string;
  readonly instructionMeta: ReadingV2AutoTranscriptInstructionMeta;
  readonly labeledOptions?: readonly ReadingV2AutoTranscriptOption[];
  readonly sectionReferences?: readonly ReadingV2AutoTranscriptOption[];
  readonly questions: readonly ReadingV2AutoTranscriptQuestion[];
  readonly note?: ReadingV2AutoTranscriptNote;
  readonly table?: ReadingV2AutoTranscriptTable;
  readonly flowchart?: ReadingV2AutoTranscriptFlowchart;
  readonly diagram?: ReadingV2AutoTranscriptDiagram;
  readonly diagnostics?: readonly string[];
}

export interface ReadingV2AutoQuestionTranscript {
  readonly passageNumber: number;
  readonly groups: readonly ReadingV2AutoQuestionTranscriptGroup[];
  readonly diagnostics: readonly string[];
  readonly coverageSummary?: ReadingV2AutoTranscriptCoverageSummary;
}

export interface ReadingV2AutoTranscriptCoverageSummary {
  readonly coveredGroups?: readonly string[];
  readonly coveredQuestions?: readonly number[];
}

export type ReadingV2AutoQuestionTranscriptDiagnosticCode =
  | 'transcript-malformed'
  | 'group-coverage-mismatch'
  | 'duplicate-question-number'
  | 'task-type-conflict'
  | 'missing-reference-bank'
  | 'blank-mismatch'
  | 'source-proof-format-mismatch'
  | 'source-text-exact-missing'
  | 'normalized-text-source-drift';

export interface ReadingV2AutoQuestionTranscriptDiagnostic {
  readonly code: ReadingV2AutoQuestionTranscriptDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
}

interface StructuredSectionInstruction {
  readonly id: string;
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly text: string;
  readonly sourceInstructionEvidence?: string;
  readonly wordLimit?: number;
  readonly wordLimitText?: string;
  readonly vocabulary?: string;
  readonly selectionLimit?: number;
  readonly answerSource?: string;
  readonly optionLabelRange?: string;
  readonly referenceLabelRange?: string;
  readonly reuseAllowed?: boolean;
  readonly questionRange: ReadingV2AutoTranscriptQuestionRange;
  readonly note?: ReadingV2AutoTranscriptNote;
  readonly table?: ReadingV2AutoTranscriptTable;
  readonly flowchart?: ReadingV2AutoTranscriptFlowchart;
  readonly diagram?: ReadingV2AutoTranscriptDiagram;
  readonly sectionReferences?: readonly ReadingV2AutoTranscriptOption[];
  readonly labeledOptions?: readonly ReadingV2AutoTranscriptOption[];
}

interface StructuredQuestion {
  readonly questionNumber: number;
  readonly type: ReadingV2CanonicalTaskType;
  readonly sectionInstructionId: string;
  readonly questionText: string;
  readonly wordLimit?: number;
  readonly labeledOptions?: readonly ReadingV2AutoTranscriptOption[];
  readonly sectionReferences?: readonly ReadingV2AutoTranscriptOption[];
}

export interface ReadingV2AutoTranscriptMaterial {
  readonly passageNumber: number;
  readonly title: string;
  readonly passages: readonly {
    readonly title: string;
    readonly content: string;
  }[];
  readonly sectionInstructions: readonly StructuredSectionInstruction[];
  readonly questions: readonly StructuredQuestion[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numberFrom = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const positiveNumberFrom = (value: unknown): number | undefined => {
  const parsed = numberFrom(value);
  return parsed && parsed > 0 ? parsed : undefined;
};

const stringFrom = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const firstStringFrom = (...values: readonly unknown[]): string | undefined => {
  for (const value of values) {
    const parsed = stringFrom(value);
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
};

const stringsFrom = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const rangeFrom = (value: unknown): ReadingV2AutoTranscriptQuestionRange | undefined => {
  if (Array.isArray(value)) {
    const start = numberFrom(value[0]);
    const end = numberFrom(value[1]);
    return start && end ? { start: Math.min(start, end), end: Math.max(start, end) } : undefined;
  }

  if (isRecord(value)) {
    const start = numberFrom(value.start);
    const end = numberFrom(value.end);
    return start && end ? { start: Math.min(start, end), end: Math.max(start, end) } : undefined;
  }

  return undefined;
};

const numberArrayFrom = (value: unknown): readonly number[] | undefined =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const number = numberFrom(item);
        return number ? [number] : [];
      })
    : undefined;

const optionFrom = (value: unknown): ReadingV2AutoTranscriptOption | null => {
  if (!isRecord(value)) {
    return null;
  }

  const label = stringFrom(value.label);
  const sourceTextExact = firstStringFrom(
    value.sourceTextExact,
    value.exactText,
    value.text,
  );
  const normalizedText = firstStringFrom(
    value.normalizedText,
    value.text,
    value.sourceTextExact,
    value.exactText,
  );
  const text = normalizedText ?? sourceTextExact;
  if (!label || !text) {
    return null;
  }

  return {
    label,
    text,
    ...(sourceTextExact ? { sourceTextExact } : {}),
    ...(normalizedText ? { normalizedText } : {}),
    sourceLines: numberArrayFrom(value.sourceLines),
  };
};

const optionsFrom = (value: unknown): readonly ReadingV2AutoTranscriptOption[] | undefined => {
  const options = Array.isArray(value)
    ? value.flatMap((item) => {
        const option = optionFrom(item);
        return option ? [option] : [];
      })
    : [];
  return options.length > 0 ? options : undefined;
};

const optionsFromCandidate = (value: unknown): readonly ReadingV2AutoTranscriptOption[] | undefined => {
  const direct = optionsFrom(value);
  if (direct?.length) {
    return direct;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return optionsFrom(
    value.options
    ?? value.labeledOptions
    ?? value.references
    ?? value.sectionReferences
    ?? value.referenceBankLines
    ?? value.items
    ?? value.values
    ?? value.choices
    ?? value.choiceOptions
    ?? value.answerChoices,
  );
};

const firstOptionsFromCandidates = (
  ...values: readonly unknown[]
): readonly ReadingV2AutoTranscriptOption[] | undefined => {
  for (const value of values) {
    const options = optionsFromCandidate(value);
    if (options?.length) {
      return options;
    }
  }

  return undefined;
};

const taskTypeUsesOptionBank = (taskType: ReadingV2CanonicalTaskType): boolean =>
  taskType === 'multiple-choice'
  || taskType === 'multiple-select'
  || taskType === 'summary-completion-list';

const taskTypeUsesReferenceBank = (taskType: ReadingV2CanonicalTaskType): boolean =>
  taskType === 'matching-headings'
  || taskType === 'matching-information'
  || taskType === 'matching-features'
  || taskType === 'matching-sentence-endings';

const questionFrom = (
  value: unknown,
  taskType?: ReadingV2CanonicalTaskType,
): ReadingV2AutoTranscriptQuestion | null => {
  if (!isRecord(value)) {
    return null;
  }

  const number = numberFrom(value.number ?? value.questionNumber);
  const sourceTextExact = firstStringFrom(
    value.sourceTextExact,
    value.exactText,
    value.promptText,
    value.questionText,
    value.text,
  );
  const normalizedPromptText = firstStringFrom(
    value.normalizedPromptText,
    value.promptText,
    value.questionText,
    value.text,
    value.sourceTextExact,
    value.exactText,
  );
  const promptText = normalizedPromptText ?? sourceTextExact;
  if (!number || !promptText) {
    return null;
  }

  return {
    number,
    promptText,
    ...(sourceTextExact ? { sourceTextExact } : {}),
    ...(normalizedPromptText ? { normalizedPromptText } : {}),
    sourceLines: numberArrayFrom(value.sourceLines),
    labeledOptions: firstOptionsFromCandidates(
      value.labeledOptions,
      value.options,
      value.optionBank,
      value.optionBanks,
      value.choiceBank,
      value.choiceBanks,
      value.choiceOptions,
      value.answerChoices,
      value.choices,
      taskType && taskTypeUsesOptionBank(taskType) ? value.bank : undefined,
    ),
    sectionReferences: firstOptionsFromCandidates(
      value.sectionReferences,
      value.references,
      value.referenceBankLines,
      value.referenceBank,
      value.referenceBanks,
      value.referenceOptions,
      value.referenceLabels,
      value.choiceOptions,
      value.choices,
      taskType && taskTypeUsesReferenceBank(taskType) ? value.bank : undefined,
    ),
  };
};

const noteLineFrom = (value: unknown): ReadingV2AutoTranscriptNoteLine | null => {
  if (!isRecord(value)) {
    return null;
  }

  const sourceTextExact = firstStringFrom(
    value.sourceTextExact,
    value.exactText,
    value.text,
  );
  const normalizedText = firstStringFrom(
    value.normalizedText,
    value.text,
    value.sourceTextExact,
    value.exactText,
  );
  const text = normalizedText ?? sourceTextExact;
  if (!text) {
    return null;
  }

  return {
    text,
    ...(sourceTextExact ? { sourceTextExact } : {}),
    ...(normalizedText ? { normalizedText } : {}),
    sourceLines: numberArrayFrom(value.sourceLines),
    questionNumber: numberFrom(value.questionNumber),
    questionNumbers: numberArrayFrom(value.questionNumbers),
  };
};

const noteFrom = (value: unknown): ReadingV2AutoTranscriptNote | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const lines = Array.isArray(value.lines)
    ? value.lines.flatMap((item) => {
        const line = noteLineFrom(item);
        return line ? [line] : [];
      })
    : undefined;
  const sections = Array.isArray(value.sections)
    ? value.sections.flatMap((item) => {
        if (!isRecord(item)) {
          return [];
        }
        const sectionLines = Array.isArray(item.lines)
          ? item.lines.flatMap((line) => {
              const parsed = noteLineFrom(line);
              return parsed ? [parsed] : [];
            })
          : undefined;
        return [{
          heading: stringFrom(item.heading),
          questionNumbers: numberArrayFrom(item.questionNumbers),
          lines: sectionLines,
        }];
      })
    : undefined;
  const title = stringFrom(value.title);
  const subheading = stringFrom(value.subheading);
  const normalizedSections = sections?.filter((section) =>
    Boolean(section.heading || section.questionNumbers?.length || section.lines?.length),
  );

  return title || subheading || lines?.length || normalizedSections?.length
    ? {
        title,
        subheading,
        sections: normalizedSections,
        lines,
      }
    : undefined;
};

const tableCellFrom = (value: unknown): ReadingV2AutoTranscriptTableCell | null => {
  if (typeof value === 'string') {
    const text = value.trim();
    return text
      ? {
          text,
          sourceTextExact: text,
          normalizedText: text,
        }
      : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const sourceTextExact = firstStringFrom(
    value.sourceTextExact,
    value.exactText,
    value.text,
  );
  const normalizedText = firstStringFrom(
    value.normalizedText,
    value.text,
    value.sourceTextExact,
    value.exactText,
  );
  const text = normalizedText ?? sourceTextExact;
  if (!text) {
    return null;
  }

  return {
    text,
    ...(sourceTextExact ? { sourceTextExact } : {}),
    ...(normalizedText ? { normalizedText } : {}),
    ...(typeof value.role === 'string' ? { role: value.role } : {}),
    questionNumber: numberFrom(value.questionNumber),
    questionNumbers: numberArrayFrom(value.questionNumbers),
  };
};

const tableFrom = (value: unknown): ReadingV2AutoTranscriptTable | undefined => {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    return undefined;
  }

  const rows = value.rows.flatMap((row) => {
    if (!Array.isArray(row)) {
      return [];
    }
    const cells = row.flatMap((cell) => {
      const parsed = tableCellFrom(cell);
      return parsed ? [parsed] : [];
    });
    return cells.length > 0 ? [cells] : [];
  });

  return rows.length > 0 ? { rows } : undefined;
};

const flowchartFrom = (value: unknown): ReadingV2AutoTranscriptFlowchart | undefined => {
  if (!isRecord(value) || !Array.isArray(value.steps)) {
    return undefined;
  }

  const steps = value.steps.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const sourceTextExact = firstStringFrom(
      item.sourceTextExact,
      item.exactText,
      item.text,
    );
    const normalizedText = firstStringFrom(
      item.normalizedText,
      item.text,
      item.sourceTextExact,
      item.exactText,
    );
    const text = normalizedText ?? sourceTextExact;
    if (!text) {
      return [];
    }
    return [{
      stepId: stringFrom(item.stepId),
      text,
      ...(sourceTextExact ? { sourceTextExact } : {}),
      ...(normalizedText ? { normalizedText } : {}),
      questionNumber: numberFrom(item.questionNumber),
      nextStepIds: stringsFrom(item.nextStepIds),
    }];
  });

  return steps.length > 0 ? { steps } : undefined;
};

const diagramFrom = (value: unknown): ReadingV2AutoTranscriptDiagram | undefined => {
  if (!isRecord(value) || !Array.isArray(value.targets)) {
    return undefined;
  }

  const targets = value.targets.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const sourceLabelExact = firstStringFrom(
      item.sourceLabelExact,
      item.exactLabel,
      item.label,
    );
    const normalizedLabel = firstStringFrom(
      item.normalizedLabel,
      item.label,
      item.sourceLabelExact,
      item.exactLabel,
    );
    const label = normalizedLabel ?? sourceLabelExact;
    const questionNumber = numberFrom(item.questionNumber);
    return label && questionNumber
      ? [{
          label,
          ...(sourceLabelExact ? { sourceLabelExact } : {}),
          ...(normalizedLabel ? { normalizedLabel } : {}),
          questionNumber,
        }]
      : [];
  });

  return targets.length > 0
    ? {
        imageUrl: stringFrom(value.imageUrl),
        imageAlt: stringFrom(value.imageAlt),
        targets,
      }
    : undefined;
};

const metaFrom = (value: unknown): ReadingV2AutoTranscriptInstructionMeta => {
  if (!isRecord(value)) {
    return {};
  }

  const summaryAnswerMode = value.summaryAnswerMode === 'text' || value.summaryAnswerMode === 'list'
    ? value.summaryAnswerMode
    : undefined;

  return {
    wordLimit: positiveNumberFrom(value.wordLimit),
    wordLimitText: stringFrom(value.wordLimitText),
    vocabulary: stringFrom(value.vocabulary),
    selectionLimit: positiveNumberFrom(value.selectionLimit),
    answerSource: stringFrom(value.answerSource),
    optionLabelRange: stringFrom(value.optionLabelRange),
    referenceLabelRange: stringFrom(value.referenceLabelRange),
    reuseAllowed: typeof value.reuseAllowed === 'boolean' ? value.reuseAllowed : undefined,
    summaryAnswerMode,
  };
};

const labelRangeFromInstructionText = (sourceInstructionText: string | undefined): string | undefined => {
  const source = compact(sourceInstructionText ?? '');
  const match = source.match(/\b([A-Z])\s*[-–—]\s*([A-Z])\b/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
};

const WORD_LIMIT_BY_TEXT = new Map<string, number>([
  ['ONE', 1],
  ['TWO', 2],
  ['THREE', 3],
  ['FOUR', 4],
  ['FIVE', 5],
]);

const wordLimitDetailsFromInstructionText = (
  sourceInstructionText: string | undefined,
): Pick<ReadingV2AutoTranscriptInstructionMeta, 'wordLimit' | 'wordLimitText'> => {
  const source = compact((sourceInstructionText ?? '').replace(/[*_`]+/g, ' ')).toUpperCase();
  const match = source.match(/\b((?:NO\s+MORE\s+THAN\s+)?(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORD(?:S)?(?:\s+ONLY)?(?:\s+AND\/OR\s+A\s+NUMBER)?)\b/);
  const rawLimit = match?.[2];
  if (!rawLimit) {
    return {};
  }

  const wordLimit = WORD_LIMIT_BY_TEXT.get(rawLimit) ?? Number(rawLimit);
  if (!Number.isFinite(wordLimit) || wordLimit <= 0) {
    return {};
  }

  return {
    wordLimit,
    ...(match?.[1] ? { wordLimitText: compact(match[1]) } : {}),
  };
};

const normalizedInstructionMetaForGroup = (
  taskType: ReadingV2CanonicalTaskType | null,
  instructionMeta: ReadingV2AutoTranscriptInstructionMeta,
  sourceInstructionText: string | undefined,
): ReadingV2AutoTranscriptInstructionMeta => {
  if (taskType !== 'matching-information') {
    return instructionMeta;
  }

  const referenceLabelRange = instructionMeta.referenceLabelRange
    ?? instructionMeta.optionLabelRange
    ?? labelRangeFromInstructionText(sourceInstructionText);

  return referenceLabelRange
    ? {
        ...instructionMeta,
        referenceLabelRange,
      }
    : instructionMeta;
};

const matchingGroupHintFor = (
  passagePackage: ReadingV2AutoPassagePackage,
  group: ReadingV2AutoQuestionTranscriptGroup,
): ReadingV2AutoPassagePackage['groupHints'][number] | undefined =>
  passagePackage.groupHints.find((candidate) =>
    candidate.questionRange.start === group.questionRange.start
    && candidate.questionRange.end === group.questionRange.end,
  );

const hintedInstructionTextFor = (
  passagePackage: ReadingV2AutoPassagePackage,
  group: ReadingV2AutoQuestionTranscriptGroup,
): string | undefined => {
  const hint = matchingGroupHintFor(passagePackage, group);
  if (!hint) {
    return undefined;
  }

  const firstQuestionLineNumber = passagePackage.questionAreaLines.find((line) =>
    line.lineNumber >= hint.lines.startLine
    && line.lineNumber <= hint.lines.endLine
    && line.text.match(new RegExp(String.raw`(?:^|\s)(?:\*\*)?${group.questionRange.start}(?:\*\*)?[\s.)]`, 'i')),
  )?.lineNumber;
  const endLine = firstQuestionLineNumber ? firstQuestionLineNumber - 1 : hint.lines.endLine;
  const lines = passagePackage.questionAreaLines
    .filter((line) => line.lineNumber >= hint.lines.startLine && line.lineNumber <= endLine)
    .map((line) => line.text.trim())
    .filter(Boolean);

  return lines.join('\n').trim() || undefined;
};

const sourceInstructionEvidenceFor = (
  passagePackage: ReadingV2AutoPassagePackage,
  group: ReadingV2AutoQuestionTranscriptGroup,
): string | undefined => {
  const evidence = [
    hintedInstructionTextFor(passagePackage, group),
    group.sourceInstructionText,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);

  return evidence.join('\n').trim() || undefined;
};

const normalizeTaskType = (
  value: unknown,
  meta: ReadingV2AutoTranscriptInstructionMeta,
): ReadingV2CanonicalTaskType | null =>
  typeof value === 'string'
    ? normalizeReadingV2TaskType(value, { summaryAnswerMode: meta.summaryAnswerMode })
    : null;

const groupFrom = (value: unknown): ReadingV2AutoQuestionTranscriptGroup | null => {
  if (!isRecord(value)) {
    return null;
  }

  const questionRange = rangeFrom(value.questionRange ?? value.range);
  const instructionMeta = metaFrom(value.instructionMeta ?? value.meta);
  const sourceInstructionText = stringFrom(value.sourceInstructionText ?? value.instructionText);
  const taskType = normalizeTaskType(value.taskType, instructionMeta);
  const normalizedInstructionMeta = normalizedInstructionMetaForGroup(
    taskType,
    instructionMeta,
    sourceInstructionText,
  );
  const questions = Array.isArray(value.questions)
    ? value.questions.flatMap((item) => {
        const question = questionFrom(item, taskType ?? undefined);
        return question ? [question] : [];
      })
    : [];

  if (!questionRange || !taskType) {
    return null;
  }

  return {
    questionRange,
    taskType,
    sourceInstructionText,
    instructionMeta: normalizedInstructionMeta,
    labeledOptions: firstOptionsFromCandidates(
      value.labeledOptions,
      value.options,
      value.optionBank,
      value.optionBanks,
      value.choiceBank,
      value.choiceBanks,
      value.choiceOptions,
      value.answerChoices,
      value.choices,
      taskTypeUsesOptionBank(taskType) ? value.bank : undefined,
    ),
    sectionReferences: firstOptionsFromCandidates(
      value.sectionReferences,
      value.references,
      value.referenceBankLines,
      value.referenceBank,
      value.referenceBanks,
      value.referenceOptions,
      value.referenceLabels,
      value.choiceOptions,
      value.choices,
      taskTypeUsesReferenceBank(taskType) ? value.bank : undefined,
    ),
    questions,
    note: noteFrom(value.note),
    table: tableFrom(value.table),
    flowchart: flowchartFrom(value.flowchart),
    diagram: diagramFrom(value.diagram),
    diagnostics: stringsFrom(value.diagnostics),
  };
};

const coverageSummaryFrom = (value: unknown): ReadingV2AutoTranscriptCoverageSummary | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const coveredGroups = stringsFrom(value.coveredGroups);
  const coveredQuestions = numberArrayFrom(value.coveredQuestions);
  return coveredGroups.length > 0 || coveredQuestions?.length
    ? {
        ...(coveredGroups.length > 0 ? { coveredGroups } : {}),
        ...(coveredQuestions?.length ? { coveredQuestions } : {}),
      }
    : undefined;
};

export const normalizeReadingV2AutoQuestionTranscript = (
  data: unknown,
): ReadingV2AutoQuestionTranscript | null => {
  if (!isRecord(data)) {
    return null;
  }

  const passageNumber = numberFrom(data.passageNumber ?? data.package ?? data.passage);
  const groups = Array.isArray(data.groups)
    ? data.groups.flatMap((item) => {
        const group = groupFrom(item);
        return group ? [group] : [];
      })
    : [];

  if (!passageNumber || groups.length === 0) {
    return null;
  }

  return {
    passageNumber,
    groups,
    diagnostics: stringsFrom(data.diagnostics),
    coverageSummary: coverageSummaryFrom(data.coverageSummary),
  };
};

const compact = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const sourceTextFrom = (input: {
  readonly questionAreaText: string;
  readonly referenceBankLines: readonly ReadingV2AutoPassagePackageLine[];
}): string => [
  input.questionAreaText,
  input.referenceBankLines.map((line) => line.text).join('\n'),
]
  .filter((value) => value.trim().length > 0)
  .join('\n');

const genericReferenceAliasLabel = (value: string): string | undefined => {
  const match = value.trim().match(/^(?:paragraph|section|option|choice|person|people|candidate|writer)\s+([A-Z])$/i);
  return match?.[1]?.toUpperCase();
};

const sourceHasReferenceLabel = (sourceText: string, label: string): boolean => {
  const upperLabel = label.toUpperCase();
  const ranges = sourceText.matchAll(/([A-Z])\s*[-–—]\s*([A-Z])/g);
  for (const range of ranges) {
    const start = range[1]?.charCodeAt(0) ?? 0;
    const end = range[2]?.charCodeAt(0) ?? 0;
    const current = upperLabel.charCodeAt(0);
    if (current >= Math.min(start, end) && current <= Math.max(start, end)) {
      return true;
    }
  }

  const labelLinePattern = new RegExp(
    String.raw`(^|[\r\n])\s*(?:[#>*_\-\s]|\d+[.)])*(?:\*\*|__)?${upperLabel}(?:\*\*|__)?(?=\s|[.)\]:-]|[-–—]|$)`,
    'i',
  );
  return labelLinePattern.test(sourceText);
};

const directTextAppearsInSourceText = (
  sourceText: string,
  value: string,
): boolean => {
  const directNeedle = compact(value);
  if (!directNeedle || directNeedle.length <= 2) {
    return true;
  }

  return compact(sourceText).includes(directNeedle);
};

const normalizedTextAppearsInSourceText = (
  sourceText: string,
  value: string,
): boolean => {
  const aliasLabel = genericReferenceAliasLabel(value);
  if (aliasLabel && sourceHasReferenceLabel(sourceText, aliasLabel)) {
    return true;
  }

  const needle = normalizeReadingV2AutoSourceProofText(value);
  if (!needle || needle.length <= 2) {
    return true;
  }

  return normalizeReadingV2AutoSourceProofText(sourceText).includes(needle);
};

const boundedEquivalentText = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeReadingV2AutoSourceProofText(left);
  const normalizedRight = normalizeReadingV2AutoSourceProofText(right);
  if (!normalizedLeft || !normalizedRight) {
    return true;
  }

  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
};

const numbersInRange = (range: ReadingV2AutoTranscriptQuestionRange): readonly number[] => {
  const numbers: number[] = [];
  for (let number = range.start; number <= range.end; number += 1) {
    numbers.push(number);
  }
  return numbers;
};

const groupRequiresBank = (taskType: ReadingV2CanonicalTaskType): boolean =>
  taskType === 'summary-completion-list'
  || taskType === 'matching-headings'
  || taskType === 'matching-information'
  || taskType === 'matching-features'
  || taskType === 'matching-sentence-endings'
  || taskType === 'multiple-choice'
  || taskType === 'multiple-select';

const hasBank = (group: ReadingV2AutoQuestionTranscriptGroup): boolean =>
  Boolean(
    group.labeledOptions?.length
    || group.sectionReferences?.length
    || (group.taskType === 'matching-information' && group.instructionMeta.referenceLabelRange),
  )
  || group.questions.some((question) => Boolean(question.labeledOptions?.length || question.sectionReferences?.length));

export const readingV2AutoQuestionRangeKey = (
  range: ReadingV2AutoTranscriptQuestionRange,
): string => `${range.start}-${range.end}`;

export const readingV2AutoTranscriptGroupRangeKeys = (
  transcript: ReadingV2AutoQuestionTranscript,
): readonly string[] => transcript.groups.map((group) => readingV2AutoQuestionRangeKey(group.questionRange));

interface SourceProofEntry {
  readonly exactText?: string;
  readonly normalizedText?: string;
  readonly sourceLines?: readonly number[];
  readonly questionNumber?: number;
  readonly label: string;
}

const sourceProofEntriesForGroup = (
  group: ReadingV2AutoQuestionTranscriptGroup,
): readonly SourceProofEntry[] => {
  const requiresBank = groupRequiresBank(group.taskType);
  return [
  ...(requiresBank ? (group.labeledOptions ?? []).map((option) => ({
    label: `group option ${option.label}`,
    exactText: option.sourceTextExact ?? option.text,
    normalizedText: option.normalizedText ?? option.text,
    sourceLines: option.sourceLines,
    questionNumber: group.questionRange.start,
  })) : []),
  ...(requiresBank ? (group.sectionReferences ?? []).map((option) => ({
    label: `group reference ${option.label}`,
    exactText: option.sourceTextExact ?? option.text,
    normalizedText: option.normalizedText ?? option.text,
    sourceLines: option.sourceLines,
    questionNumber: group.questionRange.start,
  })) : []),
  ...group.questions.map((question) => ({
    label: `question ${question.number}`,
    exactText: question.sourceTextExact ?? question.promptText,
    normalizedText: question.normalizedPromptText ?? question.promptText,
    sourceLines: question.sourceLines,
    questionNumber: question.number,
  })),
  ...group.questions.flatMap((question) => [
    ...(requiresBank ? (question.labeledOptions ?? []).map((option) => ({
      label: `question ${question.number} option ${option.label}`,
      exactText: option.sourceTextExact ?? option.text,
      normalizedText: option.normalizedText ?? option.text,
      sourceLines: option.sourceLines,
      questionNumber: question.number,
    })) : []),
    ...(requiresBank ? (question.sectionReferences ?? []).map((option) => ({
      label: `question ${question.number} reference ${option.label}`,
      exactText: option.sourceTextExact ?? option.text,
      normalizedText: option.normalizedText ?? option.text,
      sourceLines: option.sourceLines,
      questionNumber: question.number,
    })) : []),
  ]),
  ...(group.note?.lines ?? []).map((line) => ({
    label: `note line ${line.questionNumber ?? group.questionRange.start}`,
    exactText: line.sourceTextExact ?? line.text,
    normalizedText: line.normalizedText ?? line.text,
    sourceLines: line.sourceLines,
    questionNumber: line.questionNumber ?? group.questionRange.start,
  })),
  ...(group.note?.sections ?? []).flatMap((section) => [
    ...(section.heading
      ? [{
          label: `note heading ${group.questionRange.start}`,
          exactText: section.heading,
          normalizedText: section.heading,
          questionNumber: group.questionRange.start,
        }]
      : []),
    ...(section.lines ?? []).map((line) => ({
      label: `note section line ${line.questionNumber ?? group.questionRange.start}`,
      exactText: line.sourceTextExact ?? line.text,
      normalizedText: line.normalizedText ?? line.text,
      sourceLines: line.sourceLines,
      questionNumber: line.questionNumber ?? group.questionRange.start,
    })),
  ]),
  ...(group.table?.rows ?? []).flatMap((row) =>
    row.map((cell) => ({
      label: `table cell ${cell.questionNumber ?? group.questionRange.start}`,
      exactText: cell.sourceTextExact ?? cell.text,
      normalizedText: cell.normalizedText ?? cell.text,
      questionNumber: cell.questionNumber ?? group.questionRange.start,
    }))),
  ...(group.flowchart?.steps ?? []).map((step) => ({
    label: `flowchart step ${step.questionNumber ?? group.questionRange.start}`,
    exactText: step.sourceTextExact ?? step.text,
    normalizedText: step.normalizedText ?? step.text,
    questionNumber: step.questionNumber ?? group.questionRange.start,
  })),
  ...(group.diagram?.targets ?? []).map((target) => ({
    label: `diagram target ${target.questionNumber}`,
    exactText: target.sourceLabelExact ?? target.label,
    normalizedText: target.normalizedLabel ?? target.label,
    questionNumber: target.questionNumber,
  })),
];
};

const blankCountTextsForGroup = (
  group: ReadingV2AutoQuestionTranscriptGroup,
): readonly string[] => {
  if (group.taskType === 'note-completion') {
    const noteTexts = [
      ...(group.note?.lines ?? []).map((line) => line.text),
      ...(group.note?.sections ?? []).flatMap((section) => section.lines?.map((line) => line.text) ?? []),
    ];
    return noteTexts.length ? noteTexts : group.questions.map((question) => question.promptText);
  }

  if (group.taskType === 'table-completion') {
    const tableTexts = (group.table?.rows ?? []).flatMap((row) => row.map((cell) => cell.text));
    return tableTexts.length ? tableTexts : group.questions.map((question) => question.promptText);
  }

  if (group.taskType === 'flowchart-completion') {
    const flowchartTexts = (group.flowchart?.steps ?? []).map((step) => step.text);
    return flowchartTexts.length ? flowchartTexts : group.questions.map((question) => question.promptText);
  }

  return group.questions.map((question) => question.promptText);
};

export const verifyReadingV2AutoQuestionTranscript = (input: {
  readonly transcript: ReadingV2AutoQuestionTranscript;
  readonly passagePackage: ReadingV2AutoPassagePackage;
}): readonly ReadingV2AutoQuestionTranscriptDiagnostic[] => {
  const diagnostics: ReadingV2AutoQuestionTranscriptDiagnostic[] = [];
  const expectedNumbers = numbersInRange(input.passagePackage.expectedQuestionRange);
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  const sourceText = sourceTextFrom({
    questionAreaText: input.passagePackage.questionAreaText,
    referenceBankLines: input.passagePackage.referenceBankLines,
  });

  input.transcript.groups.forEach((group) => {
    const hint = input.passagePackage.groupHints.find((candidate) =>
      candidate.questionRange.start <= group.questionRange.start
      && candidate.questionRange.end >= group.questionRange.end,
    );
    const hintType = normalizeReadingV2TaskType(hint?.taskTypeHint ?? '', {
      summaryAnswerMode: group.instructionMeta.summaryAnswerMode,
    });

    if (hintType && hintType !== group.taskType) {
      diagnostics.push({
        code: 'task-type-conflict',
        severity: 'error',
        message: `Transcript task type ${group.taskType} conflicts with marker hint ${hintType}.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: group.questionRange.start,
      });
    }

    if (groupRequiresBank(group.taskType) && !hasBank(group)) {
      diagnostics.push({
        code: 'missing-reference-bank',
        severity: 'error',
        message: `Transcript group ${group.questionRange.start}-${group.questionRange.end} is missing its option/reference bank.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: group.questionRange.start,
      });
    }

    const groupBlankCount = blankCountTextsForGroup(group)
      .reduce((count, text) => count + countReadingV2AutoCompletionBlanks(text), 0);
    const expectedGroupQuestions = numbersInRange(group.questionRange).length;
    if (
      ['sentence-completion', 'summary-completion-text', 'summary-completion-list', 'note-completion', 'table-completion', 'flowchart-completion', 'diagram-labeling'].includes(group.taskType)
      && groupBlankCount > 0
      && groupBlankCount !== expectedGroupQuestions
    ) {
      diagnostics.push({
        code: 'blank-mismatch',
        severity: 'error',
        message: `Transcript group ${group.questionRange.start}-${group.questionRange.end} has ${groupBlankCount} visible blanks for ${expectedGroupQuestions} questions.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: group.questionRange.start,
      });
    }

    sourceProofEntriesForGroup(group).forEach((entry) => {
      const sourceEvidence = entry.sourceLines?.length
        ? entry.sourceLines
            .map((lineNumber) =>
              input.passagePackage.questionAreaLines.find((line) => line.lineNumber === lineNumber)?.text
              ?? input.passagePackage.referenceBankLines.find((line) => line.lineNumber === lineNumber)?.text,
            )
            .filter((lineText): lineText is string => typeof lineText === 'string' && lineText.trim().length > 0)
            .join('\n')
        : sourceText;
      const exactText = entry.exactText?.trim();
      if (!exactText) {
        diagnostics.push({
          code: 'source-text-exact-missing',
          severity: 'error',
          message: `${entry.label} is missing exact source-proof text.`,
          passageNumber: input.passagePackage.passageNumber,
          questionNumber: entry.questionNumber ?? group.questionRange.start,
        });
        return;
      }

      if (!directTextAppearsInSourceText(sourceEvidence, exactText)) {
        if (normalizedTextAppearsInSourceText(sourceEvidence, exactText)) {
          diagnostics.push({
            code: 'source-proof-format-mismatch',
            severity: 'warning',
            message: `${entry.label} required bounded format equivalence to prove its exact source text.`,
            passageNumber: input.passagePackage.passageNumber,
            questionNumber: entry.questionNumber ?? group.questionRange.start,
          });
        } else {
          diagnostics.push({
            code: 'source-text-exact-missing',
            severity: 'error',
            message: `${entry.label} exact source text cannot be proven from the local question-area or reference-bank lines.`,
            passageNumber: input.passagePackage.passageNumber,
            questionNumber: entry.questionNumber ?? group.questionRange.start,
          });
          return;
        }
      }

      if (entry.normalizedText && !boundedEquivalentText(exactText, entry.normalizedText)) {
        diagnostics.push({
          code: 'normalized-text-source-drift',
          severity: 'error',
          message: `${entry.label} normalized text adds or changes meaning beyond bounded source-format equivalence.`,
          passageNumber: input.passagePackage.passageNumber,
          questionNumber: entry.questionNumber ?? group.questionRange.start,
        });
      }
    });

    group.questions.forEach((question) => {
      if (seen.has(question.number)) {
        duplicates.add(question.number);
      }
      seen.add(question.number);
    });
  });

  duplicates.forEach((questionNumber) => {
    diagnostics.push({
      code: 'duplicate-question-number',
      severity: 'error',
      message: `Transcript contains duplicate question ${questionNumber}.`,
      passageNumber: input.passagePackage.passageNumber,
      questionNumber,
    });
  });

  expectedNumbers
    .filter((questionNumber) => !seen.has(questionNumber))
    .forEach((questionNumber) => {
      diagnostics.push({
        code: 'group-coverage-mismatch',
        severity: 'error',
        message: `Transcript omitted expected question ${questionNumber}.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber,
      });
    });

  return diagnostics;
};

const optionLabelRange = (options: readonly ReadingV2AutoTranscriptOption[] | undefined): string | undefined => {
  if (!options?.length) {
    return undefined;
  }

  return options.length === 1
    ? options[0]?.label
    : `${options[0]?.label}-${options[options.length - 1]?.label}`;
};

export const buildReadingV2AutoMaterialFromTranscript = (input: {
  readonly transcript: ReadingV2AutoQuestionTranscript;
  readonly passagePackage: ReadingV2AutoPassagePackage;
}): ReadingV2AutoTranscriptMaterial => {
  const sectionInstructions = input.transcript.groups.map((group) => {
    const id = `p${input.passagePackage.passageNumber}-q${group.questionRange.start}-${group.questionRange.end}`;
    const sourceInstructionEvidence = sourceInstructionEvidenceFor(input.passagePackage, group);
    const sourceWordLimit = wordLimitDetailsFromInstructionText(sourceInstructionEvidence);
    const instructionMeta = {
      ...group.instructionMeta,
      ...sourceWordLimit,
    };
    return {
      id,
      taskType: group.taskType,
      text: getReadingV2InstructionText(group.taskType, {
        questionRange: group.questionRange,
        passageNumber: input.passagePackage.passageNumber,
        wordLimit: instructionMeta.wordLimit,
        wordLimitText: instructionMeta.wordLimitText,
        selectionLimit: instructionMeta.selectionLimit,
        optionLabelRange: instructionMeta.optionLabelRange ?? optionLabelRange(group.labeledOptions),
        referenceLabelRange: instructionMeta.referenceLabelRange ?? optionLabelRange(group.sectionReferences),
        reuseAllowed: instructionMeta.reuseAllowed,
      }),
      questionRange: group.questionRange,
      wordLimit: instructionMeta.wordLimit,
      wordLimitText: instructionMeta.wordLimitText,
      vocabulary: instructionMeta.vocabulary,
      selectionLimit: instructionMeta.selectionLimit,
      answerSource: instructionMeta.answerSource,
      optionLabelRange: instructionMeta.optionLabelRange ?? optionLabelRange(group.labeledOptions),
      referenceLabelRange: instructionMeta.referenceLabelRange ?? optionLabelRange(group.sectionReferences),
      reuseAllowed: instructionMeta.reuseAllowed,
      note: group.note,
      table: group.table,
      flowchart: group.flowchart,
      diagram: group.diagram,
      labeledOptions: group.labeledOptions,
      sectionReferences: group.sectionReferences,
    };
  });
  const questions = input.transcript.groups.flatMap((group) => {
    const sectionInstructionId = `p${input.passagePackage.passageNumber}-q${group.questionRange.start}-${group.questionRange.end}`;
    return group.questions.map((question) => ({
      questionNumber: question.number,
      type: group.taskType,
      sectionInstructionId,
      questionText: question.promptText,
      wordLimit: wordLimitDetailsFromInstructionText(
        sourceInstructionEvidenceFor(input.passagePackage, group),
      ).wordLimit ?? group.instructionMeta.wordLimit,
      labeledOptions: question.labeledOptions,
      sectionReferences: question.sectionReferences,
    }));
  });

  return {
    passageNumber: input.passagePackage.passageNumber,
    title: input.passagePackage.passageTitle,
    passages: [{
      title: input.passagePackage.passageTitle,
      content: input.passagePackage.passageBodyText,
    }],
    sectionInstructions,
    questions,
  };
};

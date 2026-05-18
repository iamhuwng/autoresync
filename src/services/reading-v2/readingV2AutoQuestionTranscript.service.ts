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
  readonly sourceLines?: readonly number[];
}

export interface ReadingV2AutoTranscriptQuestion {
  readonly number: number;
  readonly promptText: string;
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
  readonly questionNumber?: number;
  readonly nextStepIds?: readonly string[];
}

export interface ReadingV2AutoTranscriptFlowchart {
  readonly steps: readonly ReadingV2AutoTranscriptFlowStep[];
}

export interface ReadingV2AutoTranscriptDiagramTarget {
  readonly label: string;
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
}

export type ReadingV2AutoQuestionTranscriptDiagnosticCode =
  | 'transcript-malformed'
  | 'transcript-question-missing'
  | 'transcript-question-duplicate'
  | 'transcript-task-type-conflict'
  | 'transcript-source-text-paraphrased'
  | 'transcript-reference-bank-missing'
  | 'transcript-blank-mismatch';

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

const stringFrom = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

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
  const text = stringFrom(value.text);
  if (!label || !text) {
    return null;
  }

  return {
    label,
    text,
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
  const promptText = stringFrom(value.promptText ?? value.questionText ?? value.text);
  if (!number || !promptText) {
    return null;
  }

  return {
    number,
    promptText,
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

  const text = stringFrom(value.text);
  if (!text) {
    return null;
  }

  return {
    text,
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

  return {
    title: stringFrom(value.title),
    subheading: stringFrom(value.subheading),
    sections,
    lines,
  };
};

const tableCellFrom = (value: unknown): ReadingV2AutoTranscriptTableCell | null => {
  if (typeof value === 'string') {
    return value.trim() ? { text: value.trim() } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const text = stringFrom(value.text);
  if (!text) {
    return null;
  }

  return {
    text,
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
    const text = stringFrom(item.text);
    if (!text) {
      return [];
    }
    return [{
      stepId: stringFrom(item.stepId),
      text,
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
    const label = stringFrom(item.label);
    const questionNumber = numberFrom(item.questionNumber);
    return label && questionNumber ? [{ label, questionNumber }] : [];
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
    wordLimit: numberFrom(value.wordLimit),
    wordLimitText: stringFrom(value.wordLimitText),
    vocabulary: stringFrom(value.vocabulary),
    selectionLimit: numberFrom(value.selectionLimit),
    answerSource: stringFrom(value.answerSource),
    optionLabelRange: stringFrom(value.optionLabelRange),
    referenceLabelRange: stringFrom(value.referenceLabelRange),
    reuseAllowed: typeof value.reuseAllowed === 'boolean' ? value.reuseAllowed : undefined,
    summaryAnswerMode,
  };
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
  const taskType = normalizeTaskType(value.taskType, instructionMeta);
  const questions = Array.isArray(value.questions)
    ? value.questions.flatMap((item) => {
        const question = questionFrom(item, taskType ?? undefined);
        return question ? [question] : [];
      })
    : [];

  if (!questionRange || !taskType || questions.length === 0) {
    return null;
  }

  return {
    questionRange,
    taskType,
    sourceInstructionText: stringFrom(value.sourceInstructionText ?? value.instructionText),
    instructionMeta,
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
  };
};

const compact = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const visibleTextValues = (group: ReadingV2AutoQuestionTranscriptGroup): readonly string[] => [
  group.sourceInstructionText,
  ...(group.labeledOptions ?? []).map((option) => option.text),
  ...(group.sectionReferences ?? []).map((option) => option.text),
  ...group.questions.map((question) => question.promptText),
  ...group.questions.flatMap((question) => [
    ...(question.labeledOptions ?? []).map((option) => option.text),
    ...(question.sectionReferences ?? []).map((option) => option.text),
  ]),
  ...(group.note?.lines ?? []).map((line) => line.text),
  ...(group.note?.sections ?? []).flatMap((section) => [
    section.heading,
    ...(section.lines ?? []).map((line) => line.text),
  ]),
  ...(group.table?.rows ?? []).flatMap((row) => row.map((cell) => cell.text)),
  ...(group.flowchart?.steps ?? []).map((step) => step.text),
  ...(group.diagram?.targets ?? []).map((target) => target.label),
].filter((value): value is string => typeof value === 'string' && value.trim().length > 1);

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

const textAppearsInSourceText = (
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
        code: 'transcript-task-type-conflict',
        severity: 'error',
        message: `Transcript task type ${group.taskType} conflicts with marker hint ${hintType}.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: group.questionRange.start,
      });
    }

    if (groupRequiresBank(group.taskType) && !hasBank(group)) {
      diagnostics.push({
        code: 'transcript-reference-bank-missing',
        severity: 'error',
        message: `Transcript group ${group.questionRange.start}-${group.questionRange.end} is missing its option/reference bank.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: group.questionRange.start,
      });
    }

    const groupBlankCount = [
      ...group.questions.map((question) => question.promptText),
      ...(group.note?.lines ?? []).map((line) => line.text),
      ...(group.note?.sections ?? []).flatMap((section) => section.lines?.map((line) => line.text) ?? []),
      ...(group.table?.rows ?? []).flatMap((row) => row.map((cell) => cell.text)),
      ...(group.flowchart?.steps ?? []).map((step) => step.text),
    ].reduce((count, text) => count + countReadingV2AutoCompletionBlanks(text), 0);
    const expectedGroupQuestions = numbersInRange(group.questionRange).length;
    if (
      ['sentence-completion', 'summary-completion-text', 'summary-completion-list', 'note-completion', 'table-completion', 'flowchart-completion', 'diagram-labeling'].includes(group.taskType)
      && groupBlankCount > 0
      && groupBlankCount !== expectedGroupQuestions
    ) {
      diagnostics.push({
        code: 'transcript-blank-mismatch',
        severity: 'error',
        message: `Transcript group ${group.questionRange.start}-${group.questionRange.end} has ${groupBlankCount} visible blanks for ${expectedGroupQuestions} questions.`,
        passageNumber: input.passagePackage.passageNumber,
        questionNumber: group.questionRange.start,
      });
    }

    visibleTextValues(group).forEach((text) => {
      if (!textAppearsInSourceText(sourceText, text)) {
        diagnostics.push({
          code: 'transcript-source-text-paraphrased',
          severity: 'error',
          message: `Transcript text cannot be proven from the source question area or reference-bank lines: "${text.slice(0, 80)}".`,
          passageNumber: input.passagePackage.passageNumber,
          questionNumber: group.questionRange.start,
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
      code: 'transcript-question-duplicate',
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
        code: 'transcript-question-missing',
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
    return {
      id,
      taskType: group.taskType,
      text: getReadingV2InstructionText(group.taskType, {
        questionRange: group.questionRange,
        passageNumber: input.passagePackage.passageNumber,
        wordLimit: group.instructionMeta.wordLimit,
        wordLimitText: group.instructionMeta.wordLimitText,
        selectionLimit: group.instructionMeta.selectionLimit,
        optionLabelRange: group.instructionMeta.optionLabelRange ?? optionLabelRange(group.labeledOptions),
        referenceLabelRange: group.instructionMeta.referenceLabelRange ?? optionLabelRange(group.sectionReferences),
        reuseAllowed: group.instructionMeta.reuseAllowed,
      }),
      questionRange: group.questionRange,
      wordLimit: group.instructionMeta.wordLimit,
      wordLimitText: group.instructionMeta.wordLimitText,
      vocabulary: group.instructionMeta.vocabulary,
      selectionLimit: group.instructionMeta.selectionLimit,
      answerSource: group.instructionMeta.answerSource,
      optionLabelRange: group.instructionMeta.optionLabelRange ?? optionLabelRange(group.labeledOptions),
      referenceLabelRange: group.instructionMeta.referenceLabelRange ?? optionLabelRange(group.sectionReferences),
      reuseAllowed: group.instructionMeta.reuseAllowed,
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
      wordLimit: group.instructionMeta.wordLimit,
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

import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2AnchorId,
  type ReadingV2Document,
  type ReadingV2ImportEvidenceId,
  type ReadingV2Interaction,
  type ReadingV2OptionSet,
  type ReadingV2PassageParagraph,
  type ReadingV2ResponseShape,
  type ReadingV2StimulusNode,
  type ReadingV2TableCellContent,
  type ReadingV2TaskGroup,
  type ReadingV2ValidationIssue,
} from '../../types/readingV2.types';
import {
  getReadingV2TaskFamily,
  normalizeReadingV2TaskType,
  type ReadingV2CanonicalTaskType,
} from '../../types/readingV2Taxonomy';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from './readingV2ExternalAiPrompt.service';
import {
  getReadingV2InstructionText,
  readingV2InstructionLooksStandard,
  type ReadingV2InstructionSemantics,
} from './readingV2InstructionTemplates.service';
import { normalizeReadingV2JudgementAnswerForStorage } from './readingV2JudgementAnswers.service';
import {
  readingV2TaskNeedsOptionSet,
  readingV2TaskUsesImportedLabeledOptions,
  readingV2TaskUsesImportedSectionReferences,
  readingV2TaskUsesReferenceLabelRange,
} from './readingV2TaskComponentContracts.service';

export interface ReadingV2ImportCandidate {
  readonly sourceKind: 'pasted-text' | 'uploaded-file' | 'auto-gemini';
  readonly fileName?: string;
  readonly supportedFileType?: 'txt' | 'docx' | 'pdf';
  readonly rawText?: string;
  readonly sourceRawText?: string;
  readonly answerKeyText?: string;
  readonly teacherAnswerKey?: ReadingV2TeacherAnswerKeyPayload;
  readonly autoImportDiagnostics?: readonly ReadingV2AutoImportCandidateDiagnostic[];
  readonly evidence: readonly string[];
  readonly uncertaintyMarkers: readonly string[];
  readonly publishBlockingPlaceholders: readonly string[];
}

export interface ReadingV2AutoImportCandidateDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly passageNumber?: number;
  readonly questionNumber?: number;
  readonly stage?: string;
  readonly groupRange?: string;
  readonly sourceRange?: string;
  readonly verifierIssueCodes?: readonly string[];
  readonly repairScopes?: readonly string[];
  readonly preferredKeyIndex?: number;
  readonly keyFingerprint?: string;
}

export type ReadingV2TeacherAnswerKeyBindingStatus = 'unbound' | 'bound' | 'invalid' | 'duplicate';

export interface ReadingV2TeacherAnswerKeyDiagnostic {
  readonly code:
    | 'duplicate-question-number'
    | 'missing-answer-text'
    | 'unparsed-answer-key-line'
    | 'unsupported-answer-key-heading'
    | 'empty-answer-alternative';
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly sourceLine: number;
  readonly questionNumber?: number;
}

export interface ReadingV2TeacherAnswerKeyRow {
  readonly questionNumber: number;
  readonly rawAnswerText: string;
  readonly parsedAnswerValues: readonly string[];
  readonly sourceLine: number;
  readonly diagnostics: readonly ReadingV2TeacherAnswerKeyDiagnostic[];
  readonly bindingStatus: ReadingV2TeacherAnswerKeyBindingStatus;
}

export interface ReadingV2TeacherAnswerKeyPayload {
  readonly rawText: string;
  readonly rows: readonly ReadingV2TeacherAnswerKeyRow[];
  readonly diagnostics: readonly ReadingV2TeacherAnswerKeyDiagnostic[];
}

export interface ReadingV2ImportNormalizationResult {
  readonly candidate: ReadingV2ImportCandidate;
  readonly document: ReadingV2Document;
  readonly importEvidenceIds: readonly ReadingV2ImportEvidenceId[];
}

const SUPPORTED_FILE_TYPES = new Set(['txt', 'docx', 'pdf']);

const normalizeSourceEncoding = (value: string): string =>
  value
    .replace(/â€“|–/g, '-')
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/â€¦/g, '...')
    .replace(/\s+/g, ' ')
    .trim();

const cleanMarkdown = (value: string): string =>
  normalizeSourceEncoding(value)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const canonicalAnswerText = (value: string): string =>
  cleanMarkdown(value).replace(/\s+/g, ' ').trim();

const uniqueAnswerVariants = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const variants: string[] = [];
  values.forEach((value) => {
    const canonical = canonicalAnswerText(value);
    const key = canonical.toLowerCase();
    if (!canonical || seen.has(key)) {
      return;
    }
    seen.add(key);
    variants.push(canonical);
  });
  return variants;
};

const sharedContextAlternativeVariants = (
  left: string,
  right: string,
): readonly string[] => {
  const leftTokens = left.split(/\s+/).filter(Boolean);
  const rightTokens = right.split(/\s+/).filter(Boolean);

  if (leftTokens.length === 1 && rightTokens.length > 1) {
    return uniqueAnswerVariants([
      `${leftTokens[0]} ${rightTokens.slice(1).join(' ')}`,
      right,
    ]);
  }

  if (rightTokens.length === 1 && leftTokens.length > 1) {
    return uniqueAnswerVariants([
      left,
      `${leftTokens.slice(0, -1).join(' ')} ${rightTokens[0]}`,
    ]);
  }

  return uniqueAnswerVariants([left, right]);
};

const implicitAlternativeVariantsFromSegment = (value: string): readonly string[] => {
  const segment = canonicalAnswerText(value);
  if (!segment) {
    return [];
  }

  const orMatch = segment.match(/^(.+?)\s+or\s+(.+)$/i);
  if (orMatch?.[1] && orMatch[2]) {
    return sharedContextAlternativeVariants(orMatch[1], orMatch[2]);
  }

  const slashIndex = segment.indexOf('/');
  if (slashIndex < 0) {
    return [segment];
  }

  const left = canonicalAnswerText(segment.slice(0, slashIndex));
  const right = canonicalAnswerText(segment.slice(slashIndex + 1));
  if (!left || !right) {
    return [segment];
  }

  const slashHasVisibleSpacing = /\s\/|\/\s/.test(segment);
  const compactLiteralTokenPair = !slashHasVisibleSpacing
    && !/\s/.test(left)
    && !/\s/.test(right)
    && !/^.+\s+.+$/.test(left)
    && !/^.+\s+.+$/.test(right);
  if (compactLiteralTokenPair) {
    return [segment];
  }

  return sharedContextAlternativeVariants(left, right);
};

const acceptedAnswerVariantsFromText = (answerText: string): readonly string[] =>
  uniqueAnswerVariants(
    answerText
      .split('|')
      .flatMap((segment) => implicitAlternativeVariantsFromSegment(segment)),
  );

const preserveSourceMarkdown = (value: string): string =>
  normalizeSourceEncoding(value)
    .replace(/\s+/g, ' ')
    .trim();

const withoutUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;

const slug = (value: string): string => {
  const normalized = cleanMarkdown(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'imported-reading';
};

const stripFrontmatter = (text: string): string =>
  text.startsWith('---')
    ? text.replace(/^---[\s\S]*?---\s*/, '')
    : text;

const frontmatterValue = (text: string, key: string): string | null => {
  const match = text.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'));
  return match?.[1] ? cleanMarkdown(match[1]) : null;
};

const detectFileType = (fileName: string | undefined): 'txt' | 'docx' | 'pdf' | undefined => {
  const extension = fileName?.split('.').pop()?.toLowerCase();
  return extension && SUPPORTED_FILE_TYPES.has(extension)
    ? extension as 'txt' | 'docx' | 'pdf'
    : undefined;
};

const answerKeyDiagnostic = (
  code: ReadingV2TeacherAnswerKeyDiagnostic['code'],
  message: string,
  sourceLine: number,
  questionNumber?: number,
  severity: ReadingV2TeacherAnswerKeyDiagnostic['severity'] = 'error',
): ReadingV2TeacherAnswerKeyDiagnostic => ({
  code,
  severity,
  message,
  sourceLine,
  questionNumber,
});

const isAnswerKeyHeading = (line: string): boolean =>
  /^(?:answers?|answer\s+key|key)(?:\s+(?:reading\s+)?test\s+\d+)?\s*:?$|^(?:(?:reading\s+)?passage|section|reading\s+test)\s+\d+\s*:?$/i.test(
    line.replace(/^#+\s*/, '').trim(),
  );

const parsedAnswerValues = (
  answerText: string,
  sourceLine: number,
  questionNumber: number,
): {
  readonly values: readonly string[];
  readonly diagnostics: readonly ReadingV2TeacherAnswerKeyDiagnostic[];
} => {
  const diagnostics: ReadingV2TeacherAnswerKeyDiagnostic[] = [];
  const explicitSegments = answerText.split('|');
  const values = acceptedAnswerVariantsFromText(answerText);

  if (answerText.includes('|') && explicitSegments.some((value) => canonicalAnswerText(value).length === 0)) {
    diagnostics.push(
      answerKeyDiagnostic(
        'empty-answer-alternative',
        `Question ${questionNumber} has an empty accepted-answer alternative.`,
        sourceLine,
        questionNumber,
      ),
    );
  }

  return { values, diagnostics };
};

export const parseReadingV2TeacherAnswerKey = (
  answerKeyText: string | undefined,
): ReadingV2TeacherAnswerKeyPayload => {
  const rawText = answerKeyText ?? '';
  const rows: ReadingV2TeacherAnswerKeyRow[] = [];
  const diagnostics: ReadingV2TeacherAnswerKeyDiagnostic[] = [];

  rawText.split(/\r?\n/).forEach((rawLine, index) => {
    const sourceLine = index + 1;
    const line = rawLine.trim();

    if (!line) {
      return;
    }

    if (isAnswerKeyHeading(line)) {
      diagnostics.push(
        answerKeyDiagnostic(
          'unsupported-answer-key-heading',
          `Answer key heading on line ${sourceLine} is noted but not used for grouping.`,
          sourceLine,
          undefined,
          'warning',
        ),
      );
      return;
    }

    const match = line.match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})(?:\s*\\?[\).:\-=]\s*|\s+)(.*)$/i);
    const questionNumber = match?.[1] ? Number(match[1]) : NaN;
    const answerText = match?.[2]?.trim() ?? '';

    if (!match || !Number.isFinite(questionNumber) || questionNumber < 1) {
      diagnostics.push(
        answerKeyDiagnostic(
          'unparsed-answer-key-line',
          `Answer key line ${sourceLine} must start with a question number.`,
          sourceLine,
        ),
      );
      return;
    }

    const rowDiagnostics: ReadingV2TeacherAnswerKeyDiagnostic[] = [];
    if (!answerText) {
      rowDiagnostics.push(
        answerKeyDiagnostic(
          'missing-answer-text',
          `Question ${questionNumber} is missing answer text.`,
          sourceLine,
          questionNumber,
        ),
      );
    }

    const parsed = parsedAnswerValues(answerText, sourceLine, questionNumber);
    rowDiagnostics.push(...parsed.diagnostics);

    rows.push({
      questionNumber,
      rawAnswerText: answerText,
      parsedAnswerValues: parsed.values,
      sourceLine,
      diagnostics: rowDiagnostics,
      bindingStatus: rowDiagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'invalid' : 'unbound',
    });
    diagnostics.push(...rowDiagnostics);
  });

  const byQuestion = new Map<number, ReadingV2TeacherAnswerKeyRow[]>();
  rows.forEach((row) => {
    byQuestion.set(row.questionNumber, [...(byQuestion.get(row.questionNumber) ?? []), row]);
  });

  byQuestion.forEach((questionRows, questionNumber) => {
    if (questionRows.length < 2) {
      return;
    }

    questionRows.forEach((row) => {
      const diagnostic = answerKeyDiagnostic(
        'duplicate-question-number',
        `Question ${questionNumber} appears more than once in the teacher answer key.`,
        row.sourceLine,
        questionNumber,
      );
      diagnostics.push(diagnostic);
      const rowIndex = rows.indexOf(row);
      rows[rowIndex] = {
        ...row,
        diagnostics: [...row.diagnostics, diagnostic],
        bindingStatus: 'duplicate',
      };
    });
  });

  return { rawText, rows, diagnostics };
};

const answerKeyPayloadForCandidate = (
  candidate: ReadingV2ImportCandidate,
): ReadingV2TeacherAnswerKeyPayload =>
  candidate.teacherAnswerKey ?? parseReadingV2TeacherAnswerKey(candidate.answerKeyText);

const answerKeyRowsByQuestion = (
  payload: ReadingV2TeacherAnswerKeyPayload,
): ReadonlyMap<number, readonly string[]> =>
  new Map(
    payload.rows
      .filter((row) =>
        row.parsedAnswerValues.length > 0
        && !row.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
        && row.bindingStatus !== 'duplicate',
      )
      .map((row) => [row.questionNumber, row.parsedAnswerValues]),
  );

const countAnswerKeyRows = (answerKeyText: string | undefined): number =>
  parseReadingV2TeacherAnswerKey(answerKeyText).rows.filter((row) =>
    row.parsedAnswerValues.length > 0 && row.bindingStatus !== 'duplicate',
  ).length;

interface PlainTextPassageBlock {
  readonly passageNumber: number;
  readonly text: string;
}

const plainTextPassageBlocks = (text: string): readonly PlainTextPassageBlock[] => {
  const withoutFrontmatter = stripFrontmatter(text);
  const headingMatcher = /^\s*#{0,3}\s*READING PASSAGE\s+(\d+)\s*$/gim;
  const matches = [...withoutFrontmatter.matchAll(headingMatcher)];

  if (matches.length === 0) {
    return [{ passageNumber: 1, text: withoutFrontmatter }];
  }

  return matches.map((match, index) => {
    const headingEnd = (match.index ?? 0) + match[0].length;
    const nextStart = matches[index + 1]?.index ?? withoutFrontmatter.length;
    return {
      passageNumber: Number(match[1]) || index + 1,
      text: withoutFrontmatter.slice(headingEnd, nextStart).trim(),
    };
  });
};

const passageTitle = (text: string, fallback: string): string => {
  const match = text.match(/^##\s+(.+)$/m);
  return match?.[1] ? cleanMarkdown(match[1]) : fallback;
};

const passageParagraphs = (passageBlock: string): readonly string[] => {
  const beforeQuestions = passageBlock.split(/\n#### Questions/i)[0] ?? passageBlock;

  return beforeQuestions
    .split(/\n{2,}/)
    .map(cleanMarkdown)
    .filter((paragraph) =>
      paragraph.length > 40
      && !paragraph.startsWith('#')
      && !paragraph.startsWith('You should spend')
      && !paragraph.startsWith('Advertisements'),
    );
};

interface QuestionBlock {
  readonly rangeLabel: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly taskType: ReadingV2CanonicalTaskType;
}

const detectTaskType = (text: string): ReadingV2CanonicalTaskType => {
  const normalized = text.toLowerCase();

  if (normalized.includes('true') && normalized.includes('false') && normalized.includes('not') && normalized.includes('given')) {
    return 'true-false-not-given';
  }

  if (normalized.includes('yes') && normalized.includes('no') && normalized.includes('not') && normalized.includes('given')) {
    return 'yes-no-not-given';
  }

  if (normalized.includes('complete the table')) {
    return 'table-completion';
  }

  if (normalized.includes('complete the notes')) {
    return 'note-completion';
  }

  if (normalized.includes('choose the correct heading') || normalized.includes('list of headings')) {
    return 'matching-headings';
  }

  if (normalized.includes('matching sentence endings') || normalized.includes('complete each sentence')) {
    return 'matching-sentence-endings';
  }

  if (normalized.includes('choose the correct letter') || normalized.includes('multiple choice')) {
    return 'multiple-choice';
  }

  if (normalized.includes('answer the questions')) {
    return 'short-answer';
  }

  return 'sentence-completion';
};

const questionBlocks = (passageBlock: string): readonly QuestionBlock[] => {
  const blocks: QuestionBlock[] = [];
  const matcher = /#### Questions\s+(\d+)\s*[-–â€“]\s*(\d+)([\s\S]*?)(?=\n#### Questions|\n### READING PASSAGE|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(passageBlock)) !== null) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    const text = match[3] ?? '';

    blocks.push({
      rangeLabel: `${start}-${end}`,
      start,
      end,
      text,
      taskType: detectTaskType(text),
    });
  }

  return blocks;
};

const responseShapeFor = (
  taskType: ReadingV2CanonicalTaskType,
  optionSetId: ReturnType<typeof readingV2Ids.optionSetId>,
  wordLimit?: number,
  selectionLimit = 2,
): ReadingV2ResponseShape => {
  switch (taskType) {
    case 'true-false-not-given':
      return { kind: 'binary-judgement', vocabulary: 'TFNG' };
    case 'yes-no-not-given':
      return { kind: 'binary-judgement', vocabulary: 'YNNG' };
    case 'summary-completion-list':
    case 'multiple-choice':
      return { kind: 'single-choice', optionSetId };
    case 'multiple-select':
      return { kind: 'multi-select', optionSetId, selectionLimit };
    case 'matching-headings':
    case 'matching-features':
    case 'matching-sentence-endings':
      return {
        kind: 'matching',
        optionSetId,
        optionReuse: taskType === 'matching-headings' || taskType === 'matching-sentence-endings'
          ? 'disallowed'
          : 'allowed',
      };
    case 'matching-information':
      return { kind: 'matching', optionSetId, optionReuse: 'allowed' };
    case 'table-completion':
      return { kind: 'structured-entry', structure: 'table' };
    case 'flowchart-completion':
      return { kind: 'structured-entry', structure: 'flowchart' };
    case 'diagram-labeling':
      return { kind: 'structured-entry', structure: 'diagram' };
    default:
      return { kind: 'free-text', wordLimit: wordLimit ?? 3 };
  }
};

const normalizeAnswersForResponseShape = (
  answers: readonly string[],
  responseShape: ReadingV2ResponseShape,
): readonly string[] =>
  answers
    .flatMap((answer) => acceptedAnswerVariantsFromText(answer))
    .map((answer) => {
      const cleaned = cleanMarkdown(answer);
      return responseShape.kind === 'binary-judgement'
        ? normalizeReadingV2JudgementAnswerForStorage(cleaned, responseShape.vocabulary)
        : cleaned;
    })
    .filter(Boolean);

const instructionSourceExcerpt = (text: string | undefined): string | undefined => {
  const cleaned = cleanMarkdown(text ?? '');
  if (!cleaned) {
    return undefined;
  }

  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
};

const normalizeImportedInstructionText = (
  taskType: ReadingV2CanonicalTaskType,
  sourceText: string | undefined,
  fallbackText?: string,
  semantics: ReadingV2InstructionSemantics = {},
): string => {
  const source = cleanMarkdown(sourceText ?? fallbackText ?? '');
  const instructionSemantics = {
    ...semantics,
    wordLimitText: semantics.wordLimitText ?? wordLimitTextFromText(source),
  };

  return getReadingV2InstructionText(taskType, instructionSemantics);
};

const sourceEvidenceLooksLikeQuestionPrompt = (
  taskType: ReadingV2CanonicalTaskType,
  sourceText: string,
): boolean => {
  if (taskType !== 'multiple-choice' && taskType !== 'multiple-select') {
    return false;
  }

  const normalized = sourceText.toLowerCase();

  return /^(?:which|what|who|whom|whose|when|where|why|how)\b/.test(normalized)
    && !normalized.includes('answer sheet')
    && !normalized.includes('write the correct')
    && !normalized.includes('choose the correct');
};

const customInstructionIssue = (
  taskType: ReadingV2CanonicalTaskType,
  sourceText: string | undefined,
  taskGroupId: string,
  rangeLabel: string,
  semantics: ReadingV2InstructionSemantics,
): ReadingV2ValidationIssue | undefined => {
  const source = cleanMarkdown(sourceText ?? '');
  if (
    !source
    || readingV2InstructionLooksStandard(taskType, source, semantics)
    || sourceEvidenceLooksLikeQuestionPrompt(taskType, source)
  ) {
    return undefined;
  }

  const excerpt = instructionSourceExcerpt(source);
  return unresolvedIssue(
    `Imported instructions for Questions ${rangeLabel} contain non-standard source wording. Studio used the standard IELTS task-type instruction; review source instruction evidence: "${excerpt}"`,
    taskGroupId,
  );
};

const answerKeyDiagnosticsAsIssues = (
  payload: ReadingV2TeacherAnswerKeyPayload,
): readonly ReadingV2ValidationIssue[] =>
  payload.diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => ({
      code: 'teacher-answer-key-parse',
      severity: 'error',
      message: diagnostic.message,
      objectId: `teacher-answer-key-line-${diagnostic.sourceLine}`,
    }));

const unboundAnswerKeyRowsAsIssues = (
  payload: ReadingV2TeacherAnswerKeyPayload,
  questionNumbers: ReadonlySet<number>,
): readonly ReadingV2ValidationIssue[] =>
  payload.rows
    .filter((row) =>
      row.parsedAnswerValues.length > 0
      && !row.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      && row.bindingStatus !== 'duplicate'
      && !questionNumbers.has(row.questionNumber),
    )
    .map((row) => ({
      code: 'unbound-teacher-answer-key-row',
      severity: 'error',
      message: `Teacher answer key row for question ${row.questionNumber} does not match an imported question.`,
      objectId: `teacher-answer-key-line-${row.sourceLine}`,
    }));

const answeredQuestionNumbers = (
  interactions: Readonly<Record<string, ReadingV2Interaction>>,
): ReadonlySet<number> =>
  new Set(
    Object.values(interactions)
      .map((interaction) => interaction.reviewLabel.displayNumber)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  );

const plainTextPassageHeadingCount = (rawText: string): number =>
  (stripFrontmatter(rawText).match(/^\s*#{0,3}\s*READING PASSAGE\s+\d+\s*$/gim) ?? []).length;

const createOptionSet = (
  optionSetId: ReturnType<typeof readingV2Ids.optionSetId>,
  taskGroupId: ReturnType<typeof readingV2Ids.taskGroupId>,
): ReadingV2OptionSet => ({
  optionSetId,
  taskGroupId,
  options: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
    optionId: `${optionSetId}-${label.toLowerCase()}`,
    label,
    text: `Imported option ${label}`,
  })),
});

const TABLE_BLANK_MARKER = '_____';
const visibleQuestionBlankPattern = /_{3,}|\[\s*(?:blank|\d+)\s*\]|\{\{\s*(?:blank|\d+)\s*\}\}/i;

interface StructuredReadingPayload {
  readonly sourceFile?: string;
  readonly answerKeyText?: string;
  readonly materials?: readonly StructuredReadingMaterial[];
}

interface StructuredReadingPassage {
  readonly title?: string;
  readonly content?: string;
  readonly contentBlocks?: readonly StructuredPassageBlock[];
  readonly notes?: readonly (string | StructuredPassageBlock)[];
  readonly media?: readonly StructuredPassageMedia[];
  readonly images?: readonly StructuredPassageMedia[];
}

interface StructuredReadingMaterial {
  readonly passageNumber?: number;
  readonly title?: string;
  readonly passages?: readonly StructuredReadingPassage[];
  readonly sectionInstructions?: readonly StructuredSectionInstruction[];
  readonly questions?: readonly StructuredReadingQuestion[];
}

interface StructuredPassageBlock {
  readonly kind?: 'paragraph' | 'heading' | 'list-item' | 'bullet' | 'ordered-list-item' | 'note';
  readonly text?: string;
  readonly level?: number;
  readonly headingLevel?: number;
  readonly listKind?: 'ordered' | 'bullet';
  readonly label?: string;
  readonly itemId?: string;
}

interface StructuredPassageMedia {
  readonly title?: string;
  readonly url?: string;
  readonly mediaUrl?: string;
  readonly imageUrl?: string;
  readonly alt?: string;
  readonly imageAlt?: string;
  readonly caption?: string;
  readonly source?: string;
}

interface StructuredSectionInstruction {
  readonly id?: string;
  readonly text?: string;
  readonly taskType?: string;
  readonly sourceInstructionEvidence?: string;
  readonly customInstructionEvidence?: string;
  readonly studentVisibleInstructionText?: string;
  readonly wordLimit?: number;
  readonly wordLimitText?: string;
  readonly vocabulary?: 'TFNG' | 'YNNG' | string;
  readonly selectionLimit?: number;
  readonly answerSource?: string;
  readonly optionLabelRange?: string;
  readonly referenceLabelRange?: string;
  readonly reuseAllowed?: boolean;
  readonly questionRange?: {
    readonly start?: number;
    readonly end?: number;
  };
  readonly note?: StructuredNotePayload;
  readonly table?: StructuredTablePayload;
  readonly flowchart?: StructuredFlowchartPayload;
  readonly diagram?: StructuredDiagramPayload;
  readonly layoutHint?: string;
  readonly sectionReferences?: readonly {
    readonly label?: string;
    readonly text?: string;
  }[];
  readonly labeledOptions?: readonly {
    readonly label?: string;
    readonly text?: string;
  }[];
}

interface StructuredReadingQuestion {
  readonly id?: string;
  readonly number?: number;
  readonly questionNumber?: number;
  readonly questionText?: string;
  readonly question?: string;
  readonly type?: string;
  readonly answer?: string | readonly string[];
  readonly wordLimit?: number;
  readonly wordLimitText?: string;
  readonly sectionInstructionId?: string;
  readonly labeledOptions?: readonly {
    readonly label?: string;
    readonly text?: string;
  }[];
  readonly sectionReferences?: readonly {
    readonly label?: string;
    readonly text?: string;
  }[];
}

interface StructuredOptionItem {
  readonly label?: string;
  readonly text?: string;
}

interface StructuredNotePayload {
  readonly title?: string;
  readonly subheading?: string;
  readonly sections?: readonly StructuredNoteSection[];
  readonly lines?: readonly StructuredNoteLine[];
}

interface StructuredNoteSection {
  readonly heading?: string;
  readonly questionNumbers?: readonly number[];
  readonly lines?: readonly StructuredNoteLine[];
}

interface StructuredNoteLine {
  readonly text?: string;
  readonly questionNumber?: number;
  readonly questionNumbers?: readonly number[];
}

interface StructuredTablePayload {
  readonly rows?: readonly (readonly (StructuredTableCell | string)[])[];
}

interface StructuredTableCell {
  readonly text?: string;
  readonly role?: 'header' | 'body';
  readonly questionNumber?: number;
  readonly questionNumbers?: readonly number[];
  readonly rowSpan?: number;
  readonly colSpan?: number;
  readonly isBlank?: boolean;
}

interface StructuredFlowchartPayload {
  readonly steps?: readonly (StructuredFlowchartStep | string)[];
}

interface StructuredFlowchartStep {
  readonly id?: string;
  readonly stepId?: string;
  readonly text?: string;
  readonly questionNumber?: number;
  readonly questionNumbers?: readonly number[];
  readonly nextStepIds?: readonly string[];
  readonly isBlank?: boolean;
}

interface StructuredDiagramPayload {
  readonly imageAlt?: string;
  readonly imageUrl?: string;
  readonly targets?: readonly StructuredDiagramTarget[];
}

interface StructuredDiagramTarget {
  readonly label?: string;
  readonly questionNumber?: number;
  readonly questionNumbers?: readonly number[];
  readonly xPercent?: number;
  readonly yPercent?: number;
}

const extractStructuredPayload = (rawText: string): StructuredReadingPayload | null => {
  const start = rawText.indexOf(READING_V2_STRUCTURED_MATERIALS_START);
  const end = rawText.indexOf(READING_V2_STRUCTURED_MATERIALS_END);

  if (start < 0 || end <= start) {
    return null;
  }

  const fencedBlock = rawText
    .slice(start + READING_V2_STRUCTURED_MATERIALS_START.length, end)
    .trim();
  const block = fencedBlock
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(block) as StructuredReadingPayload;
    return Array.isArray(parsed.materials) ? parsed : null;
  } catch {
    return null;
  }
};

const structuredTaskType = (value: string | undefined): ReadingV2CanonicalTaskType => {
  const normalized = value?.trim().toLowerCase() ?? '';
  const candidate = normalizeReadingV2TaskType(normalized, {
    summaryAnswerMode: normalized.includes('summary') ? 'text' : undefined,
  });

  if (candidate) {
    return candidate;
  }

  if (normalized.includes('summary')) {
    return 'summary-completion-text';
  }

  return 'sentence-completion';
};

type NormalizedStructuredPassageBlock = Pick<
  ReadingV2PassageParagraph,
  'blockKind' | 'headingLevel' | 'itemId' | 'label' | 'listKind' | 'text'
>;

const passageHeadingLevel = (value: number | undefined): 1 | 2 | 3 => {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }

  return 2;
};

const normalizePassageBlockFromRawText = (rawText: string): NormalizedStructuredPassageBlock | null => {
  const text = rawText.trim();
  if (!text) {
    return null;
  }

  const headingMatch = text.match(/^(#{1,3})\s+(.+)$/);
  if (headingMatch?.[1] && headingMatch[2]) {
    return {
      blockKind: 'heading',
      headingLevel: passageHeadingLevel(headingMatch[1].length),
      text: preserveSourceMarkdown(headingMatch[2]),
    };
  }

  const orderedMatch = text.match(/^\d+[.)]\s+(.+)$/);
  if (orderedMatch?.[1]) {
    return {
      blockKind: 'list-item',
      listKind: 'ordered',
      text: preserveSourceMarkdown(orderedMatch[1]),
    };
  }

  const bulletMatch = text.match(/^[-*]\s+(.+)$/);
  if (bulletMatch?.[1]) {
    return {
      blockKind: 'list-item',
      listKind: 'bullet',
      text: preserveSourceMarkdown(bulletMatch[1]),
    };
  }

  return {
    blockKind: 'paragraph',
    text: preserveSourceMarkdown(text),
  };
};

const structuredContentBlocks = (content: string | undefined): readonly NormalizedStructuredPassageBlock[] => {
  const blocks: NormalizedStructuredPassageBlock[] = [];

  (content ?? '')
    .split(/\n{2,}/)
    .forEach((chunk) => {
      const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const listLines = lines.length > 1 && lines.every((line) => /^(?:[-*]|\d+[.)])\s+/.test(line));

      if (listLines) {
        lines.forEach((line) => {
          const block = normalizePassageBlockFromRawText(line);
          if (block) {
            blocks.push(block);
          }
        });
        return;
      }

      const block = normalizePassageBlockFromRawText(chunk);
      if (block) {
        blocks.push(block);
      }
    });

  return blocks;
};

const normalizeStructuredPassageBlock = (
  block: StructuredPassageBlock | string,
  fallbackLabel?: string,
): NormalizedStructuredPassageBlock | null => {
  if (typeof block === 'string') {
    const normalized = normalizePassageBlockFromRawText(block);
    return normalized ? withoutUndefined({ ...normalized, label: fallbackLabel }) : null;
  }

  const text = preserveSourceMarkdown(block.text ?? '');
  if (!text) {
    return null;
  }

  if (block.kind === 'heading') {
    return withoutUndefined({
      blockKind: 'heading' as const,
      headingLevel: passageHeadingLevel(block.headingLevel ?? block.level),
      label: block.label ?? fallbackLabel,
      text,
    });
  }

  if (block.kind === 'list-item' || block.kind === 'bullet' || block.kind === 'ordered-list-item') {
    return withoutUndefined({
      blockKind: 'list-item' as const,
      itemId: block.itemId,
      label: block.label ?? fallbackLabel,
      listKind: block.listKind ?? (block.kind === 'ordered-list-item' ? 'ordered' : 'bullet'),
      text,
    });
  }

  return withoutUndefined({
    blockKind: 'paragraph' as const,
    label: block.label ?? fallbackLabel ?? (block.kind === 'note' ? 'Note' : undefined),
    text,
  });
};

const structuredPassageBlocks = (
  passage: StructuredReadingPassage | undefined,
): readonly NormalizedStructuredPassageBlock[] => {
  const explicitBlocks = (passage?.contentBlocks ?? [])
    .map((block) => normalizeStructuredPassageBlock(block))
    .filter((block): block is NormalizedStructuredPassageBlock => Boolean(block));
  const sourceBlocks = explicitBlocks.length > 0
    ? explicitBlocks
    : structuredContentBlocks(passage?.content);
  const noteBlocks = (passage?.notes ?? [])
    .map((block) => normalizeStructuredPassageBlock(block, 'Note'))
    .filter((block): block is NormalizedStructuredPassageBlock => Boolean(block));
  const blocks = [...sourceBlocks, ...noteBlocks];

  return blocks.length > 0
    ? blocks
    : [{
        blockKind: 'paragraph',
        text: 'Imported passage text requires teacher review before publish.',
      }];
};

const structuredPassageMedia = (
  passage: StructuredReadingPassage | undefined,
): readonly {
  readonly title?: string;
  readonly mediaUrl?: string;
  readonly alt: string;
  readonly caption?: string;
  readonly source?: string;
}[] =>
  [...(passage?.media ?? []), ...(passage?.images ?? [])]
    .map((media) => {
      const mediaUrl = media.mediaUrl ?? media.imageUrl ?? media.url;
      const caption = media.caption ? cleanMarkdown(media.caption) : undefined;
      const alt = cleanMarkdown(media.alt ?? media.imageAlt ?? caption ?? 'Imported passage image');
      return withoutUndefined({
        title: media.title ? cleanMarkdown(media.title) : caption,
        mediaUrl,
        alt,
        caption,
        source: media.source ? cleanMarkdown(media.source) : undefined,
      });
    })
    .filter((media) =>
      Boolean(media.mediaUrl?.trim() || media.caption?.trim() || media.source?.trim() || media.alt.trim()),
    );

const structuredPassageHasContent = (passage: StructuredReadingPassage | undefined): boolean =>
  Boolean(
    passage?.content?.trim()
    || passage?.contentBlocks?.some((block) => Boolean(block.text?.trim()))
    || passage?.notes?.some((note) =>
      typeof note === 'string'
        ? note.trim().length > 0
        : Boolean(note.text?.trim()),
    )
    || passage?.media?.length
    || passage?.images?.length,
  );

const structuredQuestionNumber = (question: StructuredReadingQuestion): number =>
  Number(question.questionNumber ?? question.number ?? 0);

const positiveStructuredInteger = (value: unknown): number | null => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const structuredMaterialPassageNumber = (
  material: StructuredReadingMaterial,
  materialIndex: number,
  usedPassageNumbers: Set<number>,
): number => {
  const preferredPassageNumber = positiveStructuredInteger(material.passageNumber) ?? materialIndex + 1;
  let passageNumber = preferredPassageNumber;

  while (usedPassageNumbers.has(passageNumber)) {
    passageNumber += 1;
  }

  usedPassageNumbers.add(passageNumber);
  return passageNumber;
};

const structuredQuestionAnswers = (question: StructuredReadingQuestion): readonly string[] => {
  if (Array.isArray(question.answer)) {
    return question.answer.map((answer) => cleanMarkdown(String(answer))).filter(Boolean);
  }

  if (typeof question.answer !== 'string') {
    return [];
  }

  return question.answer
    .split('|')
    .map(cleanMarkdown)
    .filter(Boolean);
};

const wordLimitFromText = (text: string | undefined): number | undefined => {
  const normalized = cleanMarkdown(text ?? '').toLowerCase();

  if (/\bone\s+word\b/.test(normalized)) {
    return 1;
  }

  if (/\btwo\s+words?\b/.test(normalized)) {
    return 2;
  }

  if (/\bthree\s+words?\b/.test(normalized)) {
    return 3;
  }

  const numericMatch = normalized.match(/no more than\s+(\d+)\s+words?/);
  if (numericMatch?.[1]) {
    return Number(numericMatch[1]);
  }

  return undefined;
};

const wordLimitTextFromText = (text: string | undefined): string | undefined => {
  const normalized = cleanMarkdown(text ?? '').toUpperCase();
  const phrasePatterns = [
    /NO MORE THAN THREE WORDS AND\/OR A NUMBER/,
    /NO MORE THAN TWO WORDS AND\/OR A NUMBER/,
    /NO MORE THAN ONE WORD AND\/OR A NUMBER/,
    /NO MORE THAN THREE WORDS/,
    /NO MORE THAN TWO WORDS/,
    /NO MORE THAN ONE WORD/,
    /THREE WORDS AND\/OR A NUMBER/,
    /TWO WORDS AND\/OR A NUMBER/,
    /ONE WORD AND\/OR A NUMBER/,
    /THREE WORDS ONLY/,
    /TWO WORDS ONLY/,
    /ONE WORD ONLY/,
  ];

  const match = phrasePatterns
    .map((pattern) => normalized.match(pattern)?.[0])
    .find(Boolean);

  return match;
};

const labelRangeFromItems = (
  items: readonly { readonly label?: string }[] | undefined,
): string | undefined => {
  const labels = (items ?? [])
    .map((item) => cleanMarkdown(item.label ?? ''))
    .filter(Boolean);

  if (labels.length === 0) {
    return undefined;
  }

  if (labels.length === 1) {
    return labels[0];
  }

  return `${labels[0]}-${labels[labels.length - 1]}`;
};

const labelsFromLetterRange = (range: string | undefined): readonly string[] => {
  const normalized = cleanMarkdown(range ?? '')
    .replace(/\s+/g, '')
    .replace(/\u2013|\u2014/g, '-');
  const match = normalized.match(/^([A-Za-z])-([A-Za-z])$/);

  if (!match?.[1] || !match[2]) {
    return [];
  }

  const start = match[1].toUpperCase().charCodeAt(0);
  const end = match[2].toUpperCase().charCodeAt(0);

  if (end < start || end - start > 25) {
    return [];
  }

  return Array.from({ length: end - start + 1 }, (_, index) =>
    String.fromCharCode(start + index),
  );
};

const letterLabelRangeFromInstructionText = (text: string | undefined): string | undefined => {
  const normalized = cleanMarkdown(text ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/\b([A-Za-z])\s*(?:-|to)\s*([A-Za-z])\b/);
  const startLabel = match?.[1]?.toUpperCase();
  const endLabel = match?.[2]?.toUpperCase();

  if (!startLabel || !endLabel) {
    return undefined;
  }

  const start = startLabel.charCodeAt(0);
  const end = endLabel.charCodeAt(0);
  if (end <= start || end - start > 25) {
    return undefined;
  }

  return `${startLabel}-${endLabel}`;
};

const defaultOptionLabelsForTaskType = (
  taskType: ReadingV2CanonicalTaskType,
  instruction?: StructuredSectionInstruction,
): readonly string[] => {
  const rangeLabels = labelsFromLetterRange(
    readingV2TaskUsesImportedLabeledOptions(taskType)
      ? instruction?.optionLabelRange
      : instruction?.referenceLabelRange,
  );

  if (rangeLabels.length > 0) {
    return rangeLabels;
  }

  if (taskType === 'multiple-select') {
    return ['A', 'B', 'C', 'D', 'E'];
  }

  if (taskType === 'multiple-choice') {
    return ['A', 'B', 'C', 'D'];
  }

  return ['A', 'B', 'C', 'D', 'E'];
};

const structuredInstructionSourceText = (instruction: StructuredSectionInstruction): string | undefined =>
  instruction.customInstructionEvidence
  ?? instruction.sourceInstructionEvidence
  ?? instruction.studentVisibleInstructionText
  ?? instruction.text;

const questionRangeSemantics = (
  start: number,
  end: number,
): ReadingV2InstructionSemantics['questionRange'] | undefined =>
  start > 0 && end > 0 ? { start, end } : undefined;

const structuredInstructionSemantics = (input: {
  readonly instruction: StructuredSectionInstruction;
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly passageNumber: number;
  readonly start: number;
  readonly end: number;
  readonly firstQuestion?: StructuredReadingQuestion;
  readonly selectionLimit?: number;
}): ReadingV2InstructionSemantics => {
  const sourceText = structuredInstructionSourceText(input.instruction);
  const referenceLabelRange = input.instruction.referenceLabelRange
    ?? (readingV2TaskUsesReferenceLabelRange(input.taskType) ? letterLabelRangeFromInstructionText(sourceText) : undefined)
    ?? labelRangeFromItems(input.instruction.sectionReferences);

  return {
    questionRange: questionRangeSemantics(input.start, input.end),
    wordLimit: input.instruction.wordLimit
      ?? input.firstQuestion?.wordLimit
      ?? wordLimitFromText(sourceText),
    wordLimitText: input.instruction.wordLimitText
      ?? input.firstQuestion?.wordLimitText
      ?? wordLimitTextFromText(sourceText),
    passageNumber: input.passageNumber,
    selectionLimit: input.instruction.selectionLimit ?? input.selectionLimit,
    optionLabelRange: input.instruction.optionLabelRange ?? labelRangeFromItems(input.instruction.labeledOptions),
    referenceLabelRange,
    reuseAllowed: input.instruction.reuseAllowed,
  };
};

const structuredQuestionPromptText = (question: StructuredReadingQuestion): string | undefined => {
  const prompt = preserveSourceMarkdown(question.questionText ?? question.question ?? '');
  return prompt.length > 0 ? prompt : undefined;
};

const NOTE_LAYOUT_KIND = 'note-completion-layout';

interface NoteCompletionLayoutSection {
  readonly heading: string;
  readonly questionNumbers: readonly number[];
}

interface NoteCompletionLayoutContext {
  readonly layoutHint?: string;
  readonly promptTextByQuestionNumber: ReadonlyMap<number, string>;
}

const uniqueQuestionNumbers = (questionNumbers: readonly number[]): readonly number[] => {
  const seen = new Set<number>();

  return questionNumbers
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const structuredNoteLineQuestionNumbers = (line: StructuredNoteLine): readonly number[] =>
  uniqueQuestionNumbers([
    line.questionNumber ?? 0,
    ...(line.questionNumbers ?? []),
  ]);

const structuredNoteSectionQuestionNumbers = (section: StructuredNoteSection): readonly number[] =>
  uniqueQuestionNumbers([
    ...(section.questionNumbers ?? []),
    ...(section.lines ?? []).flatMap(structuredNoteLineQuestionNumbers),
  ]);

const setNoteLinePromptText = (
  prompts: Map<number, string>,
  line: StructuredNoteLine,
): void => {
  const text = preserveSourceMarkdown(line.text ?? '');
  if (!text) {
    return;
  }

  structuredNoteLineQuestionNumbers(line).forEach((questionNumber) => {
    prompts.set(questionNumber, text);
  });
};

const noteLayoutHint = (input: {
  readonly subheading?: string;
  readonly sections: readonly NoteCompletionLayoutSection[];
}): string | undefined => {
  const subheading = preserveSourceMarkdown(input.subheading ?? '');
  const sections = input.sections
    .map((section) => ({
      heading: preserveSourceMarkdown(section.heading),
      questionNumbers: uniqueQuestionNumbers(section.questionNumbers),
    }))
    .filter((section) => section.heading.length > 0 && section.questionNumbers.length > 0);

  if (!subheading && sections.length === 0) {
    return undefined;
  }

  return JSON.stringify(withoutUndefined({
    kind: NOTE_LAYOUT_KIND,
    subheading: subheading || undefined,
    sections: sections.length > 0 ? sections : undefined,
  }));
};

const explicitNoteLayoutContext = (
  instruction: StructuredSectionInstruction,
): NoteCompletionLayoutContext | null => {
  if (!instruction.note) {
    return null;
  }

  const promptTextByQuestionNumber = new Map<number, string>();
  (instruction.note.lines ?? []).forEach((line) => setNoteLinePromptText(promptTextByQuestionNumber, line));
  (instruction.note.sections ?? []).forEach((section) =>
    (section.lines ?? []).forEach((line) => setNoteLinePromptText(promptTextByQuestionNumber, line)),
  );

  const sections = (instruction.note.sections ?? [])
    .map((section) => ({
      heading: preserveSourceMarkdown(section.heading ?? ''),
      questionNumbers: structuredNoteSectionQuestionNumbers(section),
    }))
    .filter((section) => section.heading.length > 0 && section.questionNumbers.length > 0);

  return {
    layoutHint: noteLayoutHint({
      subheading: instruction.note.subheading ?? instruction.note.title,
      sections,
    }),
    promptTextByQuestionNumber,
  };
};

const splitFlattenedNotePrefix = (
  promptText: string | undefined,
): { readonly heading: string; readonly promptText: string } | null => {
  const prompt = preserveSourceMarkdown(promptText ?? '').replace(/\s*\n\s*/g, ' ');
  const match = prompt.match(/^(.{4,90}?)[.:]\s+(.+)$/);

  if (!match) {
    return null;
  }

  const heading = cleanMarkdown(match[1] ?? '');
  const remainder = preserveSourceMarkdown(match[2] ?? '');

  if (!heading || !remainder || !visibleQuestionBlankPattern.test(remainder)) {
    return null;
  }

  return { heading, promptText: remainder };
};

const inferredNoteLayoutContext = (
  groupQuestions: readonly StructuredReadingQuestion[],
): NoteCompletionLayoutContext | null => {
  const splits = groupQuestions.map((question) => ({
    questionNumber: structuredQuestionNumber(question),
    split: splitFlattenedNotePrefix(structuredQuestionPromptText(question)),
  }));
  const headingCounts = new Map<string, number>();

  splits.forEach(({ split }) => {
    if (split) {
      headingCounts.set(split.heading, (headingCounts.get(split.heading) ?? 0) + 1);
    }
  });

  const repeatedHeadings = new Set(
    [...headingCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([heading]) => heading),
  );

  if (repeatedHeadings.size === 0) {
    return null;
  }

  const promptTextByQuestionNumber = new Map<number, string>();
  const sections: NoteCompletionLayoutSection[] = [];
  let activeSection: NoteCompletionLayoutSection | null = null;

  splits.forEach(({ questionNumber, split }) => {
    if (!split || !repeatedHeadings.has(split.heading) || questionNumber <= 0) {
      activeSection = null;
      return;
    }

    promptTextByQuestionNumber.set(questionNumber, split.promptText);

    if (!activeSection || activeSection.heading !== split.heading) {
      activeSection = { heading: split.heading, questionNumbers: [] };
      sections.push(activeSection);
    }

    activeSection = {
      ...activeSection,
      questionNumbers: [...activeSection.questionNumbers, questionNumber],
    };
    sections[sections.length - 1] = activeSection;
  });

  return {
    layoutHint: noteLayoutHint({ sections }),
    promptTextByQuestionNumber,
  };
};

const noteCompletionLayoutContext = (
  taskType: ReadingV2CanonicalTaskType,
  instruction: StructuredSectionInstruction,
  groupQuestions: readonly StructuredReadingQuestion[],
): NoteCompletionLayoutContext | null => {
  if (taskType !== 'note-completion') {
    return null;
  }

  const explicit = explicitNoteLayoutContext(instruction);
  if (explicit?.layoutHint || explicit?.promptTextByQuestionNumber.size) {
    return explicit;
  }

  return inferredNoteLayoutContext(groupQuestions);
};

const splitSummaryPromptBlank = (
  promptText: string,
): { readonly before: string; readonly after: string } | null => {
  const match = promptText.match(visibleQuestionBlankPattern);
  if (!match || match.index === undefined) {
    return null;
  }

  return {
    before: preserveSourceMarkdown(promptText.slice(0, match.index)).trim(),
    after: preserveSourceMarkdown(promptText.slice(match.index + match[0].length)).trim(),
  };
};

const mergeSummarySegments = (left: string | undefined, right: string | undefined): string => {
  const leftText = left?.trim() ?? '';
  const rightText = right?.trim() ?? '';

  if (!leftText) {
    return rightText;
  }
  if (!rightText) {
    return leftText;
  }

  const leftKey = leftText.toLowerCase();
  const rightKey = rightText.toLowerCase();
  if (leftKey === rightKey || leftKey.includes(rightKey)) {
    return leftText;
  }
  if (rightKey.includes(leftKey)) {
    return rightText;
  }

  const maxOverlap = Math.min(leftText.length, rightText.length);
  for (let length = maxOverlap; length >= 16; length -= 1) {
    if (leftKey.slice(-length) === rightKey.slice(0, length)) {
      return `${leftText}${rightText.slice(length)}`;
    }
  }

  return `${leftText} ${rightText}`;
};

const summaryCompletionLayoutHint = (
  taskType: ReadingV2CanonicalTaskType,
  instruction: StructuredSectionInstruction,
  groupQuestions: readonly StructuredReadingQuestion[],
): string | undefined => {
  if (instruction.layoutHint || (taskType !== 'summary-completion-text' && taskType !== 'summary-completion-list')) {
    return instruction.layoutHint;
  }

  const splits = groupQuestions.map((question) => splitSummaryPromptBlank(structuredQuestionPromptText(question)));
  if (splits.length === 0 || splits.some((split) => split === null)) {
    return undefined;
  }

  const segments: string[] = [];
  (splits as readonly { readonly before: string; readonly after: string }[]).forEach((split, index) => {
    if (index === 0) {
      segments[0] = split.before;
    } else {
      segments[index] = mergeSummarySegments(segments[index], split.before);
    }
    segments[index + 1] = mergeSummarySegments(segments[index + 1], split.after);
  });

  return JSON.stringify({
    kind: taskType === 'summary-completion-text' ? 'summary-text' : 'summary-list',
    segments: Array.from({ length: groupQuestions.length + 1 }, (_, index) => segments[index] ?? ''),
  });
};

const structuredTableCellText = (cell: StructuredTableCell | string): string =>
  typeof cell === 'string' ? preserveSourceMarkdown(cell) : preserveSourceMarkdown(cell.text ?? '');

const structuredTableCellQuestionNumbers = (cell: StructuredTableCell | string): readonly number[] => {
  if (typeof cell === 'string') {
    return [];
  }

  const candidates = [
    cell.questionNumber,
    ...(cell.questionNumbers ?? []),
  ];
  const seen = new Set<number>();

  return candidates
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const positiveSpan = (value: number | undefined): number =>
  Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;

const tableInlineBlankCount = (text: string): number =>
  text.match(/_{3,}|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|\{\s*blank\s*\}/gi)?.length ?? 0;

const tableTextWithBlankMarkers = (text: string, expectedBlankCount: number): string => {
  if (expectedBlankCount <= 0) {
    return text;
  }

  const markerText = Array.from({ length: expectedBlankCount }, () => TABLE_BLANK_MARKER).join(' ');
  const inlineBlankCount = tableInlineBlankCount(text);

  if (inlineBlankCount === expectedBlankCount) {
    return text;
  }

  if (inlineBlankCount === 0) {
    return [text, markerText].filter(Boolean).join(' ');
  }

  return markerText;
};

interface StructuredTableContext {
  readonly stimulus: ReadingV2StimulusNode;
  readonly anchorIds: readonly ReadingV2AnchorId[];
  readonly anchorIdsByQuestionNumber: ReadonlyMap<number, ReadingV2AnchorId>;
}

interface StructuredFlowchartContext {
  readonly stimulus: ReadingV2StimulusNode;
  readonly anchorIds: readonly ReadingV2AnchorId[];
  readonly anchorIdsByQuestionNumber: ReadonlyMap<number, ReadingV2AnchorId>;
}

interface StructuredDiagramContext {
  readonly stimulus: ReadingV2StimulusNode;
  readonly anchorIds: readonly ReadingV2AnchorId[];
  readonly anchorIdsByQuestionNumber: ReadonlyMap<number, ReadingV2AnchorId>;
}

const createStructuredTableContext = ({
  anchors,
  groupQuestions,
  idStem,
  instruction,
  instructionIndex,
  passageNumber,
  taskGroupId,
}: {
  readonly anchors: Record<string, ReadingV2Anchor>;
  readonly groupQuestions: readonly StructuredReadingQuestion[];
  readonly idStem: string;
  readonly instruction: StructuredSectionInstruction;
  readonly instructionIndex: number;
  readonly passageNumber: number;
  readonly taskGroupId: ReturnType<typeof readingV2Ids.taskGroupId>;
}): StructuredTableContext | null => {
  const sourceRows = instruction.table?.rows?.filter((row) => Array.isArray(row));

  if (!sourceRows || sourceRows.length === 0) {
    return null;
  }

  const tableStimulusId = readingV2Ids.stimulusId(`${idStem}-table-${passageNumber}-${instructionIndex + 1}`);
  const anchorIds: ReadingV2AnchorId[] = [];
  const anchorIdsByQuestionNumber = new Map<number, ReadingV2AnchorId>();
  const questionNumbers = groupQuestions
    .map(structuredQuestionNumber)
    .filter((value) => Number.isInteger(value) && value > 0);
  const unassignedQuestionNumbers = [...questionNumbers];

  const takeFallbackQuestionNumbers = (count: number): readonly number[] => {
    const taken: number[] = [];

    while (taken.length < count && unassignedQuestionNumbers.length > 0) {
      const candidate = unassignedQuestionNumbers.shift();
      if (candidate && !anchorIdsByQuestionNumber.has(candidate)) {
        taken.push(candidate);
      }
    }

    return taken;
  };

  const useQuestionNumbers = (cell: StructuredTableCell | string, text: string): readonly number[] => {
    const explicitNumbers = structuredTableCellQuestionNumbers(cell)
      .filter((questionNumber) => questionNumbers.includes(questionNumber));

    if (explicitNumbers.length > 0) {
      explicitNumbers.forEach((questionNumber) => {
        const index = unassignedQuestionNumbers.indexOf(questionNumber);
        if (index >= 0) {
          unassignedQuestionNumbers.splice(index, 1);
        }
      });
      return explicitNumbers;
    }

    const inlineBlankCount = tableInlineBlankCount(text);
    const isBlank = typeof cell !== 'string' && cell.isBlank === true;
    if (!isBlank && inlineBlankCount === 0) {
      return [];
    }

    return takeFallbackQuestionNumbers(Math.max(1, inlineBlankCount));
  };

  const rows = sourceRows.map((row, rowIndex) =>
    row.map((cell, cellIndex): ReadingV2TableCellContent => {
      const text = structuredTableCellText(cell);
      const questionNumbersForCell = useQuestionNumbers(cell, text)
        .filter((questionNumber, index, values) => values.indexOf(questionNumber) === index);
      const cellAnchorIds = questionNumbersForCell.map((questionNumber) => {
        const anchorId = readingV2Ids.anchorId(
          `${idStem}-table-p${passageNumber}-q${questionNumber}`,
        );

        anchors[anchorId] = {
          anchorId,
          stimulusId: tableStimulusId,
          kind: 'table-cell',
          label: `Question ${questionNumber} table blank`,
        };
        anchorIds.push(anchorId);
        anchorIdsByQuestionNumber.set(questionNumber, anchorId);
        return anchorId;
      });
      const cellText = tableTextWithBlankMarkers(text, cellAnchorIds.length);

      return {
        cellId: `${taskGroupId}-cell-${rowIndex + 1}-${cellIndex + 1}`,
        text: cellText || (cellAnchorIds.length > 0 ? TABLE_BLANK_MARKER : ''),
        role: typeof cell === 'string' ? (rowIndex === 0 ? 'header' : 'body') : cell.role ?? (rowIndex === 0 ? 'header' : 'body'),
        isBlank: cellAnchorIds.length > 0 ? true : typeof cell !== 'string' && cell.isBlank ? true : undefined,
        rowSpan: typeof cell === 'string' ? 1 : positiveSpan(cell.rowSpan),
        colSpan: typeof cell === 'string' ? 1 : positiveSpan(cell.colSpan),
        anchorId: cellAnchorIds[0],
        anchorIds: cellAnchorIds.length > 0 ? cellAnchorIds : undefined,
      };
    }),
  );

  return {
    stimulus: {
      stimulusId: tableStimulusId,
      kind: 'table-shell',
      title: instruction.questionRange?.start && instruction.questionRange.end
        ? `Questions ${instruction.questionRange.start}-${instruction.questionRange.end} table`
        : 'Imported table',
      content: {
        kind: 'table-content',
        rows,
      },
      anchorIds,
    },
    anchorIds,
    anchorIdsByQuestionNumber,
  };
};

const structuredFlowchartStepText = (step: StructuredFlowchartStep | string): string =>
  typeof step === 'string' ? preserveSourceMarkdown(step) : preserveSourceMarkdown(step.text ?? '');

const structuredFlowchartStepQuestionNumbers = (step: StructuredFlowchartStep | string): readonly number[] => {
  if (typeof step === 'string') {
    return [];
  }

  const candidates = [
    step.questionNumber,
    ...(step.questionNumbers ?? []),
  ];
  const seen = new Set<number>();

  return candidates
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const structuredFlowchartStepId = (
  step: StructuredFlowchartStep | string,
  index: number,
): string =>
  typeof step === 'string'
    ? `step-${index + 1}`
    : cleanMarkdown(step.stepId ?? step.id ?? `step-${index + 1}`);

const createStructuredFlowchartContext = ({
  anchors,
  groupQuestions,
  idStem,
  instruction,
  instructionIndex,
  passageNumber,
}: {
  readonly anchors: Record<string, ReadingV2Anchor>;
  readonly groupQuestions: readonly StructuredReadingQuestion[];
  readonly idStem: string;
  readonly instruction: StructuredSectionInstruction;
  readonly instructionIndex: number;
  readonly passageNumber: number;
}): StructuredFlowchartContext | null => {
  const sourceSteps = instruction.flowchart?.steps;

  if (!sourceSteps || sourceSteps.length === 0) {
    return null;
  }

  const flowchartStimulusId = readingV2Ids.stimulusId(`${idStem}-flowchart-${passageNumber}-${instructionIndex + 1}`);
  const anchorIds: ReadingV2AnchorId[] = [];
  const anchorIdsByQuestionNumber = new Map<number, ReadingV2AnchorId>();
  const questionNumbers = groupQuestions
    .map(structuredQuestionNumber)
    .filter((value) => Number.isInteger(value) && value > 0);
  const unassignedQuestionNumbers = [...questionNumbers];

  const takeFallbackQuestionNumbers = (count: number): readonly number[] => {
    const taken: number[] = [];

    while (taken.length < count && unassignedQuestionNumbers.length > 0) {
      const candidate = unassignedQuestionNumbers.shift();
      if (candidate && !anchorIdsByQuestionNumber.has(candidate)) {
        taken.push(candidate);
      }
    }

    return taken;
  };

  const useQuestionNumbers = (step: StructuredFlowchartStep | string, text: string): readonly number[] => {
    const explicitNumbers = structuredFlowchartStepQuestionNumbers(step)
      .filter((questionNumber) => questionNumbers.includes(questionNumber));

    if (explicitNumbers.length > 0) {
      explicitNumbers.forEach((questionNumber) => {
        const index = unassignedQuestionNumbers.indexOf(questionNumber);
        if (index >= 0) {
          unassignedQuestionNumbers.splice(index, 1);
        }
      });
      return explicitNumbers;
    }

    const inlineBlankCount = tableInlineBlankCount(text);
    const isBlank = typeof step !== 'string' && step.isBlank === true;
    if (!isBlank && inlineBlankCount === 0) {
      return [];
    }

    return takeFallbackQuestionNumbers(Math.max(1, inlineBlankCount));
  };

  const steps = sourceSteps.flatMap((step, stepIndex) => {
    const text = structuredFlowchartStepText(step);
    const baseStepId = structuredFlowchartStepId(step, stepIndex) || `step-${stepIndex + 1}`;
    const nextStepIds = typeof step === 'string'
      ? undefined
      : step.nextStepIds?.map((stepId) => cleanMarkdown(String(stepId))).filter(Boolean);
    const questionNumbersForStep = useQuestionNumbers(step, text)
      .filter((questionNumber, index, values) => values.indexOf(questionNumber) === index);

    if (questionNumbersForStep.length === 0) {
      return [{
        stepId: baseStepId,
        text,
        nextStepIds,
      }];
    }

    return questionNumbersForStep.map((questionNumber) => {
      const anchorId = readingV2Ids.anchorId(`${idStem}-flow-p${passageNumber}-q${questionNumber}`);

      anchors[anchorId] = {
        anchorId,
        stimulusId: flowchartStimulusId,
        kind: 'flow-step',
        label: `Question ${questionNumber} flowchart blank`,
      };
      anchorIds.push(anchorId);
      anchorIdsByQuestionNumber.set(questionNumber, anchorId);

      return {
        anchorId,
        stepId: questionNumbersForStep.length > 1 ? `${baseStepId}-q${questionNumber}` : baseStepId,
        text: tableTextWithBlankMarkers(text, 1) || TABLE_BLANK_MARKER,
        nextStepIds,
      };
    });
  });

  return {
    stimulus: {
      stimulusId: flowchartStimulusId,
      kind: 'flowchart-shell',
      title: instruction.questionRange?.start && instruction.questionRange.end
        ? `Questions ${instruction.questionRange.start}-${instruction.questionRange.end} flowchart`
        : 'Imported flowchart',
      content: {
        kind: 'flowchart-content',
        steps,
      },
      anchorIds,
    },
    anchorIds,
    anchorIdsByQuestionNumber,
  };
};

const structuredDiagramTargetQuestionNumbers = (target: StructuredDiagramTarget): readonly number[] => {
  const candidates = [
    target.questionNumber,
    ...(target.questionNumbers ?? []),
  ];
  const seen = new Set<number>();

  return candidates
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

const defaultDiagramCoordinate = (index: number, axis: 'x' | 'y'): number => {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return axis === 'x'
    ? Math.min(85, 18 + column * 22)
    : Math.min(85, 24 + row * 18);
};

const createStructuredDiagramContext = ({
  anchors,
  groupQuestions,
  idStem,
  instruction,
  instructionIndex,
  passageNumber,
}: {
  readonly anchors: Record<string, ReadingV2Anchor>;
  readonly groupQuestions: readonly StructuredReadingQuestion[];
  readonly idStem: string;
  readonly instruction: StructuredSectionInstruction;
  readonly instructionIndex: number;
  readonly passageNumber: number;
}): StructuredDiagramContext | null => {
  if (!instruction.diagram) {
    return null;
  }

  const diagramStimulusId = readingV2Ids.stimulusId(`${idStem}-diagram-${passageNumber}-${instructionIndex + 1}`);
  const questionNumbers = groupQuestions
    .map(structuredQuestionNumber)
    .filter((value) => Number.isInteger(value) && value > 0);
  const sourceTargets: readonly StructuredDiagramTarget[] = instruction.diagram.targets?.length
    ? instruction.diagram.targets
    : questionNumbers.map((questionNumber): StructuredDiagramTarget => ({ questionNumber }));
  const anchorIds: ReadingV2AnchorId[] = [];
  const anchorIdsByQuestionNumber = new Map<number, ReadingV2AnchorId>();
  const hotspots = sourceTargets.flatMap((target, targetIndex) =>
    structuredDiagramTargetQuestionNumbers(target)
      .filter((questionNumber) => questionNumbers.includes(questionNumber))
      .map((questionNumber, questionIndex) => {
        const anchorId = readingV2Ids.anchorId(`${idStem}-diagram-p${passageNumber}-q${questionNumber}`);
        const label = cleanMarkdown(target.label ?? `Question ${questionNumber}`);

        anchors[anchorId] = {
          anchorId,
          stimulusId: diagramStimulusId,
          kind: 'diagram-hotspot',
          label,
        };
        anchorIds.push(anchorId);
        anchorIdsByQuestionNumber.set(questionNumber, anchorId);

        return {
          anchorId,
          label,
          xPercent: Number.isFinite(target.xPercent) ? Number(target.xPercent) : defaultDiagramCoordinate(targetIndex + questionIndex, 'x'),
          yPercent: Number.isFinite(target.yPercent) ? Number(target.yPercent) : defaultDiagramCoordinate(targetIndex + questionIndex, 'y'),
        };
      }),
  );

  if (hotspots.length === 0) {
    return null;
  }

  return {
    stimulus: {
      stimulusId: diagramStimulusId,
      kind: 'diagram-shell',
      title: instruction.questionRange?.start && instruction.questionRange.end
        ? `Questions ${instruction.questionRange.start}-${instruction.questionRange.end} diagram`
        : 'Imported diagram',
      content: {
        kind: 'diagram-content',
        imageAlt: cleanMarkdown(instruction.diagram.imageAlt ?? 'Imported diagram with printed label numbers'),
        imageUrl: instruction.diagram.imageUrl,
        hotspots,
      },
      anchorIds,
    },
    anchorIds,
    anchorIdsByQuestionNumber,
  };
};

const isChoiceTaskType = (taskType: ReadingV2CanonicalTaskType): boolean =>
  taskType === 'multiple-choice' || taskType === 'multiple-select';

const normalizeStructuredOptionItems = (
  items: readonly StructuredOptionItem[] | undefined,
): readonly { readonly label: string; readonly text: string }[] =>
  (items ?? [])
    .map((item) => {
      const label = cleanMarkdown(item.label ?? '');
      return label
        ? {
            label,
            text: item.text ? preserveSourceMarkdown(item.text) : label,
          }
        : null;
    })
    .filter((item): item is { readonly label: string; readonly text: string } => Boolean(item));

const fallbackOptionText = (
  taskType: ReadingV2CanonicalTaskType,
  label: string,
): string =>
  taskType === 'matching-information'
    ? `Paragraph ${label}`
    : `Imported option ${label}`;

const optionSetFromItems = (
  optionSetId: ReturnType<typeof readingV2Ids.optionSetId>,
  taskGroupId: ReturnType<typeof readingV2Ids.taskGroupId>,
  taskType: ReadingV2CanonicalTaskType,
  items: readonly StructuredOptionItem[],
  instruction?: StructuredSectionInstruction,
): ReadingV2OptionSet => {
  const optionsByLabel = new Map<string, string>();

  normalizeStructuredOptionItems(items).forEach((option) => {
    optionsByLabel.set(option.label, option.text);
  });

  if (optionsByLabel.size === 0) {
    defaultOptionLabelsForTaskType(taskType, instruction).forEach((label) =>
      optionsByLabel.set(label, fallbackOptionText(taskType, label)),
    );
  }

  return {
    optionSetId,
    taskGroupId,
    options: Array.from(optionsByLabel.entries()).map(([label, text]) => ({
      optionId: `${optionSetId}-${label.toLowerCase()}`,
      label,
      text,
    })),
  };
};

const matchingInformationItemsFromReferenceRange = (
  instruction?: StructuredSectionInstruction,
): readonly StructuredOptionItem[] => {
  const referenceLabelRange = instruction?.referenceLabelRange
    ?? letterLabelRangeFromInstructionText(instruction ? structuredInstructionSourceText(instruction) : undefined);

  return labelsFromLetterRange(referenceLabelRange).map((label) => ({
    label,
    text: fallbackOptionText('matching-information', label),
  }));
};

const isMatchingInformationParagraphReferenceItem = (item: StructuredOptionItem): boolean => {
  const label = cleanMarkdown(item.label ?? '').toUpperCase();
  const text = cleanMarkdown(item.text ?? '');

  if (!/^[A-Z]$/.test(label)) {
    return false;
  }

  return !text
    || text.toUpperCase() === label
    || new RegExp(`^(?:paragraph|section)\\s+${label}$`, 'i').test(text);
};

const matchingInformationParagraphReferenceItems = (
  questions: readonly StructuredReadingQuestion[],
  instruction?: StructuredSectionInstruction,
): readonly StructuredOptionItem[] => [
  ...(instruction?.sectionReferences ?? []),
  ...questions.flatMap((question) => question.sectionReferences ?? []),
].filter(isMatchingInformationParagraphReferenceItem);

const optionSetFromStructuredQuestions = (
  optionSetId: ReturnType<typeof readingV2Ids.optionSetId>,
  taskGroupId: ReturnType<typeof readingV2Ids.taskGroupId>,
  taskType: ReadingV2CanonicalTaskType,
  questions: readonly StructuredReadingQuestion[],
  instruction?: StructuredSectionInstruction,
): ReadingV2OptionSet => {
  if (taskType === 'matching-information') {
    const referenceRangeItems = matchingInformationItemsFromReferenceRange(instruction);
    if (referenceRangeItems.length > 0) {
      return optionSetFromItems(optionSetId, taskGroupId, taskType, referenceRangeItems, instruction);
    }

    const paragraphReferenceItems = matchingInformationParagraphReferenceItems(questions, instruction);
    if (paragraphReferenceItems.length > 0) {
      return optionSetFromItems(optionSetId, taskGroupId, taskType, paragraphReferenceItems, instruction);
    }
  }

  const sourceItems: StructuredOptionItem[] = [
    ...(readingV2TaskUsesImportedSectionReferences(taskType) ? instruction?.sectionReferences ?? [] : []),
    ...(readingV2TaskUsesImportedLabeledOptions(taskType) ? instruction?.labeledOptions ?? [] : []),
  ];

  questions.forEach((question) => {
    if (readingV2TaskUsesImportedLabeledOptions(taskType)) {
      sourceItems.push(...(question.labeledOptions ?? []));
    }
    if (readingV2TaskUsesImportedSectionReferences(taskType)) {
      sourceItems.push(...(question.sectionReferences ?? []));
    }
  });

  return optionSetFromItems(optionSetId, taskGroupId, taskType, sourceItems, instruction);
};

const repeatedInstructionChoiceBanks = (
  instruction: StructuredSectionInstruction,
  questionCount: number,
): readonly (readonly StructuredOptionItem[])[] => {
  const options = normalizeStructuredOptionItems(instruction.labeledOptions);
  if (questionCount < 2 || options.length < questionCount * 2) {
    return [];
  }

  const firstLabel = options[0]?.label;
  const cycleLength = options.findIndex((option, index) => index > 0 && option.label === firstLabel);

  if (!firstLabel || cycleLength < 2 || options.length % cycleLength !== 0) {
    return [];
  }

  const expectedLabels = options.slice(0, cycleLength).map((option) => option.label).join('\u0000');
  const banks = Array.from({ length: options.length / cycleLength }, (_, bankIndex) =>
    options.slice(bankIndex * cycleLength, (bankIndex + 1) * cycleLength),
  );

  if (banks.length < questionCount || banks.some((bank) => bank.map((option) => option.label).join('\u0000') !== expectedLabels)) {
    return [];
  }

  return banks.slice(0, questionCount);
};

const questionChoiceOptionItems = (
  taskType: ReadingV2CanonicalTaskType,
  question: StructuredReadingQuestion,
  repeatedBanks: readonly (readonly StructuredOptionItem[])[],
  questionIndex: number,
): readonly StructuredOptionItem[] => {
  const questionItems = [
    ...(readingV2TaskUsesImportedLabeledOptions(taskType) ? question.labeledOptions ?? [] : []),
    ...(readingV2TaskUsesImportedSectionReferences(taskType) ? question.sectionReferences ?? [] : []),
  ];

  return questionItems.length > 0
    ? questionItems
    : repeatedBanks[questionIndex] ?? [];
};

const createPerQuestionChoiceOptionSets = (input: {
  readonly idStem: string;
  readonly instruction: StructuredSectionInstruction;
  readonly instructionIndex: number;
  readonly passageNumber: number;
  readonly taskGroupId: ReturnType<typeof readingV2Ids.taskGroupId>;
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly questions: readonly StructuredReadingQuestion[];
}): ReadonlyMap<number, ReadingV2OptionSet> => {
  if (!isChoiceTaskType(input.taskType)) {
    return new Map();
  }

  const repeatedBanks = repeatedInstructionChoiceBanks(input.instruction, input.questions.length);
  const optionSetsByQuestion = new Map<number, ReadingV2OptionSet>();

  input.questions.forEach((question, questionIndex) => {
    const questionNumber = structuredQuestionNumber(question);
    const items = questionChoiceOptionItems(input.taskType, question, repeatedBanks, questionIndex);

    if (!questionNumber || normalizeStructuredOptionItems(items).length < 2) {
      return;
    }

    const optionSetId = readingV2Ids.optionSetId(
      `${input.idStem}-option-set-${input.passageNumber}-${input.instructionIndex + 1}-q${questionNumber}`,
    );

    optionSetsByQuestion.set(
      questionNumber,
      optionSetFromItems(optionSetId, input.taskGroupId, input.taskType, items, input.instruction),
    );
  });

  return optionSetsByQuestion;
};

const synthesizeStructuredSectionInstructions = (
  material: StructuredReadingMaterial,
  questions: readonly StructuredReadingQuestion[],
): readonly StructuredSectionInstruction[] => {
  if ((material.sectionInstructions ?? []).length > 0) {
    return material.sectionInstructions ?? [];
  }

  const groups: {
    readonly id: string;
    readonly taskType: ReadingV2CanonicalTaskType;
    readonly questions: StructuredReadingQuestion[];
  }[] = [];

  questions.forEach((question) => {
    const questionNumber = structuredQuestionNumber(question);
    if (!Number.isInteger(questionNumber) || questionNumber <= 0) {
      return;
    }

    const taskType = structuredTaskType(question.type ?? structuredQuestionPromptText(question));
    const explicitId = question.sectionInstructionId?.trim();
    const activeGroup = groups[groups.length - 1];
    const activeLastQuestion = activeGroup?.questions[activeGroup.questions.length - 1];
    const activeLastNumber = activeLastQuestion ? structuredQuestionNumber(activeLastQuestion) : 0;
    const belongsToActiveGroup = explicitId
      ? activeGroup?.id === explicitId
      : activeGroup?.taskType === taskType && activeLastNumber + 1 === questionNumber;

    if (activeGroup && belongsToActiveGroup) {
      activeGroup.questions.push(question);
      return;
    }

    groups.push({
      id: explicitId || `auto-q${questionNumber}`,
      taskType,
      questions: [question],
    });
  });

  return groups.map((group) => {
    const questionNumbers = group.questions.map(structuredQuestionNumber);
    const start = Math.min(...questionNumbers);
    const end = Math.max(...questionNumbers);

    return {
      id: group.id.startsWith('auto-q') ? `auto-q${start}-${end}` : group.id,
      taskType: group.taskType,
      questionRange: { start, end },
    };
  });
};

const normalizeStructuredReadingPayload = (
  candidate: ReadingV2ImportCandidate,
  rawText: string,
): ReadingV2ImportNormalizationResult | null => {
  const payload = extractStructuredPayload(rawText);
  const materials = payload?.materials?.filter((material) => structuredPassageHasContent(material.passages?.[0]));

  if (!payload || !materials || materials.length === 0) {
    return null;
  }

  const localAutoSourceTitle = candidate.sourceKind === 'auto-gemini'
    ? cleanMarkdown((candidate.fileName ?? '').replace(/\.(?:md|txt|docx|pdf)$/i, ''))
    : '';
  const sourceTitle = frontmatterValue(rawText, 'title')
    ?? (localAutoSourceTitle || null)
    ?? (payload.sourceFile ? payload.sourceFile.replace(/\.md$/i, '') : null)
    ?? 'Imported Reading V2 material';
  const idStem = slug(sourceTitle);
  const sections: Record<string, ReadingV2Document['sections'][string]> = {};
  const stimuli: Record<string, ReadingV2StimulusNode> = {};
  const anchors: Record<string, ReadingV2Anchor> = {};
  const taskGroups: Record<string, ReadingV2TaskGroup> = {};
  const interactions: Record<string, ReadingV2Interaction> = {};
  const optionSets: Record<string, ReadingV2OptionSet> = {};
  const teacherAnswerKey = answerKeyPayloadForCandidate(candidate);
  const answerKeyRows = answerKeyRowsByQuestion(teacherAnswerKey);
  const usedPassageNumbers = new Set<number>();
  const sectionIds = materials.map((material, materialIndex) => {
    const passageNumber = structuredMaterialPassageNumber(material, materialIndex, usedPassageNumbers);
    const sectionId = readingV2Ids.sectionId(`${idStem}-section-${passageNumber}`);
    const stimulusId = readingV2Ids.stimulusId(`${idStem}-stimulus-${passageNumber}`);
    const passage = material.passages?.[0];
    const passageTitleText = cleanMarkdown(passage?.title ?? material.title ?? `Reading passage ${passageNumber}`);
    const passageBlocks = structuredPassageBlocks(passage);
    const passageMedia = structuredPassageMedia(passage);
    const anchorIds = passageBlocks.map((_, paragraphIndex) =>
      readingV2Ids.anchorId(`${idStem}-p${passageNumber}-${paragraphIndex + 1}`),
    );
    const mediaStimulusIds = passageMedia.map((_, mediaIndex) =>
      readingV2Ids.stimulusId(`${idStem}-media-${passageNumber}-${mediaIndex + 1}`),
    );

    anchorIds.forEach((anchorId, paragraphIndex) => {
      anchors[anchorId] = {
        anchorId,
        stimulusId,
        kind: 'paragraph',
        label: `Passage ${passageNumber}, paragraph ${paragraphIndex + 1}`,
      };
    });

    stimuli[stimulusId] = {
      stimulusId,
      kind: 'passage',
      title: passageTitleText,
      content: {
        kind: 'passage-content',
        paragraphs: passageBlocks.map((block, paragraphIndex) =>
          withoutUndefined({
            anchorId: anchorIds[paragraphIndex],
            label: block.label,
            text: block.text,
            blockKind: block.blockKind,
            headingLevel: block.headingLevel,
            listKind: block.listKind,
            itemId: block.itemId,
          }),
        ),
      },
      anchorIds,
    };

    mediaStimulusIds.forEach((mediaStimulusId, mediaIndex) => {
      const media = passageMedia[mediaIndex];
      if (!media) {
        return;
      }

      stimuli[mediaStimulusId] = withoutUndefined({
        stimulusId: mediaStimulusId,
        kind: 'media',
        title: media.title ?? media.caption,
        content: withoutUndefined({
          kind: 'media-content',
          mediaUrl: media.mediaUrl,
          alt: media.alt,
          caption: media.caption,
          source: media.source,
        }),
        anchorIds: [],
      });
    });

    const sectionStimulusIds = [stimulusId, ...mediaStimulusIds];
    const questions = [...(material.questions ?? [])].sort(
      (left, right) => structuredQuestionNumber(left) - structuredQuestionNumber(right),
    );
    const sectionInstructions = synthesizeStructuredSectionInstructions(material, questions);
    const taskGroupIds = sectionInstructions.map((instruction, instructionIndex) => {
      const start = instruction.questionRange?.start ?? 0;
      const end = instruction.questionRange?.end ?? start;
      const hasLocalQuestionRange = start > 0 && end >= start;
      const groupQuestions = questions.filter((question) =>
        hasLocalQuestionRange
          ? structuredQuestionNumber(question) >= start && structuredQuestionNumber(question) <= end
          : question.sectionInstructionId === instruction.id,
      );
      const firstQuestion = groupQuestions[0];
      const instructionSourceText = structuredInstructionSourceText(instruction);
      const taskType = structuredTaskType(instruction.taskType ?? firstQuestion?.type ?? instructionSourceText);
      const taskGroupId = readingV2Ids.taskGroupId(`${idStem}-task-group-${passageNumber}-${instructionIndex + 1}`);
      const optionSetId = readingV2Ids.optionSetId(`${idStem}-option-set-${passageNumber}-${instructionIndex + 1}`);
      const perQuestionChoiceOptionSets = createPerQuestionChoiceOptionSets({
        idStem,
        instruction,
        instructionIndex,
        passageNumber,
        taskGroupId,
        taskType,
        questions: groupQuestions,
      });
      const allChoiceQuestionsHavePerOptionSet =
        isChoiceTaskType(taskType)
        && groupQuestions.length > 0
        && perQuestionChoiceOptionSets.size === groupQuestions.length;
      const defaultOptionSetId = allChoiceQuestionsHavePerOptionSet
        ? perQuestionChoiceOptionSets.values().next().value?.optionSetId ?? optionSetId
        : optionSetId;
      const inferredSelectionLimit = taskType === 'multiple-select'
        ? Math.max(1, ...groupQuestions.map((question) => structuredQuestionAnswers(question).length))
        : undefined;
      const instructionSemantics = structuredInstructionSemantics({
        instruction,
        taskType,
        passageNumber,
        start,
        end,
        firstQuestion,
        selectionLimit: inferredSelectionLimit,
      });
      const responseShape = responseShapeFor(
        taskType,
        defaultOptionSetId,
        instructionSemantics.wordLimit,
        inferredSelectionLimit,
      );
      const noteContext = noteCompletionLayoutContext(taskType, instruction, groupQuestions);
      const tableContext = taskType === 'table-completion'
        ? createStructuredTableContext({
            anchors,
            groupQuestions,
            idStem,
            instruction,
            instructionIndex,
            passageNumber,
            taskGroupId,
          })
        : null;
      const flowchartContext = taskType === 'flowchart-completion'
        ? createStructuredFlowchartContext({
            anchors,
            groupQuestions,
            idStem,
            instruction,
            instructionIndex,
            passageNumber,
          })
        : null;
      const diagramContext = taskType === 'diagram-labeling'
        ? createStructuredDiagramContext({
            anchors,
            groupQuestions,
            idStem,
            instruction,
            instructionIndex,
            passageNumber,
          })
        : null;

      if (tableContext) {
        stimuli[tableContext.stimulus.stimulusId] = tableContext.stimulus;
        if (!sectionStimulusIds.includes(tableContext.stimulus.stimulusId)) {
          sectionStimulusIds.push(tableContext.stimulus.stimulusId);
        }
      }
      if (flowchartContext) {
        stimuli[flowchartContext.stimulus.stimulusId] = flowchartContext.stimulus;
        if (!sectionStimulusIds.includes(flowchartContext.stimulus.stimulusId)) {
          sectionStimulusIds.push(flowchartContext.stimulus.stimulusId);
        }
      }
      if (diagramContext) {
        stimuli[diagramContext.stimulus.stimulusId] = diagramContext.stimulus;
        if (!sectionStimulusIds.includes(diagramContext.stimulus.stimulusId)) {
          sectionStimulusIds.push(diagramContext.stimulus.stimulusId);
        }
      }

      const interactionIds = groupQuestions.map((question, questionIndex) => {
        const questionNumber = structuredQuestionNumber(question);
        const interactionId = readingV2Ids.interactionId(`${idStem}-q${questionNumber || `${passageNumber}-${questionIndex + 1}`}`);
        const perQuestionOptionSet = perQuestionChoiceOptionSets.get(questionNumber);
        const interactionResponseShape = perQuestionOptionSet
          ? responseShapeFor(
              taskType,
              perQuestionOptionSet.optionSetId,
              instructionSemantics.wordLimit,
              inferredSelectionLimit,
            )
          : responseShape;
        const tableAnchorId = tableContext?.anchorIdsByQuestionNumber.get(questionNumber);
        const flowchartAnchorId = flowchartContext?.anchorIdsByQuestionNumber.get(questionNumber);
        const diagramAnchorId = diagramContext?.anchorIdsByQuestionNumber.get(questionNumber);
        const primaryAnchorId = tableAnchorId ?? flowchartAnchorId ?? diagramAnchorId ?? anchorIds[questionIndex % anchorIds.length];
        const promptText = noteContext?.promptTextByQuestionNumber.get(questionNumber)
          ?? structuredQuestionPromptText(question);

        interactions[interactionId] = {
          interactionId,
          taskGroupId,
          responseShape: interactionResponseShape,
          scoringRule: {
            maxScore: 1,
            acceptableAnswers: normalizeAnswersForResponseShape(
              answerKeyRows.size > 0
                ? answerKeyRows.get(questionNumber) ?? []
                : structuredQuestionAnswers(question),
              interactionResponseShape,
            ),
            orderMatters: interactionResponseShape.kind === 'multi-select' ? false : undefined,
          },
          reviewLabel: {
            displayNumber: questionNumber || undefined,
          },
          promptText,
          primaryAnchorId,
          contextAnchorIds: tableAnchorId
            ? [tableAnchorId]
            : flowchartAnchorId
              ? [flowchartAnchorId]
              : diagramAnchorId ? [diagramAnchorId] : undefined,
        };

        return interactionId;
      });
      const optionSetRefs = readingV2TaskNeedsOptionSet(taskType)
        ? Array.from(new Set(interactionIds.flatMap((interactionId) => {
            const interactionResponseShape = interactions[interactionId]?.responseShape;
            return interactionResponseShape?.kind === 'single-choice'
              || interactionResponseShape?.kind === 'multi-select'
              || interactionResponseShape?.kind === 'matching'
              ? [interactionResponseShape.optionSetId]
              : [];
          })))
        : [];

      const rangeLabel = start && end ? `${start}-${end}` : `${instructionIndex + 1}`;
      const instructionIssue = customInstructionIssue(
        taskType,
        instructionSourceText,
        taskGroupId,
        rangeLabel,
        instructionSemantics,
      );

      taskGroups[taskGroupId] = {
        taskGroupId,
        sectionId,
        officialTaskType: taskType,
        engineeringFamily: getReadingV2TaskFamily(taskType),
        groupTitle: start && end ? `Questions ${start}-${end}` : `Questions ${instructionIndex + 1}`,
        instructionBlocks: [
          {
            id: `${taskGroupId}-instruction-1`,
            text: normalizeImportedInstructionText(
              taskType,
              instructionSourceText,
              firstQuestion?.questionText ?? firstQuestion?.question ?? 'Review imported questions.',
              instructionSemantics,
            ),
          },
        ],
        answerRule: {
          responseShape,
          wordLimit: responseShape.kind === 'free-text' ? responseShape.wordLimit : undefined,
          optionReuse: responseShape.kind === 'matching' ? responseShape.optionReuse : undefined,
          casing: 'ignored',
          punctuation: 'ignored',
        },
        stimulusRefs: tableContext
          ? [
              { stimulusId: tableContext.stimulus.stimulusId, anchorIds: tableContext.anchorIds },
              { stimulusId, anchorIds },
            ]
          : flowchartContext
            ? [
                { stimulusId: flowchartContext.stimulus.stimulusId, anchorIds: flowchartContext.anchorIds },
                { stimulusId, anchorIds },
              ]
          : diagramContext
            ? [
                { stimulusId: diagramContext.stimulus.stimulusId, anchorIds: diagramContext.anchorIds },
                { stimulusId, anchorIds },
              ]
          : [{ stimulusId, anchorIds }],
        optionSetRefs,
        interactionIds,
        layoutHint: summaryCompletionLayoutHint(taskType, instruction, groupQuestions) ?? noteContext?.layoutHint,
        validationState: { issues: instructionIssue ? [instructionIssue] : [] },
      };

      if (readingV2TaskNeedsOptionSet(taskType)) {
        if (optionSetRefs.includes(optionSetId)) {
          optionSets[optionSetId] = optionSetFromStructuredQuestions(optionSetId, taskGroupId, taskType, groupQuestions, instruction);
        }
        perQuestionChoiceOptionSets.forEach((optionSet) => {
          optionSets[optionSet.optionSetId] = optionSet;
        });
      }

      return taskGroupId;
    });

    sections[sectionId] = {
      sectionId,
      title: `Reading Passage ${passageNumber}`,
      stimulusIds: sectionStimulusIds,
      taskGroupIds,
    };

    return sectionId;
  });

  const validationIssues = [
    ...answerKeyDiagnosticsAsIssues(teacherAnswerKey),
    ...unboundAnswerKeyRowsAsIssues(teacherAnswerKey, answeredQuestionNumbers(interactions)),
  ];

  return {
    candidate,
    document: {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'canonical',
      schemaVersion: READING_V2_SCHEMA_VERSION,
      documentId: readingV2Ids.documentId(`${idStem}-document`),
      title: sourceTitle,
      sectionIds,
      sections,
      stimuli,
      anchors,
      taskGroups,
      interactions,
      optionSets,
      validationState: { issues: validationIssues },
    },
    importEvidenceIds: [],
  };
};

const unresolvedIssue = (message: string, objectId?: string): ReadingV2ValidationIssue => ({
  code: 'unresolved-import-uncertainty',
  severity: 'error',
  message,
  objectId,
});

export const createReadingV2DefaultImportCandidate = (): ReadingV2ImportCandidate => ({
  sourceKind: 'pasted-text',
  rawText: [
    '## Imported Reading passage',
    '',
    'This imported passage is awaiting teacher review. It has enough text to become an editable Reading passage paragraph.',
    '',
    '#### Questions 1-2',
    'Complete the sentences below.',
    '**1** Imported answer one',
    '**2** Imported answer two',
  ].join('\n'),
  evidence: ['Detected passage text', 'Detected grouped instructions'],
  uncertaintyMarkers: ['Question range needs teacher confirmation'],
  publishBlockingPlaceholders: ['Missing answer key for imported question group'],
});

export const createReadingV2ImportCandidateFromText = (input: {
  readonly text: string;
  readonly answerKeyText?: string;
  readonly fileName?: string;
  readonly sourceKind?: ReadingV2ImportCandidate['sourceKind'];
}): ReadingV2ImportCandidate => {
  const sourceKind = input.sourceKind ?? 'pasted-text';
  const supportedFileType = sourceKind === 'uploaded-file' ? detectFileType(input.fileName) : undefined;
  const structuredPayload = extractStructuredPayload(input.text);
  const structuredMaterials = structuredPayload?.materials?.filter((material) => structuredPassageHasContent(material.passages?.[0])) ?? [];
  const structuredGroupCount = structuredMaterials.reduce(
    (count, material) => count + (material.sectionInstructions?.length ?? 0),
    0,
  );
  const structuredQuestionCount = structuredMaterials.reduce(
    (count, material) => count + (material.questions?.length ?? 0),
    0,
  );
  const structuredQuestionNumbers = new Set(
    structuredMaterials
      .flatMap((material) => material.questions ?? [])
      .map(structuredQuestionNumber)
      .filter((questionNumber) => Number.isInteger(questionNumber) && questionNumber > 0),
  );
  const structuredTaskTypes = Array.from(new Set(
    structuredMaterials
      .flatMap((material) => material.sectionInstructions ?? [])
      .map((instruction) => {
        const question = structuredMaterials
          .flatMap((material) => material.questions ?? [])
          .find((candidateQuestion) => candidateQuestion.sectionInstructionId === instruction.id);
        return structuredTaskType(instruction.taskType ?? question?.type ?? structuredInstructionSourceText(instruction));
      }),
  ));
  const plainPassages = plainTextPassageBlocks(input.text);
  const plainBlocks = plainPassages.flatMap((plainPassage) => questionBlocks(plainPassage.text));
  const plainParagraphCount = plainPassages.reduce(
    (count, plainPassage) => count + passageParagraphs(plainPassage.text).length,
    0,
  );
  const unsupportedUpload = sourceKind === 'uploaded-file' && !supportedFileType;
  const structuredPayloadAnswerKeyText = typeof structuredPayload?.answerKeyText === 'string'
    ? structuredPayload.answerKeyText
    : undefined;
  const answerKeyText = input.answerKeyText ?? structuredPayloadAnswerKeyText;
  const teacherAnswerKey = parseReadingV2TeacherAnswerKey(answerKeyText);
  const validTeacherAnswerRows = answerKeyRowsByQuestion(teacherAnswerKey);
  const answerKeyRowCount = countAnswerKeyRows(answerKeyText);
  const answerKeyErrors = teacherAnswerKey.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const answerKeyWarnings = teacherAnswerKey.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning');
  const detectedPassageCount = plainTextPassageHeadingCount(input.text);
  const structuredInput = structuredMaterials.length > 0;
  const missingStructuredAnswerRows = structuredInput && answerKeyRowCount > 0
    ? [...structuredQuestionNumbers].filter((questionNumber) => !validTeacherAnswerRows.has(questionNumber))
    : [];
  const unboundStructuredAnswerRows = structuredInput && answerKeyRowCount > 0
    ? [...validTeacherAnswerRows.keys()].filter((questionNumber) => !structuredQuestionNumbers.has(questionNumber))
    : [];
  const missingAnswerRows = structuredInput
    ? answerKeyRowCount < structuredQuestionCount || missingStructuredAnswerRows.length > 0
    : answerKeyRowCount === 0 || answerKeyRowCount < plainBlocks.reduce((count, block) => count + block.end - block.start + 1, 0);

  return {
    sourceKind,
    fileName: input.fileName,
    supportedFileType,
    rawText: input.text,
    answerKeyText,
    teacherAnswerKey: answerKeyText !== undefined ? teacherAnswerKey : undefined,
    evidence: unsupportedUpload
      ? []
      : structuredInput
        ? [
            `Detected ${structuredMaterials.length} structured passage${structuredMaterials.length === 1 ? '' : 's'}`,
            `Detected ${structuredGroupCount} structured question group${structuredGroupCount === 1 ? '' : 's'}`,
            `Detected ${structuredQuestionCount} structured question${structuredQuestionCount === 1 ? '' : 's'}`,
            ...(answerKeyRowCount > 0 ? [`Detected ${answerKeyRowCount} teacher answer key rows`] : []),
            ...structuredTaskTypes.map((taskType) => `Structured task type: ${taskType}`),
          ]
        : [
          `Detected ${plainParagraphCount} passage paragraphs`,
          `Detected ${plainBlocks.length} grouped question blocks`,
          ...(detectedPassageCount > 0 ? [`Detected ${detectedPassageCount} Reading Passage headings`] : []),
          ...(answerKeyRowCount > 0 ? [`Detected ${answerKeyRowCount} teacher answer key rows`] : []),
          ...plainBlocks.map((block) => `Questions ${block.rangeLabel}: ${block.taskType}`),
        ],
    uncertaintyMarkers: unsupportedUpload
      ? ['Unsupported uploaded source file type']
      : [
          ...(structuredInput ? ['Structured JSON payload detected'] : []),
          answerKeyRowCount > 0
            ? 'Teacher answer key requires binding review'
            : 'Answer keys require teacher confirmation',
          ...answerKeyWarnings.map((diagnostic) => diagnostic.message),
          'Question links require teacher review before publish',
        ],
    publishBlockingPlaceholders: unsupportedUpload
      ? ['Unsupported uploaded source file']
      : [
          ...answerKeyErrors.map((diagnostic) => diagnostic.message),
          ...(missingStructuredAnswerRows.length > 0
            ? [`Teacher answer key is missing rows for imported question numbers: ${missingStructuredAnswerRows.join(', ')}`]
            : []),
          ...(unboundStructuredAnswerRows.length > 0
            ? [`Teacher answer key has rows that do not match imported questions: ${unboundStructuredAnswerRows.join(', ')}`]
            : []),
          ...(missingAnswerRows ? ['Imported questions are incomplete until answer keys are confirmed'] : []),
        ],
  };
};

export const normalizeReadingV2ImportCandidate = (
  candidate: ReadingV2ImportCandidate,
): ReadingV2ImportNormalizationResult => {
  if (candidate.sourceKind === 'uploaded-file' && !candidate.supportedFileType) {
    throw new Error('Unsupported Reading V2 import source. Choose txt, docx, or pdf.');
  }

  const rawText = candidate.rawText ?? createReadingV2DefaultImportCandidate().rawText ?? '';
  const structuredResult = normalizeStructuredReadingPayload(candidate, rawText);

  if (structuredResult) {
    return structuredResult;
  }

  const sourceTitle = frontmatterValue(rawText, 'title') ?? 'Imported Reading V2 material';
  const plainPassages = plainTextPassageBlocks(rawText).filter((block) => block.text.trim().length > 0);
  const passages = plainPassages.length > 0 ? plainPassages : [{ passageNumber: 1, text: rawText }];
  const firstTitle = passageTitle(passages[0]?.text ?? rawText, sourceTitle);
  const documentTitle = passages.length === 1 ? firstTitle : sourceTitle;
  const idStem = passages.length === 1 ? slug(`${sourceTitle}-${firstTitle}`) : slug(sourceTitle);
  const anchors: Record<string, ReadingV2Anchor> = {};
  const sections: Record<string, ReadingV2Document['sections'][string]> = {};
  const stimuli: Record<string, ReadingV2StimulusNode> = {};
  const taskGroups: Record<string, ReadingV2TaskGroup> = {};
  const interactions: Record<string, ReadingV2Interaction> = {};
  const optionSets: Record<string, ReadingV2OptionSet> = {};
  const importEvidenceIds: ReadingV2ImportEvidenceId[] = [];
  const teacherAnswerKey = answerKeyPayloadForCandidate(candidate);
  const answerKeyRows = answerKeyRowsByQuestion(teacherAnswerKey);
  const questionPromptByNumber = (block: QuestionBlock): Readonly<Record<number, string>> => {
    const prompts: Record<number, string> = {};
    const matcher = /^\s*(?:\*\*)?(\d+)(?:\*\*)?[\).]?\s+(.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(block.text)) !== null) {
      const questionNumber = Number(match[1]);
      if (questionNumber >= block.start && questionNumber <= block.end) {
        prompts[questionNumber] = preserveSourceMarkdown(match[2] ?? '');
      }
    }

    return prompts;
  };
  const sectionIds = passages.map((plainPassage, passageIndex) => {
    const passageNumber = plainPassage.passageNumber || passageIndex + 1;
    const title = passageTitle(plainPassage.text, `Reading Passage ${passageNumber}`);
    const passageStem = slug(`${idStem}-passage-${passageNumber}-${title}`);
    const sectionId = readingV2Ids.sectionId(`${idStem}-section-${passageNumber}`);
    const stimulusId = readingV2Ids.stimulusId(`${passageStem}-stimulus`);
    const paragraphs = passageParagraphs(plainPassage.text);
    const paragraphTexts = paragraphs.length > 0
      ? paragraphs
      : ['Imported passage text requires teacher review before publish.'];
    const anchorIds = paragraphTexts.map((_, index) =>
      readingV2Ids.anchorId(`${passageStem}-p${index + 1}`),
    );

    anchorIds.forEach((anchorId, index) => {
      anchors[anchorId] = {
        anchorId,
        stimulusId,
        kind: 'paragraph',
        label: `Passage ${passageNumber}, paragraph ${index + 1}`,
      };
    });

    stimuli[stimulusId] = {
      stimulusId,
      kind: 'passage',
      title,
      content: {
        kind: 'passage-content',
        paragraphs: paragraphTexts.map((text, index) => ({
          anchorId: anchorIds[index],
          text,
        })),
      },
      anchorIds,
    };

    const blocks = questionBlocks(plainPassage.text);
    const normalizedBlocks = blocks.length > 0
      ? blocks
      : [{
          rangeLabel: `${passageNumber}-${passageNumber}`,
          start: passageNumber,
          end: passageNumber,
          text: plainPassage.text,
          taskType: 'sentence-completion' as const,
        }];
    const taskGroupIds = normalizedBlocks.map((block) => {
      const taskGroupId = readingV2Ids.taskGroupId(`${idStem}-task-group-${passageNumber}-${block.rangeLabel}`);
      const optionSetId = readingV2Ids.optionSetId(`${idStem}-option-set-${passageNumber}-${block.rangeLabel}`);
      const sourceInstructionText = block.text.split('\n').find((line) => line.trim().length > 0);
      const instructionSemantics: ReadingV2InstructionSemantics = {
        questionRange: questionRangeSemantics(block.start, block.end),
        wordLimit: wordLimitFromText(block.text),
        wordLimitText: wordLimitTextFromText(block.text),
        passageNumber,
      };
      const responseShape = responseShapeFor(block.taskType, optionSetId, instructionSemantics.wordLimit);
      const prompts = questionPromptByNumber(block);
      const evidenceId = readingV2Ids.importEvidenceId(`${idStem}-evidence-${passageNumber}-${block.rangeLabel}`);
      const instructionIssue = customInstructionIssue(
        block.taskType,
        sourceInstructionText,
        taskGroupId,
        block.rangeLabel,
        instructionSemantics,
      );
      const interactionIds = Array.from({ length: block.end - block.start + 1 }, (_, offset) => {
        const questionNumber = block.start + offset;
        const interactionId = readingV2Ids.interactionId(`${idStem}-q${questionNumber}`);
        const primaryAnchorId = anchorIds[offset % anchorIds.length];
        const promptText = prompts[questionNumber];

        interactions[interactionId] = {
          interactionId,
          taskGroupId,
          responseShape,
          scoringRule: {
            maxScore: 1,
            acceptableAnswers: normalizeAnswersForResponseShape(
              answerKeyRows.get(questionNumber) ?? [],
              responseShape,
            ),
            orderMatters: responseShape.kind === 'multi-select' ? false : undefined,
          },
          reviewLabel: { displayNumber: questionNumber },
          promptText,
          primaryAnchorId,
          placeholder: !answerKeyRows.has(questionNumber),
        };

        return interactionId;
      });

      importEvidenceIds.push(evidenceId);
      taskGroups[taskGroupId] = {
        taskGroupId,
        sectionId,
        officialTaskType: block.taskType,
        engineeringFamily: getReadingV2TaskFamily(block.taskType),
        groupTitle: `Questions ${block.rangeLabel}`,
        instructionBlocks: [
          {
            id: `${taskGroupId}-instruction-1`,
            text: normalizeImportedInstructionText(
              block.taskType,
              sourceInstructionText,
              `Review questions ${block.rangeLabel}.`,
              instructionSemantics,
            ),
          },
        ],
        answerRule: {
          responseShape,
          wordLimit: responseShape.kind === 'free-text' ? responseShape.wordLimit : undefined,
          optionReuse: responseShape.kind === 'matching' ? responseShape.optionReuse : undefined,
          casing: 'ignored',
          punctuation: 'ignored',
        },
        stimulusRefs: [{ stimulusId, anchorIds }],
        optionSetRefs: readingV2TaskNeedsOptionSet(block.taskType) ? [optionSetId] : [],
        interactionIds,
        importEvidenceRefs: [evidenceId],
        validationState: {
          issues: [
            unresolvedIssue(
              `Imported questions ${block.rangeLabel} require teacher confirmation before publish.`,
              taskGroupId,
            ),
            ...(instructionIssue ? [instructionIssue] : []),
          ],
        },
      };

      if (readingV2TaskNeedsOptionSet(block.taskType)) {
        optionSets[optionSetId] = createOptionSet(optionSetId, taskGroupId);
      }

      return taskGroupId;
    });

    sections[sectionId] = {
      sectionId,
      title: `Imported Reading passage ${passageNumber}`,
      stimulusIds: [stimulusId],
      taskGroupIds,
    };

    return sectionId;
  });

  const validationIssues = [
    unresolvedIssue('Imported Reading material requires teacher review before publish.', `${idStem}-document`),
    ...answerKeyDiagnosticsAsIssues(teacherAnswerKey),
    ...unboundAnswerKeyRowsAsIssues(teacherAnswerKey, answeredQuestionNumbers(interactions)),
  ];

  const document: ReadingV2Document = {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'canonical',
    schemaVersion: READING_V2_SCHEMA_VERSION,
    documentId: readingV2Ids.documentId(`${idStem}-document`),
    title: documentTitle,
    sectionIds,
    sections,
    stimuli,
    anchors,
    taskGroups,
    interactions,
    optionSets,
    validationState: {
      issues: validationIssues,
    },
  };

  return {
    candidate,
    document,
    importEvidenceIds,
  };
};

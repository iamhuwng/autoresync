import type { ParsedQuestion } from '../../types/document.types';
import {
  assertSupportedTableCompletionGroupSchema,
  type QuestionGroupsField,
  type StudentSafeTableCompletionGroupV1,
  type TableBlankDef,
  type TableCellDef,
  type TableCompletionGroupV1,
  type TableContentSegment,
} from '../../types/tableCompletion';

const sortByOrder = <T extends { order: number }>(items: T[]): T[] =>
  [...items].sort((left, right) => left.order - right.order);

const getCellTextSegments = (segments: TableContentSegment[], targetAnchorId?: string): string =>
  segments
    .map((segment) => {
      if (segment.kind === 'text') {
        return segment.text;
      }

      return segment.anchorId === targetAnchorId ? '___' : '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

const CONNECTIVE_ONLY_TOKENS = new Set([
  '&',
  '/',
  '-',
  '–',
  '—',
  'and',
  'for',
  'of',
  'or',
  'plus',
  'to',
  'with',
  'without',
]);

const buildBreadcrumbFallbackQuestionText = (
  blank: TableBlankDef,
): string => {
  const rowLabel = blank.breadcrumb.rowHeaders.join(' / ').trim();
  const columnLabel = blank.breadcrumb.columnHeaders.join(' / ').trim();

  if (columnLabel && rowLabel) {
    return `${columnLabel}: ${rowLabel}`;
  }

  return columnLabel || rowLabel;
};

const isNonInformativeBlankPatternText = (value: string): boolean => {
  const normalized = value
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return true;
  }

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9&/+-]+|[^a-z0-9&/+-]+$/gi, '').toLowerCase())
    .filter(Boolean);

  return tokens.length === 0 || tokens.every((token) => CONNECTIVE_ONLY_TOKENS.has(token));
};

const findBlankCell = (
  group: TableCompletionGroupV1,
  blank: TableBlankDef,
): TableCellDef | undefined => group.cells.find((cell) => cell.cellId === blank.cellId);

const buildFallbackQuestionText = (
  group: TableCompletionGroupV1,
  blank: TableBlankDef,
): string => {
  const cell = findBlankCell(group, blank);
  if (!cell) {
    if (blank.sourceQuestionText?.trim()) {
      return blank.sourceQuestionText.trim();
    }

    return buildBreadcrumbFallbackQuestionText(blank);
  }

  const cellText = getCellTextSegments(cell.segments, blank.anchorId);
  if (cellText && !isNonInformativeBlankPatternText(cellText)) {
    return cellText;
  }

  if (blank.sourceQuestionText?.trim()) {
    return blank.sourceQuestionText.trim();
  }

  return buildBreadcrumbFallbackQuestionText(blank) || cellText;
};

const getBlankWordLimit = (
  group: TableCompletionGroupV1,
  blank: TableBlankDef,
): number | undefined => blank.constraints.maxWords ?? group.sharedContent.constraints.maxWords;

const getBlankIncludesNumber = (
  group: TableCompletionGroupV1,
  blank: TableBlankDef,
): boolean | undefined => blank.constraints.includesNumber ?? group.sharedContent.constraints.includesNumber;

export const sortTableCompletionQuestionGroups = (
  questionGroups: QuestionGroupsField,
  passageOrder: string[] = [],
): QuestionGroupsField => {
  const passageIndex = new Map<string, number>(
    passageOrder.map((passageId, index) => [passageId, index]),
  );

  return [...questionGroups].sort((left, right) => {
    assertSupportedTableCompletionGroupSchema(left);
    assertSupportedTableCompletionGroupSchema(right);

    const leftPassageOrder = passageIndex.get(left.passageId) ?? Number.MAX_SAFE_INTEGER;
    const rightPassageOrder = passageIndex.get(right.passageId) ?? Number.MAX_SAFE_INTEGER;

    if (leftPassageOrder !== rightPassageOrder) {
      return leftPassageOrder - rightPassageOrder;
    }

    if (left.questionRange.start !== right.questionRange.start) {
      return left.questionRange.start - right.questionRange.start;
    }

    return left.groupId.localeCompare(right.groupId);
  });
};

export const buildTableCompletionSectionInstruction = (
  group: TableCompletionGroupV1,
): string => {
  assertSupportedTableCompletionGroupSchema(group);

  const parts = [
    group.sharedContent.instructionText.trim(),
    group.sharedContent.answerRuleText.trim(),
  ].filter(Boolean);

  if (group.sharedContent.caption?.trim()) {
    parts.push(group.sharedContent.caption.trim());
  }

  return parts.join('\n\n');
};

export const deriveTableCompletionQuestionsFromGroup = (
  group: TableCompletionGroupV1,
): ParsedQuestion[] => {
  assertSupportedTableCompletionGroupSchema(group);

  const orderedBlanks = [...group.blanks].sort(
    (left, right) => left.canonicalOrder - right.canonicalOrder,
  );

  return orderedBlanks.map((blank) => {
    const questionText = buildFallbackQuestionText(group, blank);
    const wordLimit = getBlankWordLimit(group, blank);
    const includesNumber = getBlankIncludesNumber(group, blank);

    return {
      id: `${group.groupId}-${blank.blankId}`,
      number: blank.questionNumber,
      questionNumber: blank.questionNumber,
      questionText,
      question: questionText,
      type: 'table-completion',
      answer: blank.acceptedAnswers[0] ?? '',
      answerSource: 'answer-key',
      originalAIAnswer: undefined,
      passageId: group.passageId,
      confidence: Math.round(group.provenance.confidence * 100),
      wordLimit,
      points: 1,
      sectionInstructionId: group.groupId,
      acceptableAnswers: blank.acceptedAnswers,
      includesNumber,
      groupId: group.groupId,
      blankId: blank.blankId,
      anchorId: blank.anchorId,
      groupTaskType: 'table-completion',
      tableGroupSchemaVersion: group.schemaVersion,
    };
  });
};

export const mergeQuestionsWithCanonicalTableGroups = (
  questions: ParsedQuestion[],
  questionGroups: QuestionGroupsField = [],
): ParsedQuestion[] => {
  if (questionGroups.length === 0) {
    return questions;
  }

  const canonicalGroups = sortTableCompletionQuestionGroups(questionGroups);
  const canonicalGroupIds = new Set(canonicalGroups.map((group) => group.groupId));
  const nonCanonicalQuestions = questions.filter(
    (question) => !question.groupId || !canonicalGroupIds.has(question.groupId),
  );
  const derivedCanonicalQuestions = canonicalGroups.flatMap((group) =>
    deriveTableCompletionQuestionsFromGroup(group),
  );

  return [...nonCanonicalQuestions, ...derivedCanonicalQuestions].sort(
    (left, right) => (left.questionNumber || left.number) - (right.questionNumber || right.number),
  );
};

export const synchronizeSectionInstructionsWithCanonicalGroups = (
  sectionInstructions: Record<string, string>,
  questionGroups: QuestionGroupsField = [],
): Record<string, string> => {
  const canonicalGroupIds = new Set(questionGroups.map((group) => group.groupId));
  const nextInstructions = Object.fromEntries(
    Object.entries(sectionInstructions).filter(([instructionId]) => !canonicalGroupIds.has(instructionId)),
  );

  questionGroups.forEach((group) => {
    nextInstructions[group.groupId] = buildTableCompletionSectionInstruction(group);
  });

  return nextInstructions;
};

export const stripTableCompletionReviewOnlyProvenance = (
  group: TableCompletionGroupV1,
): StudentSafeTableCompletionGroupV1 => {
  assertSupportedTableCompletionGroupSchema(group);

  return {
    ...group,
    blanks: group.blanks.map(({ acceptedAnswers, sourceQuestionText, ...blank }) => {
      void acceptedAnswers;
      void sourceQuestionText;
      return blank;
    }),
    provenance: {
      canonicalRevisionHash: group.provenance.canonicalRevisionHash,
    },
  };
};

export const stripTableCompletionReviewOnlyProvenanceFromField = (
  questionGroups: QuestionGroupsField,
): StudentSafeTableCompletionGroupV1[] =>
  sortTableCompletionQuestionGroups(questionGroups).map(stripTableCompletionReviewOnlyProvenance);

export const collectTableCompletionColumns = (
  group: TableCompletionGroupV1,
): string[] => sortByOrder(group.columns).map((column) => column.columnId);

export const collectTableCompletionRows = (
  group: TableCompletionGroupV1,
): string[] => sortByOrder(group.rows).map((row) => row.rowId);

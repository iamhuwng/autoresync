import { buildTableCompletionSectionInstruction } from '../../services/test-creation/tableCompletionTransforms';
import type { QuestionGroupsField, TableCompletionGroupV1 } from '../../types/tableCompletion';

import { isReadingAnswerEmpty } from './readingAnswerState';

interface ReadingQuestionLike {
  number: number;
  type: string;
  passageId?: string;
  wordLimit?: number;
  summaryGroupId?: string;
  groupId?: string;
  groupTaskType?: 'table-completion';
}

export interface ReadingQuestionGroup<TQuestion extends ReadingQuestionLike = ReadingQuestionLike> {
  startNumber: number;
  endNumber: number;
  type: string;
  questions: TQuestion[];
  instructions: string;
  canonicalGroup?: TableCompletionGroupV1;
}

const getTaskInstructions = (
  type: string,
  startNum: number,
  endNum: number,
  wordLimit?: number,
): string => {
  const range = startNum === endNum ? `Question ${startNum}` : `Questions ${startNum}-${endNum}`;

  const formatWordLimit = (limit?: number, defaultLimitStr = 'ONE WORD ONLY') => {
    if (!limit) return defaultLimitStr;
    const wordMap: Record<number, string> = {
      1: 'ONE WORD ONLY',
      2: 'NO MORE THAN TWO WORDS',
      3: 'NO MORE THAN THREE WORDS',
    };
    return wordMap[limit] || `NO MORE THAN ${limit} WORDS`;
  };

  const instructionMap: Record<string, string> = {
    'sentence-completion': `${range}\n\nComplete the sentences below.\n\nChoose ${formatWordLimit(wordLimit, 'ONE WORD ONLY')} from the passage for each answer.`,
    'summary-completion-text': `${range}\n\nComplete the summary below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,
    'summary-completion-list': `${range}\n\nComplete the summary using the list of phrases, A-H, below.\n\nWrite the correct letter, A-H.`,
    'note-completion': `${range}\n\nComplete the notes below.\n\nChoose ${formatWordLimit(wordLimit, 'ONE WORD AND/OR A NUMBER').replace('WORDS', 'WORDS AND/OR A NUMBER').replace('WORD ONLY', 'WORD AND/OR A NUMBER')} from the passage for each answer.`,
    'table-completion': `${range}\n\nComplete the table below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,
    'flowchart-completion': `${range}\n\nComplete the flow-chart below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,
    'diagram-labeling': `${range}\n\nLabel the diagram below.\n\nChoose ${formatWordLimit(wordLimit, 'ONE WORD ONLY')} from the passage for each answer.`,
    'true-false-not-given': `${range}\n\nDo the following statements agree with the information given in the reading passage?\n\nWrite:\nTRUE if the statement agrees with the information\nFALSE if the statement contradicts the information\nNOT GIVEN if there is no information on this`,
    'yes-no-not-given': `${range}\n\nDo the following statements agree with the views/claims of the writer?\n\nWrite:\nYES if the statement agrees with the views/claims of the writer\nNO if the statement contradicts the views/claims of the writer\nNOT GIVEN if it is impossible to say what the writer thinks about this`,
    'matching-headings': `${range}\n\nChoose the correct heading for each section from the list of headings below.`,
    'matching-information': `${range}\n\nWhich section contains the following information?`,
    'matching-features': `${range}\n\nMatch each statement with the correct person/theory.`,
    'matching-sentence-endings': `${range}\n\nComplete each sentence with the correct ending, A-F, below.`,
    'multiple-choice': `${range}\n\nChoose the correct letter, A, B, C or D.`,
    'multiple-select': `${range}\n\nChoose TWO letters from the list.`,
    'short-answer': `${range}\n\nAnswer the questions below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN THREE WORDS AND/OR A NUMBER').replace('WORDS', 'WORDS AND/OR A NUMBER').replace('WORD ONLY', 'WORD AND/OR A NUMBER')} from the passage for each answer.`,
    completion: `${range}\n\nComplete the sentences below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,
  };

  return instructionMap[type] || `${range}\n\nAnswer the following questions.`;
};

const getCanonicalTableGroupsForQuestions = <TQuestion extends ReadingQuestionLike>(
  questions: TQuestion[],
  questionGroups: QuestionGroupsField,
): TableCompletionGroupV1[] => {
  if (questions.length === 0 || questionGroups.length === 0) {
    return [];
  }

  const questionNumbers = new Set(questions.map((question) => question.number));
  const questionPassageIds = new Set(
    questions
      .map((question) => question.passageId)
      .filter((passageId): passageId is string => typeof passageId === 'string' && passageId.length > 0),
  );

  return questionGroups.filter((group) => {
    if (questionPassageIds.size > 0 && !questionPassageIds.has(group.passageId)) {
      return false;
    }

    return group.blanks.some((blank) => questionNumbers.has(blank.questionNumber));
  });
};

export const groupReadingQuestionsByTaskType = <TQuestion extends ReadingQuestionLike>(
  questions: TQuestion[],
  questionGroups: QuestionGroupsField = [],
): ReadingQuestionGroup<TQuestion>[] => {
  if (questions.length === 0) {
    return [];
  }

  const canonicalGroups = getCanonicalTableGroupsForQuestions(questions, questionGroups);
  const canonicalGroupsById = new Map(
    canonicalGroups.map((group) => [group.groupId, group] as const),
  );
  const consumedCanonicalGroupIds = new Set<string>();
  const sortedQuestions = [...questions].sort((left, right) => left.number - right.number);
  const groups: ReadingQuestionGroup<TQuestion>[] = [];

  const pushLegacyGroup = (currentGroup: TQuestion[], currentType: string) => {
    const firstInGroup = currentGroup[0];
    const lastInGroup = currentGroup[currentGroup.length - 1];

    if (!firstInGroup || !lastInGroup) {
      return;
    }

    groups.push({
      startNumber: firstInGroup.number,
      endNumber: lastInGroup.number,
      type: currentType,
      questions: currentGroup,
      instructions: getTaskInstructions(
        currentType,
        firstInGroup.number,
        lastInGroup.number,
        firstInGroup.wordLimit,
      ),
    });
  };

  let currentGroup: TQuestion[] = [];
  let currentType: string | null = null;
  let currentSummaryGroupId: string | undefined;

  for (const question of sortedQuestions) {
    const canonicalGroupId =
      question.groupTaskType === 'table-completion' ? question.groupId : undefined;
    const canonicalGroup = canonicalGroupId
      ? canonicalGroupsById.get(canonicalGroupId)
      : undefined;

    if (canonicalGroup) {
      if (currentGroup.length > 0 && currentType) {
        pushLegacyGroup(currentGroup, currentType);
        currentGroup = [];
        currentType = null;
        currentSummaryGroupId = undefined;
      }

      if (consumedCanonicalGroupIds.has(canonicalGroup.groupId)) {
        continue;
      }

      const groupQuestions = sortedQuestions.filter(
        (candidate) =>
          candidate.groupTaskType === 'table-completion' &&
          candidate.groupId === canonicalGroup.groupId,
      );

      if (groupQuestions.length === 0) {
        continue;
      }

      const firstInGroup = groupQuestions[0];
      const lastInGroup = groupQuestions[groupQuestions.length - 1];
      if (!firstInGroup || !lastInGroup) {
        continue;
      }

      groups.push({
        startNumber: firstInGroup.number,
        endNumber: lastInGroup.number,
        type: canonicalGroup.taskType,
        questions: groupQuestions,
        instructions: buildTableCompletionSectionInstruction(canonicalGroup),
        canonicalGroup,
      });
      consumedCanonicalGroupIds.add(canonicalGroup.groupId);
      continue;
    }

    if (currentGroup.length === 0) {
      currentGroup = [question];
      currentType = question.type;
      currentSummaryGroupId = question.summaryGroupId;
      continue;
    }

    const isSameType = question.type === currentType;
    const isSameSummaryGroup = question.summaryGroupId === currentSummaryGroupId;

    if (isSameType && isSameSummaryGroup) {
      currentGroup.push(question);
      continue;
    }

    if (currentType) {
      pushLegacyGroup(currentGroup, currentType);
    }

    currentGroup = [question];
    currentType = question.type;
    currentSummaryGroupId = question.summaryGroupId;
  }

  if (currentGroup.length > 0 && currentType) {
    pushLegacyGroup(currentGroup, currentType);
  }

  return groups;
};

export const findReadingQuestionGroupStart = (
  groups: Array<ReadingQuestionGroup>,
  questionNumber: number,
): number | null => {
  const matchingGroup = groups.find((group) =>
    group.questions.some((question) => question.number === questionNumber),
  );

  return matchingGroup?.startNumber ?? null;
};

export const getFirstUnansweredReadingQuestionGroupStart = (
  groups: Array<ReadingQuestionGroup>,
  answers: Record<number, unknown>,
): number | null => {
  const firstUnansweredGroup = groups.find((group) =>
    group.questions.some((question) =>
      isReadingAnswerEmpty(
        answers[question.number] as string | string[] | Record<string, string> | null | undefined,
      ),
    ),
  );

  return firstUnansweredGroup?.startNumber ?? null;
};

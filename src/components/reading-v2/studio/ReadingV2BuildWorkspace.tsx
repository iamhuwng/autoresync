// @ts-nocheck
import {
  IconAlertTriangle,
  IconBold,
  IconCopy,
  IconEdit,
  IconItalic,
  IconPlus,
  IconTrash,
  IconUnderline,
  IconX,
} from '@tabler/icons-react';
import { Fragment, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { ReadingV2DerivedNumber } from '../../../services/reading-v2/readingV2Numbering.service';
import {
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2OptionSet,
  type ReadingV2StimulusNode,
  type ReadingV2TaskGroup,
} from '../../../types/readingV2.types';
import {
  type ReadingV2CanonicalTaskType,
} from '../../../types/readingV2Taxonomy';
import {
  mapReadingV2BuildValidationMessagesToReviewIssues,
  type ReadingV2ReviewIssue,
} from '../../../services/reading-v2/readingV2ReviewIssueMapping.service';
import type { ReadingV2StudioMetadata, ReadingV2Visibility } from './ReadingV2MetadataPanel';
import { ReadingV2PassageEditor } from './ReadingV2PassageEditor';
import { ReadingV2ReviewIssuesPanel } from './ReadingV2ReviewIssuesPanel';
import { ReadingV2TableCompletionBuilder } from './ReadingV2TableCompletionBuilder';

export interface ReadingV2BuildPassageSlot {
  readonly passageNumber: number;
  readonly sectionId?: string;
  readonly stimulusId?: string;
  readonly title: string;
  readonly text: string;
  readonly questionGroupCount: number;
  readonly questionCount: number;
  readonly hasTitle: boolean;
  readonly hasText: boolean;
}

export interface ReadingV2BuildValidationMessage {
  readonly key: string;
  readonly message: string;
  readonly reviewLabel?: string;
  readonly reviewDetail?: string;
  readonly questionRange?: {
    readonly start: number;
    readonly end: number;
  };
  readonly source?: 'import-review' | 'validation';
}

export interface ReadingV2QuestionLinkTarget {
  readonly anchorId?: string;
  readonly interactionId?: string;
  readonly taskGroupId?: string;
  readonly source: 'question' | 'block' | 'diagnostic' | 'repair';
}

export interface ReadingV2BuildWorkspaceProps {
  readonly document: ReadingV2Document;
  readonly metadata: ReadingV2StudioMetadata;
  readonly modeLabel: string;
  readonly passageSlots: readonly ReadingV2BuildPassageSlot[];
  readonly selectedPassageNumber: number;
  readonly selectedPassageTaskGroups: readonly ReadingV2TaskGroup[];
  readonly allTaskGroups: readonly ReadingV2TaskGroup[];
  readonly interactions: Readonly<Record<string, ReadingV2Interaction>>;
  readonly optionSets: Readonly<Record<string, ReadingV2OptionSet>>;
  readonly authoringNumbers: readonly ReadingV2DerivedNumber[];
  readonly selectedTaskGroupId?: string | null;
  readonly selectedQuestionLink?: ReadingV2QuestionLinkTarget | null;
  readonly validationMessages: readonly ReadingV2BuildValidationMessage[];
  readonly publishBlocked: boolean;
  readonly workflowMessage?: string | null;
  readonly publishState: string;
  readonly operationalActionLabel?: string;
  readonly onSaveDraft: () => void;
  readonly onValidate: () => void;
  readonly onPreview: () => void;
  readonly onPublish: () => void;
  readonly onExit: () => void;
  readonly onOperationalAction?: () => void;
  readonly onToolbarMoreToggle?: (outcome: 'open' | 'close') => void;
  readonly onSelectPassage: (passageNumber: number) => void;
  readonly onAddPassage?: () => void;
  readonly onRemovePassage?: (passageNumber: number) => void;
  readonly onMetadataChange: (metadata: ReadingV2StudioMetadata) => void;
  readonly onPassageTitleChange: (passageNumber: number, title: string) => void;
  readonly onPassageTextChange: (passageNumber: number, text: string) => void;
  readonly onAddQuestionGroup: (taskType: ReadingV2CanonicalTaskType) => void;
  readonly onSelectTaskGroup: (taskGroupId: string) => void;
  readonly onTaskGroupChange: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onInteractionChange: (interaction: ReadingV2Interaction) => void;
  readonly onInteractionRemove: (interactionId: string, taskGroup: ReadingV2TaskGroup) => void;
  readonly onOptionSetChange: (optionSet: ReadingV2OptionSet) => void;
  readonly onDocumentChange: (document: ReadingV2Document) => void;
  readonly onPassageEditorAction?: (action: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly onTableCompletionAction?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly onQuestionLinkNavigation?: (target: ReadingV2QuestionLinkTarget) => void;
  readonly onQuestionLinkRepair?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly onReviewIssuesAction?: (action: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly onAddQuestion: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onDuplicateQuestionGroup: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onDeleteQuestionGroup: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onOpenQuestionGroupModal: () => void;
  readonly onCloseQuestionGroupModal: () => void;
}

const questionRangesOverlap = (
  left: { readonly start: number; readonly end: number },
  right: { readonly start: number; readonly end: number },
): boolean => left.start <= right.end && right.start <= left.end;

const TASK_TYPE_CATEGORIES: readonly {
  readonly category: string;
  readonly taskTypes: readonly ReadingV2CanonicalTaskType[];
}[] = [
  {
    category: 'Completion',
    taskTypes: [
      'sentence-completion',
      'summary-completion-text',
      'summary-completion-list',
      'note-completion',
      'table-completion',
      'flowchart-completion',
      'diagram-labeling',
    ],
  },
  {
    category: 'Judgement',
    taskTypes: ['true-false-not-given', 'yes-no-not-given'],
  },
  {
    category: 'Matching',
    taskTypes: [
      'matching-headings',
      'matching-information',
      'matching-features',
      'matching-sentence-endings',
    ],
  },
  {
    category: 'Choice',
    taskTypes: ['multiple-choice', 'multiple-select'],
  },
  {
    category: 'Short Answer',
    taskTypes: ['short-answer'],
  },
];

const UNSUPPORTED_TASK_TYPES: Partial<Record<ReadingV2CanonicalTaskType, string>> = {};

const TASK_TYPE_LABELS: Record<ReadingV2CanonicalTaskType, string> = {
  'sentence-completion': 'Sentence Completion',
  'summary-completion-text': 'Summary Completion: words from passage',
  'summary-completion-list': 'Summary Completion: choose from list',
  'note-completion': 'Note Completion',
  'table-completion': 'Table Completion',
  'flowchart-completion': 'Flowchart Completion',
  'diagram-labeling': 'Diagram Labelling',
  'true-false-not-given': 'True / False / Not Given',
  'yes-no-not-given': 'Yes / No / Not Given',
  'matching-headings': 'Matching Headings',
  'matching-information': 'Matching Information',
  'matching-features': 'Matching Features',
  'matching-sentence-endings': 'Matching Sentence Endings',
  'multiple-choice': 'Multiple Choice',
  'multiple-select': 'Multiple Selection',
  'short-answer': 'Short Answer Questions',
};

const ROMAN_LABELS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
const LETTER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export const getReadingV2BuildTaskTypeLabel = (taskType: ReadingV2CanonicalTaskType): string =>
  TASK_TYPE_LABELS[taskType];

const getDefaultOptionLabels = (taskType: ReadingV2CanonicalTaskType): readonly string[] => {
  if (taskType === 'matching-headings') {
    return ROMAN_LABELS.slice(0, 8);
  }

  if (taskType === 'summary-completion-list' || taskType === 'matching-information') {
    return LETTER_LABELS.slice(0, 8);
  }

  if (taskType === 'matching-sentence-endings') {
    return LETTER_LABELS.slice(0, 7);
  }

  if (taskType === 'matching-features') {
    return LETTER_LABELS.slice(0, 5);
  }

  return LETTER_LABELS.slice(0, 4);
};

const createOptionSet = (
  taskGroup: ReadingV2TaskGroup,
  taskType: ReadingV2CanonicalTaskType,
): ReadingV2OptionSet => {
  const responseShape = taskGroup.answerRule.responseShape;
  const optionSetId =
    responseShape.kind === 'single-choice'
    || responseShape.kind === 'multi-select'
    || responseShape.kind === 'matching'
      ? responseShape.optionSetId
      : readingV2Ids.optionSetId(`${taskGroup.taskGroupId}-options`);

  return {
    optionSetId,
    taskGroupId: taskGroup.taskGroupId,
    options: getDefaultOptionLabels(taskType).map((label) => ({
      optionId: `${optionSetId}-${label.toLowerCase()}`,
      label,
      text: '',
    })),
  };
};

const parseAnswers = (value: string): readonly string[] =>
  value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

const formatAnswers = (answers: readonly string[] | undefined): string => answers?.join(' | ') ?? '';

const setAnswerKey = (
  interaction: ReadingV2Interaction,
  answers: readonly string[],
  patch: Partial<ReadingV2Interaction['scoringRule']> = {},
): ReadingV2Interaction => ({
  ...interaction,
  scoringRule: {
    ...interaction.scoringRule,
    maxScore: interaction.scoringRule.maxScore > 0 ? interaction.scoringRule.maxScore : 1,
    acceptableAnswers: answers,
    ...patch,
  },
  placeholder: answers.length === 0,
});

const getPromptLabel = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'sentence-completion':
      return 'Sentence with blank';
    case 'summary-completion-text':
    case 'summary-completion-list':
      return 'Summary text with blank';
    case 'note-completion':
      return 'Note row';
    case 'true-false-not-given':
    case 'yes-no-not-given':
    case 'matching-information':
    case 'matching-features':
      return 'Statement';
    case 'matching-headings':
      return 'Paragraph or question row';
    case 'matching-sentence-endings':
      return 'Sentence beginning';
    case 'multiple-choice':
    case 'multiple-select':
    case 'short-answer':
      return 'Question text';
    case 'table-completion':
      return 'Table blank';
    case 'flowchart-completion':
      return 'Flowchart step';
    case 'diagram-labeling':
      return 'Diagram label';
  }
};

const getOptionListHeading = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'matching-headings':
      return 'Roman numeral heading list';
    case 'matching-information':
      return 'Paragraph choices';
    case 'matching-features':
      return 'Feature list';
    case 'matching-sentence-endings':
      return 'Ending options';
    case 'summary-completion-list':
      return 'Option list';
    default:
      return 'Options';
  }
};

const getCorrectAnswerLabel = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'matching-headings':
      return 'Correct heading answer';
    case 'matching-information':
      return 'Correct paragraph answer';
    case 'matching-features':
      return 'Correct feature answer';
    case 'matching-sentence-endings':
      return 'Correct ending answer';
    case 'summary-completion-list':
      return 'Correct option';
    case 'multiple-choice':
      return 'Correct answer';
    case 'multiple-select':
      return 'Correct answers';
    default:
      return 'Correct answers';
  }
};

const getOptionPrefix = (taskType: ReadingV2CanonicalTaskType, displayLabel: string): string => {
  switch (taskType) {
    case 'matching-information':
      return `Paragraph ${displayLabel}`;
    case 'matching-features':
      return `Feature ${displayLabel}`;
    case 'matching-sentence-endings':
      return `Ending ${displayLabel}`;
    default:
      return `Option ${displayLabel}`;
  }
};

const getOptionPlaceholder = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'matching-information':
      return 'Optional paragraph note';
    case 'matching-features':
      return 'Name, feature, or category';
    case 'matching-sentence-endings':
      return 'Sentence ending text';
    default:
      return 'Enter option text';
  }
};

const getOptionTextHeader = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'matching-headings':
      return 'Heading text';
    case 'matching-information':
      return 'Paragraph note';
    case 'matching-features':
      return 'Feature text';
    case 'matching-sentence-endings':
      return 'Ending text';
    default:
      return 'Option text';
  }
};

const getAddOptionLabel = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'matching-information':
      return 'Add paragraph';
    case 'matching-features':
      return 'Add feature';
    case 'matching-sentence-endings':
      return 'Add ending';
    case 'matching-headings':
      return 'Add heading';
    default:
      return 'Add option';
  }
};

const getUnusedOptionLabel = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'matching-headings':
      return 'Unused distractor';
    case 'matching-information':
      return 'Unused paragraph';
    case 'matching-features':
      return 'Unused feature';
    case 'matching-sentence-endings':
      return 'Unused ending';
    default:
      return 'Unused option';
  }
};

const binaryChoices = (taskType: ReadingV2CanonicalTaskType): readonly { readonly label: string; readonly value: string }[] =>
  taskType === 'yes-no-not-given'
    ? [
        { label: 'YES', value: 'Yes' },
        { label: 'NO', value: 'No' },
        { label: 'NOT GIVEN', value: 'Not Given' },
      ]
    : [
        { label: 'TRUE', value: 'True' },
        { label: 'FALSE', value: 'False' },
        { label: 'NOT GIVEN', value: 'Not Given' },
      ];

const usesOptions = (taskType: ReadingV2CanonicalTaskType): boolean =>
  [
    'summary-completion-list',
    'matching-headings',
    'matching-information',
    'matching-features',
    'matching-sentence-endings',
    'multiple-choice',
    'multiple-select',
  ].includes(taskType);

const isFreeTextType = (taskType: ReadingV2CanonicalTaskType): boolean =>
  [
    'sentence-completion',
    'summary-completion-text',
    'note-completion',
    'short-answer',
  ].includes(taskType);

const isBinaryType = (taskType: ReadingV2CanonicalTaskType): boolean =>
  taskType === 'true-false-not-given' || taskType === 'yes-no-not-given';

const COMPLETION_TASK_TYPES: readonly ReadingV2CanonicalTaskType[] = [
  'sentence-completion',
  'summary-completion-text',
  'summary-completion-list',
  'note-completion',
];

const isCompletionTaskType = (taskType: ReadingV2CanonicalTaskType): boolean =>
  COMPLETION_TASK_TYPES.includes(taskType);

const INSTRUCTION_WORD_LIMIT_TASK_TYPES: readonly ReadingV2CanonicalTaskType[] = [
  'sentence-completion',
  'summary-completion-text',
  'note-completion',
  'table-completion',
  'flowchart-completion',
  'diagram-labeling',
  'short-answer',
];

const showsInstructionWordLimit = (taskType: ReadingV2CanonicalTaskType): boolean =>
  INSTRUCTION_WORD_LIMIT_TASK_TYPES.includes(taskType);

const getDefaultWordLimitForTaskType = (taskType: ReadingV2CanonicalTaskType): number =>
  taskType === 'note-completion' ? 1 : taskType === 'short-answer' ? 3 : 2;

const IELTS_WORD_LIMIT_OPTIONS = [1, 2, 3] as const;

const normalizeWordLimit = (wordLimit: number, fallback = 1): number =>
  Number.isFinite(wordLimit)
    ? Math.min(3, Math.max(1, Math.round(wordLimit)))
    : fallback;

const withGroupWordLimit = (
  taskGroup: ReadingV2TaskGroup,
  wordLimit: number,
): ReadingV2TaskGroup => ({
  ...taskGroup,
  answerRule: {
    ...taskGroup.answerRule,
    wordLimit,
    responseShape: taskGroup.answerRule.responseShape.kind === 'free-text'
      ? {
          kind: 'free-text',
          wordLimit,
        }
      : taskGroup.answerRule.responseShape,
  },
});

const withInteractionWordLimit = (
  interaction: ReadingV2Interaction,
  wordLimit: number,
): ReadingV2Interaction => ({
  ...interaction,
  responseShape: {
    kind: 'free-text',
    wordLimit,
  },
});

const getInstructionWordLimitLabel = (taskType: ReadingV2CanonicalTaskType): string => {
  switch (taskType) {
    case 'sentence-completion':
      return 'Sentence completion word limit';
    case 'summary-completion-text':
      return 'Summary completion word limit';
    case 'note-completion':
      return 'Note completion word limit';
    default:
      return `${TASK_TYPE_LABELS[taskType]} word limit`;
  }
};

const blankMarkerPattern = /_{3,}|\[\s*(?:blank|\d+)\s*\]|\{\{\s*(?:blank|\d+)\s*\}\}/i;
const blankMarkerGlobalPattern = /_{3,}|\[\s*(?:blank|\d+)\s*\]|\{\{\s*(?:blank|\d+)\s*\}\}/gi;
const INLINE_BLANK_MARKER = '_____';

const hasBlankMarker = (value: string | undefined): boolean =>
  blankMarkerPattern.test(value ?? '');

const normalizeVisibleBlankMarkers = (value: string | undefined): string =>
  (value ?? '').replace(blankMarkerGlobalPattern, INLINE_BLANK_MARKER);

const insertInlineBlankMarker = (
  value: string | undefined,
  selectionStart?: number,
  selectionEnd?: number,
): string => {
  const source = normalizeVisibleBlankMarkers(value);
  if (hasBlankMarker(source)) {
    return source;
  }

  const start = Math.max(0, Math.min(selectionStart ?? source.length, source.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, source.length));
  const before = source.slice(0, start).trimEnd();
  const after = source.slice(end).trimStart();

  return [before, INLINE_BLANK_MARKER, after].filter(Boolean).join(' ');
};

const removeInlineBlankMarker = (value: string | undefined): string =>
  normalizeVisibleBlankMarkers(value)
    .replace(blankMarkerPattern, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const applyTextFormat = (
  value: string | undefined,
  selectionStart: number | undefined,
  selectionEnd: number | undefined,
  format: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered',
): string => {
  const source = value ?? '';
  const start = Math.max(0, Math.min(selectionStart ?? source.length, source.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, source.length));
  const selected = source.slice(start, end);

  if (format === 'bullet' || format === 'numbered') {
    const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const prefix = format === 'bullet' ? '- ' : '1. ';
    return `${source.slice(0, lineStart)}${prefix}${source.slice(lineStart)}`;
  }

  const wrappers = {
    bold: ['**', '**'],
    italic: ['*', '*'],
    underline: ['__', '__'],
  }[format];

  return `${source.slice(0, start)}${wrappers[0]}${selected || 'text'}${wrappers[1]}${source.slice(end)}`;
};

const insertBlankMarker = (value: string | undefined, fallbackLabel: string): string => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return `${fallbackLabel} [blank]`;
  }

  return hasBlankMarker(trimmed) ? trimmed : `${trimmed} [blank]`;
};

const findSelectedOptionLabel = (
  answer: string | undefined,
  optionSet: ReadingV2OptionSet,
): string =>
  optionSet.options.find((option) => option.label === answer || option.optionId === answer)?.label
  ?? answer
  ?? '';

const getOptionDisplayLabel = (
  option: ReadingV2OptionSet['options'][number],
  _optionIndex: number,
): string => option.label;

const getNextOptionLabel = (
  optionSet: ReadingV2OptionSet,
  taskType: ReadingV2CanonicalTaskType,
): string => {
  const candidateLabels = taskType === 'matching-headings' ? ROMAN_LABELS : LETTER_LABELS;
  const usedLabels = new Set(optionSet.options.map((option) => option.label));
  return candidateLabels.find((label) => !usedLabels.has(label)) ?? String(optionSet.options.length + 1);
};

const answerMatchesOption = (
  answer: string,
  option: ReadingV2OptionSet['options'][number],
): boolean => answer === option.label || answer === option.optionId;

function AddQuestionGroupModal({
  onClose,
  onContinue,
}: {
  readonly onClose: () => void;
  readonly onContinue: (taskType: ReadingV2CanonicalTaskType) => void;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [selectedTaskType, setSelectedTaskType] = useState<ReadingV2CanonicalTaskType | null>(null);
  const normalizedSearch = searchValue.trim().toLowerCase();
  const visibleCategories = TASK_TYPE_CATEGORIES.map((category) => ({
    ...category,
    taskTypes: category.taskTypes.filter((taskType) =>
      TASK_TYPE_LABELS[taskType].toLowerCase().includes(normalizedSearch),
    ),
  })).filter((category) => category.taskTypes.length > 0);

  return (
    <div className="reading-v2-build-modal__backdrop">
      <section
        className="reading-v2-build-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-v2-add-question-group-title"
      >
        <header className="reading-v2-build-modal__header">
          <h2 id="reading-v2-add-question-group-title">Add Question Group</h2>
          <button
            className="reading-v2-build__icon-button"
            type="button"
            aria-label="Close add question group modal"
            onClick={onClose}
          >
            x
          </button>
        </header>
        <div className="reading-v2-build-modal__search">
          <label className="reading-v2-build-modal__search-label">
            <span className="reading-v2-studio__sr-only">Search question types</span>
            <input
              aria-label="Search question types"
              placeholder="Search question types..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.currentTarget.value)}
            />
          </label>
        </div>
        <div className="reading-v2-build-modal__grid">
          {visibleCategories.map((category) => (
            <details key={category.category} className="reading-v2-build-modal__category" open={normalizedSearch.length > 0}>
              <summary>
                <span>{category.category}</span>
                <span>{category.taskTypes.length}</span>
              </summary>
              <div className="reading-v2-build-modal__types">
                {category.taskTypes.map((taskType) => {
                  const disabledReason = UNSUPPORTED_TASK_TYPES[taskType];
                  const selected = selectedTaskType === taskType;

                  return (
                    <button
                      key={taskType}
                      className="reading-v2-build-modal__type"
                      type="button"
                      aria-pressed={selected}
                      disabled={Boolean(disabledReason)}
                      onClick={() => setSelectedTaskType(taskType)}
                    >
                      <span>{TASK_TYPE_LABELS[taskType]}</span>
                      {disabledReason ? <small>{disabledReason}</small> : null}
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
        <footer className="reading-v2-build-modal__footer">
          <button className="reading-v2-studio__button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="reading-v2-studio__button reading-v2-studio__button--primary"
            type="button"
            disabled={!selectedTaskType}
            onClick={() => {
              if (selectedTaskType) {
                onContinue(selectedTaskType);
              }
            }}
          >
            Continue
          </button>
        </footer>
      </section>
    </div>
  );
}

function OptionListEditor({
  taskGroup,
  optionSet,
  interactions = [],
  numberByInteractionId,
  optionSourceLabel,
  optionSourceMode = 'single',
  optionSourcePlaceholder = 'Leave empty for distractor',
  getOptionSourceValue,
  onOptionSourceChange,
  onOptionRemove,
  onOptionSetChange,
  onInteractionChange,
}: {
  readonly taskGroup: ReadingV2TaskGroup;
  readonly optionSet: ReadingV2OptionSet;
  readonly interactions?: readonly ReadingV2Interaction[];
  readonly numberByInteractionId?: ReadonlyMap<string, number>;
  readonly optionSourceLabel?: string;
  readonly optionSourceMode?: 'single' | 'multiple';
  readonly optionSourcePlaceholder?: string;
  readonly getOptionSourceValue?: (option: ReadingV2OptionSet['options'][number]) => string;
  readonly onOptionSourceChange?: (option: ReadingV2OptionSet['options'][number], value: string) => void;
  readonly onOptionRemove?: (option: ReadingV2OptionSet['options'][number]) => void;
  readonly onOptionSetChange: (optionSet: ReadingV2OptionSet) => void;
  readonly onInteractionChange?: (interaction: ReadingV2Interaction) => void;
}) {
  const heading = getOptionListHeading(taskGroup.officialTaskType);
  const showOptionUsage = !getOptionSourceValue && (
    taskGroup.officialTaskType === 'matching-headings'
    || taskGroup.officialTaskType === 'matching-information'
    || taskGroup.officialTaskType === 'matching-features'
    || taskGroup.officialTaskType === 'matching-sentence-endings'
  );
  const getHeadingUsage = (option: ReadingV2OptionSet['options'][number]): readonly string[] =>
    interactions
      .filter((interaction) => (interaction.scoringRule.acceptableAnswers ?? []).some((answer) => answerMatchesOption(answer, option)))
      .map((interaction, interactionIndex) => {
        const questionNumber = numberByInteractionId?.get(interaction.interactionId) ?? interactionIndex + 1;
        return `Q${questionNumber}`;
      });
  const matchingBank = taskGroup.officialTaskType === 'matching-headings'
    || taskGroup.officialTaskType === 'matching-information'
    || taskGroup.officialTaskType === 'matching-features'
    || taskGroup.officialTaskType === 'matching-sentence-endings';
  const hasSourceFields = Boolean(getOptionSourceValue && onOptionSourceChange);

  const removeOption = (option: ReadingV2OptionSet['options'][number]) => {
    if (onOptionRemove) {
      onOptionRemove(option);
      return;
    }

    onOptionSetChange(removeOptionFromSet(optionSet, option.optionId));

    if (!onInteractionChange) {
      return;
    }

    interactions.forEach((interaction) => {
      const currentAnswers = interaction.scoringRule.acceptableAnswers ?? [];
      if (currentAnswers.some((answer) => answerMatchesOption(answer, option))) {
        onInteractionChange(setAnswerKey(interaction, currentAnswers.filter((answer) => !answerMatchesOption(answer, option))));
      }
    });
  };

  return (
    <section className="reading-v2-build-card__section" aria-label={`${heading} for ${TASK_TYPE_LABELS[taskGroup.officialTaskType]}`}>
      <div className="reading-v2-build-card__section-heading">
        <h4>{heading}</h4>
        <button
          className="reading-v2-studio__button reading-v2-studio__button--quiet"
          type="button"
          onClick={() => {
            onOptionSetChange(addOptionToSet(optionSet, taskGroup.officialTaskType));
          }}
        >
          {getAddOptionLabel(taskGroup.officialTaskType)}
        </button>
      </div>
      {matchingBank ? (
        <div className="reading-v2-build-options reading-v2-build-options--table">
          <table
            className={hasSourceFields
              ? 'reading-v2-build-options__table reading-v2-build-options__table--with-source'
              : showOptionUsage
                ? 'reading-v2-build-options__table reading-v2-build-options__table--with-usage'
                : 'reading-v2-build-options__table'}
          >
            <colgroup>
              <col className="reading-v2-build-options__col-label" />
              <col className="reading-v2-build-options__col-text" />
              {hasSourceFields ? <col className="reading-v2-build-options__col-source" /> : null}
              {!hasSourceFields && showOptionUsage ? <col className="reading-v2-build-options__col-usage" /> : null}
              <col className="reading-v2-build-options__col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">{getOptionTextHeader(taskGroup.officialTaskType)}</th>
                {hasSourceFields ? <th scope="col">{optionSourceLabel ?? 'Question source'}</th> : null}
                {!hasSourceFields && showOptionUsage ? <th scope="col">Use</th> : null}
                <th scope="col"><span className="reading-v2-studio__sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {optionSet.options.map((option, optionIndex) => {
                const removeDisabled = optionSet.options.length <= 2;
                const displayLabel = getOptionDisplayLabel(option, optionIndex);
                const optionPrefix = getOptionPrefix(taskGroup.officialTaskType, displayLabel);
                const headingUsage = showOptionUsage ? getHeadingUsage(option) : [];
                const sourceValue = getOptionSourceValue?.(option) ?? '';
                const sourceAriaLabel = `${optionSourceLabel ?? 'Question source'} for option ${displayLabel}`;

                return (
                  <tr key={`${option.optionId}-${optionIndex}`}>
                    <td className="reading-v2-build-options__label" title={optionPrefix}>
                      {displayLabel}
                    </td>
                    <td>
                      <label className="reading-v2-build-options__text-field">
                        <span className="reading-v2-studio__sr-only">{optionPrefix}</span>
                        <input
                          aria-label={`Option ${displayLabel} text`}
                          placeholder={getOptionPlaceholder(taskGroup.officialTaskType)}
                          value={option.text}
                          onChange={(event) =>
                            onOptionSetChange(updateOptionSetOption(optionSet, optionIndex, { text: event.currentTarget.value }))
                          }
                        />
                      </label>
                    </td>
                    {getOptionSourceValue && onOptionSourceChange ? (
                      <td>
                        <label className="reading-v2-build-options__source">
                          <span className="reading-v2-studio__sr-only">{optionSourceLabel}</span>
                          {optionSourceMode === 'multiple' ? (
                            <textarea
                              aria-label={sourceAriaLabel}
                              rows={2}
                              placeholder={optionSourcePlaceholder}
                              value={sourceValue}
                              onChange={(event) => onOptionSourceChange(option, event.currentTarget.value)}
                            />
                          ) : (
                            <input
                              aria-label={sourceAriaLabel}
                              placeholder={optionSourcePlaceholder}
                              value={sourceValue}
                              onChange={(event) => onOptionSourceChange(option, event.currentTarget.value)}
                            />
                          )}
                        </label>
                      </td>
                    ) : null}
                    {showOptionUsage ? (
                      <td>
                        <span
                          className="reading-v2-build-options__usage"
                          data-state={headingUsage.length > 0 ? 'used' : 'unused'}
                        >
                          {headingUsage.length > 0 ? `Used by ${headingUsage.join(', ')}` : getUnusedOptionLabel(taskGroup.officialTaskType)}
                        </span>
                      </td>
                    ) : null}
                    <td>
                      <button
                        className="reading-v2-build__icon-button reading-v2-build-options__remove"
                        type="button"
                        aria-label={`Remove option ${displayLabel}`}
                        disabled={removeDisabled}
                        title={removeDisabled ? 'At least two options are required.' : `Remove option ${displayLabel}`}
                        onClick={() => removeOption(option)}
                      >
                        <IconTrash aria-hidden="true" size={16} stroke={1.9} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="reading-v2-build-options">
          {optionSet.options.map((option, optionIndex) => {
            const removeDisabled = optionSet.options.length <= 2;
            const displayLabel = getOptionDisplayLabel(option, optionIndex);
            const optionPrefix = getOptionPrefix(taskGroup.officialTaskType, displayLabel);

            return (
              <div className="reading-v2-build-options__row" key={`${option.optionId}-${optionIndex}`}>
                <label>
                  <span>{optionPrefix}</span>
                  <input
                    aria-label={`Option ${displayLabel} text`}
                    placeholder={getOptionPlaceholder(taskGroup.officialTaskType)}
                    value={option.text}
                    onChange={(event) =>
                      onOptionSetChange(updateOptionSetOption(optionSet, optionIndex, { text: event.currentTarget.value }))
                    }
                  />
                </label>
                <button
                  className="reading-v2-build__icon-button reading-v2-build-options__remove"
                  type="button"
                  aria-label={`Remove option ${displayLabel}`}
                  disabled={removeDisabled}
                  title={removeDisabled ? 'At least two options are required.' : `Remove option ${displayLabel}`}
                  onClick={() => removeOption(option)}
                >
                  <IconTrash aria-hidden="true" size={16} stroke={1.9} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuestionRows({
  taskGroup,
  interactions,
  optionSet,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
}: {
  readonly taskGroup: ReadingV2TaskGroup;
  readonly interactions: readonly ReadingV2Interaction[];
  readonly optionSet?: ReadingV2OptionSet;
  readonly numberByInteractionId: ReadonlyMap<string, number>;
  readonly onTaskGroupChange: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onInteractionChange: (interaction: ReadingV2Interaction) => void;
  readonly onInteractionRemove: (interactionId: string, taskGroup: ReadingV2TaskGroup) => void;
}) {
  const taskType = taskGroup.officialTaskType;
  const promptLabel = getPromptLabel(taskType);
  const answerLabel = getCorrectAnswerLabel(taskType);
  const completionTask = isCompletionTaskType(taskType);
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);

  return (
    <section className="reading-v2-build-card__section" aria-label="Questions and correct answers">
      <h4>Questions</h4>
      <div className="reading-v2-build-question-list">
        {interactions.map((interaction, interactionIndex) => {
          const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
          const questionLabel = `Question ${questionNumber}`;
          const selectedAnswers = interaction.scoringRule.acceptableAnswers ?? [];
          const blankPresent = hasBlankMarker(interaction.promptText);
          const answerComplete = selectedAnswers.some((answer) => answer.trim().length > 0);
          const rowNeedsAttention = !answerComplete || (completionTask && !blankPresent);

          return (
            <fieldset className="reading-v2-build-question-row" data-needs-attention={rowNeedsAttention ? 'true' : 'false'} key={interaction.interactionId}>
              <legend>{questionLabel}</legend>
              <label>
                {promptLabel}
                <textarea
                  aria-label={`${questionLabel} ${promptLabel.toLowerCase()}`}
                  value={interaction.promptText ?? ''}
                  onChange={(event) =>
                    onInteractionChange({
                      ...interaction,
                      promptText: event.currentTarget.value,
                    })
                  }
                />
              </label>
              {completionTask ? (
                <div className={blankPresent ? 'reading-v2-build-inline-check' : 'reading-v2-build-inline-check reading-v2-build-inline-check--warning'}>
                  <span>{blankPresent ? 'Blank marker found' : 'Add a visible blank marker such as [blank] or ___.'}</span>
                  {!blankPresent ? (
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--quiet"
                      type="button"
                      onClick={() =>
                        onInteractionChange({
                          ...interaction,
                          promptText: insertBlankMarker(interaction.promptText, promptLabel),
                        })
                      }
                    >
                      Insert blank
                    </button>
                  ) : null}
                </div>
              ) : null}

              {isFreeTextType(taskType) ? (
                <div className="reading-v2-build-question-row__grid">
                  <label>
                    Word limit
                    <input
                      aria-label={`Word limit for ${questionLabel}`}
                      type="number"
                      min={1}
                      value={
                        interaction.responseShape.kind === 'free-text'
                          ? interaction.responseShape.wordLimit ?? taskGroup.answerRule.wordLimit ?? 1
                          : taskGroup.answerRule.wordLimit ?? 1
                      }
                      onChange={(event) => {
                        const wordLimit = Math.max(1, Number(event.currentTarget.value));
                        onTaskGroupChange({
                          ...taskGroup,
                          answerRule: {
                            ...taskGroup.answerRule,
                            wordLimit,
                            responseShape: {
                              kind: 'free-text',
                              wordLimit,
                            },
                          },
                        });
                        onInteractionChange({
                          ...interaction,
                          responseShape: {
                            kind: 'free-text',
                            wordLimit,
                          },
                        });
                      }}
                    />
                  </label>
                  <label>
                    {answerLabel}
                    <input
                      data-answer-state={answerComplete ? 'complete' : 'missing'}
                      aria-label={`Correct answers for ${questionLabel}`}
                      placeholder="Use | for acceptable alternatives..."
                      value={formatAnswers(selectedAnswers)}
                      onChange={(event) => onInteractionChange(setAnswerKey(interaction, parseAnswers(event.currentTarget.value)))}
                    />
                  </label>
                </div>
              ) : null}

              {isBinaryType(taskType) ? (
                <label>
                  {answerLabel}
                  <select
                    data-answer-state={answerComplete ? 'complete' : 'missing'}
                    aria-label={`${answerLabel} for ${questionLabel}`}
                    value={selectedAnswers[0] ?? ''}
                    onChange={(event) =>
                      onInteractionChange(setAnswerKey(interaction, event.currentTarget.value ? [event.currentTarget.value] : []))
                    }
                  >
                    <option value="">Select answer</option>
                    {binaryChoices(taskType).map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {optionSet && taskType !== 'multiple-select' ? (
                <label>
                  {answerLabel}
                  <select
                    data-answer-state={answerComplete ? 'complete' : 'missing'}
                    aria-label={`${answerLabel} for ${questionLabel}`}
                    value={findSelectedOptionLabel(selectedAnswers[0], optionSet)}
                    onChange={(event) =>
                      onInteractionChange(setAnswerKey(interaction, event.currentTarget.value ? [event.currentTarget.value] : []))
                    }
                  >
                    <option value="">Select answer</option>
                    {optionSet.options.map((option) => (
                      <option key={option.optionId} value={option.label}>
                        {option.label}{option.text ? `. ${option.text}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {optionSet && taskType === 'multiple-select' ? (
                <section className="reading-v2-build-card__section reading-v2-build-card__section--nested" aria-label={`${answerLabel} for ${questionLabel}`}>
                  <label>
                    Selection count
                    <input
                      aria-label={`Selection count for ${questionLabel}`}
                      type="number"
                      min={1}
                      max={Math.max(1, optionSet.options.length)}
                      value={interaction.responseShape.kind === 'multi-select' ? interaction.responseShape.selectionLimit : 2}
                      onChange={(event) => {
                        const maxSelectionLimit = Math.max(1, optionSet.options.length);
                        const selectionLimit = Math.min(maxSelectionLimit, Math.max(1, Number(event.currentTarget.value)));
                        const nextResponseShape = {
                          kind: 'multi-select' as const,
                          optionSetId: optionSet.optionSetId,
                          selectionLimit,
                        };
                        onTaskGroupChange({
                          ...taskGroup,
                          answerRule: {
                            ...taskGroup.answerRule,
                            responseShape: nextResponseShape,
                          },
                        });
                        onInteractionChange({
                          ...interaction,
                          responseShape: nextResponseShape,
                          scoringRule: {
                            ...interaction.scoringRule,
                            acceptableAnswers: (interaction.scoringRule.acceptableAnswers ?? []).slice(0, selectionLimit),
                            orderMatters: false,
                          },
                        });
                      }}
                    />
                  </label>
                  <div className="reading-v2-build-check-grid">
                    {optionSet.options.map((option) => {
                      const checked = selectedAnswers.includes(option.label) || selectedAnswers.includes(option.optionId);
                      const selectionLimit = interaction.responseShape.kind === 'multi-select'
                        ? interaction.responseShape.selectionLimit
                        : 2;
                      const disabledByLimit = !checked && selectedAnswers.length >= selectionLimit;

                      return (
                        <label className="reading-v2-build-choice-tile" data-selected={checked ? 'true' : 'false'} key={option.optionId} title={disabledByLimit ? `Clear another option first. This question needs ${selectionLimit}.` : undefined}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabledByLimit}
                            onChange={(event) => {
                              const current = new Set(
                                selectedAnswers.map((answer) => findSelectedOptionLabel(answer, optionSet)),
                              );
                              if (event.currentTarget.checked) {
                                current.add(option.label);
                              } else {
                                current.delete(option.label);
                              }
                              onInteractionChange(setAnswerKey(interaction, Array.from(current).slice(0, selectionLimit), { orderMatters: false }));
                            }}
                          />
                          {option.label}{option.text ? `. ${option.text}` : ''}
                        </label>
                      );
                    })}
                  </div>
                  <p className={selectedAnswers.length === (interaction.responseShape.kind === 'multi-select' ? interaction.responseShape.selectionLimit : 2) ? 'reading-v2-build-inline-check' : 'reading-v2-build-inline-check reading-v2-build-inline-check--warning'}>
                    Selected {selectedAnswers.length} of {interaction.responseShape.kind === 'multi-select' ? interaction.responseShape.selectionLimit : 2} correct answers.
                  </p>
                </section>
              ) : null}

              {pendingDeleteInteractionId === interaction.interactionId ? (
                <section className="reading-v2-build-confirm" role="alert">
                  <span>Delete {questionLabel}? This removes the prompt and answer key from the draft.</span>
                  <div className="reading-v2-studio__inline-actions">
                    <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                      Keep question
                    </button>
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--danger"
                      type="button"
                      onClick={() => {
                        setPendingDeleteInteractionId(null);
                        onInteractionRemove(interaction.interactionId, taskGroup);
                      }}
                    >
                      Delete question
                    </button>
                  </div>
                </section>
              ) : (
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--quiet"
                  type="button"
                  onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
                >
                  Delete question
                </button>
              )}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

interface ReadingV2TaskEditorRendererProps {
  readonly document: ReadingV2Document;
  readonly taskGroup: ReadingV2TaskGroup;
  readonly interactions: readonly ReadingV2Interaction[];
  readonly optionSet?: ReadingV2OptionSet;
  readonly optionSets: Readonly<Record<string, ReadingV2OptionSet>>;
  readonly numberByInteractionId: ReadonlyMap<string, number>;
  readonly authoringNumbers: readonly ReadingV2DerivedNumber[];
  readonly selectedQuestionLink?: ReadingV2QuestionLinkTarget | null;
  readonly onTaskGroupChange: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onInteractionChange: (interaction: ReadingV2Interaction) => void;
  readonly onInteractionRemove: (interactionId: string, taskGroup: ReadingV2TaskGroup) => void;
  readonly onOptionSetChange: (optionSet: ReadingV2OptionSet) => void;
  readonly onDocumentChange: (document: ReadingV2Document) => void;
  readonly onTableCompletionAction?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly onQuestionLinkNavigation?: (target: ReadingV2QuestionLinkTarget) => void;
  readonly onQuestionLinkRepair?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly onAddQuestion: (taskGroup: ReadingV2TaskGroup) => void;
}

const getInteractionOptionSetId = (
  interaction: ReadingV2Interaction,
): ReadingV2OptionSet['optionSetId'] | null => {
  const { responseShape } = interaction;

  if (
    responseShape.kind === 'single-choice'
    || responseShape.kind === 'multi-select'
    || responseShape.kind === 'matching'
  ) {
    return responseShape.optionSetId;
  }

  return null;
};

const getInteractionOptionSet = (
  interaction: ReadingV2Interaction,
  optionSets: Readonly<Record<string, ReadingV2OptionSet>>,
  fallbackOptionSet?: ReadingV2OptionSet,
): ReadingV2OptionSet | undefined => {
  const optionSetId = getInteractionOptionSetId(interaction);
  return optionSetId ? optionSets[optionSetId] ?? fallbackOptionSet : fallbackOptionSet;
};

const withTaskGroupOptionSetRef = (
  taskGroup: ReadingV2TaskGroup,
  optionSetId: ReadingV2OptionSet['optionSetId'],
): ReadingV2TaskGroup =>
  taskGroup.optionSetRefs.includes(optionSetId)
    ? taskGroup
    : {
        ...taskGroup,
        optionSetRefs: [...taskGroup.optionSetRefs, optionSetId],
      };

const updateOptionSetOption = (
  optionSet: ReadingV2OptionSet,
  optionIndex: number,
  patch: Partial<ReadingV2OptionSet['options'][number]>,
): ReadingV2OptionSet => ({
  ...optionSet,
  options: optionSet.options.map((option, currentIndex) =>
    currentIndex === optionIndex
      ? {
          ...option,
          ...patch,
        }
      : option,
  ),
});

const addOptionToSet = (
  optionSet: ReadingV2OptionSet,
  taskType: ReadingV2CanonicalTaskType,
): ReadingV2OptionSet => {
  const label = getNextOptionLabel(optionSet, taskType);

  return {
    ...optionSet,
    options: [
      ...optionSet.options,
      {
        optionId: `${optionSet.optionSetId}-${label.toLowerCase()}`,
        label,
        text: '',
      },
    ],
  };
};

const removeOptionFromSet = (
  optionSet: ReadingV2OptionSet,
  optionId: string,
): ReadingV2OptionSet => ({
  ...optionSet,
  options: optionSet.options.filter((option) => option.optionId !== optionId),
});

const splitPromptBlank = (value: string | undefined): { readonly before: string; readonly after: string } => {
  const source = value ?? '';
  const match = source.match(blankMarkerPattern);

  if (!match || match.index === undefined) {
    return { before: source, after: '' };
  }

  return {
    before: source.slice(0, match.index).trimEnd(),
    after: source.slice(match.index + match[0].length).trimStart(),
  };
};

const joinPromptBlank = (before: string, after: string): string => {
  const left = before.trim();
  const right = after.trim();
  return [left, '[blank]', right].filter(Boolean).join(' ');
};

const getSummaryBlankToken = (questionNumber: number): string => `[${questionNumber}]`;

interface SummaryListLayout {
  readonly kind: 'summary-list' | 'summary-text';
  readonly segments: readonly string[];
}

const getSummaryLayoutKind = (taskGroup: ReadingV2TaskGroup): SummaryListLayout['kind'] =>
  taskGroup.officialTaskType === 'summary-completion-text' ? 'summary-text' : 'summary-list';

const joinSummarySegments = (left: string | undefined, right: string | undefined): string =>
  [left?.trim(), right?.trim()].filter(Boolean).join(' ');

const deriveSummaryListSegmentsFromInteractions = (
  interactions: readonly ReadingV2Interaction[],
): readonly string[] => {
  if (interactions.length === 0) {
    return [''];
  }

  const segments: string[] = [];
  interactions.forEach((interaction, interactionIndex) => {
    const promptParts = splitPromptBlank(interaction.promptText);
    if (interactionIndex === 0) {
      segments.push(promptParts.before);
    } else {
      segments[interactionIndex] = joinSummarySegments(segments[interactionIndex], promptParts.before);
    }
    segments[interactionIndex + 1] = joinSummarySegments(segments[interactionIndex + 1], promptParts.after);
  });

  return segments;
};

const normalizeSummaryListSegments = (
  segments: readonly string[] | undefined,
  interactions: readonly ReadingV2Interaction[],
): readonly string[] => {
  const fallback = deriveSummaryListSegmentsFromInteractions(interactions);
  const nextSegments = Array.from({ length: interactions.length + 1 }, (_, index) =>
    (segments?.[index] ?? fallback[index] ?? '').trim(),
  );
  return nextSegments;
};

const parseSummaryBodySegments = (
  bodyText: string,
  interactions: readonly ReadingV2Interaction[],
): readonly string[] | null => {
  const explicitMatches = [...bodyText.matchAll(/\[(\d+)\]/g)];
  const placeholderMatches = explicitMatches.length > 0
    ? explicitMatches
    : [...bodyText.matchAll(/(\[blank\]|_{3,}|\bblank\b)/gi)];

  if (placeholderMatches.length < interactions.length) {
    return null;
  }

  return Array.from({ length: interactions.length + 1 }, (_, segmentIndex) => {
    const previousMatch = placeholderMatches[segmentIndex - 1];
    const nextMatch = placeholderMatches[segmentIndex];
    const segmentStart = previousMatch?.index !== undefined
      ? previousMatch.index + previousMatch[0].length
      : 0;
    const segmentEnd = nextMatch?.index ?? bodyText.length;
    return bodyText.slice(segmentStart, segmentEnd).trim();
  });
};

const parseSummaryListLayout = (
  taskGroup: ReadingV2TaskGroup,
  interactions: readonly ReadingV2Interaction[],
): SummaryListLayout => {
  const kind = getSummaryLayoutKind(taskGroup);
  if (!taskGroup.layoutHint) {
    return {
      kind,
      segments: normalizeSummaryListSegments(undefined, interactions),
    };
  }

  try {
    const parsed = JSON.parse(taskGroup.layoutHint) as Partial<SummaryListLayout> & { readonly kind?: string };
    if ((parsed.kind === 'summary-list' || parsed.kind === 'summary-text') && Array.isArray(parsed.segments)) {
      return {
        kind,
        segments: normalizeSummaryListSegments(parsed.segments, interactions),
      };
    }
  } catch {
    // Keep old drafts editable even if a prior layout hint was malformed.
  }

  return {
    kind,
    segments: normalizeSummaryListSegments(undefined, interactions),
  };
};

const stringifySummaryListLayout = (layout: SummaryListLayout): string =>
  JSON.stringify({
    kind: layout.kind,
    segments: layout.segments,
  });

const formatSummaryBodyText = (
  taskGroup: ReadingV2TaskGroup,
  interactions: readonly ReadingV2Interaction[],
  numberByInteractionId: ReadonlyMap<string, number>,
): string => {
  const layout = parseSummaryListLayout(taskGroup, interactions);
  const bodyParts: string[] = [];

  interactions.forEach((interaction, interactionIndex) => {
    const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
    const beforeText = layout.segments[interactionIndex]?.trim();
    if (beforeText) {
      bodyParts.push(beforeText);
    }
    bodyParts.push(getSummaryBlankToken(questionNumber));
  });

  const lastSegment = layout.segments[interactions.length]?.trim();
  if (lastSegment) {
    bodyParts.push(lastSegment);
  }

  return bodyParts.join(' ').replace(/\s+/g, ' ').trim();
};

const updateSummaryListBodyFromText = (
  bodyText: string,
  taskGroup: ReadingV2TaskGroup,
  interactions: readonly ReadingV2Interaction[],
  onTaskGroupChange: (taskGroup: ReadingV2TaskGroup) => void,
  onInteractionChange: (interaction: ReadingV2Interaction) => void,
): void => {
  const segments = parseSummaryBodySegments(bodyText, interactions);
  if (!segments) {
    return;
  }
  const normalizedSegments = normalizeSummaryListSegments(segments, interactions);
  const currentLayout = parseSummaryListLayout(taskGroup, interactions);
  const nextLayout: SummaryListLayout = {
    kind: getSummaryLayoutKind(taskGroup),
    segments: normalizedSegments,
  };

  if (JSON.stringify(currentLayout.segments) !== JSON.stringify(nextLayout.segments)) {
    onTaskGroupChange({
      ...taskGroup,
      layoutHint: stringifySummaryListLayout(nextLayout),
    });
  }

  interactions.forEach((interaction, interactionIndex) => {
    const nextPromptText = joinPromptBlank(normalizedSegments[interactionIndex] ?? '', normalizedSegments[interactionIndex + 1] ?? '');

    if (nextPromptText !== interaction.promptText) {
      onInteractionChange({
        ...interaction,
        promptText: nextPromptText,
      });
    }
  });
};

interface NoteCompletionLayout {
  readonly subheading: string;
  readonly sections: readonly {
    readonly heading: string;
    readonly questionNumbers: readonly number[];
  }[];
}

const parseNoteCompletionLayout = (taskGroup: ReadingV2TaskGroup): NoteCompletionLayout => {
  if (!taskGroup.layoutHint) {
    return { subheading: '', sections: [] };
  }

  try {
    const parsed = JSON.parse(taskGroup.layoutHint) as Partial<NoteCompletionLayout> & { readonly kind?: string };
    if (parsed.kind === 'note-completion-layout') {
      return {
        subheading: typeof parsed.subheading === 'string' ? parsed.subheading : '',
        sections: Array.isArray(parsed.sections)
          ? parsed.sections
              .map((section) => ({
                heading: typeof section.heading === 'string' ? section.heading : '',
                questionNumbers: Array.isArray(section.questionNumbers)
                  ? section.questionNumbers.filter((value: unknown): value is number =>
                      typeof value === 'number' && Number.isFinite(value),
                    )
                  : [],
              }))
              .filter((section) => section.heading.trim().length > 0 && section.questionNumbers.length > 0)
          : [],
      };
    }
  } catch {
    return { subheading: '', sections: [] };
  }

  return { subheading: '', sections: [] };
};

const stringifyNoteCompletionLayout = (layout: NoteCompletionLayout): string =>
  JSON.stringify({
    kind: 'note-completion-layout',
    subheading: layout.subheading,
    sections: layout.sections.length > 0 ? layout.sections : undefined,
  });

const countWords = (value: string): number =>
  value.trim().split(/\s+/).filter(Boolean).length;

function ChoiceTaskEditor({
  taskGroup,
  interactions,
  optionSet,
  optionSets,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onOptionSetChange,
  onAddQuestion,
}: ReadingV2TaskEditorRendererProps) {
  const isMultipleSelect = taskGroup.officialTaskType === 'multiple-select';
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);

  const createMissingOptionSet = (interaction: ReadingV2Interaction) => {
    const optionSetId = getInteractionOptionSetId(interaction)
      ?? readingV2Ids.optionSetId(`${interaction.interactionId}-options`);
    const nextOptionSet = createOptionSet(
      withTaskGroupOptionSetRef(taskGroup, optionSetId),
      taskGroup.officialTaskType,
    );
    onOptionSetChange({
      ...nextOptionSet,
      optionSetId,
      taskGroupId: taskGroup.taskGroupId,
    });
    onTaskGroupChange(withTaskGroupOptionSetRef(taskGroup, optionSetId));
  };

  return (
    <section className="reading-v2-choice-editor" aria-label={`${TASK_TYPE_LABELS[taskGroup.officialTaskType]} dedicated editor`}>
      {interactions.map((interaction, interactionIndex) => {
        const currentOptionSet = getInteractionOptionSet(interaction, optionSets, optionSet);
        const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
        const selectedAnswers = interaction.scoringRule.acceptableAnswers ?? [];
        const validOptionLabels = new Set(currentOptionSet?.options.map((option) => option.label) ?? []);
        const selectedOptionLabels = selectedAnswers
          .map((answer) => currentOptionSet ? findSelectedOptionLabel(answer, currentOptionSet) : answer)
          .filter((answer) => validOptionLabels.has(answer));
        const selectionLimit = interaction.responseShape.kind === 'multi-select'
          ? interaction.responseShape.selectionLimit
          : 1;
        const answerComplete = isMultipleSelect
          ? selectedOptionLabels.length === selectionLimit
          : selectedOptionLabels.length === 1;

        return (
          <fieldset
            className="reading-v2-choice-editor__question"
            data-needs-attention={!answerComplete ? 'true' : 'false'}
            key={interaction.interactionId}
          >
            <legend>Question {questionNumber}</legend>
            <div className={isMultipleSelect ? 'reading-v2-choice-editor__prompt-row reading-v2-choice-editor__prompt-row--with-count' : 'reading-v2-choice-editor__prompt-row'}>
              <label className="reading-v2-choice-editor__prompt">
                Question text
                <textarea
                  aria-label={`Question ${questionNumber} question text`}
                  rows={2}
                  value={interaction.promptText ?? ''}
                  onChange={(event) =>
                    onInteractionChange({
                      ...interaction,
                      promptText: event.currentTarget.value,
                    })
                  }
                />
              </label>

              {isMultipleSelect ? (
                <label className="reading-v2-choice-editor__count">
                  <span>Select</span>
                  <input
                    aria-label={`Selection count for Question ${questionNumber}`}
                    type="number"
                    min={1}
                    max={Math.max(1, currentOptionSet?.options.length ?? 1)}
                    value={selectionLimit}
                    onChange={(event) => {
                      const maxLimit = Math.max(1, currentOptionSet?.options.length ?? 1);
                      const nextLimit = Math.min(maxLimit, Math.max(1, Number(event.currentTarget.value)));
                      const optionSetId = currentOptionSet?.optionSetId ?? getInteractionOptionSetId(interaction);
                      if (!optionSetId) {
                        return;
                      }
                      onInteractionChange({
                        ...interaction,
                        responseShape: {
                          kind: 'multi-select',
                          optionSetId,
                          selectionLimit: nextLimit,
                        },
                        scoringRule: {
                          ...interaction.scoringRule,
                          acceptableAnswers: selectedAnswers.slice(0, nextLimit),
                          orderMatters: false,
                        },
                      });
                    }}
                  />
                  <span>answers</span>
                </label>
              ) : null}
            </div>

            {currentOptionSet ? (
              <div className="reading-v2-choice-editor__options" aria-label={`Answer options for Question ${questionNumber}`}>
                {currentOptionSet.options.map((option, optionIndex) => {
                  const selected = selectedOptionLabels.includes(option.label);
                  const disabledByLimit = isMultipleSelect && !selected && selectedOptionLabels.length >= selectionLimit;

                  return (
                    <div
                      className="reading-v2-choice-editor__option"
                      data-selected={selected ? 'true' : 'false'}
                      key={option.optionId}
                    >
                      <label className="reading-v2-choice-editor__selector">
                        <input
                          aria-label={`Mark option ${option.label} correct for Question ${questionNumber}`}
                          type={isMultipleSelect ? 'checkbox' : 'radio'}
                          name={`${interaction.interactionId}-correct-answer`}
                          checked={selected}
                          disabled={disabledByLimit}
                          onChange={(event) => {
                            if (isMultipleSelect) {
                              const current = new Set(selectedOptionLabels);
                              if (event.currentTarget.checked) {
                                current.add(option.label);
                              } else {
                                current.delete(option.label);
                              }
                              onInteractionChange(setAnswerKey(interaction, Array.from(current).slice(0, selectionLimit), { orderMatters: false }));
                              return;
                            }

                            onInteractionChange(setAnswerKey(interaction, [option.label]));
                          }}
                        />
                        <span aria-hidden="true" className="reading-v2-choice-editor__custom-control" />
                      </label>
                      <label className="reading-v2-choice-editor__option-text">
                        <span>{option.label}</span>
                        <input
                          aria-label={`Question ${questionNumber} option ${option.label}`}
                          placeholder={`Option ${option.label}`}
                          value={option.text}
                          onChange={(event) =>
                            onOptionSetChange(updateOptionSetOption(currentOptionSet, optionIndex, {
                              text: event.currentTarget.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        className="reading-v2-build__icon-button"
                        type="button"
                        disabled={currentOptionSet.options.length <= 2}
                        onClick={() => {
                          const nextOptionSet = removeOptionFromSet(currentOptionSet, option.optionId);
                          onOptionSetChange(nextOptionSet);
                          if (selected) {
                            onInteractionChange(setAnswerKey(
                              interaction,
                              selectedAnswers.filter((answer) => answer !== option.label && answer !== option.optionId),
                              isMultipleSelect ? { orderMatters: false } : {},
                            ));
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <section className="reading-v2-build-inline-check reading-v2-build-inline-check--warning">
                <span>Question {questionNumber} needs its own option list.</span>
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--quiet"
                  type="button"
                  onClick={() => createMissingOptionSet(interaction)}
                >
                  Create option list
                </button>
              </section>
            )}

            <div className="reading-v2-choice-editor__row-actions">
              {currentOptionSet ? (
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--quiet"
                  type="button"
                  onClick={() => onOptionSetChange(addOptionToSet(currentOptionSet, taskGroup.officialTaskType))}
                >
                  Add option
                </button>
              ) : null}
              <button
                className="reading-v2-studio__button reading-v2-studio__button--quiet"
                type="button"
                onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
              >
                Delete question
              </button>
            </div>

            {!answerComplete ? (
              <p className="reading-v2-studio__sr-only">
                {isMultipleSelect
                  ? `Select exactly ${selectionLimit} correct answers.`
                  : 'Select one correct answer.'}
              </p>
            ) : null}

            {pendingDeleteInteractionId === interaction.interactionId ? (
              <section className="reading-v2-build-confirm" role="alert">
                <span>Delete Question {questionNumber}? This removes the prompt, options, and answer key.</span>
                <div className="reading-v2-studio__inline-actions">
                  <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                    Keep question
                  </button>
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--danger"
                    type="button"
                    onClick={() => {
                      setPendingDeleteInteractionId(null);
                      onInteractionRemove(interaction.interactionId, taskGroup);
                    }}
                  >
                    Delete question
                  </button>
                </div>
              </section>
            ) : null}
          </fieldset>
        );
      })}

      <button
        className="reading-v2-studio__button reading-v2-studio__button--quiet"
        type="button"
        onClick={() => onAddQuestion(taskGroup)}
      >
        Add Question
      </button>
    </section>
  );
}

function ShortAnswerTaskEditor({
  taskGroup,
  interactions,
  numberByInteractionId,
  onInteractionChange,
  onInteractionRemove,
  onAddQuestion,
}: ReadingV2TaskEditorRendererProps) {
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);

  return (
    <section className="reading-v2-short-answer-editor" aria-label="Short Answer Questions dedicated editor">
      {interactions.map((interaction, interactionIndex) => {
        const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
        const answers = interaction.scoringRule.acceptableAnswers ?? [];
        const missingAnswer = !answers.some((answer) => answer.trim().length > 0);

        return (
          <fieldset
            className="reading-v2-short-answer-editor__row"
            data-needs-attention={missingAnswer ? 'true' : 'false'}
            key={interaction.interactionId}
          >
            <legend>Question {questionNumber}</legend>
            <label className="reading-v2-short-answer-editor__prompt">
              Question text
              <textarea
                aria-label={`Question ${questionNumber} short answer prompt`}
                rows={2}
                value={interaction.promptText ?? ''}
                onChange={(event) =>
                  onInteractionChange({
                    ...interaction,
                    promptText: event.currentTarget.value,
                  })
                }
              />
            </label>
            <section
              className="reading-v2-short-answer-editor__answers"
              data-needs-attention={missingAnswer ? 'true' : 'false'}
              aria-label={`Accepted answers for Question ${questionNumber}`}
            >
              <div className="reading-v2-short-answer-editor__primary-row">
                <label>
                  Primary answer
                  <input
                    aria-label={`Primary answer for Question ${questionNumber}`}
                    data-answer-state={missingAnswer ? 'missing' : 'complete'}
                    placeholder="Correct answer"
                    value={answers[0] ?? ''}
                    onChange={(event) => {
                      const nextAnswers = [event.currentTarget.value, ...answers.slice(1)].filter((answer, index) => index === 0 || answer.trim().length > 0);
                      onInteractionChange(setAnswerKey(interaction, nextAnswers));
                    }}
                  />
                </label>
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--quiet"
                  type="button"
                  onClick={() => onInteractionChange(setAnswerKey(interaction, answers.length === 0 ? ['', ''] : [...answers, '']))}
                >
                  Add accepted answer
                </button>
              </div>
              <div className="reading-v2-short-answer-editor__alternatives">
                {answers.slice(1).map((answer, alternativeIndex) => (
                  <label key={`${interaction.interactionId}-alt-${alternativeIndex}`}>
                    Alternative {alternativeIndex + 1}
                    <input
                      aria-label={`Alternative ${alternativeIndex + 1} for Question ${questionNumber}`}
                      value={answer}
                      onChange={(event) => {
                        const nextAnswers = answers.map((current, answerIndex) =>
                          answerIndex === alternativeIndex + 1 ? event.currentTarget.value : current,
                        );
                        onInteractionChange(setAnswerKey(interaction, nextAnswers.filter((candidate) => candidate.trim().length > 0)));
                      }}
                      />
                  </label>
                ))}
              </div>
              {missingAnswer ? (
                <p className="reading-v2-studio__sr-only">Add at least one accepted answer.</p>
              ) : null}
            </section>

            {pendingDeleteInteractionId === interaction.interactionId ? (
              <section className="reading-v2-build-confirm" role="alert">
                <span>Delete Question {questionNumber}? This removes the prompt and answer key.</span>
                <div className="reading-v2-studio__inline-actions">
                  <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                    Keep question
                  </button>
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--danger"
                    type="button"
                    onClick={() => {
                      setPendingDeleteInteractionId(null);
                      onInteractionRemove(interaction.interactionId, taskGroup);
                    }}
                  >
                    Delete question
                  </button>
                </div>
              </section>
            ) : (
              <button
                className="reading-v2-studio__button reading-v2-studio__button--quiet"
                type="button"
                onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
              >
                Delete question
              </button>
            )}
          </fieldset>
        );
      })}
      <button
        className="reading-v2-studio__button reading-v2-studio__button--quiet"
        type="button"
        onClick={() => onAddQuestion(taskGroup)}
      >
        Add Question
      </button>
    </section>
  );
}

function JudgementTaskEditor({
  taskGroup,
  interactions,
  numberByInteractionId,
  onInteractionChange,
  onInteractionRemove,
  onAddQuestion,
}: ReadingV2TaskEditorRendererProps) {
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);
  const vocabulary = binaryChoices(taskGroup.officialTaskType);

  return (
    <section className="reading-v2-judgement-editor" aria-label={`${TASK_TYPE_LABELS[taskGroup.officialTaskType]} dedicated editor`}>
      <section className="reading-v2-judgement-editor__guide" aria-label="Judgement labels">
        <p className="reading-v2-judgement-editor__guide-title">Answer key labels</p>
        {vocabulary.map((choice) => (
          <p key={choice.value}>
            <strong>{choice.label}</strong>
            {choice.label === 'NOT GIVEN'
              ? ' if the passage does not give enough information'
              : ` if the statement ${choice.label === 'TRUE' || choice.label === 'YES' ? 'agrees' : 'contradicts'} the passage`}
          </p>
        ))}
      </section>

      <div className="reading-v2-judgement-editor__statements">
        {interactions.map((interaction, interactionIndex) => {
          const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
          const selectedAnswer = interaction.scoringRule.acceptableAnswers?.[0] ?? '';
          const missingAnswer = selectedAnswer.trim().length === 0;

          return (
            <fieldset
              className="reading-v2-judgement-editor__statement"
              data-needs-attention={missingAnswer ? 'true' : 'false'}
              key={interaction.interactionId}
            >
              <legend className="reading-v2-studio__sr-only">Statement {questionNumber}</legend>
              <div className="reading-v2-judgement-editor__statement-grid">
                <span className="reading-v2-judgement-editor__number">{questionNumber}</span>
                <div className="reading-v2-judgement-editor__statement-main">
                  <textarea
                    aria-label={`Statement ${questionNumber} text`}
                    placeholder="Enter statement text here..."
                    rows={2}
                    value={interaction.promptText ?? ''}
                    onChange={(event) =>
                      onInteractionChange({
                        ...interaction,
                        promptText: event.currentTarget.value,
                      })
                    }
                  />
                  <div className="reading-v2-judgement-editor__segments" aria-label={`Correct answer for Statement ${questionNumber}`}>
                    {vocabulary.map((choice) => {
                      const selected = selectedAnswer === choice.value;
                      return (
                        <button
                          className="reading-v2-judgement-editor__segment"
                          data-selected={selected ? 'true' : 'false'}
                          key={choice.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onInteractionChange(setAnswerKey(interaction, [choice.value]))}
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  className="reading-v2-judgement-editor__delete"
                  type="button"
                  aria-label={`Delete Statement ${questionNumber}`}
                  onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
                >
                  Delete
                </button>
              </div>
              {missingAnswer ? (
                <p className="reading-v2-task-editor__error">Please select a correct answer for this statement.</p>
              ) : null}

              {pendingDeleteInteractionId === interaction.interactionId ? (
                <section className="reading-v2-build-confirm" role="alert">
                  <span>Delete Statement {questionNumber}? This removes the statement and answer key.</span>
                  <div className="reading-v2-studio__inline-actions">
                    <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                      Keep statement
                    </button>
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--danger"
                      type="button"
                      onClick={() => {
                        setPendingDeleteInteractionId(null);
                        onInteractionRemove(interaction.interactionId, taskGroup);
                      }}
                    >
                      Delete statement
                    </button>
                  </div>
                </section>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <button
        className="reading-v2-studio__button reading-v2-studio__button--quiet"
        type="button"
        onClick={() => onAddQuestion(taskGroup)}
      >
        Add Statement
      </button>
    </section>
  );
}

type SummaryCompletionListEditorProps = Pick<
  ReadingV2TaskEditorRendererProps,
  | 'taskGroup'
  | 'interactions'
  | 'optionSet'
  | 'numberByInteractionId'
  | 'onTaskGroupChange'
  | 'onInteractionChange'
  | 'onInteractionRemove'
  | 'onOptionSetChange'
  | 'onAddQuestion'
>;

function SummaryCompletionListEditor({
  taskGroup,
  interactions,
  optionSet,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onOptionSetChange,
  onAddQuestion,
}: SummaryCompletionListEditorProps) {
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);
  const summaryBodyText = formatSummaryBodyText(taskGroup, interactions, numberByInteractionId);
  const [draftSummaryBody, setDraftSummaryBody] = useState(summaryBodyText);
  useEffect(() => {
    setDraftSummaryBody(summaryBodyText);
  }, [summaryBodyText]);

  return (
    <section className="reading-v2-summary-list-editor" aria-label="Summary Completion: choose from list dedicated editor">
      {optionSet ? (
        <OptionListEditor taskGroup={taskGroup} optionSet={optionSet} onOptionSetChange={onOptionSetChange} />
      ) : (
        <section className="reading-v2-build-inline-check reading-v2-build-inline-check--warning">
          <span>This list-completion task needs a visible word bank.</span>
          <button
            className="reading-v2-studio__button reading-v2-studio__button--quiet"
            type="button"
            onClick={() => {
              const nextOptionSet = createOptionSet(taskGroup, taskGroup.officialTaskType);
              onOptionSetChange(nextOptionSet);
              onTaskGroupChange(withTaskGroupOptionSetRef(taskGroup, nextOptionSet.optionSetId));
            }}
          >
            Add word bank
          </button>
        </section>
      )}

      <section className="reading-v2-summary-list-editor__body-section">
        <div className="reading-v2-build-card__section-heading">
          <h4>Summary Text</h4>
          <button
            className="reading-v2-studio__button reading-v2-studio__button--quiet"
            type="button"
            onClick={() => onAddQuestion(taskGroup)}
          >
            Insert Blank
          </button>
        </div>
        <textarea
          aria-label="Summary completion list body"
          className="reading-v2-summary-list-editor__body"
          rows={5}
          value={draftSummaryBody}
          onChange={(event) => setDraftSummaryBody(event.currentTarget.value)}
          onBlur={(event) =>
            updateSummaryListBodyFromText(
              event.currentTarget.value,
              taskGroup,
              interactions,
              onTaskGroupChange,
              onInteractionChange,
            )
          }
        />
      </section>

      <section className="reading-v2-summary-list-editor__answer-key" aria-label="Summary completion answer key">
        <h4>Answer Key</h4>
        <div className="reading-v2-summary-list-editor__answer-rows">
          {interactions.map((interaction, interactionIndex) => {
            const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
            const answers = interaction.scoringRule.acceptableAnswers ?? [];
            const answerComplete = answers.some((answer) => answer.trim().length > 0);

            return (
              <section
                className="reading-v2-summary-list-editor__answer-row"
                data-needs-attention={!answerComplete ? 'true' : 'false'}
                key={interaction.interactionId}
              >
                <span className="reading-v2-summary-list-editor__answer-number">{questionNumber}.</span>
                {optionSet ? (
                  <label>
                    Answer key
                    <select
                      aria-label={`Answer key for Question ${questionNumber}`}
                      data-answer-state={answerComplete ? 'complete' : 'missing'}
                      value={findSelectedOptionLabel(answers[0], optionSet)}
                      onChange={(event) => onInteractionChange(setAnswerKey(interaction, event.currentTarget.value ? [event.currentTarget.value] : []))}
                    >
                      <option value="">Choose option</option>
                      {optionSet.options.map((option, optionIndex) => (
                        <option key={option.optionId} value={option.label}>
                          {getOptionDisplayLabel(option, optionIndex)}{option.text ? ` - ${option.text}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {!answerComplete ? (
                  <p className="reading-v2-task-editor__error">Choose the option for this blank.</p>
                ) : null}
                {pendingDeleteInteractionId === interaction.interactionId ? (
                  <section className="reading-v2-build-confirm" role="alert">
                    <span>Delete blank {questionNumber}? This removes its answer key row.</span>
                    <div className="reading-v2-studio__inline-actions">
                      <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                        Keep blank
                      </button>
                      <button
                        className="reading-v2-studio__button reading-v2-studio__button--danger"
                        type="button"
                        onClick={() => {
                          setPendingDeleteInteractionId(null);
                          onInteractionRemove(interaction.interactionId, taskGroup);
                        }}
                      >
                        Delete blank
                      </button>
                    </div>
                  </section>
                ) : (
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--quiet"
                    type="button"
                    onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
                  >
                    Delete blank
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function SummaryCompletionTextEditor({
  taskGroup,
  interactions,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onAddQuestion,
}: SummaryCompletionListEditorProps) {
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);
  const summaryBodyText = formatSummaryBodyText(taskGroup, interactions, numberByInteractionId);
  const [draftSummaryBody, setDraftSummaryBody] = useState(summaryBodyText);
  useEffect(() => {
    setDraftSummaryBody(summaryBodyText);
  }, [summaryBodyText]);

  return (
    <section className="reading-v2-summary-list-editor" aria-label="Summary Completion: words from passage dedicated editor">
      <section className="reading-v2-summary-list-editor__body-section">
        <div className="reading-v2-build-card__section-heading">
          <h4>Summary Text</h4>
          <div className="reading-v2-studio__inline-actions">
            <button
              className="reading-v2-studio__button reading-v2-studio__button--quiet"
              type="button"
              onClick={() => onAddQuestion(taskGroup)}
            >
              Insert Blank
            </button>
          </div>
        </div>
        <textarea
          aria-label="Summary completion text body"
          className="reading-v2-summary-list-editor__body"
          rows={5}
          value={draftSummaryBody}
          onChange={(event) => setDraftSummaryBody(event.currentTarget.value)}
          onBlur={(event) =>
            updateSummaryListBodyFromText(
              event.currentTarget.value,
              taskGroup,
              interactions,
              onTaskGroupChange,
              onInteractionChange,
            )
          }
        />
      </section>

      <section className="reading-v2-summary-list-editor__answer-key" aria-label="Summary completion free-text answer key">
        <h4>Answer Key</h4>
        <div className="reading-v2-summary-list-editor__answer-rows">
          {interactions.map((interaction, interactionIndex) => {
            const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
            const answers = interaction.scoringRule.acceptableAnswers ?? [];
            const answerComplete = answers.some((answer) => answer.trim().length > 0);

            return (
              <section
                className="reading-v2-summary-list-editor__answer-row"
                data-needs-attention={!answerComplete ? 'true' : 'false'}
                key={interaction.interactionId}
              >
                <span className="reading-v2-summary-list-editor__answer-number">{questionNumber}.</span>
                <label>
                  Accepted answers
                  <input
                    aria-label={`Accepted answers for Question ${questionNumber}`}
                    data-answer-state={answerComplete ? 'complete' : 'missing'}
                    placeholder="Use | for alternatives"
                    value={formatAnswers(answers)}
                    onChange={(event) => onInteractionChange(setAnswerKey(interaction, parseAnswers(event.currentTarget.value)))}
                  />
                </label>
                {!answerComplete ? (
                  <p className="reading-v2-task-editor__error">Add the answer for this blank.</p>
                ) : null}
                {pendingDeleteInteractionId === interaction.interactionId ? (
                  <section className="reading-v2-build-confirm" role="alert">
                    <span>Delete blank {questionNumber}? This removes its answer key row.</span>
                    <div className="reading-v2-studio__inline-actions">
                      <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                        Keep blank
                      </button>
                      <button
                        className="reading-v2-studio__button reading-v2-studio__button--danger"
                        type="button"
                        onClick={() => {
                          setPendingDeleteInteractionId(null);
                          onInteractionRemove(interaction.interactionId, taskGroup);
                        }}
                      >
                        Delete blank
                      </button>
                    </div>
                  </section>
                ) : (
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--quiet"
                    type="button"
                    onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
                  >
                    Delete blank
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function CompletionTaskEditor({
  taskGroup,
  interactions,
  optionSet,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onOptionSetChange,
  onAddQuestion,
}: ReadingV2TaskEditorRendererProps) {
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);
  const sentenceTextRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const usesChoiceBank = taskGroup.officialTaskType === 'summary-completion-list';
  const defaultWordLimit = taskGroup.answerRule.wordLimit ?? getDefaultWordLimitForTaskType(taskGroup.officialTaskType);
  const unitLabel = taskGroup.officialTaskType === 'note-completion'
    ? 'Note line'
    : taskGroup.officialTaskType === 'sentence-completion'
      ? 'Sentence'
      : 'Summary line';

  if (usesChoiceBank) {
    return (
      <SummaryCompletionListEditor
        taskGroup={taskGroup}
        interactions={interactions}
        optionSet={optionSet}
        numberByInteractionId={numberByInteractionId}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={onInteractionChange}
        onInteractionRemove={onInteractionRemove}
        onOptionSetChange={onOptionSetChange}
        onAddQuestion={onAddQuestion}
      />
    );
  }

  if (taskGroup.officialTaskType === 'summary-completion-text') {
    return (
      <SummaryCompletionTextEditor
        taskGroup={taskGroup}
        interactions={interactions}
        optionSet={optionSet}
        numberByInteractionId={numberByInteractionId}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={onInteractionChange}
        onInteractionRemove={onInteractionRemove}
        onOptionSetChange={onOptionSetChange}
        onAddQuestion={onAddQuestion}
      />
    );
  }

  if (taskGroup.officialTaskType === 'sentence-completion') {
    return (
      <section className="reading-v2-completion-editor" aria-label="Sentence Completion dedicated editor">
        <div className="reading-v2-completion-editor__rows">
          {interactions.map((interaction, interactionIndex) => {
            const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
            const sentenceText = normalizeVisibleBlankMarkers(interaction.promptText);
            const blankPresent = hasBlankMarker(sentenceText);
            const answers = interaction.scoringRule.acceptableAnswers ?? [];
            const answerComplete = answers.some((answer) => answer.trim().length > 0);
            const wordLimitExceeded = answers.some((answer) => countWords(answer) > defaultWordLimit);
            const needsAttention = !blankPresent || !answerComplete || wordLimitExceeded;

            return (
              <fieldset
                className="reading-v2-completion-editor__row reading-v2-completion-editor__row--sentence"
                data-needs-attention={needsAttention ? 'true' : 'false'}
                key={interaction.interactionId}
              >
                <legend>Question {questionNumber}</legend>
                {pendingDeleteInteractionId !== interaction.interactionId ? (
                  <button
                    className="reading-v2-completion-editor__row-delete reading-v2-build__icon-button"
                    type="button"
                    aria-label={`Delete row for Question ${questionNumber}`}
                    onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
                  >
                    <IconX aria-hidden="true" size={18} stroke={2} />
                  </button>
                ) : null}
                <label className="reading-v2-completion-editor__sentence-field">
                  Sentence text
                  <textarea
                    aria-label={`Question ${questionNumber} sentence text`}
                    rows={3}
                    ref={(element) => {
                      sentenceTextRefs.current[interaction.interactionId] = element;
                    }}
                    value={sentenceText}
                    onChange={(event) =>
                      onInteractionChange({
                        ...interaction,
                        promptText: event.currentTarget.value,
                      })
                    }
                  />
                </label>

                <div className="reading-v2-completion-editor__sentence-tools">
                  <span
                    className={blankPresent
                      ? 'reading-v2-completion-editor__blank-state'
                      : 'reading-v2-completion-editor__blank-state reading-v2-completion-editor__blank-state--missing'}
                  >
                    {blankPresent ? `Blank in sentence: Q${questionNumber}` : 'No blank in sentence'}
                  </span>
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--quiet"
                    type="button"
                    aria-label={`Insert blank for Question ${questionNumber}`}
                    disabled={blankPresent}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const textArea = sentenceTextRefs.current[interaction.interactionId];
                      const nextPromptText = insertInlineBlankMarker(
                        textArea?.value ?? sentenceText,
                        textArea?.selectionStart,
                        textArea?.selectionEnd,
                      );
                      onInteractionChange({
                        ...interaction,
                        promptText: nextPromptText,
                      });
                    }}
                  >
                    Insert blank
                  </button>
                  {blankPresent ? (
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--quiet"
                      type="button"
                      aria-label={`Clear blank for Question ${questionNumber}`}
                      onClick={() =>
                        onInteractionChange({
                          ...interaction,
                          promptText: removeInlineBlankMarker(sentenceText),
                        })
                      }
                    >
                      Clear blank
                    </button>
                  ) : null}
                </div>

                {!blankPresent ? (
                  <p className="reading-v2-task-editor__error">Insert the blank into this sentence.</p>
                ) : null}

                <section className="reading-v2-completion-editor__answer reading-v2-completion-editor__answer--sentence" aria-label={`Answer panel for Question ${questionNumber}`}>
                  <label>
                    Accepted answers
                    <input
                      aria-label={`Accepted answers for Question ${questionNumber}`}
                      data-answer-state={answerComplete && !wordLimitExceeded ? 'complete' : 'missing'}
                      placeholder="Use | for alternatives"
                      value={formatAnswers(answers)}
                      onChange={(event) => onInteractionChange(setAnswerKey(interaction, parseAnswers(event.currentTarget.value)))}
                    />
                  </label>
                  {wordLimitExceeded ? (
                    <p className="reading-v2-task-editor__error">Word limit exceeded. Max {defaultWordLimit}.</p>
                  ) : !answerComplete ? (
                    <p className="reading-v2-task-editor__error">Add the answer for this blank.</p>
                  ) : null}
                </section>

                {pendingDeleteInteractionId === interaction.interactionId ? (
                  <section className="reading-v2-build-confirm" role="alert">
                    <span>Delete Question {questionNumber}? This removes the sentence blank and answer key.</span>
                    <div className="reading-v2-studio__inline-actions">
                      <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                        Keep row
                      </button>
                      <button
                        className="reading-v2-studio__button reading-v2-studio__button--danger"
                        type="button"
                        onClick={() => {
                          setPendingDeleteInteractionId(null);
                          onInteractionRemove(interaction.interactionId, taskGroup);
                        }}
                      >
                        Delete row
                      </button>
                    </div>
                  </section>
                ) : null}
              </fieldset>
            );
          })}
        </div>

        <button
          className="reading-v2-studio__button reading-v2-studio__button--quiet"
          type="button"
          onClick={() => onAddQuestion(taskGroup)}
        >
          Add blank
        </button>
      </section>
    );
  }

  return (
    <section className="reading-v2-completion-editor" aria-label={`${TASK_TYPE_LABELS[taskGroup.officialTaskType]} dedicated editor`}>
      <div className="reading-v2-completion-editor__rows">
        {interactions.map((interaction, interactionIndex) => {
          const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
          const promptParts = splitPromptBlank(interaction.promptText);
          const answers = interaction.scoringRule.acceptableAnswers ?? [];
          const answerComplete = answers.some((answer) => answer.trim().length > 0);
          const wordLimit = interaction.responseShape.kind === 'free-text'
            ? interaction.responseShape.wordLimit ?? defaultWordLimit
            : defaultWordLimit;

          return (
            <fieldset
              className={usesChoiceBank ? 'reading-v2-completion-editor__row reading-v2-completion-editor__row--choice-list' : 'reading-v2-completion-editor__row'}
              data-needs-attention={!answerComplete ? 'true' : 'false'}
              key={interaction.interactionId}
            >
              <legend>Question {questionNumber}</legend>
              <div className="reading-v2-completion-editor__blank-line">
                <label>
                  {unitLabel} before blank
                  <textarea
                    aria-label={`Question ${questionNumber} text before blank`}
                    rows={2}
                    value={promptParts.before}
                    onChange={(event) =>
                      onInteractionChange({
                        ...interaction,
                        promptText: joinPromptBlank(event.currentTarget.value, promptParts.after),
                      })
                    }
                  />
                </label>
                <span className="reading-v2-completion-editor__blank-token">Q{questionNumber}</span>
                <label>
                  {unitLabel} after blank
                  <textarea
                    aria-label={`Question ${questionNumber} text after blank`}
                    rows={2}
                    value={promptParts.after}
                    onChange={(event) =>
                      onInteractionChange({
                        ...interaction,
                        promptText: joinPromptBlank(promptParts.before, event.currentTarget.value),
                      })
                    }
                  />
                </label>
              </div>

              <section className="reading-v2-completion-editor__answer" aria-label={`Answer panel for Question ${questionNumber}`}>
                {usesChoiceBank && optionSet ? (
                  <label className="reading-v2-completion-editor__choice-answer">
                    Answer key
                    <select
                      aria-label={`Answer key for Question ${questionNumber}`}
                      data-answer-state={answerComplete ? 'complete' : 'missing'}
                      value={answers[0] ?? ''}
                      onChange={(event) => onInteractionChange(setAnswerKey(interaction, event.currentTarget.value ? [event.currentTarget.value] : []))}
                    >
                      <option value="">Choose option</option>
                      {optionSet.options.map((option, optionIndex) => (
                        <option key={option.optionId} value={option.label}>
                          {getOptionDisplayLabel(option, optionIndex)}{option.text ? ` - ${option.text}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="reading-v2-build-question-row__grid">
                    <label>
                      Word limit
                      <input
                        aria-label={`Word limit for Question ${questionNumber}`}
                        type="number"
                        min={1}
                        value={wordLimit}
                        onChange={(event) => {
                          const nextWordLimit = Math.max(1, Number(event.currentTarget.value));
                          onTaskGroupChange({
                            ...taskGroup,
                            answerRule: {
                              ...taskGroup.answerRule,
                              wordLimit: nextWordLimit,
                              responseShape: {
                                kind: 'free-text',
                                wordLimit: nextWordLimit,
                              },
                            },
                          });
                          onInteractionChange({
                            ...interaction,
                            responseShape: {
                              kind: 'free-text',
                              wordLimit: nextWordLimit,
                            },
                          });
                        }}
                      />
                    </label>
                    <label>
                      Accepted answers
                      <input
                        aria-label={`Accepted answers for Question ${questionNumber}`}
                        data-answer-state={answerComplete ? 'complete' : 'missing'}
                        placeholder="Use | for alternatives"
                        value={formatAnswers(answers)}
                        onChange={(event) => onInteractionChange(setAnswerKey(interaction, parseAnswers(event.currentTarget.value)))}
                      />
                    </label>
                  </div>
                )}
                {!answerComplete ? (
                  <p className="reading-v2-task-editor__error">Add the answer for this blank.</p>
                ) : null}
              </section>

              {pendingDeleteInteractionId === interaction.interactionId ? (
                <section className="reading-v2-build-confirm" role="alert">
                  <span>Delete Question {questionNumber}? This removes the blank and answer key.</span>
                  <div className="reading-v2-studio__inline-actions">
                    <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                      Keep blank
                    </button>
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--danger"
                      type="button"
                      onClick={() => {
                        setPendingDeleteInteractionId(null);
                        onInteractionRemove(interaction.interactionId, taskGroup);
                      }}
                    >
                      Delete blank
                    </button>
                  </div>
                </section>
              ) : (
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--quiet"
                  type="button"
                  onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
                >
                  Delete blank
                </button>
              )}
            </fieldset>
          );
        })}
      </div>

      <button
        className="reading-v2-studio__button reading-v2-studio__button--quiet"
        type="button"
        onClick={() => onAddQuestion(taskGroup)}
      >
        Add blank
      </button>
    </section>
  );
}

function NoteCompletionTaskEditor({
  taskGroup,
  interactions,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onAddQuestion,
}: ReadingV2TaskEditorRendererProps) {
  const [pendingDeleteInteractionId, setPendingDeleteInteractionId] = useState<string | null>(null);
  const noteTextRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const defaultWordLimit = taskGroup.answerRule.wordLimit ?? 1;
  const layout = parseNoteCompletionLayout(taskGroup);
  const noteHeading = taskGroup.groupTitle ?? 'NOTE COMPLETION';
  const sectionHeadingByFirstQuestion = new Map(
    layout.sections
      .map((section) => [section.questionNumbers[0], section.heading] as const)
      .filter(([questionNumber]) => typeof questionNumber === 'number'),
  );

  const updateNoteText = (interaction: ReadingV2Interaction, nextText: string) => {
    onInteractionChange({
      ...interaction,
      promptText: normalizeVisibleBlankMarkers(nextText),
    });
  };

  const applyFormatToNote = (
    interaction: ReadingV2Interaction,
    format: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered',
  ) => {
    const textArea = noteTextRefs.current[interaction.interactionId];
    updateNoteText(
      interaction,
      applyTextFormat(
        textArea?.value ?? interaction.promptText,
        textArea?.selectionStart,
        textArea?.selectionEnd,
        format,
      ),
    );
  };

  return (
    <section className="reading-v2-note-editor" aria-label="Note Completion dedicated editor">
      <div className="reading-v2-note-editor__metadata">
        <label>
          Note heading
          <input
            aria-label="Note completion heading"
            value={noteHeading}
            onChange={(event) =>
              onTaskGroupChange({
                ...taskGroup,
                groupTitle: event.currentTarget.value,
              })
            }
          />
        </label>
        <label>
          Subheading
          <input
            aria-label="Note completion subheading"
            placeholder="Optional subheading"
            value={layout.subheading}
            onChange={(event) =>
              onTaskGroupChange({
                ...taskGroup,
                layoutHint: stringifyNoteCompletionLayout({
                  ...layout,
                  subheading: event.currentTarget.value,
                }),
              })
            }
          />
        </label>
      </div>

      <div className="reading-v2-note-editor__rows">
        {interactions.map((interaction, interactionIndex) => {
          const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
          const sectionHeading = sectionHeadingByFirstQuestion.get(questionNumber);
          const noteText = normalizeVisibleBlankMarkers(interaction.promptText);
          const blankPresent = hasBlankMarker(noteText);
          const answers = interaction.scoringRule.acceptableAnswers ?? [];
          const answerText = formatAnswers(answers);
          const answerComplete = answers.some((answer) => answer.trim().length > 0);
          const wordLimitExceeded = answers.some((answer) => countWords(answer) > defaultWordLimit);
          const needsAttention = !blankPresent || !answerComplete || wordLimitExceeded;

          return (
            <Fragment key={interaction.interactionId}>
            {sectionHeading ? (
              <div className="reading-v2-note-editor__section-heading">
                {sectionHeading}
              </div>
            ) : null}
            <fieldset
              className="reading-v2-note-editor__row"
              data-needs-attention={needsAttention ? 'true' : 'false'}
            >
              <legend>Question {questionNumber}</legend>
              {pendingDeleteInteractionId !== interaction.interactionId ? (
                <button
                  className="reading-v2-note-editor__row-delete reading-v2-build__icon-button"
                  type="button"
                  aria-label={`Delete note blank Question ${questionNumber}`}
                  onClick={() => setPendingDeleteInteractionId(interaction.interactionId)}
                >
                  <IconX aria-hidden="true" size={18} stroke={2} />
                </button>
              ) : null}

              <label className="reading-v2-note-editor__text-field">
                Note text
                <textarea
                  aria-label={`Question ${questionNumber} note text`}
                  rows={4}
                  ref={(element) => {
                    noteTextRefs.current[interaction.interactionId] = element;
                  }}
                  value={noteText}
                  onChange={(event) => updateNoteText(interaction, event.currentTarget.value)}
                />
              </label>

              <div className="reading-v2-note-editor__toolbar" aria-label={`Formatting tools for Question ${questionNumber}`}>
                <button type="button" aria-label={`Bold note text for Question ${questionNumber}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormatToNote(interaction, 'bold')}>
                  <IconBold aria-hidden="true" size={17} stroke={2} />
                </button>
                <button type="button" aria-label={`Italic note text for Question ${questionNumber}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormatToNote(interaction, 'italic')}>
                  <IconItalic aria-hidden="true" size={17} stroke={2} />
                </button>
                <button type="button" aria-label={`Underline note text for Question ${questionNumber}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormatToNote(interaction, 'underline')}>
                  <IconUnderline aria-hidden="true" size={17} stroke={2} />
                </button>
                <button type="button" aria-label={`Add bullet line for Question ${questionNumber}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormatToNote(interaction, 'bullet')}>
                  Bullet
                </button>
                <button type="button" aria-label={`Add numbered line for Question ${questionNumber}`} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormatToNote(interaction, 'numbered')}>
                  1.
                </button>
                <button
                  type="button"
                  aria-label={`Insert blank for Question ${questionNumber}`}
                  disabled={blankPresent}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const textArea = noteTextRefs.current[interaction.interactionId];
                    updateNoteText(
                      interaction,
                      insertInlineBlankMarker(
                        textArea?.value ?? noteText,
                        textArea?.selectionStart,
                        textArea?.selectionEnd,
                      ),
                    );
                  }}
                >
                  Insert blank
                </button>
                {blankPresent ? (
                  <button type="button" aria-label={`Clear blank for Question ${questionNumber}`} onClick={() => updateNoteText(interaction, removeInlineBlankMarker(noteText))}>
                    Clear blank
                  </button>
                ) : null}
              </div>

              <span
                className={blankPresent
                  ? 'reading-v2-note-editor__blank-state'
                  : 'reading-v2-note-editor__blank-state reading-v2-note-editor__blank-state--missing'}
              >
                {blankPresent ? `Blank in note: Q${questionNumber}` : 'No blank in note'}
              </span>

              {!blankPresent ? (
                <p className="reading-v2-task-editor__error">Insert the blank into this note.</p>
              ) : null}

              <label className="reading-v2-note-editor__answer">
                Accepted answers
                <input
                  aria-label={`Accepted answers for Question ${questionNumber}`}
                  data-answer-state={answerComplete && !wordLimitExceeded ? 'complete' : 'missing'}
                  placeholder="Use | for alternatives"
                  value={answerText}
                  onChange={(event) => onInteractionChange(setAnswerKey(interaction, parseAnswers(event.currentTarget.value)))}
                />
              </label>
              {wordLimitExceeded ? (
                <p className="reading-v2-task-editor__error">Word limit exceeded. Max {defaultWordLimit}.</p>
              ) : !answerComplete ? (
                <p className="reading-v2-task-editor__error">Add the answer for this blank.</p>
              ) : null}

              {pendingDeleteInteractionId === interaction.interactionId ? (
                <section className="reading-v2-build-confirm" role="alert">
                  <span>Delete Question {questionNumber}? This removes the note blank and answer key.</span>
                  <div className="reading-v2-studio__inline-actions">
                    <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteInteractionId(null)}>
                      Keep blank
                    </button>
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--danger"
                      type="button"
                      onClick={() => {
                        setPendingDeleteInteractionId(null);
                        onInteractionRemove(interaction.interactionId, taskGroup);
                      }}
                    >
                      Delete blank
                    </button>
                  </div>
                </section>
              ) : null}
            </fieldset>
            </Fragment>
          );
        })}
      </div>

      <button
        className="reading-v2-note-editor__add-row"
        type="button"
        onClick={() => onAddQuestion(taskGroup)}
      >
        Add note blank
      </button>
    </section>
  );
}

function MatchingTaskEditor({
  document,
  taskGroup,
  interactions,
  optionSet,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onOptionSetChange,
  onDocumentChange,
  onAddQuestion,
}: ReadingV2TaskEditorRendererProps) {
  const optionReuse = taskGroup.answerRule.optionReuse
    ?? (taskGroup.officialTaskType === 'matching-headings' || taskGroup.officialTaskType === 'matching-sentence-endings'
      ? 'disallowed'
      : 'allowed');
  const splitOptionBankFromQuestions = taskGroup.officialTaskType === 'matching-features'
    || taskGroup.officialTaskType === 'matching-sentence-endings';
  const matchingLabels = (() => {
    switch (taskGroup.officialTaskType) {
      case 'matching-headings':
        return {
          sourceLabel: 'Paragraph or section',
          sourcePlaceholder: 'Leave empty for distractor heading',
          reuseLabel: 'Reuse headings',
          questionSectionLabel: 'Paragraphs or sections',
          promptLabel: 'Paragraph or section',
          promptPlaceholder: 'Paragraph A, Section B, or the passage row to match',
          answerLabel: 'Correct heading',
          addQuestionLabel: 'Add paragraph row',
        };
      case 'matching-information':
        return {
          sourceLabel: 'Information statements',
          sourcePlaceholder: 'One statement per line. Empty means unused paragraph.',
          reuseLabel: 'Reuse paragraphs',
          questionSectionLabel: 'Information statements',
          promptLabel: 'Information statement',
          promptPlaceholder: 'Statement from the question list',
          answerLabel: 'Correct paragraph',
          addQuestionLabel: 'Add statement',
        };
      case 'matching-features':
        return {
          sourceLabel: 'Feature statements',
          sourcePlaceholder: 'One statement per line. Empty means unused feature.',
          reuseLabel: 'Reuse features',
          questionSectionLabel: 'Feature statements',
          promptLabel: 'Statement',
          promptPlaceholder: 'Statement that must be matched to a feature',
          answerLabel: 'Correct feature',
          addQuestionLabel: 'Add statement',
        };
      case 'matching-sentence-endings':
        return {
          sourceLabel: 'Sentence beginning',
          sourcePlaceholder: 'Leave empty for distractor ending',
          reuseLabel: 'Reuse endings',
          questionSectionLabel: 'Sentence beginnings',
          promptLabel: 'Sentence beginning',
          promptPlaceholder: 'Sentence beginning from the question list',
          answerLabel: 'Correct ending',
          addQuestionLabel: 'Add sentence beginning',
        };
      default:
        return {
          sourceLabel: 'Statement',
          sourcePlaceholder: 'Leave empty for distractor option',
          reuseLabel: 'Reuse options',
          questionSectionLabel: 'Questions',
          promptLabel: 'Prompt',
          promptPlaceholder: 'Question prompt',
          answerLabel: 'Correct option',
          addQuestionLabel: 'Add row',
        };
    }
  })();

  const updateReuse = (nextReuse: 'allowed' | 'disallowed') => {
    onTaskGroupChange({
      ...taskGroup,
      answerRule: {
        ...taskGroup.answerRule,
        optionReuse: nextReuse,
        responseShape: taskGroup.answerRule.responseShape.kind === 'matching'
          ? {
              ...taskGroup.answerRule.responseShape,
              optionReuse: nextReuse,
            }
          : taskGroup.answerRule.responseShape,
      },
    });
    interactions.forEach((interaction) => {
      if (interaction.responseShape.kind === 'matching') {
        onInteractionChange({
          ...interaction,
          responseShape: {
            ...interaction.responseShape,
            optionReuse: nextReuse,
          },
        });
      }
    });
  };

  const getInteractionsForOption = (option: ReadingV2OptionSet['options'][number]): readonly ReadingV2Interaction[] =>
    interactions.filter((interaction) =>
      (interaction.scoringRule.acceptableAnswers ?? []).some((answer) => answerMatchesOption(answer, option)),
    );

  const getOptionSourceValue = (option: ReadingV2OptionSet['options'][number]): string =>
    getInteractionsForOption(option)
      .map((interaction) => interaction.promptText?.trim() ?? '')
      .filter(Boolean)
      .join(optionReuse === 'allowed' ? '\n' : ' ');

  const commitOptionSource = (option: ReadingV2OptionSet['options'][number], rawValue: string) => {
    if (!optionSet) {
      return;
    }

    const sourceLines = optionReuse === 'allowed'
      ? rawValue.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      : rawValue.trim()
        ? [rawValue.trim()]
        : [];
    const currentTaskGroup = document.taskGroups[taskGroup.taskGroupId] ?? taskGroup;
    const matchedInteractions = getInteractionsForOption(option);
    const matchedInteractionIds = new Set(matchedInteractions.map((interaction) => interaction.interactionId));
    const nextInteractions: Record<string, ReadingV2Interaction> = { ...document.interactions };
    let nextInteractionIds = [...currentTaskGroup.interactionIds];
    const reusableDraftInteractions = currentTaskGroup.interactionIds
      .map((interactionId) => nextInteractions[interactionId])
      .filter((interaction): interaction is ReadingV2Interaction => Boolean(interaction))
      .filter((interaction) => !matchedInteractionIds.has(interaction.interactionId))
      .filter((interaction) => (interaction.scoringRule.acceptableAnswers ?? []).every((answer) => !answer.trim()))
      .filter((interaction) => interaction.placeholder === true || !(interaction.promptText ?? '').trim());
    const responseShape = {
      kind: 'matching',
      optionSetId: optionSet.optionSetId,
      optionReuse,
    } satisfies ReadingV2Interaction['responseShape'];

    sourceLines.forEach((sourceText, sourceIndex) => {
      const existingInteraction = matchedInteractions[sourceIndex] ?? reusableDraftInteractions.shift();

      if (existingInteraction) {
        nextInteractions[existingInteraction.interactionId] = {
          ...existingInteraction,
          promptText: sourceText,
          placeholder: false,
          responseShape,
          scoringRule: {
            ...existingInteraction.scoringRule,
            maxScore: existingInteraction.scoringRule.maxScore ?? 1,
            acceptableAnswers: [option.label],
          },
        };
        return;
      }

      const tempTaskGroup = {
        ...currentTaskGroup,
        interactionIds: nextInteractionIds,
      };
      const tempDocument = {
        ...document,
        interactions: nextInteractions,
        taskGroups: {
          ...document.taskGroups,
          [tempTaskGroup.taskGroupId]: tempTaskGroup,
        },
      };
      const interactionId = createUniqueInteractionId(tempDocument, tempTaskGroup);
      nextInteractions[interactionId] = {
        interactionId,
        taskGroupId: currentTaskGroup.taskGroupId,
        responseShape,
        scoringRule: {
          maxScore: 1,
          acceptableAnswers: [option.label],
        },
        reviewLabel: {},
        promptText: sourceText,
        placeholder: false,
      };
      nextInteractionIds = [...nextInteractionIds, interactionId];
    });

    matchedInteractions.slice(sourceLines.length).forEach((interaction) => {
      delete nextInteractions[interaction.interactionId];
      nextInteractionIds = nextInteractionIds.filter((interactionId) => interactionId !== interaction.interactionId);
    });

    const nextTaskGroup = {
      ...currentTaskGroup,
      interactionIds: nextInteractionIds,
      optionSetRefs: currentTaskGroup.optionSetRefs.includes(optionSet.optionSetId)
        ? currentTaskGroup.optionSetRefs
        : [...currentTaskGroup.optionSetRefs, optionSet.optionSetId],
      answerRule: {
        ...currentTaskGroup.answerRule,
        optionReuse,
        responseShape: currentTaskGroup.answerRule.responseShape.kind === 'matching'
          ? {
              ...currentTaskGroup.answerRule.responseShape,
              optionSetId: optionSet.optionSetId,
              optionReuse,
            }
          : currentTaskGroup.answerRule.responseShape,
      },
    };

    onDocumentChange({
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [nextTaskGroup.taskGroupId]: nextTaskGroup,
      },
      interactions: nextInteractions,
    });
  };

  const removeMatchingOption = (option: ReadingV2OptionSet['options'][number]) => {
    if (!optionSet) {
      return;
    }

    const removableInteractionIds = new Set(getInteractionsForOption(option).map((interaction) => interaction.interactionId));
    const currentTaskGroup = document.taskGroups[taskGroup.taskGroupId] ?? taskGroup;
    const nextInteractions: Record<string, ReadingV2Interaction> = { ...document.interactions };
    removableInteractionIds.forEach((interactionId) => {
      delete nextInteractions[interactionId];
    });
    const nextOptionSet = removeOptionFromSet(optionSet, option.optionId);
    const nextTaskGroup = {
      ...currentTaskGroup,
      interactionIds: currentTaskGroup.interactionIds.filter((interactionId) => !removableInteractionIds.has(interactionId)),
    };

    onDocumentChange({
      ...document,
      optionSets: {
        ...document.optionSets,
        [nextOptionSet.optionSetId]: nextOptionSet,
      },
      taskGroups: {
        ...document.taskGroups,
        [nextTaskGroup.taskGroupId]: nextTaskGroup,
      },
      interactions: nextInteractions,
    });
  };

  const getSelectedOptionLabel = (interaction: ReadingV2Interaction): string => {
    const selectedAnswer = interaction.scoringRule.acceptableAnswers?.[0] ?? '';
    if (!optionSet || !selectedAnswer) {
      return selectedAnswer;
    }

    return findSelectedOptionLabel(selectedAnswer, optionSet);
  };

  const selectMatchingAnswer = (interaction: ReadingV2Interaction, optionLabel: string) => {
    onInteractionChange(setAnswerKey(interaction, optionLabel ? [optionLabel] : []));

    if (optionReuse === 'disallowed' && optionLabel) {
      interactions
        .filter((candidate) => candidate.interactionId !== interaction.interactionId)
        .filter((candidate) => (candidate.scoringRule.acceptableAnswers ?? []).includes(optionLabel))
        .forEach((candidate) => onInteractionChange(setAnswerKey(candidate, [])));
    }
  };

  return (
    <section className="reading-v2-matching-editor" aria-label={`${TASK_TYPE_LABELS[taskGroup.officialTaskType]} dedicated editor`}>
      {optionSet ? (
        <OptionListEditor
          taskGroup={taskGroup}
          optionSet={optionSet}
          interactions={interactions}
          numberByInteractionId={numberByInteractionId}
          optionSourceLabel={matchingLabels.sourceLabel}
          optionSourceMode={optionReuse === 'allowed' ? 'multiple' : 'single'}
          optionSourcePlaceholder={matchingLabels.sourcePlaceholder}
          getOptionSourceValue={splitOptionBankFromQuestions ? undefined : getOptionSourceValue}
          onOptionSourceChange={splitOptionBankFromQuestions ? undefined : commitOptionSource}
          onOptionRemove={splitOptionBankFromQuestions ? undefined : removeMatchingOption}
          onOptionSetChange={onOptionSetChange}
          onInteractionChange={onInteractionChange}
        />
      ) : (
        <section className="reading-v2-build-inline-check reading-v2-build-inline-check--warning">
          <span>This matching task needs an option bank.</span>
          <button
            className="reading-v2-studio__button reading-v2-studio__button--quiet"
            type="button"
            onClick={() => {
              const nextOptionSet = createOptionSet(taskGroup, taskGroup.officialTaskType);
              onOptionSetChange(nextOptionSet);
              onTaskGroupChange(withTaskGroupOptionSetRef(taskGroup, nextOptionSet.optionSetId));
            }}
          >
            Add option bank
          </button>
        </section>
      )}

      <div className="reading-v2-matching-editor__reuse" aria-label="Option reuse">
        <span>{matchingLabels.reuseLabel}</span>
        {(['allowed', 'disallowed'] as const).map((reuse) => (
          <button
            className="reading-v2-judgement-editor__segment"
            data-selected={optionReuse === reuse ? 'true' : 'false'}
            key={reuse}
            type="button"
            aria-pressed={optionReuse === reuse}
            onClick={() => updateReuse(reuse)}
          >
            {reuse === 'allowed' ? 'Allowed' : 'No reuse'}
          </button>
        ))}
      </div>

      {splitOptionBankFromQuestions && optionSet ? (
        <section className="reading-v2-matching-editor__mapping" aria-label={`${matchingLabels.questionSectionLabel} for ${TASK_TYPE_LABELS[taskGroup.officialTaskType]}`}>
          <div className="reading-v2-build-card__section-heading">
            <h4>{matchingLabels.questionSectionLabel}</h4>
            <button
              className="reading-v2-studio__button reading-v2-studio__button--quiet"
              type="button"
              onClick={() => onAddQuestion(taskGroup)}
            >
              {matchingLabels.addQuestionLabel}
            </button>
          </div>
          <div className="reading-v2-matching-editor__rows">
            {interactions.map((interaction, interactionIndex) => {
              const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
              const selectedOptionLabel = getSelectedOptionLabel(interaction);
              const promptMissing = !(interaction.promptText ?? '').trim();
              const answerMissing = !selectedOptionLabel.trim()
                || !optionSet.options.some((option) => answerMatchesOption(selectedOptionLabel, option));
              const rowNeedsAttention = promptMissing || answerMissing;

              return (
                <fieldset
                  className="reading-v2-matching-editor__row reading-v2-matching-editor__row--mapped"
                  data-needs-attention={rowNeedsAttention ? 'true' : 'false'}
                  key={interaction.interactionId}
                >
                  <legend>Question {questionNumber}</legend>
                  <button
                    className="reading-v2-build__icon-button reading-v2-matching-editor__row-delete"
                    type="button"
                    aria-label={`Delete Question ${questionNumber}`}
                    onClick={() => onInteractionRemove(interaction.interactionId, taskGroup)}
                  >
                    <IconX aria-hidden="true" size={16} stroke={2} />
                  </button>
                  <label className="reading-v2-matching-editor__prompt-field">
                    {matchingLabels.promptLabel}
                    <textarea
                      aria-label={`${matchingLabels.promptLabel} for Question ${questionNumber}`}
                      rows={2}
                      placeholder={matchingLabels.promptPlaceholder}
                      value={interaction.promptText ?? ''}
                      onChange={(event) =>
                        onInteractionChange({
                          ...interaction,
                          promptText: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                  <label className="reading-v2-matching-editor__answer-select">
                    <span>{matchingLabels.answerLabel}</span>
                    <select
                      aria-label={`Correct match for Question ${questionNumber}`}
                      data-answer-state={answerMissing ? 'missing' : 'complete'}
                      value={selectedOptionLabel}
                      onChange={(event) => selectMatchingAnswer(interaction, event.currentTarget.value)}
                    >
                      <option value="">Choose match</option>
                      {optionSet.options.map((option) => {
                        const usedElsewhere = optionReuse === 'disallowed'
                          && interactions.some((candidate) =>
                            candidate.interactionId !== interaction.interactionId
                            && (candidate.scoringRule.acceptableAnswers ?? []).some((answer) => answerMatchesOption(answer, option)),
                          );

                        return (
                          <option key={option.optionId} value={option.label} disabled={usedElsewhere}>
                            {option.text.trim() ? `${option.label} - ${option.text}` : option.label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </fieldset>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}

type FlowchartStimulus = ReadingV2StimulusNode & {
  readonly content: Extract<ReadingV2StimulusNode['content'], { readonly kind: 'flowchart-content' }>;
};

type DiagramStimulus = ReadingV2StimulusNode & {
  readonly content: Extract<ReadingV2StimulusNode['content'], { readonly kind: 'diagram-content' }>;
};

const isFlowchartStimulus = (stimulus: ReadingV2StimulusNode | undefined): stimulus is FlowchartStimulus =>
  stimulus?.content.kind === 'flowchart-content';

const isDiagramStimulus = (stimulus: ReadingV2StimulusNode | undefined): stimulus is DiagramStimulus =>
  stimulus?.content.kind === 'diagram-content';

type MediaStimulus = ReadingV2StimulusNode & {
  readonly content: Extract<ReadingV2StimulusNode['content'], { readonly kind: 'media-content' }>;
};

const isMediaStimulus = (stimulus: ReadingV2StimulusNode | undefined): stimulus is MediaStimulus =>
  stimulus?.content.kind === 'media-content';

const getFlowchartStimulus = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): FlowchartStimulus | undefined =>
  taskGroup.stimulusRefs
    .map((stimulusRef) => document.stimuli[stimulusRef.stimulusId])
    .find(isFlowchartStimulus);

const getDiagramStimulus = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): DiagramStimulus | undefined =>
  taskGroup.stimulusRefs
    .map((stimulusRef) => document.stimuli[stimulusRef.stimulusId])
    .find(isDiagramStimulus);

const findInteractionByAnchor = (
  interactions: readonly ReadingV2Interaction[],
  anchorId: string | undefined,
): ReadingV2Interaction | undefined =>
  anchorId
    ? interactions.find((interaction) => interaction.primaryAnchorId === anchorId)
    : undefined;

const replaceStimulus = (
  document: ReadingV2Document,
  stimulus: ReadingV2StimulusNode,
): ReadingV2Document => ({
  ...document,
  stimuli: {
    ...document.stimuli,
    [stimulus.stimulusId]: stimulus,
  },
});

const createUniqueAnchorId = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
  suffix: string,
): ReadingV2Anchor['anchorId'] => {
  const base = `${taskGroup.taskGroupId}-${suffix}`;
  let anchorId = readingV2Ids.anchorId(base);
  let index = 2;

  while (document.anchors[anchorId]) {
    anchorId = readingV2Ids.anchorId(`${base}-${index}`);
    index += 1;
  }

  return anchorId;
};

const createUniqueInteractionId = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): ReadingV2Interaction['interactionId'] => {
  const base = `${taskGroup.taskGroupId}-structured-question-${taskGroup.interactionIds.length + 1}`;
  let interactionId = readingV2Ids.interactionId(base);
  let index = 2;

  while (document.interactions[interactionId]) {
    interactionId = readingV2Ids.interactionId(`${base}-${index}`);
    index += 1;
  }

  return interactionId;
};

const addAnchorToTaskGroupRef = (
  taskGroup: ReadingV2TaskGroup,
  stimulus: ReadingV2StimulusNode,
  anchorId: ReadingV2Anchor['anchorId'],
): ReadingV2TaskGroup => ({
  ...taskGroup,
  stimulusRefs: taskGroup.stimulusRefs.map((stimulusRef) =>
    stimulusRef.stimulusId === stimulus.stimulusId
      ? {
          ...stimulusRef,
          anchorIds: [...new Set([...(stimulusRef.anchorIds ?? []), anchorId])],
        }
      : stimulusRef,
  ),
});

const removeAnchorFromTaskGroupRef = (
  taskGroup: ReadingV2TaskGroup,
  stimulus: ReadingV2StimulusNode,
  anchorId: string,
): ReadingV2TaskGroup => ({
  ...taskGroup,
  stimulusRefs: taskGroup.stimulusRefs.map((stimulusRef) =>
    stimulusRef.stimulusId === stimulus.stimulusId
      ? {
          ...stimulusRef,
          anchorIds: (stimulusRef.anchorIds ?? []).filter((currentAnchorId) => currentAnchorId !== anchorId),
        }
      : stimulusRef,
  ),
});

const addStructuredInteractionToDocument = (input: {
  readonly document: ReadingV2Document;
  readonly taskGroup: ReadingV2TaskGroup;
  readonly stimulus: ReadingV2StimulusNode;
  readonly anchor: ReadingV2Anchor;
  readonly promptText: string;
}): ReadingV2Document => {
  const existingInteraction = Object.values(input.document.interactions).find(
    (interaction) =>
      interaction.taskGroupId === input.taskGroup.taskGroupId
      && interaction.primaryAnchorId === input.anchor.anchorId,
  );

  if (existingInteraction) {
    return input.document;
  }

  const interactionId = createUniqueInteractionId(input.document, input.taskGroup);
  const currentTaskGroup = input.document.taskGroups[input.taskGroup.taskGroupId] ?? input.taskGroup;
  const taskType = currentTaskGroup.officialTaskType;
  const structure = taskType === 'flowchart-completion' ? 'flowchart' : 'diagram';
  const nextTaskGroup = addAnchorToTaskGroupRef(
    {
      ...currentTaskGroup,
      interactionIds: [...currentTaskGroup.interactionIds, interactionId],
    },
    input.stimulus,
    input.anchor.anchorId,
  );

  return {
    ...input.document,
    anchors: {
      ...input.document.anchors,
      [input.anchor.anchorId]: input.anchor,
    },
    taskGroups: {
      ...input.document.taskGroups,
      [nextTaskGroup.taskGroupId]: nextTaskGroup,
    },
    interactions: {
      ...input.document.interactions,
      [interactionId]: {
        interactionId,
        taskGroupId: currentTaskGroup.taskGroupId,
        responseShape: {
          kind: 'structured-entry',
          structure,
        },
        scoringRule: {
          maxScore: 1,
          acceptableAnswers: [],
        },
        reviewLabel: {},
        promptText: input.promptText,
        primaryAnchorId: input.anchor.anchorId,
        contextAnchorIds: [input.anchor.anchorId],
        placeholder: true,
      },
    },
  };
};

const updateInteractionPromptForAnchor = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
  anchorId: string | undefined,
  promptText: string,
): ReadingV2Document => {
  const interaction = Object.values(document.interactions).find(
    (candidate) =>
      candidate.taskGroupId === taskGroup.taskGroupId
      && candidate.primaryAnchorId === anchorId,
  );

  if (!interaction) {
    return document;
  }

  return {
    ...document,
    interactions: {
      ...document.interactions,
      [interaction.interactionId]: {
        ...interaction,
        promptText,
      },
    },
  };
};

const removeUnlinkedStructuredAnchor = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
  stimulus: ReadingV2StimulusNode,
  anchorId: string | undefined,
): ReadingV2Document => {
  if (!anchorId) {
    return document;
  }

  const nextAnchors = { ...document.anchors };
  delete nextAnchors[anchorId];
  const nextTaskGroup = removeAnchorFromTaskGroupRef(taskGroup, stimulus, anchorId);

  return {
    ...document,
    anchors: nextAnchors,
    taskGroups: {
      ...document.taskGroups,
      [nextTaskGroup.taskGroupId]: nextTaskGroup,
    },
    stimuli: {
      ...document.stimuli,
      [stimulus.stimulusId]: {
        ...stimulus,
        anchorIds: stimulus.anchorIds.filter((currentAnchorId) => currentAnchorId !== anchorId),
      },
    },
  };
};

const moveStructuredItem = <T,>(items: readonly T[], fromIndex: number, toIndex: number): readonly T[] => {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);

  if (item === undefined) {
    return items;
  }

  next.splice(toIndex, 0, item);
  return next;
};

function FlowchartTaskEditor({
  document,
  taskGroup,
  interactions,
  numberByInteractionId,
  selectedQuestionLink,
  onDocumentChange,
  onInteractionChange,
  onInteractionRemove,
  onQuestionLinkNavigation,
  onQuestionLinkRepair,
}: ReadingV2TaskEditorRendererProps) {
  const stimulus = getFlowchartStimulus(document, taskGroup);
  const [pendingDeleteStepId, setPendingDeleteStepId] = useState<string | null>(null);

  if (!stimulus) {
    return (
      <section className="reading-v2-build-inline-check reading-v2-build-inline-check--warning">
        <span>This Flowchart Completion group needs a flowchart shell before editing can continue.</span>
      </section>
    );
  }

  const commitStimulus = (nextStimulus: FlowchartStimulus) => {
    onDocumentChange(replaceStimulus(document, nextStimulus));
  };

  const updateStepText = (stepId: string, anchorId: string | undefined, text: string) => {
    const nextStimulus: FlowchartStimulus = {
      ...stimulus,
      content: {
        ...stimulus.content,
        steps: stimulus.content.steps.map((step) =>
          step.stepId === stepId
            ? {
                ...step,
                text,
              }
            : step,
        ),
      },
    };
    const nextDocument = updateInteractionPromptForAnchor(
      replaceStimulus(document, nextStimulus),
      taskGroup,
      anchorId,
      text,
    );
    onDocumentChange(nextDocument);
  };

  const markStepAsBlank = (stepId: string, stepIndex: number) => {
    const step = stimulus.content.steps.find((candidate) => candidate.stepId === stepId);
    if (!step) {
      return;
    }

    const anchorId = step.anchorId ?? createUniqueAnchorId(document, taskGroup, `flow-step-${stepIndex + 1}`);
    const anchor: ReadingV2Anchor = document.anchors[anchorId] ?? {
      anchorId,
      stimulusId: stimulus.stimulusId,
      kind: 'flow-step',
      label: `Flowchart step ${stepIndex + 1}`,
    };
    const nextStimulus: FlowchartStimulus = {
      ...stimulus,
      anchorIds: stimulus.anchorIds.includes(anchorId)
        ? stimulus.anchorIds
        : [...stimulus.anchorIds, anchorId],
      content: {
        ...stimulus.content,
        steps: stimulus.content.steps.map((current) =>
          current.stepId === stepId
            ? {
                ...current,
                anchorId,
              }
            : current,
        ),
      },
    };
    const nextDocument = addStructuredInteractionToDocument({
      document: replaceStimulus(document, nextStimulus),
      taskGroup,
      stimulus: nextStimulus,
      anchor,
      promptText: step.text.trim() || `Flowchart step ${stepIndex + 1}`,
    });
    onDocumentChange(nextDocument);
  };

  const addStep = () => {
    const nextIndex = stimulus.content.steps.length + 1;
    const stepId = `${taskGroup.taskGroupId}-flow-step-${nextIndex}`;
    const steps = stimulus.content.steps.map((step, index) =>
      index === stimulus.content.steps.length - 1
        ? {
            ...step,
            nextStepIds: [...new Set([...(step.nextStepIds ?? []), stepId])],
          }
        : step,
    );
    const nextStimulus: FlowchartStimulus = {
      ...stimulus,
      content: {
        ...stimulus.content,
        steps: [
          ...steps,
          {
            stepId,
            text: `Step ${nextIndex}`,
          },
        ],
      },
    };
    commitStimulus(nextStimulus);
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    const nextStimulus: FlowchartStimulus = {
      ...stimulus,
      content: {
        ...stimulus.content,
        steps: moveStructuredItem(stimulus.content.steps, fromIndex, toIndex),
      },
    };
    commitStimulus(nextStimulus);
  };

  const removeStep = (stepId: string) => {
    const step = stimulus.content.steps.find((candidate) => candidate.stepId === stepId);
    const linkedInteraction = findInteractionByAnchor(interactions, step?.anchorId);

    if (linkedInteraction) {
      onInteractionRemove(linkedInteraction.interactionId, taskGroup);
      return;
    }

    const nextStimulus: FlowchartStimulus = {
      ...stimulus,
      content: {
        ...stimulus.content,
        steps: stimulus.content.steps
          .filter((current) => current.stepId !== stepId)
          .map((current) => ({
            ...current,
            nextStepIds: current.nextStepIds?.filter((nextStepId) => nextStepId !== stepId),
          })),
      },
    };
    onDocumentChange(removeUnlinkedStructuredAnchor(
      replaceStimulus(document, nextStimulus),
      taskGroup,
      nextStimulus,
      step?.anchorId,
    ));
  };

  return (
    <section className="reading-v2-flowchart-editor" aria-label="Flowchart Completion dedicated editor">
      <label>
        Title
        <input
          aria-label="Flowchart title"
          value={stimulus.title ?? ''}
          onChange={(event) =>
            commitStimulus({
              ...stimulus,
              title: event.currentTarget.value,
            })
          }
        />
      </label>

      <section className="reading-v2-flowchart-editor__canvas" aria-label="Flowchart steps">
        {stimulus.content.steps.map((step, stepIndex) => {
          const interaction = findInteractionByAnchor(interactions, step.anchorId);
          const questionNumber = interaction
            ? numberByInteractionId.get(interaction.interactionId) ?? stepIndex + 1
            : undefined;
          const answerComplete = interaction
            ? (interaction.scoringRule.acceptableAnswers ?? []).some((answer) => answer.trim().length > 0)
            : true;
          const linkedSelected = selectedQuestionLink?.anchorId === step.anchorId
            || selectedQuestionLink?.interactionId === interaction?.interactionId;

          return (
            <div className="reading-v2-flowchart-editor__step-wrap" key={step.stepId}>
              <section
                className="reading-v2-flowchart-editor__step"
                data-blank={interaction ? 'true' : 'false'}
                data-linked-selected={linkedSelected ? 'true' : 'false'}
                data-needs-attention={!answerComplete ? 'true' : 'false'}
                aria-label={`Flowchart step ${stepIndex + 1}`}
              >
                <span className="reading-v2-flowchart-editor__drag" aria-hidden="true">::</span>
                {interaction ? (
                  <span className="reading-v2-flowchart-editor__blank-marker">[{questionNumber}]</span>
                ) : null}
                <input
                  aria-label={`Flowchart step ${stepIndex + 1} text`}
                  value={step.text}
                  onChange={(event) => updateStepText(step.stepId, step.anchorId, event.currentTarget.value)}
                />
                <div className="reading-v2-flowchart-editor__step-actions">
                  <button
                    className="reading-v2-build__icon-button"
                    type="button"
                    disabled={stepIndex === 0}
                    aria-label={`Move flowchart step ${stepIndex + 1} up`}
                    onClick={() => moveStep(stepIndex, stepIndex - 1)}
                  >
                    Up
                  </button>
                  <button
                    className="reading-v2-build__icon-button"
                    type="button"
                    disabled={stepIndex === stimulus.content.steps.length - 1}
                    aria-label={`Move flowchart step ${stepIndex + 1} down`}
                    onClick={() => moveStep(stepIndex, stepIndex + 1)}
                  >
                    Down
                  </button>
                  {interaction ? null : (
                    <button
                      className="reading-v2-build__icon-button"
                      type="button"
                      onClick={() => {
                        markStepAsBlank(step.stepId, stepIndex);
                        onQuestionLinkRepair?.('flow-step-linked-question-created', {
                          taskGroupId: taskGroup.taskGroupId,
                          stepId: step.stepId,
                          stepNumber: stepIndex + 1,
                        });
                      }}
                    >
                      Mark as Blank
                    </button>
                  )}
                  {interaction ? (
                    <button
                      className="reading-v2-build__icon-button"
                      type="button"
                      onClick={() => onQuestionLinkNavigation?.({
                        anchorId: step.anchorId,
                        interactionId: interaction.interactionId,
                        taskGroupId: taskGroup.taskGroupId,
                        source: 'block',
                      })}
                    >
                      Reveal question
                    </button>
                  ) : null}
                  <button
                    className="reading-v2-build__icon-button"
                    type="button"
                    onClick={() => setPendingDeleteStepId(step.stepId)}
                  >
                    Remove Step
                  </button>
                </div>
              </section>
              {stepIndex < stimulus.content.steps.length - 1 ? (
                <span className="reading-v2-flowchart-editor__arrow" aria-hidden="true" />
              ) : null}

              {pendingDeleteStepId === step.stepId ? (
                <section className="reading-v2-build-confirm" role="alert">
                  <span>Remove flowchart step {stepIndex + 1}? Linked answer blanks will be removed too.</span>
                  <div className="reading-v2-studio__inline-actions">
                    <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setPendingDeleteStepId(null)}>
                      Keep step
                    </button>
                    <button
                      className="reading-v2-studio__button reading-v2-studio__button--danger"
                      type="button"
                      onClick={() => {
                        setPendingDeleteStepId(null);
                        removeStep(step.stepId);
                      }}
                    >
                      Remove step
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          );
        })}

        <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={addStep}>
          Add Step
        </button>
      </section>

      <section className="reading-v2-flowchart-editor__answer-key" aria-label="Flowchart answer key">
        <h4>Answer Key</h4>
        {interactions.map((interaction, interactionIndex) => {
          const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
          const answers = interaction.scoringRule.acceptableAnswers ?? [];
          const answerComplete = answers.some((answer) => answer.trim().length > 0);

          return (
            <label
              className="reading-v2-flowchart-editor__answer-row"
              data-linked-selected={selectedQuestionLink?.interactionId === interaction.interactionId ? 'true' : 'false'}
              key={interaction.interactionId}
            >
              <span>{questionNumber}</span>
              <input
                aria-label={`Flowchart answer for Question ${questionNumber}`}
                data-answer-state={answerComplete ? 'complete' : 'missing'}
                placeholder="Correct answer"
                value={formatAnswers(answers)}
                onChange={(event) => onInteractionChange(setAnswerKey(interaction, parseAnswers(event.currentTarget.value)))}
              />
            </label>
          );
        })}
      </section>
    </section>
  );
}

function DiagramLabelingTaskEditor({
  document,
  taskGroup,
  interactions,
  numberByInteractionId,
  selectedQuestionLink,
  onDocumentChange,
  onInteractionChange,
  onInteractionRemove,
  onQuestionLinkNavigation,
  onQuestionLinkRepair,
}: ReadingV2TaskEditorRendererProps) {
  const stimulus = getDiagramStimulus(document, taskGroup);
  const [imageSourceMode, setImageSourceMode] = useState<'url' | 'upload'>(() =>
    stimulus?.content.imageUrl?.startsWith('data:') ? 'upload' : 'url',
  );

  if (!stimulus) {
    return (
      <section className="reading-v2-build-inline-check reading-v2-build-inline-check--warning">
        <span>This Diagram Labelling group needs a diagram shell before editing can continue.</span>
      </section>
    );
  }

  const commitStimulus = (nextStimulus: DiagramStimulus) => {
    onDocumentChange(replaceStimulus(document, nextStimulus));
  };

  const addLabel = () => {
    const nextIndex = stimulus.content.hotspots.length + 1;
    const anchorId = createUniqueAnchorId(document, taskGroup, `diagram-hotspot-${nextIndex}`);
    const anchor: ReadingV2Anchor = {
      anchorId,
      stimulusId: stimulus.stimulusId,
      kind: 'diagram-hotspot',
      label: `Diagram answer ${nextIndex}`,
    };
    const nextStimulus: DiagramStimulus = {
      ...stimulus,
      anchorIds: [...stimulus.anchorIds, anchorId],
      content: {
        ...stimulus.content,
        hotspots: [
          ...stimulus.content.hotspots,
          {
            anchorId,
            label: `Question ${nextIndex}`,
            xPercent: 50,
            yPercent: 50,
          },
        ],
      },
    };
    const nextDocument = addStructuredInteractionToDocument({
      document: replaceStimulus(document, nextStimulus),
      taskGroup,
      stimulus: nextStimulus,
      anchor,
      promptText: `Question ${nextIndex}`,
    });
    onDocumentChange(nextDocument);
  };

  const removeLabel = (anchorId: string) => {
    const linkedInteraction = findInteractionByAnchor(interactions, anchorId);
    if (linkedInteraction) {
      onInteractionRemove(linkedInteraction.interactionId, taskGroup);
      return;
    }

    const nextStimulus: DiagramStimulus = {
      ...stimulus,
      content: {
        ...stimulus.content,
        hotspots: stimulus.content.hotspots.filter((hotspot) => hotspot.anchorId !== anchorId),
      },
    };
    onDocumentChange(removeUnlinkedStructuredAnchor(
      replaceStimulus(document, nextStimulus),
      taskGroup,
      nextStimulus,
      anchorId,
    ));
  };

  const handleDiagramFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        commitStimulus({
          ...stimulus,
          content: {
            ...stimulus.content,
            imageUrl: reader.result,
          },
        });
      }
    });
    reader.readAsDataURL(file);
  };

  const imagePresent = Boolean(stimulus.content.imageUrl?.trim());

  return (
    <section className="reading-v2-diagram-editor" aria-label="Diagram Labelling dedicated editor">
      <label>
        Diagram title
        <input
          aria-label="Diagram title"
          value={stimulus.title ?? ''}
          onChange={(event) =>
            commitStimulus({
              ...stimulus,
              title: event.currentTarget.value,
            })
          }
        />
      </label>

      <section className="reading-v2-diagram-editor__source" aria-label="Diagram image source">
        <div className="reading-v2-diagram-editor__source-header">
          <h4>Diagram image</h4>
          <div className="reading-v2-diagram-editor__source-toggle" role="group" aria-label="Choose diagram image source">
            <button
              type="button"
              aria-pressed={imageSourceMode === 'url'}
              data-selected={imageSourceMode === 'url' ? 'true' : 'false'}
              onClick={() => setImageSourceMode('url')}
            >
              Use URL
            </button>
            <button
              type="button"
              aria-pressed={imageSourceMode === 'upload'}
              data-selected={imageSourceMode === 'upload' ? 'true' : 'false'}
              onClick={() => setImageSourceMode('upload')}
            >
              Upload file
            </button>
          </div>
        </div>

        {imageSourceMode === 'url' ? (
          <label key="diagram-image-url-source">
            Diagram image URL
            <input
              aria-label="Diagram image URL"
              placeholder="https://..."
              value={stimulus.content.imageUrl ?? ''}
              onChange={(event) =>
                commitStimulus({
                  ...stimulus,
                  content: {
                    ...stimulus.content,
                    imageUrl: event.currentTarget.value,
                  },
                })
              }
            />
          </label>
        ) : (
          <label key="diagram-image-upload-source" className="reading-v2-diagram-editor__upload-field">
            Diagram image file
            <input
              aria-label="Diagram image file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => handleDiagramFile(event.currentTarget.files?.[0])}
            />
            <span>PNG, JPG, or WebP stored with this draft.</span>
          </label>
        )}
      </section>

      {!imagePresent ? (
        <section className="reading-v2-task-editor__error" role="alert">
          Image required for diagram labelling question type.
        </section>
      ) : null}

      <section className="reading-v2-diagram-editor__canvas" aria-label="Diagram image preview">
        {imagePresent ? (
          <img src={stimulus.content.imageUrl} alt={stimulus.title?.trim() || 'Diagram for labelling'} />
        ) : (
          <div className="reading-v2-diagram-editor__empty-visual" aria-hidden="true">
            <span />
          </div>
        )}
      </section>

      <section className="reading-v2-diagram-editor__labels" aria-label="Diagram answer key">
        <div className="reading-v2-diagram-editor__labels-header">
          <h4>Answer Key</h4>
          <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={addLabel}>
            Add answer field
          </button>
        </div>
        {stimulus.content.hotspots.map((hotspot, hotspotIndex) => {
          const interaction = findInteractionByAnchor(interactions, hotspot.anchorId);
          const questionNumber = interaction
            ? numberByInteractionId.get(interaction.interactionId) ?? hotspotIndex + 1
            : hotspotIndex + 1;
          const answers = interaction?.scoringRule.acceptableAnswers ?? [];
          const answerComplete = answers.some((answer) => answer.trim().length > 0);
          const linkedSelected = selectedQuestionLink?.anchorId === hotspot.anchorId
            || selectedQuestionLink?.interactionId === interaction?.interactionId;

          return (
            <section
              className="reading-v2-diagram-editor__label-row"
              data-linked-selected={linkedSelected ? 'true' : 'false'}
              data-needs-attention={!answerComplete ? 'true' : 'false'}
              key={hotspot.anchorId}
            >
              <span className="reading-v2-diagram-editor__label-number">{questionNumber}</span>
              <div className="reading-v2-diagram-editor__label-fields">
                {interaction ? (
                  <label>
                    Accepted answers
                    <input
                      aria-label={`Diagram answer for Question ${questionNumber}`}
                      data-answer-state={answerComplete ? 'complete' : 'missing'}
                      placeholder="Correct answer"
                      value={formatAnswers(answers)}
                      onChange={(event) => onInteractionChange(setAnswerKey(interaction, parseAnswers(event.currentTarget.value)))}
                    />
                  </label>
                ) : (
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--quiet"
                    type="button"
                    onClick={() => {
                      const anchor: ReadingV2Anchor = document.anchors[hotspot.anchorId] ?? {
                        anchorId: hotspot.anchorId,
                        stimulusId: stimulus.stimulusId,
                        kind: 'diagram-hotspot',
                        label: `Diagram answer ${questionNumber}`,
                      };
                      onDocumentChange(addStructuredInteractionToDocument({
                        document,
                        taskGroup,
                        stimulus,
                        anchor,
                        promptText: `Question ${questionNumber}`,
                      }));
                      onQuestionLinkRepair?.('diagram-target-linked-question-created', {
                        anchorId: hotspot.anchorId,
                        taskGroupId: taskGroup.taskGroupId,
                      });
                      onQuestionLinkNavigation?.({
                        anchorId: hotspot.anchorId,
                        taskGroupId: taskGroup.taskGroupId,
                        source: 'repair',
                      });
                    }}
                  >
                    Create answer key
                  </button>
                )}
              </div>
              {interaction ? (
                <button
                  className="reading-v2-build__icon-button"
                  type="button"
                  onClick={() => onQuestionLinkNavigation?.({
                    anchorId: hotspot.anchorId,
                    interactionId: interaction.interactionId,
                    taskGroupId: taskGroup.taskGroupId,
                    source: 'block',
                  })}
                >
                  Reveal
                </button>
              ) : null}
              <button
                className="reading-v2-build__icon-button"
                type="button"
                aria-label={`Delete answer field for Question ${questionNumber}`}
                onClick={() => removeLabel(hotspot.anchorId)}
              >
                Delete
              </button>
            </section>
          );
        })}
      </section>
    </section>
  );
}

interface ReadingV2TaskEditorDefinition {
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly designFolder: string;
  readonly status: 'active' | 'inactive';
  readonly blocker?: string;
  readonly render: (props: ReadingV2TaskEditorRendererProps) => ReactNode;
}

export const renderStandardTaskEditor = ({
  taskGroup,
  interactions,
  optionSet,
  numberByInteractionId,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onOptionSetChange,
  onAddQuestion,
}: ReadingV2TaskEditorRendererProps): ReactNode => (
  <>
    {usesOptions(taskGroup.officialTaskType) && optionSet ? (
      <OptionListEditor
        taskGroup={taskGroup}
        optionSet={optionSet}
        onOptionSetChange={onOptionSetChange}
      />
    ) : null}

    {usesOptions(taskGroup.officialTaskType) && !optionSet ? (
      <section className="reading-v2-build-card__section">
        <h4>{getOptionListHeading(taskGroup.officialTaskType)}</h4>
        <p className="reading-v2-studio__muted">This question group needs an option list before it can be finished.</p>
        <button
          className="reading-v2-studio__button"
          type="button"
          onClick={() => {
            const nextOptionSet = createOptionSet(taskGroup, taskGroup.officialTaskType);
            onOptionSetChange(nextOptionSet);
            onTaskGroupChange({
              ...taskGroup,
              optionSetRefs: taskGroup.optionSetRefs.includes(nextOptionSet.optionSetId)
                ? taskGroup.optionSetRefs
                : [...taskGroup.optionSetRefs, nextOptionSet.optionSetId],
            });
          }}
        >
          Add option list
        </button>
      </section>
    ) : null}

    <QuestionRows
      taskGroup={taskGroup}
      interactions={interactions}
      optionSet={optionSet}
      numberByInteractionId={numberByInteractionId}
      onTaskGroupChange={onTaskGroupChange}
      onInteractionChange={onInteractionChange}
      onInteractionRemove={onInteractionRemove}
    />
    <button
      className="reading-v2-studio__button reading-v2-studio__button--quiet"
      type="button"
      onClick={() => onAddQuestion(taskGroup)}
    >
      Add Question to Group
    </button>
  </>
);

const renderChoiceTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <ChoiceTaskEditor {...props} />
);

const renderShortAnswerTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <ShortAnswerTaskEditor {...props} />
);

const renderJudgementTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <JudgementTaskEditor {...props} />
);

const renderCompletionTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <CompletionTaskEditor {...props} />
);

const renderNoteCompletionTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <NoteCompletionTaskEditor {...props} />
);

const renderMatchingTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <MatchingTaskEditor {...props} />
);

const renderTableCompletionTaskEditor = ({
  document,
  taskGroup,
  interactions,
  authoringNumbers,
  selectedQuestionLink,
  onDocumentChange,
  onTableCompletionAction,
  reviewIssues,
  focusedIssueQuestion,
  onReviewIssueActivate,
  onQuestionLinkNavigation,
  onQuestionLinkRepair,
}: ReadingV2TaskEditorRendererProps): ReactNode => (
  <ReadingV2TableCompletionBuilder
    document={document}
    taskGroup={taskGroup}
    interactions={interactions}
    visibleNumbers={authoringNumbers}
    selectedLinkAnchorId={selectedQuestionLink?.anchorId}
    onDocumentChange={onDocumentChange}
    onTableCompletionAction={onTableCompletionAction}
    onQuestionLinkNavigation={onQuestionLinkNavigation}
    onQuestionLinkRepair={onQuestionLinkRepair}
  />
);

const renderFlowchartTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <FlowchartTaskEditor {...props} />
);

const renderDiagramLabelingTaskEditor = (props: ReadingV2TaskEditorRendererProps): ReactNode => (
  <DiagramLabelingTaskEditor {...props} />
);

export const ReadingV2TaskEditorRegistry: Readonly<Record<ReadingV2CanonicalTaskType, ReadingV2TaskEditorDefinition>> = {
  'multiple-choice': {
    taskType: 'multiple-choice',
    designFolder: 'ielts_choice_short_answer_editors',
    status: 'active',
    render: renderChoiceTaskEditor,
  },
  'sentence-completion': {
    taskType: 'sentence-completion',
    designFolder: 'ielts_sentence_summary_completion_editors',
    status: 'active',
    render: renderCompletionTaskEditor,
  },
  'matching-headings': {
    taskType: 'matching-headings',
    designFolder: 'ielts_matching_headings_information_editors',
    status: 'active',
    render: renderMatchingTaskEditor,
  },
  'true-false-not-given': {
    taskType: 'true-false-not-given',
    designFolder: 'ielts_judgement_task_editors',
    status: 'active',
    render: renderJudgementTaskEditor,
  },
  'summary-completion-list': {
    taskType: 'summary-completion-list',
    designFolder: 'ielts_list_summary_note_completion_editors',
    status: 'active',
    render: renderCompletionTaskEditor,
  },
  'yes-no-not-given': {
    taskType: 'yes-no-not-given',
    designFolder: 'ielts_judgement_task_editors',
    status: 'active',
    render: renderJudgementTaskEditor,
  },
  'summary-completion-text': {
    taskType: 'summary-completion-text',
    designFolder: 'ielts_sentence_summary_completion_editors',
    status: 'active',
    render: renderCompletionTaskEditor,
  },
  'note-completion': {
    taskType: 'note-completion',
    designFolder: 'ielts_list_summary_note_completion_editors',
    status: 'active',
    render: renderNoteCompletionTaskEditor,
  },
  'matching-information': {
    taskType: 'matching-information',
    designFolder: 'ielts_matching_headings_information_editors',
    status: 'active',
    render: renderMatchingTaskEditor,
  },
  'matching-features': {
    taskType: 'matching-features',
    designFolder: 'ielts_matching_features_endings_editors',
    status: 'active',
    render: renderMatchingTaskEditor,
  },
  'matching-sentence-endings': {
    taskType: 'matching-sentence-endings',
    designFolder: 'ielts_matching_features_endings_editors',
    status: 'active',
    render: renderMatchingTaskEditor,
  },
  'multiple-select': {
    taskType: 'multiple-select',
    designFolder: 'ielts_choice_short_answer_editors',
    status: 'active',
    render: renderChoiceTaskEditor,
  },
  'short-answer': {
    taskType: 'short-answer',
    designFolder: 'ielts_choice_short_answer_editors',
    status: 'active',
    render: renderShortAnswerTaskEditor,
  },
  'table-completion': {
    taskType: 'table-completion',
    designFolder: 'ielts_table_completion_editor',
    status: 'active',
    render: renderTableCompletionTaskEditor,
  },
  'flowchart-completion': {
    taskType: 'flowchart-completion',
    designFolder: 'ielts_flowchart_diagram_editors',
    status: 'active',
    render: renderFlowchartTaskEditor,
  },
  'diagram-labeling': {
    taskType: 'diagram-labeling',
    designFolder: 'ielts_flowchart_diagram_editors',
    status: 'active',
    render: renderDiagramLabelingTaskEditor,
  },
};

const getFirstPassageAnchorIdForTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): string | undefined => {
  const passageStimulus = taskGroup.stimulusRefs
    .map((stimulusRef) => document.stimuli[stimulusRef.stimulusId])
    .find((stimulus) => stimulus?.content.kind === 'passage-content');

  return passageStimulus?.anchorIds[0];
};

const optionRepairIdPart = (value: string): string =>
  value.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'option';

function QuestionLinkPanel({
  document,
  taskGroup,
  interactions,
  optionSet,
  numberByInteractionId,
  selectedQuestionLink,
  onInteractionChange,
  onOptionSetChange,
  onQuestionLinkNavigation,
  onQuestionLinkRepair,
}: {
  readonly document: ReadingV2Document;
  readonly taskGroup: ReadingV2TaskGroup;
  readonly interactions: readonly ReadingV2Interaction[];
  readonly optionSet?: ReadingV2OptionSet;
  readonly numberByInteractionId: ReadonlyMap<string, number>;
  readonly selectedQuestionLink?: ReadingV2QuestionLinkTarget | null;
  readonly onInteractionChange: (interaction: ReadingV2Interaction) => void;
  readonly onOptionSetChange: (optionSet: ReadingV2OptionSet) => void;
  readonly onQuestionLinkNavigation?: (target: ReadingV2QuestionLinkTarget) => void;
  readonly onQuestionLinkRepair?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
}) {
  const fallbackPassageAnchorId = getFirstPassageAnchorIdForTaskGroup(document, taskGroup);
  const linkRows = interactions.map((interaction, interactionIndex) => {
    const questionNumber = numberByInteractionId.get(interaction.interactionId) ?? interactionIndex + 1;
    const answers = interaction.scoringRule.acceptableAnswers ?? [];
    const answerMissing = !answers.some((answer) => answer.trim().length > 0);
    const staleOptionAnswer = optionSet
      ? answers.find((answer) =>
          answer.trim().length > 0
          && !optionSet.options.some((option) => answerMatchesOption(answer, option)),
        )
      : undefined;
    const selected =
      selectedQuestionLink?.interactionId === interaction.interactionId
      || (interaction.primaryAnchorId && selectedQuestionLink?.anchorId === interaction.primaryAnchorId);
    const needsAttention = !interaction.primaryAnchorId || answerMissing || Boolean(staleOptionAnswer);

    return {
      answerMissing,
      interaction,
      needsAttention,
      questionNumber,
      selected,
      staleOptionAnswer,
    };
  });
  const visibleRows = linkRows.filter((row) => row.needsAttention || row.selected);

  if (visibleRows.length === 0) {
    return null;
  }

  const issueCount = linkRows.filter((row) => row.needsAttention).length;

  return (
    <section className="reading-v2-question-links" aria-label={`Question links for ${taskGroup.groupTitle ?? taskGroup.taskGroupId}`}>
      <div className="reading-v2-question-links__heading">
        <h4>Question Link Checks</h4>
        <span>{issueCount > 0 ? `${issueCount} issue${issueCount === 1 ? '' : 's'}` : `${visibleRows.length} selected`}</span>
      </div>
      <div className="reading-v2-question-links__rows">
        {visibleRows.map(({
          answerMissing,
          interaction,
          needsAttention,
          questionNumber,
          selected,
          staleOptionAnswer,
        }) => {
          return (
            <section
              className="reading-v2-question-links__row"
              data-linked-selected={selected ? 'true' : 'false'}
              data-needs-attention={needsAttention ? 'true' : 'false'}
              key={interaction.interactionId}
            >
              <strong>Q{questionNumber}</strong>
              <span>{interaction.primaryAnchorId ? 'Linked' : 'No block link'}</span>
              {answerMissing ? <span>Missing answer</span> : null}
              {staleOptionAnswer ? <span>Stale option</span> : null}
              <div className="reading-v2-question-links__actions">
                <button
                  className="reading-v2-studio__button reading-v2-studio__button--quiet"
                  type="button"
                  disabled={!interaction.primaryAnchorId}
                  onClick={() => onQuestionLinkNavigation?.({
                    anchorId: interaction.primaryAnchorId,
                    interactionId: interaction.interactionId,
                    taskGroupId: taskGroup.taskGroupId,
                    source: 'question',
                  })}
                >
                  Reveal linked block
                </button>
                {!interaction.primaryAnchorId && fallbackPassageAnchorId ? (
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--quiet"
                    type="button"
                    onClick={() => {
                      onInteractionChange({
                        ...interaction,
                        primaryAnchorId: readingV2Ids.anchorId(fallbackPassageAnchorId),
                        contextAnchorIds: [readingV2Ids.anchorId(fallbackPassageAnchorId)],
                      });
                      onQuestionLinkRepair?.('orphan-question-linked-to-passage', {
                        anchorId: fallbackPassageAnchorId,
                        interactionId: interaction.interactionId,
                        taskGroupId: taskGroup.taskGroupId,
                      });
                      onQuestionLinkNavigation?.({
                        anchorId: fallbackPassageAnchorId,
                        interactionId: interaction.interactionId,
                        taskGroupId: taskGroup.taskGroupId,
                        source: 'repair',
                      });
                    }}
                  >
                    Link to passage
                  </button>
                ) : null}
                {staleOptionAnswer && optionSet ? (
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--quiet"
                    type="button"
                    onClick={() => {
                      const optionId = `${optionSet.optionSetId}-${optionRepairIdPart(staleOptionAnswer)}`;
                      onOptionSetChange({
                        ...optionSet,
                        options: [
                          ...optionSet.options,
                          {
                            optionId,
                            label: staleOptionAnswer,
                            text: staleOptionAnswer,
                          },
                        ],
                      });
                      onQuestionLinkRepair?.('stale-option-added-to-bank', {
                        answer: staleOptionAnswer,
                        interactionId: interaction.interactionId,
                        taskGroupId: taskGroup.taskGroupId,
                      });
                    }}
                  >
                    Add missing option
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function ReadingV2QuestionGroupCard({
  document,
  taskGroup,
  interactions,
  optionSet,
  optionSets,
  visibleRange,
  reviewMessages,
  numberByInteractionId,
  selected,
  authoringNumbers,
  selectedQuestionLink,
  onSelect,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onOptionSetChange,
  onDocumentChange,
  onTableCompletionAction,
  reviewIssues,
  focusedIssueQuestion,
  onReviewIssueActivate,
  onQuestionLinkNavigation,
  onQuestionLinkRepair,
  onAddQuestion,
  onDuplicateQuestionGroup,
  onDeleteQuestionGroup,
}: {
  readonly document: ReadingV2Document;
  readonly taskGroup: ReadingV2TaskGroup;
  readonly interactions: readonly ReadingV2Interaction[];
  readonly optionSet?: ReadingV2OptionSet;
  readonly optionSets: Readonly<Record<string, ReadingV2OptionSet>>;
  readonly visibleRange: string;
  readonly reviewMessages: readonly ReadingV2BuildValidationMessage[];
  readonly numberByInteractionId: ReadonlyMap<string, number>;
  readonly selected: boolean;
  readonly authoringNumbers: readonly ReadingV2DerivedNumber[];
  readonly selectedQuestionLink?: ReadingV2QuestionLinkTarget | null;
  readonly onSelect: (taskGroupId: string) => void;
  readonly onTaskGroupChange: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onInteractionChange: (interaction: ReadingV2Interaction) => void;
  readonly onInteractionRemove: (interactionId: string, taskGroup: ReadingV2TaskGroup) => void;
  readonly onOptionSetChange: (optionSet: ReadingV2OptionSet) => void;
  readonly onDocumentChange: (document: ReadingV2Document) => void;
  readonly onTableCompletionAction?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly reviewIssues: readonly ReadingV2ReviewIssue[];
  readonly focusedIssueQuestion: number | null;
  readonly onReviewIssueActivate: (issue: ReadingV2ReviewIssue) => void;
  readonly onQuestionLinkNavigation?: (target: ReadingV2QuestionLinkTarget) => void;
  readonly onQuestionLinkRepair?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
  readonly onAddQuestion: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onDuplicateQuestionGroup: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onDeleteQuestionGroup: (taskGroup: ReadingV2TaskGroup) => void;
}) {
  const taskType = taskGroup.officialTaskType;
  const taskEditor = ReadingV2TaskEditorRegistry[taskType];
  const disabledReason = taskEditor.status === 'inactive'
    ? taskEditor.blocker ?? UNSUPPORTED_TASK_TYPES[taskType]
    : UNSUPPORTED_TASK_TYPES[taskType];
  const currentOptionSet = optionSet;
  const showInstructionWordLimit = showsInstructionWordLimit(taskType);
  const instructionWordLimit = taskGroup.answerRule.wordLimit ?? getDefaultWordLimitForTaskType(taskType);
  const updateInstructionWordLimit = (wordLimitValue: number) => {
    const nextWordLimit = normalizeWordLimit(wordLimitValue, getDefaultWordLimitForTaskType(taskType));
    onTaskGroupChange(withGroupWordLimit(taskGroup, nextWordLimit));
    interactions.forEach((interaction) => {
      if (interaction.responseShape.kind === 'free-text') {
        onInteractionChange(withInteractionWordLimit(interaction, nextWordLimit));
      }
    });
  };
  const [deletePending, setDeletePending] = useState(false);
  const issueChips = reviewIssues.map((issue) => (
    <button
      className="reading-v2-build-card__issue-chip"
      type="button"
      key={issue.id}
      onClick={() => onReviewIssueActivate(issue)}
    >
      {issue.detail}
    </button>
  ));
  const focusedInCard = focusedIssueQuestion !== null
    && interactions.some((interaction) => numberByInteractionId.get(interaction.interactionId) === focusedIssueQuestion);
  const reviewGuidanceLabel = focusedInCard && focusedIssueQuestion !== null
    ? `Review guidance for Question ${focusedIssueQuestion}`
    : reviewIssues.length === 1 && reviewIssues[0]?.target.questionRange?.start
    ? `Review guidance for Question ${reviewIssues[0].target.questionRange.start}`
    : `Review guidance for ${visibleRange}`;
  const wordLimitControl = (
    <label className="reading-v2-build-card__instruction-word-limit">
      Word limit
      <select
        aria-label={getInstructionWordLimitLabel(taskType)}
        value={instructionWordLimit}
        onChange={(event) => updateInstructionWordLimit(Number(event.currentTarget.value))}
      >
        {IELTS_WORD_LIMIT_OPTIONS.map((wordLimitOption) => (
          <option key={wordLimitOption} value={wordLimitOption}>
            {wordLimitOption}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <article className="reading-v2-build-card" data-selected={selected ? 'true' : 'false'}>
      <header className="reading-v2-build-card__header">
        <div>
          <span className="reading-v2-build-card__range">{visibleRange}</span>
          <h3>{TASK_TYPE_LABELS[taskType]}</h3>
        </div>
        <div className="reading-v2-build-card__actions">
          <button
            className="reading-v2-build-card__action-button"
            type="button"
            aria-label={`Edit ${TASK_TYPE_LABELS[taskType]}`}
            onClick={() => onSelect(taskGroup.taskGroupId)}
          >
            <IconEdit aria-hidden="true" size={16} stroke={1.8} />
            <span>Edit</span>
          </button>
          <button
            className="reading-v2-build-card__action-button"
            type="button"
            title="Duplicate question group"
            onClick={() => onDuplicateQuestionGroup(taskGroup)}
          >
            <IconCopy aria-hidden="true" size={16} stroke={1.8} />
            <span>Duplicate</span>
          </button>
          <button
            className="reading-v2-build-card__action-button reading-v2-build-card__action-button--danger"
            type="button"
            onClick={() => setDeletePending(true)}
          >
            <IconTrash aria-hidden="true" size={16} stroke={1.8} />
            <span>Delete</span>
          </button>
        </div>
      </header>

      {reviewMessages.length > 0 || issueChips.length > 0 ? (
        <section
          className={focusedInCard
            ? 'reading-v2-build-card__review-guidance reading-v2-build-card__review-guidance--focused'
            : 'reading-v2-build-card__review-guidance'}
          role="note"
          aria-label={reviewGuidanceLabel}
          data-review-focus={focusedInCard ? 'true' : undefined}
        >
          <div className="reading-v2-build-card__review-heading">
            <IconAlertTriangle aria-hidden="true" size={17} stroke={1.9} />
            <strong>Review imported content</strong>
          </div>
          {issueChips.length > 0 ? (
            <div className="reading-v2-build-card__issue-chips" aria-label={`Issue chips for ${visibleRange}`}>
              {issueChips}
            </div>
          ) : null}
          <ul>
            {reviewMessages.map((item) => (
              <li key={item.key}>
                <span>{item.reviewLabel ?? visibleRange}</span>
                <p>{item.reviewDetail ?? item.message}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {deletePending ? (
        <section className="reading-v2-build-confirm" role="alert">
          <span>Delete this {TASK_TYPE_LABELS[taskType]} group? All questions and answer keys in the group will be removed.</span>
          <div className="reading-v2-studio__inline-actions">
            <button className="reading-v2-studio__button reading-v2-studio__button--quiet" type="button" onClick={() => setDeletePending(false)}>
              Keep group
            </button>
            <button
              className="reading-v2-studio__button reading-v2-studio__button--danger"
              type="button"
              onClick={() => {
                setDeletePending(false);
                onDeleteQuestionGroup(taskGroup);
              }}
            >
              Delete group
            </button>
          </div>
        </section>
      ) : null}

      {disabledReason ? (
        <section className="reading-v2-build-card__disabled" role="note">
          <strong>{TASK_TYPE_LABELS[taskType]} is disabled for editing.</strong>
          <p>{disabledReason}</p>
        </section>
      ) : (
        <>
          <section
            className={showInstructionWordLimit
              ? 'reading-v2-build-card__section reading-v2-build-card__section--instruction-with-word-limit'
              : 'reading-v2-build-card__section'}
            aria-label="Instructions"
          >
            {taskGroup.instructionBlocks.map((block, blockIndex) => (
              <div className="reading-v2-build-card__instruction-row" key={block.id}>
                <label className="reading-v2-build-card__instruction-field">
                  Instruction {blockIndex + 1}
                  <textarea
                    aria-label={`${TASK_TYPE_LABELS[taskType]} instruction ${blockIndex + 1}`}
                    value={block.text}
                    onChange={(event) =>
                      onTaskGroupChange({
                        ...taskGroup,
                        instructionBlocks: taskGroup.instructionBlocks.map((current) =>
                          current.id === block.id ? { ...current, text: event.currentTarget.value } : current,
                        ),
                      })
                    }
                  />
                </label>
                {showInstructionWordLimit && blockIndex === 0 ? wordLimitControl : null}
              </div>
            ))}
          </section>
          <QuestionLinkPanel
            document={document}
            taskGroup={taskGroup}
            interactions={interactions}
            optionSet={currentOptionSet}
            numberByInteractionId={numberByInteractionId}
            selectedQuestionLink={selectedQuestionLink}
            onInteractionChange={onInteractionChange}
            onOptionSetChange={onOptionSetChange}
            onQuestionLinkNavigation={onQuestionLinkNavigation}
            onQuestionLinkRepair={onQuestionLinkRepair}
          />
          {taskEditor.render({
            document,
            taskGroup,
            interactions,
            optionSet: currentOptionSet,
            optionSets,
            numberByInteractionId,
            authoringNumbers,
            selectedQuestionLink,
            onTaskGroupChange,
            onInteractionChange,
            onInteractionRemove,
            onOptionSetChange,
            onDocumentChange,
            onTableCompletionAction,
            onQuestionLinkNavigation,
            onQuestionLinkRepair,
            onAddQuestion,
          })}
        </>
      )}
    </article>
  );
}

export function ReadingV2BuildWorkspace({
  document,
  metadata,
  modeLabel,
  passageSlots,
  selectedPassageNumber,
  selectedPassageTaskGroups,
  allTaskGroups,
  interactions,
  optionSets,
  authoringNumbers,
  selectedTaskGroupId,
  selectedQuestionLink,
  validationMessages,
  publishBlocked,
  workflowMessage,
  publishState,
  operationalActionLabel,
  onSaveDraft,
  onValidate,
  onPreview,
  onPublish,
  onExit,
  onOperationalAction,
  onToolbarMoreToggle,
  onSelectPassage,
  onAddPassage,
  onRemovePassage,
  onMetadataChange,
  onPassageTitleChange,
  onPassageTextChange,
  onAddQuestionGroup,
  onSelectTaskGroup,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove,
  onOptionSetChange,
  onDocumentChange,
  onPassageEditorAction,
  onTableCompletionAction,
  onQuestionLinkNavigation,
  onQuestionLinkRepair,
  onReviewIssuesAction,
  onAddQuestion,
  onDuplicateQuestionGroup,
  onDeleteQuestionGroup,
  onOpenQuestionGroupModal,
  onCloseQuestionGroupModal,
}: ReadingV2BuildWorkspaceProps) {
  const [addGroupModalOpen, setAddGroupModalOpen] = useState(false);
  const [exitPending, setExitPending] = useState(false);
  const [passageFocusRequest, setPassageFocusRequest] = useState(0);
  const [reviewIssuesOpen, setReviewIssuesOpen] = useState(false);
  const [focusedIssueQuestion, setFocusedIssueQuestion] = useState<number | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(metadata.title);
  const selectedPassage = passageSlots.find((passage) => passage.passageNumber === selectedPassageNumber)
    ?? passageSlots[0];
  const numberByInteractionId = useMemo(
    () => new Map(authoringNumbers.map((item) => [item.interactionId, item.displayNumber])),
    [authoringNumbers],
  );
  const reviewIssues = useMemo(
    () => mapReadingV2BuildValidationMessagesToReviewIssues(validationMessages),
    [validationMessages],
  );
  useEffect(() => {
    if (focusedIssueQuestion === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFocusedIssueQuestion(null), 8000);
    return () => window.clearTimeout(timeoutId);
  }, [focusedIssueQuestion]);
  useEffect(() => {
    if (focusedIssueQuestion === null) {
      return undefined;
    }

    const timeoutIds = [0, 100, 300].map((delay) =>
      window.setTimeout(() => scrollQuestionIntoView(focusedIssueQuestion), delay),
    );

    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [focusedIssueQuestion]);
  const title = metadata.title.trim() || 'Untitled IELTS Reading Test';
  const statusLabel =
    publishState === 'success'
      ? 'Published'
      : publishState === 'pending'
        ? 'Publishing'
        : publishBlocked
          ? 'Needs review'
          : 'Ready';

  const getGroupRange = (taskGroup: ReadingV2TaskGroup): string => {
    const numbers = taskGroup.interactionIds
      .map((interactionId) => numberByInteractionId.get(interactionId))
      .filter((number): number is number => number !== undefined);

    if (numbers.length === 0) {
      return 'Questions not numbered';
    }

    const first = numbers[0]!;
    const last = numbers[numbers.length - 1]!;
    return first === last ? `Question ${first}` : `Questions ${first}-${last}`;
  };

  const getReviewMessagesForGroup = (
    interactionsForGroup: readonly ReadingV2Interaction[],
  ): readonly ReadingV2BuildValidationMessage[] => {
    const numbers = interactionsForGroup
      .map((interaction) => numberByInteractionId.get(interaction.interactionId))
      .filter((number): number is number => number !== undefined)
      .sort((left, right) => left - right);

    if (numbers.length === 0) {
      return [];
    }

    const groupRange = { start: numbers[0]!, end: numbers[numbers.length - 1]! };
    return validationMessages.filter((message) =>
      message.questionRange ? questionRangesOverlap(message.questionRange, groupRange) : false,
    );
  };

  const getReviewIssuesForGroup = (
    interactionsForGroup: readonly ReadingV2Interaction[],
  ): readonly ReadingV2ReviewIssue[] => {
    const numbers = interactionsForGroup
      .map((interaction) => numberByInteractionId.get(interaction.interactionId))
      .filter((number): number is number => number !== undefined)
      .sort((left, right) => left - right);

    if (numbers.length === 0) {
      return [];
    }

    const groupRange = { start: numbers[0]!, end: numbers[numbers.length - 1]! };
    return reviewIssues.filter((issue) =>
      issue.target.questionRange ? questionRangesOverlap(issue.target.questionRange, groupRange) : false,
    );
  };

  const findIssueTarget = (issue: ReadingV2ReviewIssue): ReadingV2QuestionLinkTarget | null => {
    if (issue.target.interactionId || issue.target.taskGroupId || issue.target.anchorId) {
      return {
        anchorId: issue.target.anchorId,
        interactionId: issue.target.interactionId,
        taskGroupId: issue.target.taskGroupId,
        source: 'diagnostic',
      };
    }

    const targetQuestion = issue.target.questionRange?.start;
    if (targetQuestion === undefined) {
      return null;
    }

    for (const taskGroup of allTaskGroups) {
      for (const interactionId of taskGroup.interactionIds) {
        if (numberByInteractionId.get(interactionId) === targetQuestion) {
          return {
            interactionId,
            taskGroupId: taskGroup.taskGroupId,
            source: 'diagnostic',
          };
        }
      }
    }

    return null;
  };

  const getPassageNumberForTaskGroup = (taskGroupId: string | undefined): number | undefined => {
    if (!taskGroupId) {
      return undefined;
    }

    const sectionIndex = document.sectionIds.findIndex((sectionId) =>
      document.sections[sectionId]?.taskGroupIds.includes(readingV2Ids.taskGroupId(taskGroupId)),
    );

    return sectionIndex >= 0 ? sectionIndex + 1 : undefined;
  };

  const handleReviewIssueActivate = (issue: ReadingV2ReviewIssue) => {
    const target = findIssueTarget(issue);
    if (!target) {
      return;
    }

    const targetPassageNumber = getPassageNumberForTaskGroup(target.taskGroupId);
    if (targetPassageNumber && targetPassageNumber !== selectedPassageNumber) {
      onSelectPassage(targetPassageNumber);
    }
    if (target.taskGroupId) {
      onSelectTaskGroup(target.taskGroupId);
    }

    onQuestionLinkNavigation?.(target);
    if (issue.target.questionRange?.start !== undefined) {
      const questionNumber = issue.target.questionRange.start;

      setFocusedIssueQuestion(questionNumber);
      scrollQuestionIntoView(questionNumber);
      window.setTimeout(() => scrollQuestionIntoView(questionNumber), 50);
      window.setTimeout(() => scrollQuestionIntoView(questionNumber), 250);
    }
    setReviewIssuesOpen(false);
    onReviewIssuesAction?.('reviewIssueNavigate', {
      issueId: issue.id,
      issueType: issue.type,
      questionStart: issue.target.questionRange?.start,
      questionEnd: issue.target.questionRange?.end,
    });
  };

  const handleReviewIssuesOpenChange = (open: boolean) => {
    setReviewIssuesOpen(open);
    onReviewIssuesAction?.(open ? 'reviewIssuesOpen' : 'reviewIssuesClose', {
      issueCount: reviewIssues.length,
    });
  };

  const handleVisibilityChange = (visibility: ReadingV2Visibility) => {
    onMetadataChange({ ...metadata, visibility });
  };

  const startTitleEdit = () => {
    setDraftTitle(metadata.title);
    setTitleEditing(true);
  };

  const commitTitleEdit = () => {
    onMetadataChange({ ...metadata, title: draftTitle.trim() });
    setTitleEditing(false);
  };

  const cancelTitleEdit = () => {
    setDraftTitle(metadata.title);
    setTitleEditing(false);
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTitleEdit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelTitleEdit();
    }
  };

  const passageVisibility = metadata.visibility === 'public' || metadata.visibility === 'library-eligible'
    ? 'public'
    : 'private';
  const showVisibilityControl = metadata.materialKind === 'reading-passage' || metadata.materialKind === 'full-test';
  const visibilityControlLabel = metadata.materialKind === 'reading-passage'
    ? 'Reading Passage visibility'
    : 'Master test visibility';

  function scrollQuestionIntoView(questionNumber: number) {
    if (typeof window === 'undefined' || !window.document) {
      return;
    }

    const candidates = Array.from(window.document.querySelectorAll<HTMLElement>('[aria-label]'));
    const questionTarget = candidates.find((element) => {
      const label = element.getAttribute('aria-label') ?? '';
      return label === `Statement ${questionNumber} text`;
    }) ?? candidates.find((element) => {
      const label = element.getAttribute('aria-label') ?? '';
      return label.startsWith(`Question ${questionNumber} `);
    }) ?? candidates.find((element) =>
      element.getAttribute('aria-label') === `Review guidance for Question ${questionNumber}`,
    );

    if (questionTarget) {
      const questionPanel = questionTarget.closest<HTMLElement>('.reading-v2-build__question-panel');
      if (questionPanel) {
        const targetRect = questionTarget.getBoundingClientRect();
        const panelRect = questionPanel.getBoundingClientRect();
        const targetOffset = targetRect.top - panelRect.top - (panelRect.height / 3);
        questionPanel.scrollTop += targetOffset;
      } else {
        questionTarget.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    }
    try {
      questionTarget?.focus?.({ preventScroll: true });
    } catch {
      questionTarget?.focus?.();
    }
  }

  const openAddGroupModal = () => {
    setAddGroupModalOpen(true);
    onOpenQuestionGroupModal();
  };

  const closeAddGroupModal = () => {
    setAddGroupModalOpen(false);
    onCloseQuestionGroupModal();
  };

  const continueAddGroup = (taskType: ReadingV2CanonicalTaskType) => {
    onAddQuestionGroup(taskType);
    closeAddGroupModal();
  };

  const handlePassageEditorAction = (action: string) => {
    onPassageEditorAction?.(action, {
      passageNumber: selectedPassageNumber,
      stimulusId: selectedPassage?.stimulusId,
    });
  };
  const selectedSection = selectedPassage?.sectionId
    ? document.sections[readingV2Ids.sectionId(selectedPassage.sectionId)]
    : undefined;
  const selectedAnchor = selectedQuestionLink?.anchorId
    ? document.anchors[readingV2Ids.anchorId(selectedQuestionLink.anchorId)]
    : undefined;
  const selectedPassageAnchor = selectedAnchor
    && selectedPassage?.stimulusId
    && selectedAnchor.stimulusId === readingV2Ids.stimulusId(selectedPassage.stimulusId)
      ? selectedAnchor
      : undefined;
  const selectedPassageImageBlocks = selectedSection
    ? selectedSection.stimulusIds
        .map((stimulusId) => document.stimuli[stimulusId])
        .filter(isMediaStimulus)
    : [];

  const commitPassageImageBlock = (stimulus: MediaStimulus) => {
    if (!selectedSection) {
      return;
    }

    onDocumentChange({
      ...document,
      sections: {
        ...document.sections,
        [selectedSection.sectionId]: {
          ...selectedSection,
          stimulusIds: selectedSection.stimulusIds.includes(stimulus.stimulusId)
            ? selectedSection.stimulusIds
            : [...selectedSection.stimulusIds, stimulus.stimulusId],
        },
      },
      stimuli: {
        ...document.stimuli,
        [stimulus.stimulusId]: stimulus,
      },
    });
  };

  const addPassageImageBlock = () => {
    if (!selectedSection) {
      return;
    }

    const base = `${selectedSection.sectionId}-image-${selectedPassageImageBlocks.length + 1}`;
    let stimulusId = readingV2Ids.stimulusId(base);
    let suffix = 2;

    while (document.stimuli[stimulusId]) {
      stimulusId = readingV2Ids.stimulusId(`${base}-${suffix}`);
      suffix += 1;
    }

    commitPassageImageBlock({
      stimulusId,
      kind: 'media',
      title: `Passage ${selectedPassageNumber} image`,
      content: {
        kind: 'media-content',
        mediaUrl: '',
        alt: '',
        caption: '',
        source: '',
      },
      anchorIds: [],
    });
    onPassageEditorAction?.('image-block-created', {
      passageNumber: selectedPassageNumber,
      stimulusId,
    });
  };

  const updatePassageImageBlock = (
    stimulusId: string,
    updater: (stimulus: MediaStimulus) => MediaStimulus,
    outcome: string,
  ) => {
    const currentStimulus = document.stimuli[stimulusId];
    if (!isMediaStimulus(currentStimulus)) {
      return;
    }

    const nextStimulus = updater(currentStimulus);
    onDocumentChange({
      ...document,
      stimuli: {
        ...document.stimuli,
        [nextStimulus.stimulusId]: nextStimulus,
      },
    });
    onPassageEditorAction?.(outcome, {
      passageNumber: selectedPassageNumber,
      stimulusId: nextStimulus.stimulusId,
    });
  };

  const deletePassageImageBlock = (stimulusId: string) => {
    if (!selectedSection) {
      return;
    }

    const nextStimuli = { ...document.stimuli };
    delete nextStimuli[stimulusId];
    onDocumentChange({
      ...document,
      sections: {
        ...document.sections,
        [selectedSection.sectionId]: {
          ...selectedSection,
          stimulusIds: selectedSection.stimulusIds.filter((currentStimulusId) => currentStimulusId !== stimulusId),
        },
      },
      stimuli: nextStimuli,
    });
    onPassageEditorAction?.('image-block-deleted', {
      passageNumber: selectedPassageNumber,
      stimulusId,
    });
  };

  const handlePassageImageFile = (stimulusId: string, file: File | undefined) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        updatePassageImageBlock(
          stimulusId,
          (stimulus) => ({
            ...stimulus,
            content: {
              ...stimulus.content,
              mediaUrl: reader.result as string,
            },
          }),
          'image-block-uploaded',
        );
      }
    });
    reader.readAsDataURL(file);
  };

  const passageSelector = (
    <nav className="reading-v2-build__passage-tabs" aria-label="Passage selector">
      <div className="reading-v2-build__passage-tab-list">
        {passageSlots.map((passage) => {
          const removeDisabled = passageSlots.length <= 1 || passage.questionGroupCount > 0;
          const removeTitle = passage.questionGroupCount > 0
            ? 'Remove the question groups in this passage before deleting it.'
            : passageSlots.length <= 1
              ? 'At least one passage is required.'
              : `Remove Passage ${passage.passageNumber}`;

          return (
            <div className="reading-v2-build__passage-tab-item" key={passage.passageNumber}>
              <button
                className="reading-v2-build__passage-tab"
                type="button"
                aria-label={`Passage ${passage.passageNumber}`}
                aria-pressed={passage.passageNumber === selectedPassageNumber}
                onClick={() => onSelectPassage(passage.passageNumber)}
              >
                <span className="reading-v2-build__passage-tab-label-full">Passage {passage.passageNumber}</span>
                <span className="reading-v2-build__passage-tab-label-short" aria-hidden="true">{passage.passageNumber}</span>
              </button>
              {onRemovePassage ? (
                <button
                  className="reading-v2-build__passage-remove"
                  type="button"
                  aria-label={`Remove Passage ${passage.passageNumber}`}
                  disabled={removeDisabled}
                  title={removeTitle}
                  onClick={() => onRemovePassage(passage.passageNumber)}
                >
                  <IconX aria-hidden="true" size={14} stroke={2} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {onAddPassage ? (
        <button
          className="reading-v2-build__passage-add"
          type="button"
          aria-label="Add Passage"
          title="Add Passage"
          onClick={onAddPassage}
        >
          <IconPlus aria-hidden="true" size={16} stroke={1.9} />
        </button>
      ) : null}
    </nav>
  );

  return (
    <section className="reading-v2-build" aria-label="Reading V2 build workspace">
      <header className="reading-v2-build__topbar">
        <div className="reading-v2-build__identity">
          <p>IELTS Reading V2: Build Test</p>
          {titleEditing ? (
            <input
              aria-label="Test title"
              autoFocus
              className="reading-v2-build__title-input"
              value={draftTitle}
              onBlur={commitTitleEdit}
              onChange={(event) => setDraftTitle(event.currentTarget.value)}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <h1 title={title} onDoubleClick={startTitleEdit}>{title}</h1>
          )}
        </div>
        <div className="reading-v2-build__state-row" aria-label="Build status">
          <p className="reading-v2-studio__sr-only" role="status" aria-live="polite">
            {reviewIssues.length > 0
              ? `Validation status: ${reviewIssues.length} item${reviewIssues.length === 1 ? '' : 's'} pending.`
              : workflowMessage === 'No required issues found.'
                ? 'Validation status: clear.'
                : workflowMessage ?? 'Validation status: idle.'}
          </p>
          <span className={publishBlocked ? 'reading-v2-status reading-v2-status--warning' : 'reading-v2-status'}>
            {statusLabel}
          </span>
          <span className="reading-v2-build__mode">{modeLabel}</span>
          {reviewIssues.length > 0 ? (
            <div className="reading-v2-build__warning-menu">
              <button
                className="reading-v2-build__warning-pill"
                type="button"
                aria-label={`${reviewIssues.length} validation item${reviewIssues.length === 1 ? '' : 's'}`}
                title="Click to review issues"
                aria-expanded={reviewIssuesOpen}
                onClick={() => handleReviewIssuesOpenChange(!reviewIssuesOpen)}
              >
                <IconAlertTriangle aria-hidden="true" size={18} stroke={1.9} />
                <span>{reviewIssues.length} item{reviewIssues.length === 1 ? '' : 's'}</span>
              </button>
              <ReadingV2ReviewIssuesPanel
                issues={reviewIssues}
                open={reviewIssuesOpen}
                onOpenChange={handleReviewIssuesOpenChange}
                onIssueActivate={handleReviewIssueActivate}
              />
              {operationalActionLabel && onOperationalAction && reviewIssuesOpen ? (
                <button className="reading-v2-studio__button reading-v2-review-issues__operational-action" type="button" onClick={onOperationalAction}>
                  {operationalActionLabel}
                </button>
              ) : null}
            </div>
          ) : workflowMessage ? (
            <span className="reading-v2-build__workflow-pill" role="status" aria-live="polite">{workflowMessage}</span>
          ) : null}
        </div>
        <div className="reading-v2-build__actions" aria-label="Build workspace actions">
          <button className="reading-v2-studio__button" type="button" onClick={onSaveDraft}>
            Save Draft
          </button>
          <button className="reading-v2-studio__button" type="button" onClick={onValidate}>
            Validate
          </button>
          <button className="reading-v2-studio__button" type="button" onClick={onPreview}>
            Preview
          </button>
          <button
            className="reading-v2-studio__button reading-v2-studio__button--primary"
            type="button"
            disabled={publishBlocked}
            aria-disabled={publishBlocked}
            onClick={onPublish}
          >
            Publish
          </button>
          <button
            className="reading-v2-studio__button reading-v2-studio__button--quiet"
            type="button"
            onClick={() => {
              onToolbarMoreToggle?.('open');
              onToolbarMoreToggle?.('close');
              setExitPending(true);
            }}
          >
            Exit
          </button>
        </div>
      </header>

      {exitPending ? (
        <section className="reading-v2-build__exit-warning" aria-label="Exit confirmation">
          <p>Leave this workspace? Save your draft first if you want to keep recent changes.</p>
          <div className="reading-v2-studio__inline-actions">
            <button className="reading-v2-studio__button" type="button" onClick={() => setExitPending(false)}>
              Stay
            </button>
            <button className="reading-v2-studio__button reading-v2-studio__button--secondary" type="button" onClick={onExit}>
              Leave Workspace
            </button>
          </div>
        </section>
      ) : null}

      <div className="reading-v2-build__workspace">
        <section className="reading-v2-build__passage-panel" aria-label={`Passage ${selectedPassageNumber} editor`}>
          {passageSelector}
          <label>
            Passage title
            <input
              aria-label="Passage title"
              value={selectedPassage?.title ?? ''}
              onChange={(event) => onPassageTitleChange(selectedPassageNumber, event.currentTarget.value)}
            />
          </label>
          {selectedPassageAnchor ? (
            <section
              className="reading-v2-build__linked-anchor-status"
              aria-label="Selected passage link"
              data-linked-selected="true"
            >
              <strong>Linked passage block selected</strong>
              <span>{selectedPassageAnchor.label ?? selectedPassageAnchor.anchorId}</span>
            </section>
          ) : null}
          <ReadingV2PassageEditor
            ariaLabel="Passage editor"
            focusRequestKey={passageFocusRequest}
            onAction={handlePassageEditorAction}
            onChange={(nextText) => onPassageTextChange(selectedPassageNumber, nextText)}
            passageNumber={selectedPassageNumber}
            value={selectedPassage?.text ?? ''}
          />
          <section className="reading-v2-image-blocks" aria-label="Passage image blocks">
            <header className="reading-v2-image-blocks__header">
              <h3>Image Blocks</h3>
              <button
                className="reading-v2-studio__button reading-v2-studio__button--quiet"
                type="button"
                onClick={addPassageImageBlock}
              >
                Add image block
              </button>
            </header>
            {selectedPassageImageBlocks.map((imageBlock, imageIndex) => {
              const imageUrl = imageBlock.content.mediaUrl ?? '';
              const imageAlt = imageBlock.content.alt;

              return (
                <section className="reading-v2-image-block" aria-label={`Image block ${imageIndex + 1}`} key={imageBlock.stimulusId}>
                  <label>
                    Caption
                    <input
                      aria-label={`Image block ${imageIndex + 1} caption`}
                      value={imageBlock.content.caption ?? imageBlock.title ?? ''}
                      onChange={(event) =>
                        updatePassageImageBlock(
                          imageBlock.stimulusId,
                          (stimulus) => ({
                            ...stimulus,
                            title: event.currentTarget.value,
                            content: {
                              ...stimulus.content,
                              caption: event.currentTarget.value,
                            },
                          }),
                          'image-block-caption-updated',
                        )
                      }
                    />
                  </label>
                  <div className="reading-v2-image-block__source-row">
                    <label>
                      Image URL
                      <input
                        aria-label={`Image block ${imageIndex + 1} URL`}
                        placeholder="https://..."
                        value={imageUrl}
                        onChange={(event) =>
                          updatePassageImageBlock(
                            imageBlock.stimulusId,
                            (stimulus) => ({
                              ...stimulus,
                              content: {
                                ...stimulus.content,
                                mediaUrl: event.currentTarget.value,
                              },
                            }),
                            'image-block-url-updated',
                          )
                        }
                      />
                    </label>
                    <label className="reading-v2-image-block__upload">
                      Upload file
                      <input
                        aria-label={`Image block ${imageIndex + 1} file`}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => handlePassageImageFile(imageBlock.stimulusId, event.currentTarget.files?.[0])}
                      />
                    </label>
                  </div>
                  <label>
                    Alt text
                    <input
                      aria-label={`Image block ${imageIndex + 1} alt text`}
                      value={imageAlt}
                      onChange={(event) =>
                        updatePassageImageBlock(
                          imageBlock.stimulusId,
                          (stimulus) => ({
                            ...stimulus,
                            content: {
                              ...stimulus.content,
                              alt: event.currentTarget.value,
                            },
                          }),
                          'image-block-alt-updated',
                        )
                      }
                    />
                  </label>
                  <label>
                    Source
                    <input
                      aria-label={`Image block ${imageIndex + 1} source`}
                      value={imageBlock.content.source ?? ''}
                      onChange={(event) =>
                        updatePassageImageBlock(
                          imageBlock.stimulusId,
                          (stimulus) => ({
                            ...stimulus,
                            content: {
                              ...stimulus.content,
                              source: event.currentTarget.value,
                            },
                          }),
                          'image-block-source-updated',
                        )
                      }
                    />
                  </label>
                  <div className="reading-v2-image-block__preview" aria-label={`Image block ${imageIndex + 1} preview`}>
                    {imageUrl.trim() ? (
                      <img src={imageUrl} alt={imageAlt || imageBlock.title || `Image block ${imageIndex + 1}`} />
                    ) : (
                      <span>No image source</span>
                    )}
                  </div>
                  <button
                    className="reading-v2-studio__button reading-v2-studio__button--danger"
                    type="button"
                    onClick={() => deletePassageImageBlock(imageBlock.stimulusId)}
                  >
                    Delete image block
                  </button>
                </section>
              );
            })}
          </section>
          {!selectedPassage?.hasText ? (
            <section className="reading-v2-build__empty-passage" aria-label="Empty passage state">
              <h2>No passage text yet</h2>
              <p>Start by adding the passage title and text.</p>
              <button className="reading-v2-studio__button reading-v2-studio__button--secondary" type="button" onClick={() => setPassageFocusRequest((current) => current + 1)}>
                Add passage text
              </button>
            </section>
          ) : null}
        </section>

        <section className="reading-v2-build__question-panel" aria-label={`Questions for Passage ${selectedPassageNumber}`}>
          <header className="reading-v2-build__question-header">
            <div>
              <h2>Questions for Passage {selectedPassageNumber}</h2>
              <p>{selectedPassageTaskGroups.length} group{selectedPassageTaskGroups.length === 1 ? '' : 's'} in this passage, {allTaskGroups.length} total.</p>
            </div>
            <div className="reading-v2-build__question-actions">
              {showVisibilityControl ? (
                <fieldset className="reading-v2-build__visibility-control">
                  <legend className="reading-v2-studio__sr-only">{visibilityControlLabel}</legend>
                  <button
                    type="button"
                    className="reading-v2-build__visibility-option"
                    data-selected={passageVisibility === 'private' ? 'true' : 'false'}
                    aria-pressed={passageVisibility === 'private'}
                    onClick={() => handleVisibilityChange('private')}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    className="reading-v2-build__visibility-option"
                    data-selected={passageVisibility === 'public' ? 'true' : 'false'}
                    aria-pressed={passageVisibility === 'public'}
                    onClick={() => handleVisibilityChange('public')}
                  >
                    Public
                  </button>
                </fieldset>
              ) : null}
              <button className="reading-v2-studio__button reading-v2-studio__button--primary" type="button" onClick={openAddGroupModal}>
                Add Question Group
              </button>
            </div>
          </header>

          {selectedPassageTaskGroups.length === 0 ? (
            <section className="reading-v2-build__empty-questions" aria-label="No questions for selected passage">
              <h3>No question groups for this passage yet.</h3>
              <p>Start building your assessment by adding a question group.</p>
              <button className="reading-v2-studio__button" type="button" onClick={openAddGroupModal}>
                Add Question Group
              </button>
            </section>
          ) : (
            <div className="reading-v2-build__question-cards">
              {selectedPassageTaskGroups.map((taskGroup) => {
                const groupInteractions = taskGroup.interactionIds
                  .map((interactionId) => interactions[interactionId])
                  .filter((interaction): interaction is ReadingV2Interaction => Boolean(interaction));
                const optionSet = taskGroup.optionSetRefs
                  .map((optionSetId) => optionSets[optionSetId])
                  .find((candidate): candidate is ReadingV2OptionSet => Boolean(candidate));
                const reviewMessages = getReviewMessagesForGroup(groupInteractions);
                const groupReviewIssues = getReviewIssuesForGroup(groupInteractions);

                return (
                  <ReadingV2QuestionGroupCard
                    key={taskGroup.taskGroupId}
                    document={document}
                    taskGroup={taskGroup}
                    interactions={groupInteractions}
                    optionSet={optionSet}
                    optionSets={optionSets}
                    visibleRange={getGroupRange(taskGroup)}
                    reviewMessages={reviewMessages}
                    reviewIssues={groupReviewIssues}
                    focusedIssueQuestion={focusedIssueQuestion}
                    onReviewIssueActivate={handleReviewIssueActivate}
                    numberByInteractionId={numberByInteractionId}
                    selected={taskGroup.taskGroupId === selectedTaskGroupId}
                    authoringNumbers={authoringNumbers}
                    selectedQuestionLink={selectedQuestionLink}
                    onSelect={onSelectTaskGroup}
                    onTaskGroupChange={onTaskGroupChange}
                    onInteractionChange={onInteractionChange}
                    onInteractionRemove={onInteractionRemove}
                    onOptionSetChange={onOptionSetChange}
                    onDocumentChange={onDocumentChange}
                    onTableCompletionAction={onTableCompletionAction}
                    onQuestionLinkNavigation={onQuestionLinkNavigation}
                    onQuestionLinkRepair={onQuestionLinkRepair}
                    onAddQuestion={onAddQuestion}
                    onDuplicateQuestionGroup={onDuplicateQuestionGroup}
                    onDeleteQuestionGroup={onDeleteQuestionGroup}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      {addGroupModalOpen ? (
        <AddQuestionGroupModal
          onClose={closeAddGroupModal}
          onContinue={continueAddGroup}
        />
      ) : null}
    </section>
  );
}

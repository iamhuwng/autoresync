export type ReadingV2EngineeringFamily =
  | 'completion'
  | 'choice'
  | 'binary-judgement'
  | 'matching'
  | 'structured-layout';

export type ReadingV2CanonicalTaskType =
  | 'sentence-completion'
  | 'summary-completion-text'
  | 'summary-completion-list'
  | 'note-completion'
  | 'table-completion'
  | 'flowchart-completion'
  | 'diagram-labeling'
  | 'true-false-not-given'
  | 'yes-no-not-given'
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'matching-sentence-endings'
  | 'multiple-choice'
  | 'multiple-select'
  | 'short-answer';

export interface ReadingV2TaskTaxonomyEntry {
  readonly canonicalSlug: ReadingV2CanonicalTaskType;
  readonly label: string;
  readonly family: ReadingV2EngineeringFamily;
}

export const READING_V2_ENGINEERING_FAMILIES = [
  'completion',
  'choice',
  'binary-judgement',
  'matching',
  'structured-layout',
] as const satisfies readonly ReadingV2EngineeringFamily[];

export const READING_V2_TASK_TAXONOMY = {
  'sentence-completion': {
    canonicalSlug: 'sentence-completion',
    label: 'Sentence Completion',
    family: 'completion',
  },
  'summary-completion-text': {
    canonicalSlug: 'summary-completion-text',
    label: 'Summary Completion From Text',
    family: 'completion',
  },
  'summary-completion-list': {
    canonicalSlug: 'summary-completion-list',
    label: 'Summary Completion From List',
    family: 'choice',
  },
  'note-completion': {
    canonicalSlug: 'note-completion',
    label: 'Note Completion',
    family: 'completion',
  },
  'table-completion': {
    canonicalSlug: 'table-completion',
    label: 'Table Completion',
    family: 'structured-layout',
  },
  'flowchart-completion': {
    canonicalSlug: 'flowchart-completion',
    label: 'Flowchart Completion',
    family: 'structured-layout',
  },
  'diagram-labeling': {
    canonicalSlug: 'diagram-labeling',
    label: 'Diagram Label Completion',
    family: 'structured-layout',
  },
  'true-false-not-given': {
    canonicalSlug: 'true-false-not-given',
    label: 'True / False / Not Given',
    family: 'binary-judgement',
  },
  'yes-no-not-given': {
    canonicalSlug: 'yes-no-not-given',
    label: 'Yes / No / Not Given',
    family: 'binary-judgement',
  },
  'matching-headings': {
    canonicalSlug: 'matching-headings',
    label: 'Matching Headings',
    family: 'matching',
  },
  'matching-information': {
    canonicalSlug: 'matching-information',
    label: 'Matching Information',
    family: 'matching',
  },
  'matching-features': {
    canonicalSlug: 'matching-features',
    label: 'Matching Features',
    family: 'matching',
  },
  'matching-sentence-endings': {
    canonicalSlug: 'matching-sentence-endings',
    label: 'Matching Sentence Endings',
    family: 'matching',
  },
  'multiple-choice': {
    canonicalSlug: 'multiple-choice',
    label: 'Multiple Choice',
    family: 'choice',
  },
  'multiple-select': {
    canonicalSlug: 'multiple-select',
    label: 'Multiple Choice Multiple Answer',
    family: 'choice',
  },
  'short-answer': {
    canonicalSlug: 'short-answer',
    label: 'Short Answer',
    family: 'completion',
  },
} as const satisfies Record<ReadingV2CanonicalTaskType, ReadingV2TaskTaxonomyEntry>;

export const READING_V2_CANONICAL_TASK_TYPES = Object.keys(
  READING_V2_TASK_TAXONOMY,
) as ReadingV2CanonicalTaskType[];

const READING_V2_TASK_ALIASES: Readonly<Record<string, ReadingV2CanonicalTaskType>> = {
  'summary completion from box': 'summary-completion-list',
  'summary completion from passage': 'summary-completion-text',
  'notes completion': 'note-completion',
  'note completion': 'note-completion',
  'diagram labelling': 'diagram-labeling',
  'diagram labeling': 'diagram-labeling',
  'map labelling': 'diagram-labeling',
  'map labeling': 'diagram-labeling',
  'choose two options': 'multiple-select',
  'choose two options x2': 'multiple-select',
  'choose three letters': 'multiple-select',
  tfng: 'true-false-not-given',
  ynng: 'yes-no-not-given',
};

const normalizeInput = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export const isReadingV2CanonicalTaskType = (
  value: string,
): value is ReadingV2CanonicalTaskType =>
  Object.prototype.hasOwnProperty.call(READING_V2_TASK_TAXONOMY, value);

export const normalizeReadingV2TaskType = (
  value: string,
  options: { readonly summaryAnswerMode?: 'text' | 'list' } = {},
): ReadingV2CanonicalTaskType | null => {
  const normalized = normalizeInput(value);
  const slugCandidate = normalized.replace(/\s+/g, '-');

  if (isReadingV2CanonicalTaskType(slugCandidate)) {
    return slugCandidate;
  }

  if (normalized === 'summary completion') {
    if (options.summaryAnswerMode === 'text') {
      return 'summary-completion-text';
    }

    if (options.summaryAnswerMode === 'list') {
      return 'summary-completion-list';
    }

    return null;
  }

  return READING_V2_TASK_ALIASES[normalized] ?? null;
};

export const getReadingV2TaskFamily = (
  taskType: ReadingV2CanonicalTaskType,
): ReadingV2EngineeringFamily => READING_V2_TASK_TAXONOMY[taskType].family;

export const assertReadingV2TaskFamily = (
  taskType: ReadingV2CanonicalTaskType,
  family: ReadingV2EngineeringFamily,
): void => {
  const expected = getReadingV2TaskFamily(taskType);

  if (expected !== family) {
    throw new Error(
      `Reading V2 task type ${taskType} belongs to ${expected}, not ${family}.`,
    );
  }
};

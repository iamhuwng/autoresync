import {
  READING_V2_CANONICAL_TASK_TYPES,
  type ReadingV2CanonicalTaskType,
} from '../../types/readingV2Taxonomy';

export type ReadingV2TaskAnswerSurface =
  | 'free-text'
  | 'visible-choice-bank'
  | 'locked-judgement-vocabulary'
  | 'paragraph-reference-range'
  | 'visible-reference-bank'
  | 'structured-layout';

export type ReadingV2TaskBankSource =
  | 'none'
  | 'labeled-options'
  | 'section-references'
  | 'reference-label-range'
  | 'locked-vocabulary'
  | 'structured-anchors';

export type ReadingV2TaskBankStrictness =
  | 'forbidden'
  | 'locked'
  | 'range-authoritative'
  | 'source-visible'
  | 'anchor-bound'
  | 'soft';

export type ReadingV2LabeledOptionScope = 'none' | 'per-question' | 'shared';

export interface ReadingV2TaskComponentContract {
  readonly taskType: ReadingV2CanonicalTaskType;
  readonly answerSurface: ReadingV2TaskAnswerSurface;
  readonly bankSource: ReadingV2TaskBankSource;
  readonly bankStrictness: ReadingV2TaskBankStrictness;
  readonly needsOptionSet: boolean;
  readonly labeledOptionScope: ReadingV2LabeledOptionScope;
  readonly usesSectionReferences: boolean;
  readonly usesReferenceLabelRange: boolean;
  readonly usesBlankMarkers: boolean;
  readonly allowsHeuristicReferenceBank: boolean;
}

export const READING_V2_TASK_COMPONENT_CONTRACTS: Readonly<
  Record<ReadingV2CanonicalTaskType, ReadingV2TaskComponentContract>
> = {
  'sentence-completion': {
    taskType: 'sentence-completion',
    answerSurface: 'free-text',
    bankSource: 'none',
    bankStrictness: 'forbidden',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: true,
    allowsHeuristicReferenceBank: false,
  },
  'summary-completion-text': {
    taskType: 'summary-completion-text',
    answerSurface: 'free-text',
    bankSource: 'none',
    bankStrictness: 'forbidden',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: true,
    allowsHeuristicReferenceBank: false,
  },
  'summary-completion-list': {
    taskType: 'summary-completion-list',
    answerSurface: 'visible-choice-bank',
    bankSource: 'labeled-options',
    bankStrictness: 'source-visible',
    needsOptionSet: true,
    labeledOptionScope: 'shared',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: true,
    allowsHeuristicReferenceBank: false,
  },
  'note-completion': {
    taskType: 'note-completion',
    answerSurface: 'free-text',
    bankSource: 'none',
    bankStrictness: 'forbidden',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: true,
    allowsHeuristicReferenceBank: false,
  },
  'table-completion': {
    taskType: 'table-completion',
    answerSurface: 'structured-layout',
    bankSource: 'structured-anchors',
    bankStrictness: 'anchor-bound',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: true,
    allowsHeuristicReferenceBank: false,
  },
  'flowchart-completion': {
    taskType: 'flowchart-completion',
    answerSurface: 'structured-layout',
    bankSource: 'structured-anchors',
    bankStrictness: 'anchor-bound',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: true,
    allowsHeuristicReferenceBank: false,
  },
  'diagram-labeling': {
    taskType: 'diagram-labeling',
    answerSurface: 'structured-layout',
    bankSource: 'structured-anchors',
    bankStrictness: 'anchor-bound',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: true,
    allowsHeuristicReferenceBank: false,
  },
  'true-false-not-given': {
    taskType: 'true-false-not-given',
    answerSurface: 'locked-judgement-vocabulary',
    bankSource: 'locked-vocabulary',
    bankStrictness: 'locked',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: false,
  },
  'yes-no-not-given': {
    taskType: 'yes-no-not-given',
    answerSurface: 'locked-judgement-vocabulary',
    bankSource: 'locked-vocabulary',
    bankStrictness: 'locked',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: false,
  },
  'matching-headings': {
    taskType: 'matching-headings',
    answerSurface: 'visible-reference-bank',
    bankSource: 'section-references',
    bankStrictness: 'source-visible',
    needsOptionSet: true,
    labeledOptionScope: 'none',
    usesSectionReferences: true,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: true,
  },
  'matching-information': {
    taskType: 'matching-information',
    answerSurface: 'paragraph-reference-range',
    bankSource: 'reference-label-range',
    bankStrictness: 'range-authoritative',
    needsOptionSet: true,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: true,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: false,
  },
  'matching-features': {
    taskType: 'matching-features',
    answerSurface: 'visible-reference-bank',
    bankSource: 'section-references',
    bankStrictness: 'source-visible',
    needsOptionSet: true,
    labeledOptionScope: 'none',
    usesSectionReferences: true,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: true,
  },
  'matching-sentence-endings': {
    taskType: 'matching-sentence-endings',
    answerSurface: 'visible-reference-bank',
    bankSource: 'section-references',
    bankStrictness: 'source-visible',
    needsOptionSet: true,
    labeledOptionScope: 'none',
    usesSectionReferences: true,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: true,
  },
  'multiple-choice': {
    taskType: 'multiple-choice',
    answerSurface: 'visible-choice-bank',
    bankSource: 'labeled-options',
    bankStrictness: 'source-visible',
    needsOptionSet: true,
    labeledOptionScope: 'per-question',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: false,
  },
  'multiple-select': {
    taskType: 'multiple-select',
    answerSurface: 'visible-choice-bank',
    bankSource: 'labeled-options',
    bankStrictness: 'source-visible',
    needsOptionSet: true,
    labeledOptionScope: 'shared',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: false,
  },
  'short-answer': {
    taskType: 'short-answer',
    answerSurface: 'free-text',
    bankSource: 'none',
    bankStrictness: 'forbidden',
    needsOptionSet: false,
    labeledOptionScope: 'none',
    usesSectionReferences: false,
    usesReferenceLabelRange: false,
    usesBlankMarkers: false,
    allowsHeuristicReferenceBank: false,
  },
};

export const getReadingV2TaskComponentContract = (
  taskType: ReadingV2CanonicalTaskType,
): ReadingV2TaskComponentContract => READING_V2_TASK_COMPONENT_CONTRACTS[taskType];

export const readingV2TaskNeedsOptionSet = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).needsOptionSet;

export const readingV2TaskUsesSharedLabeledOptionBank = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).labeledOptionScope === 'shared';

export const readingV2TaskUsesPerQuestionLabeledOptions = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).labeledOptionScope === 'per-question';

export const readingV2TaskUsesImportedLabeledOptions = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).labeledOptionScope !== 'none';

export const readingV2TaskUsesImportedSectionReferences = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).usesSectionReferences;

export const readingV2TaskUsesPrimarySectionReferenceBank = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => readingV2TaskUsesImportedSectionReferences(taskType);

export const readingV2TaskUsesReferenceLabelRange = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).usesReferenceLabelRange;

export const readingV2TaskCanUseHeuristicReferenceBank = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).allowsHeuristicReferenceBank;

export const readingV2TaskCanUsePackageReferenceBankHeuristic = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => readingV2TaskCanUseHeuristicReferenceBank(taskType);

export const readingV2TaskRequiresBankEvidence = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).needsOptionSet;

export const readingV2TaskUsesBlankMarkers = (
  taskType: ReadingV2CanonicalTaskType,
): boolean => getReadingV2TaskComponentContract(taskType).usesBlankMarkers;

export const assertReadingV2TaskComponentContractsComplete = (): void => {
  const missing = READING_V2_CANONICAL_TASK_TYPES.filter(
    (taskType) => !READING_V2_TASK_COMPONENT_CONTRACTS[taskType],
  );

  if (missing.length > 0) {
    throw new Error(`Missing Reading V2 task component contracts: ${missing.join(', ')}`);
  }
};
